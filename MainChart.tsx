import React, { useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Line, ComposedChart, RadialBarChart, RadialBar,
} from 'recharts';
import { ChartLegend, rechartsTooltipThemeProps } from './rechartsChartLegend';
import { useCurrencyFormatters } from './useCurrencyFormatters';
import AccountProfilePerformanceChart from './AccountProfilePerformanceChart';

export type MainChartProps = {
    chartTab: any;
    chartData: any;
    colors: any;
    performanceData?: any;
    currency?: any;
    chartVsEnabled?: boolean;
    chartVsYear?: number;
};

export default function MainChart({
    chartTab,
    chartData,
    colors,
    performanceData,
    currency = 'SAR',
    chartVsEnabled = false,
    chartVsYear,
}: MainChartProps) {
    const { formatMoneyCompact, formatCurrencyAmount } = useCurrencyFormatters(currency);
    /** Integer counts for chart + legend (underlying buckets use prorated floats). */
    const chartDataForCurrentTab = useMemo(() => {
        const rows = chartData || [];
        if (chartTab === 'Rooms') {
            return rows.map((row: any) => ({
                ...row,
                rooms: Math.round(Number(row?.rooms) || 0),
                roomNights: Math.round(Number(row?.roomNights) || 0),
            }));
        }
        if (chartTab === 'Events' || chartTab === 'MICE') {
            return rows.map((row: any) => ({
                ...row,
                miceRequests: Math.round(Number(row?.miceRequests) || 0),
            }));
        }
        return rows;
    }, [chartData, chartTab]);
    /** Rooms tab: left scale for bars (rooms); second left scale for room nights line (not max of both). */
    const roomsChartYDomains = useMemo(() => {
        if (chartTab !== 'Rooms') return { maxRooms: 1, maxNights: 1 };
        const rows = chartDataForCurrentTab || [];
        let maxR = 0;
        let maxN = 0;
        for (const row of rows) {
            maxR = Math.max(maxR, Number(row?.rooms) || 0);
            maxN = Math.max(maxN, Number(row?.roomNights) || 0);
        }
        const head = (n: number) => {
            const c = Math.ceil(Number(n) || 0);
            if (c <= 0) return 1;
            return Math.max(c, Math.ceil(c * 1.06));
        };
        return { maxRooms: head(maxR), maxNights: head(maxN) };
    }, [chartTab, chartDataForCurrentTab]);
    const perf = performanceData || {};
    const rooms = perf.rooms || {};
    const fnb = perf.fnb || {};
    const roomActualPct = Number(rooms.actualPct || 0);
    const roomForecastPct = Number(rooms.forecastPct || 0);
    const fnbActualPct = Number(fnb.actualPct || 0);
    const fnbForecastPct = Number(fnb.forecastPct || 0);
    const chartRoomActual = Math.max(0, Math.min(100, roomActualPct));
    const chartRoomForecast = Math.max(0, Math.min(100, roomForecastPct));
    const chartFnbActual = Math.max(0, Math.min(100, fnbActualPct));
    const chartFnbForecast = Math.max(0, Math.min(100, fnbForecastPct));
    const roomActualDelta = rooms.actualDeltaVsBudget || '0%';
    const roomForecastDelta = rooms.forecastDeltaVsBudget || '0%';
    const fnbActualDelta = fnb.actualDeltaVsBudget || '0%';
    const fnbForecastDelta = fnb.forecastDeltaVsBudget || '0%';
    const statusSeries = [
        { key: 'inquiry', name: 'Inquiry', color: colors.textMuted },
        { key: 'accepted', name: 'Accepted', color: colors.yellow },
        { key: 'tentative', name: 'Tentative', color: colors.blue },
        { key: 'definite', name: 'Definite', color: colors.green },
        { key: 'actual', name: 'Actual', color: '#059669' },
        { key: 'cancelled', name: 'Cancelled', color: colors.red },
    ];
    const activeStatusSeries = statusSeries.filter((s) =>
        (chartData || []).some((row: any) => Number(row?.[s.key] || 0) > 0)
    );
    const sumChartKey = (key: string) =>
        (chartDataForCurrentTab || []).reduce((sum: number, row: any) => sum + (Number(row?.[key]) || 0), 0);
    const formatLegendCount = (n: number) => Math.round(Number(n) || 0).toLocaleString();
    const formatLegendMoneyTotal = (amountSar: number) =>
        formatCurrencyAmount(Number(amountSar) || 0, 0);
    const statusLegendPayload = activeStatusSeries.map((s) => ({
        value: `${s.name} (${formatLegendCount(sumChartKey(s.key))})`,
        type: 'circle' as const,
        color: s.color,
        id: s.key,
    }));
    const roomsLegendPayload = [
        { value: `Rooms (${formatLegendCount(sumChartKey('rooms'))})`, type: 'circle' as const, color: colors.cyan, id: 'rooms' },
        { value: `Room Nights (${formatLegendCount(sumChartKey('roomNights'))})`, type: 'circle' as const, color: colors.blue, id: 'roomNights' },
        {
            value: `Rooms Revenue (${formatLegendMoneyTotal(sumChartKey('roomsRevenue'))})`,
            type: 'circle' as const,
            color: colors.green,
            id: 'roomsRevenue',
        },
    ];
    const miceLegendPayload = [
        { value: `MICE Requests (${formatLegendCount(sumChartKey('miceRequests'))})`, type: 'circle' as const, color: colors.purple, id: 'miceRequests' },
        {
            value: `Rooms Revenue (${formatLegendMoneyTotal(sumChartKey('miceRoomsRevenue'))})`,
            type: 'circle' as const,
            color: colors.cyan,
            id: 'miceRoomsRevenue',
        },
        {
            value: `Event Revenue (${formatLegendMoneyTotal(sumChartKey('miceRevenue'))})`,
            type: 'circle' as const,
            color: colors.green,
            id: 'miceRevenue',
        },
    ];
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
    const moneyTickFormatter = (v: any) => formatMoneyCompact(Number(v || 0));
    const moneyTooltipFormatter = (value: any, name: any, entry: any) => {
        const key = String(entry?.dataKey || '').toLowerCase();
        const label = String(name || '').toLowerCase();
        const isMoney = key.includes('revenue') || label.includes('revenue');
        if (!isMoney) return [String(value ?? '—'), name];
        return [formatCurrencyAmount(Number(value || 0), 2), name];
    };

    if (chartTab === 'Performance') {
        return (
            <div className="flex flex-col lg:flex-row w-full h-full divide-y lg:divide-y-0 lg:divide-x overflow-y-auto" style={{ borderColor: colors.border }}>
                {/* ROOMS Section */}
                <div className="flex-1 lg:flex-1 shrink-0 w-full min-h-[220px] lg:min-h-0 flex flex-col p-2 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2 px-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest pl-2 border-l-2" style={{ borderColor: colors.primary, color: colors.textMuted }}>Rooms</h4>
                    </div>

                    <div className="flex flex-1 flex-row items-center gap-2">
                        {/* Radial Chart */}
                        <div className="w-5/12 h-full relative shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadialBarChart
                                    innerRadius="45%" outerRadius="100%"
                                    data={[
                                        { name: 'Budget', value: 100, fill: colors.border },
                                        { name: 'Forecast', value: chartRoomForecast, fill: colors.blue },
                                        { name: 'Actual', value: chartRoomActual, fill: colors.green }
                                    ]}
                                    startAngle={90} endAngle={-270}
                                >
                                    <RadialBar background={{ fill: colors.card }} cornerRadius={10} dataKey="value" />
                                </RadialBarChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-2xl font-bold" style={{ color: colors.textMain }}>{Math.round(roomActualPct)}%</span>
                                <span className="text-[9px] uppercase tracking-wider" style={{ color: colors.textMuted }}>of Budget</span>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="w-7/12 flex flex-col justify-center gap-2 px-1">
                            <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.green }}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.green }}>Actual</span>
                                    <span className="text-[9px] font-mono" style={{ color: colors.green }}>{Math.round(roomActualPct)}%</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-bold" style={{ color: colors.textMain }}>{rooms.actualLabel || formatMoneyCompact(0)}</span>
                                    <span className="text-[9px]" style={{ color: colors.textMuted }}>{roomActualDelta}</span>
                                </div>
                            </div>
                            <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.blue }}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.blue }}>Forecast</span>
                                    <span className="text-[9px] font-mono" style={{ color: colors.blue }}>{Math.round(roomForecastPct)}%</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-bold" style={{ color: colors.textMain }}>{rooms.forecastLabel || formatMoneyCompact(0)}</span>
                                    <span className="text-[9px]" style={{ color: colors.textMuted }}>{roomForecastDelta}</span>
                                </div>
                            </div>
                            <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.textMuted }}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.textMuted }}>Budget</span>
                                    <span className="text-[9px] font-mono" style={{ color: colors.textMuted }}>Target</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-bold" style={{ color: colors.textMain }}>{rooms.budgetLabel || formatMoneyCompact(0)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Food and Beverage Section */}
                <div className="flex-1 lg:flex-1 shrink-0 w-full min-h-[220px] lg:min-h-0 flex flex-col p-2 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2 px-2">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest pl-2 border-l-2" style={{ borderColor: colors.orange, color: colors.textMuted }}>Food and Beverage</h4>
                    </div>

                    <div className="flex flex-1 flex-row items-center gap-2">
                        {/* Radial Chart */}
                        <div className="w-5/12 h-full relative shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadialBarChart
                                    innerRadius="45%" outerRadius="100%"
                                    data={[
                                        { name: 'Budget', value: 100, fill: colors.border },
                                        { name: 'Forecast', value: chartFnbForecast, fill: colors.blue },
                                        { name: 'Actual', value: chartFnbActual, fill: colors.green }
                                    ]}
                                    startAngle={90} endAngle={-270}
                                >
                                    <RadialBar background={{ fill: colors.card }} cornerRadius={10} dataKey="value" />
                                </RadialBarChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-2xl font-bold" style={{ color: colors.textMain }}>{Math.round(fnbActualPct)}%</span>
                                <span className="text-[9px] uppercase tracking-wider" style={{ color: colors.textMuted }}>of Budget</span>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="w-7/12 flex flex-col justify-center gap-2 px-1">
                            <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.green }}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.green }}>Actual</span>
                                    <span className="text-[9px] font-mono" style={{ color: colors.green }}>{Math.round(fnbActualPct)}%</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-bold" style={{ color: colors.textMain }}>{fnb.actualLabel || formatMoneyCompact(0)}</span>
                                    <span className="text-[9px]" style={{ color: colors.textMuted }}>{fnbActualDelta}</span>
                                </div>
                            </div>
                            <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.blue }}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.blue }}>Forecast</span>
                                    <span className="text-[9px] font-mono" style={{ color: colors.blue }}>{Math.round(fnbForecastPct)}%</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-bold" style={{ color: colors.textMain }}>{fnb.forecastLabel || formatMoneyCompact(0)}</span>
                                    <span className="text-[9px]" style={{ color: colors.textMuted }}>{fnbForecastDelta}</span>
                                </div>
                            </div>
                            <div className="p-2 rounded-lg border-l-4 bg-white/5" style={{ borderColor: colors.textMuted }}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: colors.textMuted }}>Budget</span>
                                    <span className="text-[9px] font-mono" style={{ color: colors.textMuted }}>Target</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-bold" style={{ color: colors.textMain }}>{fnb.budgetLabel || formatMoneyCompact(0)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const profileChartTab = chartTab === 'Events' ? 'MICE' : chartTab;
    if (profileChartTab !== 'Performance') {
        return (
            <AccountProfilePerformanceChart
                chartTab={profileChartTab}
                chartData={chartData}
                colors={colors}
                currency={currency}
                chartVsEnabled={chartVsEnabled}
                chartVsYear={chartVsYear}
            />
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            {chartTab === 'Revenue' ? (
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 8, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
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
                    <Area type="monotone" dataKey="revenue" stroke={colors.green} fill="url(#colorRev)" />
                </AreaChart>
            ) : chartTab === 'Requests' ? (
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
                    <Tooltip {...rechartsTooltipThemeProps(colors)} cursor={{ fill: colors.border }} />
                    <Bar dataKey="totalRequests" name="Total Requests" fill={colors.blue} radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
            ) : chartTab === 'Rooms' ? (
                <ComposedChart data={chartDataForCurrentTab} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
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
                        domain={[0, Math.max(roomsChartYDomains.maxRooms, roomsChartYDomains.maxNights)]}
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
                    <Tooltip {...rechartsTooltipThemeProps(colors)} formatter={moneyTooltipFormatter} />
                    <ChartLegend payload={roomsLegendPayload} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', color: colors.textMuted }} />
                    <Bar yAxisId="rooms" dataKey="rooms" name="Rooms" fill={colors.cyan} radius={[4, 4, 0, 0]} barSize={16} />
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
                </ComposedChart>
            ) : chartTab === 'Events' || chartTab === 'MICE' ? (
                <ComposedChart data={chartDataForCurrentTab} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
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
                    <Tooltip {...rechartsTooltipThemeProps(colors)} formatter={moneyTooltipFormatter} />
                    <ChartLegend payload={miceLegendPayload} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', color: colors.textMuted }} />
                    <Bar yAxisId="left" dataKey="miceRequests" name="MICE Requests" fill={colors.purple} radius={[4, 4, 0, 0]} barSize={20} />
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
