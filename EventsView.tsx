import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    Users,
    Calendar,
    CalendarDays,
    MoreHorizontal,
    Search,
    ChevronDown,
    Printer,
    X,
    Filter,
    Grid,
    Download,
    Check,
    ChevronLeft,
    ChevronRight,
    DollarSign,
    FileText,
    Crown,
    TrendingUp,
} from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    Tooltip,
    XAxis,
    YAxis,
    Legend,
} from 'recharts';
import { apiUrl } from './backendApi';
import { calendarRequestStatusColor } from './CalendarView';
import { useCurrencyFormatters } from './useCurrencyFormatters';
import { contactDisplayName } from './accountLeadMapping';
import {
    calculateAccFinancialsForRequest,
    printBeoDocument,
    getAccountForRequest,
    getEventDateWindow,
    formatAgendaPackageSummary,
    formatAgendaRowCoffeeBreak,
    formatAgendaRowLunch,
    formatAgendaRowDinner,
    formatBeoSpecialRequestsCombined,
    inclusiveCalendarDays,
    normalizeRequestTypeKey,
    getBeoScopeGrandTotalInclTax,
    deriveBeoPaymentView,
    sumAgendaAttendeeDays,
    expandAgendaRowVenueOccupancies,
    formatAgendaRowVenueDisplay,
} from './beoShared';
import { rechartsTooltipThemeProps } from './rechartsChartLegend';
import { StatusBadge, KPICard } from './dashboardHub/dashboardChrome';

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

const asNumber = (value: any) => parseFloat(String(value ?? 0).replace(/,/g, '')) || 0;

const isSeriesRequest = (req: any) => String(req?.requestType || '').toLowerCase().includes('series');

function isMiceRequest(req: any) {
    const t = String(req?.requestType || '').toLowerCase();
    if (t === 'event') return true;
    if (t === 'event_rooms') return true;
    if (t === 'series' || t.includes('series')) return true;
    if (t.includes('event with')) return true;
    return false;
}

/** Events & Catering kanban + dashboard MICE tab: Event, Event+Rooms, and similar — excludes Series / group-series stays. */
export function isEventsCateringEligibleRequest(req: any): boolean {
    if (isSeriesRequest(req)) return false;
    const t = String(req?.requestType || '').toLowerCase();
    if (t === 'event') return true;
    if (t === 'event_rooms') return true;
    if (t.includes('event with')) return true;
    return false;
}

/** Calendar days in range for MICE event/agenda attribution (dashboard charts). */

// --- Events & Catering: request helpers (MICE types + kanban mapping) ---
const COLUMN_TO_STATUS: Record<string, string> = {
    inquiry: 'Inquiry',
    accepted: 'Accepted',
    tentative: 'Tentative',
    definite: 'Definite',
    actual: 'Actual',
    cancelled: 'Cancelled',
};

const statusToColumnId = (status: string): string => {
    const s = (status || 'Inquiry').toLowerCase();
    if (s === 'lost') return 'cancelled';
    if (s === 'draft') return 'inquiry';
    const valid = ['inquiry', 'accepted', 'tentative', 'definite', 'actual', 'cancelled'];
    if (valid.includes(s)) return s;
    return 'inquiry';
};

/** Min/max dates for filtering MICE requests (agenda + legacy event/check fields). */
function getMiceRequestDateWindow(req: any): { start: string; end: string } {
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    const dates: string[] = [];
    for (const item of agenda) {
        const s = String(item?.startDate || '').trim().slice(0, 10);
        const e = String(item?.endDate || item?.startDate || '').trim().slice(0, 10);
        if (s) dates.push(s);
        if (e) dates.push(e);
    }
    if (dates.length) {
        const sorted = [...new Set(dates)].sort();
        return { start: sorted[0], end: sorted[sorted.length - 1] };
    }
    const a = String(req?.eventStart || req?.checkIn || req?.requestDate || '').slice(0, 10);
    const b = String(req?.eventEnd || req?.checkOut || a || '').slice(0, 10) || a;
    return { start: a, end: b || a };
}

/** Total attendees for a MICE request: prefer stored total, else sum of agenda row pax. */
function totalMiceRequestPax(req: any): number {
    const stored = Number(req?.totalEventPax ?? 0);
    if (Number.isFinite(stored) && stored > 0) return Math.floor(stored);
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    let sum = 0;
    for (const row of agenda) sum += Number(row?.pax || 0) || 0;
    if (sum > 0) return sum;
    const ag0 = agenda[0];
    return Number(ag0?.pax || 0) || 0;
}

/** Sum of (agenda pax × row days) for dashboards / performance; falls back to headcount when agenda yields 0. */
function totalMiceRequestAttendeeDays(req: any): number {
    const n = sumAgendaAttendeeDays(Array.isArray(req?.agenda) ? req.agenda : []);
    if (n > 0) return n;
    return totalMiceRequestPax(req);
}

/** First agenda start through last agenda end (YYYY-MM-DD), or single date. */
function formatMiceAgendaDateRange(req: any): string {
    const win = getMiceRequestDateWindow(req);
    const s = String(win.start || '').trim().slice(0, 10);
    const e = String(win.end || win.start || '').trim().slice(0, 10);
    if (!s) return '—';
    if (!e || e === s) return s;
    return `${s} — ${e}`;
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
    if (!aStart && !aEnd) return true;
    const as = aStart || aEnd;
    const ae = aEnd || aStart;
    return !(ae < bStart || as > bEnd);
}

function requestInEventDateRange(req: any, range: { start: string; end: string }) {
    if (!range?.start && !range?.end) return true;
    const start = range.start || '1970-01-01';
    const end = range.end || '2099-12-31';
    const win = getMiceRequestDateWindow(req);
    const rs = win.start;
    const re = win.end || win.start;
    if (!rs && !re) return true;
    return rangesOverlap(rs, re, start, end);
}

function computeRequestTotalWithTax(req: any, taxes: any[] = []) {
    const rawTotal = parseFloat(String(req.totalCost ?? 0).replace(/,/g, '')) || 0;
    const agenda = Array.isArray(req.agenda) ? req.agenda : [];
    const rooms = Array.isArray(req.rooms) ? req.rooms : [];
    const transport = Array.isArray(req.transportation) ? req.transportation : [];
    const nightsFromRequest = (() => {
        const a = String(req.checkIn || '').trim();
        const b = String(req.checkOut || '').trim();
        if (!a || !b) return 0;
        const ms = new Date(b).getTime() - new Date(a).getTime();
        if (Number.isNaN(ms)) return 0;
        return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
    })();
    const roomsCostNoTax = rooms.reduce((sum: number, r: any) => {
        const count = Number(r.count || 0);
        const rate = Number(r.rate || 0);
        const a = String(r.arrival || req.checkIn || '').trim();
        const b = String(r.departure || req.checkOut || '').trim();
        let nights = nightsFromRequest;
        if (a && b) {
            const ms = new Date(b).getTime() - new Date(a).getTime();
            if (!Number.isNaN(ms)) nights = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
        }
        return sum + (count * rate * nights);
    }, 0);
    const eventCostNoTax = agenda.reduce((sum: number, item: any) => sum + (Number(item.rate || 0) * Number(item.pax || 0)) + Number(item.rental || 0), 0);
    const transCostNoTax = transport.reduce((sum: number, t: any) => sum + Number(t.costPerWay || 0), 0);
    let roomsTax = 0;
    let eventTax = 0;
    let transTax = 0;
    for (const tax of taxes) {
        const rate = (Number(tax?.rate) || 0) / 100;
        if (tax?.scope?.accommodation) roomsTax += rate;
        if (tax?.scope?.events || tax?.scope?.foodAndBeverage) eventTax += rate;
        if (tax?.scope?.transport) transTax += rate;
    }
    const computedWithTax =
        roomsCostNoTax * (1 + roomsTax) +
        eventCostNoTax * (1 + eventTax) +
        transCostNoTax * (1 + transTax);
    if (computedWithTax > 0) return computedWithTax;
    return rawTotal;
}

