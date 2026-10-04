import { normalizeRequestTypeKey } from './requestTypeUtils';
import { formatCurrencyAmount, type CurrencyCode } from './currency';
import {
    ACCOUNT_TYPE_LABEL_SYNONYMS,
    matchRawToPropertyLabel,
    normalizeTaxonomyStringList,
    REQUEST_SEGMENT_LABEL_SYNONYMS,
    UNMAPPED_TAXONOMY_LABEL,
} from './propertyTaxonomy';
import { addProratedRequestFinancialsToDashboardBuckets } from './operationalSegmentRevenue';
import { transportRowAmount } from './beoShared';

export type VsLyKind = 'rooms' | 'mice' | 'full';

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

function parseYmd(v: any): string {
    const raw = String(v || '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function ymdBoundsForCalendarMonth(year: number, month1to12: number): { start: string; end: string } {
    const start = `${year}-${String(month1to12).padStart(2, '0')}-01`;
    const last = new Date(year, month1to12, 0);
    const end = `${year}-${String(month1to12).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
    return { start, end };
}

function computeMiceChartRevenueInMonth(r: any, year: number, month1to12: number): { eventRev: number; roomsRev: number; comb: number } {
    const { start, end } = ymdBoundsForCalendarMonth(year, month1to12);
    const bucket = {
        revenue: 0,
        rooms: 0,
        roomNights: 0,
        roomsRevenue: 0,
        miceRequests: 0,
        miceRevenue: 0,
        miceRoomsRevenue: 0,
    };
    addProratedRequestFinancialsToDashboardBuckets(
        r,
        start,
        end,
        () => 'month',
        (key) => (key === 'month' ? bucket : undefined),
        {
            skipPerf: false,
            includeRoomsChart: false,
            includeMiceChart: filterTypeMice(r),
            roomsChartBucketGranularity: 'month',
        }
    );
    const eventRev = Number(bucket.miceRevenue || 0);
    const roomsRev = Number(bucket.miceRoomsRevenue || 0);
    return { eventRev, roomsRev, comb: eventRev + roomsRev };
}

function computeRoomsChartMetricsInMonth(
    r: any,
    year: number,
    month1to12: number
): { rev: number; roomNights: number; rooms: number } {
    const { start, end } = ymdBoundsForCalendarMonth(year, month1to12);
    const bucket = {
        revenue: 0,
        rooms: 0,
        roomNights: 0,
        roomsRevenue: 0,
        miceRequests: 0,
        miceRevenue: 0,
        miceRoomsRevenue: 0,
    };
    addProratedRequestFinancialsToDashboardBuckets(
        r,
        start,
        end,
        () => 'month',
        (key) => (key === 'month' ? bucket : undefined),
        {
            skipPerf: false,
            includeRoomsChart: true,
            includeMiceChart: false,
            roomsChartBucketGranularity: 'month',
        }
    );
    return {
        rev: Number(bucket.roomsRevenue || 0),
        roomNights: Number(bucket.roomNights || 0),
        rooms: Number(bucket.rooms || 0),
    };
}

function requestPrimaryDate(r: any): string {
    const d =
        r.receivedDate || r.requestDate || r.checkIn || (typeof r.createdAt === 'string' ? r.createdAt.split('T')[0] : '');
    return String(d || '').slice(0, 10);
}

/** Month bucket: room stay in-date, else first MICE agenda day, else received/created. */
function bucketYmdForRequest(r: any): string {
    const fromRooms = parseYmd(r?.checkIn);
    if (fromRooms) return fromRooms;
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    let firstAg = '';
    for (const row of agenda) {
        const s = parseYmd(row?.startDate);
        if (s && (!firstAg || s < firstAg)) firstAg = s;
    }
    if (firstAg) return firstAg;
    return requestPrimaryDate(r);
}

function dateAtYmd(ymd: string): Date | null {
    const s = String(ymd || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** [arrival, departure) hotel nights — each calendar night. */
function forEachStayNight(arrival: Date, departure: Date, fn: (d: Date) => void) {
    const c = new Date(arrival.getTime());
    c.setHours(0, 0, 0, 0);
    const end = new Date(departure.getTime());
    end.setHours(0, 0, 0, 0);
    if (!(end.getTime() > c.getTime())) return;
    const cur = new Date(c.getTime());
    while (cur < end) {
        fn(new Date(cur.getTime()));
        cur.setDate(cur.getDate() + 1);
    }
}

function countNightsInStayWindow(arrival: Date, departure: Date): number {
    let n = 0;
    forEachStayNight(arrival, departure, () => {
        n += 1;
    });
    return n;
}

/**
 * Rooms revenue and room-nights in a specific calendar month (per room line; series groups each use their own window).
 * Falls back to prorated {@link computeRequestRevenueBreakdownNoTax} across check-in→check-out nights, then single bucket month.
 */
function getRoomsRevAndNightsInMonth(
    r: any,
    year: number,
    month1to12: number
): { rev: number; roomNights: number } {
    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    const reqIn = parseYmd(r?.checkIn);
    const reqOut = parseYmd(r?.checkOut);
    const reqA = dateAtYmd(reqIn);
    const reqB = dateAtYmd(reqOut);
    const reqNights =
        reqA && reqB && reqB.getTime() > reqA.getTime() ? countNightsInStayWindow(reqA, reqB) : 0;
    const bucket = parseYmd(bucketYmdForRequest(r));
    let rev = 0;
    let roomNights = 0;
    let hasUndatedRoomRows = false;
    for (const row of rooms) {
        const count = Math.max(0, Number(row?.count || 0));
        const rate = Number(row?.rate || 0);
        if (count <= 0) continue;
        const rowArrival = parseYmd(row?.arrival);
        const rowDeparture = parseYmd(row?.departure);
        if (!rowArrival || !rowDeparture) {
            hasUndatedRoomRows = true;
            if (bucket) {
                const yb = parseInt(bucket.slice(0, 4), 10);
                const mo = parseInt(bucket.slice(5, 7), 10);
                if (yb === year && mo === month1to12 && reqNights > 0) {
                    rev += count * rate * reqNights;
                    roomNights += count * reqNights;
                }
            }
            continue;
        }
        const inStr = parseYmd(rowArrival || reqIn);
        const outStr = parseYmd(rowDeparture || reqOut);
        if (!inStr || !outStr) continue;
        const a = dateAtYmd(inStr);
        const b = dateAtYmd(outStr);
        if (!a || !b) continue;
        forEachStayNight(a, b, (d) => {
            if (d.getFullYear() === year && d.getMonth() + 1 === month1to12) {
                rev += count * rate;
                roomNights += count;
            }
        });
    }
    if (rev > 0 || roomNights > 0) {
        return { rev, roomNights };
    }
    if (rooms.length > 0 && hasUndatedRoomRows) {
        return { rev: 0, roomNights: 0 };
    }
    const ntax = computeRequestRevenueBreakdownNoTax(r);
    if (ntax.roomsRevenue <= 0) {
        return { rev: 0, roomNights: 0 };
    }
    const a = dateAtYmd(parseYmd(r?.checkIn));
    const b = dateAtYmd(parseYmd(r?.checkOut));
    if (a && b && b.getTime() > a.getTime()) {
        const totalN = countNightsInStayWindow(a, b);
        if (totalN > 0) {
            const perNight = ntax.roomsRevenue / totalN;
            const br = calculateRoomBlockForReport(r);
            const rnPerCalNight = br.roomNights / totalN;
            forEachStayNight(a, b, (d) => {
                if (d.getFullYear() === year && d.getMonth() + 1 === month1to12) {
                    rev += perNight;
                    roomNights += rnPerCalNight;
                }
            });
            if (rev > 0 || roomNights > 0) {
                return { rev, roomNights };
            }
        }
    }
    if (bucket) {
        const yb = parseInt(bucket.slice(0, 4), 10);
        const mo = parseInt(bucket.slice(5, 7), 10);
        if (yb === year && mo === month1to12) {
            const br = calculateRoomBlockForReport(r);
            return { rev: ntax.roomsRevenue, roomNights: br.roomNights };
        }
    }
    return { rev: 0, roomNights: 0 };
}

/** Event revenue in calendar month: each agenda day gets (rate*pax+rental); multi-day = rowCost per calendar day. */
function getEventRevInMonth(r: any, year: number, month1to12: number): number {
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    let ev = 0;
    for (const item of agenda) {
        if (!item || typeof item !== 'object') continue;
        const startS = parseYmd(item.startDate);
        const endS = parseYmd(item.endDate || item.startDate);
        if (!startS) continue;
        const start = dateAtYmd(startS);
        const end = dateAtYmd(endS || startS);
        if (!start || !end) continue;
        const ms = end.getTime() - start.getTime();
        const rowDays = Number.isNaN(ms) ? 1 : Math.max(1, Math.floor(ms / 86400000) + 1);
        const rowCost = Number(item.rate || 0) * Number(item.pax || 0) + Number(item.rental || 0);
        const c = new Date(start.getTime());
        c.setHours(0, 0, 0, 0);
        const endInc = new Date(end.getTime());
        endInc.setHours(0, 0, 0, 0);
        const cursor = new Date(c.getTime());
        while (cursor <= endInc) {
            if (cursor.getFullYear() === year && cursor.getMonth() + 1 === month1to12) {
                ev += rowCost;
            }
            cursor.setDate(cursor.getDate() + 1);
        }
    }
    if (ev > 0) return ev;
    const ntax = computeRequestRevenueBreakdownNoTax(r);
    if (ntax.eventRevenue > 0) {
        const b = parseYmd(bucketYmdForRequest(r));
        if (b) {
            const y = parseInt(b.slice(0, 4), 10);
            const mo = parseInt(b.slice(5, 7), 10);
            if (y === year && mo === month1to12) return ntax.eventRevenue;
        }
    }
    return 0;
}

function getEventPaxInMonth(r: any, year: number, month1to12: number): number {
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    let w = 0;
    for (const item of agenda) {
        if (!item || typeof item !== 'object') continue;
        const startS = parseYmd(item.startDate);
        const endS = parseYmd(item.endDate || item.startDate);
        if (!startS) continue;
        const start = dateAtYmd(startS);
        const end = dateAtYmd(endS || startS);
        if (!start || !end) continue;
        const ms = end.getTime() - start.getTime();
        const rowDays = Number.isNaN(ms) ? 1 : Math.max(1, Math.floor(ms / 86400000) + 1);
        let inMonth = 0;
        const cursor = new Date(start.getTime());
        cursor.setHours(0, 0, 0, 0);
        const endInc = new Date(end.getTime());
        endInc.setHours(0, 0, 0, 0);
        while (cursor <= endInc) {
            if (cursor.getFullYear() === year && cursor.getMonth() + 1 === month1to12) inMonth += 1;
            cursor.setDate(cursor.getDate() + 1);
        }
        if (inMonth > 0 && rowDays > 0) {
            w += (Number(item.pax || 0) * inMonth) / rowDays;
        }
    }
    return w;
}

function requestHasRoomsActivityInMonth(r: any, year: number, month1to12: number): boolean {
    const m = computeRoomsChartMetricsInMonth(r, year, month1to12);
    return m.rev > 0 || m.roomNights > 0 || m.rooms > 0;
}

function requestHasMiceActivityInMonth(r: any, year: number, month1to12: number): boolean {
    return computeMiceChartRevenueInMonth(r, year, month1to12).comb > 0;
}

function requestTouchesYear(r: any, y: number, kind: VsLyKind): boolean {
    for (let m = 1; m <= 12; m += 1) {
        if (kind === 'rooms' ? requestHasRoomsActivityInMonth(r, y, m) : requestHasMiceActivityInMonth(r, y, m)) {
            return true;
        }
    }
    return false;
}

function requestTouchesAnyMonth(
    r: any,
    y: number,
    months: Set<number>,
    kind: VsLyKind
): boolean {
    for (let m = 1; m <= 12; m += 1) {
        if (!months.has(m)) continue;
        if (kind === 'rooms' ? requestHasRoomsActivityInMonth(r, y, m) : requestHasMiceActivityInMonth(r, y, m)) {
            return true;
        }
    }
    return false;
}

function isExcludedCancelled(r: any): boolean {
    const s = String(r?.status || '')
        .trim()
        .toLowerCase();
    return s === 'cancelled' || s === 'lost';
}

function isDefAct(r: any): boolean {
    const s = String(r?.status || '')
        .trim()
        .toLowerCase();
    return s === 'definite' || s === 'actual';
}

/**
 * “Pipeline / OTB” = every non-won, non-actualized request (same bucket as the rest of the hotel after D&A),
 * not only inquiry / accepted / tentative. Aligns with dashboard + Requests report: all non-excluded
 * statuses that are not Definite or Actual (excl. cancelled and lost; anything else, e.g. custom DB status,
 * counts here so it is not dropped from the matrix).
 */
function isOtbPipeline(r: any): boolean {
    if (isExcludedCancelled(r)) return false;
    if (isDefAct(r)) return false;
    return true;
}

function asNumber(v: any): number {
    return parseFloat(String(v ?? 0).replace(/,/g, '')) || 0;
}

export function computeRequestRevenueBreakdownNoTax(r: any): {
    roomsRevenue: number;
    eventRevenue: number;
    transportRevenue: number;
    totalLineNoTax: number;
} {
    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    const transport = Array.isArray(r?.transportation) ? r.transportation : [];
    const reqNights = (() => {
        const inDate = parseYmd(r?.checkIn);
        const outDate = parseYmd(r?.checkOut);
        if (!inDate || !outDate) return 0;
        const ms = new Date(`${outDate}T00:00:00`).getTime() - new Date(`${inDate}T00:00:00`).getTime();
        if (Number.isNaN(ms)) return 0;
        return Math.max(0, Math.ceil(ms / 86400000));
    })();
    const roomsRevenue = rooms.reduce((sum: number, row: any) => {
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        const inDate = parseYmd(row?.arrival || r?.checkIn);
        const outDate = parseYmd(row?.departure || r?.checkOut);
        let nights = reqNights;
        if (inDate && outDate) {
            const ms = new Date(`${outDate}T00:00:00`).getTime() - new Date(`${inDate}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) nights = Math.max(0, Math.ceil(ms / 86400000));
        }
        return sum + count * rate * nights;
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
        return sum + rowCost * rowDays;
    }, 0);
    const transportRevenue = transport.reduce((sum: number, row: any) => sum + transportRowAmount(row), 0);
    let lineSum = roomsRevenue + eventRevenue + transportRevenue;
    const storedNoTax = asNumber(
        r?.grandTotalNoTax ?? r?.totalCostNoTax ?? r?.totalCost ?? r?.grandTotal ?? r?.totalAmount ?? 0
    );
    if (lineSum <= 0 && storedNoTax > 0) {
        const t = String(r?.requestType || '').toLowerCase();
        const miceLike =
            t === 'event' || t === 'event_rooms' || t.includes('series') || t.includes('event with');
        if (miceLike) {
            eventRevenue = storedNoTax;
            lineSum = roomsRevenue + eventRevenue + transportRevenue;
        } else {
            return {
                roomsRevenue: storedNoTax,
                eventRevenue: 0,
                transportRevenue: 0,
                totalLineNoTax: storedNoTax,
            };
        }
    }
    return {
        roomsRevenue,
        eventRevenue,
        transportRevenue,
        totalLineNoTax: lineSum,
    };
}

