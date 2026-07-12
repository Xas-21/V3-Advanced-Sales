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
import { Activity, Users, FilePlus2, History, CalendarDays, MousePointerClick } from 'lucide-react';
import { apiUrl } from '../../backendApi';

const tint = (c: string, a = '22') => `${c}${a}`;
function asArr(v: any): any[] {
    return Array.isArray(v) ? v : [];
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

export default function DashboardHubActivitiesPage({ colors }: { colors: any }) {
    const [requests, setRequests] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [range, setRange] = useState<number>(30);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [rR, aR] = await Promise.all([fetch(apiUrl('/api/requests')), fetch(apiUrl('/api/accounts'))]);
                const [r, a] = await Promise.all([rR.json(), aR.json()]);
                if (!alive) return;
                setRequests(asArr(r));
                setAccounts(asArr(a));
            } catch {
                /* ignore */
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    const cutoff = useMemo(() => {
        if (!range) return 0;
        return startOfDay(new Date()) - range * 86400000;
    }, [range]);

    type LogEntry = { date: string; action: string; user: string; source: string };
    const allLogs = useMemo<LogEntry[]>(() => {
        const out: LogEntry[] = [];
        requests.forEach((req) => {
            asArr(req.logs).forEach((l: any) => {
                out.push({ date: String(l.date || ''), action: String(l.action || 'action'), user: String(l.user || 'Unknown'), source: 'request' });
            });
        });
        accounts.forEach((acc) => {
            asArr(acc.activities).forEach((l: any) => {
                out.push({ date: String(l.at || l.date || ''), action: String(l.title || l.action || 'activity'), user: String(l.user || 'Unknown'), source: 'account' });
            });
        });
        return out;
    }, [requests, accounts]);

    const inRange = (dateStr: string) => {
        if (!range) return true;
        const d = parseYmd(dateStr);
        if (!d) return true;
        return startOfDay(new Date(d)) >= cutoff;
    };
    const filteredLogs = useMemo(() => allLogs.filter((l) => inRange(l.date)), [allLogs, inRange]);

    const dailyTimeline = useMemo(() => {
        const m = new Map<string, number>();
        filteredLogs.forEach((l) => {
            const k = parseYmd(l.date);
            if (!k) return;
            const key = range && range <= 7 ? k : k.slice(0, 7);
            m.set(key, (m.get(key) || 0) + 1);
        });
        // For 7D show day buckets; otherwise monthly
        const rows = Array.from(m.entries()).map(([period, value]) => ({ period, value }));
        if (range && range <= 7) {
            rows.sort((a, b) => a.period.localeCompare(b.period));
            return rows.slice(-14);
        }
        return rows.sort((a, b) => a.period.localeCompare(b.period)).slice(-12);
    }, [filteredLogs, range]);

    const actionBreakdown = useMemo(() => {
        const m = new Map<string, number>();
        filteredLogs.forEach((l) => {
            const k = l.action.trim() || 'Unknown';
            m.set(k, (m.get(k) || 0) + 1);
        });
        return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    }, [filteredLogs]);

    const byUser = useMemo(() => {
        const m = new Map<string, number>();
        filteredLogs.forEach((l) => {
            const k = l.user.trim() || 'Unknown';
            m.set(k, (m.get(k) || 0) + 1);
        });
        return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
    }, [filteredLogs]);

    const sourceMix = useMemo(() => {
        const m = new Map<string, number>();
        filteredLogs.forEach((l) => m.set(l.source, (m.get(l.source) || 0) + 1));
        return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
    }, [filteredLogs]);

    const newRequests = useMemo(() => requests.filter((r) => inRange(r.createdAt)).length, [requests, inRange]);
    const newAccounts = useMemo(() => accounts.filter((a) => inRange(a.createdAt)).length, [accounts, inRange]);
    const totalLogs = filteredLogs.length;
    const activeUsers = byUser.length;
    const hasData = allLogs.length > 0;
    const palettes = [colors.blue, colors.green, colors.purple, colors.orange, colors.yellow, colors.cyan, colors.red, colors.primary];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.primary, backgroundColor: tint(colors.primary) }}>
                        <Activity size={24} strokeWidth={2.1} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, color: colors.textMain, fontSize: 20, fontWeight: 700 }}>User Activity</h2>
                        <div style={{ color: colors.textMuted, fontSize: 12 }}>{allLogs.length} logged actions tracked</div>
                    </div>
                </div>
                <RangeFilter colors={colors} value={range} onChange={setRange} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <MiniStat colors={colors} icon={MousePointerClick} label="Total Actions" value={totalLogs} sub={`${range ? `${range}D` : 'All'}`} color={colors.blue} />
                <MiniStat colors={colors} icon={Users} label="Active Users" value={activeUsers} color={colors.green} />
                <MiniStat colors={colors} icon={FilePlus2} label="New Requests" value={newRequests} color={colors.purple} />
                <MiniStat colors={colors} icon={Users} label="New Accounts" value={newAccounts} color={colors.orange} />
            </div>

            {!hasData ? (
                <EmptyState colors={colors} label="activity" />
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Daily Activity Timeline</div>
                            {dailyTimeline.length ? (
                                <ResponsiveContainer width="100%" height={240}>
                                    <AreaChart data={dailyTimeline} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="actTimeline" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={colors.blue} stopOpacity={0.35} />
                                                <stop offset="95%" stopColor={colors.blue} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                                        <XAxis dataKey="period" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <Tooltip {...tooltipProps(colors)} />
                                        <Area type="monotone" dataKey="value" name="Actions" stroke={colors.blue} fill="url(#actTimeline)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="timeline" />
                            )}
                        </div>

                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Activity Source Mix</div>
                            {sourceMix.length ? (
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart>
                                        <Pie data={sourceMix} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                                            {sourceMix.map((_, i) => (
                                                <Cell key={i} fill={palettes[i % palettes.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip {...tooltipProps(colors)} />
                                        <Legend wrapperStyle={{ fontSize: 11, color: colors.textMuted }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="sources" />
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Top Actions</div>
                            {actionBreakdown.length ? (
                                <ResponsiveContainer width="100%" height={Math.max(220, actionBreakdown.length * 34)}>
                                    <BarChart data={actionBreakdown} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                                        <Tooltip {...tooltipProps(colors)} cursor={{ fill: colors.border }} />
                                        <Bar dataKey="value" name="Actions" fill={colors.orange} radius={[0, 4, 4, 0]} barSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="actions" />
                            )}
                        </div>

                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Activity by User</div>
                            {byUser.length ? (
                                <ResponsiveContainer width="100%" height={Math.max(220, byUser.length * 32)}>
                                    <BarChart data={byUser} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
                                        <Tooltip {...tooltipProps(colors)} cursor={{ fill: colors.border }} />
                                        <Bar dataKey="value" name="Actions" fill={colors.green} radius={[0, 4, 4, 0]} barSize={16} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="users" />
                            )}
                        </div>
                    </div>

                    <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                        <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <History size={16} color={colors.blue} /> Recent Actions
                        </div>
                        {filteredLogs.length ? (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ color: colors.textMuted, textAlign: 'left' }}>
                                            <th style={{ padding: '6px 8px' }}>Date</th>
                                            <th style={{ padding: '6px 8px' }}>User</th>
                                            <th style={{ padding: '6px 8px' }}>Action</th>
                                            <th style={{ padding: '6px 8px' }}>Source</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLogs
                                            .slice()
                                            .sort((a, b) => parseYmd(b.date).localeCompare(parseYmd(a.date)))
                                            .slice(0, 12)
                                            .map((l, i) => (
                                                <tr key={i} style={{ color: colors.textMain, borderTop: `1px solid ${colors.border}` }}>
                                                    <td style={{ padding: '6px 8px' }}>{parseYmd(l.date) || '—'}</td>
                                                    <td style={{ padding: '6px 8px' }}>{l.user || 'Unknown'}</td>
                                                    <td style={{ padding: '6px 8px' }}>{l.action}</td>
                                                    <td style={{ padding: '6px 8px' }}>{l.source}</td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <EmptyState colors={colors} label="recent actions" />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
