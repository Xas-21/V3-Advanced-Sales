import React, { useEffect, useMemo, useState } from 'react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Legend,
    AreaChart,
    Area,
} from 'recharts';
import { Trophy, Target, DollarSign, CheckCircle2, Users, TrendingUp } from 'lucide-react';
import { apiUrl } from '../../backendApi';
import { formatCurrencyAmount, resolveCurrencyCode, type CurrencyCode } from '../../currency';

const tint = (c: string, a = '22') => `${c}${a}`;
function asArr(v: any): any[] {
    return Array.isArray(v) ? v : [];
}
function money(v: any): number {
    const n = parseFloat(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
}
function parseYmd(raw: any): string {
    if (!raw) return '';
    const s = String(raw).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
}
function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function resolveUserKey(req: any): string {
    const v = req?.createdByUserId;
    if (v != null && String(v).trim() !== '') return String(v).trim();
    return String(req?.createdBy || req?.owner || '').trim() || 'Unassigned';
}
function normStatus(s: any): string {
    return String(s || '').trim().toLowerCase();
}
function isWon(s: string): boolean {
    return s === 'confirmed' || s === 'won' || s === 'definite' || s === 'actual' || s === 'signed';
}
function isLost(s: string): boolean {
    return s === 'cancelled' || s === 'lost' || s === 'expired';
}
const RANGE_OPTIONS = [
    { label: '7D', days: 7 },
    { label: '30D', days: 30 },
    { label: '90D', days: 90 },
    { label: 'All', days: 0 },
];
const CARD_STYLE: React.CSSProperties = { borderRadius: 16, borderWidth: 1, borderStyle: 'solid' };

function MiniStat({ colors, icon: Icon, label, value, sub, color }: { colors: any; icon: any; label: string; value: React.ReactNode; sub?: React.ReactNode; color: string }) {
    return (
        <div style={{ ...CARD_STYLE, display: 'flex', alignItems: 'center', gap: 14, padding: 16, backgroundColor: colors.card, borderColor: colors.border }}>
            <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color, backgroundColor: tint(color) }}>
                <Icon size={22} strokeWidth={2.1} />
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
                <div style={{ color: colors.textMain, fontSize: 22, fontWeight: 700, lineHeight: 1.15 }}>{value}</div>
                {sub != null ? <div style={{ color: colors.textMuted, fontSize: 11 }}>{sub}</div> : null}
            </div>
        </div>
    );
}
function tooltipProps(colors: any) {
    return {
        contentStyle: { backgroundColor: colors.tooltip, borderColor: colors.border, borderRadius: 8, color: colors.textMain },
        labelStyle: { color: colors.textMain, fontWeight: 700 },
        itemStyle: { color: colors.textMain },
    };
}
function EmptyState({ colors, label }: { colors: any; label: string }) {
    return (
        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 32, textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
            No data available{label ? ` for ${label}` : ''}.
        </div>
    );
}
function RangeFilter({ colors, value, onChange }: { colors: any; value: number; onChange: (d: number) => void }) {
    return (
        <div style={{ display: 'inline-flex', borderRadius: 10, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
            {RANGE_OPTIONS.map((o) => {
                const active = o.days === value;
                return (
                    <button key={o.label} onClick={() => onChange(o.days)} style={{ border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: 12, fontWeight: 600, color: active ? colors.bg : colors.textMuted, backgroundColor: active ? colors.primary : 'transparent' }}>
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

export default function DashboardHubSalesPerformancePage({ colors }: { colors: any }) {
    const [requests, setRequests] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [range, setRange] = useState<number>(30);
    const currency = 'SAR' as CurrencyCode;
    const cc = resolveCurrencyCode(currency);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [rR, uR] = await Promise.all([fetch(apiUrl('/api/requests')), fetch(apiUrl('/api/users'))]);
                const [r, u] = await Promise.all([rR.json(), uR.json()]);
                if (!alive) return;
                setRequests(asArr(r));
                setUsers(asArr(u));
            } catch {
                /* ignore */
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    const userById = useMemo(() => {
        const m = new Map<string, any>();
        users.forEach((u) => m.set(String(u.id), u));
        return m;
    }, [users]);

    const userName = (key: string): string => {
        if (!key || key === 'Unassigned') return 'Unassigned';
        const u = userById.get(key);
        if (u) return u.name || u.username || key;
        return key;
    };

    const cutoff = useMemo(() => {
        if (!range) return 0;
        return startOfDay(new Date()) - range * 86400000;
    }, [range]);

    const inRange = (req: any) => {
        if (!range) return true;
        const d = parseYmd(req.createdAt || req.checkIn);
        if (!d) return true;
        return startOfDay(new Date(d)) >= cutoff;
    };
    const filtered = useMemo(() => requests.filter(inRange), [requests, inRange]);

    const repStats = useMemo(() => {
        const m = new Map<string, { requests: number; won: number; lost: number; revenue: number; pending: number }>();
        filtered.forEach((r) => {
            const key = resolveUserKey(r);
            if (!m.has(key)) m.set(key, { requests: 0, won: 0, lost: 0, revenue: 0, pending: 0 });
            const s = m.get(key)!;
            s.requests += 1;
            const st = normStatus(r.status);
            if (isWon(st)) {
                s.won += 1;
                s.revenue += money(r.totalCost);
            } else if (isLost(st)) {
                s.lost += 1;
            } else {
                s.pending += 1;
                s.revenue += money(r.totalCost);
            }
        });
        const rows = Array.from(m.entries()).map(([key, v]) => {
            const decided = v.won + v.lost;
            const conversion = decided ? (v.won / decided) * 100 : 0;
            return { key, name: userName(key), ...v, conversion: Math.round(conversion) };
        });
        rows.sort((a, b) => b.revenue - a.revenue);
        return rows;
    }, [filtered, userName]);

    const leaderboard = useMemo(() => repStats.slice(0, 10), [repStats]);
    const topByRequests = useMemo(() => [...repStats].sort((a, b) => b.requests - a.requests).slice(0, 8), [repStats]);
    const topByConversion = useMemo(() => [...repStats].filter((r) => r.won + r.lost >= 1).sort((a, b) => b.conversion - a.conversion).slice(0, 8), [repStats]);

    const revTrend = useMemo(() => {
        const m = new Map<string, number>();
        filtered.forEach((r) => {
            const st = normStatus(r.status);
            if (!isWon(st)) return;
            const key = parseYmd(r.createdAt || r.checkIn || r.eventStart).slice(0, 7);
            if (!key) return;
            m.set(key, (m.get(key) || 0) + money(r.totalCost));
        });
        return Array.from(m.entries()).map(([month, revenue]) => ({ month, revenue })).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
    }, [filtered]);

    const totalRequests = filtered.length;
    const totalWon = filtered.filter((r) => isWon(normStatus(r.status))).length;
    const totalRevenue = filtered.reduce((s, r) => (isWon(normStatus(r.status)) ? s + money(r.totalCost) : s), 0);
    const avgConversion = repStats.length
        ? Math.round(repStats.reduce((s, r) => s + r.conversion, 0) / repStats.length)
        : 0;
    const hasData = repStats.length > 0;
    const palettes = [colors.blue, colors.green, colors.purple, colors.orange, colors.yellow, colors.cyan, colors.red, colors.primary];

    const fmtMoney = (n: number) => formatCurrencyAmount(n, cc);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.primary, backgroundColor: tint(colors.primary) }}>
                        <Trophy size={24} strokeWidth={2.1} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, color: colors.textMain, fontSize: 20, fontWeight: 700 }}>Sales Performance</h2>
                        <div style={{ color: colors.textMuted, fontSize: 12 }}>{repStats.length} reps · {totalRequests} requests</div>
                    </div>
                </div>
                <RangeFilter colors={colors} value={range} onChange={setRange} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <MiniStat colors={colors} icon={DollarSign} label="Won Revenue" value={fmtMoney(totalRevenue)} color={colors.green} />
                <MiniStat colors={colors} icon={CheckCircle2} label="Won Requests" value={totalWon} sub={`of ${totalRequests}`} color={colors.blue} />
                <MiniStat colors={colors} icon={Target} label="Avg Conversion" value={`${avgConversion}%`} color={colors.purple} />
                <MiniStat colors={colors} icon={Users} label="Active Reps" value={repStats.length} color={colors.orange} />
            </div>

            {!hasData ? (
                <EmptyState colors={colors} label="sales activity" />
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Revenue by Rep</div>
                            {leaderboard.length ? (
                                <ResponsiveContainer width="100%" height={Math.max(240, leaderboard.length * 34)}>
                                    <BarChart data={leaderboard} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtMoney(v)} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                                        <Tooltip {...tooltipProps(colors)} formatter={(v: any) => [fmtMoney(Number(v)), 'Revenue']} cursor={{ fill: colors.border }} />
                                        <Bar dataKey="revenue" name="Revenue" fill={colors.green} radius={[0, 4, 4, 0]} barSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="revenue" />
                            )}
                        </div>

                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Requests by Rep</div>
                            {topByRequests.length ? (
                                <ResponsiveContainer width="100%" height={Math.max(240, topByRequests.length * 34)}>
                                    <BarChart data={topByRequests} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                                        <Tooltip {...tooltipProps(colors)} cursor={{ fill: colors.border }} />
                                        <Bar dataKey="requests" name="Requests" fill={colors.blue} radius={[0, 4, 4, 0]} barSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="requests" />
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Conversion Rate (reps w/ ≥1 decision)</div>
                            {topByConversion.length ? (
                                <ResponsiveContainer width="100%" height={Math.max(220, topByConversion.length * 34)}>
                                    <BarChart data={topByConversion} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                                        <XAxis type="number" tickFormatter={(v: number) => `${v}%`} tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                                        <Tooltip {...tooltipProps(colors)} formatter={(v: any) => [`${v}%`, 'Conversion']} cursor={{ fill: colors.border }} />
                                        <Bar dataKey="conversion" name="Conversion" fill={colors.purple} radius={[0, 4, 4, 0]} barSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="conversion" />
                            )}
                        </div>

                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Won Revenue Trend</div>
                            {revTrend.length ? (
                                <ResponsiveContainer width="100%" height={240}>
                                    <AreaChart data={revTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="revTrend" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={colors.green} stopOpacity={0.35} />
                                                <stop offset="95%" stopColor={colors.green} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                                        <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis tickFormatter={(v: number) => fmtMoney(v)} tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <Tooltip {...tooltipProps(colors)} formatter={(v: any) => [fmtMoney(Number(v)), 'Revenue']} />
                                        <Area type="monotone" dataKey="revenue" name="Revenue" stroke={colors.green} fill="url(#revTrend)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="revenue trend" />
                            )}
                        </div>
                    </div>

                    <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                        <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <TrendingUp size={16} color={colors.green} /> Rep Leaderboard
                        </div>
                        {leaderboard.length ? (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ color: colors.textMuted, textAlign: 'left' }}>
                                            <th style={{ padding: '6px 8px' }}>#</th>
                                            <th style={{ padding: '6px 8px' }}>Rep</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Requests</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Won</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Conv.</th>
                                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboard.map((r, i) => (
                                            <tr key={r.key} style={{ color: colors.textMain, borderTop: `1px solid ${colors.border}` }}>
                                                <td style={{ padding: '6px 8px', color: i === 0 ? colors.primary : colors.textMuted, fontWeight: 700 }}>{i + 1}</td>
                                                <td style={{ padding: '6px 8px' }}>{r.name}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.requests}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right', color: colors.green, fontWeight: 600 }}>{r.won}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.conversion}%</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtMoney(r.revenue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <EmptyState colors={colors} label="leaderboard" />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
