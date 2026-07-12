"""AS authentication + authorization + tenant isolation against the relational DB.

Replaces the legacy file-based users.json split-brain. All user state lives in the
`users` table (migrated from app_collection_rows). Permissions and property
access are enforced HERE, server-side — never trusted from the client.
"""
from __future__ import annotations

from typing import Any, Optional

from psycopg.rows import dict_row

from security import (
    SESSION_TTL_SECONDS,
    check_password_policy,
    create_session_token,
    hash_password,
    is_expired,
    parse_session_token,
    verify_password,
)
from utils import _get_pool

ROLE_SUPER_ADMIN = "super_admin"
ROLE_ADMIN = "admin"
ROLE_SALES = "Sales Executive"
ROLE_MANAGER = "Sales Manager"


# --------------------------------------------------------------------------- #
# DB row helpers
# --------------------------------------------------------------------------- #
def _row_to_user(row: dict) -> dict:
    """Normalize a `users` table row into the shape the app expects."""
    assigned = row.get("assigned_property_ids")
    if isinstance(assigned, str):
        try:
            assigned = __import__("json").loads(assigned)
        except Exception:
            assigned = []
    return {
        "id": row["id"],
        "username": row.get("username"),
        "name": row.get("name"),
        "email": row.get("email"),
        "role": row.get("role") or ROLE_SALES,
        "status": (row.get("status") or "active").lower(),
        "propertyId": row.get("property_id"),
        "property_ids": assigned or ([row["property_id"]] if row.get("property_id") else []),
        "permissionGrants": row.get("permission_grants") or [],
        "permissionRevokes": row.get("permission_revokes") or [],
        "sessionVersion": row.get("session_version") or 0,
        "avatar": row.get("avatar"),
    }


def get_user_by_username(username: str) -> Optional[dict]:
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE username = %s LIMIT 1;", (username,))
            row = cur.fetchone()
    return _row_to_user(row) if row else None


def get_user_by_id(user_id: str) -> Optional[dict]:
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s LIMIT 1;", (user_id,))
            row = cur.fetchone()
    return _row_to_user(row) if row else None


def get_password_hash(username_or_id: str) -> Optional[str]:
    """Internal-only: fetch the bcrypt hash for verification (never exposed to API)."""
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT password FROM users WHERE username = %s OR id = %s LIMIT 1;",
                (username_or_id, username_or_id),
            )
            row = cur.fetchone()
    return row["password"] if row else None


# --------------------------------------------------------------------------- #
# Permission model (server-side)
# --------------------------------------------------------------------------- #
def has_permission(user: dict, permission: str) -> bool:
    if user.get("role") in (ROLE_SUPER_ADMIN, ROLE_ADMIN):
        return True
    grants = set(user.get("permissionGrants") or [])
    revokes = set(user.get("permissionRevokes") or [])
    if permission in revokes:
        return False
    return permission in grants


def is_admin(user: dict) -> bool:
    role = str(user.get("role") or "").strip().lower()
    return role in ("super_admin", "admin")


def can_access_property(user: dict, property_id: Optional[str]) -> bool:
    """Tenant isolation: a non-admin may only access assigned properties."""
    if is_admin(user):
        return True
    if not property_id:
        return True  # admin-only/aggregate endpoints guard differently
    assigned = set(user.get("property_ids") or [])
    if user.get("propertyId"):
        assigned.add(user["propertyId"])
    return property_id in assigned


# --------------------------------------------------------------------------- #
# Session lifecycle (server-side store => revocable)
# --------------------------------------------------------------------------- #
def authenticate(username: str, password: str) -> tuple[bool, str]:
    """Returns (ok, reason). On success a session row is created via create_session."""
    user = get_user_by_username(username)
    if not user:
        return False, "Invalid username or password"
    if user.get("status", "").lower() != "active":
        return False, "Account is disabled"
    pw_hash = get_password_hash(username)
    if not pw_hash or not verify_password(password, pw_hash):
        return False, "Invalid username or password"
    return True, ""


def create_session(user_id: str, session_version: int) -> str:
    token = create_session_token(user_id, session_version)
    # Store only the token fingerprint + metadata; the opaque token is the cookie.
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sessions (id, token, user_id, session_version, issued_at, expires_at, ip, user_agent)
                VALUES (%s, %s, %s, %s, NOW(), NOW() + INTERVAL '7 days', NULL, NULL)
                ON CONFLICT (token) DO UPDATE SET last_seen = NOW();
                """,
                (token, token, user_id, session_version),
            )
            conn.commit()
    return token


def resolve_session(token: Optional[str]) -> Optional[dict]:
    """Validate the cookie token against the signed value AND the server-side store."""
    if not token:
        return None
    parsed = parse_session_token(token)
    if not parsed:
        return None
    uid, ver, issued = parsed
    if is_expired(issued, SESSION_TTL_SECONDS):
        return None
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT * FROM sessions WHERE token = %s AND revoked = FALSE;", (token,)
            )
            sess = cur.fetchone()
            if not sess:
                return None
            # Invalidate if the user changed their password after this session was issued.
            cur.execute("SELECT session_version, status FROM users WHERE id = %s;", (uid,))
            u = cur.fetchone()
            if not u or (u["status"] or "").lower() != "active" or int(u["session_version"] or 0) != ver:
                return None
            cur.execute("UPDATE sessions SET last_seen = NOW() WHERE token = %s;", (token,))
            conn.commit()
    return get_user_by_id(uid)


def revoke_all_sessions_for_user(user_id: str):
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE sessions SET revoked = TRUE WHERE user_id = %s;", (user_id,))
            conn.commit()


def bump_session_version_and_revoke(user_id: str) -> int:
    """On password change: bump version (invalidates all existing tokens) + return new."""
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET session_version = COALESCE(session_version,0) + 1 WHERE id = %s RETURNING session_version;",
                (user_id,),
            )
            new_ver = cur.fetchone()["session_version"]
            cur.execute("UPDATE sessions SET revoked = TRUE WHERE user_id = %s;", (user_id,))
            conn.commit()
    return new_ver


def change_password(user_id: str, current_pw: str, new_pw: str) -> tuple[bool, str]:
    ok, msg = check_password_policy(new_pw)
    if not ok:
        return False, msg
    user = get_user_by_id(user_id)
    if not user:
        return False, "User not found"
    cur_hash = get_password_hash(user_id)
    if not cur_hash or not verify_password(current_pw, cur_hash):
        return False, "Current password is incorrect"
    if verify_password(new_pw, cur_hash):
        return False, "New password must differ from the current password"
    new_hash = hash_password(new_pw)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET password = %s WHERE id = %s;", (new_hash, user_id))
            conn.commit()
    bump_session_version_and_revoke(user_id)
    return True, ""
