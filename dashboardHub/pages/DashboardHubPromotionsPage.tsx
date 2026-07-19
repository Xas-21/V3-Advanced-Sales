/**

 * Promotions preview — campaign effectiveness & linked-request usage.

 * Range defaults to 90d; MiniStats and charts share the same filtered set.

 */

import React, { useMemo, useState } from 'react';

import {

    ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,

    CartesianGrid, Legend, AreaChart, Area,

} from 'recharts';

import { Megaphone, Tag, CalendarCheck, CalendarX, Percent, Link2, TrendingUp, FileEdit } from 'lucide-react';

import { getEventDateWindow } from '../../beoShared';

import { useHubData } from '../HubDataContext';

import {

    hexA, num, fmtInt, fmtMoney, fmtPct, tip, legendStyle, palette,

    Card, MiniStat, RangeTabs, FilterChips, EmptyState, Hero, Meter, PageShell,

    rangeBounds, monthKey, inRange, type RangeKey,

} from '../analyticsKit';

import { requestTime, CHART_H, CHART_H_LG, GRID_2 } from '../hubPreviewShared';



function parseYmd(raw: any): string {

    if (!raw) return '';

    const s = String(raw).slice(0, 10);

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const dt = new Date(raw);

    return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);

}



function effectiveStatus(p: any, today: string): string {

    const s = String(p.status || '').trim();

    const end = parseYmd(p.endDate);

    const start = parseYmd(p.startDate);

    if (s === 'Draft') return 'Draft';

    if (end && end < today) return 'Expired';

    if (start && end && start <= today && today <= end) return 'Active';

    if (s === 'Active') return 'Active';

    if (start && start > today) return 'Scheduled';

    return s || 'Draft';

}



const norm = (v: unknown) => String(v || '').trim().toLowerCase();



function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {

    if (!aStart || !aEnd || !bStart || !bEnd) return false;

    return !(aEnd < bStart || bEnd < aStart);

}



