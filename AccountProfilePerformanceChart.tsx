import React, { useMemo } from 'react';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    BarChart,
    Bar,
    Line,
    ComposedChart,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
} from 'recharts';
import { ChartLegend } from './rechartsChartLegend';
import { type CurrencyCode } from './currency';
import { useCurrencyFormatters } from './useCurrencyFormatters';
import type { AccountProfileChartRow } from './accountProfileChartData';
import { chartTabSupportsVs, normalizeChartMetricValue } from './chartVsYearCompare';

export type AccountProfileChartTab = 'Revenue' | 'Requests' | 'Rooms' | 'MICE' | 'Status';

const LY_LINE_DASH = '6 4';

/** Distinct palette for comparison year — not shared with current-year series. */
const LY_COLORS = {
    bar: '#f59e0b',
    barAlt: '#fb923c',
    line: '#eab308',
    lineAlt: '#fbbf24',
    revenue: '#d97706',
};

function rechartsTooltipThemeProps(colors: any, contentStylePatch?: Record<string, any>) {
    return {
        contentStyle: {
            backgroundColor: colors.tooltip,
            borderColor: colors.border,
            borderRadius: 8,
            color: colors.textMain,
            ...(contentStylePatch || {}),
        },
        labelStyle: { color: colors.textMain, fontWeight: 700 },
        itemStyle: { color: colors.textMain },
    };
}

export const ACCOUNT_PROFILE_CHART_TABS: AccountProfileChartTab[] = ['Revenue', 'Requests', 'Rooms', 'MICE', 'Status'];

type Props = {
    chartTab: AccountProfileChartTab;
    chartData: AccountProfileChartRow[];
    colors: any;
    currency?: CurrencyCode;
    chartVsEnabled?: boolean;
    chartVsYear?: number;
};

