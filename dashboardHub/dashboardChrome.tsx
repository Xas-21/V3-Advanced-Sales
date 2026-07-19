/**
 * Shared dashboard chrome used by AS.tsx and the landing product tour.
 * Keep visual parity with the live Advanced Sales dashboard.
 */
import React from 'react';

export const StatusBadge = ({ status, theme }: any) => {
    const styles: Record<string, any> = {
        Actual: { bg: theme.colors.green + '20', text: theme.colors.green },
        Confirmed: { bg: theme.colors.green + '20', text: theme.colors.green },
        Paid: { bg: theme.colors.blue + '20', text: theme.colors.blue },
        Pending: { bg: theme.colors.yellow + '20', text: theme.colors.yellow },
        Tentative: { bg: theme.colors.yellow + '20', text: theme.colors.yellow },
        Inquiry: { bg: theme.colors.textMuted + '20', text: theme.colors.textMuted },
        Accepted: { bg: theme.colors.yellow + '20', text: theme.colors.yellow },
        Definite: { bg: theme.colors.green + '20', text: theme.colors.green },
        Draft: { bg: theme.colors.textMuted + '20', text: theme.colors.textMuted },
        Cancelled: { bg: theme.colors.red + '20', text: theme.colors.red },
        Positive: { bg: theme.colors.green + '20', text: theme.colors.green },
        Ongoing: { bg: theme.colors.blue + '20', text: theme.colors.blue },
        High: { bg: theme.colors.red + '20', text: theme.colors.red },
        Medium: { bg: theme.colors.yellow + '20', text: theme.colors.yellow },
        Low: { bg: theme.colors.blue + '20', text: theme.colors.blue },
        Inspection: { bg: theme.colors.purple + '20', text: theme.colors.purple },
        Blocked: { bg: theme.colors.red + '20', text: theme.colors.red },
    };
    const style = (styles[status] || styles.Draft) as any;

    return (
        <span
            className="px-1.5 py-0.5 rounded text-[9px] font-medium border"
            style={{ backgroundColor: style.bg, color: style.text, borderColor: style.text + '40' }}
        >
            {status}
        </span>
    );
};

export const KPICard = ({ label, value, subtext, icon: Icon, colorKey, isPrimary, theme }: any) => {
    const colors = theme.colors;
    const iconColor = isPrimary ? colors.primary : colors[colorKey];
    return (
        <div
            className="border-2 p-3 rounded-xl relative group hover:border-opacity-100 transition-all duration-300 shadow-md hover:shadow-xl hover:scale-[1.03] hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-4"
            style={{
                backgroundColor: colors.card,
                borderColor: isPrimary ? colors.primary + '60' : colors.border,
                boxShadow: `0 2px 8px ${colors.bg}80, inset 0 1px 0 ${colors.border}40`,
            }}
        >
            <div
                className="absolute inset-0 rounded-xl opacity-30 pointer-events-none"
                style={{ background: `linear-gradient(135deg, ${iconColor}10 0%, transparent 50%)` }}
            />
            <div
                className="absolute top-3 right-3 p-1.5 rounded-lg shadow-sm"
                style={{ backgroundColor: iconColor + '25', border: `1px solid ${iconColor}40` }}
            >
                <Icon size={16} style={{ color: iconColor }} />
            </div>
            <p className="text-[9px] uppercase tracking-wider font-medium mb-1 relative z-10" style={{ color: colors.textMuted }}>
                {label}
            </p>
            <h2 className="text-xl font-bold tracking-tight relative z-10" style={{ color: isPrimary ? colors.primary : colors.textMain }}>
                {value}
            </h2>
            <p
                className="text-[9px] font-medium mt-1 flex items-center gap-1 relative z-10"
                style={{ color: isPrimary ? colors.primary : iconColor }}
            >
                {subtext}
            </p>
        </div>
    );
};

export const Card = ({
    children,
    className = '',
    title,
    tabs,
    activeTab,
    onTabChange,
    actionIcon: ActionIcon,
    onActionIconClick,
    headerSearch,
    extraHeaderAction,
    colors,
}: any) => (
    <div
        className={`flex flex-col overflow-hidden rounded-xl shadow-lg border transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-6 ${className}`}
        style={{ backgroundColor: colors.card, borderColor: colors.border }}
    >
        <div
            className="flex items-center justify-between px-3 py-2 border-b shrink-0 gap-2"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
        >
            <div className="flex items-center gap-4 overflow-x-auto scrollbar-none w-full md:w-auto min-w-0">
                {title && (
                    <h3 className="text-[10px] uppercase tracking-[0.15em] font-semibold whitespace-nowrap" style={{ color: colors.textMuted }}>
                        {title}
                    </h3>
                )}
                {tabs && (
                    <div className="flex gap-1">
                        {tabs.map((tab: any) => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => onTabChange(tab)}
                                className="text-[9px] px-2 py-0.5 rounded transition-colors uppercase tracking-wide font-medium whitespace-nowrap border flex-shrink-0"
                                style={
                                    activeTab === tab
                                        ? {
                                              backgroundColor: colors.primaryDim,
                                              color: colors.primary,
                                              borderColor: colors.primary + '40',
                                          }
                                        : {
                                              color: colors.textMuted,
                                              borderColor: 'transparent',
                                          }
                                }
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {headerSearch?.open && (
                    <input
                        type="search"
                        value={headerSearch.value}
                        onChange={(e) => headerSearch.onChange(e.target.value)}
                        placeholder={headerSearch.placeholder || 'Search…'}
                        className="text-[10px] px-2 py-1 rounded border max-w-[140px] sm:max-w-[200px] md:max-w-[240px] min-w-0"
                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                        autoComplete="off"
                        aria-label={headerSearch.placeholder || 'Search'}
                    />
                )}
                {extraHeaderAction}
                {ActionIcon &&
                    (onActionIconClick ? (
                        <button
                            type="button"
                            onClick={onActionIconClick}
                            className="p-0.5 rounded transition-opacity hover:opacity-90 cursor-pointer"
                            style={{ color: colors.textMuted }}
                            aria-label="Search"
                        >
                            <ActionIcon size={14} className="block" />
                        </button>
                    ) : (
                        <ActionIcon size={14} style={{ color: colors.textMuted }} className="hover:opacity-80 hidden md:block" />
                    ))}
            </div>
        </div>
        <div className="flex-1 min-h-0 relative">{children}</div>
    </div>
);

export const MiniStatCard = ({ label, value, colorKey, colors }: any) => {
    const baseColor = colors[colorKey] || colorKey;
    return (
        <div
            className="px-3 py-2 rounded-lg flex flex-col justify-center transition-all duration-300 hover:scale-[1.08] hover:-translate-y-1 shadow-sm border-0 relative overflow-hidden group animate-in fade-in zoom-in duration-500"
            style={{
                background: `linear-gradient(135deg, ${baseColor}, ${baseColor})`,
                boxShadow: `0 4px 12px ${baseColor}30`,
            }}
        >
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <span className="text-[9px] uppercase tracking-wider truncate font-bold relative z-10" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {label}
            </span>
            <span className="text-sm font-bold font-mono relative z-10" style={{ color: '#FFFFFF' }}>
                {value}
            </span>
        </div>
    );
};
