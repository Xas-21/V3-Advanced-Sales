import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, UserPlus, UserMinus, Shield, ShieldOff, LogOut, Pencil, Image as ImageIcon,
  FileText, Link2, Copy, Trash2, BellOff, Bell, Pin, PinOff, Loader2, Search,
} from 'lucide-react';
import { uploadFileLocal, mediaUrl } from '../localUpload';
import {
  useMessenger,
  type ChatConversation,
  type ChatInviteLink,
  type ChatMediaItem,
  type ChatMessage,
  type ChatUser,
} from './MessengerContext';

function ChatAvatar({
  name,
  avatar,
  colors,
  size = 36,
}: {
  name: string;
  avatar?: string | null;
  colors: any;
  size?: number;
}) {
  const initials = (() => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  })();
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
        fontSize: Math.max(10, size * 0.36),
        background: colors.primaryDim,
        color: colors.primary,
        border: `1px solid ${colors.border}`,
      }}
    >
      {initials}
    </div>
  );
}

type Tab = 'members' | 'media' | 'search' | 'invite';

export default function GroupInfoPanel({
  colors,
  conversation,
  onClose,
  onJumpToMessage,
}: {
  colors: any;
  conversation: ChatConversation;
  onClose: () => void;
  onJumpToMessage?: (messageId: string) => void;
}) {
  const {
    currentUserId, messageableUsers,
    addParticipants, removeParticipant, setParticipantRole,
    updateConversation, updatePrefs,
    searchMessages, fetchMedia,
    listInviteLinks, createInviteLink, revokeInviteLink,
  } = useMessenger();

  const isGroup = conversation.type === 'group';
  const me = conversation.participants.find((p) => String(p.id) === String(currentUserId));
  const isAdmin = isGroup && (me?.role === 'admin' || conversation.myRole === 'admin');
  const [tab, setTab] = useState<Tab>('members');
  const [memberQ, setMemberQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editName, setEditName] = useState(conversation.name || '');
  const [editDesc, setEditDesc] = useState(conversation.description || '');
  const [editingProfile, setEditingProfile] = useState(false);
  const [media, setMedia] = useState<ChatMediaItem[]>([]);
  const [mediaKind, setMediaKind] = useState<'all' | 'image' | 'file'>('all');
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<ChatMessage[]>([]);
  const [searching, setSearching] = useState(false);
  const [links, setLinks] = useState<ChatInviteLink[]>([]);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditName(conversation.name || '');
    setEditDesc(conversation.description || '');
  }, [conversation.id, conversation.name, conversation.description]);

  useEffect(() => {
    if (tab !== 'media') return;
    void fetchMedia(conversation.id, mediaKind).then(setMedia);
  }, [tab, mediaKind, conversation.id, fetchMedia]);

  useEffect(() => {
    if (tab !== 'invite' || !isAdmin) return;
    void listInviteLinks(conversation.id).then(setLinks);
  }, [tab, isAdmin, conversation.id, listInviteLinks]);

  const members = useMemo(() => {
    const q = memberQ.toLowerCase().trim();
    return conversation.participants.filter((p) => {
      if (!q) return true;
      return (p.name || '').toLowerCase().includes(q) || (p.username || '').toLowerCase().includes(q);
    });
  }, [conversation.participants, memberQ]);

  const addable = useMemo(() => {
    const inGroup = new Set(conversation.participants.map((p) => String(p.id)));
    return messageableUsers.filter((u) => !inGroup.has(String(u.id)));
  }, [conversation.participants, messageableUsers]);

  const title = isGroup
    ? (conversation.name || 'Group')
    : (conversation.participants.find((p) => p.id !== currentUserId)?.name || conversation.name || 'Chat');

  const inputStyle = { background: colors.bg, borderColor: colors.border, color: colors.textMain };

  const saveProfile = async () => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      await updateConversation(conversation.id, {
        name: editName.trim(),
        description: editDesc.trim(),
      });
      setEditingProfile(false);
    } finally {
      setBusy(false);
    }
  };

  const uploadAvatar = async (files: FileList | null) => {
    if (!files?.[0] || !isAdmin) return;
    setBusy(true);
    try {
      const r = await uploadFileLocal(files[0], { folder: 'chat' });
      await updateConversation(conversation.id, { avatarUrl: r.secure_url });
    } finally {
      setBusy(false);
    }
  };

  const runSearch = useCallback(async () => {
    const q = searchQ.trim();
    if (!q) {
      setSearchHits([]);
      return;
    }
    setSearching(true);
    try {
      setSearchHits(await searchMessages(conversation.id, q));
    } finally {
      setSearching(false);
    }
  }, [conversation.id, searchMessages, searchQ]);

  const inviteUrl = (token: string) => {
    const u = new URL(window.location.href);
    u.searchParams.set('joinChat', token);
    return u.toString();
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  };

  return (
    <div
      className="absolute inset-y-0 right-0 w-[min(340px,100%)] z-20 flex flex-col border-l shadow-xl"
      style={{ background: colors.card, borderColor: colors.border }}
    >
      <div className="flex items-center justify-between px-3 py-3 border-b shrink-0" style={{ borderColor: colors.border, background: colors.bg }}>
        <div className="text-sm font-semibold" style={{ color: colors.textMain }}>
          {isGroup ? 'Group info' : 'Chat info'}
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg" style={{ color: colors.textMuted }}>
          <X size={16} />
        </button>
      </div>

      <div className="px-4 py-4 border-b space-y-3 shrink-0" style={{ borderColor: colors.border }}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!isAdmin || busy}
            onClick={() => isAdmin && fileRef.current?.click()}
            className="relative shrink-0"
            title={isAdmin ? 'Change photo' : undefined}
          >
            <ChatAvatar
              name={title}
              avatar={conversation.avatarUrl || (isGroup ? null : conversation.participants.find((p) => p.id !== currentUserId)?.avatar)}
              colors={colors}
              size={56}
            />
            {isAdmin && (
              <span
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: colors.primary, color: '#fff' }}
              >
                <Pencil size={10} />
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadAvatar(e.target.files); e.target.value = ''; }} />
          <div className="min-w-0 flex-1">
            {editingProfile && isAdmin ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none mb-1"
                style={inputStyle}
              />
            ) : (
              <div className="font-semibold text-sm truncate" style={{ color: colors.textMain }}>{title}</div>
            )}
            <div className="text-[11px]" style={{ color: colors.textMuted }}>
              {isGroup ? `${conversation.participants.length} members` : 'Direct message'}
            </div>
          </div>
        </div>

        {isGroup && (
          editingProfile && isAdmin ? (
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description"
              rows={2}
              className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none resize-none"
              style={inputStyle}
            />
          ) : conversation.description ? (
            <p className="text-xs leading-relaxed" style={{ color: colors.textMuted }}>{conversation.description}</p>
          ) : null
        )}

        {isGroup && isAdmin && (
          <div className="flex gap-2">
            {editingProfile ? (
              <>
                <button
                  type="button"
                  disabled={busy || !editName.trim()}
                  onClick={() => { void saveProfile(); }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                  style={{ background: colors.primary, color: '#fff' }}
                >
                  Save
                </button>
                <button type="button" onClick={() => setEditingProfile(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: colors.textMuted }}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditingProfile(true)}
                className="flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: colors.primary }}
              >
                <Pencil size={12} /> Edit name & description
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => { void updatePrefs(conversation.id, { muted: !conversation.muted }); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border"
            style={{ borderColor: colors.border, color: colors.textMain, background: colors.bg }}
          >
            {conversation.muted ? <Bell size={12} /> : <BellOff size={12} />}
            {conversation.muted ? 'Unmute' : 'Mute'}
          </button>
          <button
            type="button"
            onClick={() => { void updatePrefs(conversation.id, { pinned: !conversation.pinned }); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border"
            style={{ borderColor: colors.border, color: colors.textMain, background: colors.bg }}
          >
            {conversation.pinned ? <PinOff size={12} /> : <Pin size={12} />}
            {conversation.pinned ? 'Unpin' : 'Pin'}
          </button>
          {isGroup && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await removeParticipant(conversation.id, currentUserId);
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border"
              style={{ borderColor: colors.border, color: colors.red || '#ef4444', background: colors.bg }}
            >
              <LogOut size={12} /> Leave
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b shrink-0 text-[10px] font-semibold uppercase tracking-wider" style={{ borderColor: colors.border }}>
        {([
          ['members', 'Members'],
          ['media', 'Media'],
          ['search', 'Search'],
          ...(isGroup && isAdmin ? [['invite', 'Invite'] as const] : []),
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className="flex-1 py-2.5"
            style={{
              color: tab === id ? colors.primary : colors.textMuted,
              boxShadow: tab === id ? `inset 0 -2px 0 ${colors.primary}` : undefined,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {tab === 'members' && (
          <>
            <div className="relative mb-2">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: colors.textMuted }} />
              <input
                value={memberQ}
                onChange={(e) => setMemberQ(e.target.value)}
                placeholder="Search members"
                className="w-full pl-7 pr-2 py-2 rounded-lg border text-xs outline-none"
                style={inputStyle}
              />
            </div>

            {isGroup && isAdmin && (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => setAdding((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold mb-2"
                  style={{ color: colors.primary }}
                >
                  <UserPlus size={13} /> Add members
                </button>
                {adding && (
                  <div className="rounded-xl border p-2 space-y-1 max-h-36 overflow-y-auto" style={{ borderColor: colors.border, background: colors.bg }}>
                    {addable.length === 0 && (
                      <p className="text-[11px] px-1 py-2" style={{ color: colors.textMuted }}>No more users to add.</p>
                    )}
                    {addable.map((u: ChatUser) => (
                      <button
                        key={u.id}
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await addParticipants(conversation.id, [u.id]);
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-lg text-left text-xs"
                        style={{ color: colors.textMain }}
                      >
                        <ChatAvatar name={u.name || '?'} avatar={u.avatar} colors={colors} size={24} />
                        <span className="truncate">{u.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isGroup && !isAdmin && (
              <p className="text-[11px] mb-2" style={{ color: colors.textMuted }}>
                Only admins can add or remove members.
              </p>
            )}

            {members.map((p) => {
              const isMe = String(p.id) === String(currentUserId);
              const isPAdmin = p.role === 'admin';
              return (
                <div key={p.id} className="flex items-center gap-2 py-1.5">
                  <ChatAvatar name={p.name || '?'} avatar={p.avatar} colors={colors} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: colors.textMain }}>
                      {p.name}{isMe ? ' (you)' : ''}
                    </div>
                    {isPAdmin && (
                      <span className="text-[9px] font-semibold uppercase" style={{ color: colors.primary }}>Admin</span>
                    )}
                  </div>
                  {isGroup && isAdmin && !isMe && (
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        title={isPAdmin ? 'Dismiss admin' : 'Make admin'}
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await setParticipantRole(conversation.id, p.id, isPAdmin ? 'member' : 'admin');
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className="p-1.5 rounded-lg"
                        style={{ color: colors.textMuted }}
                      >
                        {isPAdmin ? <ShieldOff size={14} /> : <Shield size={14} />}
                      </button>
                      <button
                        type="button"
                        title="Remove"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await removeParticipant(conversation.id, p.id);
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className="p-1.5 rounded-lg"
                        style={{ color: colors.red || '#ef4444' }}
                      >
                        <UserMinus size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {tab === 'media' && (
          <>
            <div className="flex gap-1 mb-2">
              {(['all', 'image', 'file'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMediaKind(k)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase"
                  style={{
                    background: mediaKind === k ? colors.primaryDim : colors.bg,
                    color: mediaKind === k ? colors.primary : colors.textMuted,
                  }}
                >
                  {k === 'all' ? 'All' : k === 'image' ? 'Media' : 'Docs'}
                </button>
              ))}
            </div>
            {media.length === 0 && (
              <p className="text-xs text-center py-8" style={{ color: colors.textMuted }}>No shared files yet.</p>
            )}
            <div className="grid grid-cols-3 gap-1.5">
              {media.filter((m) => {
                const t = m.attachment?.type;
                return t === 'image' || t === 'video';
              }).map((m, i) => (
                <a
                  key={`${m.messageId}-${i}`}
                  href={mediaUrl(m.attachment?.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square rounded-lg overflow-hidden border"
                  style={{ borderColor: colors.border }}
                  onClick={(e) => {
                    if (onJumpToMessage) {
                      e.preventDefault();
                      onJumpToMessage(m.messageId);
                    }
                  }}
                >
                  {m.attachment?.type === 'image' ? (
                    <img src={mediaUrl(m.attachment.url)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: colors.bg, color: colors.primary }}>
                      <ImageIcon size={20} />
                    </div>
                  )}
                </a>
              ))}
            </div>
            <div className="space-y-1 mt-2">
              {media.filter((m) => m.attachment?.type !== 'image' && m.attachment?.type !== 'video').map((m, i) => (
                <a
                  key={`${m.messageId}-f-${i}`}
                  href={mediaUrl(m.attachment?.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-2 py-2 rounded-lg border text-xs"
                  style={{ borderColor: colors.border, color: colors.textMain, background: colors.bg }}
                >
                  <FileText size={14} style={{ color: colors.primary }} />
                  <span className="truncate flex-1">{m.attachment?.name || 'File'}</span>
                </a>
              ))}
            </div>
          </>
        )}

        {tab === 'search' && (
          <>
            <div className="flex gap-1.5">
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
                placeholder="Search in conversation"
                className="flex-1 px-2.5 py-2 rounded-lg border text-xs outline-none"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => { void runSearch(); }}
                className="px-3 rounded-lg text-xs font-semibold"
                style={{ background: colors.primary, color: '#fff' }}
              >
                {searching ? <Loader2 size={14} className="animate-spin" /> : 'Go'}
              </button>
            </div>
            {searchHits.length === 0 && searchQ.trim() && !searching && (
              <p className="text-xs text-center py-6" style={{ color: colors.textMuted }}>No matches.</p>
            )}
            {searchHits.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onJumpToMessage?.(m.id)}
                className="w-full text-left px-2.5 py-2 rounded-lg border"
                style={{ borderColor: colors.border, background: colors.bg }}
              >
                <div className="text-[10px] font-semibold mb-0.5" style={{ color: colors.primary }}>{m.senderName}</div>
                <div className="text-xs truncate" style={{ color: colors.textMain }}>{m.body || '(attachment)'}</div>
              </button>
            ))}
          </>
        )}

        {tab === 'invite' && isAdmin && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const link = await createInviteLink(conversation.id);
                  if (link) {
                    setLinks((prev) => [link, ...prev]);
                    await copyLink(link.token);
                  }
                } finally {
                  setBusy(false);
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold"
              style={{ background: colors.primary, color: '#fff' }}
            >
              <Link2 size={14} /> Create & copy invite link
            </button>
            {copied && <p className="text-[11px] text-center" style={{ color: colors.primary }}>Copied to clipboard</p>}
            <p className="text-[11px]" style={{ color: colors.textMuted }}>
              Recipients must be logged in and have access to this property.
            </p>
            {links.map((l) => (
              <div key={l.id} className="flex items-center gap-2 px-2 py-2 rounded-lg border" style={{ borderColor: colors.border, background: colors.bg }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono truncate" style={{ color: colors.textMuted }}>{l.token.slice(0, 18)}…</div>
                  <div className="text-[10px]" style={{ color: colors.textMuted }}>Uses: {l.useCount}{l.maxUses != null ? ` / ${l.maxUses}` : ''}</div>
                </div>
                <button type="button" onClick={() => { void copyLink(l.token); }} className="p-1.5 rounded-lg" style={{ color: colors.primary }}>
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (await revokeInviteLink(conversation.id, l.id)) {
                      setLinks((prev) => prev.filter((x) => x.id !== l.id));
                    }
                  }}
                  className="p-1.5 rounded-lg"
                  style={{ color: colors.red || '#ef4444' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
