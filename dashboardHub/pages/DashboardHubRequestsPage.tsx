import React, { useMemo, useState } from 'react';
import {
    BarChart, Bar, Line, PieChart, Pie, Cell,
    XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, Legend,
    ComposedChart, ScatterChart, Scatter, ZAxis, RadialBarChart, RadialBar,
} from 'recharts';
import { Inbox, DollarSign, Tag, Ban, TrendingUp, Building2, CheckCircle2, Clock, Filter } from 'lucide-react';
import { useHubData } from '../HubDataContext';
import {
    hexA, num, fmtInt, fmtMoney, money, fmtPct, groupBy, delta, tip, legendStyle, palette,
    Card, MiniStat, RangeTabs, FilterChips, EmptyState, Hero, rangeBounds, monthKey, type RangeKey,
} from '../analyticsKit';

const STATUS_ORDER = ['Inquiry', 'Tentative', 'Confirmed', 'Cancelled'];

/** Match AS.tsx dashboard dating: requestDate → receivedDate → createdAt → checkIn. */
function requestWhen(r: any): string {
    return String(r.requestDate || r.receivedDate || r.createdAt || r.checkIn || '');
}

function requestTime(r: any): number {
    const t = new Date(requestWhen(r)).getTime();
    return Number.isNaN(t) ? NaN : t;
}

function aggReq(arr: any[]) {
    let confirmedValue = 0, adrSum = 0, adrN = 0, cancelled = 0, confirmed = 0, revenue = 0, roomNights = 0;
    for (const r of arr) {
        const v = num(r.totalCost); revenue += v;
        const st = (r.status || '').toLowerCase();
        if (st === 'confirmed') { confirmedValue += v; confirmed++; }
        if (st === 'cancelled') cancelled++;
        const a = num(r.adr); if (a > 0) { adrSum += a; adrN++; }
        const nights = num(r.nights);
        const roomsCount = Array.isArray(r.rooms) ? r.rooms.reduce((s: number, x: any) => s + num(x.count), 0) : 0;
        roomNights += nights * (roomsCount || 1);
    }
    return {
        count: arr.length, confirmedValue, revenue, confirmed,
        avgAdr: adrN ? adrSum / adrN : 0,
        cancelled, cancelRate: arr.length ? cancelled / arr.length : 0,
        winRate: arr.length ? confirmed / arr.length : 0,
        roomNights,
    };
}

