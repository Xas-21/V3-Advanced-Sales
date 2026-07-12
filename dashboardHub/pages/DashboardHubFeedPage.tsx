import React, { useCallback, useEffect, useState } from 'react';
import {
  Send,
  MessageCircle,
  Smile,
  Trash2,
  Image as ImageIcon,
  Loader2,
  Users,
} from 'lucide-react';
import { apiUrl } from '../../backendApi';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👏', '💡', '✅'];

type FeedComment = {
  id: string;
  body: string;
  authorUserId: string;
  authorName: string;
  createdAt: string | null;
};

type FeedPost = {
  id: string;
  authorUserId: string;
  authorName: string;
  authorRole?: string | null;
  propertyId?: string | null;
  body: string;
  imageUrl?: string | null;
  createdAt: string | null;
  updatedAt?: string | null;
  comments: FeedComment[];
  reactionCounts: Record<string, number>;
  myReactions: string[];
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
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function DashboardHubFeedPage({ colors }: { colors: any }) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState('');
  const [composerImage, setComposerImage] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/feed?limit=50&offset=0'), {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Feed load failed (${res.status})`);
      const data = (await res.json()) as FeedPost[];
      setPosts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const submitPost = useCallback(async () => {
    const body = composer.trim();
    if (!body && !composerImage.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/feed'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body, imageUrl: composerImage.trim() || null }),
      });
      if (!res.ok) throw new Error(`Post failed (${res.status})`);
      const created = (await res.json()) as FeedPost;
      setPosts((prev) => [created, ...prev]);
      setComposer('');
      setComposerImage('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post');
    } finally {
      setPosting(false);
    }
  }, [composer, composerImage]);

  const toggleReaction = useCallback(async (post: FeedPost, emoji: string) => {
    const already = post.myReactions.includes(emoji);
    // optimistic update
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== post.id) return p;
        const my = already
          ? p.myReactions.filter((e) => e !== emoji)
          : [...p.myReactions, emoji];
        const counts = { ...p.reactionCounts };
        counts[emoji] = Math.max(0, (counts[emoji] || 0) + (already ? -1 : 1));
        return { ...p, myReactions: my, reactionCounts: counts };
      }),
    );
    try {
      const res = await fetch(apiUrl(`/api/feed/${post.id}/reactions`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error();
    } catch {
      await loadFeed();
    }
  }, [loadFeed]);

  const addComment = useCallback(
    async (post: FeedPost, text: string) => {
      const body = text.trim();
      if (!body) return;
      try {
        const res = await fetch(apiUrl(`/api/feed/${post.id}/comments`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ body }),
        });
        if (!res.ok) throw new Error();
        const c = (await res.json()) as FeedComment;
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id ? { ...p, comments: [...p.comments, c] } : p,
          ),
        );
      } catch {
        await loadFeed();
      }
    },
    [loadFeed],
  );

  const deletePost = useCallback(
    async (post: FeedPost) => {
      try {
        const res = await fetch(apiUrl(`/api/feed/${post.id}`), {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) throw new Error();
        setPosts((prev) => prev.filter((p) => p.id !== post.id));
      } catch {
        await loadFeed();
      }
    },
    [loadFeed],
  );

  const totalReactions = posts.reduce(
    (sum, p) => sum + Object.values(p.reactionCounts).reduce((a, b) => a + b, 0),
    0,
  );
  const totalComments = posts.reduce((sum, p) => sum + p.comments.length, 0);

  return (
    <div
      className="mx-auto max-w-3xl w-full px-3 py-3"
      style={{ backgroundColor: colors.bg }}
    >
      {/* Header + stats */}
      <div
        className="rounded-2xl p-3 mb-3 border flex items-center gap-3 flex-wrap"
        style={{ backgroundColor: colors.card, borderColor: colors.border }}
      >
        <div
          className="w-10 h-10 rounded-xl grid place-items-center"
          style={{ backgroundColor: `${colors.primary}22`, color: colors.primary }}
        >
          <Users size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg" style={{ color: colors.textMain }}>
            Staff Feed
          </div>
          <div className="text-xs" style={{ color: colors.textMuted }}>
            Posts, updates & shout-outs across the team
          </div>
        </div>
        <div className="flex gap-2">
          <Stat colors={colors} label="Posts" value={posts.length} />
          <Stat colors={colors} label="Comments" value={totalComments} />
          <Stat colors={colors} label="Reactions" value={totalReactions} />
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl p-2 mb-3 text-sm"
          style={{ backgroundColor: `${colors.red}1a`, color: colors.red }}
        >
          {error}
        </div>
      )}

      {/* Composer */}
      <div
        className="rounded-2xl p-3 mb-3 border"
        style={{ backgroundColor: colors.card, borderColor: colors.border }}
      >
        <textarea
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          placeholder="Share an update, a win, or a question with the team…"
          rows={3}
          className="w-full bg-transparent resize-none outline-none text-sm"
          style={{ color: colors.textMain }}
        />
        {composerImage.trim() && (
          <div className="relative mb-2">
            <img
              src={composerImage.trim()}
              alt="attach"
              className="rounded-xl max-h-48 object-cover w-full"
            />
            <button
              type="button"
              onClick={() => setComposerImage('')}
              className="absolute top-1 right-1 rounded-full p-1"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 justify-between">
          <button
            type="button"
            onClick={() => {
              const url = window.prompt('Image URL (https):');
              if (url) setComposerImage(url.trim());
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
            style={{ color: colors.textMuted, border: `1px solid ${colors.border}` }}
          >
            <ImageIcon size={14} /> Attach image
          </button>
          <button
            type="button"
            onClick={() => void submitPost()}
            disabled={posting || (!composer.trim() && !composerImage.trim())}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold disabled:opacity-40"
            style={{ backgroundColor: colors.primary, color: '#000' }}
          >
            {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Post
          </button>
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex justify-center py-10" style={{ color: colors.textMuted }}>
          <Loader2 className="animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div
          className="rounded-2xl p-6 text-center text-sm border"
          style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.textMuted }}
        >
          No posts yet. Be the first to share something with the team!
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <FeedCard
              key={post.id}
              post={post}
              colors={colors}
              onReact={toggleReaction}
              onComment={addComment}
              onDelete={deletePost}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ colors, label, value }: { colors: any; label: string; value: number }) {
  return (
    <div
      className="rounded-xl px-3 py-1.5 text-center"
      style={{ backgroundColor: `${colors.primary}14`, border: `1px solid ${colors.border}` }}
    >
      <div className="font-bold text-base" style={{ color: colors.textMain }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: colors.textMuted }}>
        {label}
      </div>
    </div>
  );
}

