import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import {
  MessageCircle, X, Send, Loader2, Users, Plus, Search, Paperclip, Smile,
  Image as ImageIcon, Video, FileText, ChevronLeft, GripHorizontal, Pin, BellOff, Check, CheckCheck,
} from 'lucide-react';
import { uploadFileLocal, mediaUrl } from '../localUpload';
import {
  RichTextEditor, RichContent, extractMentionIds, htmlToPlainText, type MentionUser,
  type RichTextEditorHandle,
} from '../dashboardHub/richText';
import { MessengerProvider, useMessenger, type ChatTypingUser, type ChatConversation } from './MessengerContext';
import { useDraggableFab, useFloatingWindow } from './useFloatingPanel';
import { CHAT_EMOJIS } from './chatNotify';
import GroupInfoPanel from './GroupInfoPanel';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function formatMsgTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function chatInitials(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ChatAvatar({
  name,
  avatar,
  colors,
  size = 28,
}: {
  name: string;
  avatar?: string | null;
  colors: any;
  size?: number;
}) {
  if (avatar) {
    const src = avatar.startsWith('http') || avatar.startsWith('data:') || avatar.startsWith('/')
      ? avatar
      : mediaUrl(avatar);
    return (
      <img
        src={src}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: `1px solid ${colors.border}` }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.36),
        background: colors.primaryDim,
        color: colors.primary,
        border: `1px solid ${colors.border}`,
      }}
    >
      {chatInitials(name)}
    </div>
  );
}

function TypingDots({ colors }: { colors: any }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || prefersReducedMotion()) return;
    const dots = root.querySelectorAll('[data-typing-dot]');
    const tween = gsap.to(dots, {
      y: -3,
      duration: 0.35,
      stagger: 0.12,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
    return () => {
      tween.kill();
      gsap.set(dots, { y: 0 });
    };
  }, []);
  return (
    <span ref={ref} className="inline-flex items-center gap-0.5 ml-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          data-typing-dot
          className="inline-block w-1 h-1 rounded-full"
          style={{ background: colors.textMuted }}
        />
      ))}
    </span>
  );
}

