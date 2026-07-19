/**
 * Hub Revenue Mix — collection-first analytics (plan 017 promoted).
 * Wide charts + scroll; period filters use requestDate / receivedDate / createdAt / checkIn.
 */
import React, { useMemo, useState } from 'react';
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
    Area, Line, ComposedChart,
} from 'recharts';
import {
    DollarSign, PieChart as PieIcon, Building2, Wallet, TrendingUp, Scale, Filter,
} from 'lucide-react';
import { useHubData } from '../HubDataContext';
import {
    hexA, num, sum, fmtInt, fmtMoney, money, fmtPct, delta, tip, legendStyle, palette,
    Card, MiniStat, RangeTabs, FilterChips, EmptyState, Hero, Meter, PageShell,
    rangeBounds, monthKey, type RangeKey,
} from '../analyticsKit';

const WON_STATUSES = new Set(['confirmed', 'definite', 'actual', 'won', 'signed']);

function requestWhen(r: any): string {
    return String(r.requestDate || r.receivedDate || r.createdAt || r.checkIn || '');
}

function requestTime(r: any): number {
    const t = new Date(requestWhen(r)).getTime();
    return Number.isNaN(t) ? NaN : t;
}

function paidOnRequest(r: any): number {
    const fromPayments = sum((Array.isArray(r.payments) ? r.payments : []).map((p: any) => num(p.amount)));
    return fromPayments || num(r.paidAmount);
}

function isWonStatus(status: any): boolean {
    return WON_STATUSES.has(String(status || '').toLowerCase());
}

function financialWhen(f: any): string {
    return String(f.date || f.createdAt || f.postedAt || '');
}

