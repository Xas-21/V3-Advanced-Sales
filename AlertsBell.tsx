import React, { memo } from 'react';
import { Bell } from 'lucide-react';
import type { RequestAlert } from './requestAlertEngine';

export type AlertsBellProps = {
    colors: any;
    bellSize: number;
    panelRef: React.RefObject<HTMLDivElement>;
    open: boolean;
    setOpen: (v: boolean) => void;
    activeAlerts: RequestAlert[];
    getAlertRowStyle: (a: RequestAlert['accent']) => React.CSSProperties;
    onDone: (a: RequestAlert) => void;
    onViewRequest: (a: RequestAlert) => void;
};

const AlertsBell = memo(function AlertsBell({
    colors,
    bellSize,
    panelRef,
    open,
    setOpen,
    activeAlerts,
    getAlertRowStyle,
    onDone,
    onViewRequest,
}: AlertsBellProps) {
    return (
        <div className="relative" ref={panelRef}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="relative p-1.5 rounded-md border transition-all hover:bg-white/10"
                style={{ borderColor: colors.border, color: colors.textMuted }}
                aria-expanded={open}
                aria-haspopup="dialog"
                title="Alerts"
            >
                <Bell size={bellSize} />
                {activeAlerts.length > 0 ? (
                    <span
                        className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-black flex items-center justify-center leading-none"
                        style={{ backgroundColor: colors.red, color: '#fff' }}
                    >
                        {activeAlerts.length > 99 ? '99+' : activeAlerts.length}
                    </span>
                ) : null}
            </button>
            {open ? (
                <div
                    className="absolute right-0 top-full mt-2 w-[min(100vw-2rem,22rem)] max-h-[min(70vh,440px)] overflow-y-auto rounded-xl border shadow-2xl z-[200] py-2"
                    style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    role="dialog"
                    aria-label="Alerts"
                >
                    {activeAlerts.length === 0 ? (
                        <p className="px-4 py-6 text-xs text-center font-medium" style={{ color: colors.textMuted }}>
                            No active alerts
                        </p>
                    ) : (
                        activeAlerts.map((alert) => (
                            <div
                                key={alert.dismissKey}
                                className="px-2 py-1.5 border-b last:border-b-0"
                                style={{ borderColor: colors.border }}
                            >
                                <div
                                    className="rounded-lg overflow-hidden border"
                                    style={{
                                        ...getAlertRowStyle(alert.accent),
                                        borderRightWidth: 1,
                                        borderTopWidth: 1,
                                        borderBottomWidth: 1,
                                        borderRightStyle: 'solid',
                                        borderTopStyle: 'solid',
                                        borderBottomStyle: 'solid',
                                        borderRightColor: colors.border,
                                        borderTopColor: colors.border,
                                        borderBottomColor: colors.border,
                                    }}
                                >
                                    <div className="p-2.5">
                                        <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: colors.textMuted }}>
                                            {alert.title}
                                            {alert.urgent ? <span style={{ color: colors.red }}> · Urgent</span> : null}
                                        </p>
                                        <p className="text-xs font-bold mt-1 leading-snug" style={{ color: colors.textMain }}>
                                            {alert.body}
                                        </p>
                                        <p className="text-[10px] mt-1.5 opacity-70" style={{ color: colors.textMain }}>
                                            Owner: <span className="font-bold">{alert.creatorName}</span>
                                        </p>
                                        {alert.anchorDate ? (
                                            <p className="text-[9px] opacity-50 mt-0.5" style={{ color: colors.textMuted }}>
                                                Anchor: {alert.anchorDate}
                                            </p>
                                        ) : null}
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                type="button"
                                                onClick={() => onDone(alert)}
                                                className="flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-colors hover:opacity-90"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                Done
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onViewRequest(alert)}
                                                className="flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-colors hover:opacity-90"
                                                style={{
                                                    borderColor: colors.primary,
                                                    color: colors.textMain,
                                                    backgroundColor: `${colors.primary}18`,
                                                }}
                                            >
                                                View request
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : null}
        </div>
    );
});

export default AlertsBell;