export default function AccountProfilePerformanceChart({
    chartTab,
    chartData,
    colors,
    currency = 'SAR',
    chartVsEnabled = false,
    chartVsYear,
}: Props) {
    const vsOn = chartVsEnabled && chartTabSupportsVs(chartTab);
    const lySuffix = chartVsYear ? ` (${chartVsYear} LY)` : ' (LY)';
    const { formatMoneyCompact, formatCurrencyAmount } = useCurrencyFormatters(currency);
    const normalizeRowCounts = (row: any, keys: string[]) => {
        const out = { ...row };
        for (const k of keys) {
            if (out[k] != null) out[k] = normalizeChartMetricValue(k, out[k]);
            const ly = `${k}Ly`;
            if (out[ly] != null) out[ly] = normalizeChartMetricValue(k, out[ly]);
        }
        return out;
    };

    /** Integer counts for chart + legend (buckets use prorated floats). */
    const chartDataForTab = useMemo(() => {
        const rows = chartData || [];
        if (chartTab === 'Rooms') {
            return rows.map((row: any) => normalizeRowCounts(row, ['rooms', 'roomNights']));
        }
        if (chartTab === 'MICE') {
            return rows.map((row: any) => normalizeRowCounts(row, ['miceRequests']));
        }
        if (chartTab === 'Requests') {
            return rows.map((row: any) => normalizeRowCounts(row, ['totalRequests']));
        }
        return rows;
    }, [chartData, chartTab]);
    const roomsChartYDomains = useMemo(() => {
        if (chartTab !== 'Rooms') return { maxRooms: 1, maxNights: 1, maxCount: 1 };
        const rows = chartDataForTab || [];
        let maxR = 0;
        let maxN = 0;
        for (const row of rows) {
            maxR = Math.max(maxR, Number(row?.rooms) || 0, vsOn ? Number((row as any)?.roomsLy) || 0 : 0);
            maxN = Math.max(maxN, Number(row?.roomNights) || 0, vsOn ? Number((row as any)?.roomNightsLy) || 0 : 0);
        }
        const head = (n: number) => {
            const c = Math.ceil(Number(n) || 0);
            if (c <= 0) return 1;
            return Math.max(c, Math.ceil(c * 1.06));
        };
        const maxRooms = head(maxR);
        const maxNights = head(maxN);
        /** Single left scale (landing-style) so night/revenue lines don’t collide with dual-axis peripherals. */
        return { maxRooms, maxNights, maxCount: Math.max(maxRooms, maxNights) };
    }, [chartTab, chartDataForTab, vsOn]);
    const moneyTickFormatter = (v: any) => formatMoneyCompact(Number(v || 0));
    const isMoneySeries = (dataKey: string, displayName: string) => {
        const key = dataKey.toLowerCase();
        const label = displayName.toLowerCase();
        return key.includes('revenue') || label.includes('revenue');
    };

    const formatTooltipValue = (dataKey: string, displayName: string, raw: unknown) => {
        const n = Number(raw) || 0;
        if (isMoneySeries(dataKey, displayName)) {
            return formatCurrencyAmount(n, 2);
        }
        const baseKey = dataKey.replace(/Ly$/i, '') || dataKey;
        return normalizeChartMetricValue(baseKey, n).toLocaleString();
    };

    const moneyTooltipFormatter = (value: any, name: any, entry: any) => {
        const dataKey = String(entry?.dataKey || '');
        const displayName = String(name || '');
        return [formatTooltipValue(dataKey, displayName, value), name];
    };

    const comparisonTooltipContent = ({ active, payload, label }: any) => {
        if (!active || !Array.isArray(payload) || payload.length === 0) return null;
        const nonZero = payload.filter((p: any) => {
            const dataKey = String(p?.dataKey || '');
            const name = String(p?.name || '');
            const v = Number(p?.value || 0);
            if (!Number.isFinite(v)) return false;
            if (isMoneySeries(dataKey, name)) return v > 0.005;
            return Math.round(v) !== 0;
        });
        if (!nonZero.length) return null;
        return (
            <div
                className="rounded-lg border px-3 py-2 text-xs"
                style={{ backgroundColor: colors.tooltip, borderColor: colors.border, color: colors.textMain }}
            >
                <div className="font-bold mb-1">{label}</div>
                <div className="space-y-0.5">
                    {nonZero.map((p: any, i: number) => {
                        const dataKey = String(p?.dataKey || '');
                        const name = String(p?.name || dataKey);
                        return (
                            <div key={`${dataKey || name}-${i}`} style={{ color: p?.color || colors.textMain }}>
                                {name}: {formatTooltipValue(dataKey, name, p?.value)}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const statusSeries = [
        { key: 'inquiry', name: 'Inquiry', color: colors.textMuted },
        { key: 'accepted', name: 'Accepted', color: colors.yellow },
        { key: 'tentative', name: 'Tentative', color: colors.blue },
        { key: 'definite', name: 'Definite', color: colors.green },
        { key: 'actual', name: 'Actual', color: '#059669' },
        { key: 'cancelled', name: 'Cancelled', color: colors.red },
    ];
    const activeStatusSeries = statusSeries.filter((s) => (chartData || []).some((row: any) => Number(row?.[s.key] || 0) > 0));
    const sumChartKey = (key: string) =>
        (chartDataForTab || []).reduce((sum: number, row: any) => sum + (Number(row?.[key]) || 0), 0);
    const formatLegendCount = (n: number) => Math.round(Number(n) || 0).toLocaleString();
    const formatLegendMoneyTotal = (amountSar: number) =>
        formatCurrencyAmount(Number(amountSar) || 0, 0);
    const statusLegendPayload = activeStatusSeries.map((s) => ({
        value: `${s.name} (${formatLegendCount(sumChartKey(s.key))})`,
        type: 'circle' as const,
        color: s.color,
        id: s.key,
    }));
    const sumLyKey = (key: string) =>
        (chartDataForTab || []).reduce((sum: number, row: any) => sum + (Number(row?.[`${key}Ly`]) || 0), 0);

    const lyLegendCount = (key: string) => sumLyKey(key) > 0;
    const lyLegendMoney = (key: string) => sumLyKey(key) > 0;

    const roomsLegendPayload = [
        { value: `Rooms (${formatLegendCount(sumChartKey('rooms'))})`, type: 'circle' as const, color: colors.cyan, id: 'rooms' },
        ...(vsOn && lyLegendCount('rooms')
            ? [{ value: `Rooms${lySuffix} (${formatLegendCount(sumLyKey('rooms'))})`, type: 'circle' as const, color: LY_COLORS.bar, id: 'roomsLy' }]
            : []),
        { value: `Room Nights (${formatLegendCount(sumChartKey('roomNights'))})`, type: 'circle' as const, color: colors.blue, id: 'roomNights' },
        ...(vsOn && lyLegendCount('roomNights')
            ? [{ value: `Room Nights${lySuffix} (${formatLegendCount(sumLyKey('roomNights'))})`, type: 'circle' as const, color: LY_COLORS.lineAlt, id: 'roomNightsLy' }]
            : []),
        {
            value: `Rooms Revenue (${formatLegendMoneyTotal(sumChartKey('roomsRevenue'))})`,
            type: 'circle' as const,
            color: colors.green,
            id: 'roomsRevenue',
        },
        ...(vsOn && lyLegendMoney('roomsRevenue')
            ? [{
                  value: `Rooms Revenue${lySuffix} (${formatLegendMoneyTotal(sumLyKey('roomsRevenue'))})`,
                  type: 'circle' as const,
                  color: LY_COLORS.revenue,
                  id: 'roomsRevenueLy',
              }]
            : []),
    ];
    const miceLegendPayload = [
        { value: `MICE Requests (${formatLegendCount(sumChartKey('miceRequests'))})`, type: 'circle' as const, color: colors.purple, id: 'miceRequests' },
        ...(vsOn && lyLegendCount('miceRequests')
            ? [{ value: `MICE Requests${lySuffix} (${formatLegendCount(sumLyKey('miceRequests'))})`, type: 'circle' as const, color: LY_COLORS.bar, id: 'miceRequestsLy' }]
            : []),
        {
            value: `Rooms Revenue (${formatLegendMoneyTotal(sumChartKey('miceRoomsRevenue'))})`,
            type: 'circle' as const,
            color: colors.cyan,
            id: 'miceRoomsRevenue',
        },
        ...(vsOn && lyLegendMoney('miceRoomsRevenue')
            ? [{
                  value: `Rooms Revenue${lySuffix} (${formatLegendMoneyTotal(sumLyKey('miceRoomsRevenue'))})`,
                  type: 'circle' as const,
                  color: LY_COLORS.lineAlt,
                  id: 'miceRoomsRevenueLy',
              }]
            : []),
        {
            value: `Event Revenue (${formatLegendMoneyTotal(sumChartKey('miceRevenue'))})`,
            type: 'circle' as const,
            color: colors.green,
            id: 'miceRevenue',
        },
        ...(vsOn && lyLegendMoney('miceRevenue')
            ? [{
                  value: `Event Revenue${lySuffix} (${formatLegendMoneyTotal(sumLyKey('miceRevenue'))})`,
                  type: 'circle' as const,
                  color: LY_COLORS.revenue,
                  id: 'miceRevenueLy',
              }]
            : []),
    ];
    const revenueLegendPayload = vsOn
        ? [
              { value: `Revenue (${formatLegendMoneyTotal(sumChartKey('revenue'))})`, type: 'circle' as const, color: colors.green, id: 'revenue' },
              ...(lyLegendMoney('revenue')
                  ? [{ value: `Revenue${lySuffix} (${formatLegendMoneyTotal(sumLyKey('revenue'))})`, type: 'circle' as const, color: LY_COLORS.revenue, id: 'revenueLy' }]
                  : []),
          ]
        : undefined;
    const requestsLegendPayload = vsOn
        ? [
              { value: `Requests (${formatLegendCount(sumChartKey('totalRequests'))})`, type: 'circle' as const, color: colors.blue, id: 'totalRequests' },
              ...(lyLegendCount('totalRequests')
                  ? [{ value: `Requests${lySuffix} (${formatLegendCount(sumLyKey('totalRequests'))})`, type: 'circle' as const, color: LY_COLORS.bar, id: 'totalRequestsLy' }]
                  : []),
          ]
        : undefined;
    const statusTooltipContent = ({ active, payload, label }: any) => {
        if (!active || !Array.isArray(payload) || payload.length === 0) return null;
        const nonZero = payload.filter((p: any) => Number(p?.value || 0) > 0);
        if (!nonZero.length) return null;
        return (
            <div
                className="rounded-lg border px-3 py-2 text-xs"
                style={{ backgroundColor: colors.tooltip, borderColor: colors.border, color: colors.textMain }}
            >
                <div className="font-bold mb-1">{label}</div>
                <div className="space-y-0.5">
                    {nonZero.map((p: any, i: number) => (
                        <div key={`${p?.name || p?.dataKey || i}`} style={{ color: p?.color || colors.textMain }}>
                            {p?.name}: {Math.round(Number(p?.value) || 0)}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <ResponsiveContainer width="100%" height="100%">
            {chartTab === 'Revenue' ? (
                vsOn ? (
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 8, bottom: 0 }}>
                        <defs>
                            <linearGradient id="accProfColorRev" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={colors.green} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={colors.green} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                        <YAxis
                            width={56}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: colors.textMuted, fontSize: 10 }}
                            tickFormatter={moneyTickFormatter}
                        />
                        <Tooltip content={comparisonTooltipContent} cursor={{ fill: colors.border }} />
                        <ChartLegend payload={revenueLegendPayload} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', color: colors.textMuted }} />
                        <Area type="monotone" dataKey="revenue" name="Revenue" stroke={colors.green} fill="url(#accProfColorRev)" />
                        <Line
                            type="monotone"
                            dataKey="revenueLy"
                            name={`Revenue${lySuffix}`}
                            stroke={LY_COLORS.revenue}
                            strokeWidth={2}
                            strokeDasharray={LY_LINE_DASH}
                            dot={{ r: 2, fill: LY_COLORS.revenue }}
                        />
                    </ComposedChart>
                ) : (
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 8, bottom: 0 }}>
                        <defs>
                            <linearGradient id="accProfColorRev" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={colors.green} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={colors.green} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                        <YAxis
                            width={56}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: colors.textMuted, fontSize: 10 }}
                            tickFormatter={moneyTickFormatter}
                        />
                        <Tooltip {...rechartsTooltipThemeProps(colors)} formatter={moneyTooltipFormatter} />
                        <Area type="monotone" dataKey="revenue" stroke={colors.green} fill="url(#accProfColorRev)" />
                    </AreaChart>
                )
            ) : chartTab === 'Requests' ? (
                <BarChart data={chartDataForTab} margin={{ top: 10, right: 10, left: -15, bottom: 0 }} barGap={vsOn ? 2 : undefined}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        allowDecimals={false}
                        domain={[0, 'dataMax']}
                    />
                    <Tooltip
                        {...(vsOn
                            ? { content: comparisonTooltipContent, cursor: { fill: colors.border } }
                            : { ...rechartsTooltipThemeProps(colors), cursor: { fill: colors.border } })}
                    />
                    {requestsLegendPayload ? (
                        <ChartLegend payload={requestsLegendPayload} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', color: colors.textMuted }} />
                    ) : null}
                    <Bar dataKey="totalRequests" name="Total Requests" fill={colors.blue} radius={[4, 4, 0, 0]} barSize={vsOn ? 14 : 20} />
                    {vsOn ? (
                        <Bar
                            dataKey="totalRequestsLy"
                            name={`Requests${lySuffix}`}
                            fill={LY_COLORS.bar}
                            radius={[4, 4, 0, 0]}
                            barSize={14}
                        />
                    ) : null}
                </BarChart>
            ) : chartTab === 'Rooms' ? (
                <ComposedChart data={chartDataForTab} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        yAxisId="rooms"
                        orientation="left"
                        width={40}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 9 }}
                        allowDecimals={false}
                        domain={[0, roomsChartYDomains.maxCount]}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        width={52}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        tickFormatter={moneyTickFormatter}
                    />
                    <Tooltip
                        {...(vsOn
                            ? { content: comparisonTooltipContent, cursor: { fill: colors.border } }
                            : { ...rechartsTooltipThemeProps(colors), formatter: moneyTooltipFormatter })}
                    />
                    <ChartLegend payload={roomsLegendPayload} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', color: colors.textMuted }} />
                    <Bar yAxisId="rooms" dataKey="rooms" name="Rooms" fill={colors.cyan} radius={[4, 4, 0, 0]} barSize={vsOn ? 12 : 16} />
                    {vsOn ? (
                        <Bar
                            yAxisId="rooms"
                            dataKey="roomsLy"
                            name={`Rooms${lySuffix}`}
                            fill={LY_COLORS.bar}
                            radius={[4, 4, 0, 0]}
                            barSize={12}
                        />
                    ) : null}
                    <Line
                        yAxisId="rooms"
                        type="monotone"
                        dataKey="roomNights"
                        name="Room Nights"
                        stroke={colors.blue}
                        strokeWidth={2}
                        dot={{ r: 3, fill: colors.card, stroke: colors.blue, strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                    />
                    {vsOn ? (
                        <Line
                            yAxisId="rooms"
                            type="monotone"
                            dataKey="roomNightsLy"
                            name={`Room Nights${lySuffix}`}
                            stroke={LY_COLORS.lineAlt}
                            strokeWidth={2}
                            strokeDasharray={LY_LINE_DASH}
                            dot={{ r: 3, fill: colors.card, stroke: LY_COLORS.lineAlt, strokeWidth: 2 }}
                            activeDot={{ r: 5 }}
                        />
                    ) : null}
                    <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="roomsRevenue"
                        name="Rooms Revenue"
                        stroke={colors.green}
                        strokeWidth={2}
                        dot={{ r: 3, fill: colors.card, stroke: colors.green, strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                    />
                    {vsOn ? (
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="roomsRevenueLy"
                            name={`Rooms Revenue${lySuffix}`}
                            stroke={LY_COLORS.revenue}
                            strokeWidth={2}
                            strokeDasharray={LY_LINE_DASH}
                            dot={{ r: 3, fill: colors.card, stroke: LY_COLORS.revenue, strokeWidth: 2 }}
                            activeDot={{ r: 5 }}
                        />
                    ) : null}
                </ComposedChart>
            ) : chartTab === 'MICE' ? (
                <ComposedChart data={chartDataForTab} margin={{ top: 10, right: 12, left: 4, bottom: 0 }} barGap={vsOn ? 2 : undefined}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        yAxisId="left"
                        width={40}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        allowDecimals={false}
                        domain={[0, 'dataMax']}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        width={52}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        tickFormatter={moneyTickFormatter}
                    />
                    <Tooltip
                        {...(vsOn
                            ? { content: comparisonTooltipContent, cursor: { fill: colors.border } }
                            : { ...rechartsTooltipThemeProps(colors), formatter: moneyTooltipFormatter })}
                    />
                    <ChartLegend payload={miceLegendPayload} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', color: colors.textMuted }} />
                    <Bar yAxisId="left" dataKey="miceRequests" name="MICE Requests" fill={colors.purple} radius={[4, 4, 0, 0]} barSize={vsOn ? 14 : 20} />
                    {vsOn ? (
                        <Bar
                            yAxisId="left"
                            dataKey="miceRequestsLy"
                            name={`MICE Requests${lySuffix}`}
                            fill={LY_COLORS.bar}
                            radius={[4, 4, 0, 0]}
                            barSize={14}
                        />
                    ) : null}
                    <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="miceRoomsRevenue"
                        name="Rooms Revenue"
                        stroke={colors.cyan}
                        strokeWidth={2}
                        dot={{ r: 3, fill: colors.card, stroke: colors.cyan, strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                    />
                    {vsOn ? (
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="miceRoomsRevenueLy"
                            name={`Rooms Revenue${lySuffix}`}
                            stroke={LY_COLORS.lineAlt}
                            strokeWidth={2}
                            strokeDasharray={LY_LINE_DASH}
                            dot={{ r: 3, fill: colors.card, stroke: LY_COLORS.lineAlt, strokeWidth: 2 }}
                            activeDot={{ r: 5 }}
                        />
                    ) : null}
                    <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="miceRevenue"
                        name="Event Revenue"
                        stroke={colors.green}
                        strokeWidth={2}
                        dot={{ r: 3, fill: colors.card, stroke: colors.green, strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                    />
                    {vsOn ? (
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="miceRevenueLy"
                            name={`Event Revenue${lySuffix}`}
                            stroke={LY_COLORS.revenue}
                            strokeWidth={2}
                            strokeDasharray={LY_LINE_DASH}
                            dot={{ r: 3, fill: colors.card, stroke: LY_COLORS.revenue, strokeWidth: 2 }}
                            activeDot={{ r: 5 }}
                        />
                    ) : null}
                </ComposedChart>
            ) : (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 10 }} />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 10 }}
                        allowDecimals={false}
                        domain={[0, 'dataMax']}
                    />
                    <Tooltip content={statusTooltipContent} cursor={{ fill: colors.border }} />
                    <ChartLegend payload={statusLegendPayload} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', color: colors.textMuted }} />
                    <Bar dataKey="inquiry" stackId="a" name="Inquiry" fill={colors.textMuted} />
                    <Bar dataKey="accepted" stackId="a" name="Accepted" fill={colors.yellow} />
                    <Bar dataKey="tentative" stackId="a" name="Tentative" fill={colors.blue} />
                    <Bar dataKey="definite" stackId="a" name="Definite" fill={colors.green} />
                    <Bar dataKey="actual" stackId="a" name="Actual" fill="#059669" />
                    <Bar dataKey="cancelled" stackId="a" name="Cancelled" fill={colors.red} radius={[4, 4, 0, 0]} />
                </BarChart>
            )}
        </ResponsiveContainer>
    );
}