function TypingIndicator({
  users,
  colors,
}: {
  users: ChatTypingUser[];
  colors: any;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rowRef.current;
    if (!el || prefersReducedMotion()) return;
    gsap.fromTo(el, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' });
  }, [users.map((u) => u.userId).join(',')]);

  if (!users.length) return null;
  const names = users.map((u) => u.name.split(/\s+/)[0] || u.name);
  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names[0]} and ${names.length - 1} others are typing`;

  return (
    <div ref={rowRef} className="flex items-center gap-2 px-1 py-1" style={{ color: colors.textMuted }}>
      <div className="flex -space-x-1.5">
        {users.slice(0, 3).map((u) => (
          <ChatAvatar key={u.userId} name={u.name} avatar={u.avatar} colors={colors} size={22} />
        ))}
      </div>
      <span className="text-[11px] italic">
        {label}
        <TypingDots colors={colors} />
      </span>
    </div>
  );
}

function messageIsReadByPeer(
  msg: { createdAt: string | null; senderUserId: string },
  conv: ChatConversation | undefined,
  currentUserId: string,
  readCursors: Record<string, string | null>,
): boolean {
  if (!conv || String(msg.senderUserId) !== String(currentUserId) || !msg.createdAt) return false;
  const msgTs = new Date(msg.createdAt).getTime();
  if (Number.isNaN(msgTs)) return false;
  if (conv.type === 'dm') {
    const other = conv.participants.find((p) => String(p.id) !== String(currentUserId));
    if (!other) return false;
    const cursor = readCursors[String(other.id)] || other.lastReadAt;
    if (!cursor) return false;
    return new Date(cursor).getTime() >= msgTs;
  }
  // Group: any other participant has read past this message
  return conv.participants.some((p) => {
    if (String(p.id) === String(currentUserId)) return false;
    const cursor = readCursors[String(p.id)] || p.lastReadAt;
    if (!cursor) return false;
    return new Date(cursor).getTime() >= msgTs;
  });
}

function MessengerPopup({ colors }: { colors: any }) {
  const {
    open, setOpen, currentUserId, conversations, messageableUsers, activeId, messages,
    readCursors, typingUsers, loading, sending, selectConversation, startDm, createGroup, sendMessage, signalTyping,
  } = useMessenger();

  const { geom, headerProps, resizeProps } = useFloatingWindow('as-messenger-window', 1080, 720);

  const [view, setView] = useState<'chats' | 'users' | 'new-group'>('chats');
  const [search, setSearch] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const knownMsgIdsRef = useRef<Set<string>>(new Set());
  const prevActiveIdRef = useRef<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiStyle, setEmojiStyle] = useState<React.CSSProperties | null>(null);

  const updateEmojiPosition = useCallback(() => {
    const rect = composerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setEmojiStyle({
      position: 'fixed',
      left: rect.left + 8,
      bottom: window.innerHeight - rect.top + 8,
      display: 'grid',
      gridTemplateColumns: 'repeat(6, 1fr)',
      gap: 2,
      width: 240,
      maxHeight: 196,
      overflowY: 'auto',
      padding: 8,
      borderRadius: 12,
      zIndex: 300,
      background: colors.card,
      border: `1px solid ${colors.border}`,
      boxShadow: '0 16px 48px rgba(15,23,42,0.28)',
    });
  }, [colors.border, colors.card]);

  /* Open motion */
  useEffect(() => {
    if (!open || !panelRef.current) return;
    if (prefersReducedMotion()) {
      gsap.set(panelRef.current, { opacity: 1, y: 0, scale: 1 });
      return;
    }
    gsap.fromTo(
      panelRef.current,
      { opacity: 0, y: 14, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power2.out' }
    );
  }, [open]);

  /* Escape closes (skip when typing in rich editor) */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t?.isContentEditable || t?.closest?.('[contenteditable="true"]')) return;
      if (showEmoji) {
        setShowEmoji(false);
        return;
      }
      if (showInfo) {
        setShowInfo(false);
        return;
      }
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, showEmoji, showInfo, setOpen]);

  useEffect(() => {
    setShowInfo(false);
  }, [activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  /* Animate only newly appended messages (not initial thread load) */
  useEffect(() => {
    if (activeId !== prevActiveIdRef.current) {
      prevActiveIdRef.current = activeId;
      knownMsgIdsRef.current = new Set();
    }
    if (loading || !activeId) return;
    const fresh = messages.filter((m) => !knownMsgIdsRef.current.has(String(m.id)));
    const isInitial = knownMsgIdsRef.current.size === 0;
    for (const m of fresh) knownMsgIdsRef.current.add(String(m.id));
    if (isInitial || prefersReducedMotion() || fresh.length === 0) return;
    requestAnimationFrame(() => {
      for (const m of fresh) {
        const el = Array.from(panelRef.current?.querySelectorAll('[data-msg-id]') || []).find(
          (node) => node.getAttribute('data-msg-id') === String(m.id)
        );
        if (el) {
          gsap.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' });
        }
      }
    });
  }, [messages, loading, activeId]);

  useEffect(() => {
    if (!showEmoji) return;
    updateEmojiPosition();
    const onReposition = () => updateEmojiPosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [showEmoji, updateEmojiPosition]);

  useEffect(() => {
    if (!showEmoji) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.('[data-emoji-picker]')) setShowEmoji(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showEmoji]);

  const activeConv = conversations.find((c) => c.id === activeId);
  const mentionUsers: MentionUser[] = messageableUsers.map((u) => ({
    id: u.id, name: u.name, username: u.username, avatar: u.avatar, role: u.role,
  }));

  const filteredConvs = conversations.filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (c.name || '').toLowerCase().includes(q)
      || c.participants.some((p) => (p.name || '').toLowerCase().includes(q));
  });

  const filteredUsers = messageableUsers.filter((u) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
  });

  const handleSend = useCallback(async () => {
    const html = bodyHtml;
    const plain = htmlToPlainText(html);
    const files = attachments;
    if (!plain && !files.length) return;
    if (sending) return;

    const mentions = extractMentionIds(html);
    setBodyHtml('');
    editorRef.current?.clear();
    setAttachments([]);
    setShowEmoji(false);

    try {
      await sendMessage(plain, html, mentions, files);
      editorRef.current?.focus();
    } catch {
      setBodyHtml(html);
      setAttachments(files);
      editorRef.current?.setHtml(html);
    }
  }, [attachments, bodyHtml, sendMessage, sending]);

  const toggleEmojiPicker = () => {
    if (showEmoji) {
      setShowEmoji(false);
      return;
    }
    updateEmojiPosition();
    setShowEmoji(true);
  };

  const uploadFile = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 4)) {
        const r = await uploadFileLocal(file, { folder: 'chat' });
        const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
        setAttachments((prev) => [...prev, { url: r.secure_url, publicId: r.public_id, type, name: file.name, bytes: r.bytes }]);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleComposerChange = useCallback((html: string) => {
    setBodyHtml(html);
    if (!activeId) return;
    const plain = htmlToPlainText(html);
    if (plain.trim()) signalTyping(activeId);
  }, [activeId, signalTyping]);

  const resolveSenderAvatar = useCallback((senderUserId: string, senderAvatar?: string | null) => {
    if (senderAvatar) return senderAvatar;
    const fromConv = activeConv?.participants?.find((p) => String(p.id) === String(senderUserId));
    if (fromConv?.avatar) return fromConv.avatar;
    const fromUsers = messageableUsers.find((u) => String(u.id) === String(senderUserId));
    return fromUsers?.avatar || null;
  }, [activeConv, messageableUsers]);

  const convTitle = (c: typeof conversations[0]) => {
    if (c.type === 'group') return c.name || 'Group';
    const other = c.participants.find((p) => p.id !== currentUserId);
    return other?.name || c.name || 'Chat';
  };

  if (!open) return null;

  const inputStyle = { background: colors.bg, borderColor: colors.border, color: colors.textMain };
  const iconBtn = (active?: boolean): React.CSSProperties => ({
    color: active ? colors.primary : colors.textMuted,
    background: active ? colors.primaryDim : 'transparent',
  });

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[220] rounded-[20px] border shadow-2xl flex flex-col overflow-hidden"
      style={{
        left: geom.x,
        top: geom.y,
        width: geom.w,
        height: geom.h,
        background: colors.card,
        borderColor: colors.border,
        boxShadow: '0 24px 64px rgba(15,23,42,0.35)',
      }}
      role="dialog"
      aria-label="Messenger"
    >
      {/* Draggable title bar */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0 cursor-grab active:cursor-grabbing select-none"
        style={{ borderColor: colors.border, background: colors.bg }}
        {...headerProps}
      >
        <div className="flex items-center gap-2.5">
          <GripHorizontal size={16} style={{ color: colors.textMuted }} />
          <div>
            <h3 className="font-semibold text-sm tracking-tight" style={{ color: colors.textMain }}>Messenger</h3>
            <p className="text-[9px] uppercase tracking-[0.14em] opacity-50" style={{ color: colors.textMuted }}>
              Team chat
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => { setView('new-group'); setSearch(''); }}
            className="p-2 rounded-xl transition-colors hover:opacity-90"
            style={iconBtn(view === 'new-group')}
            title="New group"
          >
            <Users size={16} />
          </button>
          <button
            type="button"
            onClick={() => { setView('users'); setSearch(''); }}
            className="p-2 rounded-xl transition-colors hover:opacity-90"
            style={iconBtn(view === 'users')}
            title="New chat"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-2 rounded-xl transition-colors hover:opacity-90"
            style={iconBtn(false)}
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className="w-[min(320px,35%)] shrink-0 border-r flex flex-col" style={{ borderColor: colors.border, background: colors.bg }}>
          <div className="p-2.5 border-b" style={{ borderColor: colors.border }}>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: colors.textMuted }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border text-xs outline-none"
                style={inputStyle}
              />
            </div>
            {view !== 'chats' && (
              <button
                type="button"
                onClick={() => setView('chats')}
                className="mt-2 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: colors.primary }}
              >
                ← Back to chats
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {view === 'chats' && filteredConvs.length === 0 && (
              <p className="text-center text-xs py-10 px-4" style={{ color: colors.textMuted }}>
                No conversations yet. Start a chat with your team.
              </p>
            )}
            {view === 'chats' && filteredConvs.map((c) => {
              const selected = activeId === c.id;
              const peer = c.participants.find((p) => p.id !== currentUserId);
              const listTitle = c.type === 'group' ? (c.name || 'Group') : (peer?.name || c.name || 'Chat');
              const listAvatar = c.type === 'group' ? c.avatarUrl : peer?.avatar;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-3 text-left transition-colors"
                  style={{
                    background: selected ? colors.primaryDim : 'transparent',
                    boxShadow: selected ? `inset 3px 0 0 ${colors.primary}` : undefined,
                  }}
                >
                  <ChatAvatar name={listTitle} avatar={listAvatar} colors={colors} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-sm font-medium truncate" style={{ color: colors.textMain }}>
                      {c.pinned && <Pin size={11} className="shrink-0" style={{ color: colors.primary }} />}
                      {c.muted && <BellOff size={11} className="shrink-0" style={{ color: colors.textMuted }} />}
                      <span className="truncate">{listTitle}</span>
                    </div>
                    <div className="text-[10px] truncate" style={{ color: colors.textMuted }}>
                      {c.lastMessage?.body || 'No messages yet'}
                    </div>
                  </div>
                  {!c.muted && c.unreadCount > 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-bold text-white shrink-0"
                      style={{ background: colors.primary }}
                    >
                      {c.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}

            {view === 'users' && filteredUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { void startDm(u.id); setView('chats'); }}
                className="w-full flex items-center gap-2.5 px-3 py-3 text-left transition-opacity hover:opacity-80"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: colors.card, color: colors.primary, border: `1px solid ${colors.border}` }}
                >
                  {(u.name || '?')[0]}
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: colors.textMain }}>{u.name}</div>
                  {u.username && <div className="text-[10px]" style={{ color: colors.textMuted }}>@{u.username}</div>}
                </div>
              </button>
            ))}

            {view === 'new-group' && (
              <div className="p-3 space-y-2.5">
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Group name"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={inputStyle}
                />
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                  Select members
                </div>
                {filteredUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: colors.textMain }}>
                    <input
                      type="checkbox"
                      checked={groupMembers.includes(u.id)}
                      onChange={(e) => setGroupMembers((prev) =>
                        e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id))}
                    />
                    {u.name}
                  </label>
                ))}
                <button
                  type="button"
                  disabled={!groupName.trim() || groupMembers.length === 0}
                  onClick={async () => {
                    await createGroup(groupName.trim(), groupMembers);
                    setGroupName('');
                    setGroupMembers([]);
                    setView('chats');
                  }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                  style={{ background: colors.primary, color: '#fff' }}
                >
                  Create Group
                </button>
                <button type="button" onClick={() => setView('chats')} className="w-full text-xs" style={{ color: colors.textMuted }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-w-0 relative" style={{ background: colors.card }}>
          {activeId && activeConv ? (
            <>
              <div
                className="flex items-center gap-2 px-4 py-3 border-b shrink-0"
                style={{ borderColor: colors.border, background: colors.bg }}
              >
                <button type="button" onClick={() => setView('chats')} className="lg:hidden p-1.5 rounded-lg" style={{ color: colors.textMuted }}>
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowInfo(true)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-xl px-1 py-0.5 hover:opacity-90"
                  title="Open chat info"
                >
                  <ChatAvatar
                    name={convTitle(activeConv)}
                    avatar={
                      activeConv.type === 'group'
                        ? activeConv.avatarUrl
                        : activeConv.participants.find((p) => p.id !== currentUserId)?.avatar
                    }
                    colors={colors}
                    size={32}
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate tracking-tight" style={{ color: colors.textMain }}>
                      {convTitle(activeConv)}
                    </div>
                    {activeConv.type === 'group' && (
                      <div className="text-[10px]" style={{ color: colors.textMuted }}>
                        {activeConv.participants.length} members · tap for info
                      </div>
                    )}
                    {activeConv.type === 'dm' && (
                      <div className="text-[10px]" style={{ color: colors.textMuted }}>Tap for info</div>
                    )}
                  </div>
                </button>
                {activeConv.type === 'group' && (
                  <button
                    type="button"
                    onClick={() => setShowInfo(true)}
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                    style={{ background: colors.primaryDim, color: colors.primary }}
                  >
                    {activeConv.participants.length} members
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar" style={{ background: colors.bg }}>
                {loading ? (
                  <div className="flex justify-center py-8"><Loader2 className="animate-spin" style={{ color: colors.primary }} /></div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: colors.primaryDim, color: colors.primary }}
                    >
                      <MessageCircle size={22} />
                    </div>
                    <p className="text-sm" style={{ color: colors.textMuted }}>No messages yet. Say hello!</p>
                  </div>
                ) : messages.map((m) => {
                  const isMine = String(m.senderUserId) === String(currentUserId);
                  const timeLabel = formatMsgTime(m.createdAt);
                  const avatar = resolveSenderAvatar(String(m.senderUserId), m.senderAvatar);
                  const read = isMine && messageIsReadByPeer(m, activeConv, currentUserId, readCursors);
                  return (
                    <div
                      key={m.id}
                      data-msg-id={m.id}
                      className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isMine && (
                        <ChatAvatar name={m.senderName || '?'} avatar={avatar} colors={colors} size={28} />
                      )}
                      <div
                        className={`as-msg-bubble max-w-[75%] px-3.5 py-2 text-sm ${
                          isMine ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'
                        }`}
                        style={{
                          background: isMine ? colors.primaryDim : colors.card,
                          border: `1px solid ${colors.border}`,
                          color: colors.textMain,
                          ['--as-msg-fg' as any]: colors.textMain,
                          boxShadow: '0 1px 0 rgba(15,23,42,0.06)',
                        }}
                      >
                        {!isMine && (
                          <div className="text-[10px] font-semibold mb-0.5" style={{ color: colors.primary }}>{m.senderName}</div>
                        )}
                        {m.bodyHtml ? <RichContent html={m.bodyHtml} colors={colors} variant="chat" /> : (
                          <div style={{ color: colors.textMain, WebkitTextFillColor: colors.textMain }}>{m.body}</div>
                        )}
                        {m.attachments?.map((a: any, i: number) => (
                          <a
                            key={i}
                            href={mediaUrl(a.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs mt-1 underline"
                            style={{ color: colors.primary }}
                          >
                            {a.type === 'image' ? <ImageIcon size={12} /> : a.type === 'video' ? <Video size={12} /> : <FileText size={12} />}
                            {a.name || 'attachment'}
                          </a>
                        ))}
                        <div
                          className="text-[9px] mt-1.5 tabular-nums opacity-60 flex items-center justify-end gap-1"
                          style={{ color: colors.textMuted }}
                        >
                          {timeLabel ? <span>{timeLabel}</span> : null}
                          {isMine && (
                            read
                              ? <CheckCheck size={12} style={{ color: colors.primary }} />
                              : <Check size={12} />
                          )}
                        </div>
                      </div>
                      {isMine && (
                        <ChatAvatar name={m.senderName || 'You'} avatar={avatar} colors={colors} size={28} />
                      )}
                    </div>
                  );
                })}
                <TypingIndicator users={typingUsers} colors={colors} />
                <div ref={messagesEndRef} />
              </div>

              {showInfo && (
                <GroupInfoPanel
                  colors={colors}
                  conversation={activeConv}
                  onClose={() => setShowInfo(false)}
                  onJumpToMessage={(messageId) => {
                    setShowInfo(false);
                    requestAnimationFrame(() => {
                      const el = panelRef.current?.querySelector(`[data-msg-id="${messageId}"]`);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });
                  }}
                />
              )}

              <div
                ref={composerRef}
                className="p-3 border-t space-y-2 shrink-0 relative overflow-visible"
                style={{ borderColor: colors.border, background: colors.card }}
              >
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {attachments.map((a, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-2 py-0.5 rounded-lg border flex items-center gap-1"
                        style={{ borderColor: colors.border, color: colors.textMuted, background: colors.bg }}
                      >
                        {a.name}
                        <button type="button" onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <RichTextEditor
                  ref={editorRef}
                  colors={colors}
                  users={mentionUsers}
                  compact
                  suggestionsUp
                  placeholder="Type a message... (Enter to send)"
                  minHeight={44}
                  onChange={handleComposerChange}
                  onEnterSend={() => { void handleSend(); }}
                />
                <div className="flex items-center justify-between">
                  <div className="flex gap-1" data-emoji-picker>
                    <button
                      type="button"
                      onClick={toggleEmojiPicker}
                      className="p-2 rounded-xl transition-colors"
                      style={iconBtn(showEmoji)}
                      title="Emoji"
                    >
                      <Smile size={16} />
                    </button>
                    {showEmoji && emojiStyle && createPortal(
                      <div style={emojiStyle} data-emoji-picker>
                        {CHAT_EMOJIS.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); editorRef.current?.insertText(em); setShowEmoji(false); }}
                            style={{
                              fontSize: 20,
                              width: 36,
                              height: 36,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 8,
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                            }}
                          >
                            {em}
                          </button>
                        ))}
                      </div>,
                      document.body,
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => { void uploadFile(e.target.files); e.target.value = ''; }}
                    />
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                      className="p-2 rounded-xl"
                      style={iconBtn(false)}
                      title="Attach file"
                    >
                      {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={handleSend}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 hover:brightness-110 active:scale-[0.98] transition-transform"
                    style={{ background: colors.primary, color: '#fff' }}
                  >
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8" style={{ background: colors.bg }}>
              <div
                className="w-16 h-16 rounded-[20px] flex items-center justify-center"
                style={{ background: colors.primaryDim, color: colors.primary }}
              >
                <MessageCircle size={28} />
              </div>
              <div className="text-center space-y-1 max-w-xs">
                <p className="text-sm font-semibold" style={{ color: colors.textMain }}>Your conversations</p>
                <p className="text-sm" style={{ color: colors.textMuted }}>
                  Select a chat or start a new one with your team
                </p>
              </div>
              <button
                type="button"
                onClick={() => setView('users')}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold hover:brightness-110"
                style={{ background: colors.primary, color: '#fff' }}
              >
                Start a conversation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end p-0.5"
        title="Resize"
        {...resizeProps}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ color: colors.textMuted }}>
          <path fill="currentColor" d="M12 12H10V10H12V12ZM12 8H10V6H12V8ZM8 12H6V10H8V12ZM12 4H10V2H12V4ZM8 8H6V6H8V8ZM4 12H2V10H4V12Z" />
        </svg>
      </div>
    </div>,
    document.body,
  );
}

function MessengerFab({ colors }: { colors: any }) {
  const { open, setOpen, unreadTotal } = useMessenger();
  const { pos, fabProps } = useDraggableFab('as-messenger-fab-pos');
  const draggedRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = fabRef.current;
    if (!el) return;
    if (open || unreadTotal <= 0 || prefersReducedMotion()) {
      gsap.killTweensOf(el);
      gsap.set(el, { scale: 1 });
      return;
    }
    const tween = gsap.to(el, {
      scale: 1.07,
      duration: 0.75,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
    return () => {
      tween.kill();
      gsap.set(el, { scale: 1 });
    };
  }, [open, unreadTotal]);

  const onPointerDown = (e: React.PointerEvent) => {
    draggedRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    fabProps.onPointerDown(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (Math.abs(e.clientX - startRef.current.x) > 4 || Math.abs(e.clientY - startRef.current.y) > 4) {
      draggedRef.current = true;
    }
    fabProps.onPointerMove(e);
  };

  const onClick = () => {
    if (draggedRef.current) return;
    setOpen(true);
  };

  return createPortal(
    <button
      ref={fabRef}
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={fabProps.onPointerUp}
      className="fixed z-[210] w-14 h-14 rounded-full shadow-lg flex items-center justify-center touch-none"
      style={{
        left: pos.x,
        top: pos.y,
        background: colors.primary,
        color: '#fff',
        cursor: 'grab',
        boxShadow: '0 10px 28px rgba(15,23,42,0.35)',
      }}
      title="Open Messenger (drag to move)"
    >
      <MessageCircle size={24} />
      {unreadTotal > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center text-white pointer-events-none"
          style={{ background: colors.red || '#ef4444' }}
        >
          {unreadTotal > 99 ? '99+' : unreadTotal}
        </span>
      )}
    </button>,
    document.body,
  );
}

export default function MessengerWidget({
  colors,
  propertyId,
  currentUserId,
}: {
  colors: any;
  propertyId: string;
  currentUserId: string;
}) {
  if (!currentUserId) return null;
  return (
    <MessengerProvider propertyId={propertyId} currentUserId={currentUserId}>
      <MessengerFab colors={colors} />
      <MessengerPopup colors={colors} />
    </MessengerProvider>
  );
}