export default function DashboardHubRevenueMixPage({ colors }: { colors: any }) {
    const { requests, financials, properties, currency, activeProperty } = useHubData();
    const [range, setRange] = useState<RangeKey>('90');
    const [segFilter, setSegFilter] = useState<string>('all');

    const propMap = useMemo(() => Object.fromEntries(properties.map((p) => [p.id, p.name])), [properties]);
    const pal = palette(colors);
    const { start, prevStart, prevEnd } = useMemo(() => rangeBounds(range), [range]);

    const segments = useMemo(() => {
        const s = new Set<string>();
        for (const r of requests) s.add(r.segment || 'Unknown');
        return ['all', ...Array.from(s).sort()];
    }, [requests]);

    const withinSeg = (r: any) => segFilter === 'all' || (r.segment || 'Unknown') === segFilter;

    const curReq = useMemo(() => requests.filter((r) => {
        if (!withinSeg(r)) return false;
        if (range === 'all') return true;
        const t = requestTime(r);
        return !Number.isNaN(t) && t >= start;
    }), [requests, start, range, segFilter]);

    const prevReq = useMemo(() => {
        if (range === 'all') return [];
        return requests.filter((r) => {
            if (!withinSeg(r)) return false;
            const t = requestTime(r);
            return !Number.isNaN(t) && t >= prevStart && t < prevEnd;
        });
    }, [requests, prevStart, prevEnd, range, segFilter]);

    const curRevenue = useMemo(() => sum(curReq.map((r) => num(r.totalCost))), [curReq]);
    const prevRevenue = useMemo(() => sum(prevReq.map((r) => num(r.totalCost))), [prevReq]);

    const paidOut = useMemo(() => {
        let paid = 0, outstanding = 0;
        for (const r of curReq) {
            const total = num(r.totalCost);
            const p2 = paidOnRequest(r);
            paid += p2;
            outstanding += Math.max(0, total - p2);
        }
        return { paid, outstanding };
    }, [curReq]);

    const curPaid = paidOut.paid;
    const curOutstanding = paidOut.outstanding;
    const collectionRate = (curPaid + curOutstanding) ? curPaid / (curPaid + curOutstanding) : 0;

    const wonRevenue = useMemo(
        () => sum(curReq.filter((r) => isWonStatus(r.status)).map((r) => num(r.totalCost))),
        [curReq],
    );

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
        return Object.entries(m).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 10);
    }, [curReq]);

    const monthly = useMemo(() => {
        const map: Record<string, any> = {};
        for (const r of curReq) {
            const k = monthKey(requestWhen(r)); if (!k) continue;
            if (!map[k]) map[k] = { month: k, revenue: 0, paid: 0, outstanding: 0 };
            const total = num(r.totalCost);
            const p = paidOnRequest(r);
            map[k].revenue += total;
            map[k].paid += p;
            map[k].outstanding += Math.max(0, total - p);
        }
        return Object.keys(map).sort().map((k) => ({
            month: map[k].month,
            revenue: Math.round(map[k].revenue),
            paid: Math.round(map[k].paid),
            outstanding: Math.round(map[k].outstanding),
        }));
    }, [curReq]);

    const finInRange = useMemo(() => {
        if (range === 'all') return financials;
        return financials.filter((f) => {
            const t = new Date(financialWhen(f)).getTime();
            if (Number.isNaN(t)) return false;
            return t >= start;
        });
    }, [financials, start, range]);

    const finDatedCount = useMemo(
        () => financials.filter((f) => !Number.isNaN(new Date(financialWhen(f)).getTime())).length,
        [financials],
    );

    const finByCategory = useMemo(() => {
        const m: Record<string, number> = {};
        for (const f of finInRange) {
            const k = f.category || f.type || 'Other';
            m[k] = (m[k] || 0) + num(f.amount);
        }
        return Object.entries(m).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
    }, [finInRange]);

    const avgDeal = curRevenue / Math.max(1, curReq.length);
    const hasData = curReq.length > 0;
    const useSelect = segments.length > 9;

    return (
        <PageShell colors={colors} enterDeps={[range, segFilter]}>
            <div style={{ padding: 4 }}>
                <div data-hub-animate>
                    <Hero
                        icon={DollarSign}
                        title="Revenue Mix"
                        colors={colors}
                        activeProperty={activeProperty}
                        subtitle={
                            range === 'all'
                                ? `${fmtInt(curReq.length)} bookings · ${fmtMoney(curRevenue, currency)} · all time`
                                : `${fmtInt(curReq.length)} bookings · ${fmtMoney(curRevenue, currency)} · last ${range === '365' ? '1 year' : `${range} days`}`
                        }
                        right={<RangeTabs value={range} onChange={(k: RangeKey) => setRange(k)} colors={colors} />}
                    />
                </div>

                <div data-hub-animate style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: colors.textMuted, fontSize: 12, fontWeight: 700 }}>
                        <Filter size={13} /> Segment
                    </span>
                    {useSelect ? (
                        <select
                            value={segFilter}
                            onChange={(e) => setSegFilter(e.target.value)}
                            aria-label="Segment filter"
                            style={{
                                padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                                background: colors.bg, color: colors.textMain, border: `1px solid ${colors.border}`,
                            }}
                        >
                            {segments.map((s) => (
                                <option key={s} value={s}>{s === 'all' ? 'All segments' : s}</option>
                            ))}
                        </select>
                    ) : (
                        <FilterChips
                            value={segFilter}
                            onChange={setSegFilter}
                            colors={colors}
                            options={segments.map((s) => ({ k: s, l: s === 'all' ? 'All' : s }))}
                        />
                    )}
                </div>

                {!hasData ? (
                    <EmptyState icon={DollarSign} text="No revenue in the selected period for this property." colors={colors} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div
                            data-hub-animate
                            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}
                        >
                            <MiniStat
                                label="Total Revenue"
                                value={fmtMoney(curRevenue, currency)}
                                sub={`Avg deal ${fmtMoney(avgDeal, currency)}`}
                                delta={delta(curRevenue, prevRevenue)}
                                icon={DollarSign}
                                colorKey="green"
                                colors={colors}
                            />
                            <MiniStat
                                label="Won Revenue"
                                value={fmtMoney(wonRevenue, currency)}
                                sub={`${fmtPct(curRevenue ? wonRevenue / curRevenue : 0)} of pipeline`}
                                icon={TrendingUp}
                                colorKey="blue"
                                colors={colors}
                            />
                            <MiniStat
                                label="Collected"
                                value={fmtMoney(curPaid, currency)}
                                sub={`${fmtPct(collectionRate)} collection rate`}
                                icon={Wallet}
                                colorKey="purple"
                                colors={colors}
                            />
                            <MiniStat
                                label="Outstanding"
                                value={fmtMoney(curOutstanding, currency)}
                                sub="still unpaid"
                                icon={Scale}
                                colorKey="orange"
                                colors={colors}
                            />
                        </div>

                        {/* Collection health — Meter, not fragile radial overlay */}
                        <Card title="Collection health" icon={Wallet} colors={colors}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
                                <div style={{ minWidth: 160 }}>
                                    <div style={{ color: colors.textMain, fontSize: 42, fontWeight: 900, lineHeight: 1 }}>
                                        {fmtPct(collectionRate, 0)}
                                    </div>
                                    <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>collected of billed</div>
                                </div>
                                <div style={{ flex: 1, minWidth: 220 }}>
                                    <Meter value={collectionRate} colors={colors} color={colors.green} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, fontWeight: 700 }}>
                                        <span style={{ color: colors.green }}>Collected {fmtMoney(curPaid, currency)}</span>
                                        <span style={{ color: colors.orange }}>Outstanding {fmtMoney(curOutstanding, currency)}</span>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Card title={`Revenue vs collected (${currency})`} icon={TrendingUp} colors={colors}>
                            {monthly.length ? (
                                <ResponsiveContainer width="100%" height={340}>
                                    <ComposedChart data={monthly} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="revMixPrev" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={colors.primary} stopOpacity={0.4} />
                                                <stop offset="100%" stopColor={colors.primary} stopOpacity={0.02} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid stroke={colors.grid} vertical={false} />
                                        <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} tickFormatter={(v: number) => fmtMoney(v, '').trim()} />
                                        <Tooltip {...tip(colors)} formatter={(v: any, n: any) => [money(v, currency), n]} />
                                        <Area type="monotone" dataKey="revenue" name="Revenue" stroke={colors.primary} fill="url(#revMixPrev)" strokeWidth={2} />
                                        <Line type="monotone" dataKey="paid" name="Collected" stroke={colors.green} strokeWidth={2} dot={false} />
                                        <Legend formatter={legendStyle(colors)} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={TrendingUp} text="No monthly trend" colors={colors} />}
                        </Card>

                        <Card title={`Paid vs outstanding by month (${currency})`} icon={Scale} colors={colors}>
                            {monthly.length ? (
                                <ResponsiveContainer width="100%" height={340}>
                                    <BarChart data={monthly} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                                        <CartesianGrid stroke={colors.grid} vertical={false} />
                                        <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} tickFormatter={(v: number) => fmtMoney(v, '').trim()} />
                                        <Tooltip {...tip(colors)} formatter={(v: any, n: any) => [money(v, currency), n]} cursor={{ fill: hexA(colors.primary, '12') }} />
                                        <Bar dataKey="paid" name="Collected" stackId="a" fill={colors.green} />
                                        <Bar dataKey="outstanding" name="Outstanding" stackId="a" fill={colors.orange} radius={[6, 6, 0, 0]} />
                                        <Legend formatter={legendStyle(colors)} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={Scale} text="No collection trend" colors={colors} />}
                        </Card>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))', gap: 18 }}>
                            <Card title={`Revenue by segment (${currency})`} icon={PieIcon} colors={colors}>
                                {bySegment.length ? (
                                    <ResponsiveContainer width="100%" height={320}>
                                        <BarChart data={bySegment} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                            <CartesianGrid stroke={colors.grid} horizontal={false} />
                                            <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} tickFormatter={(v: number) => fmtMoney(v, '').trim()} />
                                            <YAxis type="category" dataKey="name" width={120} tick={{ fill: colors.textMuted, fontSize: 11 }} />
                                            <Tooltip {...tip(colors)} formatter={(v: any) => [money(v, currency), 'Revenue']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                            <Bar dataKey="value" name="Revenue" radius={[0, 6, 6, 0]}>
                                                {bySegment.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : <EmptyState icon={PieIcon} text="No segment data" colors={colors} />}
                            </Card>

                            <Card title={`Top accounts (${currency})`} icon={DollarSign} colors={colors}>
                                {byAccount.length ? (
                                    <ResponsiveContainer width="100%" height={320}>
                                        <BarChart data={byAccount} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                            <CartesianGrid stroke={colors.grid} horizontal={false} />
                                            <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} tickFormatter={(v: number) => fmtMoney(v, '').trim()} />
                                            <YAxis type="category" dataKey="name" width={120} tick={{ fill: colors.textMuted, fontSize: 11 }} />
                                            <Tooltip {...tip(colors)} formatter={(v: any) => [money(v, currency), 'Revenue']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                            <Bar dataKey="value" name="Revenue" radius={[0, 6, 6, 0]}>
                                                {byAccount.map((_, i) => <Cell key={i} fill={pal[(i + 1) % pal.length]} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : <EmptyState icon={DollarSign} text="No account revenue" colors={colors} />}
                            </Card>

                            {byProperty.length > 1 && (
                                <Card title={`Revenue by property (${currency})`} icon={Building2} colors={colors}>
                                    <ResponsiveContainer width="100%" height={320}>
                                        <BarChart data={byProperty} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                            <CartesianGrid stroke={colors.grid} horizontal={false} />
                                            <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} tickFormatter={(v: number) => fmtMoney(v, '').trim()} />
                                            <YAxis type="category" dataKey="name" width={110} tick={{ fill: colors.textMuted, fontSize: 11 }} />
                                            <Tooltip {...tip(colors)} formatter={(v: any) => [money(v, currency), 'Revenue']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                            <Bar dataKey="value" name="Revenue" radius={[0, 6, 6, 0]}>
                                                {byProperty.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Card>
                            )}
                        </div>

                        {finByCategory.length > 0 ? (
                            <Card
                                title="Financials by category"
                                icon={PieIcon}
                                colors={colors}
                                right={
                                    <span style={{ color: colors.textMuted, fontSize: 11, fontWeight: 700 }}>
                                        {finDatedCount === financials.length
                                            ? (range === 'all' ? 'All time' : `Filtered to period`)
                                            : `${finInRange.length} dated rows · undated rows excluded`}
                                    </span>
                                }
                            >
                                <ResponsiveContainer width="100%" height={340}>
                                    <PieChart>
                                        <Pie data={finByCategory} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                                            {finByCategory.map((_, i) => <Cell key={i} fill={pal[(i + 3) % pal.length]} />)}
                                        </Pie>
                                        <Tooltip {...tip(colors)} formatter={(v: any) => [money(v, currency), '']} />
                                        <Legend formatter={legendStyle(colors)} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </Card>
                        ) : financials.length > 0 ? (
                            <EmptyState
                                icon={PieIcon}
                                text="Financial rows exist but none match this period (or have no date)."
                                colors={colors}
                            />
                        ) : null}
                    </div>
                )}
            </div>
        </PageShell>
    );
}
