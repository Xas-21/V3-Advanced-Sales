import React from 'react';
import { Construction } from 'lucide-react';

type DashboardHubComingSoonProps = {
    tabLabel: string;
    colors: any;
};

export default function DashboardHubComingSoon({ tabLabel, colors }: DashboardHubComingSoonProps) {
    return (
        <div
            className="w-full min-h-[calc(100dvh-11rem)] flex flex-col items-center justify-center rounded-2xl border px-6 py-16 text-center"
            style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
                boxShadow: `inset 0 0 80px ${colors.primary}08`,
            }}
        >
            <div className="flex flex-col items-center justify-center max-w-lg mx-auto">
                <div
                    className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
                    style={{
                        color: colors.primary,
                        backgroundColor: `${colors.primary}14`,
                        boxShadow: `0 0 32px ${colors.primary}44`,
                    }}
                >
                    <Construction size={32} strokeWidth={2.2} />
                </div>
                <div
                    className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse mb-5"
                    style={{
                        color: colors.primary,
                        backgroundColor: `${colors.primary}18`,
                        boxShadow: `0 0 14px ${colors.primary}55`,
                    }}
                >
                    Feature coming soon
                </div>
                <h3 className="text-3xl font-bold mb-4" style={{ color: colors.textMain }}>
                    {tabLabel}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: colors.textMuted }}>
                    This view is still under development. Check back later for dedicated {tabLabel} insights and
                    reporting.
                </p>
            </div>
        </div>
    );
}