export default function DashboardHubRequestsPage({ colors }: { colors: any }) {
    const { requests, properties, currency, activeProperty } = useHubData();
    const [range, setRange] = useState<RangeKey>('90');
    const [segFilter, setSegFilter] = useState<string>('all');

    const { start, prevStart, prevEnd } = useMemo(() => rangeBounds(range), [range]);

    const segments = useMemo(() => {
        const s = new Set<string>();
        for (const r of requests) s.add(r.segment || 'Unknown');
        return ['all', ...Array.from(s).sort()];
    }, [requests]);

    const withinSeg = (r: any) => segFilter === 'all' || (r.segment || 'Unknown') === segFilter;

    const current = useMemo(() => requests.filter((r) => {
        if (!withinSeg(r)) return false;
        if (range === 'all') return true;
        const t = requestTime(r);
        return !Number.isNaN(t) && t >= start;
    }), [requests, start, range, segFilter]);

    const previous = useMemo(() => {
        if (range === 'all') return [];
        return requests.filter((r) => {
            if (!withinSeg(r)) return false;
            const t = requestTime(r);
            return !Number.isNaN(t) && t >= prevStart && t < prevEnd;
        });
    }, [requests, prevStart, prevEnd, range, segFilter]);

    const propMap = useMemo(() => Object.fromEntries(properties.map((p) => [p.id, p.name])), [properties]);
    const a = useMemo(() => aggReq(current), [current]);
    const pa = useMemo(() => aggReq(previous), [previous]);
    const pal = palette(colors);

    const statusMix = useMemo(() => {
        const m = groupBy(current, (r) => r.status || 'Unknown');
        return Object.entries(m).map(([k, v]) => ({ name: k, value: v.length })).sort((x, y) => y.value - x.value);
    }, [current]);

    const funnel = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const r of current) { const s = r.status || 'Unknown'; counts[s] = (counts[s] || 0) + 1; }
        return STATUS_ORDER.filter((s) => counts[s]).map((s, i) => ({ name: s, value: counts[s], fill: pal[i % pal.length] }));
    }, [current, pal]);

    const segmentRev = useMemo(() => {
        const m: Record<string, { count: number; revenue: number }> = {};
        for (const r of current) {
            const k = r.segment || 'Unknown';
            if (!m[k]) m[k] = { count: 0, revenue: 0 };
            m[k].count++; m[k].revenue += num(r.totalCost);
        }
        return Object.entries(m).map(([name, v]) => ({ name, count: v.count, revenue: Math.round(v.revenue) })).sort((x, y) => y.revenue - x.revenue);
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
            const k = monthKey(requestWhen(r)); if (!k) continue;
            if (!map[k]) map[k] = { month: k, count: 0, revenue: 0, adrSum: 0, adrN: 0, cancelled: 0 };
            map[k].count += 1;
            map[k].revenue += num(r.totalCost);
            const ar = num(r.adr); if (ar > 0) { map[k].adrSum += ar; map[k].adrN += 1; }
            if ((r.status || '').toLowerCase() === 'cancelled') map[k].cancelled += 1;
        }
        return Object.keys(map).sort().map((k) => ({
            month: map[k].month, count: map[k].count, revenue: Math.round(map[k].revenue),
            adr: map[k].adrN ? Math.round(map[k].adrSum / map[k].adrN) : 0, cancelled: map[k].cancelled,
        }));
    }, [current]);

    const leadBuckets = useMemo(() => {
        const defs: [string, number, number][] = [['0–7d', 0, 7], ['8–30d', 8, 30], ['31–90d', 31, 90], ['90d+', 91, 1e9]];
        const arr = defs.map(([name]) => ({ name, value: 0 }));
        for (const r of current) {
            const c = requestTime(r);
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

    const scatter = useMemo(() => {
        const pts: any[] = [];
        for (const r of current) {
            const c = requestTime(r);
            const ci = new Date(r.checkIn).getTime();
            const adr = num(r.adr);
            if (Number.isNaN(c) || Number.isNaN(ci) || adr <= 0) continue;
            const lead = Math.round((ci - c) / 86400000);
            if (lead < 0 || lead > 400) continue;
            pts.push({ lead, adr, value: num(r.totalCost) });
        }
        return pts;
    }, [current]);

    const crDelta = (() => {
        if (!pa.cancelRate) return { txt: a.cancelRate > 0 ? '▲ new' : '—', good: a.cancelRate === 0, pct: 0 };
        const d = (a.cancelRate - pa.cancelRate) / pa.cancelRate;
        return { txt: `${a.cancelRate >= pa.cancelRate ? '▲' : '▼'} ${fmtPct(Math.abs(d), 0)} vs prev`, good: a.cancelRate <= pa.cancelRate, pct: d };
    })();

    const hasData = current.length > 0;

    return (
        <div style={{ padding: 4 }}>
            <Hero
                icon={Inbox} title="Request Analytics" colors={colors} activeProperty={activeProperty}
                subtitle={
                    range === 'all'
                        ? `${fmtInt(current.length)} requests · all time`
                        : `${fmtInt(current.length)} requests · last ${range === '365' ? '1 year' : `${range} days`}`
                }
                right={<RangeTabs value={range} onChange={(k: RangeKey) => setRange(k)} colors={colors} />}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: colors.textMuted, fontSize: 12, fontWeight: 700 }}>
                    <Filter size={13} /> Segment
                </span>
                <FilterChips value={segFilter} onChange={setSegFilter} colors={colors}
                    options={segments.map((s) => ({ k: s, l: s === 'all' ? 'All' : s }))} />
            </div>

            {!hasData ? (
                <EmptyState icon={Inbox} text="No requests in the selected period for this property." colors={colors} />
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 16 }}>
                        <MiniStat label="Total Requests" value={fmtInt(a.count)} delta={delta(a.count, pa.count)} icon={Inbox} colorKey="blue" colors={colors} />
                        <MiniStat label="Confirmed Value" value={fmtMoney(a.confirmedValue, currency)} sub={`${fmtInt(a.confirmed)} confirmed`} delta={delta(a.confirmedValue, pa.confirmedValue)} icon={DollarSign} colorKey="green" colors={colors} />
                        <MiniStat label="Win Rate" value={fmtPct(a.winRate)} delta={delta(a.winRate, pa.winRate)} icon={CheckCircle2} colorKey="purple" colors={colors} />
                        <MiniStat label="Avg ADR" value={money(a.avgAdr, currency)} delta={delta(a.avgAdr, pa.avgAdr)} icon={Tag} colorKey="orange" colors={colors} />
                        <MiniStat label="Cancel Rate" value={fmtPct(a.cancelRate)} delta={crDelta} icon={Ban} colorKey="red" colors={colors} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        {/* Full-width trend charts */}
                        <Card title="Volume & ADR Trend" icon={TrendingUp} colors={colors}>
                            <ResponsiveContainer width="100%" height={340}>
                                <ComposedChart data={monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="rqVol" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={colors.primary} stopOpacity={0.45} />
                                            <stop offset="100%" stopColor={colors.primary} stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke={colors.grid} vertical={false} />
                                    <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                    <YAxis yAxisId="l" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                    <YAxis yAxisId="r" orientation="right" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                    <Tooltip {...tip(colors)} />
                                    <Area yAxisId="l" type="monotone" dataKey="count" name="Requests" stroke={colors.primary} fill="url(#rqVol)" strokeWidth={2} />
                                    <Line yAxisId="r" type="monotone" dataKey="adr" name={`ADR (${currency})`} stroke={colors.green} strokeWidth={2} dot={false} />
                                    <Legend formatter={legendStyle(colors)} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card title={`Revenue Trend (${currency})`} icon={DollarSign} colors={colors}>
                            <ResponsiveContainer width="100%" height={340}>
                                <AreaChart data={monthly} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="rqRev" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={colors.green} stopOpacity={0.45} />
                                            <stop offset="100%" stopColor={colors.green} stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke={colors.grid} vertical={false} />
                                    <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                    <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} tickFormatter={(v: number) => fmtMoney(v, '').trim()} />
                                    <Tooltip {...tip(colors)} formatter={(v: any) => [money(v, currency), 'Revenue']} />
                                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke={colors.green} fill="url(#rqRev)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </Card>

                        {/* Mid charts: ~2 per row */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))', gap: 18 }}>
                            <Card title="Pipeline Funnel" icon={Filter} colors={colors}>
                                {funnel.length ? (
                                    <ResponsiveContainer width="100%" height={320}>
                                        <RadialBarChart innerRadius="25%" outerRadius="100%" data={funnel} startAngle={90} endAngle={-270}>
                                            <RadialBar background dataKey="value" cornerRadius={6} />
                                            <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right" formatter={legendStyle(colors)} />
                                            <Tooltip {...tip(colors)} />
                                        </RadialBarChart>
                                    </ResponsiveContainer>
                                ) : <EmptyState icon={Filter} text="No status data" colors={colors} />}
                            </Card>

                            <Card title="Status Mix" icon={Inbox} colors={colors}>
                                <ResponsiveContainer width="100%" height={320}>
                                    <PieChart>
                                        <Pie data={statusMix} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                                            {statusMix.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}
                                        </Pie>
                                        <Tooltip {...tip(colors)} />
                                        <Legend formatter={legendStyle(colors)} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </Card>

                            <Card title={`Revenue by Segment (${currency})`} icon={Tag} colors={colors}>
                                {segmentRev.length ? (
                                    <ResponsiveContainer width="100%" height={320}>
                                        <BarChart data={segmentRev} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                                            <CartesianGrid stroke={colors.grid} vertical={false} />
                                            <XAxis dataKey="name" tick={{ fill: colors.textMuted, fontSize: 10 }} stroke={colors.grid} interval={0} angle={-12} textAnchor="end" height={48} />
                                            <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} tickFormatter={(v: number) => fmtMoney(v, '').trim()} />
                                            <Tooltip {...tip(colors)} formatter={(v: any, n: any) => [n === 'revenue' ? money(v, currency) : fmtInt(v), n === 'revenue' ? 'Revenue' : 'Requests']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                            <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]}>
                                                {segmentRev.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : <EmptyState icon={Tag} text="No segment data" colors={colors} />}
                            </Card>

                            <Card title={`Top Accounts by Revenue (${currency})`} icon={DollarSign} colors={colors}>
                                {byAccount.length ? (
                                    <ResponsiveContainer width="100%" height={320}>
                                        <BarChart data={byAccount} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                            <CartesianGrid stroke={colors.grid} horizontal={false} />
                                            <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} tickFormatter={(v: number) => fmtMoney(v, '').trim()} />
                                            <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} width={110} />
                                            <Tooltip {...tip(colors)} formatter={(v: any) => [money(v, currency), 'Revenue']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                            <Bar dataKey="value" name="Revenue" radius={[0, 6, 6, 0]}>
                                                {byAccount.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : <EmptyState icon={DollarSign} text="No account revenue" colors={colors} />}
                            </Card>

                            {byProp.length > 1 && (
                                <Card title="Requests by Property" icon={Building2} colors={colors}>
                                    <ResponsiveContainer width="100%" height={320}>
                                        <BarChart data={byProp} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                                            <CartesianGrid stroke={colors.grid} vertical={false} />
                                            <XAxis dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} interval={0} angle={-12} textAnchor="end" height={50} />
                                            <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} allowDecimals={false} />
                                            <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                            <Bar dataKey="value" name="Requests" radius={[6, 6, 0, 0]}>
                                                {byProp.map((_, i) => <Cell key={i} fill={pal[(i + 1) % pal.length]} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Card>
                            )}
                        </div>

                        {/* Full-width dense charts (1Y / All need room) */}
                        <Card title="Lead Time vs ADR" icon={Clock} colors={colors}>
                            {scatter.length ? (
                                <ResponsiveContainer width="100%" height={360}>
                                    <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                                        <CartesianGrid stroke={colors.grid} />
                                        <XAxis type="number" dataKey="lead" name="Lead (days)" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                        <YAxis type="number" dataKey="adr" name="ADR" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                        <ZAxis type="number" dataKey="value" range={[40, 400]} />
                                        <Tooltip {...tip(colors)} cursor={{ strokeDasharray: '3 3' }} formatter={(v: any, n: any) => [n === 'ADR' ? money(v, currency) : fmtInt(v), n]} />
                                        <Scatter data={scatter} fill={hexA(colors.purple, 'aa')} />
                                    </ScatterChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={Clock} text="No lead-time data" colors={colors} />}
                        </Card>

                        <Card title="Booking Lead Time" icon={Clock} colors={colors}>
                            <ResponsiveContainer width="100%" height={340}>
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
                            <ResponsiveContainer width="100%" height={340}>
                                <BarChart data={monthly} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
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
