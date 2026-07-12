import React, { useEffect, useState, useMemo } from 'react';
import { apiUrl } from '../../backendApi';
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area, Line,
} from 'recharts';
import { DollarSign, PieChart as PieIcon, Building2, Wallet, TrendingUp, AlertCircle, Loader2, Scale } from 'lucide-react';

/* ------------------------------- helpers ---------------------------------- */
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
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
}

function sum(arr: number[]): number { return arr.reduce((a, b) => a + b, 0); }
function fmtInt(n: number): string { return (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('en-US'); }
function fmtMoney(n: number): string {
    if (!Number.isFinite(n)) return '0';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return fmtInt(n);
}
function fmtPct(n: number, d = 1): string { return (Number.isFinite(n) ? n * 100 : 0).toFixed(d) + '%'; }

function tip(colors: Colors) {
    return {
        contentStyle: { background: colors.tooltip, border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.textMain, fontSize: 12 },
        labelStyle: { color: colors.textMuted },
        itemStyle: { color: colors.textMain },
    };
}

function Card({ title, icon: Icon, children, colors }: any) {
    return (
        <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 18 }}>
            {(title) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textMain, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
                    {Icon && <Icon size={16} style={{ color: colors.primary }} />}
                    {title}
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
            <div style={{ position: 'absolute', top: -14, right: -10, opacity: 0.1 }}><Icon size={72} color={c} /></div>
            <div style={{ color: colors.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
            <div style={{ color: colors.textMain, fontSize: 25, fontWeight: 800, marginTop: 6 }}>{value}</div>
            {sub && <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{sub}</div>}
            {d && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: d.good ? colors.green : colors.red }}>{d.txt}</div>}
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

function delta(cur: number, prev: number) {
    if (!prev) return { txt: cur > 0 ? '▲ new' : '—', good: true };
    const d = (cur - prev) / prev;
    return { txt: `${cur >= prev ? '▲' : '▼'} ${fmtPct(Math.abs(d), 0)} vs prev`, good: cur >= prev };
}

/* ------------------------------- component -------------------------------- */
export default function DashboardHubRevenueMixPage({ colors }: { colors: any }) {
    const [requests, setRequests] = useState<any[]>([]);
    const [financials, setFinancials] = useState<any[]>([]);
    const [properties, setProperties] = useState<any[]>([]);
    const [range, setRange] = useState('30');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [r, f, p] = await Promise.all([
                    fetch(apiUrl('/api/requests')).then((x) => x.json()),
                    fetch(apiUrl('/api/financials')).then((x) => x.json()),
                    fetch(apiUrl('/api/properties')).then((x) => x.json()),
                ]);
                if (cancelled) return;
                setRequests(Array.isArray(r) ? r : []);
                setFinancials(Array.isArray(f) ? f : []);
                setProperties(Array.isArray(p) ? p : []);
            } catch (e: any) {
                if (!cancelled) setError(e?.message || 'Failed to load');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const propMap = useMemo(() => Object.fromEntries(properties.map((p) => [p.id, p.name])), [properties]);
    const palette = [colors.blue, colors.green, colors.purple, colors.orange, colors.yellow, colors.cyan, colors.red, colors.primary];

    const { start, prevStart, prevEnd } = useMemo(() => {
        if (range === 'all') return { start: -Infinity, prevStart: 0, prevEnd: 0 };
        const days = parseInt(range, 10);
        const s = Date.now() - days * 86400000;
        return { start: s, prevStart: s - days * 86400000, prevEnd: s };
    }, [range]);

    const inRange = (r: any) => {
        const t = new Date(r.createdAt).getTime();
        return Number.isNaN(t) ? false : (range === 'all' || t >= start);
    };
    const inPrev = (r: any) => {
        const t = new Date(r.createdAt).getTime();
        return !Number.isNaN(t) && t >= prevStart && t < prevEnd;
    };

    const curReq = useMemo(() => requests.filter(inRange), [requests, start, range]);
    const prevReq = useMemo(() => requests.filter(inPrev), [requests, prevStart, prevEnd]);

    const curRevenue = useMemo(() => sum(curReq.map((r) => num(r.totalCost))), [curReq]);
    const prevRevenue = useMemo(() => sum(prevReq.map((r) => num(r.totalCost))), [prevReq]);

    // paid vs outstanding from requests (payments vs totalCost)
    const paidOut = useMemo(() => {
        let paid = 0, outstanding = 0;
        for (const r of curReq) {
            const total = num(r.totalCost);
            const paidAmt = sum((Array.isArray(r.payments) ? r.payments : []).map((p: any) => num(p.amount)));
            const p2 = paidAmt || num(r.paidAmount);
            paid += p2;
            outstanding += Math.max(0, total - p2);
        }
        return { paid, outstanding };
    }, [curReq]);

    // For requests without payments/paidAmount, count full value as outstanding
    const curPaid = paidOut.paid;
    const curOutstanding = paidOut.outstanding;

    const bySegment = useMemo(() => {
        const m: Record<string, number> = {};
        for (const r of curReq) { const k = r.segment || 'Unknown'; m[k] = (m[k] || 0) + num(r.totalCost); }
        return Object.entries(m).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
    }, [curReq]);

    const byProperty = useMemo(() => {
        const m: Record<string, number> = {};
        for (const r of curReq) { const k = r.propertyId || '—'; m[k] = (m[k] || 0) + num(r.totalCost); }
        return Object.entries(m).map(([id, value]) => ({ name: propMap[id] || id || 'Unassigned', value: Math.round(value) })).sort((a, b) => b.value - a.value);
    }, [curReq, propMap]);

    const byAccount = useMemo(() => {
        const m: Record<string, number> = {};
        for (const r of curReq) { const k = r.account || 'Unknown'; m[k] = (m[k] || 0) + num(r.totalCost); }
        return Object.entries(m).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 8);
    }, [curReq]);

    const monthly = useMemo(() => {
        const map: Record<string, any> = {};
        for (const r of curReq) {
            const d = new Date(r.createdAt);
            if (Number.isNaN(d.getTime())) continue;
            const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!map[k]) map[k] = { month: k, revenue: 0, paid: 0 };
            map[k].revenue += num(r.totalCost);
            const p = sum((Array.isArray(r.payments) ? r.payments : []).map((p: any) => num(p.amount))) || num(r.paidAmount);
            map[k].paid += p;
        }
        return Object.keys(map).sort().map((k) => ({ month: map[k].month, revenue: Math.round(map[k].revenue), paid: Math.round(map[k].paid) }));
    }, [curReq]);

    const finByCategory = useMemo(() => {
        const m: Record<string, number> = {};
        for (const f of financials) { const k = f.category || f.type || 'Other'; m[k] = (m[k] || 0) + num(f.amount); }
        return Object.entries(m).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
    }, [financials]);

    const ready = !loading && !error;
    const hasData = curReq.length > 0;
    const collectionRate = (curPaid + curOutstanding) ? curPaid / (curPaid + curOutstanding) : 0;

    return (
        <div style={{ padding: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexA(colors.primary, '22'), color: colors.primary }}>
                        <DollarSign size={22} />
                    </div>
                    <div>
                        <div style={{ color: colors.textMain, fontSize: 20, fontWeight: 800 }}>Revenue Mix</div>
                        <div style={{ color: colors.textMuted, fontSize: 12 }}>Composition, collection & trend</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 4 }}>
                    {[['7', '7D'], ['30', '30D'], ['90', '90D'], ['all', 'All']].map(([k, l]) => (
                        <button key={k} onClick={() => setRange(k)} style={{ border: 'none', cursor: 'pointer', padding: '6px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700, background: range === k ? colors.primary : 'transparent', color: range === k ? '#fff' : colors.textMuted }}>
                            {l}
                        </button>
                    ))}
                </div>
            </div>

            {loading && <EmptyState icon={Loader2} text="Loading revenue…" colors={colors} />}
            {error && <Card colors={colors}><div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.red }}><AlertCircle size={18} /> <span>Failed to load: {error}</span></div></Card>}
            {ready && !hasData && <EmptyState icon={DollarSign} text="No revenue in the selected period." colors={colors} />}

            {ready && hasData && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
                        <MiniStat label="Total Revenue" value={fmtMoney(curRevenue) + ' SAR'} delta={delta(curRevenue, prevRevenue)} icon={DollarSign} colorKey="green" colors={colors} />
                        <MiniStat label="Collected" value={fmtMoney(curPaid) + ' SAR'} sub={fmtPct(collectionRate) + ' collects'} icon={Wallet} colorKey="blue" colors={colors} />
                        <MiniStat label="Outstanding" value={fmtMoney(curOutstanding) + ' SAR'} sub="unpaid value" icon={Scale} colorKey="orange" colors={colors} />
                        <MiniStat label="Avg Deal Size" value={fmtMoney(curRevenue / Math.max(1, curReq.length)) + ' SAR'} icon={TrendingUp} colorKey="purple" colors={colors} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <Card title="Revenue Trend (SAR)" icon={TrendingUp} colors={colors}>
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart data={monthly} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="revMix" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={colors.primary} stopOpacity={0.45} />
                                            <stop offset="100%" stopColor={colors.primary} stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke={colors.grid} vertical={false} />
                                    <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                    <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} tickFormatter={(v: number) => fmtMoney(v)} />
                                    <Tooltip {...tip(colors)} formatter={(v: any, n: any) => [fmtInt(v) + ' SAR', n]} />
                                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke={colors.primary} fill="url(#revMix)" strokeWidth={2} />
                                    <Line type="monotone" dataKey="paid" name="Collected" stroke={colors.green} strokeWidth={2} dot={false} />
                                    <Legend formatter={(v: any) => <span style={{ color: colors.textMuted, fontSize: 11 }}>{v}</span>} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card title="Revenue by Segment" icon={PieIcon} colors={colors}>
                            {bySegment.length ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <PieChart>
                                        <Pie data={bySegment} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                                            {bySegment.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                                        </Pie>
                                        <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v) + ' SAR', '']} />
                                        <Legend formatter={(v: any) => <span style={{ color: colors.textMuted, fontSize: 11 }}>{v}</span>} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={PieIcon} text="No segment data" colors={colors} />}
                        </Card>

                        <Card title="Revenue by Property" icon={Building2} colors={colors}>
                            {byProperty.length ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={byProperty} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                        <CartesianGrid stroke={colors.grid} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} tickFormatter={(v: number) => fmtMoney(v)} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} width={110} />
                                        <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v) + ' SAR', 'Revenue']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                        <Bar dataKey="value" name="Revenue" radius={[0, 6, 6, 0]}>
                                            {byProperty.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={Building2} text="No property data" colors={colors} />}
                        </Card>

                        <Card title="Paid vs Outstanding" icon={Wallet} colors={colors}>
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie data={[{ name: 'Collected', value: Math.round(curPaid) }, { name: 'Outstanding', value: Math.round(curOutstanding) }]} dataKey="value" innerRadius={55} outerRadius={95} paddingAngle={2}>
                                        <Cell fill={colors.green} /><Cell fill={colors.orange} />
                                    </Pie>
                                    <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v) + ' SAR', '']} />
                                    <Legend formatter={(v: any) => <span style={{ color: colors.textMuted, fontSize: 11 }}>{v}</span>} />
                                </PieChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card title="Top Accounts by Revenue" icon={DollarSign} colors={colors}>
                            {byAccount.length ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={byAccount} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                        <CartesianGrid stroke={colors.grid} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} tickFormatter={(v: number) => fmtMoney(v)} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} width={120} />
                                        <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v) + ' SAR', 'Revenue']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                        <Bar dataKey="value" name="Revenue" radius={[0, 6, 6, 0]}>
                                            {byAccount.map((_, i) => <Cell key={i} fill={palette[(i + 1) % palette.length]} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={DollarSign} text="No account revenue" colors={colors} />}
                        </Card>

                        <Card title="Financials by Category" icon={PieIcon} colors={colors}>
                            {finByCategory.length ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <PieChart>
                                        <Pie data={finByCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                                            {finByCategory.map((_, i) => <Cell key={i} fill={palette[(i + 3) % palette.length]} />)}
                                        </Pie>
                                        <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v) + ' SAR', '']} />
                                        <Legend formatter={(v: any) => <span style={{ color: colors.textMuted, fontSize: 11 }}>{v}</span>} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={PieIcon} text="No financial categories (endpoint empty)" colors={colors} />}
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
