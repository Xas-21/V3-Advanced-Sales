"""WebSocket connection manager for real-time live updates across users.

Broadcasts data mutations (requests, accounts, properties, tasks, etc.) to all
connected clients in real-time so changes appear immediately without refresh.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections and broadcasts change events to subscribed clients."""

    def __init__(self):
        # property_id -> set of websockets subscribed to that property
        self.property_connections: Dict[str, Set[WebSocket]] = {}
        # global connections (admins, multi-property users)
        self.global_connections: Set[WebSocket] = set()
        # websocket -> user_id mapping for auth tracking
        self.connection_users: Dict[WebSocket, str] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: str, property_ids: list[str] | None = None):
        """Accept a new WebSocket connection and subscribe to property channels.
        
        Args:
            websocket: The WebSocket connection
            user_id: User ID for auth tracking
            property_ids: List of property IDs to subscribe to (None = global/admin)
        """
        await websocket.accept()
        async with self._lock:
            self.connection_users[websocket] = user_id
            
            if property_ids:
                for prop_id in property_ids:
                    if prop_id not in self.property_connections:
                        self.property_connections[prop_id] = set()
                    self.property_connections[prop_id].add(websocket)
                logger.info(f"WebSocket connected: user={user_id}, properties={property_ids}")
            else:
                # Admin/global subscription
                self.global_connections.add(websocket)
                logger.info(f"WebSocket connected (global): user={user_id}")

    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection from all subscriptions."""
        async with self._lock:
            user_id = self.connection_users.pop(websocket, "unknown")
            
            # Remove from global
            self.global_connections.discard(websocket)
            
            # Remove from all property channels
            for prop_id, connections in list(self.property_connections.items()):
                connections.discard(websocket)
                if not connections:
                    del self.property_connections[prop_id]
            
            logger.info(f"WebSocket disconnected: user={user_id}")

    async def broadcast(self, message: dict[str, Any], property_id: str | None = None):
        """Broadcast a change event to all subscribed clients.
        
        Args:
            message: The event payload (must be JSON-serializable)
            property_id: If set, only broadcast to clients subscribed to this property.
                        If None, broadcast globally.
        """
        payload = json.dumps(message)
        
        async with self._lock:
            if property_id:
                # Property-scoped broadcast
                targets = self.property_connections.get(property_id, set()) | self.global_connections
            else:
                # Global broadcast
                targets = self.global_connections.copy()
                for connections in self.property_connections.values():
                    targets.update(connections)
            
            if not targets:
                return
            
            logger.debug(f"Broadcasting to {len(targets)} connections: {message.get('type')}")
            
            # Send to all targets concurrently
            await asyncio.gather(
                *[self._send_safe(ws, payload) for ws in targets],
                return_exceptions=True
            )

    async def _send_safe(self, websocket: WebSocket, message: str):
        """Send a message to a WebSocket, handling disconnections gracefully."""
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.warning(f"Failed to send to WebSocket: {e}")
            # Connection is broken, clean up
            await self.disconnect(websocket)


# Global singleton instance
manager = ConnectionManager()
