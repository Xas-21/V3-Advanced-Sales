import React, { useEffect, useState, useMemo } from 'react';
import { apiUrl } from '../../backendApi';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, Legend,
} from 'recharts';
import { Inbox, DollarSign, Tag, Ban, TrendingUp, Building2, AlertCircle, Loader2 } from 'lucide-react';

/* ----------------------------- shared helpers ----------------------------- */
type Colors = any;

function hexA(hex: string, a: string): string {
    if (!hex) return 'rgba(148,163,184,0.14)';
    if (hex.startsWith('#')) {
        let h = hex.slice(1);
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        if (h.length === 6) return `#${h}${a}`;
    }
    return hex;
}

function num(v: any): number {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    const m = String(v).replace(/[^0-9.\-]/g, '');
    const n = parseFloat(m);
    return Number.isFinite(n) ? n : 0;
}

function sum(arr: number[]): number { return arr.reduce((a, b) => a + b, 0); }

function fmtInt(n: number): string {
    if (!Number.isFinite(n)) return '0';
    return Math.round(n).toLocaleString('en-US');
}

function fmtMoney(n: number): string {
    if (!Number.isFinite(n)) return '0';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return fmtInt(n);
}

function fmtPct(n: number, d = 1): string {
    if (!Number.isFinite(n)) return '0%';
    return (n * 100).toFixed(d) + '%';
}

function groupBy<T>(arr: T[], fn: (t: T) => string): Record<string, T[]> {
    const m: Record<string, T[]> = {};
    for (const x of arr) { const k = fn(x); (m[k] ||= []).push(x); }
    return m;
}

function delta(cur: number, prev: number): { txt: string; good: boolean } {
    if (!prev) return { txt: cur > 0 ? '▲ new' : '—', good: true };
    const d = (cur - prev) / prev;
    const arrow = cur >= prev ? '▲' : '▼';
    return { txt: `${arrow} ${fmtPct(Math.abs(d), 0)} vs prev`, good: cur >= prev };
}

function tip(colors: Colors) {
    return {
        contentStyle: { background: colors.tooltip, border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.textMain, fontSize: 12 },
        labelStyle: { color: colors.textMuted },
        itemStyle: { color: colors.textMain },
    };
}

function Card({ title, icon: Icon, right, children, colors, pad = 18 }: any) {
    return (
        <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: pad }}>
            {(title || right) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
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

function MiniStat({ label, value, sub, delta: d, icon: Icon, colorKey, colors }: any) {
    const c = colors[colorKey] || colors.primary;
    return (
        <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 16, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -14, right: -10, opacity: 0.1 }}>
                {Icon && <Icon size={72} color={c} />}
            </div>
            <div style={{ color: colors.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
            <div style={{ color: colors.textMain, fontSize: 25, fontWeight: 800, marginTop: 6 }}>{value}</div>
            {sub && <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{sub}</div>}
            {d && (
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: d.good ? colors.green : colors.red }}>
                    {d.txt}
                </div>
            )}
        </div>
    );
}

function RangeTabs({ value, onChange, colors }: any) {
    const opts = [
        { k: '7', l: '7D' }, { k: '30', l: '30D' }, { k: '90', l: '90D' }, { k: 'all', l: 'All' },
    ];
    return (
        <div style={{ display: 'flex', gap: 6, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 4 }}>
            {opts.map((o) => (
                <button key={o.k} onClick={() => onChange(o.k)}
                    style={{
                        border: 'none', cursor: 'pointer', padding: '6px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700,
                        background: value === o.k ? colors.primary : 'transparent',
                        color: value === o.k ? '#fff' : colors.textMuted,
                    }}>
                    {o.l}
                </button>
            ))}
        </div>
    );
}

function EmptyState({ icon: Icon, text, colors }: any) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 12px', color: colors.textMuted, gap: 10 }}>
            {Icon && <Icon size={34} style={{ opacity: 0.45 }} />}
            <div style={{ fontSize: 13 }}>{text}</div>
        </div>
    );
}

