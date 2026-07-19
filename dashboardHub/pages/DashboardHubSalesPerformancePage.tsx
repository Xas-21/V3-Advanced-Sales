/**
 * Sales Performance preview — won revenue aligned; Requests-by-rep + radar restored (033).
 */
import React, { useMemo, useState } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
    ComposedChart, Area, Line,
} from 'recharts';
import { Trophy, Target, DollarSign, CheckCircle2, Users, TrendingUp } from 'lucide-react';
import { formatCurrencyAmount, resolveCurrencyCode } from '../../currency';
import { useHubData } from '../HubDataContext';
import {
    hexA, num, fmtInt, tip, legendStyle,
    Card, MiniStat, RangeTabs, EmptyState, Hero, PageShell,
    rangeBounds, monthKey, type RangeKey,
} from '../analyticsKit';
import { requestTime, CHART_H, CHART_H_LG, GRID_2 } from '../hubPreviewShared';

function normStatus(s: any): string { return String(s || '').trim().toLowerCase(); }
function isWon(s: string): boolean { return ['confirmed', 'won', 'definite', 'actual', 'signed'].includes(s); }
function isLost(s: string): boolean { return ['cancelled', 'lost', 'expired'].includes(s); }
function resolveUserKey(req: any): string {
    const v = req?.createdByUserId;
    if (v != null && String(v).trim() !== '') return String(v).trim();
    return String(req?.createdBy || req?.owner || '').trim() || 'Unassigned';
}

