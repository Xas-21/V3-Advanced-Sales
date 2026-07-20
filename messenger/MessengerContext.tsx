import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl } from '../backendApi';
import { usePropertyLoadGate } from '../propertyScopedLoad';
import { setChatWsHandler, type ChatWsMessage } from './chatWsBridge';
import { playChatSound } from './chatNotify';

export type ChatUser = {
  id: string;
  name?: string;
  username?: string;
  avatar?: string;
  role?: string;
  lastReadAt?: string | null;
};
export type ChatMessage = {
  id: string; conversationId: string; senderUserId: string; senderName: string;
  senderAvatar?: string | null; body: string; bodyHtml?: string | null;
  attachments?: any[]; mentions?: string[]; createdAt: string | null;
};
export type ChatConversation = {
  id: string; type: 'dm' | 'group'; name?: string | null;
  avatarUrl?: string | null; description?: string | null;
  propertyId?: string | null; createdBy?: string | null;
  myRole?: string; muted?: boolean; pinned?: boolean;
  unreadCount: number; participants: ChatUser[]; lastMessage?: ChatMessage | null;
};
export type ChatTypingUser = {
  userId: string;
  name: string;
  avatar?: string | null;
  until: number;
};
export type ChatMediaItem = {
  messageId: string;
  createdAt: string | null;
  senderId: string;
  senderName?: string;
  attachment: any;
};
export type ChatInviteLink = {
  id: string;
  token: string;
  expiresAt?: string | null;
  maxUses?: number | null;
  useCount: number;
  createdAt?: string | null;
};

type MessengerContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
  currentUserId: string;
  conversations: ChatConversation[];
  messageableUsers: ChatUser[];
  activeId: string | null;
  messages: ChatMessage[];
  readCursors: Record<string, string | null>;
  typingUsers: ChatTypingUser[];
  unreadTotal: number;
  loading: boolean;
  sending: boolean;
  selectConversation: (id: string) => void;
  refreshConversations: () => Promise<void>;
  startDm: (userId: string) => Promise<void>;
  createGroup: (name: string, userIds: string[]) => Promise<void>;
  sendMessage: (body: string, bodyHtml: string, mentions: string[], attachments?: any[]) => Promise<void>;
  markRead: (conversationId: string) => Promise<void>;
  signalTyping: (conversationId: string) => void;
  addParticipants: (conversationId: string, userIds: string[]) => Promise<boolean>;
  removeParticipant: (conversationId: string, userId: string) => Promise<boolean>;
  setParticipantRole: (conversationId: string, userId: string, role: 'admin' | 'member') => Promise<boolean>;
  updateConversation: (conversationId: string, patch: { name?: string; avatarUrl?: string | null; description?: string | null }) => Promise<boolean>;
  updatePrefs: (conversationId: string, prefs: { muted?: boolean; pinned?: boolean }) => Promise<boolean>;
  searchMessages: (conversationId: string, q: string) => Promise<ChatMessage[]>;
  fetchMedia: (conversationId: string, kind?: string) => Promise<ChatMediaItem[]>;
  listInviteLinks: (conversationId: string) => Promise<ChatInviteLink[]>;
  createInviteLink: (conversationId: string) => Promise<ChatInviteLink | null>;
  revokeInviteLink: (conversationId: string, linkId: string) => Promise<boolean>;
  joinViaInvite: (token: string) => Promise<string | null>;
};

const MessengerContext = createContext<MessengerContextValue | null>(null);

export function useMessenger(): MessengerContextValue {
  const ctx = useContext(MessengerContext);
  if (!ctx) throw new Error('useMessenger outside provider');
  return ctx;
}

