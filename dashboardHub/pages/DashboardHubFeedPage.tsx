import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, MessageCircle, Smile, Trash2, Image as ImageIcon, Loader2, Users, Search,
  Flame, Award, Heart, Sparkles, FileText, Video, Paperclip, CheckSquare, BarChart3,
  Calendar, MapPin, Plus, X, MoreHorizontal, Share2, Clock, TrendingUp, Circle, CheckCircle2, Pin,
} from 'lucide-react';
import { apiUrl } from '../../backendApi';
import { usePropertyLoadGate } from '../../propertyScopedLoad';
import { uploadFileLocal, mediaUrl } from '../../localUpload';
import { useHubData } from '../HubDataContext';
import { EmptyState, LoadingState, PropertyBadge } from '../analyticsKit';
import {
  RichTextEditor, RichContent, extractMentionIds, htmlToPlainText, type MentionUser,
} from '../richText';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👏', '💡', '✅'];
const POST_TYPES = [
  { id: 'message', label: 'Message', icon: MessageCircle },
  { id: 'task', label: 'Task', icon: CheckSquare },
  { id: 'poll', label: 'Poll', icon: BarChart3 },
  { id: 'event', label: 'Event', icon: Calendar },
] as const;
type PostType = typeof POST_TYPES[number]['id'];
type FeedFilter = 'all' | 'trending' | 'mine' | 'attachments' | 'mentioned';

type FeedAttachment = { url: string; publicId?: string | null; type: string; name?: string | null; bytes?: number };

type FeedComment = {
  id: string; body: string; bodyHtml?: string | null; mentions?: string[];
  authorUserId: string; authorName: string; authorAvatar?: string | null; createdAt: string | null;
};

