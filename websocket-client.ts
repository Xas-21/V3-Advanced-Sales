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

interface WebSocketMessage {
  type: 'created' | 'updated' | 'deleted';
  entity: 'request' | 'account' | 'property' | 'task' | 'promotion' | 'financial';
  data: any;
  timestamp: string;
}

export function useWebSocket(onMessage: (msg: WebSocketMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    function connect() {
      // WebSocket inherits cookies automatically (same-origin)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        reconnectAttempts.current = 0;
        // Send periodic pings to keep connection alive
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 30000); // ping every 30s
        ws.addEventListener('close', () => clearInterval(pingInterval));
      };

      ws.onmessage = (event) => {
        if (event.data === 'pong') return; // ignore pong responses
        try {
          const msg: WebSocketMessage = JSON.parse(event.data);
          console.log('[WebSocket] Received:', msg);
          onMessage(msg);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      ws.onclose = (event) => {
        console.log(`[WebSocket] Closed (code=${event.code}, reason=${event.reason})`);
        wsRef.current = null;

        // Reconnect with exponential backoff
        if (event.code !== 1000) {
          // 1000 = normal closure, don't reconnect
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current += 1;
          console.log(`[WebSocket] Reconnecting in ${delay}ms...`);
          reconnectTimeoutRef.current = window.setTimeout(connect, delay);
        }
      };

      wsRef.current = ws;
    }

    connect();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
      }
    };
  }, [onMessage]);

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
