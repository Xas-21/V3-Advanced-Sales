/**
 * MICE preview — events/meetings volume, status & MICE-scoped revenue only.
 * Not whole-hotel Revenue Mix; period filter via requestWhen.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../../backendApi';
import { usePropertyLoadGate } from '../../propertyScopedLoad';
import {
    BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
    Line, ComposedChart, Area,
} from 'recharts';
import { PartyPopper, Building2, Users, CalendarRange, Armchair, DollarSign, CheckCircle2 } from 'lucide-react';
import { useHubData } from '../HubDataContext';
import {
    hexA, num, fmtInt, fmtMoney, money, fmtPct, delta, groupBy, tip, legendStyle, palette,
    Card, MiniStat, RangeTabs, EmptyState, Hero, LoadingState, PageShell,
    rangeBounds, monthKey, type RangeKey,
} from '../analyticsKit';
import { requestWhen, requestTime, CHART_H, CHART_H_LG, GRID_2 } from '../hubPreviewShared';

function isMiceRequest(r: any): boolean {
    const seg = (r.segment || '').toLowerCase();
    return seg === 'mice' || !!r.eventStart || !!r.eventEnd;
}

function miceEventMonth(r: any): string | null {
    return monthKey(r.eventStart || r.checkIn || requestWhen(r));
}

export default function DashboardHubMicePage({ colors }: { colors: any }) {
    const { requests, currency, activeProperty } = useHubData();
    const propertyId = activeProperty?.id || '';
    const [venues, setVenues] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState<RangeKey>('90');
    const pal = palette(colors);
    const { start, prevStart, prevEnd } = useMemo(() => rangeBounds(range), [range]);
    const venuesLoad = usePropertyLoadGate();

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setVenues([]);
        if (!propertyId) {
            setLoading(false);
            return;
        }
        if (!venuesLoad.begin(propertyId)) {
            setLoading(false);
            return;
        }
        (async () => {
            try {
                const url = `/api/venues?propertyId=${encodeURIComponent(propertyId)}`;
                const v = await fetch(apiUrl(url), { credentials: 'include' }).then((x) => x.json());
                if (cancelled || !venuesLoad.isCurrent(propertyId)) return;
                const list = Array.isArray(v) ? v : [];
                setVenues(list.filter((x: any) => !x.propertyId || x.propertyId === propertyId));
            } catch {
                if (!cancelled && venuesLoad.isCurrent(propertyId)) setVenues([]);
            } finally {
                if (!cancelled && venuesLoad.isCurrent(propertyId)) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [propertyId, venuesLoad.begin, venuesLoad.isCurrent]);

    const allMice = useMemo(() => requests.filter(isMiceRequest), [requests]);

    const inPeriod = (r: any, from: number, to = Infinity) => {
        const t = requestTime(r);
        return !Number.isNaN(t) && t >= from && t < to;
    };

    const curMice = useMemo(() => {
        if (range === 'all') return allMice;
        return allMice.filter((r) => inPeriod(r, start));
    }, [allMice, start, range]);

    const prevMice = useMemo(() => {
        if (range === 'all') return [];
        return allMice.filter((r) => inPeriod(r, prevStart, prevEnd));
    }, [allMice, prevStart, prevEnd, range]);

    const venueCap = (v: any) => {
        const shapes = Array.isArray(v.shapes) ? v.shapes : [];
        return shapes.length ? shapes.reduce((s: number, sh: any) => s + num(sh.capacity), 0) : num(v.capacity);
    };

    const totalArea = useMemo(() => venues.reduce((a, v) => a + num(v.area), 0), [venues]);
    const totalVenueCap = useMemo(() => venues.reduce((a, v) => a + venueCap(v), 0), [venues]);

    const miceRevenue = useMemo(() => curMice.reduce((s, r) => s + num(r.totalCost), 0), [curMice]);
    const prevMiceRevenue = useMemo(() => prevMice.reduce((s, r) => s + num(r.totalCost), 0), [prevMice]);

    const confirmedCount = useMemo(
        () => curMice.filter((r) => String(r.status || '').toLowerCase() === 'confirmed').length,
        [curMice],
    );
    const prevConfirmed = useMemo(
        () => prevMice.filter((r) => String(r.status || '').toLowerCase() === 'confirmed').length,
        [prevMice],
    );

    const statusMix = useMemo(() => {
        const m = groupBy(curMice, (r) => r.status || 'Unknown');
        return Object.entries(m)
            .map(([name, arr]) => ({ name, value: arr.length }))
            .sort((a, b) => b.value - a.value);
    }, [curMice]);

    const seasonal = useMemo(() => {
        const map: Record<string, { events: number; revenue: number }> = {};
        for (const r of curMice) {
            const k = miceEventMonth(r); if (!k) continue;
            if (!map[k]) map[k] = { events: 0, revenue: 0 };
            map[k].events += 1;
            map[k].revenue += num(r.totalCost);
        }
        return Object.keys(map).sort().map((k) => ({
            month: k,
            events: map[k].events,
            revenue: Math.round(map[k].revenue),
        }));
    }, [curMice]);

    const eventTypes = useMemo(() => {
        const m: Record<string, number> = {};
        for (const r of curMice) {
            const t = String(r.eventType || r.segment || 'MICE');
            m[t] = (m[t] || 0) + 1;
        }
        return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [curMice]);

    const capacityBands = useMemo(() => {
        const bands: [string, number, number][] = [['<100', 0, 99], ['100–300', 100, 300], ['301–600', 301, 600], ['600+', 601, 1e9]];
        const arr = bands.map(([name]) => ({ name, value: 0 }));
        for (const v of venues) {
            const cap = venueCap(v);
            for (let i = 0; i < bands.length; i++) {
                const [, lo, hi] = bands[i];
                if (cap >= lo && cap <= hi) { arr[i].value += 1; break; }
            }
        }
        return arr.filter((x) => x.value > 0);
    }, [venues]);

    const topVenues = useMemo(() => (
        venues.map((v) => ({ name: v.name || 'Unnamed', capacity: venueCap(v), area: num(v.area) }))
            .sort((a, b) => b.capacity - a.capacity)
            .slice(0, 8)
    ), [venues]);

    const rangeLabel = range === 'all' ? 'all time' : range === '365' ? 'last year' : `last ${range} days`;
    const hasVenues = venues.length > 0;
    const hasMiceData = curMice.length > 0;
    const hasAnything = hasVenues || allMice.length > 0;

    return (
        <PageShell colors={colors} enterDeps={[range, propertyId]}>
            <div style={{ padding: 4 }}>
                <div data-hub-animate>
                    <Hero
                        icon={PartyPopper}
                        title="MICE Events & Venues"
                        colors={colors}
                        activeProperty={activeProperty}
                        subtitle={
                            hasMiceData
                                ? `${fmtInt(curMice.length)} MICE events · ${fmtMoney(miceRevenue, currency)} MICE revenue · ${rangeLabel}`
                                : hasVenues
                                    ? `${fmtInt(venues.length)} venues · no MICE events in ${rangeLabel}`
                                    : 'No venues or MICE events'
                        }
                        right={<RangeTabs value={range} onChange={(k: RangeKey) => setRange(k)} colors={colors} />}
                    />
                </div>

                {loading ? (
                    <LoadingState colors={colors} text="Loading venues…" />
                ) : !hasAnything ? (
                    <EmptyState icon={PartyPopper} text="No venues or MICE events for this property." colors={colors} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div
                            data-hub-animate
                            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}
                        >
                            <MiniStat
                                label="MICE events"
                                value={fmtInt(curMice.length)}
                                sub={rangeLabel}
                                delta={range !== 'all' ? delta(curMice.length, prevMice.length) : undefined}
                                icon={PartyPopper}
                                colorKey="blue"
                                colors={colors}
                            />
                            <MiniStat
                                label="MICE revenue"
                                value={fmtMoney(miceRevenue, currency)}
                                sub="segment-scoped only"
                                delta={range !== 'all' ? delta(miceRevenue, prevMiceRevenue) : undefined}
                                icon={DollarSign}
                                colorKey="orange"
                                colors={colors}
                            />
                            <MiniStat
                                label="Confirmed events"
                                value={fmtInt(confirmedCount)}
                                sub={curMice.length ? `${fmtPct(confirmedCount / curMice.length)} of MICE pipeline` : '—'}
                                delta={range !== 'all' ? delta(confirmedCount, prevConfirmed) : undefined}
                                icon={CheckCircle2}
                                colorKey="green"
                                colors={colors}
                            />
                            {hasVenues && (
                                <>
                                    <MiniStat
                                        label="Venues"
                                        value={fmtInt(venues.length)}
                                        sub="inventory"
                                        icon={Building2}
                                        colorKey="purple"
                                        colors={colors}
                                    />
                                    <MiniStat
                                        label="Total area"
                                        value={`${fmtInt(totalArea)} m²`}
                                        sub="event space"
                                        icon={Armchair}
                                        colorKey="green"
                                        colors={colors}
                                    />
                                    <MiniStat
                                        label="Total capacity"
                                        value={fmtInt(totalVenueCap)}
                                        sub="seats"
                                        icon={Users}
                                        colorKey="blue"
                                        colors={colors}
                                    />
                                </>
                            )}
                        </div>

                        {!hasMiceData ? (
                            <EmptyState
                                icon={PartyPopper}
                                text={`No MICE events in ${rangeLabel}. Venue inventory below is static — widen the period or add MICE bookings.`}
                                colors={colors}
                            />
                        ) : (
                            <>
                                {seasonal.length > 0 ? (
                                    <Card title={`MICE demand & revenue (${currency})`} icon={CalendarRange} colors={colors}>
                                        <ResponsiveContainer width="100%" height={CHART_H_LG}>
                                            <ComposedChart data={seasonal} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="micePrevRev" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor={colors.orange} stopOpacity={0.4} />
                                                        <stop offset="100%" stopColor={colors.orange} stopOpacity={0.02} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid stroke={colors.grid} vertical={false} />
                                                <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                                <YAxis yAxisId="l" tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} stroke={colors.grid} />
                                                <YAxis
                                                    yAxisId="r"
                                                    orientation="right"
                                                    tick={{ fill: colors.textMuted, fontSize: 11 }}
                                                    tickFormatter={(v: number) => fmtMoney(v, '').trim()}
                                                    stroke={colors.grid}
                                                />
                                                <Tooltip
                                                    {...tip(colors)}
                                                    formatter={(v: any, n: any) => [
                                                        n === 'MICE revenue' ? money(v, currency) : fmtInt(v),
                                                        n,
                                                    ]}
                                                />
                                                <Area
                                                    yAxisId="r"
                                                    type="monotone"
                                                    dataKey="revenue"
                                                    name="MICE revenue"
                                                    stroke={colors.orange}
                                                    fill="url(#micePrevRev)"
                                                    strokeWidth={2}
                                                />
                                                <Line
                                                    yAxisId="l"
                                                    type="monotone"
                                                    dataKey="events"
                                                    name="Events"
                                                    stroke={colors.purple}
                                                    strokeWidth={2}
                                                    dot={{ r: 3 }}
                                                />
                                                <Legend formatter={legendStyle(colors)} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </Card>
                                ) : (
                                    <EmptyState icon={CalendarRange} text="MICE events lack event/check-in dates for monthly trend." colors={colors} />
                                )}

                                <div data-hub-animate style={{ display: 'grid', gridTemplateColumns: GRID_2, gap: 18 }}>
                                    {statusMix.length > 0 ? (
                                        <Card title="MICE status mix" icon={CheckCircle2} colors={colors}>
                                            <ResponsiveContainer width="100%" height={CHART_H}>
                                                <BarChart data={statusMix} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                                    <CartesianGrid stroke={colors.grid} horizontal={false} />
                                                    <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} />
                                                    <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} width={110} />
                                                    <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v), 'Events']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                                    <Bar dataKey="value" name="Events" radius={[0, 6, 6, 0]}>
                                                        {statusMix.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </Card>
                                    ) : null}

                                    {eventTypes.length > 0 ? (
                                        <Card title="Event type volume" icon={PartyPopper} colors={colors}>
                                            <ResponsiveContainer width="100%" height={CHART_H}>
                                                <BarChart data={eventTypes} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                                    <CartesianGrid stroke={colors.grid} horizontal={false} />
                                                    <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} />
                                                    <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} width={120} />
                                                    <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v), 'Events']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                                    <Bar dataKey="value" name="Events" radius={[0, 6, 6, 0]}>
                                                        {eventTypes.map((_, i) => <Cell key={i} fill={pal[(i + 2) % pal.length]} />)}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </Card>
                                    ) : null}
                                </div>
                            </>
                        )}

                        {hasVenues && (
                            <div data-hub-animate style={{ display: 'grid', gridTemplateColumns: GRID_2, gap: 18 }}>
                                {topVenues.length > 0 && (
                                    <Card title="Venues by capacity" icon={Building2} colors={colors}>
                                        <ResponsiveContainer width="100%" height={CHART_H}>
                                            <BarChart data={topVenues} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                                <CartesianGrid stroke={colors.grid} horizontal={false} />
                                                <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} />
                                                <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} width={120} />
                                                <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v), 'Seats']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                                <Bar dataKey="capacity" name="Capacity" radius={[0, 6, 6, 0]}>
                                                    {topVenues.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </Card>
                                )}

                                {capacityBands.length > 0 && (
                                    <Card title="Venue capacity tiers" icon={Users} colors={colors}>
                                        <ResponsiveContainer width="100%" height={CHART_H}>
                                            <BarChart data={capacityBands} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                                                <CartesianGrid stroke={colors.grid} vertical={false} />
                                                <XAxis dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                                <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} stroke={colors.grid} />
                                                <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v), 'Venues']} cursor={{ fill: hexA(colors.primary, '12') }} />
                                                <Bar dataKey="value" name="Venues" radius={[6, 6, 0, 0]}>
                                                    {capacityBands.map((_, i) => <Cell key={i} fill={pal[(i + 1) % pal.length]} />)}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </Card>
                                )}
                            </div>
                        )}

                        {hasVenues && (
                            <Card title="Venue detail" icon={Armchair} colors={colors}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                        <thead>
                                            <tr style={{ color: colors.textMuted, textAlign: 'left' }}>
                                                <th style={{ padding: '8px 10px' }}>Venue</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Area</th>
                                                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Capacity</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {venues.map((v, i) => (
                                                <tr key={v.id || i} style={{ borderTop: `1px solid ${colors.border}`, color: colors.textMain }}>
                                                    <td style={{ padding: '8px 10px' }}>{v.name || 'Unnamed'}</td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtInt(num(v.area))} m²</td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmtInt(venueCap(v))}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}
                    </div>
                )}
            </div>
        </PageShell>
    );
}
