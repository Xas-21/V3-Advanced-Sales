"""Authentication endpoints: login, logout, change-password, property switch.

Replaces the file-based split-brain. Sessions are signed, httpOnly, server-side
revocable, and tenant-scoped.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Cookie
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import auth_db
from auth_db import (
    ROLE_SUPER_ADMIN,
    ROLE_ADMIN,
    can_access_property,
    is_admin,
)
from security import SESSION_COOKIE_NAME, SESSION_TTL_SECONDS

router = APIRouter(prefix="/api")

# ponytail: in-process limiter is enough for a single backend replica (docker-compose.prod.yml).
# Ceiling: not shared across workers/replicas and resets on restart. Upgrade path: Redis/shared store
# keyed the same way (_client_ip + username) when running multiple backend replicas.
_login_attempts: dict[str, list[datetime]] = defaultdict(list)
_MAX_ATTEMPTS = 10
_WINDOW = timedelta(minutes=1)


def _client_ip(request: Request) -> str:
    """Real client IP behind nginx.

    nginx sets X-Real-IP to the socket IP and uses $proxy_add_x_forwarded_for, which
    APPENDS our proxy's view after any client-supplied value. The trusted IP is therefore
    X-Real-IP (or the LAST X-Forwarded-For hop) — never the first hop, which the client can
    spoof to rotate a new (ip, username) key past the rate limiter on every request.
    """
    xri = (request.headers.get("x-real-ip") or "").strip()
    if xri:
        return xri
    xff = (request.headers.get("x-forwarded-for") or "").strip()
    if xff:
        hops = [h.strip() for h in xff.split(",") if h.strip()]
        if hops:
            return hops[-1]
    return request.client.host if request.client else "127.0.0.1"


def _rate_key(ip: str, username: str) -> str:
    return f"{ip}:{(username or '').strip().lower()}"


def _prune_login_attempts(now: datetime) -> None:
    stale: list[str] = []
    for key, times in _login_attempts.items():
        kept = [t for t in times if t > now - _WINDOW]
        if kept:
            _login_attempts[key] = kept
        else:
            stale.append(key)
    for key in stale:
        del _login_attempts[key]


def _check_rate_limit(key: str):
    now = datetime.utcnow()
    _prune_login_attempts(now)
    _login_attempts[key] = [t for t in _login_attempts[key] if t > now - _WINDOW]
    if len(_login_attempts[key]) >= _MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")


def _record_attempt(key: str):
    now = datetime.utcnow()
    _login_attempts[key].append(now)
    _prune_login_attempts(now)


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def _public_user(user: dict) -> dict:
    """Safe user projection sent to the client (never includes password hash)."""
    return {
        "id": user["id"],
        "username": user.get("username"),
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role"),
        "status": user.get("status"),
        "propertyId": user.get("propertyId"),
        "property_ids": user.get("property_ids") or ([user["propertyId"]] if user.get("propertyId") else []),
        "permissionGrants": user.get("permissionGrants", []),
        "permissionRevokes": user.get("permissionRevokes", []),
        "sessionVersion": user.get("sessionVersion", 0),
        "avatar": user.get("avatar"),
        "isAdmin": is_admin(user),
    }


@router.post("/login")
def login(request: LoginRequest, http_req: Request):
    ip = _client_ip(http_req)
    key = _rate_key(ip, request.username)
    _check_rate_limit(key)

    if not request.username or not request.password:
        _record_attempt(key)
        raise HTTPException(status_code=400, detail="Username and password are required")

    ok, reason = auth_db.authenticate(request.username.strip(), request.password)
    if not ok:
        _record_attempt(key)
        raise HTTPException(status_code=401, detail=reason)

    user = auth_db.get_user_by_username(request.username.strip())
    assert user is not None
    token = auth_db.create_session(user["id"], int(user.get("sessionVersion") or 0))

    body = {"user": _public_user(user)}
    resp = JSONResponse(content=body)
    resp.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=True,  # TLS via Traefik
        path="/",
    )
    return resp


@router.post("/logout")
def logout(session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME)):
    if session_id:
        from utils import _get_pool

        try:
            pool = _get_pool()
            with pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("UPDATE sessions SET revoked = TRUE WHERE token = %s;", (session_id,))
                    conn.commit()
        except Exception:
            pass
    resp = JSONResponse(content={"ok": True})
    resp.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return resp


@router.post("/auth/change-password")
def change_password(request: ChangePasswordRequest, session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME)):
    user = auth_db.resolve_session(session_id)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    assert user is not None
    ok, msg = auth_db.change_password(user["id"], request.current_password, request.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    # Issue a fresh token for the same (now-bumped) version so the client stays logged in.
    new_ver = int(auth_db.get_user_by_id(user["id"]).get("sessionVersion") or 0)
    token = auth_db.create_session(user["id"], new_ver)
    body = {"ok": True, "sessionVersion": new_ver}
    resp = JSONResponse(content=body)
    resp.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=True,
        path="/",
    )
    return resp


@router.get("/auth/me")
def auth_me(session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME)):
    user = auth_db.resolve_session(session_id)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return _public_user(user)


@router.post("/auth/switch-property")
def switch_property(
    payload: dict,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    """Multi-tenant property switch. Only allowed if the user is admin OR the
    requested property is in their assigned scope."""
    user = auth_db.resolve_session(session_id)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    target = payload.get("propertyId")
    if not target:
        raise HTTPException(status_code=400, detail="propertyId required")
    if not can_access_property(user, target):
        raise HTTPException(status_code=403, detail="You are not assigned to this property")
    return {"ok": True, "propertyId": target, "property_ids": user.get("property_ids")}
