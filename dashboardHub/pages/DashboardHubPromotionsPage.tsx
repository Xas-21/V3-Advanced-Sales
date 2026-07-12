import React, { useEffect, useMemo, useState } from 'react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Legend,
    AreaChart,
    Area,
} from 'recharts';
import { Megaphone, Tag, CalendarCheck, CalendarX, Percent, Building2 } from 'lucide-react';
import { apiUrl } from '../../backendApi';

const tint = (c: string, a = '22') => `${c}${a}`;

function asArr(v: any): any[] {
    return Array.isArray(v) ? v : [];
}
function parseYmd(raw: any): string {
    if (!raw) return '';
    const s = String(raw).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
}
function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
const RANGE_OPTIONS = [
    { label: '7D', days: 7 },
    { label: '30D', days: 30 },
    { label: '90D', days: 90 },
    { label: 'All', days: 0 },
];
const CARD_STYLE: React.CSSProperties = { borderRadius: 16, borderWidth: 1, borderStyle: 'solid' };

function statusColor(status: string, colors: any) {
    if (status === 'Active') return colors.green;
    if (status === 'Expired') return colors.red;
    return colors.yellow;
}

function effectiveStatus(p: any, today: string): string {
    const s = String(p.status || '').trim();
    if (s === 'Active' || s === 'Expired') {
        const end = parseYmd(p.endDate);
        if (end && end < today) return 'Expired';
        const start = parseYmd(p.startDate);
        if (start && end && start <= today && today <= end) return 'Active';
        if (s === 'Active' && end && end >= today) return 'Active';
    }
    if (s === 'Draft') return 'Draft';
    const end = parseYmd(p.endDate);
    if (end && end < today) return 'Expired';
    const start = parseYmd(p.startDate);
    if (start && end && start <= today && today <= end) return 'Active';
    return s || 'Draft';
}

function MiniStat({
    colors,
    icon: Icon,
    label,
    value,
    sub,
    color,
}: {
    colors: any;
    icon: any;
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    color: string;
}) {
    return (
        <div
            style={{
                ...CARD_STYLE,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: 16,
                backgroundColor: colors.card,
                borderColor: colors.border,
            }}
        >
            <div
                style={{
                    flexShrink: 0,
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color,
                    backgroundColor: tint(color),
                }}
            >
                <Icon size={22} strokeWidth={2.1} />
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
                <div style={{ color: colors.textMain, fontSize: 22, fontWeight: 700, lineHeight: 1.15 }}>{value}</div>
                {sub != null ? <div style={{ color: colors.textMuted, fontSize: 11 }}>{sub}</div> : null}
            </div>
        </div>
    );
}

function tooltipProps(colors: any) {
    return {
        contentStyle: { backgroundColor: colors.tooltip, borderColor: colors.border, borderRadius: 8, color: colors.textMain },
        labelStyle: { color: colors.textMain, fontWeight: 700 },
        itemStyle: { color: colors.textMain },
    };
}

function EmptyState({ colors, label }: { colors: any; label: string }) {
    return (
        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 32, textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
            No data available{label ? ` for ${label}` : ''}.
        </div>
    );
}

