import React, { useEffect, useMemo, useState } from 'react';
import {
    BarChart3,
    Download,
    FileText,
    FileSpreadsheet,
    FileDown,
    RefreshCw,
    Eye,
    Trash2,
    Edit,
    Briefcase,
    Wine,
    BedDouble,
    Users,
    PhoneCall,
    LineChart,
    Layers,
} from 'lucide-react';
import { apiUrl } from './backendApi';
import { beginPropertyLoad, isPropertyLoadCurrent } from './propertyScopedLoad';
import { requestInProperty } from './userProfileMetrics';
import { normalizeRequestTypeKey } from './requestTypeUtils';
import { filterRequestsForAccount, computeAccountMetrics, flattenCrmLeads } from './accountProfileData';
import { formatCompactCurrency } from './formatCompactCurrency';
import { convertCurrencyToSar, convertSarToCurrency, formatCurrencyAmount, type CurrencyCode } from './currency';
import { useCurrencyFormatters } from './useCurrencyFormatters';
import { canReportsPreviewSourceRows, canReportsUseDataSource } from './userPermissions';
import { paymentsMeetOrExceedTotal } from './beoShared';
import {
    buildYearOptionsForReports,
    buildFullVsLyMatrix,
    buildVsLyMatrix,
    defaultVsReportYear,
    exportVsLyMatrixCsv,
    exportVsLyMatrixExcelHtml,
    type VsLyMatrixRow,
} from './reportsVsLastYear';
import { resolveAccountTypesForProperty, resolveSegmentsForProperty } from './propertyTaxonomy';
import {
    buildReportSegmentsForRequest,
    computeRequestRevenueBreakdownNoTax,
    inDateRangeYMD,
    segmentLineTotalExTax,
    requestOperationalDatesOverlapRange,
    type ReportSegment,
} from './operationalSegmentRevenue';

interface ReportsProps {
    theme: any;
    activeProperty?: any;
    /** Loaded from `/api/taxes` in AS; preferred over `activeProperty.taxes` for with-tax totals */
    propertyTaxes?: any[];
    sharedRequests?: any[];
    accounts?: any[];
    crmLeads?: Record<string, any[]>;
    tasks?: any[];
    currency?: CurrencyCode;
    currentUser?: any;
}

const initialSavedReports: any[] = [];

type ReportEntity =
    | 'Requests'
    | 'Accounts'
    | 'MICE'
    | 'Tasks'
    | 'Sales Calls'
    | 'Rooms vs LY'
    | 'MICE vs LY'
    | 'Full Report'
    | 'Promotions';

function requestTypeLabel(raw: string = '') {
    const k = normalizeRequestTypeKey(raw);
    if (k === 'event') return 'Event only';
    if (k === 'event_rooms') return 'Event with rooms';
    if (k === 'series') return 'Series group';
    return 'Accommodation';
}

function requestPrimaryDate(r: any): string {
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    for (const row of agenda) {
        const d = String(row?.startDate || '').trim().slice(0, 10);
        if (d) return d;
    }
    const d = r.checkIn || r.eventStart || r.eventEnd || r.checkOut;
    return String(d || '').slice(0, 10);
}

function asNumberReport(v: any): number {
    return parseFloat(String(v ?? 0).replace(/,/g, '')) || 0;
}

function requestTotalValue(r: any): number {
    const br = computeRequestRevenueBreakdownNoTax(r);
    return br.roomsRevenue + br.eventRevenue;
}

function isEventOrEventRoomsType(r: any): boolean {
    const k = normalizeRequestTypeKey(r?.requestType);
    return k === 'event' || k === 'event_rooms';
}

function matchesStatusFilter(selected: string[], rawStatus: string): boolean {
    if (!selected.length) return true;
    const r = String(rawStatus || '').trim().toLowerCase();
    return selected.some((s) => {
        const sl = s.toLowerCase();
        if (sl === 'inquiry' && (r === 'draft' || r === 'inquiry')) return true;
        return sl === r;
    });
}

/** Apply property tax rules to a slice of no-tax line amounts (same as dashboard AS.tsx). */
function lineAmountsExTaxToWithTax(
    roomsEx: number,
    eventEx: number,
    transEx: number,
    taxes: { rate?: number; scope?: { accommodation?: boolean; events?: boolean; foodAndBeverage?: boolean; transport?: boolean } }[]
): number {
    if (!Array.isArray(taxes) || !taxes.length) {
        return Math.max(0, roomsEx) + Math.max(0, eventEx) + Math.max(0, transEx);
    }
    let roomsTax = 0;
    let eventTax = 0;
    let transTax = 0;
    for (const tax of taxes) {
        const tr = Number(tax?.rate || 0) / 100;
        if (tax?.scope?.accommodation) roomsTax += tr;
        if (tax?.scope?.events || tax?.scope?.foodAndBeverage) eventTax += tr;
        if (tax?.scope?.transport) transTax += tr;
    }
    return (
        Math.max(0, roomsEx) * (1 + roomsTax) +
        Math.max(0, eventEx) * (1 + eventTax) +
        Math.max(0, transEx) * (1 + transTax)
    );
}

function defaultMonthRange() {
    const today = new Date();
    const y = today.getFullYear();
    const mo = today.getMonth();
    const start = `${y}-${String(mo + 1).padStart(2, '0')}-01`;
    const last = new Date(y, mo + 1, 0).getDate();
    const end = `${y}-${String(mo + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { start, end };
}

function formatSar(n: number, currency: CurrencyCode): string {
    return formatCurrencyAmount(Number(n) || 0, currency, { maximumFractionDigits: 2 });
}

function pctGrowth(current: number, previous: number): string {
    const c = Number(current) || 0;
    const p = Number(previous) || 0;
    if (p <= 0) return c > 0 ? '+100.0%' : '0.0%';
    const pct = ((c - p) / p) * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
}

function parsePeriodCode(raw: any): number {
    const s = String(raw || '').trim().slice(0, 10);
    if (!s) return 0;
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) {
        const y = Number(ymd[1]) || 0;
        const m = Number(ymd[2]) || 0;
        return y > 0 && m >= 1 && m <= 12 ? y * 100 + m : 0;
    }
    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) return 0;
    return dt.getFullYear() * 100 + (dt.getMonth() + 1);
}

function requestPeriodCodeForReports(req: any): number {
    const roomCode = parsePeriodCode(req?.checkIn);
    if (roomCode > 0) return roomCode;
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    let earliestAgendaCode = 0;
    for (const row of agenda) {
        const code = parsePeriodCode(row?.startDate);
        if (!code) continue;
        if (!earliestAgendaCode || code < earliestAgendaCode) earliestAgendaCode = code;
    }
    if (earliestAgendaCode > 0) return earliestAgendaCode;
    return parsePeriodCode(req?.eventStart) || parsePeriodCode(req?.eventEnd) || 0;
}

function csvEscape(v: any): string {
    const s = String(v ?? '');
    return `"${s.replace(/"/g, '""')}"`;
}

