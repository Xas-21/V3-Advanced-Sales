import React, { useEffect, useState, useMemo } from 'react';
import { apiUrl } from '../../backendApi';
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LineChart, Line,
} from 'recharts';
import { PartyPopper, Building2, Users, CalendarRange, AlertCircle, Loader2, Armchair } from 'lucide-react';

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

function fmtInt(n: number): string { return (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('en-US'); }

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

function MiniStat({ label, value, sub, icon: Icon, colorKey, colors }: any) {
    const c = colors[colorKey] || colors.primary;
    return (
        <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 16, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -14, right: -10, opacity: 0.1 }}><Icon size={72} color={c} /></div>
            <div style={{ color: colors.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
            <div style={{ color: colors.textMain, fontSize: 25, fontWeight: 800, marginTop: 6 }}>{value}</div>
            {sub && <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{sub}</div>}
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

/* ------------------------------- component -------------------------------- */
export default function DashboardHubMicePage({ colors }: { colors: any }) {
    const [venues, setVenues] = useState<any[]>([]);
    const [properties, setProperties] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [v, p, r] = await Promise.all([
                    fetch(apiUrl('/api/venues')).then((x) => x.json()),
                    fetch(apiUrl('/api/properties')).then((x) => x.json()),
                    fetch(apiUrl('/api/requests')).then((x) => x.json()),
                ]);
                if (cancelled) return;
                setVenues(Array.isArray(v) ? v : []);
                setProperties(Array.isArray(p) ? p : []);
                setRequests(Array.isArray(r) ? r : []);
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

    // MICE-related requests (segment MICE / Leisure group / any with eventStart)
    const miceReqs = useMemo(() =>
        requests.filter((r) => {
            const seg = (r.segment || '').toLowerCase();
            if (seg === 'mice') return true;
            if (r.eventStart || r.eventEnd) return true;
            return false;
        }), [requests]);

    const totalVenues = venues.length;
    const totalArea = useMemo(() => venues.reduce((a, v) => a + num(v.area), 0), [venues]);
    const totalVenueCap = useMemo(() => venues.reduce((a, v) => {
        const shapes = Array.isArray(v.shapes) ? v.shapes : [];
        if (shapes.length) return a + shapes.reduce((s: number, sh: any) => s + num(sh.capacity), 0);
        return a + num(v.capacity);
    }, 0), [venues]);

    const byProperty = useMemo(() => {
        const m: Record<string, any> = {};
        for (const v of venues) {
            const k = v.propertyId || '—';
            if (!m[k]) m[k] = { name: propMap[k] || k || 'Unassigned', count: 0, area: 0 };
            m[k].count += 1;
            m[k].area += num(v.area);
        }
        return Object.values(m).sort((a: any, b: any) => b.count - a.count);
    }, [venues, propMap]);

    const capacityBands = useMemo(() => {
        const bands: [string, number, number][] = [['<100', 0, 99], ['100–300', 100, 300], ['301–600', 301, 600], ['600+', 601, 1e9]];
        const arr = bands.map(([name]) => ({ name, value: 0 }));
        for (const v of venues) {
            const shapes = Array.isArray(v.shapes) ? v.shapes : [];
            const cap = shapes.length ? shapes.reduce((s: number, sh: any) => s + num(sh.capacity), 0) : num(v.capacity);
            for (let i = 0; i < bands.length; i++) {
                const [_, lo, hi] = bands[i];
                if (cap >= lo && cap <= hi) { arr[i].value += 1; break; }
            }
        }
        return arr;
    }, [venues]);

    // Seasonal demand: MICE requests by month (eventStart)
    const seasonal = useMemo(() => {
        const map: Record<string, number> = {};
        for (const r of miceReqs) {
            const d = new Date(r.eventStart || r.checkIn);
            if (Number.isNaN(d.getTime())) continue;
            const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            map[k] = (map[k] || 0) + 1;
        }
        return Object.keys(map).sort().map((k) => ({ month: k, events: map[k] }));
    }, [miceReqs]);

    // Bookings by venue (match via property / name heuristic - count MICE requests per property as proxy)
    const bookingsByProp = useMemo(() => {
        const m: Record<string, number> = {};
        for (const r of miceReqs) { const k = r.propertyId || '—'; m[k] = (m[k] || 0) + 1; }
        return Object.entries(m).map(([id, v]) => ({ name: propMap[id] || id || 'Unassigned', value: v })).sort((a, b) => b.value - a.value);
    }, [miceReqs, propMap]);

    const eventTypes = useMemo(() => {
        const m: Record<string, number> = {};
        for (const r of miceReqs) {
            const t = (r.eventType || r.segment || 'MICE').toString();
            m[t] = (m[t] || 0) + 1;
        }
        return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [miceReqs]);

    const ready = !loading && !error;
    const hasVenues = venues.length > 0;

    return (
        <div style={{ padding: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexA(colors.primary, '22'), color: colors.primary }}>
                    <PartyPopper size={22} />
                </div>
                <div>
                    <div style={{ color: colors.textMain, fontSize: 20, fontWeight: 800 }}>MICE & Venue Analytics</div>
                    <div style={{ color: colors.textMuted, fontSize: 12 }}>Venue capacity, event types & seasonal demand</div>
                </div>
            </div>

            {loading && <EmptyState icon={Loader2} text="Loading venues…" colors={colors} />}
            {error && <Card colors={colors}><div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.red }}><AlertCircle size={18} /> <span>Failed to load: {error}</span></div></Card>}
            {ready && !hasVenues && <EmptyState icon={PartyPopper} text="No venue data found." colors={colors} />}

            {ready && hasVenues && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
                        <MiniStat label="Venues" value={fmtInt(totalVenues)} sub={`${byProperty.length} properties`} icon={Building2} colorKey="blue" colors={colors} />
                        <MiniStat label="Total Area" value={fmtInt(totalArea) + ' m²'} sub="event space" icon={Armchair} colorKey="green" colors={colors} />
                        <MiniStat label="Total Capacity" value={fmtInt(totalVenueCap)} sub="seats" icon={Users} colorKey="purple" colors={colors} />
                        <MiniStat label="MICE Events" value={fmtInt(miceReqs.length)} sub="in requests" icon={CalendarRange} colorKey="orange" colors={colors} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <Card title="Venues by Property" icon={Building2} colors={colors}>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={byProperty} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                                    <CartesianGrid stroke={colors.grid} vertical={false} />
                                    <XAxis dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} interval={0} angle={-12} textAnchor="end" height={50} />
                                    <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} allowDecimals={false} />
                                    <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                    <Bar dataKey="count" name="Venues" radius={[6, 6, 0, 0]}>
                                        {byProperty.map((_: any, i: number) => <Cell key={i} fill={palette[i % palette.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card title="Venue Capacity Tiers" icon={Users} colors={colors}>
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie data={capacityBands} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                                        {capacityBands.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                                    </Pie>
                                    <Tooltip {...tip(colors)} />
                                    <Legend formatter={(v: any) => <span style={{ color: colors.textMuted, fontSize: 11 }}>{v}</span>} />
                                </PieChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card title="MICE Events by Property" icon={CalendarRange} colors={colors}>
                            {bookingsByProp.length ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={bookingsByProp} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                        <CartesianGrid stroke={colors.grid} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} width={110} />
                                        <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                        <Bar dataKey="value" name="Events" fill={colors.purple} radius={[0, 6, 6, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={CalendarRange} text="No MICE event bookings" colors={colors} />}
                        </Card>

                        <Card title="Event Type Mix" icon={PartyPopper} colors={colors}>
                            {eventTypes.length ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <PieChart>
                                        <Pie data={eventTypes} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                                            {eventTypes.map((_, i) => <Cell key={i} fill={palette[(i + 2) % palette.length]} />)}
                                        </Pie>
                                        <Tooltip {...tip(colors)} />
                                        <Legend formatter={(v: any) => <span style={{ color: colors.textMuted, fontSize: 11 }}>{v}</span>} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={PartyPopper} text="No event types" colors={colors} />}
                        </Card>

                        <Card title="Seasonal Demand (MICE events / month)" icon={CalendarRange} colors={colors}>
                            {seasonal.length ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <LineChart data={seasonal} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                                        <CartesianGrid stroke={colors.grid} vertical={false} />
                                        <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} />
                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} allowDecimals={false} />
                                        <Tooltip {...tip(colors)} />
                                        <Line type="monotone" dataKey="events" name="Events" stroke={colors.orange} strokeWidth={2} dot={{ r: 3 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={CalendarRange} text="No seasonal data" colors={colors} />}
                        </Card>

                        <Card title="Venue Detail" icon={Building2} colors={colors}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ color: colors.textMuted }}>
                                            <Th colors={colors}>Venue</Th><Th colors={colors}>Property</Th><Th colors={colors}>Area</Th><Th colors={colors}>Capacity</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {venues.map((v, i) => {
                                            const shapes = Array.isArray(v.shapes) ? v.shapes : [];
                                            const cap = shapes.length ? shapes.reduce((s: number, sh: any) => s + num(sh.capacity), 0) : num(v.capacity);
                                            return (
                                                <tr key={v.id || i} style={{ borderTop: `1px solid ${colors.border}`, color: colors.textMain }}>
                                                    <Td colors={colors}>{v.name || 'Unnamed'}</Td>
                                                    <Td colors={colors}>{propMap[v.propertyId] || v.propertyId || '—'}</Td>
                                                    <Td colors={colors}>{fmtInt(num(v.area))} m²</Td>
                                                    <Td colors={colors}>{fmtInt(cap)}</Td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}

function Th({ children, colors }: any) { return <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 700 }}>{children}</th>; }
function Td({ children, colors }: any) { return <td style={{ padding: '8px 10px' }}>{children}</td>; }