export default function DashboardHubSalesPerformancePage({ colors }: { colors: any }) {
    const { requests, users, currency, activeProperty } = useHubData();
    const [range, setRange] = useState<RangeKey>('90');
    const cc = resolveCurrencyCode(currency || 'SAR');
    const fmtMoney = (n: number) => formatCurrencyAmount(n, cc);
    const { start } = useMemo(() => rangeBounds(range), [range]);

    const userById = useMemo(() => {
        const m = new Map<string, any>();
        users.forEach((u) => m.set(String(u.id), u));
        return m;
    }, [users]);

    const userName = (key: string): string => {
        if (!key || key === 'Unassigned') return 'Unassigned';
        const u = userById.get(key);
        return u ? (u.name || u.username || key) : key;
    };

    const filtered = useMemo(() => {
        if (range === 'all') return requests;
        return requests.filter((r) => {
            const t = requestTime(r);
            return !Number.isNaN(t) && t >= start;
        });
    }, [requests, start, range]);

    const repStats = useMemo(() => {
        const m = new Map<string, {
            requests: number; won: number; lost: number;
            wonRevenue: number; pendingRevenue: number; pending: number;
        }>();
        filtered.forEach((r) => {
            const key = resolveUserKey(r);
            if (!m.has(key)) m.set(key, { requests: 0, won: 0, lost: 0, wonRevenue: 0, pendingRevenue: 0, pending: 0 });
            const s = m.get(key)!;
            s.requests += 1;
            const st = normStatus(r.status);
            const v = num(r.totalCost);
            if (isWon(st)) { s.won += 1; s.wonRevenue += v; }
            else if (isLost(st)) { s.lost += 1; }
            else { s.pending += 1; s.pendingRevenue += v; }
        });
        const rows = Array.from(m.entries()).map(([key, v]) => {
            const decided = v.won + v.lost;
            return {
                key,
                name: userName(key),
                ...v,
                winRate: decided ? Math.round((v.won / decided) * 100) : 0,
            };
        });
        rows.sort((a, b) => b.wonRevenue - a.wonRevenue);
        return rows;
    }, [filtered, userName]);

    const leaderboard = useMemo(() => repStats.slice(0, 10), [repStats]);
    const topByRequests = useMemo(
        () => [...repStats].sort((a, b) => b.requests - a.requests).slice(0, 8),
        [repStats],
    );
    const topByWinRate = useMemo(
        () => [...repStats].filter((r) => r.won + r.lost >= 2).sort((a, b) => b.winRate - a.winRate).slice(0, 8),
        [repStats],
    );

    const revTrend = useMemo(() => {
        const m = new Map<string, { won: number; pending: number }>();
        filtered.forEach((r) => {
            const k = monthKey(r.requestDate || r.receivedDate || r.createdAt || r.checkIn);
            if (!k) return;
            if (!m.has(k)) m.set(k, { won: 0, pending: 0 });
            const st = normStatus(r.status);
            const v = num(r.totalCost);
            if (isWon(st)) m.get(k)!.won += v;
            else if (!isLost(st)) m.get(k)!.pending += v;
        });
        return Array.from(m.entries()).map(([month, v]) => ({
            month, won: Math.round(v.won), pending: Math.round(v.pending),
        })).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
    }, [filtered]);

    const totalRequests = filtered.length;
    const totalWon = filtered.filter((r) => isWon(normStatus(r.status))).length;
    const totalWonRevenue = filtered.reduce((s, r) => (isWon(normStatus(r.status)) ? s + num(r.totalCost) : s), 0);
    const repsWithDecisions = repStats.filter((r) => r.won + r.lost >= 1);
    const avgRepWinRate = repsWithDecisions.length
        ? Math.round(repsWithDecisions.reduce((s, r) => s + r.winRate, 0) / repsWithDecisions.length)
        : 0;
    const hasData = repStats.length > 0;
    const rangeLabel = range === 'all' ? 'all time' : range === '365' ? 'last year' : `last ${range} days`;

    return (
        <PageShell colors={colors} enterDeps={[range]}>
            <div style={{ padding: 4 }}>
                <div data-hub-animate>
                    <Hero
                        icon={Trophy}
                        title="Sales Performance"
                        colors={colors}
                        activeProperty={activeProperty}
                        subtitle={`${repStats.length} reps · ${totalRequests} requests · ${rangeLabel}`}
                        right={<RangeTabs value={range} onChange={setRange} colors={colors} />}
                    />
                </div>

                <div
                    data-hub-animate
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 16 }}
                >
                    <MiniStat label="Won revenue" value={fmtMoney(totalWonRevenue)} sub="confirmed bookings only" icon={DollarSign} colorKey="green" colors={colors} />
                    <MiniStat label="Won requests" value={fmtInt(totalWon)} sub={`of ${fmtInt(totalRequests)} in period`} icon={CheckCircle2} colorKey="blue" colors={colors} />
                    <MiniStat
                        label="Avg rep win rate"
                        value={`${avgRepWinRate}%`}
                        sub="won ÷ decided per rep"
                        icon={Target}
                        colorKey="purple"
                        colors={colors}
                    />
                    <MiniStat label="Active reps" value={fmtInt(repStats.length)} sub={rangeLabel} icon={Users} colorKey="orange" colors={colors} />
                </div>

                {!hasData ? (
                    <EmptyState icon={Users} text="No sales activity for this property in the selected period." colors={colors} />
                ) : (
                    <>
                        <div data-hub-animate style={{ display: 'grid', gridTemplateColumns: GRID_2, gap: 18, marginBottom: 18 }}>
                            <Card title={`Won revenue by rep (${currency})`} icon={DollarSign} colors={colors}>
                                <ResponsiveContainer width="100%" height={Math.max(CHART_H, leaderboard.length * 34)}>
                                    <BarChart data={leaderboard} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid stroke={colors.grid} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtMoney(v)} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                                        <Tooltip {...tip(colors)} formatter={(v: any) => [fmtMoney(Number(v)), 'Won revenue']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                        <Bar dataKey="wonRevenue" name="Won revenue" fill={colors.green} radius={[0, 6, 6, 0]} barSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Card>

                            <Card title="Requests by rep" icon={Users} colors={colors}>
                                <ResponsiveContainer width="100%" height={Math.max(CHART_H, topByRequests.length * 34)}>
                                    <BarChart data={topByRequests} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid stroke={colors.grid} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                                        <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                        <Bar dataKey="requests" name="Requests" fill={colors.blue} radius={[0, 6, 6, 0]} barSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Card>
                        </div>

                        <div data-hub-animate style={{ marginBottom: 18 }}>
                            <Card
                                title="Rep win rate (≥2 decided)"
                                icon={Target}
                                colors={colors}
                                right={<span style={{ color: colors.textMuted, fontSize: 11, fontWeight: 700 }}>not booking funnel win %</span>}
                            >
                                {topByWinRate.length ? (
                                    <ResponsiveContainer width="100%" height={Math.max(CHART_H, topByWinRate.length * 34)}>
                                        <BarChart data={topByWinRate} layout="vertical" margin={{ left: 8, right: 16 }}>
                                            <CartesianGrid stroke={colors.grid} horizontal={false} />
                                            <XAxis type="number" tickFormatter={(v: number) => `${v}%`} tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                                            <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                                            <Tooltip {...tip(colors)} formatter={(v: any) => [`${v}%`, 'Rep win rate']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                            <Bar dataKey="winRate" name="Rep win rate" fill={colors.purple} radius={[0, 6, 6, 0]} barSize={18} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : <EmptyState icon={Target} text="Need reps with at least 2 decided bookings." colors={colors} />}
                            </Card>
                        </div>

                        <div data-hub-animate style={{ marginBottom: 18 }}>
                            <Card title={`Won vs pending revenue by month (${currency})`} icon={TrendingUp} colors={colors}>
                                {revTrend.length ? (
                                    <ResponsiveContainer width="100%" height={CHART_H_LG}>
                                        <ComposedChart data={revTrend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="spPrevWon" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor={colors.green} stopOpacity={0.35} />
                                                    <stop offset="100%" stopColor={colors.green} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid stroke={colors.grid} vertical={false} />
                                            <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                            <YAxis tickFormatter={(v: number) => fmtMoney(v)} tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                            <Tooltip {...tip(colors)} formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
                                            <Area type="monotone" dataKey="won" name="Won" stroke={colors.green} fill="url(#spPrevWon)" strokeWidth={2} />
                                            <Line type="monotone" dataKey="pending" name="Pending" stroke={colors.blue} strokeWidth={2} dot={false} />
                                            <Legend formatter={legendStyle(colors)} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                ) : <EmptyState icon={TrendingUp} text="No revenue trend in this period." colors={colors} />}
                            </Card>
                        </div>

                        <Card title="Rep leaderboard" icon={Trophy} colors={colors}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ color: colors.textMuted, textAlign: 'left' }}>
                                            <th style={{ padding: '6px 8px' }}>#</th>
                                            <th style={{ padding: '6px 8px' }}>Rep</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Requests</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Won</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Rep win %</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Won rev.</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Pending rev.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboard.map((r, i) => (
                                            <tr key={r.key} style={{ color: colors.textMain, borderTop: `1px solid ${colors.border}` }}>
                                                <td style={{ padding: '6px 8px', color: i === 0 ? colors.primary : colors.textMuted, fontWeight: 700 }}>{i + 1}</td>
                                                <td style={{ padding: '6px 8px' }}>{r.name}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtInt(r.requests)}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtInt(r.won)}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.winRate}%</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtMoney(r.wonRevenue)}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtMoney(r.pendingRevenue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </>
                )}
            </div>
        </PageShell>
    );
}
