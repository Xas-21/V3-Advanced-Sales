import React, { useMemo } from 'react';
import { getPrimaryOperationalDate } from './userProfileMetrics';
import { bucketRequestDistribution } from './requestTypeUtils';

const toYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const parseYmd = (value: any): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    return toYmd(dt);
};

const isSeriesRequest = (req: any) => String(req?.requestType || '').toLowerCase().includes('series');

function calendarColorForRequest(req: any) {
    const b = bucketRequestDistribution(req.requestType);
    if (b === 'series') return 'purple';
    if (b === 'event' || b === 'event_rooms') return 'orange';
    return 'blue';
}

/** Match RequestsManager.getStatusColor for request pipeline statuses. */
export function calendarRequestStatusColor(status: string, c: any): string {
    const s = String(status || '').trim();
    switch (s) {
        case 'Inquiry':
        case 'Draft':
            return c.textMuted;
        case 'Accepted':
            return c.yellow;
        case 'Tentative':
            return c.blue;
        case 'Definite':
            return c.green;
        case 'Actual':
            return '#059669';
        case 'Lost':
        case 'Cancelled':
            return c.red;
        default:
            return c.primary;
    }
}

/** Humanize CRM stage keys like `notInterested` → "Not Interested". */
function humanizeCrmStageKey(raw: string): string {
    const s = String(raw || '').trim();
    if (!s) return '—';
    const spaced = s
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[\s_-]+/g, ' ')
        .trim();
    if (!spaced) return '—';
    return spaced.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Match CRM.tsx pipeline stage colors/labels. */
export function crmCalendarStageMeta(stageKey: string, c: any): { label: string; color: string } {
    const k = String(stageKey || 'new').toLowerCase().replace(/\s+/g, '');
    const map: Record<string, { label: string; color: string }> = {
        new: { label: 'New Calls', color: c.blue },
        waiting: { label: 'Leads', color: '#94a3b8' },
        qualified: { label: 'QUALIFIED', color: c.cyan },
        proposal: { label: 'PROPOSAL', color: c.yellow },
        negotiation: { label: 'NEGOTIATION', color: c.orange },
        won: { label: 'WON', color: c.green },
        notinterested: { label: 'Not Interested', color: '#8b0000' },
    };
    return map[k] || { label: humanizeCrmStageKey(stageKey), color: c.primary };
}

function calendarItemStatusStyle(evt: any, colors: any): { color: string; text: string } {
    if (evt?.kind === 'crm') {
        const meta = crmCalendarStageMeta(evt.crmStageKey, colors);
        return { color: meta.color, text: meta.label };
    }
    return {
        color: calendarRequestStatusColor(evt?.status, colors),
        text: String(evt?.status || '—'),
    };
}

function expandRequestCalendarEntries(req: any, propertyId: string | undefined): any[] {
    if (propertyId && req.propertyId && req.propertyId !== propertyId) return [];
    const title = req.requestName || req.confirmationNo || String(req.id);
    const typeLabel = String(req.requestType || 'Request');
    const status = String(req.status || '');
    const color = calendarColorForRequest(req);
    const pax = Number(req.totalEventPax || 0) || 0;
    const entry = (ymd: string, suffix: string) => ({
        kind: 'request' as const,
        requestId: String(req.id),
        ymd,
        id: `req-${req.id}-${suffix}`,
        title,
        type: typeLabel,
        status,
        color,
        duration: 1,
        pax,
        rev: '',
    });

    if (isSeriesRequest(req)) {
        const rows = Array.isArray(req.rooms) ? req.rooms : [];
        const out: any[] = [];
        rows.forEach((row: any, i: number) => {
            const ymd = parseYmd(row.arrival || row.checkIn || req.checkIn);
            if (ymd) out.push(entry(ymd, `s${i}`));
        });
        if (out.length) return out;
    }
    const ymd = getPrimaryOperationalDate(req);
    if (!ymd) return [];
    return [entry(ymd, 'p')];
}

