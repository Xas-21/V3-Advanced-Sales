"""WebSocket endpoint for real-time live updates."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Cookie
from auth_db import resolve_session
from security import SESSION_COOKIE_NAME
from websocket_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    """WebSocket endpoint for real-time live updates.
    
    Clients connect after login, subscribe to property channels, and receive
    real-time broadcasts when any user modifies data (requests, accounts, etc.).
    
    Authentication: Uses the same session cookie as REST endpoints.
    """
    # Authenticate via session cookie
    user = resolve_session(session_id)
    if not user:
        await websocket.close(code=4401, reason="Authentication required")
        return
    
    user_id = user.get("id", "unknown")
    property_id = user.get("propertyId")
    assigned_properties = user.get("property_ids") or []
    
    # Determine property subscriptions
    if property_id:
        # Single-property user
        property_ids = [property_id]
    elif assigned_properties:
        # Multi-property user
        property_ids = list(assigned_properties)
    else:
        # Admin / no property scope → global subscription
        property_ids = None
    
    # Connect and subscribe
    await manager.connect(websocket, user_id, property_ids)
    
    try:
        # Keep connection alive and handle client messages
        while True:
            data = await websocket.receive_text()
            # Client can send ping/pong or other control messages
            if data == "ping":
                # Re-validate session on each ping so revoked/expired/version-bumped
                # cookies close within one ping interval. Only close on a definitive
                # None — transient DB errors must keep the socket open.
                try:
                    session_user = resolve_session(session_id)
                except Exception as e:
                    logger.warning(
                        "WebSocket session re-validation failed (keeping socket): %s", e
                    )
                    await websocket.send_text("pong")
                    continue
                if session_user is None:
                    await manager.disconnect(websocket)
                    await websocket.close(code=4401, reason="Authentication required")
                    return
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        await manager.disconnect(websocket)
