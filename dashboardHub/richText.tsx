import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import DOMPurify from 'dompurify';
import {
    Bold, Italic, Underline, Strikethrough, Link2, List, ListOrdered,
    Palette, Highlighter, AtSign, Hash, RemoveFormatting,
} from 'lucide-react';

/* ------------------------------------------------------------------ *
 * Shared rich-text editor + safe renderer for Feed and Messenger.
 * - contentEditable + document.execCommand for formatting
 * - @mention autocomplete (inserts a non-editable chip carrying the user id)
 * - #hashtag autocomplete
 * - renderRichHtml(): DOMPurify-sanitized display, mentions/hashtags styled
 * ------------------------------------------------------------------ */

export type MentionUser = { id: string; name?: string; username?: string; avatar?: string; role?: string };

const ALLOWED_TAGS = [
    'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'a', 'br', 'p', 'span',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'div', 'mark',
];
const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'style', 'class', 'data-mention', 'data-hashtag'];

/** Sanitize an HTML fragment for safe display (defense-in-depth with backend bleach). */
export function sanitizeRichHtml(html: string | null | undefined): string {
    if (!html) return '';
    return DOMPurify.sanitize(String(html), {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    });
}

/** Extract mention user ids embedded as chips in the editor HTML. */
export function extractMentionIds(html: string | null | undefined): string[] {
    if (!html) return [];
    const ids = new Set<string>();
    const re = /data-mention="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) ids.add(m[1]);
    return Array.from(ids);
}

/** Best-effort plain text of an HTML fragment. */
export function htmlToPlainText(html: string | null | undefined): string {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = sanitizeRichHtml(html);
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

/** Strip forced text colors so theme `--rt-fg` can win (Messenger dark themes). */
export function stripForcedTextColors(html: string): string {
    if (!html) return '';
    return html.replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_all, quote: string, style: string) => {
        const kept = String(style)
            .split(';')
            .map((part) => part.trim())
            .filter((part) => {
                if (!part) return false;
                // Drop fg colors / fill that paint black-on-dark (or any forced color)
                return !/^(-webkit-text-fill-color|color)\s*:/i.test(part);
            })
            .join('; ');
        return kept ? ` style=${quote}${kept}${quote}` : '';
    });
}

/**
 * Renders sanitized rich HTML with mentions/hashtags visually highlighted.
 * Typed (non-chip) @tokens and #tokens in text are also styled.
 * `variant="chat"` forces readable theme text (overrides baked-in black/white inline colors).
 */
export function RichContent({
    html,
    colors,
    className,
    variant,
}: {
    html: string | null | undefined;
    colors: any;
    className?: string;
    variant?: 'default' | 'chat';
}) {
    const safe = useMemo(() => {
        let out = sanitizeRichHtml(html);
        if (variant === 'chat') out = stripForcedTextColors(out);
        // Style plain-text hashtags / mentions that are not already chips.
        out = out.replace(/(^|[\s>])#([A-Za-z0-9_-]{1,40})/g, (_all, pre, tag) =>
            `${pre}<span class="rt-hashtag">#${tag}</span>`);
        out = out.replace(/(^|[\s>])@([A-Za-z0-9_.\-]{2,40})(?![^<]*<\/span>)/g, (_all, pre, name) =>
            `${pre}<span class="rt-mention">@${name}</span>`);
        return out;
    }, [html, variant]);
    const fg = colors?.textMain || '#F8FAFC';
    return (
        <div
            className={`rt-content${variant === 'chat' ? ' rt-content--chat' : ''} ${className || ''}`.trim()}
            style={{
                color: fg,
                ['--rt-fg' as any]: fg,
                ['--rt-accent' as any]: colors?.primary || '#3b82f6',
            }}
            dangerouslySetInnerHTML={{ __html: safe }}
        />
    );
}

type Trigger = { kind: '@' | '#'; query: string; range: Range } | null;

export type RichTextEditorHandle = {
  insertText: (text: string) => void;
  focus: () => void;
  clear: () => void;
  setHtml: (html: string) => void;
};