function expandSalesCallCalendarEntries(leads: any[]): any[] {
    const out: any[] = [];
    (leads || []).forEach((lead: any, i: number) => {
        const ymd = parseYmd(lead?.lastContact || lead?.date);
        if (!ymd) return;
        const crmStageKey = String(lead.stage || 'new').toLowerCase();
        out.push({
            kind: 'crm' as const,
            leadSnapshot: { ...lead },
            crmStageKey,
            ymd,
            id: `crm-${lead.id ?? i}`,
            title: String(lead.subject || lead.company || lead.nextStep || 'Sales call').trim() || 'Sales call',
            type: 'Sales Call',
            status: crmStageKey,
            color: 'green',
            duration: 1,
            pax: 0,
            rev: '',
            companyName: String(lead.company || '').trim(),
            ownerName: String(lead.accountManager || lead.ownerUserId || '').trim() || '—',
        });
    });
    return out;
}

export type CalendarViewProps = {
    theme: { colors: any };
    currentDate: Date;
    viewMode?: string;
    sharedRequests?: any[];
    crmLeadsFlat?: any[];
    activeProperty?: { id?: string } | null;
    onCalendarItemClick?: (payload: any) => void;
};

export default function CalendarView({
    theme,
    currentDate,
    viewMode = 'Month',
    sharedRequests = [],
    crmLeadsFlat = [],
    activeProperty,
    onCalendarItemClick,
}: CalendarViewProps) {
    const colors = theme.colors;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    /** 0 = Sunday … 6 = Saturday, aligned with `days` header */
    const firstWeekdayOfMonth = new Date(year, month, 1).getDay();
    const monthGridCells = firstWeekdayOfMonth + daysInMonth;
    const trailingPadDays = Math.ceil(monthGridCells / 7) * 7 - monthGridCells;
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    const displayEvents = useMemo(() => {
        const pid = activeProperty?.id;
        const fromReqs = (sharedRequests || []).flatMap((r: any) => expandRequestCalendarEntries(r, pid));
        const fromCrm = expandSalesCallCalendarEntries(crmLeadsFlat);
        return [...fromReqs, ...fromCrm];
    }, [sharedRequests, activeProperty?.id, crmLeadsFlat]);

    const getEventColor = (colorName: any) => {
        switch (colorName) {
            case 'blue': return { bg: colors.blue + '20', border: colors.blue, text: colors.blue };
            case 'purple': return { bg: colors.purple + '20', border: colors.purple, text: colors.purple };
            case 'orange': return { bg: '#ff6b35' + '20', border: '#ff6b35', text: '#ff6b35' };
            case 'green': return { bg: colors.green + '20', border: colors.green, text: colors.green };
            case 'yellow': return { bg: colors.yellow + '20', border: colors.yellow, text: colors.yellow };
            case 'red': return { bg: colors.red + '20', border: colors.red, text: colors.red };
            default: return { bg: colors.border, border: colors.textMuted, text: colors.textMuted };
        }
    };

    // Week View: Show current week
    if (viewMode === 'Week') {
        const today = new Date(currentDate);
        const dayOfWeek = today.getDay();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - dayOfWeek);

        const weekDays = Array.from({ length: 7 }, (_, i) => {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + i);
            return date;
        });

        return (
            <div className="flex flex-1 flex-col min-h-0 gap-3">
                {/* Calendar Legend */}
                <div className="shrink-0 flex flex-wrap items-center gap-4 sm:gap-6 px-3 sm:px-4 py-2 rounded-lg border-2" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    {[
                        { label: 'Group Accommodation', color: colors.blue },
                        { label: 'Series Group', color: colors.purple },
                        { label: 'Events', color: '#ff6b35' },
                        { label: 'Sales Calls', color: colors.green },
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: item.color }}></div>
                            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: colors.textMuted }}>{item.label}</span>
                        </div>
                    ))}
                </div>

                {/* Week Grid */}
                <div className="flex-1 min-h-0 rounded-xl border-2 overflow-hidden flex flex-col" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="grid grid-cols-7 border-b-2" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                        {weekDays.map((date, i) => (
                            <div key={i} className="py-3 text-center border-r-2 last:border-r-0" style={{ borderColor: colors.border }}>
                                <div className="text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.primary }}>{days[date.getDay()]}</div>
                                <div className="text-sm font-bold mt-1" style={{ color: colors.textMain }}>{date.getDate()}</div>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 flex-1 min-h-0" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
                        {weekDays.map((date, i) => {
                            const dayYmd = toYmd(date);
                            const dayEvents = displayEvents.filter((e: any) => e.ymd === dayYmd);
                            const isToday = dayYmd === toYmd(new Date());
                            return (
                                <div key={i} className="border-r-2 last:border-r-0 p-2 min-h-0 flex flex-col overflow-hidden" style={{ borderColor: colors.border, backgroundColor: isToday ? colors.bg : 'transparent' }}>
                                    <div className="min-h-0 flex-1 overflow-y-auto space-y-2 scrollbar-thin">
                                        {dayEvents.map((evt: any, idx: number) => {
                                            const style = getEventColor(evt.color);
                                            const st = calendarItemStatusStyle(evt, colors);
                                            const isCrm = evt?.kind === 'crm';
                                            return (
                                                <div
                                                    key={idx}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => {
                                                        if (!onCalendarItemClick) return;
                                                        if (evt.kind === 'crm') onCalendarItemClick({ kind: 'crm', lead: evt.leadSnapshot });
                                                        else onCalendarItemClick({ kind: 'request', requestId: evt.requestId });
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key !== 'Enter' && e.key !== ' ') return;
                                                        e.preventDefault();
                                                        if (!onCalendarItemClick) return;
                                                        if (evt.kind === 'crm') onCalendarItemClick({ kind: 'crm', lead: evt.leadSnapshot });
                                                        else onCalendarItemClick({ kind: 'request', requestId: evt.requestId });
                                                    }}
                                                    className="text-xs px-2 py-2 rounded cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-current/20 hover:scale-105 hover:brightness-110 border-l-3"
                                                    style={{ backgroundColor: style.bg, borderLeftColor: style.border, borderLeftWidth: '3px', boxShadow: `0 0 0 ${style.border}00` }}
                                                >
                                                    {isCrm ? (
                                                        <>
                                                            <div className="flex items-center gap-1 min-w-0 font-bold leading-tight">
                                                                <span className="truncate min-w-0" style={{ color: colors.textMain }}>{evt.title}</span>
                                                                {evt.ownerName && evt.ownerName !== '—' ? (
                                                                    <span className="shrink-0 text-[10px] font-semibold whitespace-nowrap" style={{ color: colors.textMuted }}>· {evt.ownerName}</span>
                                                                ) : null}
                                                            </div>
                                                            {evt.companyName ? (
                                                                <div className="text-[10px] font-medium truncate mt-0.5" style={{ color: colors.textMain }}>{evt.companyName}</div>
                                                            ) : null}
                                                        </>
                                                    ) : (
                                                        <div className="font-bold truncate" style={{ color: colors.textMain }}>{evt.title}</div>
                                                    )}
                                                    <div className="text-[10px] mt-1" style={{ color: style.text }}>{evt.type}</div>
                                                    <div className="text-[10px] font-bold mt-0.5" style={{ color: st.color }}>{st.text}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // List View: Show all events in a list
    if (viewMode === 'List') {
        const allEvents = displayEvents
            .filter((e: any) => String(e.ymd || '').startsWith(monthPrefix))
            .map((evt: any) => ({
                ...evt,
                fullDate: new Date(`${evt.ymd}T12:00:00`),
            }))
            .sort((a: any, b: any) => String(a.ymd).localeCompare(String(b.ymd)));

        return (
            <div className="flex flex-1 flex-col min-h-0 gap-3">
                {/* Calendar Legend */}
                <div className="shrink-0 flex flex-wrap items-center gap-4 sm:gap-6 px-3 sm:px-4 py-2 rounded-lg border-2" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    {[
                        { label: 'Group Accommodation', color: colors.blue },
                        { label: 'Series Group', color: colors.purple },
                        { label: 'Events', color: '#ff6b35' },
                        { label: 'Sales Calls', color: colors.green },
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: item.color }}></div>
                            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: colors.textMuted }}>{item.label}</span>
                        </div>
                    ))}
                </div>

                {/* List View */}
                <div className="flex-1 min-h-0 rounded-xl border-2 overflow-hidden flex flex-col" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="h-full overflow-y-auto p-4 space-y-3">
                        {allEvents.map((evt: any, idx: number) => {
                            const style = getEventColor(evt.color);
                            const st = calendarItemStatusStyle(evt, colors);
                            const dateStr = evt.fullDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                            const isCrm = evt?.kind === 'crm';
                            return (
                                <div
                                    key={idx}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                        if (!onCalendarItemClick) return;
                                        if (evt.kind === 'crm') onCalendarItemClick({ kind: 'crm', lead: evt.leadSnapshot });
                                        else onCalendarItemClick({ kind: 'request', requestId: evt.requestId });
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key !== 'Enter' && e.key !== ' ') return;
                                        e.preventDefault();
                                        if (!onCalendarItemClick) return;
                                        if (evt.kind === 'crm') onCalendarItemClick({ kind: 'crm', lead: evt.leadSnapshot });
                                        else onCalendarItemClick({ kind: 'request', requestId: evt.requestId });
                                    }}
                                    className="flex items-center gap-4 p-3 rounded-lg border-2 cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-current/30 hover:scale-[1.02] hover:brightness-110"
                                    style={{ backgroundColor: style.bg, borderColor: style.border, boxShadow: `0 0 0 ${style.border}00` }}
                                >
                                    <div className="flex-shrink-0 text-center min-w-[80px]">
                                        <div className="text-xs font-bold" style={{ color: style.text }}>{dateStr}</div>
                                        <div className="text-[10px] mt-1" style={{ color: colors.textMuted }}>{evt.duration} days</div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        {isCrm ? (
                                            <>
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="font-bold text-sm truncate min-w-0" style={{ color: colors.textMain }}>{evt.title}</span>
                                                    {evt.ownerName && evt.ownerName !== '—' ? (
                                                        <span className="shrink-0 text-[11px] font-semibold whitespace-nowrap" style={{ color: colors.textMuted }}>· {evt.ownerName}</span>
                                                    ) : null}
                                                </div>
                                                {evt.companyName ? (
                                                    <div className="text-[11px] font-medium truncate mt-0.5" style={{ color: colors.textMain }}>{evt.companyName}</div>
                                                ) : null}
                                            </>
                                        ) : (
                                            <div className="font-bold text-sm truncate" style={{ color: colors.textMain }}>{evt.title}</div>
                                        )}
                                        <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: colors.textMuted }}>
                                            <span>{evt.type}</span>
                                            <span>•</span>
                                            <span className="font-bold" style={{ color: st.color }}>{st.text}</span>
                                        </div>
                                    </div>
                                    <div className="flex-shrink-0 text-right">
                                        <div className="text-xs font-bold" style={{ color: colors.textMain }}>{evt.pax} PAX</div>
                                        <div className="text-xs mt-1" style={{ color: colors.textMuted }}>{evt.rev}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // Month View (default)
    const monthWeekRowCount = Math.ceil((firstWeekdayOfMonth + daysInMonth + trailingPadDays) / 7);

    return (
        <div className="flex flex-1 flex-col min-h-0 gap-3">
            {/* Calendar Legend */}
            <div className="shrink-0 flex flex-wrap items-center gap-4 sm:gap-6 px-3 sm:px-4 py-2 rounded-lg border-2" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                {[
                    { label: 'Group Accommodation', color: colors.blue },
                    { label: 'Series Group', color: colors.purple },
                    { label: 'Events', color: '#ff6b35' },
                    { label: 'Sales Calls', color: colors.green },
                ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: item.color }}></div>
                        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: colors.textMuted }}>{item.label}</span>
                    </div>
                ))}
            </div>

            {/* Calendar Grid — rows share remaining height; each day scrolls its own items */}
            <div className="flex-1 min-h-0 rounded-xl border-2 overflow-hidden flex flex-col" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="shrink-0 grid grid-cols-7 border-b-2" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                    {days.map(day => (
                        <div key={day} className="py-2 text-center text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.primary }}>
                            {day}
                        </div>
                    ))}
                </div>
                <div
                    className="grid grid-cols-7 flex-1 min-h-0"
                    style={{ gridTemplateRows: `repeat(${monthWeekRowCount}, minmax(0, 1fr))` }}
                >
                    {Array.from({ length: firstWeekdayOfMonth }).map((_, i) => (
                        <div
                            key={`empty-start-${i}`}
                            className={`border-r-2 border-b-2 min-h-0 h-full ${i % 7 === 6 ? 'border-r-0' : ''}`}
                            style={{ borderColor: colors.border, backgroundColor: colors.bg + '30' }}
                        />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const dayNum = i + 1;
                        const cellIndex = firstWeekdayOfMonth + i;
                        const dayYmd = `${monthPrefix}-${String(dayNum).padStart(2, '0')}`;
                        const dayEvents = displayEvents.filter((e: any) => e.ymd === dayYmd);
                        const now = new Date();
                        const isToday = now.getFullYear() === year && now.getMonth() === month && now.getDate() === dayNum;
                        return (
                            <div
                                key={dayNum}
                                className={`border-r-2 border-b-2 p-1.5 relative group hover:bg-white/5 transition-colors flex flex-col min-h-0 h-full ${cellIndex % 7 === 6 ? 'border-r-0' : ''}`}
                                style={{ borderColor: colors.border }}
                            >
                                <div className="flex justify-between items-center mb-1 shrink-0">
                                    <span className={`text-xs font-bold ${isToday ? 'bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]' : ''}`}
                                        style={{ color: isToday ? '#fff' : colors.textMuted }}>
                                        {dayNum}
                                    </span>
                                    {dayEvents.length > 0 && (
                                        <div className="flex gap-0.5">
                                            {dayEvents.slice(0, 4).map((evt, idx) => {
                                                const style = getEventColor(evt.color);
                                                return <div key={idx} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.border }}></div>
                                            })}
                                        </div>
                                    )}
                                </div>
                                <div
                                    className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5 space-y-0.5 scrollbar-thin"
                                >
                                    {dayEvents.map((evt: any, idx: number) => {
                                        const style = getEventColor(evt.color);
                                        const st = calendarItemStatusStyle(evt, colors);
                                        const isCrm = evt?.kind === 'crm';
                                        return (
                                            <div
                                                key={idx}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => {
                                                    if (!onCalendarItemClick) return;
                                                    if (evt.kind === 'crm') onCalendarItemClick({ kind: 'crm', lead: evt.leadSnapshot });
                                                    else onCalendarItemClick({ kind: 'request', requestId: evt.requestId });
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key !== 'Enter' && e.key !== ' ') return;
                                                    e.preventDefault();
                                                    if (!onCalendarItemClick) return;
                                                    if (evt.kind === 'crm') onCalendarItemClick({ kind: 'crm', lead: evt.leadSnapshot });
                                                    else onCalendarItemClick({ kind: 'request', requestId: evt.requestId });
                                                }}
                                                className="text-[9px] px-1.5 py-1 rounded cursor-pointer transition-all duration-200 hover:shadow-md hover:shadow-current/25 hover:scale-[1.03] hover:brightness-110 border-l-2"
                                                style={{ backgroundColor: style.bg, borderLeftColor: style.border, boxShadow: `0 0 0 ${style.border}00` }}
                                            >
                                                {isCrm ? (
                                                    <>
                                                        <div className="flex items-center gap-0.5 min-w-0 leading-tight">
                                                            <span className="font-semibold truncate min-w-0" style={{ color: colors.textMain }}>{evt.title}</span>
                                                            {evt.ownerName && evt.ownerName !== '—' ? (
                                                                <span className="shrink-0 text-[8px] font-medium whitespace-nowrap" style={{ color: colors.textMuted }}>· {evt.ownerName}</span>
                                                            ) : null}
                                                        </div>
                                                        {evt.companyName ? (
                                                            <div className="text-[8px] font-medium truncate mt-0.5" style={{ color: colors.textMain }}>{evt.companyName}</div>
                                                        ) : null}
                                                    </>
                                                ) : (
                                                    <div className="font-semibold truncate leading-tight" style={{ color: colors.textMain }}>{evt.title}</div>
                                                )}
                                                <div className="flex items-center justify-between mt-0.5 text-[8px]">
                                                    <span className="truncate" style={{ color: style.text }}>{evt.type}</span>
                                                    <span className="font-bold ml-1 whitespace-nowrap" style={{ color: st.color }}>{st.text}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                    {Array.from({ length: trailingPadDays }).map((_, i) => {
                        const cellIndex = firstWeekdayOfMonth + daysInMonth + i;
                        return (
                            <div
                                key={`empty-end-${i}`}
                                className={`border-r-2 border-b-2 min-h-0 h-full ${cellIndex % 7 === 6 ? 'border-r-0' : ''}`}
                                style={{ borderColor: colors.border, backgroundColor: colors.bg + '30' }}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