function FeedCard({
  post,
  colors,
  onReact,
  onComment,
  onDelete,
}: {
  post: FeedPost;
  colors: any;
  onReact: (p: FeedPost, e: string) => void;
  onComment: (p: FeedPost, text: string) => void;
  onDelete: (p: FeedPost) => void;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);

  const hasReaction = Object.values(post.reactionCounts).some((v) => v > 0);

  return (
    <div
      className="rounded-2xl p-3 border"
      style={{ backgroundColor: colors.card, borderColor: colors.border }}
    >
      {/* author */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-9 h-9 rounded-full grid place-items-center font-bold text-sm"
          style={{ backgroundColor: `${colors.primary}22`, color: colors.primary }}
        >
          {initials(post.authorName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm" style={{ color: colors.textMain }}>
            {post.authorName}
            {post.authorRole && (
              <span
                className="ml-2 px-1.5 py-px rounded text-[9px] font-bold uppercase"
                style={{ backgroundColor: `${colors.blue}22`, color: colors.blue }}
              >
                {post.authorRole}
              </span>
            )}
          </div>
          <div className="text-[11px]" style={{ color: colors.textMuted }}>
            {timeAgo(post.createdAt)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onDelete(post)}
          className="p-1 rounded-lg"
          style={{ color: colors.textMuted }}
          title="Delete post"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* body */}
      {post.body && (
        <div className="text-sm mb-2 whitespace-pre-wrap" style={{ color: colors.textMain }}>
          {post.body}
        </div>
      )}
      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt="post"
          className="rounded-xl w-full max-h-80 object-cover mb-2"
        />
      )}

      {/* reactions summary */}
      {hasReaction && (
        <div className="flex flex-wrap gap-1 mb-2">
          {Object.entries(post.reactionCounts)
            .filter(([, v]) => v > 0)
            .map(([emoji, count]) => (
              <span
                key={emoji}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                style={{ backgroundColor: `${colors.primary}14`, color: colors.textMain }}
              >
                {emoji} {count}
              </span>
            ))}
        </div>
      )}

      {/* actions */}
      <div className="flex items-center gap-1 relative">
        <button
          type="button"
          onMouseEnter={() => setShowReactions(true)}
          onMouseLeave={() => setShowReactions(false)}
          onClick={() => setShowReactions((s) => !s)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
          style={{ color: colors.textMuted, border: `1px solid ${colors.border}` }}
        >
          <Smile size={14} /> React
        </button>
        <button
          type="button"
          onClick={() => setShowComments((s) => !s)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
          style={{ color: colors.textMuted, border: `1px solid ${colors.border}` }}
        >
          <MessageCircle size={14} /> {post.comments.length}
        </button>

        {showReactions && (
          <div
            className="absolute z-20 bottom-9 left-0 flex gap-1 p-1.5 rounded-xl shadow-lg"
            style={{ backgroundColor: colors.card, border: `1px solid ${colors.border}` }}
            onMouseEnter={() => setShowReactions(true)}
            onMouseLeave={() => setShowReactions(false)}
          >
            {REACTION_EMOJIS.map((emoji) => {
              const active = post.myReactions.includes(emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReact(post, emoji);
                    setShowReactions(false);
                  }}
                  className="text-lg px-1 rounded-lg transition-transform hover:scale-125"
                  style={{
                    backgroundColor: active ? `${colors.primary}33` : 'transparent',
                  }}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* comments */}
      {showComments && (
        <div className="mt-2 pt-2 border-t" style={{ borderColor: colors.border }}>
          {post.comments.map((c) => (
            <div key={c.id} className="flex gap-2 py-1">
              <div
                className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold shrink-0"
                style={{ backgroundColor: `${colors.primary}22`, color: colors.primary }}
              >
                {initials(c.authorName)}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold" style={{ color: colors.textMain }}>
                  {c.authorName}
                </span>{' '}
                <span className="text-xs" style={{ color: colors.textMain }}>
                  {c.body}
                </span>
                <div className="text-[10px]" style={{ color: colors.textMuted }}>
                  {timeAgo(c.createdAt)}
                </div>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void onComment(post, commentText);
                  setCommentText('');
                }
              }}
              placeholder="Write a comment…"
              className="flex-1 px-2 py-1 rounded-lg text-xs outline-none"
              style={{
                backgroundColor: colors.bg,
                border: `1px solid ${colors.border}`,
                color: colors.textMain,
              }}
            />
            <button
              type="button"
              onClick={() => {
                void onComment(post, commentText);
                setCommentText('');
              }}
              className="p-1.5 rounded-lg"
              style={{ backgroundColor: colors.primary, color: '#000' }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
