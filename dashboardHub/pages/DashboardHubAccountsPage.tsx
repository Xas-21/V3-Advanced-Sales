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
import { Users, Building2, FileText, TrendingUp, CalendarDays } from 'lucide-react';
import { apiUrl } from '../../backendApi';
import { resolveCurrencyCode, type CurrencyCode } from '../../currency';

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
function money(v: any): number {
    const n = parseFloat(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
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

const CARD_STYLE: React.CSSProperties = {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'solid',
};

function MiniStat({
    colors,
    icon: Icon,
    label,
    value,
    sub,
    color,
}: {
    colors: any;
    icon: any;
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    color: string;
}) {
    return (
        <div
            style={{
                ...CARD_STYLE,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: 16,
                backgroundColor: colors.card,
                borderColor: colors.border,
            }}
        >
            <div
                style={{
                    flexShrink: 0,
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color,
                    backgroundColor: tint(color),
                }}
            >
                <Icon size={22} strokeWidth={2.1} />
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{ color: colors.textMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {label}
                </div>
                <div style={{ color: colors.textMain, fontSize: 22, fontWeight: 700, lineHeight: 1.15 }}>{value}</div>
                {sub != null ? <div style={{ color: colors.textMuted, fontSize: 11 }}>{sub}</div> : null}
            </div>
        </div>
    );
}

function tooltipProps(colors: any) {
    return {
        contentStyle: {
            backgroundColor: colors.tooltip,
            borderColor: colors.border,
            borderRadius: 8,
            color: colors.textMain,
        },
        labelStyle: { color: colors.textMain, fontWeight: 700 },
        itemStyle: { color: colors.textMain },
    };
}

function EmptyState({ colors, label }: { colors: any; label: string }) {
    return (
        <div
            style={{
                ...CARD_STYLE,
                backgroundColor: colors.card,
                borderColor: colors.border,
                padding: 32,
                textAlign: 'center',
                color: colors.textMuted,
                fontSize: 13,
            }}
        >
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
                    <button
                        key={o.label}
                        onClick={() => onChange(o.days)}
                        style={{
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            color: active ? colors.bg : colors.textMuted,
                            backgroundColor: active ? colors.primary : 'transparent',
                        }}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

export default function DashboardHubAccountsPage({ colors }: { colors: any }) {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [contracts, setContracts] = useState<any[]>([]);
    const [range, setRange] = useState<number>(30);
    const currency = 'SAR' as CurrencyCode;
    const cc = resolveCurrencyCode(currency);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [aR, rR, cR] = await Promise.all([
                    fetch(apiUrl('/api/accounts')),
                    fetch(apiUrl('/api/requests')),
                    fetch(apiUrl('/api/contracts/templates')),
                ]);
                const [a, r, c] = await Promise.all([aR.json(), rR.json(), cR.json()]);
                if (!alive) return;
                setAccounts(asArr(a));
                setRequests(asArr(r));
                setContracts(asArr(c));
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

    const inRange = (dateStr: string) => {
        if (!range) return true;
        const d = parseYmd(dateStr);
        if (!d) return true;
        const t = startOfDay(new Date(d));
        return t >= cutoff;
    };

    const prevCutoff = useMemo(() => {
        if (!range) return 0;
        return cutoff - range * 86400000;
    }, [range, cutoff]);

    // Derived analytics
    const newAccounts = useMemo(() => accounts.filter((a) => inRange(a.createdAt)), [accounts, inRange]);
    const newPrev = useMemo(
        () => accounts.filter((a) => {
            const d = parseYmd(a.createdAt);
            if (!d) return false;
            const t = startOfDay(new Date(d));
            return t >= prevCutoff && t < cutoff;
        }),
        [accounts, prevCutoff, cutoff, range],
    );

    const types = useMemo(() => {
        const m = new Map<string, number>();
        accounts.forEach((a) => {
            const k = String(a.type || 'Unspecified').trim() || 'Unspecified';
            m.set(k, (m.get(k) || 0) + 1);
        });
        return Array.from(m.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [accounts]);

    const countries = useMemo(() => {
        const m = new Map<string, number>();
        accounts.forEach((a) => {
            const k = String(a.country || a.city || 'Unknown').trim() || 'Unknown';
            m.set(k, (m.get(k) || 0) + 1);
        });
        return Array.from(m.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
    }, [accounts]);

    const byAccountReq = useMemo(() => {
        const m = new Map<string, number>();
        requests.forEach((r) => {
            const id = String(r.accountId || '').trim();
            if (!id) return;
            m.set(id, (m.get(id) || 0) + 1);
        });
        const rows = Array.from(m.entries()).map(([id, count]) => {
            const acc = accounts.find((a) => String(a.id) === id);
            return { id, name: acc?.name || r_name(requests, id), count };
        });
        return rows.sort((a, b) => b.count - a.count).slice(0, 8);
    }, [accounts, requests]);

    const creationTrend = useMemo(() => {
        const m = new Map<string, number>();
        accounts.forEach((a) => {
            const d = parseYmd(a.createdAt);
            if (!d) return;
            const key = d.slice(0, 7);
            m.set(key, (m.get(key) || 0) + 1);
        });
        return Array.from(m.entries())
            .map(([month, value]) => ({ month, value }))
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-12);
    }, [accounts]);

    const activityTrend = useMemo(() => {
        const m = new Map<string, number>();
        accounts.forEach((a) => {
            asArr(a.activities).forEach((act: any) => {
                const d = parseYmd(act.at || act.date);
                if (!d) return;
                const key = d.slice(0, 7);
                m.set(key, (m.get(key) || 0) + 1);
            });
        });
        return Array.from(m.entries())
            .map(([month, value]) => ({ month, value }))
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-12);
    }, [accounts]);

    const activeAccounts = useMemo(() => {
        const ids = new Set(requests.map((r) => String(r.accountId || '').trim()).filter(Boolean));
        return accounts.filter((a) => ids.has(String(a.id))).length;
    }, [accounts, requests]);

    const totalActivities = useMemo(
        () => accounts.reduce((s, a) => s + asArr(a.activities).length, 0),
        [accounts],
    );

    const palettes = [colors.blue, colors.green, colors.purple, colors.orange, colors.yellow, colors.cyan, colors.red, colors.primary];

    const deltaPct = (cur: number, prev: number) => {
        if (!prev) return cur > 0 ? 'new' : '0%';
        return `${(((cur - prev) / prev) * 100).toFixed(0)}%`;
    };

    const hasData = accounts.length > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: colors.primary,
                            backgroundColor: tint(colors.primary),
                        }}
                    >
                        <Users size={24} strokeWidth={2.1} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, color: colors.textMain, fontSize: 20, fontWeight: 700 }}>Account Portfolio</h2>
                        <div style={{ color: colors.textMuted, fontSize: 12 }}>{accounts.length} accounts tracked</div>
                    </div>
                </div>
                <RangeFilter colors={colors} value={range} onChange={setRange} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <MiniStat
                    colors={colors}
                    icon={Building2}
                    label="Total Accounts"
                    value={accounts.length}
                    color={colors.blue}
                />
                <MiniStat
                    colors={colors}
                    icon={CalendarDays}
                    label={`New (${range ? `${range}D` : 'All'})`}
                    value={newAccounts.length}
                    sub={`vs ${newPrev.length} prev`}
                    color={colors.green}
                />
                <MiniStat
                    colors={colors}
                    icon={Users}
                    label="Active Accts"
                    value={activeAccounts}
                    sub={`${accounts.length ? Math.round((activeAccounts / accounts.length) * 100) : 0}% of base`}
                    color={colors.purple}
                />
                <MiniStat
                    colors={colors}
                    icon={FileText}
                    label="Total Activities"
                    value={totalActivities}
                    color={colors.orange}
                />
            </div>

            {!hasData ? (
                <EmptyState colors={colors} label="accounts" />
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>By Type</div>
                            {types.length ? (
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart>
                                        <Pie
                                            data={types}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={80}
                                            innerRadius={45}
                                            paddingAngle={2}
                                        >
                                            {types.map((_, i) => (
                                                <Cell key={i} fill={palettes[i % palettes.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip {...tooltipProps(colors)} />
                                        <Legend wrapperStyle={{ fontSize: 11, color: colors.textMuted }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="types" />
                            )}
                        </div>

                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Top Countries / Cities</div>
                            {countries.length ? (
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={countries} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                                        <Tooltip {...tooltipProps(colors)} cursor={{ fill: colors.border }} />
                                        <Bar dataKey="value" name="Accounts" fill={colors.cyan} radius={[0, 4, 4, 0]} barSize={16} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="locations" />
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Account Creation Trend</div>
                            {creationTrend.length ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <AreaChart data={creationTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="accCreation" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={colors.blue} stopOpacity={0.35} />
                                                <stop offset="95%" stopColor={colors.blue} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                                        <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <Tooltip {...tooltipProps(colors)} />
                                        <Area type="monotone" dataKey="value" name="New Accounts" stroke={colors.blue} fill="url(#accCreation)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="creation history" />
                            )}
                        </div>

                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Account Activity Trend</div>
                            {activityTrend.length ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <AreaChart data={activityTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="accActivity" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={colors.orange} stopOpacity={0.35} />
                                                <stop offset="95%" stopColor={colors.orange} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                                        <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <Tooltip {...tooltipProps(colors)} />
                                        <Area type="monotone" dataKey="value" name="Activities" stroke={colors.orange} fill="url(#accActivity)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="activities" />
                            )}
                        </div>
                    </div>

                    <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                        <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <TrendingUp size={16} color={colors.green} /> Top Accounts by Request Volume
                        </div>
                        {byAccountReq.length ? (
                            <>
                                <ResponsiveContainer width="100%" height={Math.max(220, byAccountReq.length * 34)}>
                                    <BarChart data={byAccountReq} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={140} />
                                        <Tooltip {...tooltipProps(colors)} cursor={{ fill: colors.border }} />
                                        <Bar dataKey="count" name="Requests" fill={colors.green} radius={[0, 4, 4, 0]} barSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                                <div style={{ marginTop: 12, overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ color: colors.textMuted, textAlign: 'left' }}>
                                                <th style={{ padding: '6px 8px' }}>Account</th>
                                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Requests</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {byAccountReq.map((r) => (
                                                <tr key={r.id} style={{ color: colors.textMain, borderTop: `1px solid ${colors.border}` }}>
                                                    <td style={{ padding: '6px 8px' }}>{r.name}</td>
                                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{r.count}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (
                            <EmptyState colors={colors} label="request activity" />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function r_name(requests: any[], id: string): string {
    const r = requests.find((x) => String(x.accountId) === id);
    return r?.account || `Account ${id.slice(0, 6)}`;
}
