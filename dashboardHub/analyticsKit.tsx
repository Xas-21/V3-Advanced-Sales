import React, { useMemo } from 'react';
import { Building2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useHubPageEnter } from './hubMotion';

export { useHubPageEnter };

/* ============================== color helpers ============================== */

/** High-contrast foreground for text on a solid theme hex background (Luxury / Light / Desert). */
export function contrastOn(bgHex: string): string {
    if (!bgHex || typeof bgHex !== 'string') return '#111827';
    let h = bgHex.startsWith('#') ? bgHex.slice(1) : bgHex;
    if (h.length === 8) h = h.slice(0, 6);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return '#111827';
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.45 ? '#111827' : '#f9fafb';
}

export function hexA(hex: string, a: string): string {
    if (!hex) return 'rgba(148,163,184,0.14)';
    if (hex.startsWith('#')) {
        let h = hex.slice(1);
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        if (h.length === 6) return `#${h}${a}`;
    }
    return hex;
}

export function palette(colors: any): string[] {
    return [
        colors.blue, colors.green, colors.purple, colors.orange,
        colors.yellow, colors.cyan || colors.blue, colors.red, colors.primary,
    ].filter(Boolean);
}

/* ============================== number helpers ============================= */
export function num(v: any): number {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v == null) return 0;
    const m = String(v).replace(/[^0-9.\-]/g, '');
    const n = parseFloat(m);
    return Number.isFinite(n) ? n : 0;
}

export function sum(arr: number[]): number { return arr.reduce((a, b) => a + b, 0); }
export function avg(arr: number[]): number { return arr.length ? sum(arr) / arr.length : 0; }

export function fmtInt(n: number): string {
    if (!Number.isFinite(n)) return '0';
    return Math.round(n).toLocaleString('en-US');
}

/** Compact number: 1.2M / 15.3K / 940. */
export function fmtCompact(n: number): string {
    if (!Number.isFinite(n)) return '0';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2) + 'M';
    if (abs >= 1_000) return (n / 1_000).toFixed(abs >= 10_000 ? 0 : 1) + 'K';
    return fmtInt(n);
}

/** Compact money with currency suffix, e.g. "1.2M SAR". */
export function fmtMoney(n: number, currency = 'SAR'): string {
    return `${fmtCompact(n)} ${currency}`;
}

/** Full money with currency suffix, e.g. "1,234,567 SAR". */
export function money(n: number, currency = 'SAR'): string {
    return `${fmtInt(n)} ${currency}`;
}

export function fmtPct(n: number, d = 1): string {
    if (!Number.isFinite(n)) return '0%';
    return (n * 100).toFixed(d) + '%';
}

export function groupBy<T>(arr: T[], fn: (t: T) => string): Record<string, T[]> {
    const m: Record<string, T[]> = {};
    for (const x of arr) { const k = fn(x); (m[k] ||= []).push(x); }
    return m;
}

export type Delta = { txt: string; good: boolean; pct: number };

/** Period-over-period delta. `inverse` = lower is better (e.g. cancel rate). */
export function delta(cur: number, prev: number, inverse = false): Delta {
    if (!prev) return { txt: cur > 0 ? '▲ new' : '—', good: !inverse ? cur >= 0 : true, pct: 0 };
    const d = (cur - prev) / Math.abs(prev);
    const up = cur >= prev;
    const good = inverse ? !up : up;
    return { txt: `${up ? '▲' : '▼'} ${fmtPct(Math.abs(d), 0)} vs prev`, good, pct: d };
}

/* ============================== range helper =============================== */
export type RangeKey = '7' | '30' | '90' | '365' | 'all';

export function rangeBounds(range: RangeKey) {
    const now = Date.now();
    if (range === 'all') return { start: -Infinity, prevStart: 0, prevEnd: 0, days: 0 };
    const days = parseInt(range, 10);
    const s = now - days * 86400000;
    return { start: s, prevStart: s - days * 86400000, prevEnd: s, days };
}

export function inRange(dateVal: any, start: number): boolean {
    if (start === -Infinity) return true;
    const t = new Date(dateVal).getTime();
    return !Number.isNaN(t) && t >= start;
}

export function monthKey(dateVal: any): string | null {
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ============================== chart styling ============================== */
export function tip(colors: any) {
    return {
        contentStyle: {
            background: colors.tooltip || colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            color: colors.textMain,
            fontSize: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        },
        labelStyle: { color: colors.textMuted },
        itemStyle: { color: colors.textMain },
    };
}

export function legendStyle(colors: any) {
    return (v: any) => <span style={{ color: colors.textMuted, fontSize: 11 }}>{v}</span>;
}

/* ============================== UI components ============================== */
export function Card({ title, icon: Icon, right, children, colors, pad = 18, span }: any) {
    return (
        <div style={{
            background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: pad,
            gridColumn: span ? `span ${span}` : undefined, minWidth: 0,
        }}>
            {(title || right) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textMain, fontWeight: 700, fontSize: 14 }}>
                        {Icon && <Icon size={16} style={{ color: colors.primary }} />}
                        {title}
                    </div>
                    {right}
                </div>
            )}
            {children}
        </div>
    );
}

