"""Server-side auth dependencies: session resolution, permission + tenant enforcement.

All enforcement happens here. The frontend never decides what a user can see.
"""
from __future__ import annotations

from contextvars import ContextVar
from typing import Any, Optional

from fastapi import Cookie, HTTPException, Request

from auth_db import can_access_property, has_permission, is_admin, resolve_session
from security import SESSION_COOKIE_NAME

PUBLIC_PERMISSIONS = {"view_dashboard", "view_requests", "view_accounts"}

# Request-scoped current user, set by middleware so data layers can enforce tenancy.
_current_user_ctx: ContextVar[Optional[dict]] = ContextVar("as_current_user", default=None)


def set_current_user(user: Optional[dict]) -> None:
    _current_user_ctx.set(user)


def get_current_user_ctx() -> Optional[dict]:
    return _current_user_ctx.get()


def _user_from_ctx_or_session(session_id: Optional[str]) -> Optional[dict[str, Any]]:
    """Prefer middleware-set context; fall back to resolve_session for rare paths without middleware."""
    user = get_current_user_ctx()
    if user is not None:
        return user
    return resolve_session(session_id)


def get_current_user(session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME)) -> Optional[dict[str, Any]]:
    return _user_from_ctx_or_session(session_id)


def require_user(session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME)) -> dict[str, Any]:
    user = _user_from_ctx_or_session(session_id)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def require_admin(session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME)) -> dict[str, Any]:
    user = require_user(session_id)
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_permission(permission: str):
    def _dep(session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME)) -> dict[str, Any]:
        user = require_user(session_id)
        # Public-facing permissions are granted to every authenticated user.
        if permission in PUBLIC_PERMISSIONS:
            return user
        if not has_permission(user, permission):
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
        return user

    return _dep


def require_property_access(
    property_id: Optional[str] = None,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> Optional[str]:
    """Validate the requested property belongs to the user's tenant scope.

    Returns the (validated) property_id or None for admin-wide scope.
    """
    user = require_user(session_id)
    if property_id and not can_access_property(user, property_id):
        raise HTTPException(status_code=403, detail="Access denied to this property")
    return property_id