function RangeFilter({ colors, value, onChange }: { colors: any; value: number; onChange: (d: number) => void }) {
    return (
        <div style={{ display: 'inline-flex', borderRadius: 10, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
            {RANGE_OPTIONS.map((o) => {
                const active = o.days === value;
                return (
                    <button
                        key={o.label}
                        onClick={() => onChange(o.days)}
                        style={{
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            color: active ? colors.bg : colors.textMuted,
                            backgroundColor: active ? colors.primary : 'transparent',
                        }}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

export default function DashboardHubPromotionsPage({ colors }: { colors: any }) {
    const [promos, setPromos] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [properties, setProperties] = useState<any[]>([]);
    const [range, setRange] = useState<number>(30);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [pR, rR, prR] = await Promise.all([
                    fetch(apiUrl('/api/promotions')),
                    fetch(apiUrl('/api/requests')),
                    fetch(apiUrl('/api/properties')),
                ]);
                const [p, r, pr] = await Promise.all([pR.json(), rR.json(), prR.json()]);
                if (!alive) return;
                setPromos(asArr(p));
                setRequests(asArr(r));
                setProperties(asArr(pr));
            } catch {
                /* ignore */
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
    const cutoff = useMemo(() => {
        if (!range) return 0;
        return startOfDay(new Date()) - range * 86400000;
    }, [range]);

    const enriched = useMemo(
        () => promos.map((p) => ({ ...p, _status: effectiveStatus(p, today) })),
        [promos, today],
    );

    const inRange = (p: any) => {
        if (!range) return true;
        const d = parseYmd(p.startDate || p.createdAt);
        if (!d) return true;
        return startOfDay(new Date(d)) >= cutoff;
    };
    const filtered = useMemo(() => enriched.filter(inRange), [enriched, inRange]);

    const statusMix = useMemo(() => {
        const m = new Map<string, number>();
        filtered.forEach((p) => m.set(p._status, (m.get(p._status) || 0) + 1));
        return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
    }, [filtered]);

    const typeMix = useMemo(() => {
        const m = new Map<string, number>();
        filtered.forEach((p) => {
            const k = String(p.type || 'Unspecified').trim() || 'Unspecified';
            m.set(k, (m.get(k) || 0) + 1);
        });
        return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [filtered]);

    const discounts = useMemo(() => {
        const vals = filtered.map((p) => Number(p.discount || 0) || 0).filter((d) => d > 0);
        return vals;
    }, [filtered]);

    const avgDiscount = useMemo(() => {
        if (!discounts.length) return 0;
        return discounts.reduce((s, d) => s + d, 0) / discounts.length;
    }, [discounts]);

    const byProperty = useMemo(() => {
        const m = new Map<string, number>();
        filtered.forEach((p) => {
            const id = String(p.propertyId || 'Unassigned').trim() || 'Unassigned';
            m.set(id, (m.get(id) || 0) + 1);
        });
        const rows = Array.from(m.entries()).map(([id, count]) => {
            const prop = properties.find((x) => String(x.id) === id);
            return { id, name: prop?.name || (id === 'Unassigned' ? 'Unassigned' : `Prop ${id}`), count };
        });
        return rows.sort((a, b) => b.count - a.count).slice(0, 8);
    }, [filtered, properties]);

    const timeline = useMemo(() => {
        const buckets = new Map<string, { active: number; expired: number; draft: number }>();
        filtered.forEach((p) => {
            const key = parseYmd(p.startDate || p.createdAt).slice(0, 7);
            if (!key) return;
            if (!buckets.has(key)) buckets.set(key, { active: 0, expired: 0, draft: 0 });
            const b = buckets.get(key)!;
            if (p._status === 'Active') b.active += 1;
            else if (p._status === 'Expired') b.expired += 1;
            else b.draft += 1;
        });
        return Array.from(buckets.entries())
            .map(([month, v]) => ({ month, ...v }))
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-12);
    }, [filtered]);

    const palettes = [colors.blue, colors.green, colors.purple, colors.orange, colors.yellow, colors.cyan, colors.red, colors.primary];
    const hasData = enriched.length > 0;
    const activeCount = enriched.filter((p) => p._status === 'Active').length;
    const expiredCount = enriched.filter((p) => p._status === 'Expired').length;
    const draftCount = enriched.filter((p) => p._status === 'Draft').length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: colors.primary,
                            backgroundColor: tint(colors.primary),
                        }}
                    >
                        <Megaphone size={24} strokeWidth={2.1} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, color: colors.textMain, fontSize: 20, fontWeight: 700 }}>Promotions Performance</h2>
                        <div style={{ color: colors.textMuted, fontSize: 12 }}>{enriched.length} promotions tracked</div>
                    </div>
                </div>
                <RangeFilter colors={colors} value={range} onChange={setRange} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <MiniStat colors={colors} icon={Tag} label="Total Promotions" value={filtered.length} sub={`${enriched.length} all time`} color={colors.blue} />
                <MiniStat colors={colors} icon={CalendarCheck} label="Active" value={activeCount} color={colors.green} />
                <MiniStat colors={colors} icon={Percent} label="Avg Discount" value={discounts.length ? `${avgDiscount.toFixed(1)}%` : '—'} color={colors.orange} />
                <MiniStat colors={colors} icon={CalendarX} label="Expired / Draft" value={`${expiredCount} / ${draftCount}`} color={colors.red} />
            </div>

            {!hasData ? (
                <EmptyState colors={colors} label="promotions" />
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Status Mix</div>
                            {statusMix.length ? (
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart>
                                        <Pie data={statusMix} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                                            {statusMix.map((s, i) => (
                                                <Cell key={i} fill={statusColor(s.name, colors)} />
                                            ))}
                                        </Pie>
                                        <Tooltip {...tooltipProps(colors)} />
                                        <Legend wrapperStyle={{ fontSize: 11, color: colors.textMuted }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="status mix" />
                            )}
                        </div>

                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>By Type</div>
                            {typeMix.length ? (
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart>
                                        <Pie data={typeMix} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                                            {typeMix.map((_, i) => (
                                                <Cell key={i} fill={palettes[i % palettes.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip {...tooltipProps(colors)} />
                                        <Legend wrapperStyle={{ fontSize: 11, color: colors.textMuted }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="types" />
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Promotions by Property</div>
                            {byProperty.length ? (
                                <ResponsiveContainer width="100%" height={Math.max(220, byProperty.length * 34)}>
                                    <BarChart data={byProperty} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
                                        <Tooltip {...tooltipProps(colors)} cursor={{ fill: colors.border }} />
                                        <Bar dataKey="count" name="Promotions" fill={colors.purple} radius={[0, 4, 4, 0]} barSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="property breakdown" />
                            )}
                        </div>

                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Discount Distribution</div>
                            {discounts.length ? (
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={discounts.map((d, i) => ({ name: `#${i + 1}`, discount: d }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                                        <XAxis dataKey="name" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <Tooltip {...tooltipProps(colors)} formatter={(v: any) => [`${v}%`, 'Discount']} cursor={{ fill: colors.border }} />
                                        <Bar dataKey="discount" name="Discount" fill={colors.orange} radius={[4, 4, 0, 0]} barSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="discounts" />
                            )}
                        </div>
                    </div>

                    <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                        <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Promotion Activity Timeline</div>
                        {timeline.length ? (
                            <ResponsiveContainer width="100%" height={240}>
                                <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} stackOffset="none">
                                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                                    <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <Tooltip {...tooltipProps(colors)} />
                                    <Legend wrapperStyle={{ fontSize: 11, color: colors.textMuted }} />
                                    <Area type="monotone" dataKey="active" name="Active" stackId="1" stroke={colors.green} fill={tint(colors.green)} />
                                    <Area type="monotone" dataKey="draft" name="Draft" stackId="1" stroke={colors.yellow} fill={tint(colors.yellow)} />
                                    <Area type="monotone" dataKey="expired" name="Expired" stackId="1" stroke={colors.red} fill={tint(colors.red)} />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <EmptyState colors={colors} label="timeline" />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
