"""User management against the relational `users` table.

Replaces the legacy file-based split-brain. Admin-only mutations are enforced
server-side; tenant (property) scope is respected for reads.
"""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Cookie, HTTPException
from utils import _get_pool

import auth_db
from auth_db import is_admin
from dependencies import require_admin, require_user
from security import SESSION_COOKIE_NAME, hash_password

router = APIRouter(prefix="/api/users")

_USER_READ_KEYS = (
    "id", "username", "name", "email", "role", "status",
    "property_id", "permission_grants", "permission_revokes",
    "session_version", "avatar",
)
# Client may update these on PATCH — password is handled only via change-password.
_USER_PATCH_SAFE = frozenset({
    "property_id", "status", "name", "email", "username", "role",
    "permission_grants", "permission_revokes", "avatar", "assigned_property_ids",
})

_SQL_COLS = {
    "property_id": "property_id", "status": "status", "name": "name",
    "email": "email", "username": "username", "role": "role",
    "permission_grants": "permission_grants", "permission_revokes": "permission_revokes",
    "avatar": "avatar", "assigned_property_ids": "assigned_property_ids",
}

# Frontend sends camelCase; normalize before filtering against _USER_PATCH_SAFE.
_CLIENT_ALIASES = {
    "propertyId": "property_id",
    "permissionGrants": "permission_grants",
    "permissionRevokes": "permission_revokes",
    "assignedPropertyIds": "assigned_property_ids",
}


def _normalize_user_patch(patch: dict) -> dict:
    out: dict = {}
    for k, v in patch.items():
        key = _CLIENT_ALIASES.get(k, k)
        if key not in _USER_PATCH_SAFE:
            continue
        if key == "property_id" and (v is None or (isinstance(v, str) and not str(v).strip())):
            out[key] = None
        else:
            out[key] = v
    return out


def _row_to_client(row: dict) -> dict:
    grants = row.get("permission_grants") or []
    revokes = row.get("permission_revokes") or []
    if isinstance(grants, str):
        try: grants = json.loads(grants)
        except Exception: grants = []
    if isinstance(revokes, str):
        try: revokes = json.loads(revokes)
        except Exception: revokes = []
    assigned = row.get("assigned_property_ids")
    if isinstance(assigned, str):
        try: assigned = json.loads(assigned)
        except Exception: assigned = []
    return {
        "id": row["id"], "username": row.get("username"), "name": row.get("name"),
        "email": row.get("email"), "role": row.get("role"), "status": row.get("status"),
        "propertyId": row.get("property_id"),
        "property_ids": assigned or ([row["property_id"]] if row.get("property_id") else []),
        "permissionGrants": grants, "permissionRevokes": revokes,
        "sessionVersion": row.get("session_version") or 0, "avatar": row.get("avatar"),
        "isAdmin": is_admin({"role": row.get("role")}),
    }


@router.get("")
def get_users(
    property_id: str | None = None,
    session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if is_admin(user):
                if property_id:
                    cur.execute("SELECT * FROM users WHERE property_id = %s OR assigned_property_ids ? %s ORDER BY username;", (property_id, property_id))
                else:
                    cur.execute("SELECT * FROM users ORDER BY username;")
            else:
                ids = user.get("property_ids") or ([user["propertyId"]] if user.get("propertyId") else [])
                if not ids:
                    return []
                cur.execute("SELECT * FROM users WHERE property_id = ANY(%s);", (ids,))
            rows = cur.fetchall()
    return [_row_to_client(r) for r in rows]


@router.get("/{user_id}")
def get_user(user_id: str, session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME)):
    caller = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s;", (user_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    if not is_admin(caller):
        caller_ids = caller.get("property_ids") or ([caller["propertyId"]] if caller.get("propertyId") else [])
        target = _row_to_client(row)
        target_ids = target.get("property_ids") or []
        if not set(caller_ids) & set(target_ids):
            raise HTTPException(status_code=404, detail="User not found")
    return _row_to_client(row)


