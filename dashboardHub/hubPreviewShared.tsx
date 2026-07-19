import React from 'react';
import { Sparkles } from 'lucide-react';
import { hexA } from './analyticsKit';

/** Match AS.tsx / Requests / Revenue Mix dating. */
export function requestWhen(r: any): string {
    return String(r.requestDate || r.receivedDate || r.createdAt || r.checkIn || '');
}

export function requestTime(r: any): number {
    const t = new Date(requestWhen(r)).getTime();
    return Number.isNaN(t) ? NaN : t;
}

export function PreviewBanner({
    colors,
    tabLabel,
    focus,
}: {
    colors: any;
    tabLabel: string;
    focus: string;
}) {
    return (
        <div
            data-hub-animate
            style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14, padding: '10px 14px',
                borderRadius: 12, border: `1px solid ${hexA(colors.primary, '44')}`,
                background: hexA(colors.primary, '14'),
            }}
        >
            <Sparkles size={16} style={{ color: colors.primary, marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: colors.textMain, lineHeight: 1.45 }}>
                <strong style={{ color: colors.primary }}>Preview design</strong>
                {' — '}compare with original <strong>{tabLabel}</strong>. {focus}
            </div>
        </div>
    );
}

export const CHART_H = 320;
export const CHART_H_LG = 340;
export const GRID_2 = 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))' as const;