/** Dashboard / KPI revenue: line-item subtotals only (no tax/fees). Uses persisted grandTotalNoTax when lines are empty. */
export function computeRequestCostBreakdown(req: any) {
    const rooms = Array.isArray(req?.rooms) ? req.rooms : [];
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    const transport = Array.isArray(req?.transportation) ? req.transportation : [];
    const reqNights = (() => {
        const inDate = parseYmd(req?.checkIn);
        const outDate = parseYmd(req?.checkOut);
        if (!inDate || !outDate) return 0;
        const ms = new Date(`${outDate}T00:00:00`).getTime() - new Date(`${inDate}T00:00:00`).getTime();
        if (Number.isNaN(ms)) return 0;
        return Math.max(0, Math.ceil(ms / 86400000));
    })();
    const roomsRevenue = rooms.reduce((sum: number, row: any) => {
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        const inDate = parseYmd(row?.arrival || req?.checkIn);
        const outDate = parseYmd(row?.departure || req?.checkOut);
        let nights = reqNights;
        if (inDate && outDate) {
            const ms = new Date(`${outDate}T00:00:00`).getTime() - new Date(`${inDate}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) nights = Math.max(0, Math.ceil(ms / 86400000));
        }
        return sum + (count * rate * nights);
    }, 0);
    let eventRevenue = agenda.reduce((sum: number, item: any) => {
        const start = parseYmd(item?.startDate);
        const end = parseYmd(item?.endDate || item?.startDate);
        let rowDays = 1;
        if (start && end) {
            const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) rowDays = Math.max(1, Math.floor(ms / 86400000) + 1);
        }
        const rowCost = (Number(item?.rate || 0) * Number(item?.pax || 0)) + Number(item?.rental || 0);
        return sum + (rowCost * rowDays);
    }, 0);
    const transportRevenue = transport.reduce((sum: number, row: any) => sum + Number(row?.costPerWay || 0), 0);
    let lineSum = roomsRevenue + eventRevenue + transportRevenue;
    const storedNoTax = asNumber(
        req?.grandTotalNoTax ??
        req?.totalCostNoTax ??
        req?.totalCost ??
        req?.grandTotal ??
        req?.totalAmount ??
        0
    );
    if (lineSum <= 0 && storedNoTax > 0) {
        if (isMiceRequest(req)) {
            eventRevenue = storedNoTax;
            lineSum = roomsRevenue + eventRevenue + transportRevenue;
        } else {
            lineSum = storedNoTax;
        }
    }
    return {
        roomsRevenue,
        eventRevenue,
        transportRevenue,
        totalRevenue: lineSum,
    };
}

function requestToKanbanCard(req: any, _taxes: any[] = []) {
    const eventRevenueOnly = computeRequestCostBreakdown(req).eventRevenue;
    const pax = totalMiceRequestPax(req);
    const date = formatMiceAgendaDateRange(req);
    return {
        id: req.id,
        requestId: req.id,
        title: req.requestName || req.confirmationNo || String(req.id),
        client: req.account || req.accountName || '—',
        pax,
        /** Events & Catering: show event/agenda revenue only (not rooms/series accommodation). */
        budget: Number(eventRevenueOnly || 0),
        date,
        type: req.requestType || 'Event',
    };
}


export type EventsViewProps = {
    theme: { colors: any };
    subView: string;
    filterRange: { start: string; end: string };
    sharedRequests?: any[];
    onPatchRequestStatus?: (...args: any[]) => any;
    onOpenRequest?: (id: string) => void;
    onOpenRequestOpts?: (id: string) => void;
    activeProperty?: any;
    accounts?: any[];
    onRefreshRequests?: () => void;
    readOnly?: boolean;
    currency?: string;
};

export default function EventsView({
    theme,
    subView,
    filterRange,
    sharedRequests = [],
    onPatchRequestStatus,
    onOpenRequest,
    onOpenRequestOpts,
    activeProperty,
    accounts = [],
    onRefreshRequests,
    readOnly = false,
    currency = 'SAR',
}: EventsViewProps) {
    const colors = theme.colors;
    const { formatMoneyCompact, formatCurrencyAmount: formatMoney } = useCurrencyFormatters(currency);
    const [draggedItem, setDraggedItem] = useState<any>(null);
    const [accountSearch, setAccountSearch] = useState('');
    const [expandedAccounts, setExpandedAccounts] = useState<string[]>([]);
    const [venuesList, setVenuesList] = useState<any[]>([]);
    const [propertyTaxes, setPropertyTaxes] = useState<any[]>([]);
    const todayIso = toYmd(new Date());
    const defaultTo = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 4);
        return toYmd(d);
    })();
    const [draftFrom, setDraftFrom] = useState(todayIso);
    const [draftTo, setDraftTo] = useState(defaultTo);
    const [draftGridStart, setDraftGridStart] = useState(todayIso);
    const [appliedFrom, setAppliedFrom] = useState(todayIso);
    const [appliedTo, setAppliedTo] = useState(defaultTo);
    /** Grid columns follow this only (not `draftGridStart`) until user clicks Align or Search applies range. */
    const [appliedGridStart, setAppliedGridStart] = useState(todayIso);
    /** How many day columns the availability grid shows (independent of summary range). */
    const [availabilityGridDays, setAvailabilityGridDays] = useState(7);
    const [availabilityVenueModal, setAvailabilityVenueModal] = useState<{ venueName: string; bookings: any[] } | null>(null);
    const [beoSearch, setBeoSearch] = useState('');
    const [beoSortOrder, setBeoSortOrder] = useState<'newest' | 'oldest'>('newest');
    const [beoModalRequestId, setBeoModalRequestId] = useState<string | null>(null);
    const [beoNotesDraft, setBeoNotesDraft] = useState('');
    const eventsKanbanScrollRef = useRef<HTMLDivElement>(null);

    const miceRequests = useMemo(() => {
        return (sharedRequests || [])
            .filter(isEventsCateringEligibleRequest)
            .filter((r: any) => requestInEventDateRange(r, filterRange));
    }, [sharedRequests, filterRange]);

    /** All eligible MICE requests (no pipeline date filter); used for venue availability and BEO. */
    const allMiceRequests = useMemo(() => (sharedRequests || []).filter(isEventsCateringEligibleRequest), [sharedRequests]);

    const kanbanData = useMemo(() => {
        const empty: Record<string, any[]> = {
            inquiry: [], accepted: [], tentative: [], definite: [], actual: [], cancelled: [],
        };
        for (const req of miceRequests) {
            const col = statusToColumnId(String(req.status || 'Inquiry'));
            const card = requestToKanbanCard(req, propertyTaxes);
            (empty[col] || empty.inquiry).push(card);
        }
        return empty;
    }, [miceRequests, propertyTaxes]);

    const toggleAccountExpansion = (accountName: string) => {
        setExpandedAccounts(prev =>
            prev.includes(accountName)
                ? prev.filter(name => name !== accountName)
                : [...prev, accountName]
        );
    };

    const parseValue = (valStr: string) => {
        if (typeof valStr === 'number') return Number.isFinite(valStr) ? valStr : 0;
        const str = valStr.toString().toLowerCase();
        if (str.endsWith('k')) return (parseFloat(str) || 0) * 1000;
        if (str.endsWith('m')) return (parseFloat(str) || 0) * 1000000;
        return parseFloat(str) || 0;
    };

    const getColumnTotal = (colId: string) => {
        const total = (kanbanData[colId] || []).reduce((sum: number, e: any) => sum + parseValue(e.budget), 0);
        return formatMoneyCompact(total);
    };

    const totalRevenue = useMemo(() => {
        const activeCols = ['inquiry', 'accepted', 'tentative', 'definite', 'actual'];
        const total = activeCols.reduce((sum, colId) => {
            return sum + (kanbanData[colId] || []).reduce((s: number, e: any) => s + parseValue(e.budget), 0);
        }, 0);
        return formatMoneyCompact(total);
    }, [kanbanData, formatMoneyCompact]);

    const totalAttendance = useMemo(() => {
        const n = miceRequests.reduce((sum: number, r: any) => sum + totalMiceRequestAttendeeDays(r), 0);
        return `${n.toLocaleString()} Pax`;
    }, [miceRequests]);

    const numEventsLabel = useMemo(() => String(miceRequests.length), [miceRequests]);

    const performanceRows = useMemo(() => {
        const byAcc: Record<string, { name: string; events: any[]; total: number; pax: number }> = {};
        for (const r of miceRequests) {
            const name = r.account || r.accountName || 'Unknown';
            if (!byAcc[name]) byAcc[name] = { name, events: [], total: 0, pax: 0 };
            byAcc[name].events.push(r);
            byAcc[name].total += computeRequestCostBreakdown(r).eventRevenue;
            byAcc[name].pax += totalMiceRequestAttendeeDays(r);
        }
        return Object.values(byAcc)
            .map(a => ({
                name: a.name,
                events: a.events.length,
                spent: formatMoneyCompact(a.total),
                pax: a.pax,
                details: a.events.map((req: any) => {
                    const date = formatMiceAgendaDateRange(req);
                    const val = computeRequestCostBreakdown(req).eventRevenue;
                    const valStr = formatMoneyCompact(val);
                    return {
                        date: date || '—',
                        title: req.requestName || req.confirmationNo,
                        pax: totalMiceRequestAttendeeDays(req),
                        value: valStr,
                    };
                }),
            }))
            .sort((a, b) => b.events - a.events);
    }, [miceRequests, formatMoneyCompact]);

    const pipelineValueKpi = useMemo(() => {
        const t = miceRequests
            .filter((r: any) => ['Inquiry', 'Accepted', 'Tentative', 'Definite', 'Draft'].includes(String(r.status || '')))
            .reduce((s: number, r: any) => s + computeRequestCostBreakdown(r).eventRevenue, 0);
        return formatMoneyCompact(t);
    }, [miceRequests, formatMoneyCompact]);

    const avgEventValueKpi = useMemo(() => {
        if (!miceRequests.length) return formatMoneyCompact(0);
        const sum = miceRequests.reduce((s: number, r: any) => s + computeRequestCostBreakdown(r).eventRevenue, 0);
        const avg = sum / miceRequests.length;
        return formatMoneyCompact(avg);
    }, [miceRequests, formatMoneyCompact]);

    const venueBarData = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const r of miceRequests) {
            const rows = Array.isArray(r.agenda) ? r.agenda : [];
            for (const row of rows) {
                for (const occ of expandAgendaRowVenueOccupancies(row, r)) {
                    const v = occ.name.trim();
                    if (!v) continue;
                    counts[v] = (counts[v] || 0) + 1;
                }
            }
        }
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 12);
    }, [miceRequests]);

    const typePieData = useMemo(() => {
        let ev = 0;
        let er = 0;
        for (const r of miceRequests) {
            const t = String(r.requestType || '').toLowerCase();
            if (t.includes('room') || t.includes('event with')) er += 1;
            else ev += 1;
        }
        if (ev === 0 && er === 0) return [{ name: 'No data', value: 1 }];
        return [
            { name: 'Event', value: Math.max(ev, 0) },
            { name: 'Event + rooms', value: Math.max(er, 0) },
        ];
    }, [miceRequests]);

    useEffect(() => {
        if (!activeProperty?.id) {
            setVenuesList([]);
            return;
        }
        fetch(apiUrl(`/api/venues?propertyId=${encodeURIComponent(activeProperty.id)}`))
            .then(r => r.json())
            .then((d) => {
                if (Array.isArray(d)) setVenuesList(d);
            })
            .catch(() => setVenuesList([]));
    }, [activeProperty?.id]);

    useEffect(() => {
        if (!activeProperty?.id) {
            setPropertyTaxes([]);
            return;
        }
        fetch(apiUrl(`/api/taxes?propertyId=${encodeURIComponent(activeProperty.id)}`))
            .then(r => r.json())
            .then((d) => {
                if (Array.isArray(d)) setPropertyTaxes(d);
            })
            .catch(() => setPropertyTaxes([]));
    }, [activeProperty?.id]);

    const agendaCoversDate = (row: any, checkIso: string, req: any) => {
        const a = String(row.startDate || req.eventStart || req.checkIn || '').slice(0, 10);
        const b = String(row.endDate || row.startDate || req.eventEnd || req.checkOut || req.eventStart || req.checkIn || '').slice(0, 10) || a;
        if (!a) return false;
        return checkIso >= a && checkIso <= (b || a);
    };

    /** Use all eligible MICE requests (not `miceRequests`), so venue availability is not tied to the Events pipeline date filter (e.g. current year only). */
    const venueBookingsOnDate = (venueName: string, checkIso: string) => {
        const out: any[] = [];
        for (const req of allMiceRequests) {
            const st = String(req.status || 'Inquiry');
            if (st === 'Cancelled' || st === 'Lost') continue;
            const rows = Array.isArray(req.agenda) ? req.agenda : [];
            for (const row of rows) {
                if (!agendaCoversDate(row, checkIso, req)) continue;
                const want = venueName.trim().toLowerCase();
                const matchesVenue = expandAgendaRowVenueOccupancies(row, req).some((occ) => occ.name.trim().toLowerCase() === want);
                if (!matchesVenue) continue;
                out.push({
                    requestId: String(req.id || ''),
                    accountName: String(req.account || req.accountName || '—'),
                    requestName: String(req.requestName || req.confirmationNo || req.id || '—'),
                    startDate: String(row.startDate || req.eventStart || req.checkIn || '').slice(0, 10),
                    endDate: String(row.endDate || row.startDate || req.eventEnd || req.checkOut || '').slice(0, 10),
                    sessionTiming: [row.startTime, row.endTime].filter(Boolean).join(' - ') || '—',
                    status: st,
                });
            }
        }
        return out;
    };

    const venueBookingLabel = (venueName: string, checkIso: string) => {
        const bookings = venueBookingsOnDate(venueName, checkIso);
        if (!bookings.length) return { label: 'Available', tone: 'free' as const, booking: null as any };
        return { label: 'Booked', tone: 'booked' as const, booking: bookings[0] };
    };

    const expandAvailabilityDays = (fromIso: string, toIso: string, maxCols: number) => {
        if (!fromIso) return [];
        let a = fromIso.slice(0, 10);
        let b = (toIso || fromIso).slice(0, 10);
        if (b < a) [a, b] = [b, a];
        const out: string[] = [];
        const cur = new Date(`${a}T12:00:00`);
        const end = new Date(`${b}T12:00:00`);
        let n = 0;
        while (cur <= end && n < maxCols) {
            out.push(toYmd(cur));
            cur.setDate(cur.getDate() + 1);
            n++;
        }
        return out;
    };

    const venueRangeSummary = (venueName: string, dayList: string[]) => {
        if (!dayList.length) return { label: '—', tone: 'free' as const, bookings: [] as any[] };
        const seen = new Set<string>();
        const bookings: any[] = [];
        for (const d of dayList) {
            const daily = venueBookingsOnDate(venueName, d);
            for (const b of daily) {
                const key = `${b.requestId}__${b.startDate}__${b.endDate}__${b.sessionTiming}`;
                if (seen.has(key)) continue;
                seen.add(key);
                bookings.push(b);
            }
        }
        if (!bookings.length) return { label: 'Available', tone: 'free' as const, bookings: [] as any[] };
        return { label: 'Booked', tone: 'booked' as const, bookings };
    };

    const beoCandidates = useMemo(() => {
        return allMiceRequests.filter((r: any) => {
            const s = String(r.status || '');
            return s !== 'Cancelled' && s !== 'Lost';
        });
    }, [allMiceRequests]);

    const columns = [
        { id: 'inquiry', title: 'Inquiry', color: colors.textMuted },
        { id: 'accepted', title: 'Accepted', color: colors.yellow },
        { id: 'tentative', title: 'Tentative', color: colors.blue },
        { id: 'definite', title: 'Definite', color: colors.green },
        { id: 'actual', title: 'Actual', color: '#059669' },
        { id: 'cancelled', title: 'Cancelled', color: colors.red },
    ];

    const handleDragStart = (e: any, item: any, sourceCol: any) => {
        setDraggedItem({ item, sourceCol });
        e.dataTransfer.setData('text/plain', JSON.stringify({ item, sourceCol }));
    };

    const handleDragOver = (e: any) => {
        e.preventDefault();
    };

    const handleDrop = (e: any, targetCol: any) => {
        e.preventDefault();
        if (readOnly) {
            setDraggedItem(null);
            return;
        }
        if (!draggedItem) return;
        const { item, sourceCol } = draggedItem;
        if (sourceCol === targetCol) {
            setDraggedItem(null);
            return;
        }
        const newStatus = COLUMN_TO_STATUS[targetCol];
        if (item.requestId && newStatus && onPatchRequestStatus) {
            onPatchRequestStatus(String(item.requestId), newStatus);
        }
        setDraggedItem(null);
    };

    // --- Sub-Views Implementations ---

    if (subView === 'availability') {
        const list = venuesList.length ? venuesList : [];
        const summaryDays = expandAvailabilityDays(appliedFrom, appliedTo, 14);
        const gridDayCount = Math.min(31, Math.max(1, Number(availabilityGridDays) || 7));
        const gridDayColumns = (() => {
            if (!appliedGridStart) return [];
            const cur = new Date(`${appliedGridStart.slice(0, 10)}T12:00:00`);
            const out: string[] = [];
            for (let i = 0; i < gridDayCount; i++) {
                out.push(toYmd(cur));
                cur.setDate(cur.getDate() + 1);
            }
            return out;
        })();

        const shiftAvailabilityGridStart = (deltaDays: number) => {
            const base = (appliedGridStart || draftGridStart || todayIso).slice(0, 10);
            const d = new Date(`${base}T12:00:00`);
            d.setDate(d.getDate() + deltaDays);
            const y = toYmd(d);
            setAppliedGridStart(y);
            setDraftGridStart(y);
        };

        const runAvailabilitySearch = () => {
            setAppliedFrom(draftFrom);
            setAppliedTo(draftTo);
            setAppliedGridStart(draftGridStart);
        };

        const gridEndIso = gridDayColumns.length ? gridDayColumns[gridDayColumns.length - 1] : appliedGridStart;
        const gridRangeSubtitle =
            gridDayCount === 7
                ? `week starting ${appliedGridStart}`
                : gridDayCount === 1
                  ? `1 day — ${appliedGridStart}`
                  : `${gridDayCount} days — ${appliedGridStart} through ${gridEndIso}`;

        return (
            <div className="h-full rounded-xl border p-6 flex flex-col gap-6 overflow-y-auto" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="flex flex-col items-center text-center shrink-0">
                    <Grid size={40} style={{ color: colors.textMuted }} className="mb-2" />
                    <h3 className="text-xl font-bold" style={{ color: colors.textMain }}>Venue Availability Check</h3>
                </div>

                <div className="flex flex-col gap-4 items-center w-full max-w-2xl mx-auto">
                    <div className="flex flex-wrap gap-4 items-end justify-center w-full">
                        <div>
                            <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: colors.textMuted }}>From date</label>
                            <input
                                type="date"
                                value={draftFrom}
                                onChange={(e) => setDraftFrom(e.target.value)}
                                className="px-3 py-2 rounded-lg border text-sm min-w-[10.5rem]"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: colors.textMuted }}>To date</label>
                            <div className="flex flex-wrap items-end gap-2">
                                <input
                                    type="date"
                                    value={draftTo}
                                    onChange={(e) => setDraftTo(e.target.value)}
                                    className="px-3 py-2 rounded-lg border text-sm min-w-[10.5rem]"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                />
                                <button
                                    type="button"
                                    className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide shrink-0 h-[42px]"
                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                    onClick={runAvailabilitySearch}
                                >
                                    Search
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3 items-end justify-center w-full">
                        <div>
                            <label className="text-[10px] uppercase font-bold block mb-1" style={{ color: colors.textMuted }}>Grid start date</label>
                            <input
                                type="date"
                                value={draftGridStart}
                                onChange={(e) => setDraftGridStart(e.target.value)}
                                className="px-3 py-2 rounded-lg border text-sm min-w-[10.5rem]"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            />
                        </div>
                        <button
                            type="button"
                            className="px-4 py-2 rounded-lg border text-xs font-bold uppercase shrink-0 h-[42px]"
                            style={{ borderColor: colors.border, color: colors.textMain }}
                            onClick={() => setAppliedGridStart(draftGridStart.slice(0, 10))}
                        >
                            Align grid
                        </button>
                    </div>
                </div>

                <div>
                    <p className="text-[10px] uppercase font-bold mb-2" style={{ color: colors.textMuted }}>Summary ({summaryDays.length} day{summaryDays.length === 1 ? '' : 's'}) — last search</p>
                    <p className="text-[11px] mb-3 leading-relaxed" style={{ color: colors.textMuted }}>
                        Range used for venue summary:{' '}
                        <span className="font-mono text-[10px] whitespace-nowrap" style={{ color: colors.textMain }}>{appliedFrom}</span>
                        <span className="mx-1 opacity-60">→</span>
                        <span className="font-mono text-[10px] whitespace-nowrap" style={{ color: colors.textMain }}>{appliedTo}</span>
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 w-full">
                        {(list.length ? list : [{ id: 'none', name: 'No venues configured' }]).map((v: any) => {
                            const nm = v.name || 'Venue';
                            const { label, tone, bookings } = venueRangeSummary(nm, summaryDays);
                            const isBooked = tone === 'booked';
                            const statusColor = isBooked ? (colors.red || '#ef4444') : colors.green;
                            return (
                                <button
                                    key={v.id || nm}
                                    type="button"
                                    disabled={!isBooked || !list.length}
                                    onClick={() => setAvailabilityVenueModal({ venueName: nm, bookings })}
                                    className="p-3 rounded border text-left disabled:cursor-default disabled:opacity-100 hover:bg-white/5 transition-colors"
                                    style={{ borderColor: colors.border }}
                                >
                                    <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>Venue</div>
                                    <div className="font-bold text-sm" style={{ color: colors.textMain }}>{nm}</div>
                                    <div className="mt-1 text-xs font-bold" style={{ color: statusColor }}>
                                        {list.length ? label : 'Set venues in settings'}
                                    </div>
                                    {isBooked && list.length ? (
                                        <div className="text-[10px] mt-1" style={{ color: colors.textMuted }}>
                                            {bookings.length} booking{bookings.length === 1 ? '' : 's'}
                                        </div>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="w-full min-w-0 border rounded-xl overflow-hidden" style={{ borderColor: colors.border }}>
                    <div
                        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:gap-3 px-3 py-2 border-b"
                        style={{ borderColor: colors.border, backgroundColor: colors.bg + '66' }}
                    >
                        <div className="flex justify-start min-w-0">
                            <button
                                type="button"
                                onClick={() => shiftAvailabilityGridStart(-7)}
                                className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg border text-[10px] sm:text-xs font-black uppercase tracking-wide shrink-0 h-[42px]"
                                style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.card }}
                            >
                                <ChevronLeft size={16} strokeWidth={2.5} />
                                <span className="sm:hidden">Prev</span>
                                <span className="hidden sm:inline">Previous week</span>
                            </button>
                        </div>
                        <div className="flex flex-col items-center justify-end min-w-0">
                            <label className="text-[10px] uppercase font-bold block mb-1 text-center w-full" style={{ color: colors.textMuted }}>Days to show</label>
                            <select
                                value={gridDayCount}
                                onChange={(e) => setAvailabilityGridDays(Number(e.target.value))}
                                className="px-3 py-2 rounded-lg border text-xs font-bold min-w-[6.5rem] w-full max-w-[9rem]"
                                style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.textMain }}
                            >
                                {[3, 5, 7, 10, 14, 21, 28, 31].map((n) => (
                                    <option key={n} value={n}>
                                        {n} {n === 1 ? 'day' : 'days'}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex justify-end min-w-0">
                            <button
                                type="button"
                                onClick={() => shiftAvailabilityGridStart(7)}
                                className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg border text-[10px] sm:text-xs font-black uppercase tracking-wide shrink-0 h-[42px]"
                                style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.card }}
                            >
                                <span className="sm:hidden">Next</span>
                                <span className="hidden sm:inline">Next week</span>
                                <ChevronRight size={16} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>
                    <div className="px-3 py-2 border-b text-[10px] font-black uppercase tracking-wider" style={{ borderColor: colors.border, color: colors.textMuted }}>
                        Availability grid — {gridRangeSubtitle} (after Search or Align grid)
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px] border-collapse min-w-[520px]">
                            <thead>
                                <tr style={{ backgroundColor: colors.bg + '80' }}>
                                    <th className="p-2 border-b sticky left-0 z-[1] min-w-[120px]" style={{ borderColor: colors.border, backgroundColor: colors.card }}>Meeting room</th>
                                    {gridDayColumns.map((d) => (
                                        <th key={d} className="p-2 border-b text-center font-mono whitespace-nowrap" style={{ borderColor: colors.border, color: colors.textMuted }}>
                                            {d.slice(5).replace('-', '/')}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(list.length ? list : [{ id: 'none', name: '—' }]).map((v: any) => {
                                    const nm = v.name || 'Venue';
                                    return (
                                        <tr key={v.id || nm}>
                                            <td className="p-2 border-b font-bold sticky left-0 z-[1]" style={{ borderColor: colors.border, backgroundColor: colors.card, color: colors.textMain }}>
                                                {nm}
                                            </td>
                                            {gridDayColumns.map((d) => {
                                                const { tone, booking } = venueBookingLabel(nm, d);
                                                const statusColor = booking ? calendarRequestStatusColor(String(booking.status || ''), colors) : colors.textMuted;
                                                const bg = tone === 'free' ? 'transparent' : `${statusColor}1f`;
                                                const fg = tone === 'free' ? colors.textMuted : colors.textMain;
                                                return (
                                                    <td
                                                        key={d}
                                                        className="p-2 border-b align-top text-center"
                                                        style={{ borderColor: colors.border, backgroundColor: bg, color: fg }}
                                                        title={booking ? `${booking.accountName} • ${booking.status}` : 'Available'}
                                                    >
                                                        {tone === 'free' ? (
                                                            <span className="opacity-50">—</span>
                                                        ) : (
                                                            <div className="flex flex-col gap-0.5">
                                                                {booking ? (
                                                                    <>
                                                                        <span className="text-[9px] leading-tight line-clamp-2 break-words">{booking.accountName}</span>
                                                                        <span className="text-[9px] leading-tight line-clamp-2 break-words font-bold" style={{ color: statusColor }}>{booking.status}</span>
                                                                    </>
                                                                ) : null}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                {availabilityVenueModal ? (
                    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4" onClick={() => setAvailabilityVenueModal(null)}>
                        <div
                            className="w-full max-w-4xl max-h-[80vh] overflow-y-auto rounded-xl border p-4"
                            style={{ backgroundColor: colors.card, borderColor: colors.border, color: colors.textMain }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-black text-sm uppercase tracking-wider">
                                    {availabilityVenueModal.venueName} bookings
                                </h4>
                                <button type="button" onClick={() => setAvailabilityVenueModal(null)} className="px-2 py-1 rounded border text-xs" style={{ borderColor: colors.border }}>
                                    Close
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b" style={{ borderColor: colors.border, color: colors.textMuted }}>
                                            <th className="text-left py-2 pr-2">Account</th>
                                            <th className="text-left py-2 pr-2">Request</th>
                                            <th className="text-left py-2 pr-2">Start</th>
                                            <th className="text-left py-2 pr-2">End</th>
                                            <th className="text-left py-2 pr-2">Session timing</th>
                                            <th className="text-left py-2 pr-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {availabilityVenueModal.bookings.map((b: any, i: number) => (
                                            <tr key={`${b.requestId || 'req'}-${i}`} className="border-b" style={{ borderColor: colors.border }}>
                                                <td className="py-2 pr-2">{b.accountName || '—'}</td>
                                                <td className="py-2 pr-2">{b.requestName || '—'}</td>
                                                <td className="py-2 pr-2">{b.startDate || '—'}</td>
                                                <td className="py-2 pr-2">{b.endDate || '—'}</td>
                                                <td className="py-2 pr-2">{b.sessionTiming || '—'}</td>
                                                <td className="py-2 pr-2">{b.status || '—'}</td>
                                            </tr>
                                        ))}
                                        {availabilityVenueModal.bookings.length === 0 ? (
                                            <tr>
                                                <td className="py-3 opacity-60" colSpan={6}>No bookings in selected range.</td>
                                            </tr>
                                        ) : null}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    if (subView === 'beo') {
        const q = beoSearch.toLowerCase().trim();
        const rowsFiltered = beoCandidates.filter((r: any) => {
            if (!q) return true;
            const blob = `${r.requestName || ''} ${r.account || ''} ${r.confirmationNo || ''}`.toLowerCase();
            return blob.includes(q);
        });
        const beoEventSortKey = (r: any) => {
            const w = getMiceRequestDateWindow(r);
            const iso = String(w.start || '').slice(0, 10);
            if (iso) return iso;
            return String(r.requestDate || r.receivedDate || r.createdAt || '').slice(0, 10) || '1970-01-01';
        };
        const rows = [...rowsFiltered].sort((a, b) => {
            const cmp = beoEventSortKey(a).localeCompare(beoEventSortKey(b));
            return beoSortOrder === 'newest' ? -cmp : cmp;
        });
        const beoModalReq = beoModalRequestId
            ? (sharedRequests || []).find((x: any) => String(x.id) === String(beoModalRequestId)) || null
            : null;
        const beoFinModal = beoModalReq ? calculateAccFinancialsForRequest(beoModalReq, propertyTaxes, beoModalReq.requestType) : null;
        const beoEvModal = beoModalReq ? getEventDateWindow(beoModalReq) : { start: '', end: '' };
        const beoPkgModal = beoModalReq ? formatAgendaPackageSummary(beoModalReq.agenda || []) || beoModalReq.mealPlan || '—' : '—';
        const beoTypeKeyModal = beoModalReq ? normalizeRequestTypeKey(beoModalReq.requestType) : '';
        const beoAccModal = beoModalReq ? getAccountForRequest(beoModalReq, accounts) : null;
        const beoFallbackDaysModal = beoEvModal.start && beoEvModal.end ? inclusiveCalendarDays(beoEvModal.start, beoEvModal.end) : 1;
        const beoDayDenomModal = beoFinModal ? Math.max(1, beoFinModal.totalEventDays || beoFallbackDaysModal) : 1;
        const beoEventCostPerDayModal = beoFinModal ? beoFinModal.eventCostWithTax / beoDayDenomModal : 0;
        const beoScopeGrandModal = beoFinModal
            ? getBeoScopeGrandTotalInclTax(beoFinModal, beoModalReq?.requestType)
            : 0;
        const beoPaidModal = beoFinModal ? Number(beoFinModal.paidAmount || 0) : 0;
        const { remaining: beoRemainingModal, payLabel: beoPayLabelModal } = deriveBeoPaymentView(
            beoPaidModal,
            beoScopeGrandModal
        );

        const saveBeoNotesFromEvents = async () => {
            if (readOnly || !beoModalRequestId || !beoModalReq) return;
            const existing = (sharedRequests || []).find((x: any) => String(x.id) === String(beoModalRequestId));
            if (!existing) return;
            try {
                const res = await fetch(apiUrl('/api/requests'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...existing, beoNotes: beoNotesDraft }),
                });
                if (res.ok) onRefreshRequests?.();
                else alert('Failed to save BEO notes. Status: ' + res.status);
            } catch (e) {
                console.error(e);
                alert('Error saving BEO notes.');
            }
        };

        return (
            <>
                <div className="h-full rounded-xl border p-6 flex flex-col min-h-0" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex flex-wrap justify-between items-start border-b pb-6 mb-6 gap-4" style={{ borderColor: colors.border }}>
                        <div>
                            <h2 className="text-2xl font-bold mb-1" style={{ color: colors.primary }}>Banquet Event Order Management</h2>
                            <p style={{ color: colors.textMuted }}>All active MICE requests (excluding Cancelled / Lost).</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 justify-end">
                            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
                                <button
                                    type="button"
                                    onClick={() => setBeoSortOrder('newest')}
                                    className={`px-3 py-2 text-[10px] font-black uppercase tracking-wide ${beoSortOrder === 'newest' ? '' : 'opacity-60'}`}
                                    style={{
                                        backgroundColor: beoSortOrder === 'newest' ? colors.primary + '35' : 'transparent',
                                        color: colors.textMain,
                                    }}
                                >
                                    Newest
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBeoSortOrder('oldest')}
                                    className={`px-3 py-2 text-[10px] font-black uppercase tracking-wide border-l ${beoSortOrder === 'oldest' ? '' : 'opacity-60'}`}
                                    style={{
                                        borderColor: colors.border,
                                        backgroundColor: beoSortOrder === 'oldest' ? colors.primary + '35' : 'transparent',
                                        color: colors.textMain,
                                    }}
                                >
                                    Oldest
                                </button>
                            </div>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search event..."
                                    value={beoSearch}
                                    onChange={(e) => setBeoSearch(e.target.value)}
                                    className="pl-8 pr-3 py-2 rounded bg-black/20 border text-sm w-64"
                                    style={{ borderColor: colors.border, color: colors.textMain }}
                                />
                                <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: colors.textMuted }} />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3 overflow-y-auto flex-1">
                        {!rows.length ? (
                            <p className="text-sm opacity-50 text-center py-12" style={{ color: colors.textMuted }}>No qualifying events for this property.</p>
                        ) : (
                            rows.map((r: any) => {
                                const agenda = Array.isArray(r.agenda) ? r.agenda : [];
                                const venues = [...new Set(agenda.map((row: any) => String(row?.venue || '').trim()).filter(Boolean))];
                                const venue = venues.length ? venues.join(', ') : '—';
                                const d = formatMiceAgendaDateRange(r);
                                const paxLine = totalMiceRequestPax(r);
                                return (
                                    <div
                                        key={r.id}
                                        className="w-full p-4 rounded border flex items-stretch justify-between gap-3 hover:bg-white/5 transition-colors"
                                        style={{ borderColor: colors.border }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => onOpenRequest?.(r.id)}
                                            className="flex-1 min-w-0 text-left"
                                        >
                                            <h4 className="font-bold" style={{ color: colors.textMain }}>{r.requestName || r.confirmationNo}</h4>
                                            <p className="text-xs" style={{ color: colors.textMuted }}>{d} • {venue} • {paxLine} pax • {r.account || r.accountName}</p>
                                        </button>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <StatusBadge status={String(r.status)} theme={theme} />
                                            <button
                                                type="button"
                                                title="Open BEO"
                                                className="p-2 rounded-lg border hover:bg-white/10 transition-colors"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setBeoModalRequestId(String(r.id));
                                                    setBeoNotesDraft(String(r.beoNotes ?? ''));
                                                }}
                                            >
                                                <FileText size={18} style={{ color: colors.primary }} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {beoModalReq && beoFinModal && (
                    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden />
                        <div
                            className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-200"
                            style={{ backgroundColor: colors.card, borderColor: colors.border }}
                        >
                            <div className="shrink-0 p-4 border-b flex flex-wrap items-center gap-2 justify-between" style={{ borderColor: colors.border }}>
                                <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: colors.textMain }}>Banquet event order (BEO)</h3>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => printBeoDocument(beoModalReq, beoFinModal, beoNotesDraft, accounts, activeProperty)}
                                        className="px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2"
                                        style={{ backgroundColor: colors.primary, color: '#000' }}
                                    >
                                        <Printer size={14} /> Print
                                    </button>
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            onClick={saveBeoNotesFromEvents}
                                            className="px-4 py-2 rounded-xl border font-bold text-xs"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        >
                                            Save notes
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => { setBeoModalRequestId(null); }}
                                        className="p-2 rounded-xl border"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                        aria-label="Close"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 text-left" style={{ color: colors.textMain }}>
                                <div className="border-b pb-4 mb-4 flex flex-wrap items-start justify-between gap-4" style={{ borderColor: colors.border }}>
                                    <div>
                                        <h1 className="text-2xl font-black" style={{ color: colors.textMain }}>BEO — {beoModalReq.confirmationNo}</h1>
                                        <p className="text-sm mt-1 font-bold">{beoModalReq.account}</p>
                                        <p className="text-xs opacity-70 mt-2">Request status: <span className="font-bold">{beoModalReq.status || '—'}</span> · Type: <span className="font-bold">{beoModalReq.requestType || beoTypeKeyModal}</span></p>
                                    </div>
                                    <div className="text-right">
                                        {activeProperty?.logoUrl ? (
                                            <img src={activeProperty.logoUrl} alt="Property logo" className="h-14 ml-auto object-contain max-w-[180px]" />
                                        ) : null}
                                        <p className="text-xs font-bold mt-2" style={{ color: colors.textMain }}>{activeProperty?.name || 'Property'}</p>
                                    </div>
                                </div>
                                <h4 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">Contacts (from account)</h4>
                                <div className="overflow-x-auto mb-6">
                                    <table className="w-full text-xs border-collapse">
                                        <thead>
                                            <tr className="border-b opacity-70" style={{ borderColor: colors.border }}>
                                                <th className="text-left py-2 pr-2 w-10">#</th>
                                                <th className="text-left py-2 pr-2">Name</th>
                                                <th className="text-left py-2 pr-2">Position</th>
                                                <th className="text-left py-2 pr-2">Phone</th>
                                                <th className="text-left py-2">Email</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {!beoAccModal ? (
                                                <tr>
                                                    <td className="py-2 pr-2">1</td>
                                                    <td className="py-2 pr-2 font-bold">Primary Contact</td>
                                                    <td className="py-2 pr-2">—</td>
                                                    <td className="py-2 pr-2">—</td>
                                                    <td className="py-2">—</td>
                                                </tr>
                                            ) : (
                                                (() => {
                                                    const list = (Array.isArray(beoAccModal.contacts) ? beoAccModal.contacts : [])
                                                        .filter((c: any) => contactDisplayName(c) || c?.email || c?.phone || c?.position);
                                                    if (list.length > 0) {
                                                        return list.map((c: any, i: number) => (
                                                            <tr key={i} className="border-b" style={{ borderColor: colors.border }}>
                                                                <td className="py-2 pr-2">{i + 1}</td>
                                                                <td className="py-2 pr-2 font-bold">{contactDisplayName(c) || `Contact ${i + 1}`}</td>
                                                                <td className="py-2 pr-2">{c?.position || '—'}</td>
                                                                <td className="py-2 pr-2">{c?.phone || '—'}</td>
                                                                <td className="py-2">{c?.email || '—'}</td>
                                                            </tr>
                                                        ));
                                                    }
                                                    return (
                                                        <tr>
                                                            <td className="py-2 pr-2">1</td>
                                                            <td className="py-2 pr-2 font-bold">Primary Contact</td>
                                                            <td className="py-2 pr-2">—</td>
                                                            <td className="py-2 pr-2">{beoAccModal?.phone || '—'}</td>
                                                            <td className="py-2">{beoAccModal?.email || '—'}</td>
                                                        </tr>
                                                    );
                                                })()
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-6">
                                    <div><span className="font-bold uppercase text-[10px] opacity-50">Start</span><br />{beoEvModal.start || '—'}</div>
                                    <div><span className="font-bold uppercase text-[10px] opacity-50">End</span><br />{beoEvModal.end || '—'}</div>
                                    <div><span className="font-bold uppercase text-[10px] opacity-50">Package</span><br />{beoPkgModal}</div>
                                    <div><span className="font-bold uppercase text-[10px] opacity-50">Event days</span><br />{beoFinModal.totalEventDays || beoFallbackDaysModal}</div>
                                    <div><span className="font-bold uppercase text-[10px] opacity-50">Total attendees (pax × days)</span><br />{beoFinModal.totalEventAttendeeDays ?? beoFinModal.totalEventPax} <span className="text-[10px] opacity-50">({beoFinModal.totalEventPax} pax)</span></div>
                                    <div><span className="font-bold uppercase text-[10px] opacity-50">DDR (per person)</span><br />{formatMoney(beoFinModal.ddr)}</div>
                                    <div className="md:col-span-2"><span className="font-bold uppercase text-[10px] opacity-50">Event cost per day (incl. tax)</span><br />{formatMoney(beoEventCostPerDayModal)}</div>
                                </div>
                                <h4 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">Agenda</h4>
                                <div className="overflow-x-auto mb-6">
                                    <table className="w-full text-xs border-collapse min-w-[900px]">
                                        <thead>
                                            <tr className="border-b opacity-60" style={{ borderColor: colors.border }}>
                                                <th className="text-left py-2 pr-2">Start</th>
                                                <th className="text-left py-2 pr-2">End</th>
                                                <th className="text-left py-2 pr-2">Session time</th>
                                                <th className="text-left py-2 pr-2">Coffee</th>
                                                <th className="text-left py-2 pr-2">Lunch</th>
                                                <th className="text-left py-2 pr-2">Dinner</th>
                                                <th className="text-left py-2 pr-2">Venue</th>
                                                <th className="text-center py-2">Pax</th>
                                                <th className="text-right py-2">Line</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {!(beoModalReq.agenda || []).length ? (
                                                <tr><td colSpan={9} className="py-4 italic opacity-50">No agenda</td></tr>
                                            ) : (beoModalReq.agenda || []).map((row: any, i: number) => {
                                                const line = (Number(row.rate || 0) * Number(row.pax || 0)) + Number(row.rental || 0);
                                                return (
                                                    <tr key={row.id ?? i} className="border-b align-top" style={{ borderColor: colors.border }}>
                                                        <td className="py-2 pr-2">{row.startDate || '—'}</td>
                                                        <td className="py-2 pr-2">{row.endDate || row.startDate || '—'}</td>
                                                        <td className="py-2 pr-2 whitespace-nowrap">{[row.startTime, row.endTime].filter(Boolean).join(' – ') || '—'}</td>
                                                        <td className="py-2 pr-2 whitespace-nowrap">{formatAgendaRowCoffeeBreak(row) || '—'}</td>
                                                        <td className="py-2 pr-2 whitespace-nowrap">{formatAgendaRowLunch(row) || '—'}</td>
                                                        <td className="py-2 pr-2 whitespace-nowrap">{formatAgendaRowDinner(row) || '—'}</td>
                                                        <td className="py-2 pr-2">{formatAgendaRowVenueDisplay(row) || '—'}</td>
                                                        <td className="text-center py-2">{row.pax ?? '—'}</td>
                                                        <td className="text-right py-2 font-mono font-bold">{line.toLocaleString()}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="text-sm mb-4 space-y-1 p-4 rounded-xl border" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                                    <p><span className="font-bold">Event total (incl. tax):</span> {formatMoney(beoScopeGrandModal)}</p>
                                </div>
                                <div className="p-4 rounded-xl border mb-4 space-y-2" style={{ borderColor: colors.primary + '40', backgroundColor: colors.primary + '08' }}>
                                    <h4 className="text-xs font-black uppercase tracking-widest opacity-70">Payment</h4>
                                    <p className="text-sm"><span className="font-bold">Status:</span> {beoPayLabelModal}</p>
                                    <p className="text-sm"><span className="font-bold">Amount paid:</span> {formatMoney(beoPaidModal)}</p>
                                    <p className="text-sm"><span className="font-bold">Remaining balance:</span> {formatMoney(beoRemainingModal)}</p>
                                </div>
                                <div className="mb-4">
                                    <label className="text-[10px] font-black uppercase opacity-50">Special requests (from request)</label>
                                    <div
                                        className="w-full mt-1 px-3 py-2 rounded-xl border min-h-[72px] text-sm whitespace-pre-wrap"
                                        style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg + '80' }}
                                    >
                                        {formatBeoSpecialRequestsCombined(beoModalReq) || '—'}
                                    </div>
                                </div>
                                <div className="mb-2">
                                    <label className="text-[10px] font-black uppercase opacity-50">Operations notes (BEO)</label>
                                    <textarea
                                        value={beoNotesDraft}
                                        onChange={(e) => setBeoNotesDraft(e.target.value)}
                                        disabled={readOnly}
                                        className="w-full mt-1 px-3 py-2 rounded-xl border min-h-[100px] text-sm disabled:opacity-50"
                                        style={{ borderColor: colors.border, color: colors.textMain, backgroundColor: colors.bg }}
                                        placeholder="Banquet / ops notes…"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }



    // 2. Accounts Performance View (Event + Event with rooms only, current filter range)
    if (subView === 'performance') {
        const top = performanceRows[0];
        const repeatClients = performanceRows.filter((a) => a.events > 1).length;
        const repeatPct = performanceRows.length ? Math.round((repeatClients / performanceRows.length) * 100) : 0;
        return (
            <div className="h-full flex flex-col gap-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KPICard
                        label="Top Account (value)"
                        value={top ? top.spent : '—'}
                        subtext={top?.name || 'No MICE requests'}
                        icon={Crown}
                        isPrimary
                        theme={theme}
                    />
                    <KPICard label="Avg Event Value" value={avgEventValueKpi} subtext="In filtered period" icon={TrendingUp} colorKey="green" theme={theme} />
                    <KPICard label="Accounts w/ 2+ events" value={`${repeatPct}%`} subtext={`${repeatClients} of ${performanceRows.length}`} icon={Users} colorKey="blue" theme={theme} />
                    <KPICard label="Pipeline Value" value={pipelineValueKpi} subtext="Open pipeline (est.)" icon={DollarSign} colorKey="yellow" theme={theme} />
                </div>
                <div className="flex-1 rounded-xl border p-5 flex flex-col min-h-0" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Account Performance Details</h3>

                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 opacity-40" size={14} style={{ color: colors.textMain }} />
                            <input
                                type="text"
                                placeholder="Search account name..."
                                value={accountSearch}
                                onChange={(e) => setAccountSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 rounded-lg border text-xs focus:ring-1 transition-all outline-none"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                            />
                        </div>
                    </div>

                    <div className="overflow-auto flex-1 scrollbar-thin">
                        {!performanceRows.length ? (
                            <p className="text-sm text-center py-12 opacity-50" style={{ color: colors.textMuted }}>No event requests in this period for the active property.</p>
                        ) : (
                            <table className="w-full text-left border-separate border-spacing-y-2">
                                <thead className="text-[10px] uppercase font-bold sticky top-0 z-10" style={{ backgroundColor: colors.card, color: colors.textMuted }}>
                                    <tr>
                                        <th className="pb-3 pl-4">Account Name</th>
                                        <th className="pb-3 text-right">Events Held</th>
                                        <th className="pb-3 text-right">Total Spent</th>
                                        <th className="pb-3 pr-4 text-right">Pax (× days)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {performanceRows
                                        .filter((a) => a.name.toLowerCase().includes(accountSearch.toLowerCase()))
                                        .map((acc) => (
                                            <React.Fragment key={acc.name}>
                                                <tr
                                                    onClick={() => toggleAccountExpansion(acc.name)}
                                                    className="group cursor-pointer hover:translate-x-1 transition-transform"
                                                    style={{ backgroundColor: colors.bg }}
                                                >
                                                    <td className="py-4 pl-4 rounded-l-xl font-bold flex items-center gap-2" style={{ color: colors.textMain }}>
                                                        <ChevronDown size={14} className={`transition-transform duration-300 ${expandedAccounts.includes(acc.name) ? 'rotate-180' : ''}`} style={{ color: colors.primary }} />
                                                        {acc.name}
                                                    </td>
                                                    <td className="py-4 text-right font-mono text-xs" style={{ color: colors.textMuted }}>{acc.events}</td>
                                                    <td className="py-4 text-right font-mono font-bold text-xs" style={{ color: colors.primary }}>{acc.spent}</td>
                                                    <td className="py-4 pr-4 rounded-r-xl text-right font-mono text-xs" style={{ color: colors.textMuted }}>{acc.pax}</td>
                                                </tr>

                                                {expandedAccounts.includes(acc.name) && (
                                                    <tr>
                                                        <td colSpan={4} className="p-0">
                                                            <div className="mx-4 mb-4 rounded-xl border overflow-hidden animate-in slide-in-from-top-2 duration-300 shadow-inner"
                                                                style={{ backgroundColor: 'rgba(0,0,0,0.05)', borderColor: colors.border }}>
                                                                <table className="w-full text-[10px]">
                                                                    <thead className="opacity-60" style={{ color: colors.textMuted }}>
                                                                        <tr className="border-b" style={{ borderColor: colors.border }}>
                                                                            <th className="px-4 py-2 font-medium">Dates</th>
                                                                            <th className="px-4 py-2 font-medium">Event Title</th>
                                                                            <th className="px-4 py-2 text-right font-medium">Pax (× days)</th>
                                                                            <th className="pl-5 pr-4 py-2 text-right font-medium">Value</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {acc.details.map((detail, di) => (
                                                                            <tr key={di} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                                                                                <td className="px-4 py-2 opacity-70 text-[10px] whitespace-nowrap max-w-[10rem] truncate" style={{ color: colors.textMain }} title={detail.date}>{detail.date}</td>
                                                                                <td className="px-4 py-2 font-medium" style={{ color: colors.textMain }}>{detail.title}</td>
                                                                                <td className="px-4 py-2 text-right opacity-70" style={{ color: colors.textMain }}>{detail.pax}</td>
                                                                                <td className="pl-5 pr-4 py-2 text-right font-bold tabular-nums" style={{ color: colors.green }}>{detail.value}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // 3. Analytics & Requests View
    if (subView === 'analytics') {
        const barData = venueBarData.length ? venueBarData : [{ name: 'No agenda venues yet', value: 0 }];
        const piePalette = [colors.blue, colors.orange];
        return (
            <div className="h-full flex flex-col gap-4 min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[280px] shrink-0">
                    <div className="rounded-xl border p-4 flex flex-col min-h-[260px]" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: colors.textMuted }}>Agenda venues (frequency)</h3>
                        <div className="flex-1 min-h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart layout="vertical" data={barData} margin={{ top: 0, right: 30, left: 8, bottom: 5 }}>
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={120} axisLine={false} tickLine={false} tick={{ fill: colors.textMuted, fontSize: 9 }} />
                                    <Tooltip cursor={{ fill: 'transparent' }} {...rechartsTooltipThemeProps(colors)} />
                                    <Bar dataKey="value" fill={colors.purple} barSize={18} radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="rounded-xl border p-4 flex flex-col min-h-[260px]" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: colors.textMuted }}>Request type mix</h3>
                        <div className="flex-1 min-h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={typePieData} cx="50%" cy="50%" innerRadius={40} outerRadius={72} paddingAngle={4} dataKey="value">
                                        {typePieData.map((_, i) => (
                                            <Cell key={i} fill={piePalette[i % piePalette.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip {...rechartsTooltipThemeProps(colors)} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', color: colors.textMuted }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-h-0 rounded-xl border p-4 flex flex-col" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>MICE requests (filtered period)</h3>
                        <div className="flex gap-2 opacity-40">
                            <Filter size={14} style={{ color: colors.textMuted }} />
                            <Download size={14} style={{ color: colors.textMuted }} />
                        </div>
                    </div>
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-left text-xs">
                            <thead className="uppercase font-bold border-b sticky top-0 z-10" style={{ borderColor: colors.border, color: colors.textMuted, backgroundColor: colors.bg }}>
                                <tr>
                                    <th className="pb-2">Client / Event Name</th>
                                    <th className="pb-2">Dates</th>
                                    <th className="pb-2">Venue</th>
                                    <th className="pb-2 text-center">Pax (× days)</th>
                                    <th className="pb-2 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y" style={{ borderColor: colors.border }}>
                                {miceRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center opacity-50" style={{ color: colors.textMuted }}>No rows</td>
                                    </tr>
                                ) : (
                                    miceRequests.map((req: any) => {
                                        const agenda = Array.isArray(req.agenda) ? req.agenda : [];
                                        const venues = [...new Set(agenda.map((row: any) => String(row?.venue || '').trim()).filter(Boolean))];
                                        const venue = venues.length ? venues.join(', ') : '—';
                                        const d = formatMiceAgendaDateRange(req);
                                        const pax = totalMiceRequestAttendeeDays(req);
                                        return (
                                            <tr key={req.id} className="hover:bg-white/5 transition-colors">
                                                <td className="py-2.5">
                                                    <div className="font-bold" style={{ color: colors.textMain }}>{req.requestName || req.confirmationNo}</div>
                                                    <div className="text-[10px]" style={{ color: colors.textMuted }}>{req.account || req.accountName}</div>
                                                </td>
                                                <td className="py-2.5 text-[11px] whitespace-nowrap max-w-[11rem] truncate" style={{ color: colors.textMuted }} title={d}>{d}</td>
                                                <td className="py-2.5 text-[11px] max-w-[10rem] truncate" style={{ color: colors.textMuted }} title={venue}>{venue}</td>
                                                <td className="py-2.5 text-center font-mono" style={{ color: colors.textMain }}>{pax}</td>
                                                <td className="py-2.5 text-right"><StatusBadge status={String(req.status || 'Inquiry')} theme={theme} /></td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    // Default: Kanban Pipeline (Kanban Icon)
    return (
        <div className="flex flex-col h-full min-h-0 gap-4">
            {/* KPI Header */}
            <div className="flex items-center justify-between px-1">
                <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>Dates</h3>
                <div className="text-[10px] font-bold truncate max-w-[min(100%,14rem)] text-right" style={{ color: colors.primary }} title={`${filterRange.start} – ${filterRange.end}`}>
                    {filterRange.start && filterRange.end ? `${filterRange.start} - ${filterRange.end}` : 'All dates'}
                </div>
            </div>

            {/* Event KPIs */}
            <div className="grid grid-cols-3 gap-4 shrink-0">
                <KPICard label="Total Event Revenue" value={totalRevenue} subtext="In The Selected Period" icon={DollarSign} isPrimary theme={theme} />
                <KPICard label="Total Attendance" value={totalAttendance} subtext="In The Selected Period" icon={Users} colorKey="blue" theme={theme} />
                <KPICard label="Number of Events" value={numEventsLabel} subtext="In The Selected Period" icon={CalendarDays} colorKey="orange" theme={theme} />
            </div>

            <div className="shrink-0 flex items-center justify-end gap-1 px-1">
                <button
                    type="button"
                    aria-label="Scroll columns left"
                    className="p-1.5 rounded-lg border transition-colors hover:bg-white/10"
                    style={{ borderColor: colors.border, color: colors.textMain }}
                    onClick={() => {
                        const el = eventsKanbanScrollRef.current;
                        if (!el) return;
                        el.scrollBy({ left: -Math.max(280, Math.floor(el.clientWidth * 0.55)), behavior: 'smooth' });
                    }}
                >
                    <ChevronLeft size={18} />
                </button>
                <button
                    type="button"
                    aria-label="Scroll columns right"
                    className="p-1.5 rounded-lg border transition-colors hover:bg-white/10"
                    style={{ borderColor: colors.border, color: colors.textMain }}
                    onClick={() => {
                        const el = eventsKanbanScrollRef.current;
                        if (!el) return;
                        el.scrollBy({ left: Math.max(280, Math.floor(el.clientWidth * 0.55)), behavior: 'smooth' });
                    }}
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            {/* Kanban Board */}
            <div ref={eventsKanbanScrollRef} className="flex-1 min-h-0 flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
                {columns.map(col => (
                    <div
                        key={col.id}
                        className="flex flex-col h-full min-w-[300px] rounded-xl border overflow-hidden transition-colors shrink-0"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, col.id)}
                    >
                        {/* Column Header */}
                        <div className="p-3 border-b border-t-[6px]" style={{ borderColor: colors.border, borderTopColor: col.color, backgroundColor: colors.bg }}>
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: col.color }}>{col.title}</h3>
                                    <p className="text-[9px] font-mono font-bold mt-0.5" style={{ color: col.color, opacity: 0.8 }}>{getColumnTotal(col.id)}</p>
                                </div>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10" style={{ color: colors.textMuted }}>
                                    {kanbanData[col.id]?.length || 0}
                                </span>
                            </div>
                        </div>

                        {/* Cards Container — min height keeps empty columns sized for ~4 cards after main scroll layout */}
                        <div className="flex-1 min-h-[34rem] p-2 space-y-2 overflow-y-auto">
                            {kanbanData[col.id]?.map((event: any) => (
                                <div
                                    key={String(event.requestId ?? event.id)}
                                    draggable={!readOnly}
                                    onDragStart={(e) => !readOnly && handleDragStart(e, event, col.id)}
                                    className={`p-3 rounded-lg border hover:shadow-lg transition-all hover:translate-y-[-2px] group ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'}`}
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: col.color + '40', color: col.color, backgroundColor: col.color + '10' }}>
                                            {event.type}
                                        </span>
                                        {!readOnly && onOpenRequestOpts ? (
                                            <button
                                                type="button"
                                                title="Request options (same as Requests OPTS)"
                                                className="opacity-70 hover:opacity-100 transition-opacity p-0.5 rounded-md hover:bg-white/10"
                                                style={{ color: colors.textMuted }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const rid = event.requestId ?? event.id;
                                                    if (rid) onOpenRequestOpts(String(rid));
                                                }}
                                            >
                                                <MoreHorizontal size={14} />
                                            </button>
                                        ) : null}
                                    </div>
                                    <h4 className="font-bold text-sm mb-1 leading-snug" style={{ color: colors.textMain }}>{event.title}</h4>
                                    <p className="text-xs mb-3" style={{ color: colors.textMuted }}>{event.client}</p>

                                    <div className="flex items-center justify-between text-[10px]" style={{ color: colors.textMuted }}>
                                        <div className="flex items-center gap-1">
                                            <Users size={12} /> {event.pax}
                                        </div>
                                        <div className="font-mono font-bold" style={{ color: colors.green }}>
                                            {formatMoneyCompact(parseValue(event.budget))}
                                        </div>
                                    </div>
                                    <div className="mt-2 text-[10px] flex items-center gap-1 min-w-0" style={{ color: colors.textMuted }} title={event.date}>
                                        <Calendar size={10} className="shrink-0" />
                                        <span className="truncate">{event.date}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
