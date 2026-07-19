/** Bridge WebSocket presence events into React state (who is actually online). */
export type PresenceUser = {
  id: string;
  name?: string;
  username?: string;
  avatar?: string | null;
  role?: string | null;
};

type Handler = (users: PresenceUser[]) => void;

let _handler: Handler | null = null;

export function setPresenceHandler(handler: Handler | null): void {
  _handler = handler;
}

export function dispatchPresence(users: PresenceUser[]): void {
  _handler?.(users);
}
