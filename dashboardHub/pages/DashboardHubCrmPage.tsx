/**
 * CRM hub preview — lead/pipeline lens only. No booking revenue or top-account charts.
 */
import React, { useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, AreaChart, Area, FunnelChart, Funnel, LabelList,
} from 'recharts';
import { Filter, TrendingUp, Target, Users, Phone, DollarSign, Percent } from 'lucide-react';
import { useHubData } from '../HubDataContext';
import {
    hexA, num, fmtInt, fmtMoney, fmtPct, tip, legendStyle,
    Card, MiniStat, RangeTabs, EmptyState, Hero, Meter, PageShell,
    rangeBounds, monthKey, type RangeKey,
} from '../analyticsKit';
import { CHART_H, GRID_2 } from '../hubPreviewShared';

const STAGES = ['new', 'waiting', 'qualified', 'proposal', 'negotiation', 'won', 'notInterested'] as const;
const STAGE_LABEL: Record<string, string> = {
    new: 'New', waiting: 'Waiting', qualified: 'Qualified', proposal: 'Proposal',
    negotiation: 'Negotiation', won: 'Won', notInterested: 'Not Interested',
};
const FUNNEL_STAGES = ['waiting', 'qualified', 'proposal', 'negotiation', 'won'] as const;

function itemTime(it: any): number {
    return new Date(it.createdAt || it.timestamp || it.date || it.lastContact || it.enteredFunnelAt || 0).getTime();
}

function inRangeItem(it: any, start: number, range: RangeKey): boolean {
    if (range === 'all') return true;
    const t = itemTime(it);
    return !Number.isNaN(t) && t >= start;
}

function pct(n: number, d: number): number {
    if (!d) return 0;
    return Math.round((n / d) * 1000) / 10;
}