export default function DashboardHubPromotionsPage({ colors }: { colors: any }) {

    const { promotions, requests, currency, activeProperty } = useHubData();

    const [range, setRange] = useState<RangeKey>('90');

    const [statusFilter, setStatusFilter] = useState<string>('all');

    const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

    const { start } = useMemo(() => rangeBounds(range), [range]);

    const pal = palette(colors);



    const enriched = useMemo(() => promotions.map((p) => ({ ...p, _status: effectiveStatus(p, today) })), [promotions, today]);



    const filteredPromos = useMemo(() => enriched.filter((p) => {

        if (range !== 'all' && !inRange(p.startDate || p.createdAt, start)) return false;

        if (statusFilter !== 'all' && p._status !== statusFilter) return false;

        return true;

    }), [enriched, start, range, statusFilter]);



    const reqsInPeriod = useMemo(() => {

        if (range === 'all') return requests.filter((r) => norm(r.status) !== 'cancelled');

        return requests.filter((r) => {

            if (norm(r.status) === 'cancelled') return false;

            const t = requestTime(r);

            return !Number.isNaN(t) && t >= start;

        });

    }, [requests, start, range]);



    const promoIdsInFilter = useMemo(() => new Set(filteredPromos.map((p) => String(p.id))), [filteredPromos]);



    const reqToPromotionId = useMemo(() => {

        const map = new Map<string, string>();

        for (const req of requests) {

            if (norm(req?.status) === 'cancelled') continue;

            const reqId = String(req?.id || '').trim();

            if (!reqId) continue;

            const explicit = String(req?.promotionId || '').trim();

            if (explicit) {

                map.set(reqId, explicit);

                continue;

            }

            const reqSeg = norm(req?.segment);

            const reqAcc = String(req?.accountId || '').trim();

            if (!reqSeg || !reqAcc) continue;

            const window = getEventDateWindow(req);

            const wStart = String(window.start || '').slice(0, 10);

            const wEnd = String(window.end || wStart).slice(0, 10);

            const matches = enriched.filter((p) => {

                if (!p?.startDate || !p?.endDate) return false;

                const segmentOk = (p.segments || []).some((s: string) => norm(s) === reqSeg);

                if (!segmentOk) return false;

                const accountOk = (p.linkedAccounts || []).some((a: any) => String(a?.accountId || '') === reqAcc);

                if (!accountOk) return false;

                return overlaps(wStart, wEnd, parseYmd(p.startDate), parseYmd(p.endDate));

            });

            if (matches.length === 1) map.set(reqId, String(matches[0].id));

        }

        return map;

    }, [requests, enriched]);



    const usageByPromo = useMemo(() => {

        const out = new Map<string, { requests: number; revenue: number }>();

        for (const p of filteredPromos) out.set(String(p.id), { requests: 0, revenue: 0 });

        for (const req of reqsInPeriod) {

            const reqId = String(req?.id || '');

            const promoId = reqToPromotionId.get(reqId);

            if (!promoId || !promoIdsInFilter.has(promoId) || !out.has(promoId)) continue;

            const bucket = out.get(promoId)!;

            bucket.requests += 1;

            bucket.revenue += num(req.totalCost);

        }

        return out;

    }, [filteredPromos, reqsInPeriod, reqToPromotionId, promoIdsInFilter]);



    const linkedReqs = useMemo(() => {

        let n = 0;

        let rev = 0;

        for (const req of reqsInPeriod) {

            const promoId = reqToPromotionId.get(String(req?.id || ''));

            if (promoId && promoIdsInFilter.has(promoId)) {

                n++;

                rev += num(req.totalCost);

            }

        }

        return { requests: n, revenue: rev };

    }, [reqsInPeriod, reqToPromotionId, promoIdsInFilter]);



    const linkRate = reqsInPeriod.length ? linkedReqs.requests / reqsInPeriod.length : 0;



    const statusMix = useMemo(() => {

        const m = new Map<string, number>();

        filteredPromos.forEach((p) => m.set(p._status, (m.get(p._status) || 0) + 1));

        return Array.from(m.entries()).map(([name, value]) => ({ name, value }));

    }, [filteredPromos]);



    const typeMix = useMemo(() => {

        const m = new Map<string, number>();

        filteredPromos.forEach((p) => {

            const k = String(p.type || 'Unspecified').trim() || 'Unspecified';

            m.set(k, (m.get(k) || 0) + 1);

        });

        return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    }, [filteredPromos]);



    const timeline = useMemo(() => {

        const buckets = new Map<string, { active: number; expired: number; other: number }>();

        filteredPromos.forEach((p) => {

            const key = monthKey(p.startDate || p.createdAt);

            if (!key) return;

            if (!buckets.has(key)) buckets.set(key, { active: 0, expired: 0, other: 0 });

            const b = buckets.get(key)!;

            if (p._status === 'Active') b.active += 1;

            else if (p._status === 'Expired') b.expired += 1;

            else b.other += 1;

        });

        return Array.from(buckets.entries()).map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);

    }, [filteredPromos]);



    const topByUsage = useMemo(() => filteredPromos

        .map((p) => {

            const u = usageByPromo.get(String(p.id)) || { requests: 0, revenue: 0 };

            return { name: p.name || p.title || `Promo ${String(p.id).slice(0, 6)}`, requests: u.requests, revenue: Math.round(u.revenue) };

        })

        .filter((x) => x.requests > 0)

        .sort((a, b) => b.requests - a.requests)

        .slice(0, 10),

    [filteredPromos, usageByPromo]);



    const discountBands = useMemo(() => {

        const bands: [string, number, number][] = [['1–10%', 1, 10], ['11–20%', 11, 20], ['21–30%', 21, 30], ['31–50%', 31, 50], ['50%+', 51, 1e9]];

        const arr = bands.map(([name]) => ({ name, value: 0 }));

        filteredPromos.forEach((p) => {

            const d = num(p.discount);

            if (d <= 0) return;

            for (let i = 0; i < bands.length; i++) {

                const [, lo, hi] = bands[i];

                if (d >= lo && d <= hi) { arr[i].value++; break; }

            }

        });

        return arr;

    }, [filteredPromos]);



    const usageTimeline = useMemo(() => {

        const m = new Map<string, number>();

        for (const req of reqsInPeriod) {

            const promoId = reqToPromotionId.get(String(req?.id || ''));

            if (!promoId || !promoIdsInFilter.has(promoId)) continue;

            const k = monthKey(req.requestDate || req.receivedDate || req.createdAt || req.checkIn);

            if (k) m.set(k, (m.get(k) || 0) + 1);

        }

        return Array.from(m.entries()).map(([month, linked]) => ({ month, linked })).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);

    }, [reqsInPeriod, reqToPromotionId, promoIdsInFilter]);



    const activeInFilter = filteredPromos.filter((p) => p._status === 'Active').length;

    const expiredInFilter = filteredPromos.filter((p) => p._status === 'Expired').length;

    const discounts = filteredPromos.map((p) => num(p.discount)).filter((d) => d > 0);

    const avgDiscount = discounts.length ? discounts.reduce((s, d) => s + d, 0) / discounts.length : 0;



    const statusColorFor = (name: string) => name === 'Active' ? colors.green : name === 'Expired' ? colors.red : name === 'Scheduled' ? colors.blue : colors.yellow;

    const hasData = enriched.length > 0;

    const statusOptions = ['all', 'Active', 'Scheduled', 'Expired', 'Draft'];

    const rangeLabel = range === 'all' ? 'all time' : range === '365' ? 'last year' : `last ${range} days`;



    return (

        <PageShell colors={colors} enterDeps={[range, statusFilter]}>

            <div style={{ padding: 4 }}>

                <div data-hub-animate>

                    <Hero

                        icon={Megaphone}

                        title="Promotions Performance"

                        colors={colors}

                        activeProperty={activeProperty}

                        subtitle={`${filteredPromos.length} campaigns · ${rangeLabel}`}

                        right={<RangeTabs value={range} onChange={setRange} colors={colors} />}

                    />

                </div>



                <div data-hub-animate style={{ marginBottom: 14 }}>

                    <FilterChips

                        value={statusFilter}

                        onChange={setStatusFilter}

                        colors={colors}

                        options={statusOptions.map((s) => ({ k: s, l: s === 'all' ? 'All statuses' : s }))}

                    />

                </div>



                {!hasData ? (

                    <EmptyState icon={Megaphone} text="No promotions for this property yet." colors={colors} />

                ) : filteredPromos.length === 0 ? (

                    <EmptyState icon={Megaphone} text="No promotions match this period and status filter." colors={colors} />

                ) : (

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                        <div

                            data-hub-animate

                            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}

                        >

                            <MiniStat label="Campaigns in period" value={fmtInt(filteredPromos.length)} icon={Megaphone} colorKey="blue" colors={colors} />

                            <MiniStat label="Active in filter" value={fmtInt(activeInFilter)} icon={CalendarCheck} colorKey="green" colors={colors} />

                            <MiniStat label="Expired" value={fmtInt(expiredInFilter)} sub={rangeLabel} icon={CalendarX} colorKey="red" colors={colors} />

                            <MiniStat label="Linked requests" value={fmtInt(linkedReqs.requests)} sub={rangeLabel} icon={Link2} colorKey="purple" colors={colors} />

                            <MiniStat label="Attributed value" value={fmtMoney(linkedReqs.revenue, currency)} sub={`Avg disc ${fmtPct(avgDiscount / 100)}`} icon={Percent} colorKey="orange" colors={colors} />

                        </div>



                        <Card title="Promo link rate" icon={Link2} colors={colors}>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>

                                <div style={{ minWidth: 140 }}>

                                    <div style={{ color: colors.textMain, fontSize: 42, fontWeight: 900, lineHeight: 1 }}>

                                        {fmtPct(linkRate, 0)}

                                    </div>

                                    <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>

                                        period requests linked to a filtered campaign

                                    </div>

                                </div>

                                <div style={{ flex: 1, minWidth: 220 }}>

                                    <Meter value={linkRate} colors={colors} color={colors.purple} />

                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, fontWeight: 700 }}>

                                        <span style={{ color: colors.purple }}>Linked {fmtInt(linkedReqs.requests)}</span>

                                        <span style={{ color: colors.textMuted }}>Period requests {fmtInt(reqsInPeriod.length)}</span>

                                    </div>

                                </div>

                            </div>

                        </Card>



                        {usageTimeline.length > 0 ? (

                            <Card title="Linked request usage by month" icon={TrendingUp} colors={colors}>

                                <ResponsiveContainer width="100%" height={CHART_H_LG}>

                                    <AreaChart data={usageTimeline} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>

                                        <defs>

                                            <linearGradient id="promoPrevUsage" x1="0" y1="0" x2="0" y2="1">

                                                <stop offset="0%" stopColor={colors.primary} stopOpacity={0.4} />

                                                <stop offset="100%" stopColor={colors.primary} stopOpacity={0.02} />

                                            </linearGradient>

                                        </defs>

                                        <CartesianGrid stroke={colors.grid} vertical={false} />

                                        <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />

                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} stroke={colors.grid} />

                                        <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v), 'Linked requests']} />

                                        <Area type="monotone" dataKey="linked" name="Linked requests" stroke={colors.primary} fill="url(#promoPrevUsage)" strokeWidth={2} />

                                    </AreaChart>

                                </ResponsiveContainer>

                            </Card>

                        ) : reqsInPeriod.length > 0 ? (

                            <EmptyState icon={TrendingUp} text="No requests linked to filtered campaigns in this period." colors={colors} />

                        ) : (

                            <EmptyState icon={TrendingUp} text="No non-cancelled requests in this period." colors={colors} />

                        )}



                        <div data-hub-animate style={{ display: 'grid', gridTemplateColumns: GRID_2, gap: 18 }}>

                            <Card title="Status mix (filtered)" icon={Tag} colors={colors}>

                                {statusMix.length ? (

                                    <ResponsiveContainer width="100%" height={CHART_H}>

                                        <PieChart>

                                            <Pie data={statusMix} dataKey="value" nameKey="name" innerRadius={55} outerRadius={100} paddingAngle={2}>

                                                {statusMix.map((d, i) => <Cell key={i} fill={statusColorFor(d.name)} />)}

                                            </Pie>

                                            <Tooltip {...tip(colors)} />

                                            <Legend formatter={legendStyle(colors)} />

                                        </PieChart>

                                    </ResponsiveContainer>

                                ) : <EmptyState icon={Tag} text="No status data" colors={colors} />}

                            </Card>



                            <Card title="Discount depth (filtered)" icon={Percent} colors={colors}>

                                {discounts.length > 0 ? (

                                    <ResponsiveContainer width="100%" height={CHART_H}>

                                        <BarChart data={discountBands} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>

                                            <CartesianGrid stroke={colors.grid} vertical={false} />

                                            <XAxis dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} />

                                            <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} />

                                            <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />

                                            <Bar dataKey="value" name="Campaigns" fill={colors.orange} radius={[6, 6, 0, 0]} />

                                        </BarChart>

                                    </ResponsiveContainer>

                                ) : <EmptyState icon={Percent} text="No discount values on filtered campaigns." colors={colors} />}

                            </Card>

                        </div>



                        <div data-hub-animate style={{ display: 'grid', gridTemplateColumns: GRID_2, gap: 18 }}>

                            {typeMix.length > 0 && (

                                <Card title="Promotion types (filtered)" icon={FileEdit} colors={colors}>

                                    <ResponsiveContainer width="100%" height={CHART_H}>

                                        <BarChart data={typeMix} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>

                                            <CartesianGrid stroke={colors.grid} horizontal={false} />

                                            <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} />

                                            <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} width={120} />

                                            <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />

                                            <Bar dataKey="value" name="Campaigns" radius={[0, 6, 6, 0]}>

                                                {typeMix.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}

                                            </Bar>

                                        </BarChart>

                                    </ResponsiveContainer>

                                </Card>

                            )}



                            {timeline.length > 0 && (

                                <Card title="Campaign timeline (filtered)" icon={CalendarCheck} colors={colors}>

                                    <ResponsiveContainer width="100%" height={CHART_H}>

                                        <AreaChart data={timeline} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>

                                            <CartesianGrid stroke={colors.grid} vertical={false} />

                                            <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} />

                                            <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} />

                                            <Tooltip {...tip(colors)} />

                                            <Area type="monotone" dataKey="active" name="Active" stackId="1" stroke={colors.green} fill={hexA(colors.green, '55')} />

                                            <Area type="monotone" dataKey="expired" name="Expired" stackId="1" stroke={colors.red} fill={hexA(colors.red, '55')} />

                                            <Area type="monotone" dataKey="other" name="Draft/Scheduled" stackId="1" stroke={colors.yellow} fill={hexA(colors.yellow, '55')} />

                                            <Legend formatter={legendStyle(colors)} />

                                        </AreaChart>

                                    </ResponsiveContainer>

                                </Card>

                            )}

                        </div>



                        {topByUsage.length > 0 ? (

                            <Card title="Top campaigns by linked requests" icon={Megaphone} colors={colors}>

                                <ResponsiveContainer width="100%" height={CHART_H}>

                                    <BarChart data={topByUsage} layout="vertical" margin={{ left: 8, right: 16 }}>

                                        <CartesianGrid stroke={colors.grid} horizontal={false} />

                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} allowDecimals={false} />

                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} width={140} />

                                        <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />

                                        <Bar dataKey="requests" name="Linked requests" fill={colors.blue} radius={[0, 6, 6, 0]} barSize={18} />

                                    </BarChart>

                                </ResponsiveContainer>

                            </Card>

                        ) : (

                            <EmptyState icon={Megaphone} text="Filtered campaigns have no linked requests in period." colors={colors} />

                        )}



                        <Card title="Campaign usage detail" icon={CalendarX} colors={colors}>

                            <div style={{ overflowX: 'auto' }}>

                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>

                                    <thead>

                                        <tr style={{ color: colors.textMuted, textAlign: 'left' }}>

                                            <th style={{ padding: '6px 8px' }}>Campaign</th>

                                            <th style={{ padding: '6px 8px' }}>Status</th>

                                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Linked reqs</th>

                                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Attributed ({currency})</th>

                                        </tr>

                                    </thead>

                                    <tbody>

                                        {filteredPromos.map((p) => {

                                            const u = usageByPromo.get(String(p.id)) || { requests: 0, revenue: 0 };

                                            return (

                                                <tr key={p.id} style={{ color: colors.textMain, borderTop: `1px solid ${colors.border}` }}>

                                                    <td style={{ padding: '6px 8px' }}>{p.name || p.title || '—'}</td>

                                                    <td style={{ padding: '6px 8px', color: statusColorFor(p._status) }}>{p._status}</td>

                                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{fmtInt(u.requests)}</td>

                                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: u.revenue > 0 ? colors.green : colors.textMuted }}>

                                                        {u.revenue > 0 ? fmtMoney(u.revenue, currency) : '—'}

                                                    </td>

                                                </tr>

                                            );

                                        })}

                                    </tbody>

                                </table>

                            </div>

                        </Card>

                    </div>

                )}

            </div>

        </PageShell>

    );

}