export function MiniStat({ label, value, sub, delta: d, icon: Icon, colorKey, colors }: any) {
    const c = colors[colorKey] || colors.primary;
    return (
        <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 16, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -14, right: -10, opacity: 0.1 }}>
                {Icon && <Icon size={72} color={c} />}
            </div>
            <div style={{ color: colors.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
            <div style={{ color: colors.textMain, fontSize: 25, fontWeight: 800, marginTop: 6, lineHeight: 1.1 }}>{value}</div>
            {sub && <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>{sub}</div>}
            {d && (
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: d.good ? colors.green : colors.red }}>
                    {d.txt}
                </div>
            )}
        </div>
    );
}

export function RangeTabs({ value, onChange, colors, options }: any) {
    const opts = options || [
        { k: '7', l: '7D' }, { k: '30', l: '30D' }, { k: '90', l: '90D' }, { k: '365', l: '1Y' }, { k: 'all', l: 'All' },
    ];
    return (
        <div
            role="tablist"
            aria-label="Date range"
            style={{ display: 'flex', gap: 6, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 4 }}
        >
            {opts.map((o: any) => (
                <button
                    key={o.k}
                    type="button"
                    role="tab"
                    aria-selected={value === o.k}
                    onClick={() => onChange(o.k)}
                    style={{
                        border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: 9, fontSize: 12, fontWeight: 700,
                        background: value === o.k ? colors.primary : 'transparent',
                        color: value === o.k ? contrastOn(colors.primary) : colors.textMuted, transition: 'all .15s',
                    }}
                >
                    {o.l}
                </button>
            ))}
        </div>
    );
}

/** Segmented filter chips (single-select). */
export function FilterChips({ value, onChange, options, colors }: any) {
    return (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {options.map((o: any) => {
                const active = value === o.k;
                return (
                    <button
                        key={o.k}
                        type="button"
                        onClick={() => onChange(o.k)}
                        style={{
                            cursor: 'pointer', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                            background: active ? hexA(colors.primary, '22') : 'transparent',
                            color: active ? colors.primary : colors.textMuted,
                            border: `1px solid ${active ? colors.primary : colors.border}`, transition: 'all .15s',
                        }}
                    >
                        {o.l}
                    </button>
                );
            })}
        </div>
    );
}

export function EmptyState({ icon: Icon, text, colors, pad = 48 }: any) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `${pad}px 12px`, color: colors.textMuted, gap: 10 }}>
            {Icon && <Icon size={34} style={{ opacity: 0.45 }} />}
            <div style={{ fontSize: 13 }}>{text}</div>
        </div>
    );
}

/** Page hero header with icon, title, subtitle, active-property badge and right slot. */
export function Hero({ icon: Icon, title, subtitle, colors, activeProperty, right }: any) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexA(colors.primary, '22'), color: colors.primary }}>
                    {Icon && <Icon size={22} />}
                </div>
                <div>
                    <div style={{ color: colors.textMain, fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {title}
                        <PropertyBadge colors={colors} activeProperty={activeProperty} />
                    </div>
                    <div style={{ color: colors.textMuted, fontSize: 12 }}>{subtitle}</div>
                </div>
            </div>
            {right}
        </div>
    );
}

export function PropertyBadge({ colors, activeProperty }: any) {
    const label = activeProperty?.name || (activeProperty?.id ? activeProperty.id : 'All properties');
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999,
            background: hexA(colors.blue || colors.primary, '1e'), color: colors.blue || colors.primary,
            border: `1px solid ${hexA(colors.blue || colors.primary, '44')}`, fontSize: 11, fontWeight: 700,
        }}>
            <Building2 size={12} /> {label}
        </span>
    );
}

/** Simple progress meter used for utilization/attainment. */
export function Meter({ value, colors, color }: { value: number; colors: any; color?: string }) {
    const pct = Math.max(0, Math.min(1, value));
    const c = color || colors.primary;
    return (
        <div style={{ height: 8, borderRadius: 999, background: colors.bg, overflow: 'hidden', border: `1px solid ${colors.border}` }}>
            <div style={{ height: '100%', width: `${pct * 100}%`, background: c, borderRadius: 999, transition: 'width .3s' }} />
        </div>
    );
}

export function LoadingState({ colors, text = 'Loading…' }: { colors: any; text?: string }) {
    const sk = { backgroundColor: `${colors.border}55` };
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label={text}>
            {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" style={sk} />
            ))}
        </div>
    );
}

export function Section({
    title,
    description,
    children,
    colors,
}: {
    title?: string;
    description?: string;
    children: React.ReactNode;
    colors: any;
}) {
    return (
        <section className="flex flex-col gap-3">
            {(title || description) && (
                <div>
                    {title && (
                        <h2 style={{ color: colors.textMain, fontSize: 16, fontWeight: 700 }}>{title}</h2>
                    )}
                    {description && (
                        <p style={{ color: colors.textMuted, fontSize: 12, marginTop: title ? 4 : 0 }}>{description}</p>
                    )}
                </div>
            )}
            <Separator style={{ backgroundColor: colors.border }} />
            {children}
        </section>
    );
}

export function PageShell({
    children,
    colors,
    enterDeps = [],
}: {
    children: React.ReactNode;
    colors?: any;
    enterDeps?: unknown[];
}) {
    const rootRef = useHubPageEnter(enterDeps);
    return (
        <div ref={rootRef} style={colors ? { paddingBottom: 8 } : undefined}>
            {children}
        </div>
    );
}

/** Convenience hook for range boundaries. */
export function useRangeBounds(range: RangeKey) {
    return useMemo(() => rangeBounds(range), [range]);
}