function triggerDownload(content: BlobPart, fileName: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export default function Reports({
    theme,
    activeProperty,
    propertyTaxes: propertyTaxesFromApi = [],
    sharedRequests = [],
    accounts = [],
    crmLeads = {},
    tasks = [],
    currency = 'SAR',
    currentUser,
}: ReportsProps) {
    const colors = theme.colors;
    const { selectedCurrency } = useCurrencyFormatters(currency);
    const month = defaultMonthRange();
    const [currentView, setCurrentView] = useState<'builder' | 'saved'>('builder');
    const [selectedEntity, setSelectedEntity] = useState<ReportEntity>('Requests');
    const [filters, setFilters] = useState<any>({
        dateRange: { start: month.start, end: month.end },
        statuses: [] as string[],
        valueRange: { min: 0, max: 500_000_000 },
        vsFromYear: new Date().getFullYear(),
        vsFromMonth: 1,
        vsToYear: new Date().getFullYear(),
        vsToMonth: 12,
        /** Rooms / MICE vs LY: show request-segment and/or account-type breakdown rows */
        vsLyByRequestSegment: true,
        vsLyByAccountType: true,
        promotionsYear: new Date().getFullYear(),
        promotionsSelectedIds: [] as string[],
        promotionsFromYear: new Date().getFullYear(),
        promotionsFromMonth: 1,
        promotionsToYear: new Date().getFullYear(),
        promotionsToMonth: 12,
        accountTypes: [] as string[],
    });
    const [selectedColumns, setSelectedColumns] = useState<string[]>([
        'Request ID', 'Line', 'Client', 'Request Type', 'Date', 'Status', 'Payment Status', 'Paid Amount', 'Unpaid Amount', 'Amount',
    ]);
    const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
    const [showPreview, setShowPreview] = useState(false);
    const [savedReports] = useState(initialSavedReports);
    /** Vs LY: row id or segmentGroupKey to exclude from preview + export (unchecked in Columns) */
    const [vsLyRowHidden, setVsLyRowHidden] = useState<Set<string>>(() => new Set());
    const [promotionsData, setPromotionsData] = useState<any[]>([]);

    const pid = activeProperty?.id;

    const propertyRequestSegments = useMemo(
        () => resolveSegmentsForProperty(String(pid || ''), activeProperty),
        [pid, activeProperty]
    );
    const propertyAccountTypes = useMemo(
        () => resolveAccountTypesForProperty(String(pid || ''), activeProperty),
        [pid, activeProperty]
    );
    const accountTypeFilterOptions = useMemo(() => {
        const fromAccounts = (accounts || [])
            .map((a: any) => String(a?.type || '').trim())
            .filter(Boolean);
        return [...new Set([...(propertyAccountTypes || []), ...fromAccounts])].sort((a, b) => a.localeCompare(b));
    }, [accounts, propertyAccountTypes]);
    const propertyTaxes = useMemo(() => {
        const fromApi = Array.isArray(propertyTaxesFromApi) ? propertyTaxesFromApi : [];
        if (fromApi.length) {
            return fromApi as { rate?: number; scope?: { accommodation?: boolean; events?: boolean; foodAndBeverage?: boolean; transport?: boolean } }[];
        }
        return (Array.isArray(activeProperty?.taxes) ? activeProperty.taxes : []) as { rate?: number; scope?: { accommodation?: boolean; events?: boolean; foodAndBeverage?: boolean; transport?: boolean } }[];
    }, [propertyTaxesFromApi, activeProperty]);

    const scopedRequests = useMemo(() => {
        if (!pid) return [];
        return (sharedRequests || []).filter((r: any) => requestInProperty(r, String(pid)));
    }, [sharedRequests, pid]);

    const scopedTasks = useMemo(() => {
        return (tasks || []).filter(
            (t: any) => !pid || !t.propertyId || String(t.propertyId) === String(pid)
        );
    }, [tasks, pid]);

    const scopedSalesCalls = useMemo(() => {
        const flat = flattenCrmLeads(crmLeads || {});
        return flat.filter((call: any) => {
            if (!pid) return true;
            if (call?.propertyId && String(call.propertyId) === String(pid)) return true;
            const aid = String(call?.accountId || '').trim();
            const acc = aid ? (accounts || []).find((a: any) => String(a?.id || '') === aid) : null;
            if (acc?.propertyId && String(acc.propertyId) === String(pid)) return true;
            return false;
        });
    }, [crmLeads, accounts, pid]);

    useEffect(() => {
        let cancelled = false;
        const propertyId = String(pid || '').trim();
        setPromotionsData([]);
        const gate = { current: '' };
        if (!beginPropertyLoad(gate, propertyId)) return;
        fetch(apiUrl(`/api/promotions?propertyId=${encodeURIComponent(propertyId)}`))
            .then((res) => (res.ok ? res.json() : []))
            .then((rows) => {
                if (cancelled || !isPropertyLoadCurrent(gate, propertyId)) return;
                setPromotionsData(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (!cancelled && isPropertyLoadCurrent(gate, propertyId)) setPromotionsData([]);
            });
        return () => {
            cancelled = true;
        };
    }, [pid]);

    const entities = [
        { id: 'Requests' as ReportEntity, icon: BedDouble, label: 'Requests' },
        { id: 'Accounts' as ReportEntity, icon: Briefcase, label: 'Accounts' },
        { id: 'MICE' as ReportEntity, icon: Wine, label: 'MICE' },
        { id: 'Rooms vs LY' as ReportEntity, icon: LineChart, label: 'Rooms vs LY' },
        { id: 'MICE vs LY' as ReportEntity, icon: BarChart3, label: 'MICE vs LY' },
        { id: 'Full Report' as ReportEntity, icon: Layers, label: 'Full Report' },
        { id: 'Promotions' as ReportEntity, icon: Layers, label: 'Promotions' },
        { id: 'Tasks' as ReportEntity, icon: Users, label: 'Tasks' },
        { id: 'Sales Calls' as ReportEntity, icon: PhoneCall, label: 'Sales Calls' },
    ];

    const isVsLySource =
        selectedEntity === 'Rooms vs LY' || selectedEntity === 'MICE vs LY' || selectedEntity === 'Full Report';

    useEffect(() => {
        setVsLyRowHidden(new Set());
    }, [selectedEntity, filters.vsFromYear, filters.vsFromMonth, filters.vsToYear, filters.vsToMonth]);
    const canUseSelectedSource = canReportsUseDataSource(currentUser, selectedEntity);
    const canPreviewRows = canReportsPreviewSourceRows(currentUser);

    const availableColumns: Record<ReportEntity, string[]> = {
        Requests: [
            'Request ID',
            'Line',
            'Client',
            'Request Type',
            'Date',
            'Status',
            'Payment Status',
            'Nights',
            'Room Nights',
            'PAX',
            'DDR',
            'AVG ADR',
            'Paid Amount',
            'Unpaid Amount',
            'Event Revenue',
            'Rooms Revenue',
            'Rooms + Event',
            'Total (ex. tax)',
            'Total (incl. tax)',
            'Amount',
        ],
        Accounts: [
            'ID',
            'Name',
            'Account Type',
            'Contact Person',
            'Contact Position',
            'Contact Email',
            'Contact Phone',
            'Total Bookings',
            'Total Revenue',
        ],
        MICE: [
            'Request ID',
            'Line',
            'Client',
            'Request Type',
            'Segment date',
            'Agenda start',
            'Agenda end',
            'Agenda days',
            'Status',
            'Payment Status',
            'PAX',
            'DDR',
            'Event Revenue',
            'Rooms Revenue',
            'Paid Amount',
            'Unpaid Amount',
            'Total (ex. tax)',
            'Total (incl. tax)',
            'Amount',
        ],
        Tasks: ['ID', 'Task', 'Client', 'Due Date', 'Priority', 'Assignee'],
        'Sales Calls': [
            'ID',
            'Date',
            'Location',
            'Address',
            'Name',
            'Position',
            'Contact email',
            'Contact phone',
            'Subject',
            'Company',
            'Stage',
            'Outcome',
            'Follow-up',
            'Next Step',
            'Expected Revenue',
            'Owner',
        ],
        'Rooms vs LY': [],
        'MICE vs LY': [],
        'Full Report': [],
        Promotions: [
            'Promotion',
            'Row',
            'Status Breakdown',
            'YTD Requests',
            'YTD Amount',
            'YTD LM %',
        ],
    };

    useEffect(() => {
        const firstAllowed = entities.find((e) => canReportsUseDataSource(currentUser, e.id));
        if (!firstAllowed) return;
        if (!canReportsUseDataSource(currentUser, selectedEntity)) {
            setSelectedEntity(firstAllowed.id);
            setSelectedColumns([...(availableColumns[firstAllowed.id] || [])]);
            setShowPreview(false);
        }
    }, [currentUser, selectedEntity]);

    const yearOptionsForVs = useMemo(() => buildYearOptionsForReports(scopedRequests), [scopedRequests]);

    useEffect(() => {
        if (!isVsLySource) return;
        if (!yearOptionsForVs.length) return;
        const fromY = Number(filters.vsFromYear);
        const toY = Number(filters.vsToYear);
        const fallback = defaultVsReportYear(yearOptionsForVs);
        if (!yearOptionsForVs.includes(fromY) || !yearOptionsForVs.includes(toY)) {
            setFilters((f: any) => ({
                ...f,
                vsFromYear: yearOptionsForVs.includes(fromY) ? fromY : fallback,
                vsToYear: yearOptionsForVs.includes(toY) ? toY : fallback,
            }));
        }
    }, [isVsLySource, yearOptionsForVs, filters.vsFromYear, filters.vsToYear]);

    const statusOptions = selectedEntity === 'Sales Calls'
        ? ['Upcoming Sales Calls', 'Waiting list', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'Not Interested']
        : ['Inquiry', 'Accepted', 'Tentative', 'Definite', 'Actual', 'Cancelled'];

    const handleEntityChange = (entity: ReportEntity) => {
        setSelectedEntity(entity);
        setSelectedColumns([...(availableColumns[entity] || [])]);
        setShowPreview(false);
    };

    const toggleColumn = (column: string) => {
        if (selectedColumns.includes(column)) {
            setSelectedColumns(selectedColumns.filter((c) => c !== column));
        } else {
            setSelectedColumns([...selectedColumns, column]);
        }
    };

    const toggleStatus = (status: string) => {
        if (filters.statuses.includes(status)) {
            setFilters({ ...filters, statuses: filters.statuses.filter((s: string) => s !== status) });
        } else {
            setFilters({ ...filters, statuses: [...filters.statuses, status] });
        }
    };

    const toggleArrayFilter = (key: 'accountTypes', value: string) => {
        const curr = Array.isArray(filters[key]) ? filters[key] : [];
        if (curr.includes(value)) {
            setFilters({ ...filters, [key]: curr.filter((x: string) => x !== value) });
        } else {
            setFilters({ ...filters, [key]: [...curr, value] });
        }
    };

    const handleGeneratePreview = () => {
        setShowPreview(true);
    };

    const reportPack = useMemo(() => {
        if (selectedEntity === 'Promotions') {
            const fromYear = Number(filters.promotionsFromYear) || new Date().getFullYear();
            const fromMonth = Math.min(12, Math.max(1, Number(filters.promotionsFromMonth) || 1));
            const toYear = Number(filters.promotionsToYear) || fromYear;
            const toMonth = Math.min(12, Math.max(1, Number(filters.promotionsToMonth) || 12));
            const fromCode = fromYear * 100 + fromMonth;
            const toCode = toYear * 100 + toMonth;
            const startCode = Math.min(fromCode, toCode);
            const endCode = Math.max(fromCode, toCode);
            const monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const periods: { key: string; label: string; year: number; month: number }[] = [];
            for (let y = Math.floor(startCode / 100); y <= Math.floor(endCode / 100); y++) {
                const mStart = y === Math.floor(startCode / 100) ? startCode % 100 : 1;
                const mEnd = y === Math.floor(endCode / 100) ? endCode % 100 : 12;
                for (let m = mStart; m <= mEnd; m++) {
                    periods.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `${monthName[m - 1]} ${y}`, year: y, month: m });
                }
            }
            const first = periods[0] || { year: fromYear, month: fromMonth };
            const last = periods[periods.length - 1] || { year: toYear, month: toMonth };
            const yearStart = `${first.year}-${String(first.month).padStart(2, '0')}-01`;
            const endDay = new Date(last.year, last.month, 0).getDate();
            const yearEnd = `${last.year}-${String(last.month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
            const selectedIds = Array.isArray(filters.promotionsSelectedIds) ? filters.promotionsSelectedIds : [];
            const includedPromotions = (promotionsData || []).filter((p: any) => !selectedIds.length || selectedIds.includes(String(p?.id || '')));
            const overlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) => !!aStart && !!aEnd && !!bStart && !!bEnd && !(aEnd < bStart || bEnd < aStart);
            const reqWindow = (req: any) => {
                const start = String(req?.eventStart || req?.checkIn || req?.requestDate || req?.receivedDate || '').slice(0, 10);
                const end = String(req?.eventEnd || req?.checkOut || start).slice(0, 10);
                return { start, end: end || start };
            };
            const periodCodeFromIso = (iso: string) => {
                const y = Number(String(iso || '').slice(0, 4)) || 0;
                const m = Number(String(iso || '').slice(5, 7)) || 0;
                return y > 0 && m > 0 ? y * 100 + m : 0;
            };
            const scopedReqs = (scopedRequests || []).filter((r: any) => {
                if (String(r?.status || '').trim().toLowerCase() === 'cancelled') return false;
                const w = reqWindow(r);
                const code = periodCodeFromIso(w.start);
                if (!code) return false;
                return code >= startCode && code <= endCode;
            });
            const reqSegment = (req: any) => String(req?.segment || '').trim().toLowerCase();
            const reqStatus = (req: any) => String(req?.status || 'Unknown').trim() || 'Unknown';
            const reqRevenueBreakdown = (req: any) => {
                const b = computeRequestRevenueBreakdownNoTax(req) || {};
                const roomsRaw = Number((b as any).roomsNoTax || 0) || 0;
                const eventsRaw = Number((b as any).eventNoTax || 0) || 0;
                const totalRaw = Number((b as any).totalLineNoTax || 0) || 0;
                const totalFallback = totalRaw > 0
                    ? totalRaw
                    : (parseFloat(String(req?.totalCost || req?.grandTotalNoTax || 0).replace(/,/g, '')) || 0);
                const type = normalizeRequestTypeKey(String(req?.requestType || ''));
                if (roomsRaw > 0 || eventsRaw > 0) {
                    const combined = roomsRaw + eventsRaw;
                    if (combined >= totalFallback || totalFallback <= 0) return { rooms: roomsRaw, events: eventsRaw };
                    if (type === 'event') return { rooms: 0, events: totalFallback };
                    if (type === 'accommodation' || type === 'series') return { rooms: totalFallback, events: 0 };
                    return { rooms: roomsRaw, events: Math.max(0, totalFallback - roomsRaw) };
                }
                if (type === 'event') return { rooms: 0, events: totalFallback };
                if (type === 'accommodation' || type === 'series') return { rooms: totalFallback, events: 0 };
                if (type === 'event_rooms') {
                    const roomsShare = Math.max(0, Number(req?.totalRooms || 0)) > 0 ? 0.5 : 0;
                    return { rooms: totalFallback * roomsShare, events: totalFallback * (1 - roomsShare) };
                }
                return { rooms: totalFallback, events: 0 };
            };
            const reqRoomsRev = (req: any) => reqRevenueBreakdown(req).rooms;
            const reqEventsRev = (req: any) => reqRevenueBreakdown(req).events;
            const makeMonthly = () => Object.fromEntries(periods.map((p) => [p.key, 0])) as Record<string, number>;
            const makeMonthlyReq = () => Object.fromEntries(periods.map((p) => [p.key, 0])) as Record<string, number>;
            const mkStatusText = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' | ') || '—';

            const requestMatchesPromotionRule = (req: any, promo: any) => {
                const accountId = String(req?.accountId || '').trim();
                const reqSeg = reqSegment(req);
                const linkedAccounts = new Set((promo?.linkedAccounts || []).map((a: any) => String(a?.accountId || '').trim()).filter(Boolean));
                const linkedSegments = new Set((promo?.segments || []).map((s: any) => String(s || '').trim().toLowerCase()).filter(Boolean));
                if (!accountId || !reqSeg) return false;
                if (!linkedAccounts.has(accountId)) return false;
                if (!linkedSegments.has(reqSeg)) return false;
                const w = reqWindow(req);
                return overlap(w.start, w.end, String(promo?.startDate || ''), String(promo?.endDate || ''));
            };

            const reqPromoMap = new Map<string, string>();
            for (const req of scopedReqs) {
                const reqId = String(req?.id || '').trim();
                if (!reqId) continue;
                const explicitPromo = String(req?.promotionId || '').trim();
                if (explicitPromo) {
                    const promo = includedPromotions.find((p: any) => String(p?.id || '') === explicitPromo);
                    if (promo && requestMatchesPromotionRule(req, promo)) {
                        reqPromoMap.set(reqId, explicitPromo);
                    }
                    continue;
                }
                const matches = includedPromotions.filter((p: any) => requestMatchesPromotionRule(req, p));
                if (matches.length === 1) reqPromoMap.set(reqId, String(matches[0]?.id || ''));
            }

            const matrixRows: any[] = [];
            const exportRows: any[] = [];
            const allMonthly = makeMonthly();
            const allMonthlyReq = makeMonthlyReq();
            let allReq = 0;
            let allRooms = 0;
            let allEvents = 0;

            const accountTypeForReq = (req: any) => {
                const aid = String(req?.accountId || '').trim();
                const acc = aid ? (accounts || []).find((a: any) => String(a?.id || '').trim() === aid) : null;
                return String(acc?.type || acc?.accountType || req?.accountType || 'Unspecified').trim() || 'Unspecified';
            };

            const buildDataRow = (
                promotion: string,
                rowLabel: string,
                reqs: any[],
                mode: 'rooms' | 'events' | 'combined'
            ) => {
                const monthly = makeMonthly();
                const monthlyReq = makeMonthlyReq();
                const stMap = new Map<string, number>();
                let rooms = 0;
                let events = 0;
                for (const r of reqs) {
                    const opMonth = (() => {
                        const w = reqWindow(r);
                        const y = Number(String(w.start || '').slice(0, 4)) || first.year;
                        const m = Number(String(w.start || '').slice(5, 7)) || first.month;
                        return `${y}-${String(Math.min(12, Math.max(1, m))).padStart(2, '0')}`;
                    })();
                    const mk = opMonth;
                    if (!Object.prototype.hasOwnProperty.call(monthly, mk)) continue;
                    monthlyReq[mk] += 1;
                    const rr = reqRoomsRev(r);
                    const er = reqEventsRev(r);
                    const amount = mode === 'rooms' ? rr : mode === 'events' ? er : (rr + er);
                    monthly[mk] += amount;
                    rooms += rr;
                    events += er;
                    const st = reqStatus(r);
                    stMap.set(st, (stMap.get(st) || 0) + 1);
                }
                const ytdAmount = periods.reduce((s, p) => s + (monthly[p.key] || 0), 0);
                const ytdLm = periods.length >= 2
                    ? pctGrowth(Number(monthly[periods[periods.length - 1].key] || 0), Number(monthly[periods[periods.length - 2].key] || 0))
                    : '—';
                const matrix = {
                    rowKind: 'data',
                    promotion,
                    label: rowLabel,
                    requests: reqs.length,
                    statusBreakdown: mkStatusText(stMap),
                    roomsRevenue: formatSar(rooms, selectedCurrency),
                    eventsRevenue: formatSar(events, selectedCurrency),
                    combinedRevenue: formatSar(rooms + events, selectedCurrency),
                    months: periods.map((p, i) => ({
                        month: p.key,
                        label: p.label,
                        requests: Number(monthlyReq[p.key] || 0),
                        amount: formatSar(monthly[p.key] || 0, selectedCurrency),
                        lmPct: i === 0 ? '—' : pctGrowth(Number(monthly[p.key] || 0), Number(monthly[periods[i - 1].key] || 0)),
                    })),
                    ytd: { requests: reqs.length, amount: formatSar(ytdAmount, selectedCurrency), lmPct: ytdLm },
                };
                const flat: any = {
                    Promotion: promotion,
                    Row: rowLabel,
                    'Status Breakdown': matrix.statusBreakdown,
                    'YTD Requests': matrix.ytd.requests,
                    'YTD Amount': matrix.ytd.amount,
                    'YTD LM %': matrix.ytd.lmPct,
                };
                for (const mo of matrix.months) {
                    flat[`${mo.label} Requests`] = mo.requests;
                    flat[`${mo.label} Amount`] = mo.amount;
                    flat[`${mo.label} LM %`] = mo.lmPct;
                }
                return { matrix, flat, monthly, monthlyReq, rooms, events, reqCount: reqs.length };
            };

            for (const promo of includedPromotions) {
                const promoId = String(promo?.id || '');
                const promoName = String(promo?.name || 'Promotion');
                const promoReqs = scopedReqs.filter((r: any) => reqPromoMap.get(String(r?.id || '')) === promoId);
                matrixRows.push({ rowKind: 'promotionHeader', label: promoName });
                const linkedAccountIds = new Set((promo?.linkedAccounts || []).map((a: any) => String(a?.accountId || '').trim()).filter(Boolean));
                const linkedAccountTypes = new Set(
                    (accounts || [])
                        .filter((a: any) => linkedAccountIds.has(String(a?.id || '').trim()))
                        .map((a: any) => String(a?.type || a?.accountType || 'Unspecified').trim() || 'Unspecified')
                );

                const summary = buildDataRow(promoName, `Accounts linked (${linkedAccountIds.size})`, promoReqs, 'combined');
                matrixRows.push(summary.matrix);
                exportRows.push(summary.flat);

                const includeRooms = Boolean((promo as any)?.includeRoomsRevenue ?? true);
                const includeEvents = Boolean((promo as any)?.includeEventsRevenue ?? true);
                if (includeRooms) {
                    const rr = buildDataRow(promoName, 'Rooms Revenue', promoReqs, 'rooms');
                    matrixRows.push(rr.matrix);
                    exportRows.push(rr.flat);
                }
                if (includeEvents) {
                    const er = buildDataRow(promoName, 'Events Revenue', promoReqs, 'events');
                    matrixRows.push(er.matrix);
                    exportRows.push(er.flat);
                }
                if (includeRooms && includeEvents) {
                    const tr = buildDataRow(promoName, 'Total Revenue (Combined)', promoReqs, 'combined');
                    matrixRows.push(tr.matrix);
                    exportRows.push(tr.flat);
                }

                matrixRows.push({ rowKind: 'sectionHeader', label: `${promoName} — Revenue by Account Type` });
                const reqsByType = new Map<string, any[]>();
                for (const r of promoReqs) {
                    const k = accountTypeForReq(r);
                    const cur = reqsByType.get(k) || [];
                    cur.push(r);
                    reqsByType.set(k, cur);
                }
                [...reqsByType.entries()]
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .forEach(([typeLabel, reqs]) => {
                        const row = buildDataRow(promoName, typeLabel, reqs, 'combined');
                        matrixRows.push(row.matrix);
                        exportRows.push(row.flat);
                    });

                allReq += summary.reqCount;
                allRooms += summary.rooms;
                allEvents += summary.events;
                for (const p of periods) {
                    allMonthly[p.key] += summary.monthly[p.key];
                    allMonthlyReq[p.key] += summary.monthlyReq[p.key];
                }
            }

            matrixRows.push({ rowKind: 'sectionHeader', label: 'All Promotions Totals' });
            const totalReqsForRow = allReq;
            const totalsReqList = scopedReqs.filter((r: any) => reqPromoMap.has(String(r?.id || '')));
            const totals = buildDataRow('All Promotions', 'Grand Total', totalsReqList, 'combined');
            matrixRows.push(totals.matrix);
            exportRows.push(totals.flat);

            return {
                rows: exportRows,
                summary: {
                    'From': `${first.year}-${String(first.month).padStart(2, '0')}`,
                    'To': `${last.year}-${String(last.month).padStart(2, '0')}`,
                    Promotions: includedPromotions.length,
                    'Total requests': totalReqsForRow,
                    'Combined revenue': formatSar(allRooms + allEvents, selectedCurrency),
                },
                exportColumns: availableColumns.Promotions,
                isVsLyMatrix: false,
                isPromotionsMatrix: true,
                promotionsMatrixRows: matrixRows,
                promotionsPeriods: periods,
            };
        }

        if (selectedEntity === 'Rooms vs LY' || selectedEntity === 'MICE vs LY' || selectedEntity === 'Full Report') {
            const fromYear = Number(filters.vsFromYear) || new Date().getFullYear();
            const fromMonth = Math.min(12, Math.max(1, Number(filters.vsFromMonth) || 1));
            const toYear = Number(filters.vsToYear) || fromYear;
            const toMonth = Math.min(12, Math.max(1, Number(filters.vsToMonth) || 12));
            const fromCodeRaw = fromYear * 100 + fromMonth;
            const toCodeRaw = toYear * 100 + toMonth;
            const startCode = Math.min(fromCodeRaw, toCodeRaw);
            const endCode = Math.max(fromCodeRaw, toCodeRaw);
            const y = toCodeRaw >= fromCodeRaw ? toYear : fromYear;
            const reportYearLy = y - 1;
            const lyStartCode = startCode - 100;
            const lyEndCode = endCode - 100;
            const inPeriod = (code: number, start: number, end: number) => code >= start && code <= end;
            const scopedVsRequests = scopedRequests.filter((r: any) => {
                const code = requestPeriodCodeForReports(r);
                if (!code) return false;
                return inPeriod(code, startCode, endCode) || inPeriod(code, lyStartCode, lyEndCode);
            });
            const allowedMonthsCy = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) =>
                inPeriod(y * 100 + m, startCode, endCode)
            );
            const allowedMonthsLy = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) =>
                inPeriod(reportYearLy * 100 + m, lyStartCode, lyEndCode)
            );
            const vsOpts = {
                propertyRequestSegments,
                propertyAccountTypes,
                includeRequestSegments: Boolean(filters.vsLyByRequestSegment),
                includeAccountTypes: Boolean(filters.vsLyByAccountType),
                allowedMonthsCy: allowedMonthsCy.length ? allowedMonthsCy : undefined,
                allowedMonthsLy: allowedMonthsLy.length ? allowedMonthsLy : undefined,
            };
            const summaryFrom = `${String(Math.floor(startCode / 100)).padStart(4, '0')}-${String(startCode % 100).padStart(2, '0')}`;
            const summaryTo = `${String(Math.floor(endCode / 100)).padStart(4, '0')}-${String(endCode % 100).padStart(2, '0')}`;
            if (selectedEntity === 'Full Report') {
                const { rows: vsRows, yearLy } = buildFullVsLyMatrix(
                    scopedVsRequests,
                    accounts || [],
                    y,
                    selectedCurrency,
                    vsOpts
                );
                return {
                    rows: [] as any[],
                    summary: {
                        From: summaryFrom,
                        To: summaryTo,
                        'Report year (CY)': y,
                        'Vs last year (LY)': yearLy,
                        'Revenue basis':
                            'Identical to standalone Rooms vs LY and MICE vs LY: stay-night and agenda-day proration, excl. cancelled.',
                        'Definite + Actual': 'CY / LY columns per month and YTD',
                        OTB: 'All statuses except Definite+Actual, Cancelled, Lost (pipeline + any other; chosen year).',
                        Structure:
                            'Part A = Rooms vs LY. Part B = MICE vs LY. Part C = Other Revenue. Part D = Total Hotel Revenue.',
                    } as Record<string, string | number>,
                    exportColumns: [] as string[],
                    vsLyRows: vsRows,
                    vsLyMeta: {
                        kind: 'full' as const,
                        year: y,
                        yearLy,
                        from: summaryFrom,
                        to: summaryTo,
                        allowedMonthsCy,
                    },
                    isVsLyMatrix: true,
                };
            }
            const kind = selectedEntity === 'Rooms vs LY' ? 'rooms' : 'mice';
            const { rows: vsRows, yearLy } = buildVsLyMatrix(
                kind,
                scopedVsRequests,
                accounts || [],
                y,
                selectedCurrency,
                vsOpts
            );
            return {
                rows: [] as any[],
                summary: {
                    From: summaryFrom,
                    To: summaryTo,
                    'Report year (CY)': y,
                    'Vs last year (LY)': yearLy,
                    'Revenue basis': 'Line-based (excl. cancelled from all slices)',
                    'Definite + Actual': 'CY / LY comparison columns',
                    OTB: 'All except Def+Act, Cancelled, Lost (aligned with dashboard; chosen year).',
                } as Record<string, string | number>,
                exportColumns: [] as string[],
                vsLyRows: vsRows,
                vsLyMeta: { kind, year: y, yearLy, from: summaryFrom, to: summaryTo, allowedMonthsCy },
                isVsLyMatrix: true,
            };
        }

        const { start, end } = filters.dateRange || {};
        const st = filters.statuses || [];
        const vmin = Number(filters.valueRange?.min) || 0;
        const vmax = Number(filters.valueRange?.max) || Number.MAX_SAFE_INTEGER;

        const passRequestFilters = (r: any, miceOnly: boolean) => {
            const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
            if (miceOnly && agenda.length === 0) return false;
            if (!matchesStatusFilter(st, r.status)) return false;
            const amt = requestTotalValue(r);
            if (amt < vmin || amt > vmax) return false;
            if (!start || !end) return true;
            return requestOperationalDatesOverlapRange(r, start, end);
        };

        const paymentBlock = (r: any) => {
            const total = requestTotalValue(r);
            const paid = Array.isArray(r?.payments) && r.payments.length
                ? r.payments.reduce((sum: number, p: any) => sum + (Number(p?.amount || 0) || 0), 0)
                : parseFloat(String(r?.paidAmount ?? 0).replace(/,/g, '')) || 0;
            const unpaid = Math.max(0, total - paid);
            const status = String(r?.paymentStatus || '').trim()
                || (paymentsMeetOrExceedTotal(paid, total) ? 'Paid' : paid > 0 ? 'Deposit' : 'Unpaid');
            return { paid, unpaid, status };
        };

        const requestsFiltered = scopedRequests.filter((r) => passRequestFilters(r, false));
        const miceFiltered = scopedRequests.filter((r) => passRequestFilters(r, true));

        if (selectedEntity === 'Sales Calls') {
            const stageLabel = (raw: string) => {
                const s = String(raw || '').toLowerCase().trim();
                if (s === 'new') return 'Upcoming Sales Calls';
                if (s === 'waiting') return 'Waiting list';
                if (s === 'qualified') return 'QUALIFIED';
                if (s === 'proposal') return 'PROPOSAL';
                if (s === 'negotiation') return 'NEGOTIATION';
                if (s === 'won') return 'WON';
                if (s === 'notinterested') return 'Not Interested';
                return String(raw || '—');
            };
            const selectedStatusesNormalized = (st || []).map((x: string) => x.trim().toLowerCase());
            const rows = scopedSalesCalls
                .filter((lead: any) => {
                    const date = String(lead?.lastContact || lead?.date || '').slice(0, 10);
                    if (!inDateRangeYMD(date, start, end)) return false;
                    if (!selectedStatusesNormalized.length) return true;
                    const label = stageLabel(String(lead?.stage || '')).toLowerCase();
                    return selectedStatusesNormalized.includes(label);
                })
                .map((lead: any) => {
                    const stage = stageLabel(String(lead?.stage || ''));
                    const city = String(lead?.city || '').trim();
                    const country = String(lead?.country || '').trim();
                    const street = String(lead?.street || '').trim();
                    const address = [street, city, country].filter(Boolean).join(', ');
                    const outcome = String(lead?.description || '').trim() || '—';
                    const followUpDate = String(lead?.followUpDate || '').trim();
                    return {
                        ID: String(lead?.id || '—'),
                        Date: String(lead?.lastContact || lead?.date || '—').slice(0, 10) || '—',
                        Location: [city, country].filter(Boolean).join(', ') || '—',
                        Address: address || '—',
                        Name: String(lead?.contact || '—'),
                        Position: String(lead?.position || '—'),
                        'Contact email': String(lead?.email || '').trim() || '—',
                        'Contact phone': String(lead?.phone || '').trim() || '—',
                        Subject: String(lead?.subject || '—'),
                        Company: String(lead?.company || '—'),
                        Stage: stage,
                        Outcome: outcome,
                        'Follow-up': followUpDate || 'No follow-up',
                        'Next Step': String(lead?.nextStep || '—'),
                        'Expected Revenue': formatSar(Number(lead?.value || 0), selectedCurrency),
                        Owner: String(lead?.accountManager || lead?.ownerUserId || '—'),
                    };
                });

            return {
                rows,
                summary: {
                    'Total sales calls': rows.length,
                    'With follow-up': rows.filter((r: any) => String(r['Follow-up']) !== 'No follow-up').length,
                    'Open opportunities': rows.filter((r: any) =>
                        ['Upcoming Sales Calls', 'Waiting list', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'].includes(String(r.Stage))
                    ).length,
                    'Expected revenue': formatSar(
                        rows.reduce((sum: number, r: any) => sum + (parseFloat(String(r['Expected Revenue']).replace(/[^\d.-]/g, '')) || 0), 0),
                        selectedCurrency
                    ),
                },
                exportColumns: availableColumns['Sales Calls'],
                isVsLyMatrix: false,
                vsLyRows: null,
                vsLyMeta: null,
            };
        }

        if (selectedEntity === 'Requests' || selectedEntity === 'MICE') {
            const source = selectedEntity === 'MICE' ? miceFiltered : requestsFiltered;
            const rows: any[] = [];

            let totalAmount = 0;
            let totalAmountInclTax = 0;
            let totalPax = 0;
            let totalRoomRevSeg = 0;
            let totalRoomNights = 0;
            let totalPaid = 0;
            let totalUnpaid = 0;
            let totalEventRevenue = 0;
            let totalMiceEventRevNoTax = 0;
            let totalMiceRoomsRevNoTax = 0;
            let lineItemCount = 0;
            const typeCounter: Record<string, number> = {
                accommodation: 0,
                event: 0,
                event_rooms: 0,
                series: 0,
            };
            const typeSeen = new Set<string>();

            for (const r of source) {
                const segs = start && end ? buildReportSegmentsForRequest(r, start, end) : [];
                if (!segs.length) continue;

                const typeKey = normalizeRequestTypeKey(r.requestType);
                const rid = String(r.id);
                if (!typeSeen.has(rid)) {
                    typeSeen.add(rid);
                    typeCounter[typeKey] = (typeCounter[typeKey] || 0) + 1;
                }

                const status = r.status || '—';
                const client = r.account || r.accountName || '—';
                const pay = paymentBlock(r);

                for (let si = 0; si < segs.length; si += 1) {
                    const seg = segs[si];
                    lineItemCount += 1;
                    const exNoTax = segmentLineTotalExTax(seg, 0);
                    const inclTax = lineAmountsExTaxToWithTax(seg.roomRev, seg.eventRev, 0, propertyTaxes);
                    const ddrSeg =
                        seg.pax > 0 && seg.eventRev > 0
                            ? seg.eventRev / seg.pax
                            : 0;
                    const roomNightsDisplay = seg.roomNights;
                    const adrForCol =
                        roomNightsDisplay > 0 && seg.roomRev > 0
                            ? seg.roomRev / roomNightsDisplay
                            : 0;
                    const isFirstSeg = si === 0;

                    totalAmount += exNoTax;
                    totalAmountInclTax += inclTax;
                    totalPax += seg.pax;
                    totalRoomNights += roomNightsDisplay;
                    totalRoomRevSeg += seg.roomRev;
                    totalEventRevenue += seg.eventRev;
                    if (selectedEntity === 'MICE') {
                        totalMiceEventRevNoTax += seg.eventRev;
                        totalMiceRoomsRevNoTax += seg.roomRev;
                    }

                    if (isFirstSeg) {
                        totalPaid += pay.paid;
                        totalUnpaid += pay.unpaid;
                    }

                    if (selectedEntity === 'MICE') {
                        rows.push({
                            'Request ID': r.id || '—',
                            Line: seg.line,
                            Client: client,
                            'Request Type': requestTypeLabel(r.requestType),
                            'Segment date': seg.displayDate,
                            'Agenda start': seg.agendaStart || '—',
                            'Agenda end': seg.agendaEnd || '—',
                            'Agenda days': seg.agendaDays || 0,
                            Status: status,
                            'Payment Status': pay.status,
                            PAX: seg.pax || 0,
                            DDR: ddrSeg > 0 ? formatSar(ddrSeg, selectedCurrency) : '—',
                            'Event Revenue': seg.eventRev > 0 ? formatSar(seg.eventRev, selectedCurrency) : '—',
                            'Rooms Revenue': seg.roomRev > 0 ? formatSar(seg.roomRev, selectedCurrency) : '—',
                            'Paid Amount': isFirstSeg ? formatSar(pay.paid, selectedCurrency) : '—',
                            'Unpaid Amount': isFirstSeg ? formatSar(pay.unpaid, selectedCurrency) : '—',
                            'Total (ex. tax)': formatSar(exNoTax, selectedCurrency),
                            'Total (incl. tax)': formatSar(inclTax, selectedCurrency),
                            Amount: formatSar(exNoTax, selectedCurrency),
                        });
                    } else {
                        const isEv = isEventOrEventRoomsType(r);
                        const fmtNoTax = (n: number) => formatSar(Number(n) || 0, selectedCurrency);
                        const evShow = (isEv && seg.eventRev > 0) || (!isEv && false);
                        rows.push({
                            'Request ID': r.id || '—',
                            Line: seg.line,
                            Client: client,
                            'Request Type': requestTypeLabel(r.requestType),
                            Date: seg.displayDate,
                            Status: status,
                            'Payment Status': pay.status,
                            Nights: seg.stayNights,
                            'Room Nights': roomNightsDisplay,
                            PAX: seg.pax,
                            DDR: ddrSeg > 0 ? formatSar(ddrSeg, selectedCurrency) : '—',
                            'AVG ADR': seg.roomRev > 0 && adrForCol > 0 ? formatSar(adrForCol, selectedCurrency) : '—',
                            'Paid Amount': isFirstSeg ? formatSar(pay.paid, selectedCurrency) : '—',
                            'Unpaid Amount': isFirstSeg ? formatSar(pay.unpaid, selectedCurrency) : '—',
                            'Event Revenue': evShow ? fmtNoTax(seg.eventRev) : '—',
                            'Rooms Revenue': fmtNoTax(seg.roomRev),
                            'Rooms + Event': isEv && (seg.eventRev > 0 || seg.roomRev > 0)
                                ? fmtNoTax(seg.roomRev + seg.eventRev)
                                : '—',
                            'Total (ex. tax)': formatSar(exNoTax, selectedCurrency),
                            'Total (incl. tax)': formatSar(inclTax, selectedCurrency),
                            Amount: formatSar(exNoTax, selectedCurrency),
                        });
                    }
                }
            }

            const avgAdr = totalRoomNights > 0 && totalRoomRevSeg > 0 ? totalRoomRevSeg / totalRoomNights : 0;
            const avgValue = lineItemCount > 0 ? totalAmount / lineItemCount : 0;
            const avgDdr = totalPax > 0 ? totalEventRevenue / totalPax : 0;

            const baseSummary: Record<string, string | number> = {
                'Line items': lineItemCount,
                'Unique requests': typeSeen.size,
                'Total value (ex. tax)': formatSar(totalAmount, selectedCurrency),
                'Total value (incl. tax)': formatSar(totalAmountInclTax, selectedCurrency),
                'AVG Value (per line)': formatSar(avgValue, selectedCurrency),
                'Total PAX': totalPax.toLocaleString(),
                'AVG DDR': formatSar(avgDdr, selectedCurrency),
                'Total paid (recorded)': formatSar(totalPaid, selectedCurrency),
                'Total unpaid (recorded)': formatSar(totalUnpaid, selectedCurrency),
            };
            if (selectedEntity === 'MICE') {
                baseSummary['Event Revenue'] = formatSar(totalMiceEventRevNoTax, selectedCurrency);
                baseSummary['Rooms Revenue'] = formatSar(totalMiceRoomsRevNoTax, selectedCurrency);
                baseSummary['MICE total (ex. tax)'] = formatSar(totalMiceEventRevNoTax + totalMiceRoomsRevNoTax, selectedCurrency);
            }
            if (selectedEntity === 'Requests') {
                baseSummary['AVG ADR (room lines)'] = formatSar(avgAdr, selectedCurrency);
                baseSummary.Accommodation = typeCounter.accommodation || 0;
                baseSummary['Event only'] = typeCounter.event || 0;
                baseSummary['Event with rooms'] = typeCounter.event_rooms || 0;
                baseSummary['Series groups'] = typeCounter.series || 0;
            }
            return {
                rows,
                summary: baseSummary,
                exportColumns: selectedEntity === 'MICE'
                    ? [
                          'Request ID',
                          'Line',
                          'Client',
                          'Request Type',
                          'Segment date',
                          'Agenda start',
                          'Agenda end',
                          'Agenda days',
                          'Status',
                          'Payment Status',
                          'PAX',
                          'DDR',
                          'Event Revenue',
                          'Rooms Revenue',
                          'Paid Amount',
                          'Unpaid Amount',
                          'Total (ex. tax)',
                          'Total (incl. tax)',
                          'Amount',
                      ]
                    : [
                          'Request ID',
                          'Line',
                          'Client',
                          'Request Type',
                          'Date',
                          'Status',
                          'Payment Status',
                          'Nights',
                          'Room Nights',
                          'PAX',
                          'DDR',
                          'AVG ADR',
                          'Paid Amount',
                          'Unpaid Amount',
                          'Event Revenue',
                          'Rooms Revenue',
                          'Rooms + Event',
                          'Total (ex. tax)',
                          'Total (incl. tax)',
                          'Amount',
                      ],
                isVsLyMatrix: false,
                vsLyRows: null,
                vsLyMeta: null,
            };
        }

        if (selectedEntity === 'Accounts') {
            const selectedTypes = new Set((filters.accountTypes || []).map((x: string) => String(x).trim()).filter(Boolean));
            const rows = (accounts || [])
                .filter((acc: any) => {
                    const t = String(acc?.type || '').trim();
                    if (selectedTypes.size && !selectedTypes.has(t)) return false;
                    return true;
                })
                .map((acc: any) => {
                    const reqs = filterRequestsForAccount(scopedRequests, acc.id, acc.name);
                    const m = computeAccountMetrics(reqs);
                    const contactsFromArray = Array.isArray(acc?.contacts)
                        ? acc.contacts.filter((c: any) => c && typeof c === 'object')
                        : [];
                    const fallbackPrimary =
                        acc?.contact || acc?.email || acc?.phone
                            ? [
                                  {
                                      name: String(acc?.contact || '').trim(),
                                      email: String(acc?.email || '').trim(),
                                      phone: String(acc?.phone || '').trim(),
                                      position: String(acc?.position || '').trim(),
                                  },
                              ]
                            : [];
                    const allContacts = contactsFromArray.length ? contactsFromArray : fallbackPrimary;
                    const uniq = (values: string[]) =>
                        [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
                    const names = uniq(
                        allContacts.map((contact: any) =>
                            String(
                                contact?.name ||
                                    `${String(contact?.firstName || '').trim()} ${String(contact?.lastName || '').trim()}`
                            ).trim()
                        )
                    );
                    const positions = uniq(allContacts.map((contact: any) => String(contact?.position || '').trim()));
                    const emails = uniq(allContacts.map((contact: any) => String(contact?.email || '').trim()));
                    const phones = uniq(allContacts.map((contact: any) => String(contact?.phone || '').trim()));

                    return {
                        ID: acc.id,
                        Name: acc.name,
                        'Account Type': acc.type || '—',
                        'Contact Person': names.length ? names.join('\n') : '—',
                        'Contact Position': positions.length ? positions.join('\n') : '—',
                        'Contact Email': emails.length ? emails.join('\n') : '—',
                        'Contact Phone': phones.length ? phones.join('\n') : '—',
                        'Total Bookings': String(m.totalRequests),
                        'Total Revenue': formatCompactCurrency(m.totalSpend, selectedCurrency),
                    };
                });
            return {
                rows,
                summary: {
                    'Total accounts': rows.length,
                    'Total contacts': rows.reduce((sum: number, r: any) => {
                        const n = String(r['Contact Person'] || '').trim();
                        if (!n || n === '—') return sum;
                        return sum + n.split('\n').filter((x: string) => String(x).trim()).length;
                    }, 0),
                    'Total bookings': rows.reduce((s, r) => s + (Number(r['Total Bookings']) || 0), 0).toLocaleString(),
                },
                exportColumns: availableColumns.Accounts,
                isVsLyMatrix: false,
                vsLyRows: null,
                vsLyMeta: null,
            };
        }

        const rows = scopedTasks
            .filter((t: any) => {
                const d = String(t.date || '').slice(0, 10);
                return inDateRangeYMD(d, start, end);
            })
            .map((t: any) => ({
                ID: String(t.id),
                Task: t.task || '—',
                Client: t.client || '—',
                'Due Date': t.date || '—',
                Priority: t.priority || '—',
                Assignee: t.assignedTo || '—',
            }));
        return {
            rows,
            summary: {
                'Total tasks': rows.length,
                'High priority': rows.filter((r) => String(r.Priority).toLowerCase() === 'high').length,
            },
            exportColumns: availableColumns.Tasks,
            isVsLyMatrix: false,
            vsLyRows: null,
            vsLyMeta: null,
        };
    }, [
        selectedEntity,
        scopedRequests,
        scopedTasks,
        scopedSalesCalls,
        accounts,
        activeProperty,
        propertyRequestSegments,
        propertyAccountTypes,
        filters.dateRange,
        filters.statuses,
        filters.valueRange,
        filters.vsFromYear,
        filters.vsFromMonth,
        filters.vsToYear,
        filters.vsToMonth,
        filters.vsLyByRequestSegment,
        filters.vsLyByAccountType,
        filters.promotionsYear,
        filters.promotionsSelectedIds,
        filters.promotionsFromYear,
        filters.promotionsFromMonth,
        filters.promotionsToYear,
        filters.promotionsToMonth,
        filters.accountTypes,
        selectedCurrency,
        propertyTaxes,
        promotionsData,
    ]);

    const previewData = reportPack.rows;
    const reportPackAny = reportPack as any;
    const isVsMatrixPack = Boolean(reportPackAny.isVsLyMatrix);
    const vsSummaryEntries = useMemo(() => {
        if (!isVsMatrixPack) return [] as Array<[string, string | number]>;
        const y = reportPackAny.vsLyMeta?.year;
        const ly = reportPackAny.vsLyMeta?.yearLy;
        const from = reportPackAny.vsLyMeta?.from;
        const to = reportPackAny.vsLyMeta?.to;
        return [
            ['From', from ?? '—'],
            ['To', to ?? '—'],
            ['Report year (CY)', y ?? '—'],
            ['Vs last year (LY)', ly ?? '—'],
        ];
    }, [isVsMatrixPack, reportPackAny.vsLyMeta?.from, reportPackAny.vsLyMeta?.to, reportPackAny.vsLyMeta?.year, reportPackAny.vsLyMeta?.yearLy]);

    const vsLyRowsAll: VsLyMatrixRow[] = reportPackAny.vsLyRows || [];
    const vsLyColumnToggleItems = useMemo(() => {
        const seen = new Set<string>();
        const out: { key: string; label: string; isSectionHeader: boolean }[] = [];
        for (const row of vsLyRowsAll) {
            if (row.rowKind === 'sectionHeader') {
                if (seen.has(row.id)) continue;
                seen.add(row.id);
                out.push({ key: row.id, label: row.label, isSectionHeader: true });
                continue;
            }
            const k = row.segmentGroupKey ?? row.id;
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({ key: k, label: row.label, isSectionHeader: false });
        }
        return out;
    }, [vsLyRowsAll]);
    const vsLyRowsFiltered = useMemo(() => {
        const all = (reportPackAny.vsLyRows || []) as VsLyMatrixRow[];
        return all.filter((r) => {
            const k = r.segmentGroupKey ?? r.id;
            return !vsLyRowHidden.has(k);
        });
    }, [reportPack, vsLyRowHidden]);
    const vsLyVisibleMonths = useMemo(() => {
        const arr = Array.isArray(reportPackAny.vsLyMeta?.allowedMonthsCy) ? reportPackAny.vsLyMeta.allowedMonthsCy : [];
        if (arr.length > 0) {
            return new Set(arr.map((m: any) => Number(m)).filter((m: number) => Number.isFinite(m) && m >= 1 && m <= 12));
        }
        const from = String(reportPackAny.vsLyMeta?.from || '').trim();
        const to = String(reportPackAny.vsLyMeta?.to || '').trim();
        const y = Number(reportPackAny.vsLyMeta?.year) || 0;
        const ym = (raw: string) => {
            const m = raw.match(/^(\d{4})-(\d{2})$/);
            if (!m) return 0;
            return (Number(m[1]) || 0) * 100 + (Number(m[2]) || 0);
        };
        const fromCode = ym(from);
        const toCode = ym(to);
        if (!fromCode || !toCode || !y) return new Set(Array.from({ length: 12 }, (_, i) => i + 1));
        const startCode = Math.min(fromCode, toCode);
        const endCode = Math.max(fromCode, toCode);
        return new Set(Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => {
            const code = y * 100 + m;
            return code >= startCode && code <= endCode;
        }));
    }, [reportPackAny.vsLyMeta?.allowedMonthsCy, reportPackAny.vsLyMeta?.from, reportPackAny.vsLyMeta?.to, reportPackAny.vsLyMeta?.year]);
    const vsLyRowsForDisplay = useMemo(() => {
        return vsLyRowsFiltered.map((row) => {
            if (row.rowKind === 'sectionHeader') return row;
            return { ...row, months: (row.months || []).filter((mo: any) => vsLyVisibleMonths.has(Number(mo?.month) || 0)) };
        });
    }, [vsLyRowsFiltered, vsLyVisibleMonths]);

    const toggleVsLyRowInReport = (rowId: string) => {
        setVsLyRowHidden((prev) => {
            const n = new Set(prev);
            if (n.has(rowId)) n.delete(rowId);
            else n.add(rowId);
            return n;
        });
    };

    const displayedPreviewData = previewData;

    const showDateFilters = selectedEntity !== 'Accounts' && !isVsLySource && selectedEntity !== 'Promotions';
    // Promotions is already excluded by the Requests|MICE|Sales Calls guard (TS2367 if re-checked).
    const showStatusFilters =
        (selectedEntity === 'Requests' || selectedEntity === 'MICE' || selectedEntity === 'Sales Calls') && !isVsLySource;
    const showValueFilters = (selectedEntity === 'Requests' || selectedEntity === 'MICE') && !isVsLySource;
    const showAccountFilters = selectedEntity === 'Accounts' && !isVsLySource;

    const pctClass = (pct: string) => {
        const p = String(pct || '').trim();
        if (!p || p === '-' || p === '0%') return { color: colors.textMuted };
        const n = parseFloat(p.replace(/%/g, ''));
        if (Number.isNaN(n)) return { color: colors.textMuted };
        if (n > 0) return { color: colors.green || '#22c55e' };
        if (n < 0) return { color: colors.red || '#ef4444' };
        return { color: colors.textMuted };
    };

    const handleExport = () => {
        if (!canReportsUseDataSource(currentUser, selectedEntity)) return;
        if (selectedEntity === 'Promotions' && reportPackAny.isPromotionsMatrix && Array.isArray(reportPackAny.promotionsMatrixRows)) {
            const stamp = new Date().toISOString().slice(0, 10);
            const base = `promotions-report-${stamp}`;
            const rows = reportPackAny.promotionsMatrixRows as any[];
            const periods = Array.isArray(reportPackAny.promotionsPeriods) ? reportPackAny.promotionsPeriods : [];
            const totalCols = 1 + (periods.length * 3) + 3;
            const buildHtml = () => {
                const headerMonths = periods
                    .map((p: any) => `<th colspan="3" style="text-align:center;padding:6px;border:1px solid #70839a;background:#1d3f67;color:#fff;">${p.label}</th>`)
                    .join('');
                const subMonths = periods
                    .map(() => `<th style="padding:4px;border:1px solid #95a4b3;background:#d5dde5;">Req</th><th style="padding:4px;border:1px solid #95a4b3;background:#d5dde5;">Amount</th><th style="padding:4px;border:1px solid #95a4b3;background:#d5dde5;">LM %</th>`)
                    .join('');
                const body = rows.map((r: any) => {
                    if (r.rowKind === 'promotionHeader') {
                        return `<tr><td colspan="${totalCols}" style="padding:7px;border:1px solid #6d7e90;background:#9eb6d0;color:#102a43;font-weight:700;text-transform:uppercase;">${r.label}</td></tr>`;
                    }
                    if (r.rowKind === 'sectionHeader') {
                        return `<tr><td colspan="${totalCols}" style="padding:7px;border:1px solid #6d7e90;background:#dbe7f3;color:#17324d;font-weight:700;">${r.label}</td></tr>`;
                    }
                    const monthCells = (r.months || []).map((mo: any) => {
                        const lm = String(mo.lmPct || '—');
                        const n = parseFloat(lm.replace(/[^\d.-]/g, ''));
                        const color = Number.isNaN(n) ? '#111' : (n >= 0 ? '#0f7a31' : '#b42318');
                        return `<td style="padding:4px;border:1px solid #c5cfda;">${mo.requests ?? '—'}</td><td style="padding:4px;border:1px solid #c5cfda;">${mo.amount}</td><td style="padding:4px;border:1px solid #c5cfda;color:${color};font-weight:700;">${lm}</td>`;
                    }).join('');
                    const yLm = String(r.ytd?.lmPct || '—');
                    const yN = parseFloat(yLm.replace(/[^\d.-]/g, ''));
                    const yColor = Number.isNaN(yN) ? '#111' : (yN >= 0 ? '#0f7a31' : '#b42318');
                    return `<tr>
                        <td style="padding:6px;border:1px solid #c5cfda;background:#f7fafc;"><div style="font-weight:700;">${r.label}</div></td>
                        ${monthCells}
                        <td style="padding:4px;border:1px solid #c5cfda;background:#edf2f7;">${r.ytd?.requests ?? '—'}</td>
                        <td style="padding:4px;border:1px solid #c5cfda;background:#edf2f7;">${r.ytd?.amount || '—'}</td>
                        <td style="padding:4px;border:1px solid #c5cfda;background:#edf2f7;color:${yColor};font-weight:700;">${yLm}</td>
                    </tr>`;
                }).join('');
                return `<html><head><meta charset="utf-8" /></head><body>
                    <h2 style="margin:0 0 6px;color:#1d3f67;">Promotions report vs LM</h2>
                    <div style="font-size:12px;color:#425466;margin-bottom:10px;">${activeProperty?.name || 'All properties'} — ${String(reportPack.summary?.From || '')} to ${String(reportPack.summary?.To || '')}</div>
                    <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:11px;">
                        <thead>
                            <tr>
                                <th rowspan="2" style="padding:6px;border:1px solid #70839a;background:#1d3f67;color:#fff;text-align:left;">Promotion / Metric</th>
                                ${headerMonths}
                                <th colspan="3" style="padding:6px;border:1px solid #70839a;background:#1d3f67;color:#fff;">YTD</th>
                            </tr>
                            <tr>${subMonths}<th style="padding:4px;border:1px solid #95a4b3;background:#d5dde5;">Req</th><th style="padding:4px;border:1px solid #95a4b3;background:#d5dde5;">Amount</th><th style="padding:4px;border:1px solid #95a4b3;background:#d5dde5;">LM %</th></tr>
                        </thead>
                        <tbody>${body}</tbody>
                    </table>
                </body></html>`;
            };
            if (exportFormat === 'csv') {
                const cols = reportPack.exportColumns;
                const csv = [
                    cols.map(csvEscape).join(','),
                    ...reportPack.rows.map((row: any) => cols.map((c: string) => csvEscape(row[c] ?? '—')).join(',')),
                ].join('\n');
                triggerDownload(csv, `${base}.csv`, 'text/csv;charset=utf-8;');
            } else if (exportFormat === 'excel') {
                triggerDownload(buildHtml(), `${base}.xls`, 'application/vnd.ms-excel');
            } else {
                const w = window.open('', '_blank', 'width=1400,height=900');
                if (w) {
                    w.document.write(buildHtml());
                    w.document.close();
                    w.focus();
                    w.print();
                }
            }
            return;
        }
        if (isVsMatrixPack && reportPackAny.vsLyRows?.length) {
            const vsRows = vsLyRowsForDisplay;
            if (!vsRows.length) return;
            const stamp = new Date().toISOString().slice(0, 10);
            const y = reportPackAny.vsLyMeta?.year || 'year';
            const base =
                selectedEntity === 'Full Report'
                    ? `full-report-vs-ly-${y}-${stamp}`
                    : `${selectedEntity === 'Rooms vs LY' ? 'rooms' : 'mice'}-vs-ly-${y}-${stamp}`;
            const meta = reportPackAny.vsLyMeta;
            const propName = activeProperty?.name || 'All properties';
            if (exportFormat === 'csv') {
                const csv = exportVsLyMatrixCsv(vsRows, meta, propName);
                triggerDownload(csv, `${base}.csv`, 'text/csv;charset=utf-8;');
            } else if (exportFormat === 'excel') {
                const html = exportVsLyMatrixExcelHtml(vsRows, meta, propName);
                triggerDownload(html, `${base}.xls`, 'application/vnd.ms-excel');
            } else {
                const html = exportVsLyMatrixExcelHtml(vsRows, meta, propName);
                const w = window.open('', '_blank', 'width=1400,height=900');
                if (w) {
                    w.document.write(html);
                    w.document.close();
                    w.focus();
                    w.print();
                }
            }
            return;
        }
        const exportRows = reportPack.rows;
        if (!exportRows.length) return;
        const stamp = new Date().toISOString().slice(0, 10);
        const base = `${String(selectedEntity).toLowerCase()}-report-${stamp}`;
        const cols = (selectedColumns && selectedColumns.length ? selectedColumns : reportPack.exportColumns)
            .filter((c) => reportPack.exportColumns.includes(c));
        const rows = exportRows;
        const stackedCellHtml = (raw: any, lineBorderColor = '#ddd') => {
            const text = String(raw ?? '—');
            const lines = text
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean);
            if (lines.length <= 1) return text || '—';
            const innerRows = lines
                .map(
                    (line, idx) =>
                        `<tr><td style="padding:2px 0;${idx ? `border-top:1px solid ${lineBorderColor};` : ''}">${line}</td></tr>`
                )
                .join('');
            return `<table style="width:100%;border-collapse:collapse;"><tbody>${innerRows}</tbody></table>`;
        };

        if (exportFormat === 'csv') {
            const csv = [
                cols.map(csvEscape).join(','),
                ...rows.map((row) => cols.map((c) => csvEscape(row[c] ?? '—')).join(',')),
            ].join('\n');
            triggerDownload(csv, `${base}.csv`, 'text/csv;charset=utf-8;');
            return;
        }

        if (exportFormat === 'excel') {
            const tableHead = cols.map((c) => `<th style="padding:8px;border:1px solid #ddd;background:#f7f7f7;text-align:left;">${c}</th>`).join('');
            const tableRows = rows
                .map((row) =>
                    `<tr>${cols
                        .map((c) => `<td style="padding:8px;border:1px solid #ddd;vertical-align:top;">${stackedCellHtml(row[c], '#ddd')}</td>`)
                        .join('')}</tr>`
                )
                .join('');
            const summaryHtml = Object.entries(reportPack.summary)
                .map(([k, v]) => `<tr><td style="padding:6px 8px;border:1px solid #eee;">${k}</td><td style="padding:6px 8px;border:1px solid #eee;">${String(v)}</td></tr>`)
                .join('');
            const html = `
                <html><head><meta charset="utf-8" /></head><body>
                <h2>${selectedEntity} Report</h2>
                <table style="border-collapse:collapse;margin-bottom:16px;">${summaryHtml}</table>
                <table style="border-collapse:collapse;">
                  <thead><tr>${tableHead}</tr></thead>
                  <tbody>${tableRows}</tbody>
                </table>
                </body></html>
            `;
            triggerDownload(html, `${base}.xls`, 'application/vnd.ms-excel');
            return;
        }

        const w = window.open('', '_blank', 'width=1200,height=900');
        if (!w) return;
        const summaryCards = Object.entries(reportPack.summary)
            .map(([k, v]) => `<div style="padding:10px 12px;border:1px solid #ddd;border-radius:8px;"><div style="font-size:11px;color:#666;text-transform:uppercase;">${k}</div><div style="font-size:16px;font-weight:700;">${String(v)}</div></div>`)
            .join('');
        const head = cols.map((c) => `<th>${c}</th>`).join('');
        const body = rows
            .map((row) => `<tr>${cols.map((c) => `<td style="vertical-align:top;">${stackedCellHtml(row[c], '#ddd')}</td>`).join('')}</tr>`)
            .join('');
        w.document.write(`
            <html>
              <head>
                <title>${selectedEntity} Report</title>
                <style>
                  body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
                  h1 { margin: 0 0 8px; }
                  .meta { color: #555; margin-bottom: 16px; }
                  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
                  table { border-collapse: collapse; width: 100%; font-size: 12px; }
                  th, td { border: 1px solid #ddd; padding: 7px; text-align: left; vertical-align: top; }
                  th { background: #f5f5f5; font-size: 11px; text-transform: uppercase; }
                </style>
              </head>
              <body>
                <h1>${selectedEntity} Report</h1>
                <div class="meta">Property: ${activeProperty?.name || 'All properties'} | Generated: ${new Date().toLocaleString()}</div>
                <div class="grid">${summaryCards}</div>
                <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
              </body>
            </html>
        `);
        w.document.close();
        w.focus();
        w.print();
    };

    if (currentView === 'saved') {
        return (
            <div className="h-full flex flex-col overflow-hidden">
                <div className="shrink-0 p-4 border-b" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold" style={{ color: colors.textMain }}>Saved Reports</h1>
                            <p className="text-sm" style={{ color: colors.textMuted }}>View and manage your saved reports</p>
                        </div>
                        <button
                            onClick={() => setCurrentView('builder')}
                            className="px-4 py-2 rounded border hover:bg-white/5 transition-colors text-sm"
                            style={{ borderColor: colors.border, color: colors.textMain }}
                        >
                            <BarChart3 size={16} className="inline mr-2" />
                            New Report
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-4">
                    <div className="space-y-3">
                        {savedReports.map((report: any) => (
                            <div
                                key={report.id}
                                className="p-4 rounded-xl border hover:shadow-lg transition-all group"
                                style={{ backgroundColor: colors.card, borderColor: colors.border }}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg mb-1" style={{ color: colors.textMain }}>{report.name}</h3>
                                        <div className="flex items-center gap-4 text-sm mb-2" style={{ color: colors.textMuted }}>
                                            <span className="px-2 py-1 rounded text-xs" style={{ backgroundColor: colors.primary + '20', color: colors.primary }}>
                                                {report.entity}
                                            </span>
                                            <span>Created: {report.createdDate}</span>
                                            <span>Last run: {report.lastRun}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button type="button" className="p-2 rounded hover:bg-white/10 transition-colors" style={{ color: colors.textMuted }}><Eye size={16} /></button>
                                        <button type="button" className="p-2 rounded hover:bg-white/10 transition-colors" style={{ color: colors.blue }}><RefreshCw size={16} /></button>
                                        <button type="button" className="p-2 rounded hover:bg-white/10 transition-colors" style={{ color: colors.textMuted }}><Edit size={16} /></button>
                                        <button type="button" className="p-2 rounded hover:bg-red-500/10 transition-colors" style={{ color: colors.red }}><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const anyDataSourceAllowed = entities.some((e) => canReportsUseDataSource(currentUser, e.id));

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="shrink-0 p-4 border-b" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: colors.textMain }}>Report Builder</h1>
                        <p className="text-sm" style={{ color: colors.textMuted }}>
                            Professional reporting for Requests, Accounts, MICE, Tasks, and Sales Calls.
                            {activeProperty?.name ? (
                                <span className="block mt-1 text-xs font-bold" style={{ color: colors.primary }}>Scope: {activeProperty.name}</span>
                            ) : null}
                        </p>
                    </div>
                    <button
                        onClick={() => setCurrentView('saved')}
                        className="px-4 py-2 rounded border hover:bg-white/5 transition-colors text-sm"
                        style={{ borderColor: colors.border, color: colors.textMain }}
                    >
                        <FileText size={16} className="inline mr-2" />
                        Saved Reports
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
                {!anyDataSourceAllowed ? (
                    <div
                        className="max-w-xl mx-auto mt-8 p-6 rounded-xl border text-center"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <p className="font-semibold" style={{ color: colors.textMain }}>No report data sources enabled</p>
                        <p className="text-sm mt-2" style={{ color: colors.textMuted }}>
                            Your account can open Reports but has no permission to use Requests, Accounts, MICE, Tasks, or Sales Calls.
                            Ask an administrator to assign the matching checkboxes under Reports in user permissions.
                        </p>
                    </div>
                ) : (
                <div className="grid grid-cols-1 gap-4 max-w-[96rem] mx-auto w-full">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>Data Source</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {entities.map((entity) => {
                                    const Icon = entity.icon;
                                    const allowed = canReportsUseDataSource(currentUser, entity.id);
                                    return (
                                        <button
                                            key={entity.id}
                                            type="button"
                                            disabled={!allowed}
                                            onClick={() => allowed && handleEntityChange(entity.id)}
                                            className={`w-full flex items-center gap-2 p-2 rounded-lg border transition-all ${selectedEntity === entity.id ? 'border-2' : ''} disabled:opacity-40 disabled:cursor-not-allowed`}
                                            style={{
                                                borderColor: selectedEntity === entity.id ? colors.primary : colors.border,
                                                backgroundColor: selectedEntity === entity.id ? colors.primary + '10' : colors.bg,
                                            }}
                                        >
                                            <Icon size={16} style={{ color: selectedEntity === entity.id ? colors.primary : colors.textMuted }} />
                                            <span className="font-medium text-sm leading-tight" style={{ color: colors.textMain }}>{entity.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>Filters</h3>

                            {isVsLySource && (
                                <div className="mb-4 space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium mb-2" style={{ color: colors.textMuted }}>From (Year / Month)</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <select
                                                value={Number(filters.vsFromYear) || new Date().getFullYear()}
                                                onChange={(e) => setFilters({ ...filters, vsFromYear: Number(e.target.value) })}
                                                className="w-full px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                {yearOptionsForVs.map((y) => (
                                                    <option key={`vs-from-y-${y}`} value={y}>{y}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={Number(filters.vsFromMonth) || 1}
                                                onChange={(e) => setFilters({ ...filters, vsFromMonth: Number(e.target.value) })}
                                                className="w-full px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                                    <option key={`vs-from-m-${m}`} value={m}>{String(m).padStart(2, '0')}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium mb-2" style={{ color: colors.textMuted }}>To (Year / Month)</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <select
                                                value={Number(filters.vsToYear) || new Date().getFullYear()}
                                                onChange={(e) => setFilters({ ...filters, vsToYear: Number(e.target.value) })}
                                                className="w-full px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                {yearOptionsForVs.map((y) => (
                                                    <option key={`vs-to-y-${y}`} value={y}>{y}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={Number(filters.vsToMonth) || 12}
                                                onChange={(e) => setFilters({ ...filters, vsToMonth: Number(e.target.value) })}
                                                className="w-full px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                                    <option key={`vs-to-m-${m}`} value={m}>{String(m).padStart(2, '0')}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: colors.textMain }}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(filters.vsLyByAccountType)}
                                                onChange={(e) =>
                                                    setFilters({ ...filters, vsLyByAccountType: e.target.checked })
                                                }
                                                className="w-4 h-4 rounded"
                                                style={{ accentColor: colors.primary }}
                                            />
                                            By account type
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: colors.textMain }}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(filters.vsLyByRequestSegment)}
                                                onChange={(e) =>
                                                    setFilters({ ...filters, vsLyByRequestSegment: e.target.checked })
                                                }
                                                className="w-4 h-4 rounded"
                                                style={{ accentColor: colors.primary }}
                                            />
                                            By request segment
                                        </label>
                                    </div>
                                </div>
                            )}

                            {selectedEntity === 'Promotions' && (
                                <div className="mb-4 space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium mb-2" style={{ color: colors.textMuted }}>From (Year / Month)</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <select
                                                value={Number(filters.promotionsFromYear) || new Date().getFullYear()}
                                                onChange={(e) => setFilters({ ...filters, promotionsFromYear: Number(e.target.value) })}
                                                className="w-full px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                {yearOptionsForVs.map((y) => (
                                                    <option key={`from-y-${y}`} value={y}>{y}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={Number(filters.promotionsFromMonth) || 1}
                                                onChange={(e) => setFilters({ ...filters, promotionsFromMonth: Number(e.target.value) })}
                                                className="w-full px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                                    <option key={`from-m-${m}`} value={m}>{String(m).padStart(2, '0')}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium mb-2" style={{ color: colors.textMuted }}>To (Year / Month)</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <select
                                                value={Number(filters.promotionsToYear) || new Date().getFullYear()}
                                                onChange={(e) => setFilters({ ...filters, promotionsToYear: Number(e.target.value) })}
                                                className="w-full px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                {yearOptionsForVs.map((y) => (
                                                    <option key={`to-y-${y}`} value={y}>{y}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={Number(filters.promotionsToMonth) || 12}
                                                onChange={(e) => setFilters({ ...filters, promotionsToMonth: Number(e.target.value) })}
                                                className="w-full px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                                style={{ borderColor: colors.border, color: colors.textMain }}
                                            >
                                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                                    <option key={`to-m-${m}`} value={m}>{String(m).padStart(2, '0')}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium mb-2" style={{ color: colors.textMuted }}>Promotions</label>
                                        <div className="max-h-36 overflow-y-auto pr-1 space-y-1">
                                            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: colors.textMain }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!filters.promotionsSelectedIds?.length}
                                                    onChange={() => setFilters({ ...filters, promotionsSelectedIds: [] })}
                                                    className="w-4 h-4 rounded"
                                                    style={{ accentColor: colors.primary }}
                                                />
                                                All promotions
                                            </label>
                                            {(promotionsData || []).map((p: any) => {
                                                const id = String(p?.id || '');
                                                const sel = Array.isArray(filters.promotionsSelectedIds) && filters.promotionsSelectedIds.includes(id);
                                                return (
                                                    <label key={id} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: colors.textMain }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={sel}
                                                            onChange={() => {
                                                                const cur: string[] = Array.isArray(filters.promotionsSelectedIds) ? filters.promotionsSelectedIds : [];
                                                                const next = sel ? cur.filter((x) => x !== id) : [...cur, id];
                                                                setFilters({ ...filters, promotionsSelectedIds: next });
                                                            }}
                                                            className="w-4 h-4 rounded"
                                                            style={{ accentColor: colors.primary }}
                                                        />
                                                        {String(p?.name || id)}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {showDateFilters && (
                                <div className="mb-4">
                                    <label className="block text-xs font-medium mb-2" style={{ color: colors.textMuted }}>Date range</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="date"
                                            value={filters.dateRange.start}
                                            onChange={(e) => setFilters({ ...filters, dateRange: { ...filters.dateRange, start: e.target.value } })}
                                            className="px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        />
                                        <input
                                            type="date"
                                            value={filters.dateRange.end}
                                            onChange={(e) => setFilters({ ...filters, dateRange: { ...filters.dateRange, end: e.target.value } })}
                                            className="px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        />
                                    </div>
                                </div>
                            )}

                            {showStatusFilters && (
                                <div className="mb-4">
                                    <label className="block text-xs font-medium mb-2" style={{ color: colors.textMuted }}>Status</label>
                                    <div className="flex flex-wrap gap-2">
                                        {statusOptions.map((status) => (
                                            <button
                                                key={status}
                                                type="button"
                                                onClick={() => toggleStatus(status)}
                                                className={`px-3 py-1 rounded-full text-xs border transition-all ${filters.statuses.includes(status) ? 'border-2' : ''}`}
                                                style={{
                                                    borderColor: filters.statuses.includes(status) ? colors.primary : colors.border,
                                                    backgroundColor: filters.statuses.includes(status) ? colors.primary + '20' : colors.bg,
                                                    color: filters.statuses.includes(status) ? colors.primary : colors.textMuted,
                                                }}
                                            >
                                                {status}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {showValueFilters && (
                                <div>
                                    <label className="block text-xs font-medium mb-2" style={{ color: colors.textMuted }}>{`Value range (${selectedCurrency})`}</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="number"
                                            value={Math.round(convertSarToCurrency(Number(filters.valueRange.min) || 0, selectedCurrency))}
                                            onChange={(e) => setFilters({ ...filters, valueRange: { ...filters.valueRange, min: convertCurrencyToSar(Number(e.target.value), selectedCurrency) } })}
                                            className="px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        />
                                        <input
                                            type="number"
                                            value={Math.round(convertSarToCurrency(Number(filters.valueRange.max) || 0, selectedCurrency))}
                                            onChange={(e) => setFilters({ ...filters, valueRange: { ...filters.valueRange, max: convertCurrencyToSar(Number(e.target.value), selectedCurrency) } })}
                                            className="px-3 py-2 rounded border bg-black/20 text-sm outline-none"
                                            style={{ borderColor: colors.border, color: colors.textMain }}
                                        />
                                    </div>
                                </div>
                            )}

                            {showAccountFilters && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium mb-2" style={{ color: colors.textMuted }}>Account Type</label>
                                        <div className="flex flex-wrap gap-2">
                                            {accountTypeFilterOptions.map((typeName) => (
                                                <button
                                                    key={typeName}
                                                    type="button"
                                                    onClick={() => toggleArrayFilter('accountTypes', typeName)}
                                                    className={`px-3 py-1 rounded-full text-xs border transition-all ${filters.accountTypes.includes(typeName) ? 'border-2' : ''}`}
                                                    style={{
                                                        borderColor: filters.accountTypes.includes(typeName) ? colors.primary : colors.border,
                                                        backgroundColor: filters.accountTypes.includes(typeName) ? colors.primary + '20' : colors.bg,
                                                        color: filters.accountTypes.includes(typeName) ? colors.primary : colors.textMuted,
                                                    }}
                                                >
                                                    {typeName}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>Columns</h3>
                            {isVsLySource ? (
                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                    <p className="text-xs mb-2" style={{ color: colors.textMuted }}>
                                        Check which rows to include in the preview and in CSV, Excel, and PDF exports.
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                        {vsLyColumnToggleItems.map((item) => (
                                            <label
                                                key={item.key}
                                                className="flex items-start gap-2 cursor-pointer rounded-md px-1 py-0.5 hover:bg-white/5"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={!vsLyRowHidden.has(item.key)}
                                                    onChange={() => toggleVsLyRowInReport(item.key)}
                                                    className="w-4 h-4 rounded mt-0.5 shrink-0"
                                                    style={{ accentColor: colors.primary }}
                                                />
                                                <span className="text-xs leading-snug break-words" style={{ color: colors.textMain }}>
                                                    {item.isSectionHeader ? (
                                                        <span className="font-bold uppercase tracking-wide" style={{ color: colors.primary }}>
                                                            {item.label}
                                                        </span>
                                                    ) : (
                                                        item.label
                                                    )}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                    {availableColumns[selectedEntity]?.map((column: string) => (
                                        <label key={column} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedColumns.includes(column)}
                                                onChange={() => toggleColumn(column)}
                                                className="w-4 h-4 rounded"
                                                style={{ accentColor: colors.primary }}
                                            />
                                            <span className="text-sm" style={{ color: colors.textMain }}>{column}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Data preview</h3>
                                {canPreviewRows && canUseSelectedSource ? (
                                    <button
                                        type="button"
                                        onClick={handleGeneratePreview}
                                        className="px-4 py-2 rounded flex items-center gap-2 hover:brightness-110 transition-all text-sm shrink-0"
                                        style={{ backgroundColor: colors.primary, color: '#000' }}
                                    >
                                        <RefreshCw size={16} /> Generate preview
                                    </button>
                                ) : (
                                    <p className="text-xs sm:text-right max-w-md" style={{ color: colors.textMuted }}>
                                        {canUseSelectedSource
                                            ? 'Row-by-row preview is off for your account. You can still configure filters and export.'
                                            : 'Select an allowed data source to continue.'}
                                    </p>
                                )}
                            </div>
                        </div>

                        {isVsMatrixPack && canUseSelectedSource && showPreview && vsLyRowsAll.length > 0 && (() => {
                            const vHead = vsLyRowsForDisplay.find((r) => r.rowKind !== 'sectionHeader' && Array.isArray(r.months)) || vsLyRowsForDisplay[0];
                            const dataColCount = 5 * (vHead?.months?.length || 12) + 5;
                            const itemAndDataColSpan = 1 + dataColCount;
                            return (
                            <div className="p-4 rounded-xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Year vs last year (monthly)</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {vsSummaryEntries.map(([label, value]) => (
                                        <div key={label} className="p-3 rounded-lg border bg-black/10" style={{ borderColor: colors.border }}>
                                            <p className="text-[10px] font-bold uppercase opacity-60" style={{ color: colors.textMuted }}>{label}</p>
                                            <p className="text-sm font-bold mt-1 break-words" style={{ color: colors.textMain }}>{String(value)}</p>
                                        </div>
                                    ))}
                                </div>
                                {vsLyRowsFiltered.length === 0 && (
                                    <p className="text-sm font-medium" style={{ color: colors.textMuted }}>
                                        All rows are hidden. Select at least one row in Columns to preview and export.
                                    </p>
                                )}
                                <div
                                    className="overflow-x-auto rounded-lg border"
                                    style={{ borderColor: colors.border, backgroundColor: colors.card }}
                                >
                                    <table className="w-full min-w-[1750px] text-xs" style={{ color: colors.textMain }}>
                                        <thead>
                                            <tr style={{ backgroundColor: colors.bg }}>
                                                <th
                                                    rowSpan={2}
                                                    className="text-left p-2 sticky left-0 z-20 min-w-[11rem] border-r align-bottom"
                                                    style={{ color: colors.textMuted, backgroundColor: colors.card, borderColor: colors.border }}
                                                >
                                                    Item
                                                </th>
                                                {vHead.months.map((mo: { month: number; monthLabel: string }) => (
                                                    <th
                                                        key={mo.month}
                                                        colSpan={5}
                                                        className="text-center p-2 border-b font-bold"
                                                        style={{
                                                            color: colors.primary,
                                                            borderColor: colors.border,
                                                            backgroundColor: colors.bg,
                                                        }}
                                                    >
                                                        {mo.monthLabel} (CY {reportPackAny.vsLyMeta?.year} / LY {reportPackAny.vsLyMeta?.yearLy})
                                                    </th>
                                                ))}
                                                <th
                                                    colSpan={5}
                                                    className="text-center p-2 font-bold"
                                                    style={{
                                                        color: colors.primary,
                                                        borderColor: colors.border,
                                                        backgroundColor: colors.bg,
                                                    }}
                                                >
                                                    YTD (selected period)
                                                </th>
                                            </tr>
                                            <tr style={{ backgroundColor: colors.bg }}>
                                                {vHead.months.map((mo: { month: number }) => (
                                                    <React.Fragment key={mo.month}>
                                                        <th
                                                            className="p-1.5 text-[10px] font-semibold"
                                                            style={{ color: colors.textMain, backgroundColor: colors.card, borderColor: colors.border }}
                                                        >
                                                            CY
                                                        </th>
                                                        <th
                                                            className="p-1.5 text-[10px] font-semibold"
                                                            style={{ color: colors.textMain, backgroundColor: colors.card, borderColor: colors.border }}
                                                        >
                                                            LY
                                                        </th>
                                                        <th
                                                            className="p-1.5 text-[10px] font-semibold"
                                                            style={{ color: colors.textMain, backgroundColor: colors.card, borderColor: colors.border }}
                                                        >
                                                            %
                                                        </th>
                                                        <th
                                                            className="p-1.5 text-[10px] font-semibold"
                                                            style={{ color: colors.textMain, backgroundColor: colors.card, borderColor: colors.border }}
                                                        >
                                                            OTB
                                                        </th>
                                                        <th
                                                            className="p-1.5 text-[10px] font-semibold"
                                                            style={{ color: colors.textMain, backgroundColor: colors.card, borderColor: colors.border }}
                                                        >
                                                            CY+OTB v LY
                                                        </th>
                                                    </React.Fragment>
                                                ))}
                                                {['CY', 'LY', '%', 'OTB', 'CY+OTB v LY'].map((h) => (
                                                    <th
                                                        key={h}
                                                        className="p-1.5 text-[10px] font-bold"
                                                        style={{ color: colors.primary, borderColor: colors.border, backgroundColor: colors.card }}
                                                    >
                                                        YTD {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {vsLyRowsForDisplay.length === 0 ? null : vsLyRowsForDisplay.map((r) => {
                                                if (r.rowKind === 'sectionHeader') {
                                                    return (
                                                        <tr key={r.id} style={{ backgroundColor: colors.bg }}>
                                                            <td
                                                                colSpan={itemAndDataColSpan}
                                                                className="p-2 text-xs font-bold uppercase tracking-wide border-t border-r"
                                                                style={{ color: colors.textMain, borderColor: colors.border }}
                                                            >
                                                                {r.label}
                                                            </td>
                                                        </tr>
                                                    );
                                                }
                                                const isTotal = r.rowKind === 'totalRevenue';
                                                const rowBg = isTotal ? colors.primary + '22' : colors.card;
                                                const labelBg = isTotal ? colors.primary + '2e' : colors.card;
                                                const ytdBg = colors.bg;
                                                return (
                                                <tr
                                                    key={r.id}
                                                    style={{
                                                        borderTop: `1px solid ${colors.border}`,
                                                        backgroundColor: rowBg,
                                                    }}
                                                >
                                                    <td
                                                        className="p-2 font-medium text-xs align-top sticky left-0 z-10 border-r max-w-[16rem]"
                                                        style={{ color: colors.textMain, backgroundColor: labelBg, borderColor: colors.border }}
                                                    >
                                                        {r.label}
                                                    </td>
                                                    {r.months.map((mo) => (
                                                        <React.Fragment key={`${r.id}-m${mo.month}`}>
                                                            <td className="p-1.5 font-mono align-top whitespace-pre-wrap" style={{ color: colors.textMain, maxWidth: '8rem' }}>{mo.cy}</td>
                                                            <td className="p-1.5 font-mono align-top whitespace-pre-wrap" style={{ color: colors.textMain, maxWidth: '8rem' }}>{mo.ly}</td>
                                                            <td className="p-1.5 font-mono align-top font-bold" style={pctClass(mo.pct)}>{mo.pct}</td>
                                                            <td className="p-1.5 font-mono align-top whitespace-pre-wrap" style={{ color: colors.textMain, maxWidth: '8rem' }}>{mo.otb}</td>
                                                            <td className="p-1.5 font-mono align-top font-bold" style={pctClass(mo.cyOtbVsLyPct)}>{mo.cyOtbVsLyPct}</td>
                                                        </React.Fragment>
                                                    ))}
                                                    <td className="p-1.5 font-mono align-top" style={{ color: colors.textMain, backgroundColor: ytdBg }}>{r.ytd.cy}</td>
                                                    <td className="p-1.5 font-mono align-top" style={{ color: colors.textMain, backgroundColor: ytdBg }}>{r.ytd.ly}</td>
                                                    <td className="p-1.5 font-mono font-bold" style={{ ...pctClass(r.ytd.pct), backgroundColor: ytdBg }}>{r.ytd.pct}</td>
                                                    <td className="p-1.5 font-mono align-top" style={{ color: colors.textMain, backgroundColor: ytdBg }}>{r.ytd.otb}</td>
                                                    <td className="p-1.5 font-mono font-bold" style={{ ...pctClass(r.ytd.cyOtbVsLyPct), backgroundColor: ytdBg }}>{r.ytd.cyOtbVsLyPct}</td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            );
                        })()}

                        {showPreview && canPreviewRows && canUseSelectedSource && !isVsMatrixPack && (
                            <div className="p-4 rounded-xl border space-y-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {Object.entries(reportPack.summary).map(([label, value]) => (
                                        <div key={label} className="p-3 rounded-lg border bg-black/10" style={{ borderColor: colors.border }}>
                                            <p className="text-[10px] font-bold uppercase opacity-60" style={{ color: colors.textMuted }}>{label}</p>
                                            <p className="text-sm font-bold mt-1" style={{ color: colors.textMain }}>{String(value)}</p>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-sm" style={{ color: colors.textMuted }}>Showing {displayedPreviewData.length} rows</p>
                                {selectedEntity === 'Promotions' ? (
                                <div className="overflow-x-auto rounded-lg border" style={{ borderColor: colors.border }}>
                                    {(() => {
                                        const periodList: any[] = Array.isArray(reportPackAny.promotionsPeriods) ? reportPackAny.promotionsPeriods : [];
                                        return (
                                    <table className="w-full min-w-[1800px] text-xs" style={{ color: colors.textMain }}>
                                        <thead>
                                            <tr style={{ backgroundColor: colors.bg }}>
                                                <th rowSpan={2} className="text-left p-2 sticky left-0 z-20 min-w-[18rem] border-r align-bottom" style={{ color: colors.textMuted, backgroundColor: colors.card, borderColor: colors.border }}>Promotion / Metric</th>
                                                {periodList.map((p: any) => (
                                                    <th key={p.key} colSpan={3} className="text-center p-2 border-b font-bold" style={{ color: colors.primary, borderColor: colors.border, backgroundColor: colors.bg }}>
                                                        {p.label}
                                                    </th>
                                                ))}
                                                <th colSpan={2} className="text-center p-2 font-bold" style={{ color: colors.primary, borderColor: colors.border, backgroundColor: colors.bg }}>
                                                    YTD
                                                </th>
                                            </tr>
                                            <tr style={{ backgroundColor: colors.bg }}>
                                                {periodList.map((_: any, i: number) => (
                                                    <React.Fragment key={`sub-${i}`}>
                                                        <th className="p-1.5 text-[10px] font-semibold" style={{ color: colors.textMain, backgroundColor: colors.card }}>Req</th>
                                                        <th className="p-1.5 text-[10px] font-semibold" style={{ color: colors.textMain, backgroundColor: colors.card }}>Amount</th>
                                                        <th className="p-1.5 text-[10px] font-semibold" style={{ color: colors.textMain, backgroundColor: colors.card }}>LM %</th>
                                                    </React.Fragment>
                                                ))}
                                                <th className="p-1.5 text-[10px] font-bold" style={{ color: colors.primary, backgroundColor: colors.card }}>Req</th>
                                                <th className="p-1.5 text-[10px] font-bold" style={{ color: colors.primary, backgroundColor: colors.card }}>Amount</th>
                                                <th className="p-1.5 text-[10px] font-bold" style={{ color: colors.primary, backgroundColor: colors.card }}>LM %</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(reportPackAny.promotionsMatrixRows || []).map((r: any, idx: number) => {
                                                if (r.rowKind === 'promotionHeader') {
                                                    return (
                                                        <tr key={`promo-${idx}`} style={{ backgroundColor: colors.primary + '20' }}>
                                                            <td colSpan={39} className="p-2 text-xs font-bold uppercase tracking-wide border-t border-r" style={{ color: colors.textMain, borderColor: colors.border }}>
                                                                {r.label}
                                                            </td>
                                                        </tr>
                                                    );
                                                }
                                                if (r.rowKind === 'sectionHeader') {
                                                    return (
                                                        <tr key={`section-${idx}`} style={{ backgroundColor: colors.bg }}>
                                                            <td colSpan={39} className="p-2 text-xs font-bold border-t border-r" style={{ color: colors.primary, borderColor: colors.border }}>
                                                                {r.label}
                                                            </td>
                                                        </tr>
                                                    );
                                                }
                                                return (
                                                    <tr key={`data-${idx}`} style={{ borderTop: `1px solid ${colors.border}`, backgroundColor: colors.card }}>
                                                        <td className="p-2 font-medium text-xs sticky left-0 z-10 border-r" style={{ color: colors.textMain, backgroundColor: colors.card, borderColor: colors.border }}>
                                                            {r.label}
                                                        </td>
                                                        {(r.months || []).map((mo: any, i: number) => {
                                                            const lmN = parseFloat(String(mo.lmPct || '').replace(/[^\d.-]/g, ''));
                                                            const lmStyle = Number.isNaN(lmN) ? { color: colors.textMuted } : (lmN >= 0 ? { color: colors.green || '#22c55e' } : { color: colors.red || '#ef4444' });
                                                            return (
                                                                <React.Fragment key={`m-${idx}-${i}`}>
                                                                    <td className="p-1.5 font-mono">{mo.requests}</td>
                                                                    <td className="p-1.5 font-mono">{mo.amount}</td>
                                                                    <td className="p-1.5 font-mono font-bold" style={lmStyle}>{mo.lmPct}</td>
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                        <td className="p-1.5 font-mono">{r.ytd?.requests ?? '—'}</td>
                                                        <td className="p-1.5 font-mono">{r.ytd?.amount || '—'}</td>
                                                        <td className="p-1.5 font-mono font-bold" style={pctClass(r.ytd?.lmPct || '0%')}>{r.ytd?.lmPct || '—'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                        );
                                    })()}
                                </div>
                                ) : (
                                <div className="overflow-x-auto rounded-lg border" style={{ borderColor: colors.border }}>
                                    <table className="w-full">
                                        <thead>
                                            <tr style={{ backgroundColor: colors.bg }}>
                                                {selectedColumns.map((col) => (
                                                    <th key={col} className="text-left p-3 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                                                        {col}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayedPreviewData.map((row: any, idx: number) => (
                                                <tr key={`${row['Request ID'] || row.ID || 'row'}-${idx}`} className="hover:bg-white/5 transition-colors" style={{ borderTop: `1px solid ${colors.border}` }}>
                                                    {selectedColumns.map((col) => {
                                                        const rawVal = row[col] != null && row[col] !== '' ? String(row[col]) : '—';
                                                        // Promotions uses the matrix branch above; this arm is non-Promotions only.
                                                        const textColor = colors.textMain;
                                                        return (
                                                            <td key={col} className="p-3 text-sm" style={{ color: colors.textMain }}>
                                                                {(() => {
                                                                    const lines = rawVal
                                                                        .split('\n')
                                                                        .map((x) => x.trim())
                                                                        .filter(Boolean);
                                                                    if (lines.length <= 1) {
                                                                        return <span style={{ color: textColor }}>{rawVal}</span>;
                                                                    }
                                                                    return (
                                                                        <div style={{ color: textColor }}>
                                                                            {lines.map((line, lineIdx) => (
                                                                                <div
                                                                                    key={`${col}-${lineIdx}`}
                                                                                    style={{
                                                                                        padding: '2px 0',
                                                                                        borderTop: lineIdx ? `1px solid ${colors.border}` : 'none',
                                                                                    }}
                                                                                >
                                                                                    {line}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                )}
                            </div>
                        )}

                        <div className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: colors.textMuted }}>Export options</h3>

                            <div className="grid grid-cols-3 gap-3 mb-4">
                                {[
                                    { id: 'pdf', label: 'PDF', icon: FileText, color: colors.red },
                                    { id: 'excel', label: 'Excel', icon: FileSpreadsheet, color: colors.green },
                                    { id: 'csv', label: 'CSV', icon: FileDown, color: colors.blue },
                                ].map((format) => {
                                    const Icon = format.icon;
                                    return (
                                        <button
                                            key={format.id}
                                            type="button"
                                            onClick={() => setExportFormat(format.id as 'pdf' | 'excel' | 'csv')}
                                            className={`p-4 rounded-lg border transition-all ${exportFormat === format.id ? 'border-2' : ''}`}
                                            style={{
                                                borderColor: exportFormat === format.id ? colors.primary : colors.border,
                                                backgroundColor: exportFormat === format.id ? colors.primary + '10' : colors.bg,
                                            }}
                                        >
                                            <Icon size={24} className="mx-auto mb-2" style={{ color: format.color }} />
                                            <p className="text-sm font-medium" style={{ color: colors.textMain }}>{format.label}</p>
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                type="button"
                                disabled={
                                    !canUseSelectedSource ||
                                    (!isVsMatrixPack && !reportPack.rows.length) ||
                                    (isVsMatrixPack && (!vsLyRowsAll.length || !vsLyRowsFiltered.length))
                                }
                                onClick={handleExport}
                                className="w-full py-3 rounded flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
                                style={{ backgroundColor: colors.green, color: '#000' }}
                            >
                                <Download size={18} />
                                {isVsMatrixPack
                                    ? `Export (${exportFormat === 'pdf' ? 'print / PDF' : exportFormat === 'excel' ? 'Excel' : 'CSV'})`
                                    : `Export as ${exportFormat.toUpperCase()}`}
                            </button>
                        </div>
                    </div>
                </div>
                )}
            </div>
        </div>
    );
}

