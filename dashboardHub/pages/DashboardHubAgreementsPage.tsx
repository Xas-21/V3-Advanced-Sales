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
import { FileSignature, CheckCircle2, Clock, XCircle, CalendarRange, Layers } from 'lucide-react';
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

const CONTRACT_RECORD_KEY = 'visatour_contract_records_v1';
function readContractRecords(): any[] {
    try {
        const raw = localStorage.getItem(CONTRACT_RECORD_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}
function autoExpire(rec: any): any {
    if (!rec?.endDate) return rec;
    if (rec.status === 'Signed' || rec.status === 'Generated') {
        if (rec.endDate < new Date().toISOString().slice(0, 10)) return { ...rec, status: 'Expired' };
    }
    return rec;
}

function statusColor(status: string, colors: any) {
    if (status === 'Signed') return colors.green;
    if (status === 'Generated') return colors.blue;
    return colors.red; // Expired
}

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

export default function DashboardHubAgreementsPage({ colors }: { colors: any }) {
    const [templates, setTemplates] = useState<any[]>([]);
    const [records, setRecords] = useState<any[]>([]);
    const [properties, setProperties] = useState<any[]>([]);
    const [range, setRange] = useState<number>(30);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [tR, prR] = await Promise.all([fetch(apiUrl('/api/contracts/templates')), fetch(apiUrl('/api/properties'))]);
                const [t, pr] = await Promise.all([tR.json(), prR.json()]);
                if (!alive) return;
                setTemplates(asArr(t));
                setProperties(asArr(pr));
            } catch {
                /* ignore */
            }
            if (alive) {
                setRecords(readContractRecords().map(autoExpire));
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

    const inRange = (rec: any) => {
        if (!range) return true;
        const d = parseYmd(rec.createdAt || rec.startDate);
        if (!d) return true;
        return startOfDay(new Date(d)) >= cutoff;
    };
    const filtered = useMemo(() => records.filter(inRange), [records, inRange]);

    const statusMix = useMemo(() => {
        const m = new Map<string, number>();
        filtered.forEach((r) => m.set(String(r.status || 'Generated'), (m.get(String(r.status || 'Generated')) || 0) + 1));
        return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
    }, [filtered]);

    const byProperty = useMemo(() => {
        const m = new Map<string, number>();
        filtered.forEach((r) => {
            const id = String(r.propertyId || 'Unassigned').trim() || 'Unassigned';
            m.set(id, (m.get(id) || 0) + 1);
        });
        const rows = Array.from(m.entries()).map(([id, count]) => {
            const prop = properties.find((x) => String(x.id) === id);
            return { id, name: prop?.name || (id === 'Unassigned' ? 'Unassigned' : `Prop ${id}`), count };
        });
        return rows.sort((a, b) => b.count - a.count).slice(0, 8);
    }, [filtered, properties]);

    const byType = useMemo(() => {
        const m = new Map<string, number>();
        filtered.forEach((r) => {
            const k = String(r.contractType || r.templateName || 'Unspecified').trim() || 'Unspecified';
            m.set(k, (m.get(k) || 0) + 1);
        });
        return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    }, [filtered]);

    const timeline = useMemo(() => {
        const buckets = new Map<string, { signed: number; generated: number; expired: number }>();
        filtered.forEach((r) => {
            const key = parseYmd(r.createdAt || r.startDate).slice(0, 7);
            if (!key) return;
            if (!buckets.has(key)) buckets.set(key, { signed: 0, generated: 0, expired: 0 });
            const b = buckets.get(key)!;
            const st = String(r.status || 'Generated');
            if (st === 'Signed') b.signed += 1;
            else if (st === 'Expired') b.expired += 1;
            else b.generated += 1;
        });
        return Array.from(buckets.entries()).map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
    }, [filtered]);

    // Templates provide the "library" view; value signal (total term count, expiry horizon)
    const templateCount = templates.length;
    const activeRecords = filtered.filter((r) => String(r.status) !== 'Expired').length;
    const signedCount = filtered.filter((r) => String(r.status) === 'Signed').length;
    const expiringSoon = filtered.filter((r) => {
        const end = parseYmd(r.endDate);
        if (!end) return false;
        const t = startOfDay(new Date(end));
        const now = startOfDay(new Date());
        const diff = (t - now) / 86400000;
        return diff >= 0 && diff <= 30 && String(r.status) !== 'Expired';
    }).length;

    const hasData = records.length > 0;
    const palettes = [colors.blue, colors.green, colors.purple, colors.orange, colors.yellow, colors.cyan, colors.red, colors.primary];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.primary, backgroundColor: tint(colors.primary) }}>
                        <FileSignature size={24} strokeWidth={2.1} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, color: colors.textMain, fontSize: 20, fontWeight: 700 }}>Agreements &amp; Contracts</h2>
                        <div style={{ color: colors.textMuted, fontSize: 12 }}>{records.length} generated · {templateCount} templates</div>
                    </div>
                </div>
                <RangeFilter colors={colors} value={range} onChange={setRange} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <MiniStat colors={colors} icon={FileSignature} label="Total Agreements" value={filtered.length} sub={`${records.length} all time`} color={colors.blue} />
                <MiniStat colors={colors} icon={CheckCircle2} label="Signed" value={signedCount} color={colors.green} />
                <MiniStat colors={colors} icon={Clock} label="Active (non-expired)" value={activeRecords} color={colors.yellow} />
                <MiniStat colors={colors} icon={CalendarRange} label="Expiring ≤30D" value={expiringSoon} color={colors.orange} />
            </div>

            {!hasData ? (
                <EmptyState colors={colors} label="agreements" />
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Status Mix</div>
                            {statusMix.length ? (
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart>
                                        <Pie data={statusMix} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                                            {statusMix.map((s, i) => (
                                                <Cell key={i} fill={statusColor(s.name, colors)} />
                                            ))}
                                        </Pie>
                                        <Tooltip {...tooltipProps(colors)} />
                                        <Legend wrapperStyle={{ fontSize: 11, color: colors.textMuted }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="status mix" />
                            )}
                        </div>

                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>By Contract Type</div>
                            {byType.length ? (
                                <ResponsiveContainer width="100%" height={Math.max(220, byType.length * 34)}>
                                    <BarChart data={byType} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
                                        <Tooltip {...tooltipProps(colors)} cursor={{ fill: colors.border }} />
                                        <Bar dataKey="count" name="Agreements" fill={colors.purple} radius={[0, 4, 4, 0]} barSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="types" />
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>By Property</div>
                            {byProperty.length ? (
                                <ResponsiveContainer width="100%" height={Math.max(220, byProperty.length * 34)}>
                                    <BarChart data={byProperty} layout="vertical" margin={{ left: 8, right: 16 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: colors.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
                                        <Tooltip {...tooltipProps(colors)} cursor={{ fill: colors.border }} />
                                        <Bar dataKey="count" name="Agreements" fill={colors.cyan} radius={[0, 4, 4, 0]} barSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="property breakdown" />
                            )}
                        </div>

                        <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                            <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Generation Timeline</div>
                            {timeline.length ? (
                                <ResponsiveContainer width="100%" height={240}>
                                    <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} stackOffset="none">
                                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                                        <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <Tooltip {...tooltipProps(colors)} />
                                        <Legend wrapperStyle={{ fontSize: 11, color: colors.textMuted }} />
                                        <Area type="monotone" dataKey="signed" name="Signed" stackId="1" stroke={colors.green} fill={tint(colors.green)} />
                                        <Area type="monotone" dataKey="generated" name="Generated" stackId="1" stroke={colors.blue} fill={tint(colors.blue)} />
                                        <Area type="monotone" dataKey="expired" name="Expired" stackId="1" stroke={colors.red} fill={tint(colors.red)} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState colors={colors} label="timeline" />
                            )}
                        </div>
                    </div>

                    <div style={{ ...CARD_STYLE, backgroundColor: colors.card, borderColor: colors.border, padding: 16 }}>
                        <div style={{ color: colors.textMain, fontWeight: 600, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Layers size={16} color={colors.purple} /> Recent Agreements
                        </div>
                        {filtered.length ? (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ color: colors.textMuted, textAlign: 'left' }}>
                                            <th style={{ padding: '6px 8px' }}>File</th>
                                            <th style={{ padding: '6px 8px' }}>Account</th>
                                            <th style={{ padding: '6px 8px' }}>Status</th>
                                            <th style={{ padding: '6px 8px' }}>Start</th>
                                            <th style={{ padding: '6px 8px' }}>End</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered
                                            .slice()
                                            .sort((a, b) => parseYmd(b.createdAt).localeCompare(parseYmd(a.createdAt)))
                                            .slice(0, 12)
                                            .map((r) => (
                                                <tr key={r.id} style={{ color: colors.textMain, borderTop: `1px solid ${colors.border}` }}>
                                                    <td style={{ padding: '6px 8px' }}>{r.agreementFileName || r.templateName || '—'}</td>
                                                    <td style={{ padding: '6px 8px' }}>{r.accountName || '—'}</td>
                                                    <td style={{ padding: '6px 8px' }}>
                                                        <span style={{ color: statusColor(r.status, colors), fontWeight: 600 }}>{r.status || 'Generated'}</span>
                                                    </td>
                                                    <td style={{ padding: '6px 8px' }}>{parseYmd(r.startDate) || '—'}</td>
                                                    <td style={{ padding: '6px 8px' }}>{parseYmd(r.endDate) || '—'}</td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <EmptyState colors={colors} label="recent agreements" />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
