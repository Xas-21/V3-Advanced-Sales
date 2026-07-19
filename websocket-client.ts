/**
 * WebSocket client for real-time live updates.
 * 
 * Place this in AS.tsx after the user is authenticated.
 * 
 * Usage:
 * 1. Import at the top: import { useWebSocket } from './websocket-client';
 * 2. Call the hook in AS component: useWebSocket(handleLiveUpdate);
 * 3. The handleLiveUpdate callback receives change events and updates state.
 */

import { useEffect, useRef } from 'react';

export interface WebSocketMessage {
  // 'refresh' = a bulk change occurred; consumers should refetch rather than
  // merge a single payload (used e.g. for account-rename cascades).
  type: 'created' | 'updated' | 'deleted' | 'refresh';
  // Backend broadcasts the entity as its table/domain name. Kept as a broad
  // string so new broadcast sources never break the type; consumers switch on
  // the known values ('request', 'account', 'promotions', 'tasks',
  // 'financials', 'taxes', 'crm_state', 'venues', 'rooms', 'properties', ...).
  entity: string;
  data: any;
  timestamp: string;
}

// Close codes that must NOT trigger a reconnect:
// 1000 = normal closure, 4401 = auth required, 4403 = forbidden.
const NO_RECONNECT_CODES = new Set([1000, 4401, 4403]);

export function useWebSocket(onMessage: (msg: WebSocketMessage) => void, enabled = true) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      const existing = wsRef.current;
      if (existing) {
        existing.onopen = null;
        existing.onmessage = null;
        existing.onerror = null;
        existing.onclose = null;
        if (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CLOSING) {
          existing.close(1000, 'Disabled');
        }
        wsRef.current = null;
      }
      return;
    }

    reconnectAttempts.current = 0;
    let cancelled = false;
    let ws: WebSocket | null = null;
    let pingInterval: number | undefined;

    function detachSocket() {
      if (pingInterval !== undefined) {
        clearInterval(pingInterval);
        pingInterval = undefined;
      }
      if (!ws) return;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      // Avoid "closed before connection established" in React Strict Mode dev:
      // only call close() when the socket is already open/closing.
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CLOSING) {
        ws.close(1000, 'Closed');
      }
      if (wsRef.current === ws) wsRef.current = null;
      ws = null;
    }

    function connect() {
      if (cancelled) return;
      detachSocket();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const socket = new WebSocket(wsUrl);
      ws = socket;
      wsRef.current = socket;

      socket.onopen = () => {
        if (cancelled) return;
        console.log('[WebSocket] Connected');
        reconnectAttempts.current = 0;
        pingInterval = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send('ping');
        }, 30000);
      };

      socket.onmessage = (event) => {
        if (cancelled || event.data === 'pong') return;
        try {
          const msg: WebSocketMessage = JSON.parse(event.data);
          console.log('[WebSocket] Received:', msg);
          onMessageRef.current(msg);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
        }
      };

      socket.onerror = () => {
        if (cancelled) return;
        console.error('[WebSocket] Error');
      };

      socket.onclose = (event) => {
        if (pingInterval !== undefined) {
          clearInterval(pingInterval);
          pingInterval = undefined;
        }
        if (wsRef.current === socket) wsRef.current = null;
        ws = null;

        // Intentional teardown (React Strict Mode unmount, logout, etc.)
        if (cancelled || event.code === 1000) return;

        console.log(`[WebSocket] Closed (code=${event.code}, reason=${event.reason})`);

        if (!NO_RECONNECT_CODES.has(event.code)) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current += 1;
          console.log(`[WebSocket] Reconnecting in ${delay}ms...`);
          reconnectTimeoutRef.current = window.setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      detachSocket();
    };
  }, [enabled]);

  return wsRef.current;
}


/**
 * Example integration in AS.tsx:
 * 
 * // Inside the AS component (after login, when currentUser is set)
 * const handleLiveUpdate = useCallback((msg: WebSocketMessage) => {
 *   if (msg.entity === 'request') {
 *     if (msg.type === 'created' || msg.type === 'updated') {
 *       // Update or add the request in sharedRequests state
 *       setSharedRequests(prev => {
 *         const idx = prev.findIndex(r => r.id === msg.data.id);
 *         if (idx >= 0) {
 *           // Update existing
 *           const updated = [...prev];
 *           updated[idx] = msg.data;
 *           return updated;
 *         } else {
 *           // Add new
 *           return [...prev, msg.data];
 *         }
 *       });
 *     } else if (msg.type === 'deleted') {
 *       // Remove from state
 *       setSharedRequests(prev => prev.filter(r => r.id !== msg.data.id));
 *     }
 *   }
 *   
 *   if (msg.entity === 'account') {
 *     // Similar logic for accounts
 *     if (msg.type === 'created' || msg.type === 'updated') {
 *       setAccounts(prev => {
 *         const idx = prev.findIndex(a => a.id === msg.data.id);
 *         if (idx >= 0) {
 *           const updated = [...prev];
 *           updated[idx] = msg.data;
 *           return updated;
 *         } else {
 *           return [...prev, msg.data];
 *         }
 *       });
 *     } else if (msg.type === 'deleted') {
 *       setAccounts(prev => prev.filter(a => a.id !== msg.data.id));
 *     }
 *   }
 * }, []);
 * 
 * useWebSocket(handleLiveUpdate);
 */