async function parseJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function MessengerProvider({
  children,
  propertyId,
  currentUserId,
}: {
  children: React.ReactNode;
  propertyId: string;
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messageableUsers, setMessageableUsers] = useState<ChatUser[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [readCursors, setReadCursors] = useState<Record<string, string | null>>({});
  const [typingByConv, setTypingByConv] = useState<Record<string, ChatTypingUser[]>>({});
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  const openRef = useRef(false);
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingSentRef = useRef(0);
  const { begin: beginListLoad, isCurrent: isListLoadCurrent } = usePropertyLoadGate();
  activeIdRef.current = activeId;
  openRef.current = open;

  const unreadTotal = useMemo(
    () => conversations.reduce((a, c) => a + (c.muted ? 0 : (c.unreadCount || 0)), 0),
    [conversations],
  );

  const typingUsers = useMemo(() => {
    if (!activeId) return [];
    const now = Date.now();
    return (typingByConv[String(activeId)] || []).filter((t) => t.until > now);
  }, [typingByConv, activeId]);

  const refreshConversations = useCallback(async () => {
    if (!currentUserId) return;
    if (!beginListLoad(propertyId)) {
      setConversations([]);
      setMessageableUsers([]);
      return;
    }
    try {
      const qs = `?property_id=${encodeURIComponent(propertyId)}`;
      const [convRes, usersRes] = await Promise.all([
        fetch(apiUrl(`/api/chat/conversations${qs}`), { credentials: 'include' }),
        fetch(apiUrl(`/api/chat/users${qs}`), { credentials: 'include' }),
      ]);
      if (!isListLoadCurrent(propertyId)) return;
      if (convRes.ok) setConversations(await convRes.json());
      if (!isListLoadCurrent(propertyId)) return;
      if (usersRes.ok) setMessageableUsers(await usersRes.json());
    } catch { /* silent */ }
  }, [propertyId, currentUserId, beginListLoad, isListLoadCurrent]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/chat/conversations/${conversationId}/messages`), { credentials: 'include' });
      if (!res.ok) return;
      const data = await parseJson(res);
      if (Array.isArray(data)) {
        setMessages(data);
        setReadCursors({});
      } else {
        setMessages(data?.messages || []);
        setReadCursors(data?.readCursors || {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const selectConversation = useCallback(async (id: string) => {
    setActiveId(id);
    await loadMessages(id);
    await fetch(apiUrl(`/api/chat/conversations/${id}/read`), { method: 'POST', credentials: 'include' });
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
  }, [loadMessages]);

  const startDm = useCallback(async (userId: string) => {
    const res = await fetch(apiUrl('/api/chat/conversations/dm'), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) return;
    const data = await res.json();
    await refreshConversations();
    await selectConversation(data.id);
    setOpen(true);
  }, [refreshConversations, selectConversation]);

  const createGroup = useCallback(async (name: string, userIds: string[]) => {
    const res = await fetch(apiUrl('/api/chat/conversations/group'), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, participantIds: userIds, propertyId: propertyId || undefined }),
    });
    if (!res.ok) return;
    const data = await res.json();
    await refreshConversations();
    await selectConversation(data.id);
  }, [propertyId, refreshConversations, selectConversation]);

  const sendMessage = useCallback(async (body: string, bodyHtml: string, mentions: string[], attachments: any[] = []) => {
    if (!activeIdRef.current) return;
    setSending(true);
    try {
      const res = await fetch(apiUrl(`/api/chat/conversations/${activeIdRef.current}/messages`), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, bodyHtml, mentions, attachments }),
      });
      if (!res.ok) throw new Error(`Send failed (${res.status})`);
      const msg = await res.json();
      setMessages((prev) => {
        if (prev.some((x) => String(x.id) === String(msg.id))) return prev;
        return [...prev, msg];
      });
      setConversations((prev) => prev.map((c) => (
        String(c.id) === String(msg.conversationId)
          ? { ...c, lastMessage: msg }
          : c
      )));
      void refreshConversations();
    } finally {
      setSending(false);
    }
  }, [refreshConversations]);

  const markRead = useCallback(async (conversationId: string) => {
    const res = await fetch(apiUrl(`/api/chat/conversations/${conversationId}/read`), { method: 'POST', credentials: 'include' });
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)));
    if (res.ok) {
      const data = await parseJson(res);
      if (data?.lastReadAt) {
        setReadCursors((prev) => ({ ...prev, [String(currentUserId)]: data.lastReadAt }));
      }
    }
  }, [currentUserId]);

  const signalTyping = useCallback((conversationId: string) => {
    if (!conversationId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1400) return;
    lastTypingSentRef.current = now;
    void fetch(apiUrl(`/api/chat/conversations/${conversationId}/typing`), {
      method: 'POST',
      credentials: 'include',
    }).catch(() => { /* ignore */ });
  }, []);

  const addParticipants = useCallback(async (conversationId: string, userIds: string[]) => {
    const res = await fetch(apiUrl(`/api/chat/conversations/${conversationId}/participants`), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds }),
    });
    if (res.ok) await refreshConversations();
    return res.ok;
  }, [refreshConversations]);

  const removeParticipant = useCallback(async (conversationId: string, userId: string) => {
    const res = await fetch(apiUrl(`/api/chat/conversations/${conversationId}/participants/${encodeURIComponent(userId)}`), {
      method: 'DELETE', credentials: 'include',
    });
    if (!res.ok) return false;
    if (String(userId) === String(currentUserId)) {
      setActiveId(null);
      setMessages([]);
    }
    await refreshConversations();
    return true;
  }, [currentUserId, refreshConversations]);

  const setParticipantRole = useCallback(async (conversationId: string, userId: string, role: 'admin' | 'member') => {
    const res = await fetch(apiUrl(`/api/chat/conversations/${conversationId}/participants/${encodeURIComponent(userId)}/role`), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (res.ok) await refreshConversations();
    return res.ok;
  }, [refreshConversations]);

  const updateConversation = useCallback(async (
    conversationId: string,
    patch: { name?: string; avatarUrl?: string | null; description?: string | null },
  ) => {
    const res = await fetch(apiUrl(`/api/chat/conversations/${conversationId}`), {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) await refreshConversations();
    return res.ok;
  }, [refreshConversations]);

  const updatePrefs = useCallback(async (conversationId: string, prefs: { muted?: boolean; pinned?: boolean }) => {
    const res = await fetch(apiUrl(`/api/chat/conversations/${conversationId}/prefs`), {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    if (res.ok) {
      setConversations((prev) => prev.map((c) => (
        String(c.id) === String(conversationId)
          ? {
              ...c,
              muted: prefs.muted ?? c.muted,
              pinned: prefs.pinned ?? c.pinned,
              unreadCount: prefs.muted ? 0 : c.unreadCount,
            }
          : c
      )));
      await refreshConversations();
    }
    return res.ok;
  }, [refreshConversations]);

  const searchMessages = useCallback(async (conversationId: string, q: string) => {
    const res = await fetch(
      apiUrl(`/api/chat/conversations/${conversationId}/messages?q=${encodeURIComponent(q)}&limit=40`),
      { credentials: 'include' },
    );
    if (!res.ok) return [];
    const data = await parseJson(res);
    if (Array.isArray(data)) return data;
    return data?.messages || [];
  }, []);

  const fetchMedia = useCallback(async (conversationId: string, kind = 'all') => {
    const res = await fetch(
      apiUrl(`/api/chat/conversations/${conversationId}/media?kind=${encodeURIComponent(kind)}&limit=60`),
      { credentials: 'include' },
    );
    if (!res.ok) return [];
    return (await parseJson(res)) || [];
  }, []);

  const listInviteLinks = useCallback(async (conversationId: string) => {
    const res = await fetch(apiUrl(`/api/chat/conversations/${conversationId}/invite-links`), { credentials: 'include' });
    if (!res.ok) return [];
    return (await parseJson(res)) || [];
  }, []);

  const createInviteLink = useCallback(async (conversationId: string) => {
    const res = await fetch(apiUrl(`/api/chat/conversations/${conversationId}/invite-links`), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    return await parseJson(res);
  }, []);

  const revokeInviteLink = useCallback(async (conversationId: string, linkId: string) => {
    const res = await fetch(
      apiUrl(`/api/chat/conversations/${conversationId}/invite-links/${encodeURIComponent(linkId)}`),
      { method: 'DELETE', credentials: 'include' },
    );
    return res.ok;
  }, []);

  const joinViaInvite = useCallback(async (token: string) => {
    const res = await fetch(apiUrl(`/api/chat/join/${encodeURIComponent(token)}`), {
      method: 'POST', credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await parseJson(res);
    await refreshConversations();
    if (data?.conversationId) {
      await selectConversation(data.conversationId);
      setOpen(true);
      return String(data.conversationId);
    }
    return null;
  }, [refreshConversations, selectConversation]);

  const upsertTyping = useCallback((convId: string, entry: Omit<ChatTypingUser, 'until'>) => {
    const key = String(convId);
    const until = Date.now() + 3200;
    setTypingByConv((prev) => {
      const list = (prev[key] || []).filter((t) => t.userId !== entry.userId && t.until > Date.now());
      return { ...prev, [key]: [...list, { ...entry, until }] };
    });
    const timerKey = `${key}:${entry.userId}`;
    if (typingTimersRef.current[timerKey]) clearTimeout(typingTimersRef.current[timerKey]);
    typingTimersRef.current[timerKey] = setTimeout(() => {
      setTypingByConv((prev) => {
        const list = (prev[key] || []).filter((t) => t.userId !== entry.userId && t.until > Date.now());
        if (!list.length) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: list };
      });
    }, 3400);
  }, []);

  const clearTypingUser = useCallback((convId: string, userId: string) => {
    const key = String(convId);
    setTypingByConv((prev) => {
      const list = (prev[key] || []).filter((t) => t.userId !== userId);
      if (!list.length) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: list };
    });
  }, []);

  const handleIncomingMessage = useCallback((msg: ChatWsMessage) => {
    const data = msg.data || {};
    const convId = String(data.conversationId || '');
    if (!convId || !data.message) return;

    const m = data.message as ChatMessage;
    const msgId = String(m.id);
    const isActive = String(activeIdRef.current || '') === convId;
    const fromSelf = String(m.senderUserId) === String(currentUserId);

    clearTypingUser(convId, String(m.senderUserId));

    if (isActive) {
      setMessages((prev) => {
        if (prev.some((x) => String(x.id) === msgId)) return prev;
        return [...prev, m];
      });
      setConversations((prev) => prev.map((c) => (
        String(c.id) === convId ? { ...c, lastMessage: m } : c
      )));
      if (!fromSelf) void markRead(convId);
    } else if (!fromSelf) {
      setConversations((prev) => prev.map((c) => {
        if (String(c.id) !== convId) return c;
        if (c.muted) return { ...c, lastMessage: m };
        return { ...c, unreadCount: (c.unreadCount || 0) + 1, lastMessage: m };
      }));
    }

    if (!fromSelf) playChatSound();
    void refreshConversations();
  }, [clearTypingUser, currentUserId, markRead, refreshConversations]);

  useEffect(() => {
    if (!currentUserId) return;
    void refreshConversations();
    const t = setInterval(() => { void refreshConversations(); }, 60000);
    return () => clearInterval(t);
  }, [currentUserId, propertyId, refreshConversations]);

  // Deep-link join: ?joinChat=TOKEN (once per token)
  const joinHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentUserId || typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('joinChat');
      if (!token || joinHandledRef.current === token) return;
      joinHandledRef.current = token;
      void (async () => {
        const cid = await joinViaInvite(token);
        params.delete('joinChat');
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', next);
        if (!cid) joinHandledRef.current = null;
      })();
    } catch { /* ignore */ }
  }, [currentUserId, joinViaInvite]);

  useEffect(() => {
    const onWs = (msg: ChatWsMessage) => {
      if (msg.entity !== 'chat') return;
      if (msg.type === 'created') {
        handleIncomingMessage(msg);
        return;
      }
      if (msg.type === 'updated') {
        const data = msg.data || {};
        if (data.message) {
          handleIncomingMessage(msg);
        } else {
          void refreshConversations();
          const removed = data.removed != null ? String(data.removed) : '';
          if (removed && removed === String(currentUserId) && String(activeIdRef.current) === String(data.conversationId || '')) {
            setActiveId(null);
            setMessages([]);
          } else if (String(activeIdRef.current) === String(data.conversationId || '')) {
            void loadMessages(String(data.conversationId));
          }
        }
        return;
      }
      if (msg.type === 'read') {
        const data = msg.data || {};
        const convId = String(data.conversationId || '');
        const userId = String(data.userId || '');
        if (!convId || !userId) return;
        if (String(activeIdRef.current) === convId) {
          setReadCursors((prev) => ({ ...prev, [userId]: data.lastReadAt || null }));
        }
        return;
      }
      if (msg.type === 'typing') {
        const data = msg.data || {};
        const convId = String(data.conversationId || '');
        const userId = String(data.userId || '');
        if (!convId || !userId || userId === String(currentUserId)) return;
        if (!data.typing) {
          clearTypingUser(convId, userId);
          return;
        }
        upsertTyping(convId, {
          userId,
          name: String(data.name || 'Someone'),
          avatar: data.avatar ?? null,
        });
      }
    };
    setChatWsHandler(onWs);
    const onWindow = (e: Event) => {
      const detail = (e as CustomEvent<ChatWsMessage>).detail;
      if (detail) onWs(detail);
    };
    window.addEventListener('as-chat-ws', onWindow);
    return () => {
      setChatWsHandler(null);
      window.removeEventListener('as-chat-ws', onWindow);
    };
  }, [clearTypingUser, currentUserId, handleIncomingMessage, loadMessages, refreshConversations, upsertTyping]);

  const value: MessengerContextValue = {
    open, setOpen, currentUserId, conversations, messageableUsers, activeId, messages,
    readCursors, typingUsers, unreadTotal, loading, sending, selectConversation, refreshConversations,
    startDm, createGroup, sendMessage, markRead, signalTyping,
    addParticipants, removeParticipant, setParticipantRole, updateConversation, updatePrefs,
    searchMessages, fetchMedia, listInviteLinks, createInviteLink, revokeInviteLink, joinViaInvite,
  };

  return <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>;
}