function aggReq(arr: any[]) {
    let confirmedValue = 0, adrSum = 0, adrN = 0, cancelled = 0, revenue = 0;
    for (const r of arr) {
        const v = num(r.totalCost); revenue += v;
        if ((r.status || '') === 'Confirmed') confirmedValue += v;
        if ((r.status || '').toLowerCase() === 'cancelled') cancelled++;
        const a = num(r.adr); if (a > 0) { adrSum += a; adrN++; }
    }
    return {
        count: arr.length,
        confirmedValue,
        revenue,
        avgAdr: adrN ? adrSum / adrN : 0,
        cancelled,
        cancelRate: arr.length ? cancelled / arr.length : 0,
    };
}

/* ------------------------------- component -------------------------------- */
export default function DashboardHubRequestsPage({ colors }: { colors: any }) {
    const [range, setRange] = useState('30');
    const [requests, setRequests] = useState<any[]>([]);
    const [properties, setProperties] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [r, p] = await Promise.all([
                    fetch(apiUrl('/api/requests')).then((x) => x.json()),
                    fetch(apiUrl('/api/properties')).then((x) => x.json()),
                ]);
                if (cancelled) return;
                setRequests(Array.isArray(r) ? r : []);
                setProperties(Array.isArray(p) ? p : []);
            } catch (e: any) {
                if (!cancelled) setError(e?.message || 'Failed to load');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const { start, prevStart, prevEnd } = useMemo(() => {
        const now = Date.now();
        if (range === 'all') return { start: -Infinity, prevStart: 0, prevEnd: 0 };
        const days = parseInt(range, 10);
        const s = now - days * 86400000;
        return { start: s, prevStart: s - days * 86400000, prevEnd: s };
    }, [range]);

    const current = useMemo(() => requests.filter((r) => {
        const t = new Date(r.createdAt).getTime();
        return !Number.isNaN(t) && (range === 'all' || t >= start);
    }), [requests, start, range]);

    const previous = useMemo(() => requests.filter((r) => {
        const t = new Date(r.createdAt).getTime();
        return !Number.isNaN(t) && t >= prevStart && t < prevEnd;
    }), [requests, prevStart, prevEnd]);

    const propMap = useMemo(() => Object.fromEntries(properties.map((p) => [p.id, p.name])), [properties]);
    const a = useMemo(() => aggReq(current), [current]);
    const pa = useMemo(() => aggReq(previous), [previous]);

    const palette = [colors.blue, colors.green, colors.purple, colors.orange, colors.yellow, colors.cyan, colors.red, colors.primary];

    const statusMix = useMemo(() => {
        const m = groupBy(current, (r) => r.status || 'Unknown');
        return Object.entries(m).map(([k, v]) => ({ name: k, value: v.length })).sort((x, y) => y.value - x.value);
    }, [current]);

    const segmentMix = useMemo(() => {
        const m = groupBy(current, (r) => r.segment || 'Unknown');
        return Object.entries(m).map(([k, v]) => ({ name: k, value: v.length })).sort((x, y) => y.value - x.value);
    }, [current]);

    const byAccount = useMemo(() => {
        const m: Record<string, number> = {};
        for (const r of current) { const k = r.account || 'Unknown'; m[k] = (m[k] || 0) + num(r.totalCost); }
        return Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([name, v]) => ({ name, value: Math.round(v) }));
    }, [current]);

    const byProp = useMemo(() => {
        const m: Record<string, number> = {};
        for (const r of current) { const k = r.propertyId || '—'; m[k] = (m[k] || 0) + 1; }
        return Object.entries(m).map(([id, v]) => ({ name: propMap[id] || id || 'Unassigned', value: v })).sort((x, y) => y.value - x.value);
    }, [current, propMap]);

    const monthly = useMemo(() => {
        const map: Record<string, any> = {};
        for (const r of current) {
            const d = new Date(r.createdAt);
            if (Number.isNaN(d.getTime())) continue;
            const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!map[k]) map[k] = { month: k, count: 0, revenue: 0, adrSum: 0, adrN: 0 };
            map[k].count += 1;
            map[k].revenue += num(r.totalCost);
            const ar = num(r.adr); if (ar > 0) { map[k].adrSum += ar; map[k].adrN += 1; }
        }
        return Object.keys(map).sort().map((k) => ({
            month: map[k].month,
            count: map[k].count,
            revenue: Math.round(map[k].revenue),
            adr: map[k].adrN ? Math.round(map[k].adrSum / map[k].adrN) : 0,
        }));
    }, [current]);

    const leadBuckets = useMemo(() => {
        const defs: [string, number, number][] = [['0–7d', 0, 7], ['8–30d', 8, 30], ['31–90d', 31, 90], ['90d+', 91, 1e9]];
        const arr = defs.map(([name]) => ({ name, value: 0 }));
        for (const r of current) {
            const c = new Date(r.createdAt).getTime();
            const ci = new Date(r.checkIn).getTime();
            if (Number.isNaN(c) || Number.isNaN(ci)) continue;
            const days = (ci - c) / 86400000;
            for (let i = 0; i < defs.length; i++) {
                const [, lo, hi] = defs[i];
                if (days >= lo && days <= hi) { arr[i].value++; break; }
            }
        }
        return arr;
    }, [current]);

    const crDelta = (() => {
        if (!pa.cancelRate) return { txt: a.cancelRate > 0 ? '▲ new' : '—', good: true };
        const d = (a.cancelRate - pa.cancelRate) / pa.cancelRate;
        return { txt: `${a.cancelRate >= pa.cancelRate ? '▲' : '▼'} ${fmtPct(Math.abs(d), 0)} vs prev`, good: a.cancelRate <= pa.cancelRate };
    })();

    const ready = !loading && !error;
    const hasData = current.length > 0;

    return (
        <div style={{ padding: 4 }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexA(colors.primary, '22'), color: colors.primary }}>
                        <Inbox size={22} />
                    </div>
                    <div>
                        <div style={{ color: colors.textMain, fontSize: 20, fontWeight: 800 }}>Request Analytics</div>
                        <div style={{ color: colors.textMuted, fontSize: 12 }}>Bookings, segments, ADR & cancellation insight</div>
                    </div>
                </div>
                <RangeTabs value={range} onChange={setRange} colors={colors} />
            </div>

            {loading && <EmptyState icon={Loader2} text="Loading requests…" colors={colors} />}
            {error && (
                <Card colors={colors}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.red }}>
                        <AlertCircle size={18} /> <span>Failed to load: {error}</span>
                    </div>
                </Card>
            )}

            {ready && !hasData && <EmptyState icon={Inbox} text="No requests in the selected period." colors={colors} />}

            {ready && hasData && (
                <>
                    {/* stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
                        <MiniStat label="Total Requests" value={fmtInt(a.count)} delta={delta(a.count, pa.count)} icon={Inbox} colorKey="blue" colors={colors} />
                        <MiniStat label="Confirmed Value" value={fmtMoney(a.confirmedValue) + ' SAR'} delta={delta(a.confirmedValue, pa.confirmedValue)} icon={DollarSign} colorKey="green" colors={colors} />
                        <MiniStat label="Avg ADR" value={fmtInt(a.avgAdr) + ' SAR'} delta={delta(a.avgAdr, pa.avgAdr)} icon={Tag} colorKey="purple" colors={colors} />
                        <MiniStat label="Cancel Rate" value={fmtPct(a.cancelRate)} delta={crDelta} icon={Ban} colorKey="red" colors={colors} />
                    </div>

                    {/* charts grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <Card title="Request Volume & ADR Trend" icon={TrendingUp} colors={colors}>
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart data={monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="rqVol" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={colors.primary} stopOpacity={0.45} />
                                            <stop offset="100%" stopColor={colors.primary} stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke={colors.grid} vertical={false} />
                                    <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                    <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                    <Tooltip {...tip(colors)} />
                                    <Area type="monotone" dataKey="count" name="Requests" stroke={colors.primary} fill="url(#rqVol)" strokeWidth={2} />
                                    <Line type="monotone" dataKey="adr" name="ADR (SAR)" stroke={colors.green} strokeWidth={2} dot={false} />
                                    <Legend formatter={(v: any) => <span style={{ color: colors.textMuted, fontSize: 11 }}>{v}</span>} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card title="Revenue Trend (SAR)" icon={DollarSign} colors={colors}>
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart data={monthly} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="rqRev" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={colors.green} stopOpacity={0.45} />
                                            <stop offset="100%" stopColor={colors.green} stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke={colors.grid} vertical={false} />
                                    <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                    <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} tickFormatter={(v: number) => fmtMoney(v)} />
                                    <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v) + ' SAR', 'Revenue']} />
                                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke={colors.green} fill="url(#rqRev)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card title="Status Mix" icon={Inbox} colors={colors}>
                            {statusMix.length ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <PieChart>
                                        <Pie data={statusMix} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                                            {statusMix.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                                        </Pie>
                                        <Tooltip {...tip(colors)} />
                                        <Legend formatter={(v: any) => <span style={{ color: colors.textMuted, fontSize: 11 }}>{v}</span>} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={Inbox} text="No status data" colors={colors} />}
                        </Card>

                        <Card title="Segment Mix" icon={Tag} colors={colors}>
                            {segmentMix.length ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <PieChart>
                                        <Pie data={segmentMix} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                                            {segmentMix.map((_, i) => <Cell key={i} fill={palette[(i + 2) % palette.length]} />)}
                                        </Pie>
                                        <Tooltip {...tip(colors)} />
                                        <Legend formatter={(v: any) => <span style={{ color: colors.textMuted, fontSize: 11 }}>{v}</span>} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={Tag} text="No segment data" colors={colors} />}
                        </Card>

                        <Card title="Top Accounts by Revenue (SAR)" icon={DollarSign} colors={colors}>
                            {byAccount.length ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={byAccount} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                        <CartesianGrid stroke={colors.grid} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} tickFormatter={(v: number) => fmtMoney(v)} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} width={110} />
                                        <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v) + ' SAR', 'Revenue']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                        <Bar dataKey="value" name="Revenue" radius={[0, 6, 6, 0]}>
                                            {byAccount.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={DollarSign} text="No account revenue" colors={colors} />}
                        </Card>

                        <Card title="Requests by Property" icon={Building2} colors={colors}>
                            {byProp.length ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={byProp} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                                        <CartesianGrid stroke={colors.grid} vertical={false} />
                                        <XAxis dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} interval={0} angle={-12} textAnchor="end" height={50} />
                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} allowDecimals={false} />
                                        <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                        <Bar dataKey="value" name="Requests" radius={[6, 6, 0, 0]}>
                                            {byProp.map((_, i) => <Cell key={i} fill={palette[(i + 1) % palette.length]} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={Building2} text="No property data" colors={colors} />}
                        </Card>

                        <Card title="Booking Lead Time Distribution" icon={TrendingUp} colors={colors}>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={leadBuckets} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                                    <CartesianGrid stroke={colors.grid} vertical={false} />
                                    <XAxis dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                    <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} allowDecimals={false} />
                                    <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                    <Bar dataKey="value" name="Requests" fill={colors.orange} radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card title="Cancellations by Month" icon={Ban} colors={colors}>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={monthly.map((m) => {
                                    const inMonth = current.filter((r) => {
                                        const d = new Date(r.createdAt);
                                        return !Number.isNaN(d.getTime()) && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === m.month && (r.status || '').toLowerCase() === 'cancelled';
                                    });
                                    return { month: m.month, cancelled: inMonth.length };
                                })} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                                    <CartesianGrid stroke={colors.grid} vertical={false} />
                                    <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                    <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} allowDecimals={false} />
                                    <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                    <Bar dataKey="cancelled" name="Cancelled" fill={colors.red} radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
