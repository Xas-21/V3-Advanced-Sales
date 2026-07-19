import React from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { rechartsTooltipThemeProps } from './rechartsChartLegend';

export type DistributionChartProps = {
    distTab: string;
    segmentData: any[];
    accountTypeData: any[];
    colors: any;
};

const DIST_BAR_PALETTE_KEYS = ['blue', 'cyan', 'green', 'yellow', 'purple', 'red', 'orange'] as const;

export default function DistributionChart({ distTab, segmentData, accountTypeData, colors }: DistributionChartProps) {
    const barFills = DIST_BAR_PALETTE_KEYS.map((k) => colors[k]);
    /** Types with zero accounts are already stripped from `accountTypeData`. */
    const typeRows = Array.isArray(accountTypeData) ? accountTypeData : [];

    if (distTab === 'Segments') {
        return (
            <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={segmentData} margin={{ top: 5, right: 30, left: 72, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 9 }} />
                    <YAxis
                        dataKey="name"
                        type="category"
                        width={118}
                        tickMargin={10}
                        interval={0}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: colors.textMuted, fontSize: 9 }}
                    />
                    <Tooltip {...rechartsTooltipThemeProps(colors)} cursor={{ fill: colors.border, fillOpacity: 0.1 }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
                        {(segmentData || []).map((entry: any, index: number) => (
                            <Cell key={`${entry.name}-${index}`} fill={barFills[index % barFills.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        );
    }

    if (!typeRows.length) {
        return (
            <div className="flex h-full w-full items-center justify-center text-xs" style={{ color: colors.textMuted }}>
                No accounts with a type yet
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={typeRows} margin={{ top: 8, right: 12, left: 4, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                <XAxis
                    dataKey="name"
                    interval={0}
                    angle={-28}
                    textAnchor="end"
                    height={52}
                    tick={{ fill: colors.textMuted, fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: colors.textMuted, fontSize: 9 }}
                    width={28}
                />
                <Tooltip
                    {...rechartsTooltipThemeProps(colors)}
                    cursor={{ fill: colors.border, fillOpacity: 0.12 }}
                    formatter={(value: any, _n: any, item: any) => {
                        const n = Number(value) || 0;
                        const pct = Number(item?.payload?.percent ?? 0);
                        return [`${n} account${n === 1 ? '' : 's'} · ${pct}%`, item?.payload?.name ?? 'Type'];
                    }}
                />
                <Bar dataKey="value" name="Accounts" radius={[6, 6, 0, 0]} barSize={22} maxBarSize={36}>
                    {typeRows.map((entry: any, index: number) => (
                        <Cell key={`${entry.name}-${index}`} fill={barFills[index % barFills.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
