import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { apiUrl } from './backendApi';
import {
    CRM_CARD_COMMENT_BODY_MAX,
    CRM_CARD_COMMENT_MAX,
    visibleCardComments,
    type CrmCardComment,
    type CrmCardCommentTargetType,
} from './crmCardComments';

type Colors = {
    textMain: string;
    textMuted: string;
    border: string;
    primary: string;
    bg?: string;
    card?: string;
};

type Props = {
    propertyId: string;
    targetType: CrmCardCommentTargetType;
    targetId: string;
    colors: Colors;
    /** When true, hide add/delete controls. */
    readOnly?: boolean;
};

function formatWhen(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || '—';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CrmCardComments({
    propertyId,
    targetType,
    targetId,
    colors,
    readOnly = false,
}: Props) {
    const pid = String(propertyId || '').trim();
    const tid = String(targetId || '').trim();
    const [comments, setComments] = useState<CrmCardComment[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [composing, setComposing] = useState(false);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!pid || !tid) return;
        let cancelled = false;
        setError('');
        const qs = new URLSearchParams({
            propertyId: pid,
            targetType,
            targetId: tid,
        });
        fetch(apiUrl(`/api/crm/card-comments?${qs}`), { credentials: 'include' })
            .then(async (res) => {
                if (!res.ok) throw new Error('Failed to load comments');
                return res.json();
            })
            .then((data) => {
                if (!cancelled) setComments(Array.isArray(data) ? data : []);
            })
            .catch(() => {
                if (!cancelled) setError('Could not load comments');
            });
        return () => {
            cancelled = true;
        };
    }, [pid, targetType, tid]);

    if (!pid || !tid) return null;

    const visible = visibleCardComments(comments, expanded);
    const canAdd = !readOnly && comments.length < CRM_CARD_COMMENT_MAX;
    const showViewAll = comments.length > 2;

    async function saveComment() {
        const body = draft.trim();
        if (!body || busy) return;
        if (body.length > CRM_CARD_COMMENT_BODY_MAX) {
            setError(`Max ${CRM_CARD_COMMENT_BODY_MAX} characters`);
            return;
        }
        setBusy(true);
        setError('');
        try {
            const res = await fetch(apiUrl('/api/crm/card-comments'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: pid, targetType, targetId: tid, body }),
            });
            if (!res.ok) {
                const detail = await res.json().catch(() => ({}));
                const raw = detail?.detail;
                const msg = Array.isArray(raw)
                    ? raw.map((d: any) => d?.msg || String(d)).join('; ')
                    : typeof raw === 'string'
                      ? raw
                      : 'Save failed';
                throw new Error(msg);
            }
            const created = (await res.json()) as CrmCardComment;
            setComments((prev) => [created, ...prev]);
            setDraft('');
            setComposing(false);
        } catch (e: any) {
            setError(String(e?.message || 'Save failed'));
        } finally {
            setBusy(false);
        }
    }

    async function removeComment(id: string) {
        if (readOnly || busy) return;
        setBusy(true);
        setError('');
        try {
            const qs = new URLSearchParams({ propertyId: pid });
            const res = await fetch(apiUrl(`/api/crm/card-comments/${encodeURIComponent(id)}?${qs}`), {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Delete failed');
            setComments((prev) => prev.filter((c) => c.id !== id));
        } catch {
            setError('Delete failed');
        } finally {
            setBusy(false);
        }
    }

    /** Parent kanban cards are HTML5-draggable; that swallows clicks on OK/input. */
    function pauseParentCardDrag(e: React.SyntheticEvent) {
        e.stopPropagation();
        const card = (e.currentTarget as HTMLElement).closest('[draggable="true"]') as HTMLElement | null;
        if (!card) return;
        card.setAttribute('draggable', 'false');
        const restore = () => {
            card.setAttribute('draggable', 'true');
            window.removeEventListener('pointerup', restore);
            window.removeEventListener('pointercancel', restore);
            window.removeEventListener('dragend', restore);
        };
        window.addEventListener('pointerup', restore);
        window.addEventListener('pointercancel', restore);
        window.addEventListener('dragend', restore);
    }

    return (
        <div
            data-crm-no-drag
            className="mt-2 pt-2 border-t space-y-1.5"
            style={{ borderColor: colors.border }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={pauseParentCardDrag}
            onPointerDown={pauseParentCardDrag}
        >
            {visible.map((c) => (
                <div key={c.id} className="flex items-start gap-1.5 text-[10px]">
                    <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap break-words" style={{ color: colors.textMain }}>
                            {c.body}
                        </p>
                        <p className="opacity-80 truncate" style={{ color: colors.textMuted }}>
                            {c.authorName || '—'} · {formatWhen(c.createdAt)}
                        </p>
                    </div>
                    {!readOnly ? (
                        <button
                            type="button"
                            title="Delete comment"
                            className="shrink-0 p-0.5 rounded opacity-60 hover:opacity-100"
                            style={{ color: colors.textMuted }}
                            disabled={busy}
                            onClick={() => void removeComment(c.id)}
                        >
                            <Trash2 size={12} />
                        </button>
                    ) : null}
                </div>
            ))}

            {showViewAll ? (
                <button
                    type="button"
                    className="text-[10px] font-medium underline-offset-2 hover:underline"
                    style={{ color: colors.primary }}
                    onClick={() => setExpanded((v) => !v)}
                >
                    {expanded ? 'Show less' : 'View all'}
                </button>
            ) : null}

            {composing ? (
                <div className="flex items-center gap-1">
                    <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value.slice(0, CRM_CARD_COMMENT_BODY_MAX))}
                        maxLength={CRM_CARD_COMMENT_BODY_MAX}
                        placeholder="Add comment…"
                        className="flex-1 min-w-0 px-1.5 py-1 rounded border text-[10px] outline-none"
                        style={{
                            backgroundColor: colors.bg || 'transparent',
                            borderColor: colors.border,
                            color: colors.textMain,
                        }}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void saveComment();
                            }
                        }}
                    />
                    <button
                        type="button"
                        className="px-1.5 py-1 rounded text-[10px] font-bold border"
                        style={{ borderColor: colors.border, color: colors.primary }}
                        disabled={busy || !draft.trim()}
                        onMouseDown={(e) => {
                            // Save on mousedown so kanban drag never steals the gesture.
                            e.preventDefault();
                            e.stopPropagation();
                            void saveComment();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                    >
                        {busy ? '…' : 'OK'}
                    </button>
                </div>
            ) : canAdd ? (
                <button
                    type="button"
                    title="Add comment"
                    className="inline-flex items-center justify-center p-0.5 rounded opacity-70 hover:opacity-100"
                    style={{ color: colors.textMuted }}
                    onClick={() => {
                        setComposing(true);
                        setError('');
                    }}
                >
                    <Plus size={14} />
                </button>
            ) : null}

            {error ? (
                <p className="text-[10px] font-medium" style={{ color: '#dc2626' }}>
                    {error}
                </p>
            ) : null}
        </div>
    );
}
