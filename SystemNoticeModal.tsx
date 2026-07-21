import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export type SystemNoticeTheme = {
    colors?: Record<string, string | undefined>;
};

export type SystemNoticeModalProps = {
    title: string;
    message: string;
    theme: SystemNoticeTheme;
    onClose: () => void;
};

/** In-app system notice (replaces browser alert). Matches RequestsManager styling. */
export default function SystemNoticeModal({ title, message, theme, onClose }: SystemNoticeModalProps) {
    const colors = theme?.colors || {};
    return (
        <div
            className="fixed inset-0 z-[230] flex items-center justify-center p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="system-notice-title"
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div
                className="relative w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden"
                style={{ backgroundColor: colors.card, borderColor: colors.border }}
            >
                <div className="p-6 border-b flex items-start justify-between gap-3" style={{ borderColor: colors.border }}>
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="shrink-0 mt-0.5 p-2 rounded-xl bg-amber-500/15 border border-amber-500/30">
                            <AlertTriangle className="text-amber-500" size={22} aria-hidden />
                        </div>
                        <div className="min-w-0">
                            <p
                                className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1"
                                style={{ color: colors.textMain }}
                            >
                                System message
                            </p>
                            <h3
                                id="system-notice-title"
                                className="font-black text-lg leading-tight"
                                style={{ color: colors.textMain }}
                            >
                                {title}
                            </h3>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 opacity-30 hover:opacity-100 transition-opacity p-1"
                        style={{ color: colors.textMain }}
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 max-h-[55vh] overflow-y-auto">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium" style={{ color: colors.textMuted }}>
                        {message}
                    </p>
                </div>
                <div className="p-4 border-t" style={{ borderColor: colors.border }}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 active:scale-[0.99]"
                        style={{ backgroundColor: colors.primary, color: colors.card }}
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}
