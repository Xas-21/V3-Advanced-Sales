/**
 * Agreements hub preview — request status as agreement proxy (not the Contracts module).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../../backendApi';
import {
    ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
    CartesianGrid, Legend, AreaChart, Area, ComposedChart, Line,
} from 'recharts';
import { FileSignature, CheckCircle2, Clock, XCircle, Layers, Info, DollarSign } from 'lucide-react';
import { useHubData } from '../HubDataContext';
import {
    hexA, num, fmtInt, fmtMoney, money, fmtPct, tip, legendStyle,
    Card, MiniStat, RangeTabs, EmptyState, Hero, Meter, PageShell,
    rangeBounds, monthKey, type RangeKey,
} from '../analyticsKit';
import { requestWhen, requestTime, CHART_H, GRID_2 } from '../hubPreviewShared';

const SIGNED = ['confirmed', 'definite', 'actual', 'signed', 'won'];
const PENDING = ['tentative', 'proposal', 'negotiation', 'inquiry', 'waiting'];
const LOST = ['cancelled', 'lost', 'expired', 'declined'];

function agreementStatus(r: any): 'Signed' | 'Pending' | 'Lost' {
    const s = String(r.status || '').toLowerCase();
    if (SIGNED.includes(s)) return 'Signed';
    if (LOST.includes(s)) return 'Lost';
    return 'Pending';
}

export default function DashboardHubAgreementsPage({ colors }: { colors: any }) {
    const { requests, currency, activeProperty } = useHubData();
    const propertyId = activeProperty?.id || '';
    const [templates, setTemplates] = useState<any[]>([]);
    const [range, setRange] = useState<RangeKey>('90');
    const { start } = useMemo(() => rangeBounds(range), [range]);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const url = propertyId
                    ? `/api/contracts/templates?propertyId=${encodeURIComponent(propertyId)}`
                    : '/api/contracts/templates';
                const t = await fetch(apiUrl(url), { credentials: 'include' }).then((x) => x.json());
                if (alive) setTemplates(Array.isArray(t) ? t : []);
            } catch {
                if (alive) setTemplates([]);
            }
        })();
        return () => { alive = false; };
    }, [propertyId]);

    const filtered = useMemo(() => requests.filter((r) => {
        if (range === 'all') return true;
        const t = requestTime(r);
        return !Number.isNaN(t) && t >= start;
    }), [requests, start, range]);

    const signed = filtered.filter((r) => agreementStatus(r) === 'Signed');
    const pending = filtered.filter((r) => agreementStatus(r) === 'Pending');
    const lost = filtered.filter((r) => agreementStatus(r) === 'Lost');
    const signRate = filtered.length ? signed.length / filtered.length : 0;
    const signedValue = signed.reduce((s, r) => s + num(r.totalCost), 0);

    const statusMix = [
        { name: 'Signed', value: signed.length, fill: colors.green },
        { name: 'Pending', value: pending.length, fill: colors.yellow },
        { name: 'Lost', value: lost.length, fill: colors.red },
    ].filter((d) => d.value > 0);

    const monthly = useMemo(() => {
        const m: Record<string, { signed: number; value: number; pending: number; lost: number }> = {};
        for (const r of filtered) {
            const k = monthKey(requestWhen(r));
            if (!k) continue;
            if (!m[k]) m[k] = { signed: 0, value: 0, pending: 0, lost: 0 };
            const st = agreementStatus(r);
            if (st === 'Signed') { m[k].signed += 1; m[k].value += num(r.totalCost); }
            else if (st === 'Pending') m[k].pending += 1;
            else m[k].lost += 1;
        }
        return Object.keys(m).sort().slice(-12).map((k) => ({
            month: k, signed: m[k].signed, value: Math.round(m[k].value), pending: m[k].pending, lost: m[k].lost,
        }));
    }, [filtered]);

    const hasData = filtered.length > 0 || templates.length > 0;

    return (
        <PageShell colors={colors} enterDeps={[range]}>
            <div style={{ padding: 4 }}>
                <div data-hub-animate>
                    <Hero
                        icon={FileSignature}
                        title="Request status (agreement proxy)"
                        colors={colors}
                        activeProperty={activeProperty}
                        subtitle={
                            range === 'all'
                                ? `${fmtInt(filtered.length)} requests · template library ${fmtInt(templates.length)}`
                                : `${fmtInt(filtered.length)} requests in period · ${fmtInt(templates.length)} templates`
                        }
                        right={<RangeTabs value={range} onChange={setRange} colors={colors} />}
                    />
                </div>

                {!hasData ? (
                    <EmptyState icon={FileSignature} text="No requests or templates for this property yet." colors={colors} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div
                            data-hub-animate
                            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}
                        >
                            <MiniStat
                                label="Signed (proxy)"
                                value={fmtInt(signed.length)}
                                sub={`${fmtPct(signRate)} of requests in period`}
                                icon={CheckCircle2}
                                colorKey="green"
                                colors={colors}
                            />
                            <MiniStat label="Pending (proxy)" value={fmtInt(pending.length)} icon={Clock} colorKey="yellow" colors={colors} />
                            <MiniStat label="Lost / cancelled" value={fmtInt(lost.length)} icon={XCircle} colorKey="red" colors={colors} />
                            <MiniStat
                                label="Signed value (request proxy)"
                                value={fmtMoney(signedValue, currency)}
                                sub="sum of signed totalCost"
                                icon={DollarSign}
                                colorKey="blue"
                                colors={colors}
                            />
                            <MiniStat
                                label="Contract templates"
                                value={fmtInt(templates.length)}
                                sub="real library — separate from status proxy"
                                icon={Layers}
                                colorKey="purple"
                                colors={colors}
                            />
                        </div>

                        <Card title="Sign-through rate (request proxy)" icon={CheckCircle2} colors={colors}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
                                <div style={{ minWidth: 160 }}>
                                    <div style={{ color: colors.textMain, fontSize: 42, fontWeight: 900, lineHeight: 1 }}>
                                        {fmtPct(signRate, 0)}
                                    </div>
                                    <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                                        signed requests ÷ all requests in period
                                    </div>
                                </div>
                                <div style={{ flex: 1, minWidth: 220 }}>
                                    <Meter value={signRate} colors={colors} color={colors.green} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, fontWeight: 700 }}>
                                        <span style={{ color: colors.green }}>Signed {fmtInt(signed.length)}</span>
                                        <span style={{ color: colors.yellow }}>Pending {fmtInt(pending.length)}</span>
                                        <span style={{ color: colors.red }}>Lost {fmtInt(lost.length)}</span>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <div
                            style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px',
                                borderRadius: 12, border: `1px solid ${hexA(colors.border, 'cc')}`,
                                background: hexA(colors.bg, '88'), fontSize: 12, color: colors.textMuted, lineHeight: 1.45,
                            }}
                        >
                            <Info size={14} style={{ marginTop: 2, flexShrink: 0, color: colors.primary }} />
                            <span>
                                Status groups derive from booking request fields, not signed contract records.
                                Revenue by account lives on <strong style={{ color: colors.textMain }}>Revenue Mix</strong>.
                            </span>
                        </div>

                        <div data-hub-animate style={{ display: 'grid', gridTemplateColumns: GRID_2, gap: 18 }}>
                            {statusMix.length > 0 && (
                                <Card title="Status mix (proxy)" icon={FileSignature} colors={colors}>
                                    <ResponsiveContainer width="100%" height={CHART_H}>
                                        <PieChart>
                                            <Pie data={statusMix} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                                                {statusMix.map((d, i) => <Cell key={i} fill={d.fill} />)}
                                            </Pie>
                                            <Tooltip {...tip(colors)} />
                                            <Legend formatter={legendStyle(colors)} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </Card>
                            )}

                            {monthly.length > 0 && (
                                <Card title="Signed vs pending vs lost (counts)" icon={Clock} colors={colors}>
                                    <ResponsiveContainer width="100%" height={CHART_H}>
                                        <BarChart data={monthly} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                                            <CartesianGrid stroke={colors.grid} vertical={false} />
                                            <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} />
                                            <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} />
                                            <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                            <Bar dataKey="signed" name="Signed" stackId="a" fill={colors.green} />
                                            <Bar dataKey="pending" name="Pending" stackId="a" fill={colors.yellow} />
                                            <Bar dataKey="lost" name="Lost" stackId="a" fill={colors.red} radius={[6, 6, 0, 0]} />
                                            <Legend formatter={legendStyle(colors)} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Card>
                            )}
                        </div>

                        {monthly.length > 0 && (
                            <Card title={`Signed volume & value (${currency})`} icon={DollarSign} colors={colors}>
                                <ResponsiveContainer width="100%" height={CHART_H}>
                                    <ComposedChart data={monthly} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="agrPrevVal" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={colors.green} stopOpacity={0.4} />
                                                <stop offset="100%" stopColor={colors.green} stopOpacity={0.02} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid stroke={colors.grid} vertical={false} />
                                        <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} />
                                        <YAxis yAxisId="r" orientation="right" tick={{ fill: colors.textMuted, fontSize: 11 }} tickFormatter={(v: number) => fmtMoney(v, '').trim()} />
                                        <YAxis yAxisId="l" tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip {...tip(colors)} formatter={(v: any, n: any) => [n === 'Value' ? money(v, currency) : fmtInt(v), n]} />
                                        <Area yAxisId="r" type="monotone" dataKey="value" name="Value" stroke={colors.green} fill="url(#agrPrevVal)" strokeWidth={2} />
                                        <Line yAxisId="l" type="monotone" dataKey="signed" name="Signed" stroke={colors.blue} strokeWidth={2} dot={false} />
                                        <Legend formatter={legendStyle(colors)} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </Card>
                        )}

                        {monthly.length > 0 && (
                            <Card title="Status trend (stacked counts)" icon={CheckCircle2} colors={colors}>
                                <ResponsiveContainer width="100%" height={CHART_H}>
                                    <AreaChart data={monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                                        <CartesianGrid stroke={colors.grid} vertical={false} />
                                        <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} />
                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip {...tip(colors)} />
                                        <Area type="monotone" dataKey="signed" name="Signed" stackId="1" stroke={colors.green} fill={hexA(colors.green, '55')} />
                                        <Area type="monotone" dataKey="pending" name="Pending" stackId="1" stroke={colors.yellow} fill={hexA(colors.yellow, '55')} />
                                        <Area type="monotone" dataKey="lost" name="Lost" stackId="1" stroke={colors.red} fill={hexA(colors.red, '44')} />
                                        <Legend formatter={legendStyle(colors)} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </Card>
                        )}
                    </div>
                )}
            </div>
        </PageShell>
    );
}
