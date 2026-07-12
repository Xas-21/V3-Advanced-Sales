import React, { useEffect, useState, useMemo } from 'react';
import { apiUrl } from '../../backendApi';
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { BedDouble, Layers, Scaling, Building2, AlertCircle, Loader2, PieChart as PieIcon } from 'lucide-react';

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
export default function DashboardHubRoomsPage({ colors }: { colors: any }) {
    const [rooms, setRooms] = useState<any[]>([]);
    const [properties, setProperties] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [r, p, req] = await Promise.all([
                    fetch(apiUrl('/api/rooms')).then((x) => x.json()),
                    fetch(apiUrl('/api/properties')).then((x) => x.json()),
                    fetch(apiUrl('/api/requests')).then((x) => x.json()),
                ]);
                if (cancelled) return;
                setRooms(Array.isArray(r) ? r : []);
                setProperties(Array.isArray(p) ? p : []);
                setRequests(Array.isArray(req) ? req : []);
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

    const totalRooms = useMemo(() => sumCount(rooms), [rooms]);
    const totalCapacity = useMemo(() => sumCap(rooms), [rooms]);

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

    const byProperty = useMemo(() => {
        const m: Record<string, any> = {};
        for (const r of rooms) {
            const k = r.propertyId || '—';
            if (!m[k]) m[k] = { name: propMap[k] || k || 'Unassigned', count: 0, capacity: 0 };
            m[k].count += num(r.count);
            m[k].capacity += num(r.count) * num(r.capacity);
        }
        return Object.values(m).sort((a: any, b: any) => b.count - a.count);
    }, [rooms, propMap]);

    const sizeDist = useMemo(() => {
        const bands: [string, number, number][] = [['Small (≤25)', 0, 25], ['Medium (26–60)', 26, 60], ['Large (61+)', 61, 1e9]];
        const arr = bands.map(([name]) => ({ name, value: 0 }));
        for (const r of rooms) {
            const s = num(r.size) || num(r.capacity);
            for (let i = 0; i < bands.length; i++) {
                const [_, lo, hi] = bands[i];
                if (s >= lo && s <= hi) { arr[i].value += num(r.count); break; }
            }
        }
        return arr;
    }, [rooms]);

    // Derived utilization: count room-nights booked across confirmed/tentative requests within last 90 days
    const utilization = useMemo(() => {
        const now = Date.now();
        const cutoff = now - 90 * 86400000;
        let bookedRoomNights = 0;
        let totalRoomNights90 = 0;
        for (const req of requests) {
            const ci = new Date(req.checkIn).getTime();
            const co = new Date(req.checkOut).getTime();
            if (Number.isNaN(ci) || Number.isNaN(co) || co <= ci) continue;
            const nights = (co - ci) / 86400000;
            const roomsArr = Array.isArray(req.rooms) ? req.rooms : [];
            let reqRooms = 0;
            for (const rm of roomsArr) reqRooms += num(rm.count);
            if (reqRooms === 0) continue;
            if (ci >= cutoff) {
                bookedRoomNights += reqRooms * nights;
                totalRoomNights90 += reqRooms * nights;
            }
        }
        const denom = totalRooms * 90;
        return denom ? Math.min(1, bookedRoomNights / denom) : 0;
    }, [requests, totalRooms]);

    const ready = !loading && !error;
    const hasRooms = rooms.length > 0;

    return (
        <div style={{ padding: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexA(colors.primary, '22'), color: colors.primary }}>
                    <BedDouble size={22} />
                </div>
                <div>
                    <div style={{ color: colors.textMain, fontSize: 20, fontWeight: 800 }}>Room Inventory & Utilization</div>
                    <div style={{ color: colors.textMuted, fontSize: 12 }}>Capacity, distribution & derived occupancy</div>
                </div>
            </div>

            {loading && <EmptyState icon={Loader2} text="Loading rooms…" colors={colors} />}
            {error && <Card colors={colors}><div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.red }}><AlertCircle size={18} /> <span>Failed to load: {error}</span></div></Card>}
            {ready && !hasRooms && <EmptyState icon={BedDouble} text="No room inventory found." colors={colors} />}

            {ready && hasRooms && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
                        <MiniStat label="Total Rooms" value={fmtInt(totalRooms)} sub={`${byType.length} types`} icon={BedDouble} colorKey="blue" colors={colors} />
                        <MiniStat label="Total Capacity" value={fmtInt(totalCapacity)} sub="guest beds" icon={Layers} colorKey="green" colors={colors} />
                        <MiniStat label="Properties" value={fmtInt(byProperty.length)} sub="with inventory" icon={Building2} colorKey="purple" colors={colors} />
                        <MiniStat label="90d Occupancy" value={fmtPct(utilization)} sub="derived from bookings" icon={Scaling} colorKey="orange" colors={colors} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <Card title="Rooms by Type" icon={BedDouble} colors={colors}>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={byType} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                    <CartesianGrid stroke={colors.grid} horizontal={false} />
                                    <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} width={130} />
                                    <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                    <Bar dataKey="count" name="Rooms" radius={[0, 6, 6, 0]}>
                                        {byType.map((_: any, i: number) => <Cell key={i} fill={palette[i % palette.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card title="Capacity by Type" icon={Layers} colors={colors}>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={byType} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                                    <CartesianGrid stroke={colors.grid} horizontal={false} />
                                    <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} width={130} />
                                    <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                    <Bar dataKey="capacity" name="Capacity" fill={colors.green} radius={[0, 6, 6, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card title="Rooms by Property" icon={Building2} colors={colors}>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={byProperty} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                                    <CartesianGrid stroke={colors.grid} vertical={false} />
                                    <XAxis dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} interval={0} angle={-12} textAnchor="end" height={50} />
                                    <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} stroke={colors.grid} allowDecimals={false} />
                                    <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                    <Bar dataKey="count" name="Rooms" radius={[6, 6, 0, 0]}>
                                        {byProperty.map((_: any, i: number) => <Cell key={i} fill={palette[(i + 1) % palette.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card title="Inventory Size Distribution" icon={PieIcon} colors={colors}>
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie data={sizeDist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                                        {sizeDist.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                                    </Pie>
                                    <Tooltip {...tip(colors)} />
                                    <Legend formatter={(v: any) => <span style={{ color: colors.textMuted, fontSize: 11 }}>{v}</span>} />
                                </PieChart>
                            </ResponsiveContainer>
                        </Card>
                    </div>

                    <Card title="Room Type Detail" icon={BedDouble} colors={colors} >
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ color: colors.textMuted }}>
                                        <Th colors={colors}>Type</Th><Th colors={colors}>Property</Th><Th colors={colors}>Units</Th><Th colors={colors}>Capacity / unit</Th><Th colors={colors}>Total capacity</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {byType.flatMap((t: any) => rooms.filter((r) => (r.name || 'Unnamed') === t.name).map((r, idx) => (
                                        <tr key={r.id || idx} style={{ borderTop: `1px solid ${colors.border}`, color: colors.textMain }}>
                                            <Td colors={colors}>{r.name || 'Unnamed'}</Td>
                                            <Td colors={colors}>{propMap[r.propertyId] || r.propertyId || '—'}</Td>
                                            <Td colors={colors}>{fmtInt(num(r.count))}</Td>
                                            <Td colors={colors}>{fmtInt(num(r.capacity))}</Td>
                                            <Td colors={colors}>{fmtInt(num(r.count) * num(r.capacity))}</Td>
                                        </tr>
                                    )))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
}

function sumCount(rooms: any[]): number { return rooms.reduce((a, r) => a + num(r.count), 0); }
function sumCap(rooms: any[]): number { return rooms.reduce((a, r) => a + num(r.count) * num(r.capacity), 0); }
function Th({ children, colors }: any) { return <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 700 }}>{children}</th>; }
function Td({ children, colors }: any) { return <td style={{ padding: '8px 10px' }}>{children}</td>; }
