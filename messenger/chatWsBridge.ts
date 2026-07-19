/** Bridge WebSocket chat events from AS.tsx into the Messenger context. */
export type ChatWsMessage = {
  type: string;
  entity: string;
  data: any;
  timestamp: string;
};

type Handler = (msg: ChatWsMessage) => void;

let _handler: Handler | null = null;

export function setChatWsHandler(handler: Handler | null): void {
  _handler = handler;
}

export function dispatchChatWs(msg: ChatWsMessage): void {
  _handler?.(msg);
  try {
    window.dispatchEvent(new CustomEvent('as-chat-ws', { detail: msg }));
  } catch { /* ignore */ }
}
