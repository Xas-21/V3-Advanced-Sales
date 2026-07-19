import React from 'react';
import { Legend } from 'recharts';

type ChartLegendPayloadItem = {
    value: string;
    type?: 'circle' | 'line' | 'square' | 'rect';
    color?: string;
    id?: string;
};

/**
 * Typed Legend wrapper: Recharts typings omit `payload`, but runtime still uses it
 * for custom series labels (dashboard / account profile charts).
 */
export function ChartLegend(props: {
    payload?: ChartLegendPayloadItem[];
    iconType?: 'circle' | 'line' | 'square';
    wrapperStyle?: React.CSSProperties;
    verticalAlign?: 'top' | 'middle' | 'bottom';
    height?: number;
}) {
    // Spread bypasses excess-property checks; Legend typings omit `payload` but runtime accepts it.
    return <Legend {...(props as React.ComponentProps<typeof Legend>)} />;
}

/** Recharts default tooltip renders name/value in black; align label + items with theme foreground. */
export function rechartsTooltipThemeProps(colors: any, contentStylePatch?: Record<string, any>) {
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
