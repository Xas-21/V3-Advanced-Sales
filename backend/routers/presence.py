"""Real-time presence: who has an active WebSocket connection right now."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Cookie

from utils import _get_pool
from auth_db import is_admin
from dependencies import require_user
from security import SESSION_COOKIE_NAME
from websocket_manager import manager

router = APIRouter(prefix="/api/presence", tags=["Presence"])


def _user_property_ids(user: dict) -> list[str]:
    ids = user.get("property_ids")
    if isinstance(ids, list) and ids:
        return [str(x) for x in ids if x]
    pid = user.get("propertyId")
    return [str(pid)] if pid else []


def _default_property_id(user: dict) -> Optional[str]:
    pid = user.get("propertyId")
    if pid:
        return str(pid)
    ids = _user_property_ids(user)
    return ids[0] if ids else None


@router.get("")
async def get_presence(
    property_id: Optional[str] = None,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    """Return users currently connected via WebSocket for this property."""
    user = require_user(session_id)
    scope = property_id or _default_property_id(user)
    if scope and not is_admin(user) and scope not in _user_property_ids(user):
        scope = _default_property_id(user)

    if not scope:
        return []

    online_ids = await manager.get_online_user_ids(scope)
    if not online_ids:
        return []

    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, name, username, role, avatar FROM users
                   WHERE id = ANY(%s)
                     AND LOWER(COALESCE(status, '')) = 'active'
                   ORDER BY name;""",
                (online_ids,),
            )
            return [
                {
                    "id": r["id"],
                    "name": r.get("name") or r.get("username"),
                    "username": r.get("username"),
                    "role": r.get("role"),
                    "avatar": r.get("avatar"),
                }
                for r in cur.fetchall()
            ]
