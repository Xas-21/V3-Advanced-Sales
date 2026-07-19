/**

 * Accounts preview — portfolio composition lens (types, geography, concentration).

 * Range filters creation & activity consistently. One revenue chart only (labeled).

 */

import React, { useMemo, useState } from 'react';

import {

    ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,

    CartesianGrid, Legend, ComposedChart, Area, Line,

} from 'recharts';

import { Users, Building2, FileText, TrendingUp, CalendarDays, MapPin, Layers } from 'lucide-react';

import { useHubData } from '../HubDataContext';

import {

    hexA, num, fmtInt, fmtMoney, money, fmtPct, delta, tip, legendStyle, palette,

    Card, MiniStat, RangeTabs, EmptyState, Hero, Meter, PageShell,

    rangeBounds, monthKey, inRange, type RangeKey,

} from '../analyticsKit';

import { requestTime, CHART_H, CHART_H_LG, GRID_2 } from '../hubPreviewShared';



function asArr(v: any): any[] { return Array.isArray(v) ? v : []; }



function accountTouchedInPeriod(a: any, start: number, reqAccountIds: Set<string>): boolean {

    if (reqAccountIds.has(String(a.id))) return true;

    return asArr(a.activities).some((act: any) => inRange(act.at || act.date, start));

}



export default function DashboardHubAccountsPage({ colors }: { colors: any }) {

    const { accounts, requests, currency, activeProperty } = useHubData();

    const [range, setRange] = useState<RangeKey>('90');

    const { start, prevStart, prevEnd } = useMemo(() => rangeBounds(range), [range]);

    const pal = palette(colors);



    const reqsInPeriod = useMemo(() => {

        if (range === 'all') return requests;

        return requests.filter((r) => {

            const t = requestTime(r);

            return !Number.isNaN(t) && t >= start;

        });

    }, [requests, start, range]);



    const reqAccountIds = useMemo(() => {

        const s = new Set<string>();

        reqsInPeriod.forEach((r) => {

            const id = String(r.accountId || '').trim();

            if (id) s.add(id);

        });

        return s;

    }, [reqsInPeriod]);



    const activeInPeriod = useMemo(() => {

        if (range === 'all') {

            const ids = new Set(requests.map((r) => String(r.accountId || '').trim()).filter(Boolean));

            return accounts.filter((a) => ids.has(String(a.id)));

        }

        return accounts.filter((a) => accountTouchedInPeriod(a, start, reqAccountIds));

    }, [accounts, range, start, reqAccountIds, requests]);



    const newAccounts = useMemo(() => accounts.filter((a) => inRange(a.createdAt, start)), [accounts, start]);

    const newPrev = useMemo(() => accounts.filter((a) => {

        const t = new Date(a.createdAt).getTime();

        return !Number.isNaN(t) && t >= prevStart && t < prevEnd;

    }), [accounts, prevStart, prevEnd]);



    const activitiesInPeriod = useMemo(() => {

        let n = 0;

        for (const a of accounts) {

            for (const act of asArr(a.activities)) {

                if (inRange(act.at || act.date, start)) n++;

            }

        }

        return n;

    }, [accounts, start]);



    const types = useMemo(() => {

        const m = new Map<string, number>();

        activeInPeriod.forEach((a) => {

            const k = String(a.type || 'Unspecified').trim() || 'Unspecified';

            m.set(k, (m.get(k) || 0) + 1);

        });

        return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    }, [activeInPeriod]);



    const countries = useMemo(() => {

        const m = new Map<string, number>();

        activeInPeriod.forEach((a) => {

            const k = String(a.country || a.city || 'Unknown').trim() || 'Unknown';

            m.set(k, (m.get(k) || 0) + 1);

        });

        return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);

    }, [activeInPeriod]);



    const accName = (id: string) => {

        const acc = accounts.find((a) => String(a.id) === id);

        if (acc?.name) return acc.name;

        const r = requests.find((x) => String(x.accountId) === id);

        return r?.account || `Account ${id.slice(0, 6)}`;

    };



    const byAccountInPeriod = useMemo(() => {

        const m = new Map<string, { count: number; revenue: number }>();

        reqsInPeriod.forEach((r) => {

            const id = String(r.accountId || '').trim();

            if (!id) return;

            if (!m.has(id)) m.set(id, { count: 0, revenue: 0 });

            const s = m.get(id)!;

            s.count += 1;

            s.revenue += num(r.totalCost);

        });

        return Array.from(m.entries()).map(([id, v]) => ({

            id, name: accName(id), count: v.count, revenue: Math.round(v.revenue),

        }));

    }, [reqsInPeriod, accounts, requests]);



    const topByReq = useMemo(() => [...byAccountInPeriod].sort((a, b) => b.count - a.count).slice(0, 10), [byAccountInPeriod]);

    const topByAttributedRev = useMemo(

        () => [...byAccountInPeriod].filter((a) => a.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8),

        [byAccountInPeriod],

    );



    const totalAttributedRev = useMemo(() => byAccountInPeriod.reduce((s, a) => s + a.revenue, 0), [byAccountInPeriod]);

    const top3Share = useMemo(() => {

        if (!totalAttributedRev) return 0;

        const top3 = [...byAccountInPeriod].sort((a, b) => b.revenue - a.revenue).slice(0, 3);

        return top3.reduce((s, a) => s + a.revenue, 0) / totalAttributedRev;

    }, [byAccountInPeriod, totalAttributedRev]);



    const creationTrend = useMemo(() => {

        const m = new Map<string, number>();

        accounts.forEach((a) => {

            if (!inRange(a.createdAt, start)) return;

            const k = monthKey(a.createdAt);

            if (k) m.set(k, (m.get(k) || 0) + 1);

        });

        return Array.from(m.entries()).map(([month, value]) => ({ month, value })).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);

    }, [accounts, start]);



    const activityTrend = useMemo(() => {

        const m = new Map<string, number>();

        accounts.forEach((a) => {

            asArr(a.activities).forEach((act: any) => {

                if (!inRange(act.at || act.date, start)) return;

                const k = monthKey(act.at || act.date);

                if (k) m.set(k, (m.get(k) || 0) + 1);

            });

        });

        return Array.from(m.entries()).map(([month, value]) => ({ month, value })).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);

    }, [accounts, start]);



    const trendData = useMemo(() => {

        const months = new Set([...creationTrend.map((c) => c.month), ...activityTrend.map((a) => a.month)]);

        return Array.from(months).sort().map((month) => ({

            month,

            created: creationTrend.find((c) => c.month === month)?.value || 0,

            activities: activityTrend.find((a) => a.month === month)?.value || 0,

        }));

    }, [creationTrend, activityTrend]);



    const rangeLabel = range === 'all' ? 'all time' : range === '365' ? 'last year' : `last ${range} days`;

    const hasData = accounts.length > 0;

    const periodHasActivity = activeInPeriod.length > 0 || newAccounts.length > 0;



    return (

        <PageShell colors={colors} enterDeps={[range]}>

            <div style={{ padding: 4 }}>

                <div data-hub-animate>

                    <Hero

                        icon={Users}

                        title="Account Portfolio"

                        colors={colors}

                        activeProperty={activeProperty}

                        subtitle={`${accounts.length} accounts · ${activeInPeriod.length} active in ${rangeLabel}`}

                        right={<RangeTabs value={range} onChange={setRange} colors={colors} />}

                    />

                </div>



                {!hasData ? (

                    <EmptyState icon={Users} text="No accounts for this property yet." colors={colors} />

                ) : !periodHasActivity ? (

                    <EmptyState icon={Users} text="No account creation or activity in the selected period." colors={colors} />

                ) : (

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                        <div

                            data-hub-animate

                            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}

                        >

                            <MiniStat

                                label="Portfolio size"

                                value={fmtInt(accounts.length)}

                                sub={`${fmtInt(activeInPeriod.length)} touched in period`}

                                icon={Building2}

                                colorKey="blue"

                                colors={colors}

                            />

                            <MiniStat

                                label={`New (${range === 'all' ? 'all' : `${range}d`})`}

                                value={fmtInt(newAccounts.length)}

                                delta={range !== 'all' ? delta(newAccounts.length, newPrev.length) : undefined}

                                icon={CalendarDays}

                                colorKey="green"

                                colors={colors}

                            />

                            <MiniStat

                                label="Active in period"

                                value={fmtInt(activeInPeriod.length)}

                                sub={`${accounts.length ? fmtPct(activeInPeriod.length / accounts.length) : '0%'} of base`}

                                icon={Users}

                                colorKey="purple"

                                colors={colors}

                            />

                            <MiniStat

                                label="Activities logged"

                                value={fmtInt(activitiesInPeriod)}

                                sub={rangeLabel}

                                icon={FileText}

                                colorKey="orange"

                                colors={colors}

                            />

                        </div>



                        {totalAttributedRev > 0 && (

                            <Card title="Request concentration" icon={Layers} colors={colors}>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>

                                    <div style={{ minWidth: 140 }}>

                                        <div style={{ color: colors.textMain, fontSize: 42, fontWeight: 900, lineHeight: 1 }}>

                                            {fmtPct(top3Share, 0)}

                                        </div>

                                        <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>

                                            top 3 accounts · account-attributed request revenue

                                        </div>

                                    </div>

                                    <div style={{ flex: 1, minWidth: 220 }}>

                                        <Meter value={top3Share} colors={colors} color={colors.orange} />

                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, fontWeight: 700 }}>

                                            <span style={{ color: colors.orange }}>Top 3 {fmtMoney(

                                                [...byAccountInPeriod].sort((a, b) => b.revenue - a.revenue).slice(0, 3).reduce((s, a) => s + a.revenue, 0),

                                                currency,

                                            )}</span>

                                            <span style={{ color: colors.textMuted }}>Period total {fmtMoney(totalAttributedRev, currency)}</span>

                                        </div>

                                    </div>

                                </div>

                            </Card>

                        )}



                        {trendData.length > 0 ? (

                            <Card title="Creation vs CRM activity" icon={TrendingUp} colors={colors}>

                                <ResponsiveContainer width="100%" height={CHART_H_LG}>

                                    <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>

                                        <defs>

                                            <linearGradient id="accPrevCreate" x1="0" y1="0" x2="0" y2="1">

                                                <stop offset="0%" stopColor={colors.blue} stopOpacity={0.35} />

                                                <stop offset="100%" stopColor={colors.blue} stopOpacity={0} />

                                            </linearGradient>

                                        </defs>

                                        <CartesianGrid stroke={colors.grid} vertical={false} />

                                        <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />

                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} stroke={colors.grid} />

                                        <Tooltip {...tip(colors)} />

                                        <Area type="monotone" dataKey="created" name="New accounts" stroke={colors.blue} fill="url(#accPrevCreate)" strokeWidth={2} />

                                        <Line type="monotone" dataKey="activities" name="CRM activities" stroke={colors.orange} strokeWidth={2} dot={false} />

                                        <Legend formatter={legendStyle(colors)} />

                                    </ComposedChart>

                                </ResponsiveContainer>

                            </Card>

                        ) : (

                            <EmptyState icon={TrendingUp} text="No creation or activity trend in this period." colors={colors} />

                        )}



                        <div data-hub-animate style={{ display: 'grid', gridTemplateColumns: GRID_2, gap: 18 }}>

                            <Card title="Type mix (active in period)" icon={Building2} colors={colors}>

                                {types.length ? (

                                    <ResponsiveContainer width="100%" height={CHART_H}>

                                        <PieChart>

                                            <Pie data={types} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={55} paddingAngle={2}>

                                                {types.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}

                                            </Pie>

                                            <Tooltip {...tip(colors)} />

                                            <Legend formatter={legendStyle(colors)} />

                                        </PieChart>

                                    </ResponsiveContainer>

                                ) : <EmptyState icon={Building2} text="No accounts active in period." colors={colors} />}

                            </Card>



                            <Card title="Geography (active in period)" icon={MapPin} colors={colors}>

                                {countries.length ? (

                                    <ResponsiveContainer width="100%" height={CHART_H}>

                                        <BarChart data={countries} layout="vertical" margin={{ left: 8, right: 16 }}>

                                            <CartesianGrid stroke={colors.grid} horizontal={false} />

                                            <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />

                                            <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={100} />

                                            <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />

                                            <Bar dataKey="value" name="Accounts" fill={colors.cyan || colors.blue} radius={[0, 6, 6, 0]} barSize={16} />

                                        </BarChart>

                                    </ResponsiveContainer>

                                ) : <EmptyState icon={MapPin} text="No location data for active accounts." colors={colors} />}

                            </Card>

                        </div>



                        {topByAttributedRev.length > 0 ? (

                            <Card

                                title={`Account-attributed request revenue (${currency})`}

                                icon={FileText}

                                colors={colors}

                                right={<span style={{ color: colors.textMuted, fontSize: 11, fontWeight: 700 }}>{rangeLabel} · not hotel P&amp;L</span>}

                            >

                                <ResponsiveContainer width="100%" height={CHART_H}>

                                    <BarChart data={topByAttributedRev} layout="vertical" margin={{ left: 8, right: 16 }}>

                                        <CartesianGrid stroke={colors.grid} horizontal={false} />

                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtMoney(v, '').trim()} />

                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={130} />

                                        <Tooltip {...tip(colors)} formatter={(v: any) => [money(v, currency), 'Attributed revenue']} cursor={{ fill: hexA(colors.primary, '12') }} />

                                        <Bar dataKey="revenue" name="Attributed revenue" radius={[0, 6, 6, 0]} barSize={18}>

                                            {topByAttributedRev.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}

                                        </Bar>

                                    </BarChart>

                                </ResponsiveContainer>

                            </Card>

                        ) : reqsInPeriod.length > 0 ? (

                            <EmptyState icon={FileText} text="Requests in period lack account links for attribution." colors={colors} />

                        ) : null}



                        <Card title="Top accounts by request volume" icon={FileText} colors={colors}>

                            {topByReq.length ? (

                                <div style={{ overflowX: 'auto' }}>

                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>

                                        <thead>

                                            <tr style={{ color: colors.textMuted, textAlign: 'left' }}>

                                                <th style={{ padding: '6px 8px' }}>#</th>

                                                <th style={{ padding: '6px 8px' }}>Account</th>

                                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Requests</th>

                                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Share</th>

                                            </tr>

                                        </thead>

                                        <tbody>

                                            {topByReq.map((r, i) => (

                                                <tr key={r.id} style={{ color: colors.textMain, borderTop: `1px solid ${colors.border}` }}>

                                                    <td style={{ padding: '6px 8px', color: i === 0 ? colors.primary : colors.textMuted, fontWeight: 700 }}>{i + 1}</td>

                                                    <td style={{ padding: '6px 8px' }}>{r.name}</td>

                                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{fmtInt(r.count)}</td>

                                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: colors.textMuted }}>

                                                        {reqsInPeriod.length ? fmtPct(r.count / reqsInPeriod.length) : '—'}

                                                    </td>

                                                </tr>

                                            ))}

                                        </tbody>

                                    </table>

                                </div>

                            ) : <EmptyState icon={FileText} text="No linked requests in this period." colors={colors} />}

                        </Card>

                    </div>

                )}

            </div>

        </PageShell>

    );

}


