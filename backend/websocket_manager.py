"""WebSocket connection manager for real-time live updates across users.

Broadcasts data mutations (requests, accounts, properties, tasks, etc.) to all
connected clients in real-time so changes appear immediately without refresh.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
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
        # user_id -> set of websockets (for per-user chat delivery)
        self.user_connections: Dict[str, Set[WebSocket]] = {}
        # websocket -> property channels this socket subscribed to (for presence)
        self.websocket_properties: Dict[WebSocket, list[str]] = {}
        self._lock = asyncio.Lock()
        # The uvicorn event loop that owns the websockets. Broadcasts triggered
        # from sync/threadpool code must be scheduled onto THIS loop, otherwise
        # the loop-bound sockets/lock raise "attached to a different loop".
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self) -> None:
        """Capture the currently running event loop as the broadcast target.

        Called from async context (e.g. on connect) so sync callers can later
        schedule coroutines onto the right loop via broadcast_threadsafe().
        """
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            self._loop = None

    async def connect(self, websocket: WebSocket, user_id: str, property_ids: list[str] | None = None):
        """Accept a new WebSocket connection and subscribe to property channels.
        
        Args:
            websocket: The WebSocket connection
            user_id: User ID for auth tracking
            property_ids: List of property IDs to subscribe to (None = global/admin)
        """
        await websocket.accept()
        # Remember the loop these sockets live on for thread-safe broadcasts.
        self.bind_loop()
        async with self._lock:
            self.connection_users[websocket] = str(user_id)
            uid = str(user_id)
            if uid not in self.user_connections:
                self.user_connections[uid] = set()
            self.user_connections[uid].add(websocket)
            
            if property_ids:
                self.websocket_properties[websocket] = list(property_ids)
                for prop_id in property_ids:
                    if prop_id not in self.property_connections:
                        self.property_connections[prop_id] = set()
                    self.property_connections[prop_id].add(websocket)
                logger.info(f"WebSocket connected: user={user_id}, properties={property_ids}")
            else:
                self.websocket_properties[websocket] = []
                # Admin/global subscription
                self.global_connections.add(websocket)
                logger.info(f"WebSocket connected (global): user={user_id}")

        # Notify presence after releasing the connect lock path — schedule outside.
        props = property_ids or []
        for pid in props:
            asyncio.create_task(self._broadcast_presence(pid))

    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection from all subscriptions."""
        affected_properties: list[str] = []
        async with self._lock:
            user_id = str(self.connection_users.pop(websocket, "unknown"))
            affected_properties = list(self.websocket_properties.pop(websocket, []))
            
            # Remove from per-user index
            if user_id in self.user_connections:
                self.user_connections[user_id].discard(websocket)
                if not self.user_connections[user_id]:
                    del self.user_connections[user_id]
            
            # Remove from global
            self.global_connections.discard(websocket)
            
            # Remove from all property channels
            for prop_id, connections in list(self.property_connections.items()):
                connections.discard(websocket)
                if not connections:
                    del self.property_connections[prop_id]
            
            logger.info(f"WebSocket disconnected: user={user_id}")

        for pid in affected_properties:
            await self._broadcast_presence(pid)

    async def get_online_user_ids(self, property_id: str) -> list[str]:
        """User ids with at least one live WebSocket subscribed to this property."""
        async with self._lock:
            sockets = self.property_connections.get(property_id, set())
            ids: set[str] = set()
            for ws in sockets:
                uid = self.connection_users.get(ws)
                if uid:
                    ids.add(uid)
            return list(ids)

    async def _broadcast_presence(self, property_id: str) -> None:
        """Tell property subscribers who is online right now (active browser sessions)."""
        if not property_id:
            return
        user_ids = await self.get_online_user_ids(property_id)
        await self.broadcast({
            "type": "refresh",
            "entity": "presence",
            "data": {"propertyId": property_id, "userIds": user_ids},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, property_id)

    async def broadcast(self, message: dict[str, Any], property_id: str | None = None):
        """Broadcast a change event to all subscribed clients.
        
        Args:
            message: The event payload (must be JSON-serializable)
            property_id: If set, only broadcast to clients subscribed to this property.
                        If None, broadcast globally.
        """
        payload = json.dumps(message)

        # Snapshot the target set under the lock, then release it BEFORE sending.
        # Sending while holding the lock would deadlock: a broken socket triggers
        # disconnect(), which re-acquires this same (non-reentrant) lock.
        async with self._lock:
            if property_id:
                # Property-scoped broadcast
                targets = self.property_connections.get(property_id, set()) | self.global_connections
            else:
                # Global broadcast
                targets = self.global_connections.copy()
                for connections in self.property_connections.values():
                    targets.update(connections)
            targets = list(targets)

        if not targets:
            return

        logger.debug(f"Broadcasting to {len(targets)} connections: {message.get('type')}")

        # Send to all targets concurrently, outside the lock.
        results = await asyncio.gather(
            *[self._send(ws, payload) for ws in targets],
            return_exceptions=True,
        )

        # Clean up any sockets that failed to receive.
        dead = [ws for ws, ok in zip(targets, results) if ok is not True]
        for ws in dead:
            await self.disconnect(ws)

    async def broadcast_to_users(self, user_ids: list[str], message: dict[str, Any]) -> None:
        """Send a message to specific users (all their open tabs/devices)."""
        if not user_ids:
            return
        payload = json.dumps(message)
        async with self._lock:
            targets: set[WebSocket] = set()
            for uid in user_ids:
                targets.update(self.user_connections.get(str(uid), set()))
            targets = list(targets)
        if not targets:
            logger.debug(f"No live sockets for users {user_ids}")
            return
        results = await asyncio.gather(
            *[self._send(ws, payload) for ws in targets],
            return_exceptions=True,
        )
        dead = [ws for ws, ok in zip(targets, results) if ok is not True]
        for ws in dead:
            await self.disconnect(ws)

    def broadcast_to_users_threadsafe(self, user_ids: list[str], message: dict[str, Any]) -> None:
        """Schedule a per-user broadcast from sync / threadpool code."""
        loop = self._loop
        if loop is None:
            return
        try:
            asyncio.run_coroutine_threadsafe(self.broadcast_to_users(user_ids, message), loop)
        except Exception as e:
            logger.warning(f"Failed to schedule user broadcast: {e}")

    async def _send(self, websocket: WebSocket, message: str) -> bool:
        """Send a message to a WebSocket. Returns True on success, False on failure.

        Does NOT clean up on failure (the caller handles disconnection outside
        the broadcast lock to avoid a re-entrant deadlock).
        """
        try:
            await websocket.send_text(message)
            return True
        except Exception as e:
            logger.warning(f"Failed to send to WebSocket: {e}")
            return False

    def broadcast_threadsafe(self, message: dict[str, Any], property_id: str | None = None) -> None:
        """Schedule a broadcast from sync / threadpool code.

        FastAPI runs sync routes in a threadpool, so data-access mutations call
        this instead of awaiting broadcast() directly. It hands the coroutine to
        the uvicorn event loop that owns the websockets via run_coroutine_threadsafe.
        """
        loop = self._loop
        if loop is None:
            # No client has ever connected, so there is nothing to broadcast to.
            return
        try:
            asyncio.run_coroutine_threadsafe(self.broadcast(message, property_id), loop)
        except Exception as e:
            logger.warning(f"Failed to schedule broadcast: {e}")


# Global singleton instance
manager = ConnectionManager()