function calculateNights(inDate: string, outDate: string) {
    if (!inDate || !outDate) return 0;
    const diff = new Date(outDate).getTime() - new Date(inDate).getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function calculateRoomBlockForReport(r: any) {
    const rooms = Array.isArray(r.rooms) ? r.rooms : [];
    const reqNights = calculateNights(String(r.checkIn || ''), String(r.checkOut || ''));
    let roomNights = 0;
    let roomRevenue = 0;
    let weightedRate = 0;
    for (const room of rooms) {
        const count = Number(room?.count || 0);
        const rate = Number(room?.rate || 0);
        const nights =
            normalizeRequestTypeKey(r.requestType) === 'series'
                ? calculateNights(String(room?.arrival || ''), String(room?.departure || ''))
                : reqNights;
        const n = Math.max(0, nights) * Math.max(0, count);
        roomNights += n;
        roomRevenue += n * rate;
        weightedRate += rate * n;
    }
    const avgAdr = roomNights > 0 ? weightedRate / roomNights : 0;
    return { roomNights, roomRevenue, avgAdr, reqNights };
}

function calculateEventPax(r: any) {
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    return agenda.reduce((sum: number, row: any) => sum + (Number(row?.pax || 0) || 0), 0);
}

/** Avoid NBSP and exotic dashes in exports / Excel. */
function fmtMoney(n: number, currency: CurrencyCode): string {
    return formatPlainMoney(n, currency);
}

function formatPlainMoney(n: number, currency: CurrencyCode): string {
    const raw = formatCurrencyAmount(n, currency, { maximumFractionDigits: 0 });
    return raw.replace(/\u00a0/g, ' ').replace(/\u202f/g, ' ').replace(/[\u2012\u2013\u2014\u2212]/g, '-');
}

function fmtPct(cy: number, ly: number): string {
    if (ly > 0) {
        const p = ((cy - ly) / ly) * 100;
        return `${p >= 0 ? '+' : ''}${Math.round(p * 10) / 10}%`;
    }
    /* LY = 0: no comparable baseline — show '-' (avoids +100% and Excel mojibake from special chars) */
    if (cy === 0 && ly === 0) return '0%';
    return '-';
}

/** % change of (definite+actual + OTB pipeline) vs same month LY (additive metrics only). */
function fmtCyOtbVsLyPct(cy: number, otb: number, ly: number): string {
    return fmtPct(cy + otb, ly);
}

export interface VsLyMonthCol {
    month: number;
    monthLabel: string;
    /** Definite + Actual — chosen year */
    cy: string;
    /** Definite + Actual — last year (same month) */
    ly: string;
    /** % change vs LY (numeric rows only) */
    pct: string;
    /** OTB: non–Definite/Actual pipeline (all other non-cancelled lost-excluded statuses; chosen year, same month) */
    otb: string;
    /** (CY D&A + OTB) vs LY D&A — % (additive rows only; '-' for non-additive e.g. ADR) */
    cyOtbVsLyPct: string;
}

export interface VsLyYtdCol {
    cy: string;
    ly: string;
    pct: string;
    otb: string;
    cyOtbVsLyPct: string;
}

export interface VsLyMatrixRow {
    id: string;
    label: string;
    isNumeric: boolean;
    months: VsLyMonthCol[];
    /** Full-year / YTD column after December */
    ytd: VsLyYtdCol;
    /**
     * When set, row visibility in Reports is tied to this key (one checkbox per segment name
     * across e.g. revenue and count blocks). Format: `acc:…` (account type) or `req:…` (request segment).
     */
    segmentGroupKey?: string;
    rowKind?:
        | 'sectionHeader'
        | 'segmentAccountRev'
        | 'segmentRequestRev'
        | 'segmentAccountCount'
        | 'segmentRequestCount'
        | 'segmentAccount'
        | 'segmentRequest'
        | 'core'
        | 'totalRevenue';
}

function rawAccountTypeFromRequest(r: any, accounts: any[]): string {
    const fromReq = String(r?.accountType || '').trim();
    if (fromReq) return fromReq;
    const aid = String(r?.accountId || '').trim();
    const name = String(r?.accountName || r?.account || '')
        .trim()
        .toLowerCase();
    const acc = accounts.find(
        (a) => (aid && String(a.id) === aid) || (name && String(a.name || '').trim().toLowerCase() === name)
    );
    return String(acc?.type || '').trim();
}

function segmentKeyForRequest(
    r: any,
    which: 'account' | 'request',
    accounts: any[],
    propertyAccountTypes: string[],
    propertyRequestSegments: string[]
): string {
    if (which === 'account') {
        return matchRawToPropertyLabel(
            rawAccountTypeFromRequest(r, accounts),
            propertyAccountTypes,
            ACCOUNT_TYPE_LABEL_SYNONYMS
        );
    }
    return matchRawToPropertyLabel(
        String(r?.segment || '').trim(),
        propertyRequestSegments,
        REQUEST_SEGMENT_LABEL_SYNONYMS
    );
}

function collectRequestsTouchingMonth(
    pool: any[],
    year: number,
    month1to12: number,
    statusPick: (r: any) => boolean,
    kind: VsLyKind
) {
    return pool.filter((r) => {
        if (isExcludedCancelled(r)) return false;
        if (!statusPick(r)) return false;
        if (kind === 'rooms') {
            return requestHasRoomsActivityInMonth(r, year, month1to12);
        }
        return requestHasMiceActivityInMonth(r, year, month1to12);
    });
}

function buildSegMaps(reqs: any[], accounts: any[], which: 'account' | 'request') {
    const map: Record<string, number> = {};
    for (const r of reqs) {
        const k =
            which === 'account'
                ? rawAccountTypeFromRequest(r, accounts) || UNMAPPED_TAXONOMY_LABEL
                : String(r.segment || '').trim() || UNMAPPED_TAXONOMY_LABEL;
        map[k] = (map[k] || 0) + 1;
    }
    return map;
}

/** Definite/Actual or OTB slice for one calendar month (revenue prorated by night / agenda day). */
function roomsMetrics(
    reqs: any[],
    accounts: any[],
    _currency: CurrencyCode,
    year: number,
    month1to12: number
) {
    let roomNights = 0;
    let roomsRev = 0;
    for (const r of reqs) {
        const s = computeRoomsChartMetricsInMonth(r, year, month1to12);
        roomNights += s.roomNights;
        roomsRev += s.rev;
    }
    const adr = roomNights > 0 ? roomsRev / roomNights : 0;
    const count = reqs.length;
    const avg = count > 0 ? roomsRev / count : 0;
    return { rev: roomsRev, roomNights, adr, count, avg, acc: buildSegMaps(reqs, accounts, 'account'), req: buildSegMaps(reqs, accounts, 'request') };
}

function miceMetrics(
    reqs: any[],
    accounts: any[],
    _currency: CurrencyCode,
    year: number,
    month1to12: number
) {
    let eventRev = 0;
    let roomsRev = 0;
    let pax = 0;
    let roomNights = 0;
    for (const r of reqs) {
        const mice = computeMiceChartRevenueInMonth(r, year, month1to12);
        const s = getRoomsRevAndNightsInMonth(r, year, month1to12);
        roomsRev += mice.roomsRev;
        eventRev += mice.eventRev;
        pax += getEventPaxInMonth(r, year, month1to12);
        roomNights += s.roomNights;
    }
    const comb = eventRev + roomsRev;
    const count = reqs.length;
    const adr = roomNights > 0 ? roomsRev / roomNights : 0;
    const avg = count > 0 ? comb / count : 0;
    return { eventRev, roomsRev, comb, pax, adr, roomNights, count, avg, acc: buildSegMaps(reqs, accounts, 'account'), req: buildSegMaps(reqs, accounts, 'request') };
}

function roomsMetricsYtd(pool: any[], accounts: any[], _currency: CurrencyCode, y: number, months?: Set<number>) {
    let roomNights = 0;
    let roomsRev = 0;
    for (let mo = 1; mo <= 12; mo += 1) {
        if (months && !months.has(mo)) continue;
        for (const r of pool) {
            const s = computeRoomsChartMetricsInMonth(r, y, mo);
            roomNights += s.roomNights;
            roomsRev += s.rev;
        }
    }
    const adr = roomNights > 0 ? roomsRev / roomNights : 0;
    const count = pool.length;
    const avg = count > 0 ? roomsRev / count : 0;
    return { rev: roomsRev, roomNights, adr, count, avg, acc: buildSegMaps(pool, accounts, 'account'), req: buildSegMaps(pool, accounts, 'request') };
}

function miceMetricsYtd(pool: any[], accounts: any[], _currency: CurrencyCode, y: number, months?: Set<number>) {
    let eventRev = 0;
    let roomsRev = 0;
    let pax = 0;
    let roomNights = 0;
    for (let mo = 1; mo <= 12; mo += 1) {
        if (months && !months.has(mo)) continue;
        for (const r of pool) {
            const mice = computeMiceChartRevenueInMonth(r, y, mo);
            const s = getRoomsRevAndNightsInMonth(r, y, mo);
            roomsRev += mice.roomsRev;
            eventRev += mice.eventRev;
            pax += getEventPaxInMonth(r, y, mo);
            roomNights += s.roomNights;
        }
    }
    const comb = eventRev + roomsRev;
    const count = pool.length;
    const adr = roomNights > 0 ? roomsRev / roomNights : 0;
    const avg = count > 0 ? comb / count : 0;
    return { eventRev, roomsRev, comb, pax, adr, roomNights, count, avg, acc: buildSegMaps(pool, accounts, 'account'), req: buildSegMaps(pool, accounts, 'request') };
}

function filterTypeRooms(r: any) {
    const k = normalizeRequestTypeKey(r?.requestType);
    return k === 'accommodation' || k === 'series' || k === 'event_rooms';
}

/** MICE vs LY: only standalone events and event+rooms — excludes accommodation and series. */
function filterTypeMice(r: any) {
    const k = normalizeRequestTypeKey(r?.requestType);
    return k === 'event' || k === 'event_rooms';
}

export function buildYearOptionsForReports(requests: any[]): number[] {
    const set = new Set<number>();
    for (let y = 2023; y <= 2028; y += 1) set.add(y);
    const scan = (d: any) => {
        const s = String(d || '').trim().slice(0, 10);
        if (s.length >= 4) {
            const py = parseInt(s.slice(0, 4), 10);
            if (!Number.isNaN(py) && py > 2000 && py < 2100) set.add(py);
        }
    };
    for (const r of requests) {
        scan(r?.checkIn);
        scan(r?.checkOut);
        scan(r?.receivedDate);
        scan(r?.requestDate);
    }
    const dataMax = set.size ? Math.max(...[...set]) : 2028;
    for (let y = 2029; y <= Math.max(2028, dataMax); y += 1) set.add(y);
    return [...set].filter((y) => y >= 2000).sort((a, b) => a - b);
}

function countInSegment(
    reqs: any[],
    seg: string,
    which: 'account' | 'request',
    accounts: any[],
    propertyAccountTypes: string[],
    propertyRequestSegments: string[]
): number {
    return reqs.filter(
        (r) => segmentKeyForRequest(r, which, accounts, propertyAccountTypes, propertyRequestSegments) === seg
    ).length;
}

/** Rooms vs LY: rooms revenue only. MICE vs LY segment totals: events + rooms (no transport), prorated by month. */
function sumSegmentRevenue(
    reqs: any[],
    seg: string,
    which: 'account' | 'request',
    accounts: any[],
    revBasis: 'rooms' | 'comb',
    propertyAccountTypes: string[],
    propertyRequestSegments: string[],
    year: number,
    month1to12: number
): number {
    let sum = 0;
    for (const r of reqs) {
        if (
            segmentKeyForRequest(r, which, accounts, propertyAccountTypes, propertyRequestSegments) !== seg
        ) {
            continue;
        }
        const rooms = computeRoomsChartMetricsInMonth(r, year, month1to12).rev;
        if (revBasis === 'rooms') {
            sum += rooms;
        } else {
            sum += computeMiceChartRevenueInMonth(r, year, month1to12).comb;
        }
    }
    return sum;
}

function orderedSegmentRowNames(
    which: 'account' | 'request',
    propertyList: string[],
    pool: any[],
    accounts: any[],
    propertyAccountTypes: string[],
    propertyRequestSegments: string[]
): string[] {
    const base = normalizeTaxonomyStringList(propertyList);
    if (base.length) {
        const hasUnmapped = pool.some(
            (r) =>
                segmentKeyForRequest(r, which, accounts, propertyAccountTypes, propertyRequestSegments) ===
                UNMAPPED_TAXONOMY_LABEL
        );
        return hasUnmapped ? [...base, UNMAPPED_TAXONOMY_LABEL] : [...base];
    }
    const set = new Set<string>();
    for (const r of pool) {
        set.add(
            segmentKeyForRequest(r, which, accounts, propertyAccountTypes, propertyRequestSegments)
        );
    }
    return [...set].sort((a, b) => a.localeCompare(b));
}

function makeSectionHeaderRow(id: string, label: string): VsLyMatrixRow {
    const months: VsLyMonthCol[] = [];
    for (let m = 1; m <= 12; m += 1) {
        months.push({
            month: m,
            monthLabel: MONTHS[m - 1],
            cy: '',
            ly: '',
            pct: '',
            otb: '',
            cyOtbVsLyPct: '',
        });
    }
    return {
        id,
        label,
        isNumeric: false,
        months,
        ytd: { cy: '', ly: '', pct: '', otb: '', cyOtbVsLyPct: '' },
        rowKind: 'sectionHeader',
    };
}

function buildSegmentRevenueRows(
    pool: any[],
    accounts: any[],
    which: 'account' | 'request',
    idP: string,
    def: (m: number) => { dCy: any[]; dLy: any[]; otb: any[] },
    currency: CurrencyCode,
    revBasis: 'rooms' | 'comb',
    propertyAccountTypes: string[],
    propertyRequestSegments: string[],
    yearCy: number,
    yearLy: number
): VsLyMatrixRow[] {
    const propList = which === 'account' ? propertyAccountTypes : propertyRequestSegments;
    const names = orderedSegmentRowNames(
        which,
        propList,
        pool,
        accounts,
        propertyAccountTypes,
        propertyRequestSegments
    );
    const out: VsLyMatrixRow[] = [];
    names.forEach((seg, segIdx) => {
        const months: VsLyMonthCol[] = [];
        let tCy = 0;
        let tLy = 0;
        let tO = 0;
        for (let m = 1; m <= 12; m += 1) {
            const { dCy, dLy, otb } = def(m);
            const revCy = sumSegmentRevenue(
                dCy,
                seg,
                which,
                accounts,
                revBasis,
                propertyAccountTypes,
                propertyRequestSegments,
                yearCy,
                m
            );
            const revLy = sumSegmentRevenue(
                dLy,
                seg,
                which,
                accounts,
                revBasis,
                propertyAccountTypes,
                propertyRequestSegments,
                yearLy,
                m
            );
            const revO = sumSegmentRevenue(
                otb,
                seg,
                which,
                accounts,
                revBasis,
                propertyAccountTypes,
                propertyRequestSegments,
                yearCy,
                m
            );
            tCy += revCy;
            tLy += revLy;
            tO += revO;
            months.push({
                month: m,
                monthLabel: MONTHS[m - 1],
                cy: fmtMoney(revCy, currency),
                ly: fmtMoney(revLy, currency),
                pct: fmtPct(revCy, revLy),
                otb: fmtMoney(revO, currency),
                cyOtbVsLyPct: fmtCyOtbVsLyPct(revCy, revO, revLy),
            });
        }
        const segLabel = String(seg).trim() || (which === 'account' ? 'Account' : 'Segment');
        out.push({
            id: `${idP}-rev-${segIdx}-${String(seg).slice(0, 40)}`,
            label: segLabel,
            isNumeric: true,
            months,
            ytd: {
                cy: fmtMoney(tCy, currency),
                ly: fmtMoney(tLy, currency),
                pct: fmtPct(tCy, tLy),
                otb: fmtMoney(tO, currency),
                cyOtbVsLyPct: fmtCyOtbVsLyPct(tCy, tO, tLy),
            },
            segmentGroupKey: `${which === 'account' ? 'acc' : 'req'}:${segLabel}`,
            rowKind: which === 'account' ? 'segmentAccountRev' : 'segmentRequestRev',
        });
    });
    return out;
}

function buildSegmentCountRows(
    pool: any[],
    accounts: any[],
    which: 'account' | 'request',
    idP: string,
    def: (m: number) => { dCy: any[]; dLy: any[]; otb: any[] },
    propertyAccountTypes: string[],
    propertyRequestSegments: string[]
): VsLyMatrixRow[] {
    const propList = which === 'account' ? propertyAccountTypes : propertyRequestSegments;
    const names = orderedSegmentRowNames(
        which,
        propList,
        pool,
        accounts,
        propertyAccountTypes,
        propertyRequestSegments
    );
    const out: VsLyMatrixRow[] = [];
    names.forEach((seg, segIdx) => {
        const months: VsLyMonthCol[] = [];
        let tCy = 0;
        let tLy = 0;
        let tO = 0;
        for (let m = 1; m <= 12; m += 1) {
            const { dCy, dLy, otb } = def(m);
            const cCy = countInSegment(dCy, seg, which, accounts, propertyAccountTypes, propertyRequestSegments);
            const cLy = countInSegment(dLy, seg, which, accounts, propertyAccountTypes, propertyRequestSegments);
            const cO = countInSegment(otb, seg, which, accounts, propertyAccountTypes, propertyRequestSegments);
            tCy += cCy;
            tLy += cLy;
            tO += cO;
            months.push({
                month: m,
                monthLabel: MONTHS[m - 1],
                cy: String(cCy),
                ly: String(cLy),
                pct: fmtPct(cCy, cLy),
                otb: String(cO),
                cyOtbVsLyPct: fmtCyOtbVsLyPct(cCy, cO, cLy),
            });
        }
        const segLabelCt = String(seg).trim() || (which === 'account' ? 'Account' : 'Segment');
        out.push({
            id: `${idP}-ct-${segIdx}-${String(seg).slice(0, 40)}`,
            label: segLabelCt,
            isNumeric: true,
            months,
            ytd: {
                cy: String(tCy),
                ly: String(tLy),
                pct: fmtPct(tCy, tLy),
                otb: String(tO),
                cyOtbVsLyPct: fmtCyOtbVsLyPct(tCy, tO, tLy),
            },
            segmentGroupKey: `${which === 'account' ? 'acc' : 'req'}:${segLabelCt}`,
            rowKind: which === 'account' ? 'segmentAccountCount' : 'segmentRequestCount',
        });
    });
    return out;
}

type MetricsPickR = (a: any, b: any, o: any) => {
    cy: string;
    ly: string;
    pct: string;
    otb: string;
    cyOtbVsLyPct: string;
};

function buildCoreRow(
    id: string,
    label: string,
    def: (m: number) => { dCy: any[]; dLy: any[]; otb: any[] },
    kind: 'rooms' | 'mice',
    accounts: any[],
    currency: CurrencyCode,
    pick: MetricsPickR,
    rowKind: VsLyMatrixRow['rowKind'],
    ytdFullCy: any,
    ytdFullLy: any,
    ytdFullOtb: any,
    yearCy: number,
    yearLy: number
): VsLyMatrixRow {
    const months: VsLyMonthCol[] = [];
    for (let m = 1; m <= 12; m += 1) {
        const { dCy, dLy, otb } = def(m);
        const a =
            kind === 'rooms'
                ? roomsMetrics(dCy, accounts, currency, yearCy, m)
                : miceMetrics(dCy, accounts, currency, yearCy, m);
        const b =
            kind === 'rooms'
                ? roomsMetrics(dLy, accounts, currency, yearLy, m)
                : miceMetrics(dLy, accounts, currency, yearLy, m);
        const c =
            kind === 'rooms'
                ? roomsMetrics(otb, accounts, currency, yearCy, m)
                : miceMetrics(otb, accounts, currency, yearCy, m);
        const cell = pick(a, b, c);
        months.push({ month: m, monthLabel: MONTHS[m - 1], ...cell });
    }
    const ytdCell = pick(ytdFullCy, ytdFullLy, ytdFullOtb);
    return { id, label, isNumeric: true, months, ytd: ytdCell, rowKind };
}

export type VsLyMatrixBuildOptions = {
    /** From Manage Property > Segments & account types (request segment labels) */
    propertyRequestSegments: string[];
    propertyAccountTypes: string[];
    includeRequestSegments: boolean;
    includeAccountTypes: boolean;
    /** Optional month window for CY scope (1..12). Defaults to full year. */
    allowedMonthsCy?: number[];
    /** Optional month window for LY scope (1..12). Defaults to full year. */
    allowedMonthsLy?: number[];
};

const defaultVsLyBuildOptions: VsLyMatrixBuildOptions = {
    propertyRequestSegments: [],
    propertyAccountTypes: [],
    includeRequestSegments: true,
    includeAccountTypes: true,
    allowedMonthsCy: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    allowedMonthsLy: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

export function buildVsLyMatrix(
    kind: VsLyKind,
    allRequests: any[],
    accounts: any[],
    selectedYear: number,
    currency: CurrencyCode,
    opts: Partial<VsLyMatrixBuildOptions> = {}
): { rows: VsLyMatrixRow[]; yearLy: number } {
    const o = { ...defaultVsLyBuildOptions, ...opts };
    const propertyRequestSegments = normalizeTaxonomyStringList(o.propertyRequestSegments);
    const propertyAccountTypes = normalizeTaxonomyStringList(o.propertyAccountTypes);
    /** Same taxonomy as Rooms vs LY and Manage Property — new request segments must map here (no hardcoded subset). */
    const requestSegmentsForMatrix = propertyRequestSegments;
    const includeRequestSegments = o.includeRequestSegments;
    const includeAccountTypes = o.includeAccountTypes;
    const monthsCy = new Set((o.allowedMonthsCy || []).filter((m) => Number.isFinite(m) && m >= 1 && m <= 12));
    const monthsLy = new Set((o.allowedMonthsLy || []).filter((m) => Number.isFinite(m) && m >= 1 && m <= 12));
    const yearLy = selectedYear - 1;
    const pool = allRequests.filter((r) => (kind === 'rooms' ? filterTypeRooms(r) : filterTypeMice(r)));

    const def = (m: number) => {
        const dCy = monthsCy.has(m)
            ? collectRequestsTouchingMonth(
                  pool,
                  selectedYear,
                  m,
                  (r) => isDefAct(r) && !isExcludedCancelled(r),
                  kind
              )
            : [];
        const dLy = monthsLy.has(m)
            ? collectRequestsTouchingMonth(
                  pool,
                  yearLy,
                  m,
                  (r) => isDefAct(r) && !isExcludedCancelled(r),
                  kind
              )
            : [];
        const otb = monthsCy.has(m)
            ? collectRequestsTouchingMonth(
                  pool,
                  selectedYear,
                  m,
                  (r) => isOtbPipeline(r) && !isExcludedCancelled(r),
                  kind
              )
            : [];
        return { dCy, dLy, otb };
    };

    const ytdDefActCy = (y: number) =>
        pool.filter(
            (r) => !isExcludedCancelled(r) && isDefAct(r) && requestTouchesAnyMonth(r, y, monthsCy, kind)
        );
    const ytdDefActLy = (y: number) =>
        pool.filter(
            (r) => !isExcludedCancelled(r) && isDefAct(r) && requestTouchesAnyMonth(r, y, monthsLy, kind)
        );
    const ytdOtbY = (y: number) =>
        pool.filter(
            (r) => !isExcludedCancelled(r) && isOtbPipeline(r) && requestTouchesAnyMonth(r, y, monthsCy, kind)
        );

    const roomsYtdCy = roomsMetricsYtd(ytdDefActCy(selectedYear), accounts, currency, selectedYear, monthsCy);
    const roomsYtdLy = roomsMetricsYtd(ytdDefActLy(yearLy), accounts, currency, yearLy, monthsLy);
    const roomsYtdOtb = roomsMetricsYtd(ytdOtbY(selectedYear), accounts, currency, selectedYear, monthsCy);
    const miceYtdCy = miceMetricsYtd(ytdDefActCy(selectedYear), accounts, currency, selectedYear, monthsCy);
    const miceYtdLy = miceMetricsYtd(ytdDefActLy(yearLy), accounts, currency, yearLy, monthsLy);
    const miceYtdOtb = miceMetricsYtd(ytdOtbY(selectedYear), accounts, currency, selectedYear, monthsCy);

    const rows: VsLyMatrixRow[] = [];

    if (kind === 'rooms') {
        if (includeAccountTypes) {
            rows.push(
                makeSectionHeaderRow('sec-rev-acc-rooms', 'Revenue by account type (rooms)')
            );
            rows.push(
                ...buildSegmentRevenueRows(
                    pool,
                    accounts,
                    'account',
                    'a',
                    def,
                    currency,
                    'rooms',
                    propertyAccountTypes,
                    propertyRequestSegments,
                    selectedYear,
                    yearLy
                )
            );
        }
        if (includeRequestSegments) {
            rows.push(
                makeSectionHeaderRow('sec-rev-req-rooms', 'Revenue by request segment (rooms)')
            );
            rows.push(
                ...buildSegmentRevenueRows(
                    pool,
                    accounts,
                    'request',
                    'r',
                    def,
                    currency,
                    'rooms',
                    propertyAccountTypes,
                    propertyRequestSegments,
                    selectedYear,
                    yearLy
                )
            );
        }
        rows.push(
            buildCoreRow(
                'adr',
                'ADR (rooms)',
                def,
                'rooms',
                accounts,
                currency,
                (a, b, o) => ({
                    cy: fmtMoney(a.adr, currency),
                    ly: fmtMoney(b.adr, currency),
                    pct: fmtPct(a.adr, b.adr),
                    otb: fmtMoney(o.adr, currency),
                    cyOtbVsLyPct: '-',
                }),
                'core',
                roomsYtdCy,
                roomsYtdLy,
                roomsYtdOtb,
                selectedYear,
                yearLy
            )
        );
        rows.push(
            buildCoreRow(
                'nights',
                'Total room nights',
                def,
                'rooms',
                accounts,
                currency,
                (a, b, o) => ({
                    cy: String(Math.round(a.roomNights || 0)),
                    ly: String(Math.round(b.roomNights || 0)),
                    pct: fmtPct(a.roomNights, b.roomNights),
                    otb: String(Math.round(o.roomNights || 0)),
                    cyOtbVsLyPct: fmtCyOtbVsLyPct(a.roomNights || 0, o.roomNights || 0, b.roomNights || 0),
                }),
                'core',
                roomsYtdCy,
                roomsYtdLy,
                roomsYtdOtb,
                selectedYear,
                yearLy
            )
        );
        rows.push(
            buildCoreRow(
                'avg',
                'Avg value / request (rooms)',
                def,
                'rooms',
                accounts,
                currency,
                (a, b, o) => ({
                    cy: fmtMoney(a.avg, currency),
                    ly: fmtMoney(b.avg, currency),
                    pct: fmtPct(a.avg, b.avg),
                    otb: fmtMoney(o.avg, currency),
                    cyOtbVsLyPct: '-',
                }),
                'core',
                roomsYtdCy,
                roomsYtdLy,
                roomsYtdOtb,
                selectedYear,
                yearLy
            )
        );
        const lastPickRooms = (a: any, b: any, o: any) => ({
            cy: fmtMoney(a.rev, currency),
            ly: fmtMoney(b.rev, currency),
            pct: fmtPct(a.rev, b.rev),
            otb: fmtMoney(o.rev, currency),
            cyOtbVsLyPct: fmtCyOtbVsLyPct(a.rev, o.rev, b.rev),
        });
        {
            const months: VsLyMonthCol[] = [];
            for (let m = 1; m <= 12; m += 1) {
                const { dCy, dLy, otb } = def(m);
                const a = roomsMetrics(dCy, accounts, currency, selectedYear, m);
                const b = roomsMetrics(dLy, accounts, currency, yearLy, m);
                const c = roomsMetrics(otb, accounts, currency, selectedYear, m);
                const cell = lastPickRooms(a, b, c);
                months.push({ month: m, monthLabel: MONTHS[m - 1], ...cell });
            }
            const ytd = lastPickRooms(roomsYtdCy, roomsYtdLy, roomsYtdOtb);
            rows.push({
                id: 'roomsRev',
                label: 'Total rooms revenue',
                isNumeric: true,
                months,
                ytd,
                rowKind: 'totalRevenue',
            });
        }

        if (includeAccountTypes) {
            rows.push(
                makeSectionHeaderRow('sec-ct-acc-rooms', 'Request counts by account type')
            );
            rows.push(
                ...buildSegmentCountRows(
                    pool,
                    accounts,
                    'account',
                    'a',
                    def,
                    propertyAccountTypes,
                    propertyRequestSegments
                )
            );
        }
        if (includeRequestSegments) {
            rows.push(
                makeSectionHeaderRow('sec-ct-req-rooms', 'Request counts by request segment')
            );
            rows.push(
                ...buildSegmentCountRows(
                    pool,
                    accounts,
                    'request',
                    'r',
                    def,
                    propertyAccountTypes,
                    propertyRequestSegments
                )
            );
        }
        rows.push(
            buildCoreRow(
                'count',
                'Total requests',
                def,
                'rooms',
                accounts,
                currency,
                (a, b, o) => ({
                    cy: String(a.count),
                    ly: String(b.count),
                    pct: fmtPct(a.count, b.count),
                    otb: String(o.count),
                    cyOtbVsLyPct: fmtCyOtbVsLyPct(a.count, o.count, b.count),
                }),
                'core',
                roomsYtdCy,
                roomsYtdLy,
                roomsYtdOtb,
                selectedYear,
                yearLy
            )
        );
    } else {
        if (includeAccountTypes) {
            rows.push(
                makeSectionHeaderRow('sec-rev-acc-mice', 'Revenue by account type')
            );
            rows.push(
                ...buildSegmentRevenueRows(
                    pool,
                    accounts,
                    'account',
                    'ma',
                    def,
                    currency,
                    'comb',
                    propertyAccountTypes,
                    propertyRequestSegments,
                    selectedYear,
                    yearLy
                )
            );
        }
        if (includeRequestSegments) {
            rows.push(
                makeSectionHeaderRow('sec-rev-req-mice', 'Revenue by request segment')
            );
            rows.push(
                ...buildSegmentRevenueRows(
                    pool,
                    accounts,
                    'request',
                    'mr',
                    def,
                    currency,
                    'comb',
                    propertyAccountTypes,
                    requestSegmentsForMatrix,
                    selectedYear,
                    yearLy
                )
            );
        }
        const lastPickEvt = (a: any, b: any, o: any) => ({
            cy: fmtMoney(a.eventRev, currency),
            ly: fmtMoney(b.eventRev, currency),
            pct: fmtPct(a.eventRev, b.eventRev),
            otb: fmtMoney(o.eventRev, currency),
            cyOtbVsLyPct: fmtCyOtbVsLyPct(a.eventRev, o.eventRev, b.eventRev),
        });
        const lastPickMiceRooms = (a: any, b: any, o: any) => ({
            cy: fmtMoney(a.roomsRev, currency),
            ly: fmtMoney(b.roomsRev, currency),
            pct: fmtPct(a.roomsRev, b.roomsRev),
            otb: fmtMoney(o.roomsRev, currency),
            cyOtbVsLyPct: fmtCyOtbVsLyPct(a.roomsRev, o.roomsRev, b.roomsRev),
        });
        const lastPickComb = (a: any, b: any, o: any) => ({
            cy: fmtMoney(a.comb, currency),
            ly: fmtMoney(b.comb, currency),
            pct: fmtPct(a.comb, b.comb),
            otb: fmtMoney(o.comb, currency),
            cyOtbVsLyPct: fmtCyOtbVsLyPct(a.comb, o.comb, b.comb),
        });
        {
            const months: VsLyMonthCol[] = [];
            for (let m = 1; m <= 12; m += 1) {
                const { dCy, dLy, otb } = def(m);
                const a = miceMetrics(dCy, accounts, currency, selectedYear, m);
                const b = miceMetrics(dLy, accounts, currency, yearLy, m);
                const c = miceMetrics(otb, accounts, currency, selectedYear, m);
                months.push({ month: m, monthLabel: MONTHS[m - 1], ...lastPickEvt(a, b, c) });
            }
            const ytd = lastPickEvt(miceYtdCy, miceYtdLy, miceYtdOtb);
            rows.push({
                id: 'mice-total-event',
                label: 'Total event revenue',
                isNumeric: true,
                months,
                ytd,
                rowKind: 'core',
            });
        }
        {
            const months: VsLyMonthCol[] = [];
            for (let m = 1; m <= 12; m += 1) {
                const { dCy, dLy, otb } = def(m);
                const a = miceMetrics(dCy, accounts, currency, selectedYear, m);
                const b = miceMetrics(dLy, accounts, currency, yearLy, m);
                const c = miceMetrics(otb, accounts, currency, selectedYear, m);
                months.push({ month: m, monthLabel: MONTHS[m - 1], ...lastPickMiceRooms(a, b, c) });
            }
            const ytd = lastPickMiceRooms(miceYtdCy, miceYtdLy, miceYtdOtb);
            rows.push({
                id: 'mice-total-rooms',
                label: 'Total rooms revenue',
                isNumeric: true,
                months,
                ytd,
                rowKind: 'core',
            });
        }
        {
            const months: VsLyMonthCol[] = [];
            for (let m = 1; m <= 12; m += 1) {
                const { dCy, dLy, otb } = def(m);
                const a = miceMetrics(dCy, accounts, currency, selectedYear, m);
                const b = miceMetrics(dLy, accounts, currency, yearLy, m);
                const c = miceMetrics(otb, accounts, currency, selectedYear, m);
                months.push({ month: m, monthLabel: MONTHS[m - 1], ...lastPickComb(a, b, c) });
            }
            const ytd = lastPickComb(miceYtdCy, miceYtdLy, miceYtdOtb);
            rows.push({
                id: 'mice-total-grand',
                label: 'Grand total',
                isNumeric: true,
                months,
                ytd,
                rowKind: 'totalRevenue',
            });
        }
        const picksMice: { id: string; label: string; pick: MetricsPickR }[] = [
            {
                id: 'pax',
                label: 'Total PAX',
                pick: (a, b, o) => ({
                    cy: String(Math.round(a.pax || 0)),
                    ly: String(Math.round(b.pax || 0)),
                    pct: fmtPct(a.pax, b.pax),
                    otb: String(Math.round(o.pax || 0)),
                    cyOtbVsLyPct: fmtCyOtbVsLyPct(a.pax || 0, o.pax || 0, b.pax || 0),
                }),
            },
            {
                id: 'adr',
                label: 'ADR (rooms)',
                pick: (a, b, o) => ({
                    cy: fmtMoney(a.adr, currency),
                    ly: fmtMoney(b.adr, currency),
                    pct: fmtPct(a.adr, b.adr),
                    otb: fmtMoney(o.adr, currency),
                    cyOtbVsLyPct: '-',
                }),
            },
            {
                id: 'avg',
                label: 'Avg value / request',
                pick: (a, b, o) => ({
                    cy: fmtMoney(a.avg, currency),
                    ly: fmtMoney(b.avg, currency),
                    pct: fmtPct(a.avg, b.avg),
                    otb: fmtMoney(o.avg, currency),
                    cyOtbVsLyPct: '-',
                }),
            },
        ];
        for (const p of picksMice) {
            rows.push(
                buildCoreRow(
                    p.id,
                    p.label,
                    def,
                    'mice',
                    accounts,
                    currency,
                    p.pick,
                    'core',
                    miceYtdCy,
                    miceYtdLy,
                    miceYtdOtb,
                    selectedYear,
                    yearLy
                )
            );
        }

        if (includeAccountTypes) {
            rows.push(
                makeSectionHeaderRow('sec-ct-acc-mice', 'Request counts by account type')
            );
            rows.push(
                ...buildSegmentCountRows(
                    pool,
                    accounts,
                    'account',
                    'ma',
                    def,
                    propertyAccountTypes,
                    propertyRequestSegments
                )
            );
        }
        if (includeRequestSegments) {
            rows.push(
                makeSectionHeaderRow('sec-ct-req-mice', 'Request counts by request segment')
            );
            rows.push(
                ...buildSegmentCountRows(
                    pool,
                    accounts,
                    'request',
                    'mr',
                    def,
                    propertyAccountTypes,
                    requestSegmentsForMatrix
                )
            );
        }
        rows.push(
            buildCoreRow(
                'count',
                'Total requests',
                def,
                'mice',
                accounts,
                currency,
                (a, b, o) => ({
                    cy: String(a.count),
                    ly: String(b.count),
                    pct: fmtPct(a.count, b.count),
                    otb: String(o.count),
                    cyOtbVsLyPct: fmtCyOtbVsLyPct(a.count, o.count, b.count),
                }),
                'core',
                miceYtdCy,
                miceYtdLy,
                miceYtdOtb,
                selectedYear,
                yearLy
            )
        );
    }

    return { rows, yearLy };
}

/**
 * One combined D&A + OTB row: same unduplication as standalone parts — Part A rooms + Part B event only.
 * Does **not** add Part B "Total rooms revenue" / B room OTB (repeats event+rooms room $ in Part A).
 */
function buildGrandHotelCombinedRevenueRow(
    allRequests: any[],
    accounts: any[],
    selectedYear: number,
    yearLy: number,
    currency: CurrencyCode,
    allowedMonthsCy: Set<number>,
    allowedMonthsLy: Set<number>
): VsLyMatrixRow {
    const poolRooms = allRequests.filter((r) => filterTypeRooms(r));
    const poolMice = allRequests.filter((r) => filterTypeMice(r));
    const defR = (m: number) => {
        const dCy = allowedMonthsCy.has(m)
            ? collectRequestsTouchingMonth(
                  poolRooms,
                  selectedYear,
                  m,
                  (r) => isDefAct(r) && !isExcludedCancelled(r),
                  'rooms'
              )
            : [];
        const dLy = allowedMonthsLy.has(m)
            ? collectRequestsTouchingMonth(
                  poolRooms,
                  yearLy,
                  m,
                  (r) => isDefAct(r) && !isExcludedCancelled(r),
                  'rooms'
              )
            : [];
        return { dCy, dLy };
    };
    const defM = (m: number) => {
        const dCy = allowedMonthsCy.has(m)
            ? collectRequestsTouchingMonth(
                  poolMice,
                  selectedYear,
                  m,
                  (r) => isDefAct(r) && !isExcludedCancelled(r),
                  'mice'
              )
            : [];
        const dLy = allowedMonthsLy.has(m)
            ? collectRequestsTouchingMonth(
                  poolMice,
                  yearLy,
                  m,
                  (r) => isDefAct(r) && !isExcludedCancelled(r),
                  'mice'
              )
            : [];
        return { dCy, dLy };
    };
    const ytdRCy = poolRooms.filter(
        (r) => !isExcludedCancelled(r) && isDefAct(r) && requestTouchesAnyMonth(r, selectedYear, allowedMonthsCy, 'rooms')
    );
    const ytdRLy = poolRooms.filter(
        (r) => !isExcludedCancelled(r) && isDefAct(r) && requestTouchesAnyMonth(r, yearLy, allowedMonthsLy, 'rooms')
    );
    const ytdMCy = poolMice.filter(
        (r) => !isExcludedCancelled(r) && isDefAct(r) && requestTouchesAnyMonth(r, selectedYear, allowedMonthsCy, 'mice')
    );
    const ytdMLy = poolMice.filter(
        (r) => !isExcludedCancelled(r) && isDefAct(r) && requestTouchesAnyMonth(r, yearLy, allowedMonthsLy, 'mice')
    );
    const roomYtdCy = roomsMetricsYtd(ytdRCy, accounts, currency, selectedYear, allowedMonthsCy);
    const roomYtdLy = roomsMetricsYtd(ytdRLy, accounts, currency, yearLy, allowedMonthsLy);
    const evYtdCy = miceMetricsYtd(ytdMCy, accounts, currency, selectedYear, allowedMonthsCy);
    const evYtdLy = miceMetricsYtd(ytdMLy, accounts, currency, yearLy, allowedMonthsLy);
    const ytdOtbR = poolRooms.filter(
        (r) => !isExcludedCancelled(r) && isOtbPipeline(r) && requestTouchesAnyMonth(r, selectedYear, allowedMonthsCy, 'rooms')
    );
    const ytdOtbM = poolMice.filter(
        (r) => !isExcludedCancelled(r) && isOtbPipeline(r) && requestTouchesAnyMonth(r, selectedYear, allowedMonthsCy, 'mice')
    );
    const roomOtbYtd = roomsMetricsYtd(ytdOtbR, accounts, currency, selectedYear, allowedMonthsCy);
    const evOtbYtd = miceMetricsYtd(ytdOtbM, accounts, currency, selectedYear, allowedMonthsCy);
    const trYtdCy = transportRevenueYtdForRequests(allRequests, selectedYear, (r) => isDefAct(r), allowedMonthsCy);
    const trYtdLy = transportRevenueYtdForRequests(allRequests, yearLy, (r) => isDefAct(r), allowedMonthsLy);
    const trYtdOtb = transportRevenueYtdForRequests(allRequests, selectedYear, (r) => isOtbPipeline(r), allowedMonthsCy);
    const tOtb = roomOtbYtd.rev + evOtbYtd.eventRev + trYtdOtb;
    const months: VsLyMonthCol[] = [];
    for (let m = 1; m <= 12; m += 1) {
        const { dCy: dRCy, dLy: dRLy } = defR(m);
        const { dCy: dMCy, dLy: dMLy } = defM(m);
        const rvCy = roomsMetrics(dRCy, accounts, currency, selectedYear, m).rev;
        const rvLy = roomsMetrics(dRLy, accounts, currency, yearLy, m).rev;
        const eventCy = miceMetrics(dMCy, accounts, currency, selectedYear, m).eventRev;
        const eventLy = miceMetrics(dMLy, accounts, currency, yearLy, m).eventRev;
        const trCy = allowedMonthsCy.has(m)
            ? transportRevenueInMonthForRequests(allRequests, selectedYear, m, (r) => isDefAct(r))
            : 0;
        const trLy = allowedMonthsLy.has(m)
            ? transportRevenueInMonthForRequests(allRequests, yearLy, m, (r) => isDefAct(r))
            : 0;
        const gCy = rvCy + eventCy + trCy;
        const gLy = rvLy + eventLy + trLy;
        const otbR = allowedMonthsCy.has(m)
            ? collectRequestsTouchingMonth(
                  poolRooms,
                  selectedYear,
                  m,
                  (r) => isOtbPipeline(r) && !isExcludedCancelled(r),
                  'rooms'
              )
            : [];
        const otbM = allowedMonthsCy.has(m)
            ? collectRequestsTouchingMonth(
                  poolMice,
                  selectedYear,
                  m,
                  (r) => isOtbPipeline(r) && !isExcludedCancelled(r),
                  'mice'
              )
            : [];
        const oRv = roomsMetrics(otbR, accounts, currency, selectedYear, m).rev;
        const oEv = miceMetrics(otbM, accounts, currency, selectedYear, m).eventRev;
        const oTr = allowedMonthsCy.has(m)
            ? transportRevenueInMonthForRequests(allRequests, selectedYear, m, (r) => isOtbPipeline(r))
            : 0;
        const oSum = oRv + oEv + oTr;
        months.push({
            month: m,
            monthLabel: MONTHS[m - 1],
            cy: fmtMoney(gCy, currency),
            ly: fmtMoney(gLy, currency),
            pct: fmtPct(gCy, gLy),
            otb: fmtMoney(oSum, currency),
            cyOtbVsLyPct: fmtCyOtbVsLyPct(gCy, oSum, gLy),
        });
    }
    const tCy = roomYtdCy.rev + evYtdCy.eventRev + trYtdCy;
    const tLy = roomYtdLy.rev + evYtdLy.eventRev + trYtdLy;
    return {
        id: 'full-grand-hotel-total',
        label: 'Total Hotel Revenue',
        isNumeric: true,
        months,
        ytd: {
            cy: fmtMoney(tCy, currency),
            ly: fmtMoney(tLy, currency),
            pct: fmtPct(tCy, tLy),
            otb: fmtMoney(tOtb, currency),
            cyOtbVsLyPct: fmtCyOtbVsLyPct(tCy, tOtb, tLy),
        },
        rowKind: 'totalRevenue',
        segmentGroupKey: 'full:grand:total',
    };
}

function transportRevenueInMonthForRequests(
    allRequests: any[],
    year: number,
    month1to12: number,
    statusPick: (r: any) => boolean
): number {
    let sum = 0;
    for (const r of allRequests) {
        if (isExcludedCancelled(r) || !statusPick(r)) continue;
        const b = parseYmd(bucketYmdForRequest(r));
        if (!b) continue;
        const y = parseInt(b.slice(0, 4), 10);
        const mo = parseInt(b.slice(5, 7), 10);
        if (y !== year || mo !== month1to12) continue;
        sum += computeRequestRevenueBreakdownNoTax(r).transportRevenue;
    }
    return sum;
}

function transportRevenueYtdForRequests(
    allRequests: any[],
    year: number,
    statusPick: (r: any) => boolean,
    months?: Set<number>
): number {
    let sum = 0;
    for (const r of allRequests) {
        if (isExcludedCancelled(r) || !statusPick(r)) continue;
        const b = parseYmd(bucketYmdForRequest(r));
        if (!b) continue;
        const y = parseInt(b.slice(0, 4), 10);
        const mo = parseInt(b.slice(5, 7), 10);
        if (y !== year) continue;
        if (months && !months.has(mo)) continue;
        sum += computeRequestRevenueBreakdownNoTax(r).transportRevenue;
    }
    return sum;
}

function buildOtherRevenueRow(
    allRequests: any[],
    selectedYear: number,
    yearLy: number,
    currency: CurrencyCode,
    allowedMonthsCy: Set<number>,
    allowedMonthsLy: Set<number>
): VsLyMatrixRow {
    const months: VsLyMonthCol[] = [];
    let tCy = 0;
    let tLy = 0;
    let tOtb = 0;
    for (let m = 1; m <= 12; m += 1) {
        const cy = allowedMonthsCy.has(m)
            ? transportRevenueInMonthForRequests(allRequests, selectedYear, m, (r) => isDefAct(r))
            : 0;
        const ly = allowedMonthsLy.has(m)
            ? transportRevenueInMonthForRequests(allRequests, yearLy, m, (r) => isDefAct(r))
            : 0;
        const otb = allowedMonthsCy.has(m)
            ? transportRevenueInMonthForRequests(allRequests, selectedYear, m, (r) => isOtbPipeline(r))
            : 0;
        tCy += cy;
        tLy += ly;
        tOtb += otb;
        months.push({
            month: m,
            monthLabel: MONTHS[m - 1],
            cy: fmtMoney(cy, currency),
            ly: fmtMoney(ly, currency),
            pct: fmtPct(cy, ly),
            otb: fmtMoney(otb, currency),
            cyOtbVsLyPct: fmtCyOtbVsLyPct(cy, otb, ly),
        });
    }
    return {
        id: 'full-other-revenue',
        label: 'Other Revenue',
        isNumeric: true,
        months,
        ytd: {
            cy: fmtMoney(tCy, currency),
            ly: fmtMoney(tLy, currency),
            pct: fmtPct(tCy, tLy),
            otb: fmtMoney(tOtb, currency),
            cyOtbVsLyPct: fmtCyOtbVsLyPct(tCy, tOtb, tLy),
        },
        rowKind: 'core',
    };
}

/**
 * CEO / executive pack: the exact same matrices as "Rooms vs LY" and "MICE vs LY", concatenated.
 * No new formulas — only presentation. Event+rooms requests are included in both Part A and Part B
 * (same as running the two reports separately); do not add the two section grand totals.
 */
function prefixVsLyMatrixPart(
    part: 'rooms' | 'mice',
    rows: VsLyMatrixRow[]
): VsLyMatrixRow[] {
    return rows.map((row) => ({
        ...row,
        id: `full-${part}-${row.id}`,
        segmentGroupKey:
            row.segmentGroupKey != null && String(row.segmentGroupKey).length
                ? `full:${part}:${row.segmentGroupKey}`
                : row.segmentGroupKey,
    }));
}

export function buildFullVsLyMatrix(
    allRequests: any[],
    accounts: any[],
    selectedYear: number,
    currency: CurrencyCode,
    opts: Partial<VsLyMatrixBuildOptions> = {}
): { rows: VsLyMatrixRow[]; yearLy: number } {
    const o = { ...defaultVsLyBuildOptions, ...opts };
    const monthsCy = new Set((o.allowedMonthsCy || []).filter((m) => Number.isFinite(m) && m >= 1 && m <= 12));
    const monthsLy = new Set((o.allowedMonthsLy || []).filter((m) => Number.isFinite(m) && m >= 1 && m <= 12));
    const roomsR = buildVsLyMatrix('rooms', allRequests, accounts, selectedYear, currency, opts);
    const miceR = buildVsLyMatrix('mice', allRequests, accounts, selectedYear, currency, opts);
    const a = prefixVsLyMatrixPart('rooms', roomsR.rows);
    const b = prefixVsLyMatrixPart('mice', miceR.rows);
    const title = makeSectionHeaderRow('full-executive-intro', 'Full Report');
    const partA = makeSectionHeaderRow('full-part-rooms', 'Part A — Rooms portfolio');
    const partB = makeSectionHeaderRow('full-part-mice', 'Part B — MICE portfolio');
    const yearLy = roomsR.yearLy;
    const partC = makeSectionHeaderRow('full-part-other', 'C. Other Revenue');
    const other = buildOtherRevenueRow(
        allRequests,
        selectedYear,
        yearLy,
        currency,
        monthsCy,
        monthsLy
    );
    const partD = makeSectionHeaderRow('full-part-grand', 'D. Total Hotel Revenue');
    const grand = buildGrandHotelCombinedRevenueRow(
        allRequests,
        accounts,
        selectedYear,
        yearLy,
        currency,
        monthsCy,
        monthsLy
    );
    return {
        rows: [title, partA, ...a, partB, ...b, partC, other, partD, grand],
        yearLy,
    };
}

export function defaultVsReportYear(available: number[]): number {
    if (!available.length) return new Date().getFullYear();
    const y = new Date().getFullYear();
    if (available.includes(y)) return y;
    return available[available.length - 1];
}

function csvEscape(v: any): string {
    const s = asciiSafeForExport(String(v ?? ''));
    return `"${s.replace(/"/g, '""')}"`;
}

function asciiSafeForExport(s: string): string {
    return s
        .replace(/\u00a0/g, ' ')
        .replace(/\u202f/g, ' ')
        .replace(/[\u2012\u2013\u2014\u2212\ufeff]/g, '-')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"');
}

export function exportVsLyMatrixCsv(
    rows: VsLyMatrixRow[],
    meta: { year: number; yearLy: number; kind: VsLyKind },
    propertyName: string
): string {
    const h: string[] = ['Metric'];
    for (const m of rows[0]?.months || []) {
        h.push(
            `${m.monthLabel} ${meta.year} (CY)`,
            `${m.monthLabel} ${meta.yearLy} (LY)`,
            `${m.monthLabel} %`,
            `${m.monthLabel} OTB`,
            `${m.monthLabel} CY+OTB vs LY %`
        );
    }
    h.push(
        `YTD ${meta.year} (CY)`,
        `YTD ${meta.yearLy} (LY)`,
        'YTD %',
        'YTD OTB',
        'YTD CY+OTB vs LY %'
    );
    const lines: string[] = [h.map((x) => csvEscape(x)).join(',')];
    const dataColCount = (rows[0]?.months?.length || 12) * 5 + 5;
    for (const row of rows) {
        if (row.rowKind === 'sectionHeader') {
            const cells = [csvEscape(row.label), ...Array(dataColCount).fill('""')];
            lines.push(cells.join(','));
            continue;
        }
        const cells: string[] = [csvEscape(row.label)];
        for (const mo of row.months) {
            cells.push(
                csvEscape(mo.cy),
                csvEscape(mo.ly),
                csvEscape(asciiSafeForExport(mo.pct)),
                csvEscape(mo.otb),
                csvEscape(asciiSafeForExport(mo.cyOtbVsLyPct))
            );
        }
        const y = row.ytd;
        cells.push(
            csvEscape(y.cy),
            csvEscape(y.ly),
            csvEscape(asciiSafeForExport(y.pct)),
            csvEscape(y.otb),
            csvEscape(asciiSafeForExport(y.cyOtbVsLyPct))
        );
        lines.push(cells.map((c) => c).join(','));
    }
    const title =
        meta.kind === 'rooms'
            ? `Rooms vs LY | ${propertyName}`
            : meta.kind === 'mice'
              ? `MICE vs LY | ${propertyName}`
              : `Full report (Rooms + MICE) vs LY | ${propertyName}`;
    return '\ufeff' + [`# ${title}`, ...lines].join('\r\n');
}

export function exportVsLyMatrixExcelHtml(
    rows: VsLyMatrixRow[],
    meta: { year: number; yearLy: number; kind: VsLyKind },
    propertyName: string,
    _opts?: { titleBg?: string; accent?: string; good?: string; bad?: string; muted?: string; border?: string }
): string {
    /* Print / Excel: always light background and dark text for legibility. */
    const text = '#0f172a';
    const good = '#15803d';
    const bad = '#b91c1c';
    const mutedN = '#64748b';
    const border = '#94a3b8';
    const headBg = '#1e3a5f';
    const headText = '#ffffff';
    const subHeadBg = '#e2e8f0';
    const ytdFill = '#f1f5f9';
    const reportTitle =
        meta.kind === 'rooms' ? 'Rooms vs LY' : meta.kind === 'mice' ? 'MICE vs LY' : 'Full report (Rooms + MICE) vs LY';
    const fullDisclaimer = '';
    const nMo = rows[0]?.months?.length || 12;
    const dataColCount = 5 * nMo + 5;
    const tableColSpan = 1 + dataColCount;

    const pctTdStyle = (pctRaw: string) => {
        const pct = String(pctRaw || '');
        if (pct === '0%' || pct === '-') return `color:${mutedN};`;
        const pNum = parseFloat(pct.replace(/%/g, ''));
        if (Number.isNaN(pNum)) return `color:${mutedN};`;
        return pNum > 0 ? `color:${good};font-weight:700;` : `color:${bad};font-weight:700;`;
    };

    const baseTd = (extra: string) =>
        `border:1px solid ${border};padding:6px 8px;font:11px Arial,sans-serif;background:#ffffff;color:${text};${extra}`;

    const monthCells = (mo: VsLyMonthCol) => {
        const s = pctTdStyle(mo.pct);
        const s2 = pctTdStyle(mo.cyOtbVsLyPct);
        return [
            `<td style="${baseTd('white-space:pre-wrap;')}">${escHtml(mo.cy)}</td>`,
            `<td style="${baseTd('white-space:pre-wrap;')}">${escHtml(mo.ly)}</td>`,
            `<td style="${baseTd(s)}">${escHtml(asciiSafeForExport(mo.pct))}</td>`,
            `<td style="${baseTd('')}">${escHtml(mo.otb)}</td>`,
            `<td style="${baseTd(s2)}">${escHtml(asciiSafeForExport(mo.cyOtbVsLyPct))}</td>`,
        ].join('');
    };
    const ytdCells = (row: VsLyMatrixRow) => {
        const y = row.ytd;
        const s = pctTdStyle(y.pct);
        const s2 = pctTdStyle(y.cyOtbVsLyPct);
        return [
            `<td style="${baseTd(`background:${ytdFill};`)}">${escHtml(y.cy)}</td>`,
            `<td style="${baseTd(`background:${ytdFill};`)}">${escHtml(y.ly)}</td>`,
            `<td style="${baseTd(`background:${ytdFill};` + s)}">${escHtml(asciiSafeForExport(y.pct))}</td>`,
            `<td style="${baseTd(`background:${ytdFill};`)}">${escHtml(y.otb)}</td>`,
            `<td style="${baseTd(`background:${ytdFill};` + s2)}">${escHtml(asciiSafeForExport(y.cyOtbVsLyPct))}</td>`,
        ].join('');
    };

    const subHeads = (ytd: boolean) =>
        ['CY', 'LY', '% v LY', 'OTB', 'CY+OTB v LY %']
            .map(
                (lab) =>
                    `<th style="border:1px solid ${border};padding:4px 6px;background:${subHeadBg};color:${text};font:8px Arial;font-weight:700;">${escHtml(
                        ytd ? `YTD ${lab}` : lab
                    )}</th>`
            )
            .join('');

    const headRow1: string[] = [
        `<th rowspan="2" style="border:1px solid ${border};padding:6px 8px;background:${headBg};color:${headText};font:11px Arial;vertical-align:bottom;">Metric</th>`,
    ];
    for (const m of rows[0]?.months || []) {
        headRow1.push(
            `<th colspan="5" style="border:1px solid ${border};padding:6px 8px;background:${headBg};color:${headText};font:10px Arial;">${escHtml(
                `${m.monthLabel} (CY ${meta.year} / LY ${meta.yearLy})`
            )}</th>`
        );
    }
    headRow1.push(
        `<th colspan="5" style="border:1px solid ${border};padding:6px 8px;background:${headBg};color:#fef08a;font:10px Arial;">Full year / YTD</th>`
    );

    const headRow2: string[] = [];
    for (const _ of rows[0]?.months || []) {
        headRow2.push(subHeads(false));
    }
    headRow2.push(subHeads(true));

    const body = rows
        .map((row) => {
            if (row.rowKind === 'sectionHeader') {
                return `<tr>
        <td colspan="${tableColSpan}" style="border:1px solid ${border};padding:8px 10px;background:#e2e8f0;color:${text};font:12px Arial;font-weight:700;">
          ${escHtml(row.label)}
        </td>
      </tr>`;
            }
            const isTotal = row.rowKind === 'totalRevenue';
            const trBg = isTotal ? 'background:#dbeafe;' : 'background:#ffffff;';
            const labelBg = isTotal ? 'background:#bfdbfe;' : 'background:#f8fafc;';
            const dataBg = isTotal ? 'background:#eff6ff;' : 'background:#ffffff;';

            if (!isTotal) {
                return `<tr style="${trBg}">
        <td style="border:1px solid ${border};padding:6px 8px;${labelBg}color:${text};font:11px Arial;font-weight:600;vertical-align:top;max-width:14rem;">${escHtml(
            row.label
        )}</td>
        ${row.months.map((mo) => monthCells(mo)).join('')}
        ${ytdCells(row)}
      </tr>`;
            }

            const tds = row.months
                .map((mo) => {
                    const s = pctTdStyle(mo.pct);
                    const s2 = pctTdStyle(mo.cyOtbVsLyPct);
                    return [
                        `<td style="border:1px solid ${border};padding:6px 8px;${trBg}${dataBg}font:11px Arial;white-space:pre-wrap;color:${text};">${escHtml(
                            mo.cy
                        )}</td>`,
                        `<td style="border:1px solid ${border};padding:6px 8px;${trBg}${dataBg}font:11px Arial;white-space:pre-wrap;color:${text};">${escHtml(
                            mo.ly
                        )}</td>`,
                        `<td style="border:1px solid ${border};padding:6px 8px;${trBg}${dataBg}font:11px Arial;${s}">${escHtml(
                            asciiSafeForExport(mo.pct)
                        )}</td>`,
                        `<td style="border:1px solid ${border};padding:6px 8px;${trBg}${dataBg}font:11px Arial;color:${text};">${escHtml(
                            mo.otb
                        )}</td>`,
                        `<td style="border:1px solid ${border};padding:6px 8px;${trBg}${dataBg}font:11px Arial;${s2}">${escHtml(
                            asciiSafeForExport(mo.cyOtbVsLyPct)
                        )}</td>`,
                    ].join('');
                })
                .join('');
            const y = row.ytd;
            const yp = pctTdStyle(y.pct);
            const yp2 = pctTdStyle(y.cyOtbVsLyPct);
            const ytdRow = [
                `<td style="border:1px solid ${border};padding:6px 8px;background:${ytdFill};font:11px Arial;font-weight:700;color:${text};">${escHtml(
                    y.cy
                )}</td>`,
                `<td style="border:1px solid ${border};padding:6px 8px;background:${ytdFill};font:11px Arial;font-weight:700;color:${text};">${escHtml(
                    y.ly
                )}</td>`,
                `<td style="border:1px solid ${border};padding:6px 8px;background:${ytdFill};font:11px Arial;font-weight:800;${yp}">${escHtml(
                    asciiSafeForExport(y.pct)
                )}</td>`,
                `<td style="border:1px solid ${border};padding:6px 8px;background:${ytdFill};font:11px Arial;font-weight:700;color:${text};">${escHtml(
                    y.otb
                )}</td>`,
                `<td style="border:1px solid ${border};padding:6px 8px;background:${ytdFill};font:11px Arial;font-weight:800;${yp2}">${escHtml(
                    asciiSafeForExport(y.cyOtbVsLyPct)
                )}</td>`,
            ].join('');

            return `<tr style="${trBg}">
        <td style="border:1px solid ${border};padding:6px 8px;${labelBg}color:${text};font:12px Arial;font-weight:800;vertical-align:top;max-width:14rem;">${escHtml(
                row.label
            )}</td>
        ${tds}
        ${ytdRow}
      </tr>`;
        })
        .join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escHtml(
        reportTitle
    )}</title></head><body style="margin:0;padding:20px;background:#ffffff;color:${text};">
    <h1 style="font:22px/1.2 Segoe UI,Arial,sans-serif;color:#1e3a8a;margin:0 0 6px 0;">${escHtml(
        reportTitle
    )}</h1>
    <p style="font:12px Arial;color:${mutedN};margin:0 0 18px 0;">${escHtml(
        propertyName
    )} &ndash; CY ${meta.year} vs LY ${meta.yearLy} (green = up vs LY, red = down)</p>
    ${fullDisclaimer}
    <table style="border-collapse:collapse;width:100%;min-width:1600px;">
      <thead>
        <tr>${headRow1.join('')}</tr>
        <tr>${headRow2.join('')}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    </body></html>`;
}

function escHtml(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