type FeedPost = {
  id: string; authorUserId: string; authorName: string; authorRole?: string | null;
  authorAvatar?: string | null; propertyId?: string | null; postType: PostType;
  body: string; bodyHtml?: string | null; imageUrl?: string | null;
  attachments: FeedAttachment[]; mentions: string[]; hashtags: string[]; meta: any;
  createdAt: string | null; updatedAt?: string | null; comments: FeedComment[];
  reactionCounts: Record<string, number>; myReactions: string[];
  pinned?: boolean;
  pollResults?: {
    tallies: number[];
    total: number;
    myVote: number | null;
    voters?: { userId?: string; name: string; avatar?: string | null }[][];
  };
  eventRsvps?: { counts: { going: number; maybe: number; no: number }; myRsvp: string | null };
};

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function initials(name: string): string {
  return (name || '?').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function reactionTotal(p: FeedPost): number {
  return Object.values(p.reactionCounts).reduce((a, b) => a + b, 0);
}

/** Stable accent color for a user id, drawn from the active theme palette. */
function userAccent(idOrName: string, colors: any): string {
  const palette = [
    colors.primary, colors.blue, colors.green, colors.cyan,
    colors.orange, colors.purple, colors.yellow, colors.red,
  ].filter(Boolean) as string[];
  if (!palette.length) return colors.primary || '#3b82f6';
  let h = 0;
  const s = String(idOrName || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function withAlpha(hexOrRgba: string, alpha: number): string {
  const c = String(hexOrRgba || '').trim();
  if (c.startsWith('rgba(')) {
    return c.replace(/rgba?\(([^)]+)\)/, (_m, inner) => {
      const parts = String(inner).split(',').map((p: string) => p.trim());
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    });
  }
  if (c.startsWith('rgb(')) {
    const inner = c.slice(4, -1);
    return `rgba(${inner}, ${alpha})`;
  }
  const hex = c.replace('#', '');
  if (hex.length === 3 || hex.length === 6) {
    const full = hex.length === 3 ? hex.split('').map((x) => x + x).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return colorsFallbackDim(alpha);
}

function colorsFallbackDim(alpha: number): string {
  return `rgba(59, 130, 246, ${alpha})`;
}

const POST_TYPE_ACCENT: Record<PostType, (c: any) => string> = {
  message: (c) => c.blue || c.primary,
  task: (c) => c.green || c.primary,
  poll: (c) => c.purple || c.primary,
  event: (c) => c.orange || c.primary,
};

function userInProperty(u: any, pid: string): boolean {
  if (!pid) return true;
  if (String(u?.propertyId || '') === pid) return true;
  const ids = u?.property_ids || u?.assignedPropertyIds || [];
  return Array.isArray(ids) && ids.some((x: any) => String(x) === pid);
}

function attachmentKind(file: File): 'image' | 'video' | 'file' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

function Avatar({ name, avatar, colors, size = 40, accent }: {
  name: string; avatar?: string | null; colors: any; size?: number; accent?: string;
}) {
  const tone = accent || colors.primary;
  if (avatar) {
    return (
      <img src={avatar} alt="" className="rounded-full object-cover shrink-0"
        style={{
          width: size, height: size,
          boxShadow: `0 0 0 2px ${withAlpha(tone, 0.45)}`,
        }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold shrink-0 text-xs"
      style={{
        width: size, height: size,
        background: withAlpha(tone, 0.18),
        color: tone,
        boxShadow: `inset 0 0 0 1.5px ${withAlpha(tone, 0.45)}`,
      }}>
      {initials(name)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attachment gallery
// ---------------------------------------------------------------------------
function AttachmentGallery({ items, colors }: { items: FeedAttachment[]; colors: any }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {items.map((a, i) => {
        const href = mediaUrl(a.url);
        if (a.type === 'image') {
          return (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border max-w-full"
              style={{ borderColor: colors.border }}>
              <img src={href} alt={a.name || 'image'} className="max-h-72 object-cover" />
            </a>
          );
        }
        if (a.type === 'video') {
          return (
            <video key={i} src={href} controls className="rounded-lg max-h-72 max-w-full border" style={{ borderColor: colors.border }} />
          );
        }
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: colors.border, background: colors.bg, color: colors.textMain }}>
            <FileText size={16} style={{ color: colors.primary }} />
            <span className="truncate max-w-[180px]">{a.name || 'File'}</span>
          </a>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feed card
// ---------------------------------------------------------------------------
function FeedCard({
  post, colors, myId, isAdmin, mentionUsers = [], onReact, onComment, onDelete, onPin, onVote, onRsvp, onTaskToggle,
  highlight = false, autoOpenComments = false,
}: {
  post: FeedPost; colors: any; myId: string; isAdmin: boolean;
  mentionUsers?: MentionUser[];
  onReact: (postId: string, emoji: string) => void;
  onComment: (postId: string, body: string, bodyHtml: string, mentions: string[]) => Promise<void>;
  onDelete: (postId: string) => void;
  onPin: (postId: string) => void;
  onVote: (postId: string, idx: number) => void;
  onRsvp: (postId: string, status: string) => void;
  onTaskToggle: (postId: string) => void;
  highlight?: boolean;
  autoOpenComments?: boolean;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentHtml, setCommentHtml] = useState('');
  const [commentKey, setCommentKey] = useState(0);
  const [commenting, setCommenting] = useState(false);
  const canManage = post.authorUserId === myId || isAdmin;
  const canDelete = canManage;
  const typeLabel = POST_TYPES.find((t) => t.id === post.postType)?.label || 'Message';
  const typeAccent = POST_TYPE_ACCENT[post.postType]?.(colors) || colors.primary;
  const authorAccent = userAccent(post.authorUserId || post.authorName, colors);
  const task = post.meta?.task;
  const event = post.meta?.event;
  const poll = post.meta?.poll;

  useEffect(() => {
    if (autoOpenComments) setShowComments(true);
  }, [autoOpenComments]);

  const submitComment = async () => {
    const plain = htmlToPlainText(commentHtml);
    if (!plain) return;
    setCommenting(true);
    try {
      await onComment(post.id, plain, commentHtml, extractMentionIds(commentHtml));
      setCommentHtml('');
      setCommentKey((k) => k + 1);
    } finally {
      setCommenting(false);
    }
  };

  return (
    <article id={`feed-post-${post.id}`}
      className={`rounded-2xl border p-4 md:p-5 shadow-sm transition-shadow ${highlight ? 'ring-2 ring-offset-2' : ''}`}
      style={{
        background: colors.card,
        borderColor: highlight ? colors.primary : colors.border,
        boxShadow: highlight
          ? `0 0 0 3px ${colors.primaryDim}`
          : `0 8px 24px ${withAlpha(typeAccent, 0.08)}`,
        borderTopWidth: 3,
        borderTopColor: typeAccent,
      }}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar name={post.authorName} avatar={post.authorAvatar} colors={colors} accent={authorAccent} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: colors.textMain }}>{post.authorName}</span>
            {post.authorRole && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: withAlpha(authorAccent, 0.15), color: authorAccent }}>
                {post.authorRole}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full border font-medium"
              style={{ borderColor: withAlpha(typeAccent, 0.35), background: withAlpha(typeAccent, 0.12), color: typeAccent }}>
              {typeLabel}
            </span>
            {post.pinned && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: withAlpha(colors.yellow || colors.primary, 0.18), color: colors.yellow || colors.primary }}>
                <Pin size={10} /> Pinned
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: colors.textMuted }}>{timeAgo(post.createdAt)}</div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {canManage && (
            <button type="button" onClick={() => onPin(post.id)}
              className="p-1.5 rounded-lg opacity-70 hover:opacity-100"
              style={{ color: post.pinned ? (colors.yellow || colors.primary) : colors.textMuted }}
              title={post.pinned ? 'Unpin post' : 'Pin post to top'}>
              <Pin size={16} fill={post.pinned ? 'currentColor' : 'none'} />
            </button>
          )}
          {canDelete && (
            <button type="button" onClick={() => onDelete(post.id)} className="p-1.5 rounded-lg opacity-60 hover:opacity-100"
              style={{ color: colors.red || '#ef4444' }} title="Delete post">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="mt-3">
        {post.postType === 'task' && task && (
          <div className="flex items-start gap-3 mb-2">
            <button type="button" onClick={() => onTaskToggle(post.id)}
              className="mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0"
              style={{ borderColor: task.done ? colors.green : colors.border, background: task.done ? colors.green : 'transparent' }}>
              {task.done && <span className="text-white text-xs">✓</span>}
            </button>
            <div>
              <div className={`font-semibold ${task.done ? 'line-through opacity-60' : ''}`} style={{ color: colors.textMain }}>
                {task.title || post.body}
              </div>
              <div className="flex flex-wrap gap-3 mt-1 text-xs" style={{ color: colors.textMuted }}>
                {task.assigneeName && <span>Assigned: {task.assigneeName}</span>}
                {task.dueDate && <span className="flex items-center gap-1"><Clock size={12} />{task.dueDate}</span>}
                {task.priority && task.priority !== 'normal' && <span className="capitalize">{task.priority}</span>}
              </div>
            </div>
          </div>
        )}
        {post.postType === 'event' && event && (
          <div className="mb-2 p-3 rounded-xl border" style={{ borderColor: colors.border, background: colors.bg }}>
            <div className="font-semibold" style={{ color: colors.textMain }}>{event.title}</div>
            {event.location && (
              <div className="flex items-center gap-1.5 text-sm mt-1" style={{ color: colors.textMuted }}>
                <MapPin size={14} />{event.location}
              </div>
            )}
            {event.startAt && (
              <div className="flex items-center gap-1.5 text-sm mt-1" style={{ color: colors.textMuted }}>
                <Calendar size={14} />{new Date(event.startAt).toLocaleString()}
              </div>
            )}
          </div>
        )}
        {post.postType === 'poll' && poll && (
          <div className="mb-1 font-semibold text-base" style={{ color: colors.textMain }}>{poll.question || post.body}</div>
        )}
        {(post.bodyHtml || post.body) && post.postType !== 'task' && post.postType !== 'poll' && (
          <RichContent html={post.bodyHtml || post.body} colors={colors} className="text-sm leading-relaxed" />
        )}
        {post.postType === 'poll' && (post.bodyHtml || post.body) && htmlToPlainText(post.bodyHtml || post.body) !== (poll?.question || '') && (
          <RichContent html={post.bodyHtml || post.body} colors={colors} className="text-sm leading-relaxed mt-1 opacity-90" />
        )}
        {post.bodyHtml && post.postType === 'task' && !task?.title && (
          <RichContent html={post.bodyHtml} colors={colors} className="text-sm" />
        )}
        {post.imageUrl && (
          <a href={mediaUrl(post.imageUrl)} target="_blank" rel="noopener noreferrer" className="block mt-3 rounded-xl overflow-hidden border"
            style={{ borderColor: colors.border }}>
            <img src={mediaUrl(post.imageUrl)} alt="" className="max-h-80 w-full object-cover" />
          </a>
        )}
        <AttachmentGallery items={post.attachments} colors={colors} />
      </div>

      {/* Poll options */}
      {post.postType === 'poll' && poll?.options && (
        <div className="mt-3 space-y-2.5">
          {poll.options.map((opt: string, idx: number) => {
            const count = post.pollResults?.tallies?.[idx] || 0;
            const total = post.pollResults?.total || 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const voted = post.pollResults?.myVote === idx;
            const voters = post.pollResults?.voters?.[idx] || [];
            const barColor = voted ? colors.primary : (colors.blue || colors.primary);
            return (
              <div key={idx} className="rounded-xl border overflow-hidden"
                style={{
                  borderColor: voted ? colors.primary : colors.border,
                  background: voted ? withAlpha(colors.primary, 0.1) : colors.card,
                }}>
                <button type="button" onClick={() => onVote(post.id, idx)}
                  className="w-full text-left relative px-3 py-2.5 text-sm transition-colors">
                  <div className="absolute inset-y-0 left-0 transition-all"
                    style={{ width: `${pct}%`, background: withAlpha(barColor, voted ? 0.3 : 0.14) }} />
                  <div className="relative flex items-center gap-2.5">
                    <span className="shrink-0 flex items-center justify-center"
                      style={{ color: voted ? colors.primary : colors.textMuted }}>
                      {voted
                        ? <CheckCircle2 size={20} strokeWidth={2.25} fill={withAlpha(colors.primary, 0.15)} />
                        : <Circle size={20} strokeWidth={2} />}
                    </span>
                    <span className="font-medium flex-1 min-w-0" style={{ color: colors.textMain }}>{opt}</span>
                    <span className="text-xs font-semibold tabular-nums shrink-0"
                      style={{ color: voted ? colors.primary : colors.textMuted }}>
                      {count} · {pct}%
                    </span>
                  </div>
                </button>
                {voters.length > 0 && (
                  <div className="px-3 pt-2 pb-3 relative"
                    style={{ borderTop: `1px solid ${withAlpha(colors.border, 0.9)}` }}>
                    <div className="text-[9px] font-semibold uppercase tracking-wide mb-1.5"
                      style={{ color: colors.textMuted }}>
                      Voted by
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      {voters.map((v, vi) => {
                        const tone = userAccent(String(v.userId || v.name), colors);
                        return (
                          <div key={`${v.userId || v.name}-${vi}`}
                            className="inline-flex items-center gap-2"
                            title={v.name}>
                            <Avatar name={v.name} avatar={v.avatar} colors={colors} size={28} accent={tone} />
                            <span className="text-xs font-semibold" style={{ color: colors.textMain }}>
                              {v.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {(post.pollResults?.total || 0) > 0 && (
            <div className="text-[11px] font-medium" style={{ color: colors.textMuted }}>
              {post.pollResults?.total} vote{(post.pollResults?.total || 0) === 1 ? '' : 's'} total
            </div>
          )}
        </div>
      )}

      {/* Event RSVP */}
      {post.postType === 'event' && (
        <div className="flex flex-wrap gap-2 mt-3">
          {(['going', 'maybe', 'no'] as const).map((st) => {
            const active = post.eventRsvps?.myRsvp === st;
            const count = post.eventRsvps?.counts?.[st] || 0;
            return (
              <button key={st} type="button" onClick={() => onRsvp(post.id, st)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border capitalize transition-colors"
                style={{
                  borderColor: active ? colors.primary : colors.border,
                  background: active ? colors.primaryDim : 'transparent',
                  color: active ? colors.primary : colors.textMuted,
                }}>
                {st} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Reactions bar */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t flex-wrap" style={{ borderColor: colors.border }}>
        <div className="relative">
          <button type="button" onClick={() => setShowReactions((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border"
            style={{ borderColor: colors.border, color: colors.textMuted }}>
            <Smile size={14} /> React
          </button>
          {showReactions && (
            <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 p-1.5 rounded-xl border shadow-lg z-10"
              style={{ background: colors.card, borderColor: colors.border }}>
              {REACTION_EMOJIS.map((em) => (
                <button key={em} type="button" onClick={() => { onReact(post.id, em); setShowReactions(false); }}
                  className="text-lg hover:scale-125 transition-transform p-0.5">
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>
        {Object.entries(post.reactionCounts).filter(([, c]) => c > 0).map(([em, c]) => (
          <button key={em} type="button" onClick={() => onReact(post.id, em)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border"
            style={{
              borderColor: post.myReactions.includes(em) ? colors.primary : colors.border,
              background: post.myReactions.includes(em) ? colors.primaryDim : 'transparent',
              color: colors.textMain,
            }}>
            {em} {c}
          </button>
        ))}
        <button type="button" onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ml-auto"
          style={{ color: colors.textMuted }}>
          <MessageCircle size={14} /> {post.comments.length}
        </button>
        <button type="button" className="p-1.5 rounded-full" style={{ color: colors.textMuted }} title="Share">
          <Share2 size={14} />
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="mt-3 space-y-3">
          {post.comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <Avatar name={c.authorName} avatar={c.authorAvatar} colors={colors} size={28}
                accent={userAccent(c.authorUserId || c.authorName, colors)} />
              <div className="flex-1 rounded-xl px-3 py-2 text-sm"
                style={{
                  background: withAlpha(userAccent(c.authorUserId || c.authorName, colors), 0.08),
                  border: `1px solid ${withAlpha(userAccent(c.authorUserId || c.authorName, colors), 0.18)}`,
                }}>
                <div className="font-medium text-xs mb-0.5" style={{ color: userAccent(c.authorUserId || c.authorName, colors) }}>{c.authorName}</div>
                {c.bodyHtml ? <RichContent html={c.bodyHtml} colors={colors} /> : (
                  <div className="whitespace-pre-wrap" style={{ color: colors.textMain }}>{c.body}</div>
                )}
                <div className="text-[10px] mt-1" style={{ color: colors.textMuted }}>{timeAgo(c.createdAt)}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <div className="flex-1">
              <RichTextEditor key={commentKey} colors={colors} users={mentionUsers} compact suggestionsUp
                placeholder="Write a comment..." minHeight={48}
                onChange={setCommentHtml} />
            </div>
            <button type="button" disabled={commenting} onClick={submitComment}
              className="self-end px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: colors.primary, color: '#fff' }}>
              {commenting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Most Loved Post (right-rail widget)
// ---------------------------------------------------------------------------
function MostLovedPostWidget({
  post, colors, mentionUsers = [], onReact, onComment, onViewInFeed,
}: {
  post: FeedPost;
  colors: any;
  mentionUsers?: MentionUser[];
  onReact: (postId: string, emoji: string) => void;
  onComment: (postId: string, body: string, bodyHtml: string, mentions: string[]) => Promise<void>;
  onViewInFeed: (postId: string, openComments?: boolean) => void;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [commentHtml, setCommentHtml] = useState('');
  const [commenting, setCommenting] = useState(false);
  const preview = htmlToPlainText(post.bodyHtml) || post.body || '';

  const submitComment = async () => {
    const plain = htmlToPlainText(commentHtml);
    if (!plain) return;
    setCommenting(true);
    try {
      await onComment(post.id, plain, commentHtml, extractMentionIds(commentHtml));
      setCommentHtml('');
      setShowCommentBox(false);
    } finally {
      setCommenting(false);
    }
  };

  return (
    <div className="rounded-2xl border overflow-hidden"
      style={{
        background: colors.card,
        borderColor: colors.border,
        boxShadow: `0 8px 30px ${withAlpha(colors.primary, 0.12)}`,
      }}>
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h3 className="text-sm font-bold flex-1 tracking-tight" style={{ color: colors.textMain }}>Most Loved Post</h3>
        <span className="text-xl leading-none select-none" aria-hidden>❤️</span>
      </div>

      <button type="button" onClick={() => onViewInFeed(post.id)}
        className="w-full text-left mx-4 mb-3 rounded-xl border overflow-hidden transition-opacity hover:opacity-95"
        style={{
          width: 'calc(100% - 2rem)',
          background: colors.bg,
          borderColor: colors.border,
        }}>
        <div className="p-3">
          <div className="flex items-center gap-2.5 mb-2">
            <Avatar name={post.authorName} avatar={post.authorAvatar} colors={colors} size={34}
              accent={userAccent(post.authorUserId || post.authorName, colors)} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate" style={{ color: colors.textMain }}>{post.authorName}</div>
              <div className="text-[10px]" style={{ color: colors.textMuted }}>{timeAgo(post.createdAt)}</div>
            </div>
          </div>
          <p className="text-sm leading-snug line-clamp-3 min-h-[2.5rem]" style={{ color: colors.textMuted }}>
            {preview || 'View post in feed…'}
          </p>
          <div className="flex items-center gap-2 mt-2.5 text-xs font-medium" style={{ color: colors.textMuted }}>
            <span className="inline-flex items-center gap-1">
              <Heart size={13} className="shrink-0" fill={colors.red || '#ec4899'} stroke="none" style={{ color: colors.red || '#f43f5e' }} />
              {reactionTotal(post)}
            </span>
            <span className="opacity-60">·</span>
            <span>{post.comments.length} Comment{post.comments.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      </button>

      <div className="px-4 pb-4 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="relative">
            <button type="button" onClick={() => setShowReactions((v) => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs border font-medium"
              style={{ borderColor: colors.border, color: colors.textMuted, background: colors.bg }}>
              <Smile size={13} /> React
            </button>
            {showReactions && (
              <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 p-1.5 rounded-xl border shadow-lg z-20"
                style={{ background: colors.card, borderColor: colors.border }}>
                {REACTION_EMOJIS.map((em) => (
                  <button key={em} type="button"
                    onClick={() => { onReact(post.id, em); setShowReactions(false); }}
                    className="text-base hover:scale-110 transition-transform p-0.5 w-7 h-7 flex items-center justify-center">
                    {em}
                  </button>
                ))}
              </div>
            )}
          </div>
          {Object.entries(post.reactionCounts).filter(([, c]) => c > 0).map(([em, c]) => (
            <button key={em} type="button" onClick={() => onReact(post.id, em)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border"
              style={{
                borderColor: post.myReactions.includes(em) ? colors.primary : colors.border,
                background: post.myReactions.includes(em) ? colors.primaryDim : 'transparent',
                color: colors.textMain,
              }}>
              {em} {c}
            </button>
          ))}
          <button type="button" onClick={() => setShowCommentBox((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs ml-auto font-medium"
            style={{ color: colors.primary, background: colors.primaryDim }}>
            <MessageCircle size={13} /> Comment
          </button>
        </div>

        {showCommentBox && (
          <div className="flex gap-2 items-end">
            <div className="flex-1 min-w-0">
              <RichTextEditor colors={colors} users={mentionUsers} compact suggestionsUp
                placeholder="Write a comment…" minHeight={40}
                onChange={setCommentHtml} />
            </div>
            <button type="button" disabled={commenting} onClick={submitComment}
              className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
              style={{ background: colors.primary, color: '#fff' }}>
              {commenting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        )}

        <button type="button" onClick={() => onViewInFeed(post.id, true)}
          className="w-full text-center text-xs py-1.5 rounded-lg font-medium transition-opacity hover:opacity-80"
          style={{ color: colors.primary, background: colors.primaryDim }}>
          View full post in feed →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function DashboardHubFeedPage({ colors }: { colors: any }) {
  const { activeProperty, currentUser, feedLiveVersion, users, onlineUsers = [] } = useHubData();
  const propertyId = activeProperty?.id || '';
  const myId = String(currentUser?.id || '');
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // Composer state
  const [postType, setPostType] = useState<PostType>('message');
  const [bodyHtml, setBodyHtml] = useState('');
  const [attachments, setAttachments] = useState<FeedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollQuestion, setPollQuestion] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  // Remount clears contentEditable (uncontrolled); state alone does not.
  const [composerKey, setComposerKey] = useState(0);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const propertyUsers = useMemo((): MentionUser[] => {
    return (users || [])
      .filter((u: any) => userInProperty(u, propertyId))
      .map((u: any) => ({
        id: String(u.id), name: u.name || u.username, username: u.username, avatar: u.avatar, role: u.role,
      }));
  }, [users, propertyId]);

  const hashtagSuggestions = useMemo(() => {
    const tags: string[] = [];
    posts.forEach((p) => (p.hashtags || []).forEach((h) => { if (!tags.includes(h)) tags.push(h); }));
    return tags.slice(0, 20);
  }, [posts]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { begin: beginFeedLoad, isCurrent: isFeedLoadCurrent } = usePropertyLoadGate();

  const loadFeed = useCallback(async (opts?: { silent?: boolean }) => {
    if (!beginFeedLoad(propertyId)) {
      setPosts([]);
      if (!opts?.silent) setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: '80', offset: '0', filter });
      qs.set('property_id', propertyId);
      if (searchDebounced) qs.set('q', searchDebounced);
      const res = await fetch(apiUrl(`/api/feed?${qs.toString()}`), { credentials: 'include' });
      if (!res.ok) throw new Error(`Feed load failed (${res.status})`);
      const list = (await res.json()) as FeedPost[];
      if (!isFeedLoadCurrent(propertyId)) return;
      setPosts([...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)));
    } catch (e) {
      if (!isFeedLoadCurrent(propertyId)) return;
      setError(e instanceof Error ? e.message : 'Failed to load feed');
    } finally {
      if (!opts?.silent && isFeedLoadCurrent(propertyId)) setLoading(false);
    }
  }, [propertyId, filter, searchDebounced, beginFeedLoad, isFeedLoadCurrent]);

  useEffect(() => { void loadFeed(); }, [loadFeed]);

  const feedLiveMountRef = useRef(true);
  useEffect(() => {
    if (feedLiveMountRef.current) { feedLiveMountRef.current = false; return; }
    void loadFeed({ silent: true });
  }, [feedLiveVersion, loadFeed]);

  const uploadFiles = async (files: FileList | null, accept: 'image' | 'video' | 'file') => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const added: FeedAttachment[] = [];
      for (const file of Array.from(files).slice(0, 8)) {
        const result = await uploadFileLocal(file, { folder: 'feed' });
        added.push({
          url: result.secure_url,
          publicId: result.public_id,
          type: accept === 'file' ? attachmentKind(file) : accept,
          name: file.name,
          bytes: result.bytes,
        });
      }
      setAttachments((prev) => [...prev, ...added].slice(0, 12));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const resetComposer = () => {
    setBodyHtml('');
    setAttachments([]);
    setPollOptions(['', '']);
    setPollQuestion('');
    setTaskTitle('');
    setTaskAssignee('');
    setTaskDue('');
    setEventTitle('');
    setEventLocation('');
    setEventStart('');
    setPostType('message');
    setComposerKey((k) => k + 1);
  };

  const submitPost = async () => {
    const plain = htmlToPlainText(bodyHtml);
    const mentions = extractMentionIds(bodyHtml);
    let meta: any = {};
    if (postType === 'poll') {
      const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) { setError('Poll needs at least 2 options'); return; }
      const question = pollQuestion.trim() || plain || 'Poll';
      meta = { poll: { question, options: opts } };
    } else if (postType === 'task') {
      const assignee = propertyUsers.find((u) => u.id === taskAssignee);
      const title = taskTitle.trim() || plain;
      if (!title) { setError('Task needs a title'); return; }
      meta = {
        task: {
          title,
          assigneeUserId: taskAssignee || null,
          assigneeName: assignee?.name || null,
          dueDate: taskDue || null,
          priority: 'normal',
          done: false,
        },
      };
    } else if (postType === 'event') {
      if (!eventTitle.trim()) { setError('Event needs a title'); return; }
      meta = { event: { title: eventTitle.trim(), location: eventLocation.trim() || null, startAt: eventStart || null } };
    }
    if (!plain && !attachments.length && postType === 'message') return;

    setPosting(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/feed'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: plain,
          bodyHtml,
          postType,
          propertyId: propertyId || undefined,
          attachments,
          mentions,
          meta,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        const msg = typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d: any) => d?.msg || String(d)).join('; ')
            : `Post failed (${res.status})`;
        throw new Error(msg);
      }
      resetComposer();
      await loadFeed({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const toggleReaction = async (postId: string, emoji: string) => {
    setPosts((prev) => prev.map((p) => {
      if (p.id !== postId) return p;
      const mine = p.myReactions.includes(emoji);
      const counts = { ...p.reactionCounts };
      if (mine) {
        counts[emoji] = Math.max(0, (counts[emoji] || 0) - 1);
        if (counts[emoji] === 0) delete counts[emoji];
        return { ...p, reactionCounts: counts, myReactions: p.myReactions.filter((e) => e !== emoji) };
      }
      counts[emoji] = (counts[emoji] || 0) + 1;
      return { ...p, reactionCounts: counts, myReactions: [...p.myReactions, emoji] };
    }));
    try {
      await fetch(apiUrl(`/api/feed/${postId}/reactions`), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
    } catch { void loadFeed({ silent: true }); }
  };

  const addComment = async (postId: string, body: string, html: string, mentions: string[]) => {
    const res = await fetch(apiUrl(`/api/feed/${postId}/comments`), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, bodyHtml: html, mentions }),
    });
    if (!res.ok) throw new Error('Comment failed');
    await loadFeed({ silent: true });
  };

  const deletePost = async (postId: string) => {
    if (!window.confirm('Delete this post?')) return;
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    try {
      await fetch(apiUrl(`/api/feed/${postId}`), { method: 'DELETE', credentials: 'include' });
    } catch { void loadFeed({ silent: true }); }
  };

  const togglePin = async (postId: string) => {
    setPosts((prev) => {
      const next = prev.map((p) => (p.id === postId ? { ...p, pinned: !p.pinned } : p));
      return [...next].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
    });
    try {
      const res = await fetch(apiUrl(`/api/feed/${postId}/pin`), { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Pin failed');
      const data = await res.json();
      setPosts((prev) => {
        const next = prev.map((p) => (p.id === postId ? { ...p, pinned: !!data.pinned } : p));
        return [...next].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
      });
    } catch { void loadFeed({ silent: true }); }
  };

  const votePoll = async (postId: string, optionIndex: number) => {
    await fetch(apiUrl(`/api/feed/${postId}/poll/vote`), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionIndex }),
    });
    await loadFeed({ silent: true });
  };

  const rsvpEvent = async (postId: string, status: string) => {
    await fetch(apiUrl(`/api/feed/${postId}/event/rsvp`), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await loadFeed({ silent: true });
  };

  const toggleTask = async (postId: string) => {
    await fetch(apiUrl(`/api/feed/${postId}/task/toggle`), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    await loadFeed({ silent: true });
  };

  const viewPostInFeed = useCallback((postId: string, openComments = false) => {
    setHighlightPostId(postId);
    setOpenCommentsPostId(openComments ? postId : null);
    window.setTimeout(() => {
      document.getElementById(`feed-post-${postId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    window.setTimeout(() => setHighlightPostId(null), 3000);
  }, []);

  // Right-rail analytics
  const stats = useMemo(() => {
    const totalComments = posts.reduce((a, p) => a + p.comments.length, 0);
    const totalReactions = posts.reduce((a, p) => a + reactionTotal(p), 0);
    const contributors: Record<string, { name: string; count: number }> = {};
    posts.forEach((p) => {
      const k = p.authorUserId;
      if (!contributors[k]) contributors[k] = { name: p.authorName, count: 0 };
      contributors[k].count += 1 + p.comments.length + reactionTotal(p);
    });
    const topContributors = Object.values(contributors).sort((a, b) => b.count - a.count).slice(0, 5);
    const tagCounts: Record<string, number> = {};
    posts.forEach((p) => (p.hashtags || []).forEach((h) => { tagCounts[h] = (tagCounts[h] || 0) + 1; }));
    const trendingTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const mostLoved = [...posts].sort((a, b) => reactionTotal(b) - reactionTotal(a))[0];
    const myTasks = posts.filter((p) => p.postType === 'task' && (
      p.authorUserId === myId || p.meta?.task?.assigneeUserId === myId
    ));
    const taskStats = {
      ongoing: myTasks.filter((t) => !t.meta?.task?.done).length,
      done: myTasks.filter((t) => t.meta?.task?.done).length,
    };
    return { totalComments, totalReactions, topContributors, trendingTags, mostLoved, taskStats };
  }, [posts, myId]);

  const filterTabs: { id: FeedFilter; label: string; icon?: any }[] = [
    { id: 'all', label: 'All' },
    { id: 'trending', label: 'Trending', icon: Flame },
    { id: 'mine', label: 'My Posts' },
    { id: 'attachments', label: 'With Attachments', icon: Paperclip },
    { id: 'mentioned', label: 'Mentioned Me', icon: Users },
  ];

  const inputStyle = { background: colors.bg, borderColor: colors.border, color: colors.textMain };

  return (
    <div className="relative space-y-4 pb-8 -mx-1 px-1 rounded-3xl"
      style={{
        background: `radial-gradient(1200px 420px at 10% -10%, ${withAlpha(colors.primary, 0.14)}, transparent 55%),
                     radial-gradient(900px 360px at 95% 5%, ${withAlpha(colors.purple || colors.blue || colors.primary, 0.10)}, transparent 50%),
                     radial-gradient(700px 280px at 50% 100%, ${withAlpha(colors.cyan || colors.blue || colors.primary, 0.08)}, transparent 45%)`,
      }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl" style={{
            background: `linear-gradient(135deg, ${withAlpha(colors.primary, 0.25)}, ${withAlpha(colors.purple || colors.blue || colors.primary, 0.18)})`,
            boxShadow: `0 8px 20px ${withAlpha(colors.primary, 0.15)}`,
          }}>
            <Sparkles size={22} style={{ color: colors.primary }} />
          </div>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 flex-wrap" style={{ color: colors.textMain }}>
              Team Feed <PropertyBadge colors={colors} activeProperty={activeProperty} />
            </h2>
            <p className="text-sm" style={{ color: colors.textMuted }}>Share updates, tasks, polls and events with your team</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Posts', value: posts.length, icon: MessageCircle, tone: colors.blue || colors.primary },
            { label: 'Comments', value: stats.totalComments, icon: MessageCircle, tone: colors.cyan || colors.primary },
            { label: 'Reactions', value: stats.totalReactions, icon: Heart, tone: colors.red || colors.primary },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm"
              style={{
                borderColor: withAlpha(s.tone, 0.35),
                background: withAlpha(s.tone, 0.1),
                color: colors.textMain,
              }}>
              <s.icon size={14} style={{ color: s.tone }} />
              <span className="font-bold">{s.value}</span>
              <span style={{ color: colors.textMuted }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm border" style={{ background: 'rgba(239,68,68,0.1)', borderColor: colors.red, color: colors.red }}>
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Composer */}
          <div className="rounded-2xl border shadow-sm overflow-visible" style={{ background: colors.card, borderColor: colors.border }}>
            <div className="flex items-center gap-1 p-2 border-b overflow-x-auto rounded-t-2xl" style={{ borderColor: colors.border }}>
              {POST_TYPES.map((t) => {
                const Icon = t.icon;
                const active = postType === t.id;
                const tone = POST_TYPE_ACCENT[t.id](colors);
                return (
                  <button key={t.id} type="button" onClick={() => setPostType(t.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
                    style={{
                      background: active ? tone : withAlpha(tone, 0.1),
                      color: active ? '#fff' : tone,
                      boxShadow: active ? `0 4px 12px ${withAlpha(tone, 0.35)}` : 'none',
                    }}>
                    <Icon size={14} /> {t.label}
                  </button>
                );
              })}
              <button type="button" className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs ml-auto"
                style={{ color: colors.textMuted }} title="More post types coming soon">
                <MoreHorizontal size={14} /> More
              </button>
            </div>

            <div className="p-4">
              <div className="flex gap-3">
                <Avatar name={currentUser?.name || currentUser?.username || 'You'} avatar={currentUser?.avatar} colors={colors} />
                <div className="flex-1 space-y-3">
                  {postType === 'poll' && (
                    <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder="Poll question..." className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                      style={inputStyle} />
                  )}
                  {postType === 'task' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)}
                        placeholder="Task title..." className="px-3 py-2 rounded-lg border text-sm outline-none sm:col-span-2"
                        style={inputStyle} />
                      <select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)}
                        className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle}>
                        <option value="">Assign to...</option>
                        {propertyUsers.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                      <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)}
                        className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
                    </div>
                  )}
                  {postType === 'event' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)}
                        placeholder="Event title *" className="px-3 py-2 rounded-lg border text-sm outline-none sm:col-span-2"
                        style={inputStyle} />
                      <input value={eventLocation} onChange={(e) => setEventLocation(e.target.value)}
                        placeholder="Location" className="px-3 py-2 rounded-lg border text-sm outline-none"
                        style={inputStyle} />
                      <input type="datetime-local" value={eventStart} onChange={(e) => setEventStart(e.target.value)}
                        className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
                    </div>
                  )}
                  {postType === 'poll' && (
                    <div className="space-y-2">
                      {pollOptions.map((opt, i) => (
                        <div key={i} className="flex gap-2">
                          <input value={opt} onChange={(e) => {
                            const next = [...pollOptions];
                            next[i] = e.target.value;
                            setPollOptions(next);
                          }} placeholder={`Option ${i + 1}`}
                            className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
                          {pollOptions.length > 2 && (
                            <button type="button" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                              className="p-2 rounded-lg" style={{ color: colors.textMuted }}><X size={16} /></button>
                          )}
                        </div>
                      ))}
                      {pollOptions.length < 10 && (
                        <button type="button" onClick={() => setPollOptions([...pollOptions, ''])}
                          className="flex items-center gap-1 text-xs" style={{ color: colors.primary }}>
                          <Plus size={14} /> Add option
                        </button>
                      )}
                    </div>
                  )}

                  <RichTextEditor
                    key={composerKey}
                    colors={colors}
                    users={propertyUsers}
                    hashtagSuggestions={hashtagSuggestions}
                    suggestionsUp
                    placeholder="Write a message... Use @ to mention, # to tag"
                    onChange={setBodyHtml}
                  />

                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg border text-xs"
                          style={{ borderColor: colors.border, color: colors.textMuted }}>
                          {a.type === 'image' ? <ImageIcon size={12} /> : a.type === 'video' ? <Video size={12} /> : <FileText size={12} />}
                          <span className="truncate max-w-[120px]">{a.name || 'file'}</span>
                          <button type="button" onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}>
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
                        onChange={(e) => { void uploadFiles(e.target.files, 'image'); e.target.value = ''; }} />
                      <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden"
                        onChange={(e) => { void uploadFiles(e.target.files, 'video'); e.target.value = ''; }} />
                      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" multiple className="hidden"
                        onChange={(e) => { void uploadFiles(e.target.files, 'file'); e.target.value = ''; }} />
                      {[
                        { ref: imageInputRef, icon: ImageIcon, title: 'Image' },
                        { ref: videoInputRef, icon: Video, title: 'Video' },
                        { ref: fileInputRef, icon: Paperclip, title: 'File' },
                      ].map((btn) => (
                        <button key={btn.title} type="button" disabled={uploading}
                          onClick={() => (btn.ref as React.RefObject<HTMLInputElement>).current?.click()}
                          className="p-2 rounded-lg transition-colors disabled:opacity-50" title={btn.title}
                          style={{ color: colors.textMuted }}>
                          <btn.icon size={18} />
                        </button>
                      ))}
                      {uploading && <Loader2 size={16} className="animate-spin" style={{ color: colors.primary }} />}
                    </div>
                    <button type="button" disabled={posting || uploading} onClick={submitPost}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 shadow-sm"
                      style={{ background: colors.primary, color: '#fff' }}>
                      {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      Post
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="flex gap-1 flex-wrap">
              {filterTabs.map((tab) => {
                const Icon = tab.icon;
                const active = filter === tab.id;
                return (
                  <button key={tab.id} type="button" onClick={() => setFilter(tab.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                    style={{
                      borderColor: active ? colors.primary : colors.border,
                      background: active ? colors.primaryDim : 'transparent',
                      color: active ? colors.primary : colors.textMuted,
                    }}>
                    {Icon && <Icon size={12} />} {tab.label}
                  </button>
                );
              })}
            </div>
            <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textMuted }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search feed..." className="w-full pl-9 pr-3 py-2 rounded-xl border text-sm outline-none"
                style={inputStyle} />
            </div>
          </div>

          <div className="text-xs font-semibold tracking-wider uppercase" style={{ color: colors.textMuted }}>
            Recent Activity
          </div>

          {loading ? (
            <LoadingState colors={colors} text="Loading feed..." />
          ) : posts.length === 0 ? (
            <EmptyState colors={colors} icon={MessageCircle} text="No posts yet. Be the first to share something!" />
          ) : (
            <div className="space-y-4">
              {posts.map((p) => (
                <FeedCard key={p.id} post={p} colors={colors} myId={myId} isAdmin={isAdmin}
                  mentionUsers={propertyUsers}
                  highlight={highlightPostId === p.id}
                  autoOpenComments={openCommentsPostId === p.id}
                  onReact={toggleReaction} onComment={addComment} onDelete={deletePost} onPin={togglePin}
                  onVote={votePoll} onRsvp={rsvpEvent} onTaskToggle={toggleTask} />
              ))}
            </div>
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <RailCard title="Team Online" icon={Users} colors={colors}
            badge={onlineUsers.length > 0 ? (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: colors.green, color: '#fff' }}>{onlineUsers.length}</span>
            ) : undefined}>
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
              {onlineUsers.length === 0 ? (
                <p className="text-xs py-2" style={{ color: colors.textMuted }}>No team members online right now</p>
              ) : onlineUsers.map((u: any) => (
                <div key={u.id} className="flex items-center gap-2">
                  <div className="relative">
                    <Avatar name={u.name || ''} avatar={u.avatar} colors={colors} size={32}
                      accent={userAccent(String(u.id || u.name), colors)} />
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                      style={{ background: colors.green, borderColor: colors.card }} title="Online" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: colors.textMain }}>{u.name}</div>
                    {u.role && <div className="text-[10px] truncate" style={{ color: colors.textMuted }}>{u.role}</div>}
                  </div>
                </div>
              ))}
            </div>
          </RailCard>

          <RailCard title="My Tasks" icon={CheckSquare} colors={colors}>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Ongoing', value: stats.taskStats.ongoing, color: colors.blue },
                { label: 'Done', value: stats.taskStats.done, color: colors.green },
              ].map((s) => (
                <div key={s.label} className="rounded-xl p-3 text-center border" style={{ borderColor: colors.border }}>
                  <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-xs" style={{ color: colors.textMuted }}>{s.label}</div>
                </div>
              ))}
            </div>
          </RailCard>

          <RailCard title="Trending Topics" icon={TrendingUp} colors={colors}>
            {stats.trendingTags.length === 0 ? (
              <p className="text-xs" style={{ color: colors.textMuted }}>No hashtags yet</p>
            ) : (
              <div className="space-y-2">
                {stats.trendingTags.map(([tag, count], i) => (
                  <div key={tag} className="flex items-center gap-2 text-sm">
                    <span className="w-5 text-xs font-bold" style={{ color: colors.textMuted }}>{i + 1}</span>
                    <span className="font-medium" style={{ color: colors.purple || '#8b5cf6' }}>#{tag}</span>
                    <span className="text-xs ml-auto" style={{ color: colors.textMuted }}>{count} posts</span>
                  </div>
                ))}
              </div>
            )}
          </RailCard>

          <RailCard title="Top Contributors" icon={Award} colors={colors}>
            {stats.topContributors.length === 0 ? (
              <p className="text-xs" style={{ color: colors.textMuted }}>No activity yet</p>
            ) : (
              <div className="space-y-2">
                {stats.topContributors.map((c, i) => (
                  <div key={c.name + i} className="flex items-center gap-2">
                    <span className="w-5 text-xs font-bold" style={{ color: i === 0 ? colors.primary : colors.textMuted }}>{i + 1}</span>
                    <Avatar name={c.name} colors={colors} size={28} />
                    <span className="text-sm flex-1 truncate" style={{ color: colors.textMain }}>{c.name}</span>
                    <span className="text-xs" style={{ color: colors.textMuted }}>{c.count}</span>
                  </div>
                ))}
              </div>
            )}
          </RailCard>

          {stats.mostLoved && reactionTotal(stats.mostLoved) > 0 && (
            <MostLovedPostWidget
              post={posts.find((p) => p.id === stats.mostLoved!.id) || stats.mostLoved}
              colors={colors}
              mentionUsers={propertyUsers}
              onReact={toggleReaction}
              onComment={addComment}
              onViewInFeed={viewPostInFeed}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RailCard({ title, icon: Icon, colors, children, badge }: {
  title: string; icon: any; colors: any; children: React.ReactNode; badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border p-4" style={{ background: colors.card, borderColor: colors.border }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} style={{ color: colors.primary }} />
        <h3 className="text-sm font-semibold flex-1" style={{ color: colors.textMain }}>{title}</h3>
        {badge}
      </div>
      {children}
    </div>
  );
}