export default function DashboardHubCrmPage({ colors }: { colors: any }) {
    const { crmState, currency, activeProperty } = useHubData();
    const [range, setRange] = useState<RangeKey>('90');
    const { start } = useMemo(() => rangeBounds(range), [range]);
    const state: any = crmState || {};
    const pipeline: Record<string, any[]> = state.pipeline || {};
    const leads: Record<string, any[]> = state.leads || {};

    const stats = useMemo(() => {
        const pCounts: Record<string, number> = {};
        const lCounts: Record<string, number> = {};
        let pipelineValue = 0;

        for (const s of STAGES) {
            const pItems = (pipeline[s] || []).filter((it) => inRangeItem(it, start, range));
            const lItems = (leads[s] || []).filter((it) => inRangeItem(it, start, range));
            pCounts[s] = pItems.length;
            lCounts[s] = lItems.length;

            if (['proposal', 'negotiation', 'won'].includes(s)) {
                for (const it of pItems) {
                    pipelineValue += num(it.value ?? it.amount ?? it.totalCost);
                }
            }
        }

        const totalLeads = Object.values(lCounts).reduce((a, b) => a + b, 0)
            + Object.values(pCounts).reduce((a, b) => a + b, 0);
        const won = (lCounts.won || 0) + (pCounts.won || 0);
        const lost = (lCounts.notInterested || 0) + (pCounts.notInterested || 0);
        const leadWinRate = pct(won, won + lost);

        return { pCounts, lCounts, totalLeads, won, lost, leadWinRate, pipelineValue };
    }, [pipeline, leads, start, range]);

    const salesCalls = useMemo(
        () => (state.salesCalls || []).filter((c: any) => inRangeItem(c, start, range)),
        [state.salesCalls, start, range],
    );

    const funnelData = useMemo(() => FUNNEL_STAGES.map((s, i) => ({
        name: STAGE_LABEL[s],
        value: (stats.lCounts[s] || 0) + (stats.pCounts[s] || 0),
        fill: [colors.blue, colors.purple, colors.orange, colors.yellow, colors.green][i],
    })).filter((d) => d.value > 0), [stats, colors]);

    const stageBars = useMemo(() => STAGES.map((s) => ({
        stage: STAGE_LABEL[s],
        pipeline: stats.pCounts[s] || 0,
        legacyLeads: stats.lCounts[s] || 0,
    })).filter((d) => d.pipeline > 0 || d.legacyLeads > 0), [stats]);

    const stageShare = useMemo(() => STAGES.filter((s) => s !== 'new').map((s) => {
        const v = (stats.lCounts[s] || 0) + (stats.pCounts[s] || 0);
        return {
            name: STAGE_LABEL[s], value: v,
            fill: s === 'won' ? colors.green : s === 'notInterested' ? colors.red : s === 'negotiation' ? colors.orange
                : s === 'proposal' ? colors.purple : s === 'qualified' ? colors.blue : colors.yellow,
        };
    }).filter((d) => d.value > 0), [stats, colors]);

    const callTrend = useMemo(() => {
        const m: Record<string, number> = {};
        for (const c of salesCalls) {
            const k = monthKey(c.createdAt || c.date || c.timestamp);
            if (k) m[k] = (m[k] || 0) + 1;
        }
        return Object.keys(m).sort().map((k) => ({ month: k, calls: m[k] }));
    }, [salesCalls]);

    const hasData = stats.totalLeads > 0 || salesCalls.length > 0;
    const leadWinFrac = stats.won + stats.lost ? stats.won / (stats.won + stats.lost) : 0;

    return (
        <PageShell colors={colors} enterDeps={[range]}>
            <div style={{ padding: 4 }}>
                <div data-hub-animate>
                    <Hero
                        icon={Filter}
                        title="CRM Pipeline"
                        colors={colors}
                        activeProperty={activeProperty}
                        subtitle={
                            range === 'all'
                                ? `${fmtInt(stats.totalLeads)} cards in funnel · pipeline value ${fmtMoney(stats.pipelineValue, currency)}`
                                : `${fmtInt(stats.totalLeads)} cards · ${fmtMoney(stats.pipelineValue, currency)} open value · last ${range === '365' ? '1 year' : `${range} days`}`
                        }
                        right={<RangeTabs value={range} onChange={setRange} colors={colors} />}
                    />
                </div>

                {!hasData ? (
                    <EmptyState icon={Filter} text="No CRM pipeline or sales calls in the selected period." colors={colors} />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div
                            data-hub-animate
                            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}
                        >
                            <MiniStat label="Pipeline cards" value={fmtInt(stats.totalLeads)} icon={Users} colorKey="blue" colors={colors} />
                            <MiniStat label="Won leads" value={fmtInt(stats.won)} sub={`${fmtInt(stats.lost)} not interested`} icon={Target} colorKey="green" colors={colors} />
                            <MiniStat
                                label="Lead win rate"
                                value={`${stats.leadWinRate}%`}
                                sub="CRM won ÷ (won + not interested) — not booking win rate"
                                icon={Percent}
                                colorKey="purple"
                                colors={colors}
                            />
                            <MiniStat
                                label="Open pipeline value"
                                value={fmtMoney(stats.pipelineValue, currency)}
                                sub="Proposal + negotiation + won in period"
                                icon={DollarSign}
                                colorKey="orange"
                                colors={colors}
                            />
                            <MiniStat label="Sales calls" value={fmtInt(salesCalls.length)} icon={Phone} colorKey="yellow" colors={colors} />
                        </div>

                        <Card title="Lead win rate (CRM)" icon={Percent} colors={colors}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
                                <div style={{ minWidth: 160 }}>
                                    <div style={{ color: colors.textMain, fontSize: 42, fontWeight: 900, lineHeight: 1 }}>
                                        {fmtPct(leadWinFrac, 0)}
                                    </div>
                                    <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                                        won vs not interested · excludes open stages
                                    </div>
                                </div>
                                <div style={{ flex: 1, minWidth: 220 }}>
                                    <Meter value={leadWinFrac} colors={colors} color={colors.green} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, fontWeight: 700 }}>
                                        <span style={{ color: colors.green }}>Won {fmtInt(stats.won)}</span>
                                        <span style={{ color: colors.red }}>Not interested {fmtInt(stats.lost)}</span>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {funnelData.length > 0 && (
                            <Card title="Pipeline stage counts" icon={Filter} colors={colors}>
                                <ResponsiveContainer width="100%" height={CHART_H}>
                                    <FunnelChart>
                                        <Tooltip {...tip(colors)} />
                                        <Funnel dataKey="value" data={funnelData} isAnimationActive>
                                            <LabelList position="right" fill={colors.textMain} stroke="none" dataKey="name" style={{ fontSize: 12 }} />
                                            <LabelList position="left" fill={colors.textMuted} stroke="none" dataKey="value" style={{ fontSize: 12 }} />
                                            {funnelData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                                        </Funnel>
                                    </FunnelChart>
                                </ResponsiveContainer>
                            </Card>
                        )}

                        <div data-hub-animate style={{ display: 'grid', gridTemplateColumns: GRID_2, gap: 18 }}>
                            {stageBars.length > 0 && (
                                <Card title="Cards by stage" icon={TrendingUp} colors={colors}>
                                    <ResponsiveContainer width="100%" height={CHART_H}>
                                        <BarChart data={stageBars} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                                            <CartesianGrid stroke={colors.grid} vertical={false} />
                                            <XAxis dataKey="stage" tick={{ fontSize: 10, fill: colors.textMuted }} interval={0} angle={-15} textAnchor="end" height={54} />
                                            <YAxis tick={{ fontSize: 11, fill: colors.textMuted }} allowDecimals={false} />
                                            <Tooltip {...tip(colors)} cursor={{ fill: hexA(colors.primary, '12') }} />
                                            <Bar dataKey="pipeline" name="Pipeline" fill={colors.purple} radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="legacyLeads" name="Legacy leads" fill={colors.blue} radius={[4, 4, 0, 0]} />
                                            <Legend formatter={legendStyle(colors)} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Card>
                            )}

                            {stageShare.length > 0 && (
                                <Card title="Stage mix (snapshot)" icon={Target} colors={colors}>
                                    <ResponsiveContainer width="100%" height={CHART_H}>
                                        <PieChart>
                                            <Pie data={stageShare} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
                                                {stageShare.map((d, i) => <Cell key={i} fill={d.fill} />)}
                                            </Pie>
                                            <Tooltip {...tip(colors)} />
                                            <Legend formatter={legendStyle(colors)} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </Card>
                            )}
                        </div>

                        {callTrend.length > 0 && (
                            <Card title="Sales calls by month" icon={Phone} colors={colors}>
                                <ResponsiveContainer width="100%" height={CHART_H}>
                                    <AreaChart data={callTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="crmPrevCalls" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={colors.primary} stopOpacity={0.4} />
                                                <stop offset="100%" stopColor={colors.primary} stopOpacity={0.02} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid stroke={colors.grid} vertical={false} />
                                        <XAxis dataKey="month" tick={{ fill: colors.textMuted, fontSize: 11 }} />
                                        <YAxis tick={{ fill: colors.textMuted, fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip {...tip(colors)} />
                                        <Area type="monotone" dataKey="calls" name="Calls" stroke={colors.primary} fill="url(#crmPrevCalls)" strokeWidth={2} />
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
