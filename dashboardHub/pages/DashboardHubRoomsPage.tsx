/**
 * Rooms preview — inventory & occupancy lens (not full revenue story).
 * RangeTabs drive booking-derived metrics; static inventory from /api/rooms.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../../backendApi';
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
    AreaChart, Area,
} from 'recharts';
import { BedDouble, Layers, Scaling, PieChart as PieIcon, DollarSign } from 'lucide-react';
import { useHubData } from '../HubDataContext';
import {
    hexA, num, fmtInt, fmtPct, fmtMoney, delta, tip, legendStyle, palette,
    Card, MiniStat, RangeTabs, EmptyState, Hero, LoadingState, Meter, PageShell,
    rangeBounds, monthKey, type RangeKey,
} from '../analyticsKit';
import { requestTime, CHART_H, CHART_H_LG, GRID_2 } from '../hubPreviewShared';

function roomNightsOnRequest(req: any): number {
    const ci = new Date(req.checkIn).getTime();
    const co = new Date(req.checkOut).getTime();
    if (Number.isNaN(ci) || Number.isNaN(co) || co <= ci) return 0;
    const nights = (co - ci) / 86400000;
    const roomsArr = Array.isArray(req.rooms) ? req.rooms : [];
    const reqRooms = roomsArr.reduce((s: number, rm: any) => s + num(rm.count), 0);
    if (reqRooms === 0) return 0;
    return reqRooms * nights;
}

export default function DashboardHubRoomsPage({ colors }: { colors: any }) {
    const { requests, currency, activeProperty } = useHubData();
    const propertyId = activeProperty?.id || '';
    const [rooms, setRooms] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState<RangeKey>('90');
    const pal = palette(colors);
    const { start, prevStart, prevEnd, days } = useMemo(() => rangeBounds(range), [range]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const url = propertyId ? `/api/rooms?propertyId=${encodeURIComponent(propertyId)}` : '/api/rooms';
                const r = await fetch(apiUrl(url), { credentials: 'include' }).then((x) => x.json());
                if (cancelled) return;
                const list = Array.isArray(r) ? r : [];
                setRooms(propertyId ? list.filter((x: any) => !x.propertyId || x.propertyId === propertyId) : list);
            } catch {
                if (!cancelled) setRooms([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [propertyId]);

    const totalRooms = useMemo(() => rooms.reduce((a, r) => a + num(r.count), 0), [rooms]);
    const totalCapacity = useMemo(() => rooms.reduce((a, r) => a + num(r.count) * num(r.capacity), 0), [rooms]);

    const byType = useMemo(() => {
        const m: Record<string, any> = {};
        for (const r of rooms) {
            const k = r.name || 'Unnamed';
            if (!m[k]) m[k] = { name: k, count: 0, capacity: 0 };
            m[k].count += num(r.count);
            m[k].capacity += num(r.count) * num(r.capacity);
        }
        return Object.values(m).sort((a: any, b: any) => b.count - a.count);
    }, [rooms]);

    const sizeDist = useMemo(() => {
        const bands: [string, number, number][] = [['Small (≤25)', 0, 25], ['Medium (26–60)', 26, 60], ['Large (61+)', 61, 1e9]];
        const arr = bands.map(([name]) => ({ name, value: 0 }));
        for (const r of rooms) {
            const s = num(r.size) || num(r.capacity);
            for (let i = 0; i < bands.length; i++) {
                const [, lo, hi] = bands[i];
                if (s >= lo && s <= hi) { arr[i].value += num(r.count); break; }
            }
        }
        return arr.filter((x) => x.value > 0);
    }, [rooms]);

    const inPeriod = (r: any, from: number, to = Infinity) => {
        const t = requestTime(r);
        return !Number.isNaN(t) && t >= from && t < to;
    };

    const curReq = useMemo(() => {
        if (range === 'all') return requests;
        return requests.filter((r) => inPeriod(r, start));
    }, [requests, start, range]);

    const prevReq = useMemo(() => {
        if (range === 'all') return [];
        return requests.filter((r) => inPeriod(r, prevStart, prevEnd));
    }, [requests, prevStart, prevEnd, range]);

    const periodDays = useMemo(() => {
        if (range !== 'all') return days;
        let minT = Date.now();
        for (const r of requests) {
            const t = requestTime(r);
            if (!Number.isNaN(t) && t < minT) minT = t;
        }
        return Math.max(1, Math.ceil((Date.now() - minT) / 86400000));
    }, [range, days, requests]);

    const utilFor = (arr: any[]) => {
        let bookedRoomNights = 0;
        let roomRevenue = 0;
        for (const req of arr) {
            bookedRoomNights += roomNightsOnRequest(req);
            roomRevenue += num(req.totalCost);
        }
        const denom = totalRooms * periodDays;
        const occ = denom ? Math.min(1, bookedRoomNights / denom) : 0;
        const revpar = denom ? roomRevenue / denom : 0;
        return { occ, revpar, bookedRoomNights };
    };

    const util = useMemo(() => utilFor(curReq), [curReq, totalRooms, periodDays]);
    const prevUtil = useMemo(() => utilFor(prevReq), [prevReq, totalRooms, periodDays]);

    const bookedByMonth = useMemo(() => {
        const m: Record<string, number> = {};
        for (const req of curReq) {
            const k = monthKey(req.checkIn); if (!k) continue;
            m[k] = (m[k] || 0) + roomNightsOnRequest(req);
        }
        return Object.keys(m).sort().map((k) => ({ month: k, roomNights: Math.round(m[k]) }));
    }, [curReq]);

    const rangeLabel = range === 'all' ? 'all time' : range === '365' ? 'last year' : `last ${range} days`;
    const hasInventory = rooms.length > 0;

    return (
        <PageShell colors={colors} enterDeps={[range, propertyId]}>
            <div style={{ padding: 4 }}>
                <div data-hub-animate>
                    <Hero
                        icon={BedDouble}
                        title="Room Inventory & Occupancy"
                        colors={colors}
                        activeProperty={activeProperty}
                        subtitle={
                            hasInventory
                                ? `${fmtInt(totalRooms)} units · ${fmtInt(byType.length)} types · ${rangeLabel}`
                                : 'No room inventory loaded'
                        }
                        right={<RangeTabs value={range} onChange={(k: RangeKey) => setRange(k)} colors={colors} />}
                    />
                </div>

                {loading ? (
                    <LoadingState colors={colors} text="Loading room inventory…" />
                ) : !hasInventory ? (
                    <EmptyState icon={BedDouble} text="No room inventory for this property." colors={colors} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div
                            data-hub-animate
                            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}
                        >
                            <MiniStat
                                label="Inventory units"
                                value={fmtInt(totalRooms)}
                                sub={`${byType.length} room types`}
                                icon={BedDouble}
                                colorKey="blue"
                                colors={colors}
                            />
                            <MiniStat
                                label="Guest capacity"
                                value={fmtInt(totalCapacity)}
                                sub="beds across inventory"
                                icon={Layers}
                                colorKey="green"
                                colors={colors}
                            />
                            <MiniStat
                                label={`Occupancy (${range === 'all' ? 'all' : `${range}d`})`}
                                value={fmtPct(util.occ)}
                                sub="sold room-nights / available"
                                delta={range !== 'all' ? delta(util.occ, prevUtil.occ) : undefined}
                                icon={Scaling}
                                colorKey="orange"
                                colors={colors}
                            />
                            <MiniStat
                                label="Room-nights sold"
                                value={fmtInt(util.bookedRoomNights)}
                                sub={rangeLabel}
                                delta={range !== 'all' ? delta(util.bookedRoomNights, prevUtil.bookedRoomNights) : undefined}
                                icon={Scaling}
                                colorKey="purple"
                                colors={colors}
                            />
                            <MiniStat
                                label={`RevPAR (${range === 'all' ? 'all' : `${range}d`})`}
                                value={fmtMoney(util.revpar, currency)}
                                sub="revenue / avail. room-night"
                                delta={range !== 'all' ? delta(util.revpar, prevUtil.revpar) : undefined}
                                icon={DollarSign}
                                colorKey="blue"
                                colors={colors}
                            />
                        </div>

                        <Card title="Occupancy for selected period" icon={Scaling} colors={colors}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
                                <div style={{ minWidth: 140 }}>
                                    <div style={{ color: colors.textMain, fontSize: 42, fontWeight: 900, lineHeight: 1 }}>
                                        {fmtPct(util.occ, 0)}
                                    </div>
                                    <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                                        {fmtInt(util.bookedRoomNights)} room-nights sold
                                    </div>
                                </div>
                                <div style={{ flex: 1, minWidth: 220 }}>
                                    <Meter value={util.occ} colors={colors} color={colors.orange} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, fontWeight: 700 }}>
                                        <span style={{ color: colors.orange }}>Sold {fmtInt(util.bookedRoomNights)}</span>
                                        <span style={{ color: colors.textMuted }}>
                                            Available {fmtInt(totalRooms * periodDays)} room-nights
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {bookedByMonth.length > 0 ? (
                            <Card title="Room-nights sold by month" icon={Scaling} colors={colors}>
                                <ResponsiveContainer width="100%" height={CHART_H_LG}>
                                    <AreaChart data={bookedByMonth} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="roomsPrevNights" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={colors.primary} stopOpacity={0.4} />
                                                <stop offset="100%" stopColor={colors.primary} stopOpacity={0.02} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid stroke={colors.grid} vertical={false} />
                                        <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} stroke={colors.grid} />
                                        <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v), 'Room-nights']} />
                                        <Area
                                            type="monotone"
                                            dataKey="roomNights"
                                            name="Room-nights"
                                            stroke={colors.primary}
                                            fill="url(#roomsPrevNights)"
                                            strokeWidth={2}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </Card>
                        ) : curReq.length > 0 ? (
                            <EmptyState icon={Scaling} text="Bookings in period lack valid check-in dates for room-night trend." colors={colors} />
                        ) : (
                            <EmptyState icon={Scaling} text="No bookings in the selected period." colors={colors} />
                        )}

                        <div data-hub-animate style={{ display: 'grid', gridTemplateColumns: GRID_2, gap: 18 }}>
                            <Card title="Room types (units & guest capacity)" icon={BedDouble} colors={colors}>
                                <ResponsiveContainer width="100%" height={CHART_H}>
                                    <BarChart data={byType} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                        <CartesianGrid stroke={colors.grid} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} width={130} />
                                        <Tooltip
                                            {...tip(colors)}
                                            cursor={{ fill: hexA(colors.primary, '12') }}
                                            formatter={(v: any, n: any) => [fmtInt(v), n === 'Units' ? 'Units' : 'Guest capacity']}
                                        />
                                        <Bar dataKey="count" name="Units" radius={[0, 6, 6, 0]}>
                                            {byType.map((_: any, i: number) => <Cell key={i} fill={pal[i % pal.length]} />)}
                                        </Bar>
                                        <Bar dataKey="capacity" name="Guest capacity" fill={colors.green} radius={[0, 6, 6, 0]} />
                                        <Legend formatter={legendStyle(colors)} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Card>

                            {sizeDist.length > 0 ? (
                                <Card title="Inventory size bands" icon={PieIcon} colors={colors}>
                                    <ResponsiveContainer width="100%" height={CHART_H}>
                                        <PieChart>
                                            <Pie data={sizeDist} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                                                {sizeDist.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}
                                            </Pie>
                                            <Tooltip {...tip(colors)} formatter={(v: any) => [fmtInt(v), 'Units']} />
                                            <Legend formatter={legendStyle(colors)} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </Card>
                            ) : (
                                <EmptyState icon={PieIcon} text="No size metadata on room types." colors={colors} />
                            )}
                        </div>

                        <Card title="Room type detail" icon={BedDouble} colors={colors}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ color: colors.textMuted, textAlign: 'left' }}>
                                            <th style={{ padding: '8px 10px' }}>Type</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Units</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Capacity / unit</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total capacity</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rooms.map((r, idx) => (
                                            <tr key={r.id || idx} style={{ borderTop: `1px solid ${colors.border}`, color: colors.textMain }}>
                                                <td style={{ padding: '8px 10px' }}>{r.name || 'Unnamed'}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtInt(num(r.count))}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtInt(num(r.capacity))}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmtInt(num(r.count) * num(r.capacity))}</td>
                                            </tr>
                                        ))}
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