export const RichTextEditor = forwardRef(function RichTextEditor({
  users = [],
  hashtagSuggestions = [],
  colors,
  placeholder = 'Write something...',
  minHeight = 96,
  onChange,
  autoFocus = false,
  compact = false,
  suggestionsUp = false,
  onEnterSend,
}: {
  users?: MentionUser[];
  hashtagSuggestions?: string[];
  colors: any;
  placeholder?: string;
  minHeight?: number;
  onChange: (html: string) => void;
  autoFocus?: boolean;
  compact?: boolean;
  /** Open @/# suggestion list above the editor (chat composer). */
  suggestionsUp?: boolean;
  /** Called when Enter is pressed without Shift (and no suggestion menu open). */
  onEnterSend?: () => void;
}, ref: React.Ref<RichTextEditorHandle>) {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const [trigger, setTrigger] = useState<Trigger>(null);
    const [activeIdx, setActiveIdx] = useState(0);
    const [isEmpty, setIsEmpty] = useState(true);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    setIsEmpty(!el.textContent?.trim() && !el.querySelector('img,[data-mention]'));
    onChange(html);
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      try { document.execCommand('insertText', false, text); } catch { /* noop */ }
      emitChange();
    },
    focus: () => editorRef.current?.focus(),
    clear: () => {
      const el = editorRef.current;
      if (!el) return;
      el.innerHTML = '';
      setIsEmpty(true);
      setTrigger(null);
      onChange('');
    },
    setHtml: (html: string) => {
      const el = editorRef.current;
      if (!el) return;
      el.innerHTML = html || '';
      setIsEmpty(!el.textContent?.trim() && !el.querySelector('img,[data-mention]'));
      onChange(el.innerHTML);
    },
  }), [emitChange, onChange]);

    useEffect(() => {
        if (autoFocus) editorRef.current?.focus();
    }, [autoFocus]);

    const exec = useCallback((cmd: string, value?: string) => {
        editorRef.current?.focus();
        try { document.execCommand(cmd, false, value); } catch { /* noop */ }
        emitChange();
    }, [emitChange]);

    // Detect an @/# trigger token immediately before the caret.
    const detectTrigger = useCallback(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) { setTrigger(null); return; }
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (node.nodeType !== Node.TEXT_NODE) { setTrigger(null); return; }
        const text = (node.textContent || '').slice(0, range.startOffset);
        const m = /(^|\s)([@#])([A-Za-z0-9_.\-]*)$/.exec(text);
        if (!m) { setTrigger(null); return; }
        const tokenStart = range.startOffset - (m[2].length + m[3].length);
        const tRange = document.createRange();
        tRange.setStart(node, Math.max(0, tokenStart));
        tRange.setEnd(node, range.startOffset);
        setTrigger({ kind: m[2] as '@' | '#', query: m[3], range: tRange });
        setActiveIdx(0);
    }, []);

    const suggestions = useMemo(() => {
        if (!trigger) return [] as { id: string; label: string; sub?: string }[];
        const q = trigger.query.toLowerCase();
        if (trigger.kind === '@') {
            return users
                .filter((u) => {
                    const n = (u.name || '').toLowerCase();
                    const un = (u.username || '').toLowerCase();
                    return !q || n.includes(q) || un.includes(q);
                })
                .slice(0, 40)
                .map((u) => ({ id: u.id, label: u.name || u.username || 'User', sub: u.username ? `@${u.username}` : u.role }));
        }
        const tags = Array.from(new Set(hashtagSuggestions.map((t) => t.replace(/^#/, '').toLowerCase())));
        const filtered = (q ? tags.filter((t) => t.includes(q)) : tags).slice(0, 20).map((t) => ({ id: t, label: `#${t}` }));
        if (q && !filtered.some((f) => f.id === q)) filtered.unshift({ id: q, label: `#${q}` });
        return filtered;
    }, [trigger, users, hashtagSuggestions]);

    const applySuggestion = useCallback((s: { id: string; label: string }) => {
        if (!trigger) return;
        const el = editorRef.current;
        if (!el) return;
        const sel = window.getSelection();
        if (!sel) return;
        trigger.range.deleteContents();

        if (trigger.kind === '@') {
            const chip = document.createElement('span');
            chip.setAttribute('data-mention', s.id);
            chip.setAttribute('contenteditable', 'false');
            chip.className = 'rt-mention-chip';
            chip.textContent = `@${s.label}`;
            trigger.range.insertNode(chip);
            const space = document.createTextNode('\u00A0');
            chip.after(space);
            const r = document.createRange();
            r.setStartAfter(space);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        } else {
            const textNode = document.createTextNode(`#${s.id} `);
            trigger.range.insertNode(textNode);
            const r = document.createRange();
            r.setStartAfter(textNode);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        }
        setTrigger(null);
        emitChange();
    }, [trigger, emitChange]);

    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (trigger && suggestions.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => (i + 1) % suggestions.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applySuggestion(suggestions[activeIdx]); return; }
            if (e.key === 'Escape') { setTrigger(null); return; }
            return;
        }
        // Enter sends (Shift+Enter keeps a newline) when a send handler is provided.
        if (onEnterSend && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onEnterSend();
        }
    }, [trigger, suggestions, activeIdx, applySuggestion, onEnterSend]);

    const btn = (title: string, Icon: any, onClick: () => void) => (
        <button
            type="button"
            title={title}
            onMouseDown={(e) => { e.preventDefault(); onClick(); }}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: colors?.textMuted }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = colors?.primaryDim || 'rgba(0,0,0,0.05)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
            <Icon size={15} />
        </button>
    );

    const colorRef = useRef<HTMLInputElement | null>(null);
    const hlRef = useRef<HTMLInputElement | null>(null);

    return (
        <div className="relative">
            {!compact && (
                <div
                    className="flex items-center gap-0.5 flex-wrap px-1.5 py-1 rounded-t-lg border-b"
                    style={{ borderColor: colors?.border, background: colors?.bg }}
                >
                    {btn('Bold', Bold, () => exec('bold'))}
                    {btn('Italic', Italic, () => exec('italic'))}
                    {btn('Underline', Underline, () => exec('underline'))}
                    {btn('Strikethrough', Strikethrough, () => exec('strikeThrough'))}
                    <span className="w-px h-4 mx-1" style={{ background: colors?.border }} />
                    <button type="button" title="Text color"
                        onMouseDown={(e) => { e.preventDefault(); colorRef.current?.click(); }}
                        className="p-1.5 rounded-md" style={{ color: colors?.textMuted }}>
                        <Palette size={15} />
                    </button>
                    <input ref={colorRef} type="color" className="sr-only"
                        onChange={(e) => exec('foreColor', e.target.value)} />
                    <button type="button" title="Highlight"
                        onMouseDown={(e) => { e.preventDefault(); hlRef.current?.click(); }}
                        className="p-1.5 rounded-md" style={{ color: colors?.textMuted }}>
                        <Highlighter size={15} />
                    </button>
                    <input ref={hlRef} type="color" className="sr-only"
                        onChange={(e) => exec('hiliteColor', e.target.value)} />
                    <span className="w-px h-4 mx-1" style={{ background: colors?.border }} />
                    {btn('Bulleted list', List, () => exec('insertUnorderedList'))}
                    {btn('Numbered list', ListOrdered, () => exec('insertOrderedList'))}
                    {btn('Link', Link2, () => { const url = window.prompt('Link URL (https://):'); if (url) exec('createLink', url); })}
                    <span className="w-px h-4 mx-1" style={{ background: colors?.border }} />
                    {btn('Mention (@)', AtSign, () => exec('insertText', '@'))}
                    {btn('Hashtag (#)', Hash, () => exec('insertText', '#'))}
                    {btn('Clear formatting', RemoveFormatting, () => exec('removeFormat'))}
                </div>
            )}
            <div className="relative">
                <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-multiline="true"
                    onInput={() => { emitChange(); detectTrigger(); }}
                    onKeyUp={detectTrigger}
                    onClick={detectTrigger}
                    onKeyDown={onKeyDown}
                    onBlur={() => setTimeout(() => setTrigger(null), 150)}
                    className={`rt-editor w-full outline-none overflow-y-auto ${compact ? 'px-3 py-2 rounded-lg border' : 'px-3 py-2.5 rounded-b-lg'}`}
                    style={{
                        minHeight,
                        maxHeight: compact ? 140 : 260,
                        color: colors?.textMain,
                        background: colors?.card,
                        borderColor: compact ? colors?.border : undefined,
                        ['--rt-accent' as any]: colors?.primary || '#3b82f6',
                    }}
                />
                {isEmpty && (
                    <div className="absolute top-2.5 left-3 pointer-events-none text-sm" style={{ color: colors?.textMuted }}>
                        {placeholder}
                    </div>
                )}
                {/* Anchored to the text field only (not the toolbar) so "up" stays under the format bar. */}
                {trigger && suggestions.length > 0 && (
                    <div
                        className="absolute z-[80] w-72 max-h-48 overflow-y-auto rounded-xl border shadow-2xl custom-scrollbar"
                        style={{
                            background: colors?.card,
                            borderColor: colors?.border,
                            left: 8,
                            right: 8,
                            width: 'auto',
                            maxWidth: 320,
                            ...(suggestionsUp
                                ? { bottom: '100%', marginBottom: 6 }
                                : { top: '100%', marginTop: 4 }),
                        }}
                    >
                        {suggestions.map((s, i) => (
                            <button
                                key={s.id + i}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
                                style={{ background: i === activeIdx ? (colors?.primaryDim || 'rgba(0,0,0,0.06)') : 'transparent', color: colors?.textMain }}
                            >
                                {trigger.kind === '@' ? (
                                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                    style={{ background: colors?.primaryDim, color: colors?.primary }}>
                                    {(s.label || '?').split(' ').map((p: string) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                                  </span>
                                ) : <Hash size={14} style={{ color: colors?.primary }} />}
                                <span className="font-medium truncate flex-1">{s.label}</span>
                                {(s as any).sub && <span className="text-xs truncate shrink-0" style={{ color: colors?.textMuted }}>{(s as any).sub}</span>}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});