@router.patch("/{user_id}")
def patch_user(user_id: str, patch: dict, session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME)):
    admin = require_admin(session_id)
    if not isinstance(patch, dict):
        raise HTTPException(status_code=400, detail="Expected JSON object body")

    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s;", (user_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")
            updates = _normalize_user_patch(patch)
            if "assigned_property_ids" in updates and isinstance(updates["assigned_property_ids"], list):
                updates["assigned_property_ids"] = json.dumps(updates["assigned_property_ids"])
            if not updates:
                raise HTTPException(status_code=400, detail="No updatable fields provided")
            set_clause = ", ".join(f"{_SQL_COLS[k]} = %s" for k in updates)
            params = list(updates.values()) + [user_id]
            cur.execute(f"UPDATE users SET {set_clause} WHERE id = %s RETURNING *;", params)
            new_row = cur.fetchone()
            conn.commit()
    return {"message": "User updated successfully", "user": _row_to_client(new_row)}


@router.post("")
def create_or_update_user(user_data: dict, session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME)):
    require_admin(session_id)
    if not isinstance(user_data, dict):
        raise HTTPException(status_code=400, detail="Expected JSON object body")

    raw_pw = user_data.get("password")
    existing_id = user_data.get("id")
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if existing_id:
                cur.execute("SELECT * FROM users WHERE id = %s;", (str(existing_id),))
                existing = cur.fetchone()
                if not existing:
                    raise HTTPException(status_code=404, detail="User not found")
            else:
                existing = None

            if existing:
                updates = _normalize_user_patch(user_data)
                # Password is not in _SQL_COLS — handle separately so password-only
                # admin resets never KeyError / emit an empty SET clause.
                updates = {k: v for k, v in updates.items() if k in _SQL_COLS}
                for json_key in ("assigned_property_ids", "permission_grants", "permission_revokes"):
                    if json_key in updates and isinstance(updates[json_key], (list, dict)):
                        updates[json_key] = json.dumps(updates[json_key])
                password_hash = None
                if raw_pw is not None and str(raw_pw).strip():
                    from security import check_password_policy
                    ok, msg = check_password_policy(str(raw_pw))
                    if not ok:
                        raise HTTPException(status_code=400, detail=msg)
                    password_hash = hash_password(str(raw_pw))
                if not updates and password_hash is None:
                    raise HTTPException(status_code=400, detail="No updatable fields provided")
                set_parts = [f"{_SQL_COLS[k]} = %s" for k in updates]
                params: list = list(updates.values())
                if password_hash is not None:
                    set_parts.append("password = %s")
                    params.append(password_hash)
                params.append(str(existing_id))
                cur.execute(
                    f"UPDATE users SET {', '.join(set_parts)} WHERE id = %s RETURNING *;",
                    params,
                )
                new_row = cur.fetchone()
                conn.commit()
                if password_hash is not None:
                    new_ver = auth_db.bump_session_version_and_revoke(str(existing_id))
                    if new_row is not None:
                        new_row = dict(new_row)
                        new_row["session_version"] = new_ver
            else:
                if not str(user_data.get("username", "")).strip():
                    raise HTTPException(status_code=400, detail="username is required")
                if not raw_pw or not str(raw_pw).strip():
                    raise HTTPException(status_code=400, detail="Password is required when creating a user")
                from security import check_password_policy
                ok, msg = check_password_policy(str(raw_pw))
                if not ok:
                    raise HTTPException(status_code=400, detail=msg)
                uid = f"U-{uuid.uuid4().hex[:10]}"
                assigned = user_data.get("assigned_property_ids") or user_data.get("assignedPropertyIds") or []
                if isinstance(assigned, list):
                    assigned = json.dumps(assigned)
                property_id = user_data.get("property_id")
                if property_id is None:
                    property_id = user_data.get("propertyId")
                cur.execute(
                    """
                    INSERT INTO users (id, username, password, name, email, role, status, property_id,
                                       permission_grants, permission_revokes, assigned_property_ids, session_version)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0)
                    RETURNING *;
                    """,
                    (
                        uid, user_data.get("username"), hash_password(str(raw_pw)),
                        user_data.get("name"), user_data.get("email"),
                        user_data.get("role", "Sales Executive"),
                        user_data.get("status", "active"),
                        property_id,
                        json.dumps(user_data.get("permissionGrants", [])),
                        json.dumps(user_data.get("permissionRevokes", [])),
                        assigned,
                    ),
                )
                new_row = cur.fetchone()
                conn.commit()
    if not new_row:
        raise HTTPException(status_code=500, detail="User save failed")
    return {"message": "User saved successfully", "user": _row_to_client(new_row)}


@router.delete("/{user_id}")
def delete_user(user_id: str, session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME)):
    require_admin(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s RETURNING id;", (user_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="User not found")
            conn.commit()
    return {"message": "User deleted successfully"}
