/**
 * Hub user activity preview — logged actions on requests/accounts (not CRM call activities).
 */
import React, { useMemo, useState } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
    CartesianGrid, Legend, AreaChart, Area,
} from 'recharts';
import { Activity, Users, FilePlus2, History, MousePointerClick } from 'lucide-react';
import { useHubData } from '../HubDataContext';
import {
    hexA, fmtInt, fmtPct, tip, legendStyle, palette,
    Card, MiniStat, RangeTabs, EmptyState, Hero, Meter, PageShell,
    rangeBounds, type RangeKey,
} from '../analyticsKit';
import { CHART_H, GRID_2 } from '../hubPreviewShared';

function parseYmd(raw: any): string {
    if (!raw) return '';
    const s = String(raw).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
}

function logTime(dateStr: string): number {
    return new Date(dateStr).getTime();
}

function inRangeDate(dateStr: string, start: number, range: RangeKey): boolean {
    if (range === 'all') return true;
    const t = logTime(dateStr);
    return !Number.isNaN(t) && t >= start;
}

export default function DashboardHubActivitiesPage({ colors }: { colors: any }) {
    const { requests, accounts, users, activeProperty } = useHubData();
    const [range, setRange] = useState<RangeKey>('30');
    const { start } = useMemo(() => rangeBounds(range), [range]);
    const pal = palette(colors);

    const userById = useMemo(() => {
        const m = new Map<string, any>();
        users.forEach((u) => m.set(String(u.id), u));
        return m;
    }, [users]);

    const resolveName = (raw: string) => {
        const u = userById.get(String(raw));
        return u ? (u.name || u.username || raw) : (raw || 'Unknown');
    };

    type LogEntry = { date: string; action: string; user: string; source: string };
    const allLogs = useMemo<LogEntry[]>(() => {
        const out: LogEntry[] = [];
        requests.forEach((req) => (Array.isArray(req.logs) ? req.logs : []).forEach((l: any) =>
            out.push({
                date: String(l.date || ''),
                action: String(l.action || 'action'),
                user: resolveName(String(l.user || 'Unknown')),
                source: 'request',
            })));
        accounts.forEach((acc) => (Array.isArray(acc.activities) ? acc.activities : []).forEach((l: any) =>
            out.push({
                date: String(l.at || l.date || ''),
                action: String(l.title || l.action || 'activity'),
                user: resolveName(String(l.user || 'Unknown')),
                source: 'account',
            })));
        return out;
    }, [requests, accounts, userById]);

    const logs = useMemo(
        () => allLogs.filter((l) => inRangeDate(l.date, start, range)),
        [allLogs, start, range],
    );

    const activeUserCount = useMemo(() => {
        const s = new Set<string>();
        logs.forEach((l) => { if (l.user.trim()) s.add(l.user.trim()); });
        return s.size;
    }, [logs]);

    const participationRate = users.length ? activeUserCount / users.length : 0;

    const timeline = useMemo(() => {
        const m = new Map<string, number>();
        const daily = range !== 'all' && parseInt(range, 10) <= 30;
        logs.forEach((l) => {
            const k = parseYmd(l.date);
            if (!k) return;
            const key = daily ? k : k.slice(0, 7);
            m.set(key, (m.get(key) || 0) + 1);
        });
        return Array.from(m.entries())
            .map(([period, value]) => ({ period, value }))
            .sort((a, b) => a.period.localeCompare(b.period))
            .slice(daily ? -30 : -12);
    }, [logs, range]);

    const actionBreakdown = useMemo(() => {
        const m = new Map<string, number>();
        logs.forEach((l) => { const k = l.action.trim() || 'Unknown'; m.set(k, (m.get(k) || 0) + 1); });
        return Array.from(m.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
    }, [logs]);

    const topUsers = useMemo(() => {
        const m = new Map<string, number>();
        logs.forEach((l) => { const k = l.user.trim() || 'Unknown'; m.set(k, (m.get(k) || 0) + 1); });
        return Array.from(m.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [logs]);

    const sourceMix = useMemo(() => {
        const m = new Map<string, number>();
        logs.forEach((l) => m.set(l.source, (m.get(l.source) || 0) + 1));
        return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
    }, [logs]);

    const newRequests = useMemo(
        () => requests.filter((r) => inRangeDate(String(r.createdAt || ''), start, range)).length,
        [requests, start, range],
    );
    const newAccounts = useMemo(
        () => accounts.filter((a) => inRangeDate(String(a.createdAt || ''), start, range)).length,
        [accounts, start, range],
    );

    const hasData = allLogs.length > 0;

    return (
        <PageShell colors={colors} enterDeps={[range]}>
            <div style={{ padding: 4 }}>
                <div data-hub-animate>
                    <Hero
                        icon={Activity}
                        title="Hub user activity"
                        colors={colors}
                        activeProperty={activeProperty}
                        subtitle={
                            range === 'all'
                                ? `${fmtInt(logs.length)} logged actions · ${fmtInt(activeUserCount)} active users`
                                : `${fmtInt(logs.length)} actions · ${fmtInt(activeUserCount)} users · last ${range === '365' ? '1 year' : `${range} days`}`
                        }
                        right={<RangeTabs value={range} onChange={setRange} colors={colors} />}
                    />
                </div>

                {!hasData ? (
                    <EmptyState icon={Activity} text="No hub user activity logged for this property yet." colors={colors} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div
                            data-hub-animate
                            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}
                        >
                            <MiniStat
                                label="Logged actions"
                                value={fmtInt(logs.length)}
                                sub={range === 'all' ? 'All time' : `${range}D window`}
                                icon={MousePointerClick}
                                colorKey="blue"
                                colors={colors}
                            />
                            <MiniStat
                                label="Active users"
                                value={fmtInt(activeUserCount)}
                                sub={`${fmtInt(users.length)} team · top 10 in chart`}
                                icon={Users}
                                colorKey="green"
                                colors={colors}
                            />
                            <MiniStat label="New requests" value={fmtInt(newRequests)} icon={FilePlus2} colorKey="purple" colors={colors} />
                            <MiniStat label="New accounts" value={fmtInt(newAccounts)} icon={Users} colorKey="orange" colors={colors} />
                        </div>

                        <Card title="Team participation" icon={Users} colors={colors}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
                                <div style={{ minWidth: 160 }}>
                                    <div style={{ color: colors.textMain, fontSize: 42, fontWeight: 900, lineHeight: 1 }}>
                                        {fmtPct(participationRate, 0)}
                                    </div>
                                    <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                                        users with ≥1 logged action in period
                                    </div>
                                </div>
                                <div style={{ flex: 1, minWidth: 220 }}>
                                    <Meter value={participationRate} colors={colors} color={colors.green} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, fontWeight: 700 }}>
                                        <span style={{ color: colors.green }}>Active {fmtInt(activeUserCount)}</span>
                                        <span style={{ color: colors.textMuted }}>Team {fmtInt(users.length)}</span>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Card title="Activity timeline" icon={Activity} colors={colors}>
                            {timeline.length ? (
                                <ResponsiveContainer width="100%" height={CHART_H}>
                                    <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="actPrevTimeline" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={colors.blue} stopOpacity={0.35} />
                                                <stop offset="95%" stopColor={colors.blue} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid stroke={colors.grid} vertical={false} />
                                        <XAxis dataKey="period" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <Tooltip {...tip(colors)} />
                                        <Area type="monotone" dataKey="value" name="Actions" stroke={colors.blue} fill="url(#actPrevTimeline)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : <EmptyState icon={Activity} text="No timeline in period" colors={colors} />}
                        </Card>

                        <div data-hub-animate style={{ display: 'grid', gridTemplateColumns: GRID_2, gap: 18 }}>
                            {sourceMix.length > 0 && (
                                <Card title="Log source mix" icon={History} colors={colors}>
                                    <ResponsiveContainer width="100%" height={CHART_H}>
                                        <PieChart>
                                            <Pie data={sourceMix} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={56} paddingAngle={2}>
                                                {sourceMix.map((_, i) => <Cell key={i} fill={pal[i % pal.length]} />)}
                                            </Pie>
                                            <Tooltip {...tip(colors)} />
                                            <Legend formatter={legendStyle(colors)} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </Card>
                            )}

                            {actionBreakdown.length > 0 && (
                                <Card title="Top action types" icon={MousePointerClick} colors={colors}>
                                    <ResponsiveContainer width="100%" height={CHART_H}>
                                        <BarChart data={actionBreakdown} layout="vertical" margin={{ left: 8, right: 16 }}>
                                            <CartesianGrid stroke={colors.grid} horizontal={false} />
                                            <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                            <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
                                            <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                            <Bar dataKey="value" name="Actions" fill={colors.orange} radius={[0, 4, 4, 0]} barSize={18} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Card>
                            )}
                        </div>

                        {topUsers.length > 0 && (
                            <Card title="Top 10 users by logged actions" icon={Users} colors={colors}>
                                <ResponsiveContainer width="100%" height={CHART_H}>
                                    <BarChart data={topUsers} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid stroke={colors.grid} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                                        <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                        <Bar dataKey="value" name="Actions" fill={colors.green} radius={[0, 4, 4, 0]} barSize={16} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Card>
                        )}

                        <Card title="Recent logged actions" icon={History} colors={colors}>
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
                                        {logs.slice().sort((a, b) => parseYmd(b.date).localeCompare(parseYmd(a.date))).slice(0, 15).map((l, i) => (
                                            <tr key={i} style={{ color: colors.textMain, borderTop: `1px solid ${colors.border}` }}>
                                                <td style={{ padding: '6px 8px' }}>{parseYmd(l.date) || '—'}</td>
                                                <td style={{ padding: '6px 8px' }}>{l.user || 'Unknown'}</td>
                                                <td style={{ padding: '6px 8px' }}>{l.action}</td>
                                                <td style={{ padding: '6px 8px', textTransform: 'capitalize' }}>{l.source}</td>
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
