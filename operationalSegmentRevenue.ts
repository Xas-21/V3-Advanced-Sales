/**
 * Request revenue split by operational line segments that overlap a date range.
 * Shared by Reports and the main dashboard for consistent period revenue.
 */

export function inDateRangeYMD(dateStr: string, start: string, end: string): boolean {
    const d = String(dateStr || '').slice(0, 10);
    if (!start || !end) return true;
    if (!d) return false;
    return d >= start && d <= end;
}

export function rangesOverlapYmd(aStart: string, aEnd: string, filterStart: string, filterEnd: string): boolean {
    if (!filterStart || !filterEnd) return true;
    const as = aStart || aEnd;
    const ae = aEnd || aStart;
    if (!as && !ae) return false;
    return !(ae < filterStart || as > filterEnd);
}

export function inclusiveAgendaDayCount(startYmd: string, endYmd: string): number {
    if (!startYmd || !endYmd) return 0;
    const a = new Date(`${startYmd}T00:00:00`).getTime();
    const b = new Date(`${endYmd}T00:00:00`).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.max(1, Math.floor((b - a) / 86400000) + 1);
}

export function parseYmdAgenda(v: any): string {
    const raw = String(v || '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function calculateNights(inDate: string, outDate: string): number {
    if (!inDate || !outDate) return 0;
    const diff = new Date(outDate).getTime() - new Date(inDate).getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function asNumberReport(v: any): number {
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
        const inDate = parseYmdAgenda(r?.checkIn);
        const outDate = parseYmdAgenda(r?.checkOut);
        if (!inDate || !outDate) return 0;
        const ms = new Date(`${outDate}T00:00:00`).getTime() - new Date(`${inDate}T00:00:00`).getTime();
        if (Number.isNaN(ms)) return 0;
        return Math.max(0, Math.ceil(ms / 86400000));
    })();
    const roomsRevenue = rooms.reduce((sum: number, row: any) => {
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        const inDate = parseYmdAgenda(row?.arrival || r?.checkIn);
        const outDate = parseYmdAgenda(row?.departure || r?.checkOut);
        let nights = reqNights;
        if (inDate && outDate) {
            const ms = new Date(`${outDate}T00:00:00`).getTime() - new Date(`${inDate}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) nights = Math.max(0, Math.ceil(ms / 86400000));
        }
        return sum + count * rate * nights;
    }, 0);
    let eventRevenue = agenda.reduce((sum: number, item: any) => {
        const start = parseYmdAgenda(item?.startDate);
        const end = parseYmdAgenda(item?.endDate || item?.startDate);
        let rowDays = 1;
        if (start && end) {
            const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) rowDays = Math.max(1, Math.floor(ms / 86400000) + 1);
        }
        const rowCost = (Number(item?.rate || 0) * Number(item?.pax || 0)) + Number(item?.rental || 0);
        return sum + rowCost * rowDays;
    }, 0);
    const transportRevenue = transport.reduce((sum: number, row: any) => sum + Number(row?.costPerWay || 0), 0);
    let lineSum = roomsRevenue + eventRevenue + transportRevenue;
    const storedNoTax = asNumberReport(
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

/** Check-in, event start, room arrival, or agenda start — never received/created dates. */
function operationalStayAnchorYmd(r: any): string {
    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    for (const row of rooms) {
        const a = parseYmdAgenda(row?.arrival || r?.checkIn);
        if (a) return a;
    }
    const ci = parseYmdAgenda(r?.checkIn);
    if (ci) return ci;
    const es = parseYmdAgenda(r?.eventStart);
    if (es) return es;
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    const starts = agenda
        .map((row: any) => parseYmdAgenda(row?.startDate))
        .filter(Boolean) as string[];
    if (starts.length) return starts.sort()[0];
    return '';
}

export type ReportSegment = {
    key: string;
    line: string;
    displayDate: string;
    roomRev: number;
    eventRev: number;
    roomNights: number;
    stayNights: number;
    pax: number;
    agendaStart: string;
    agendaEnd: string;
    agendaDays: number;
};

export function segmentLineTotalExTax(s: ReportSegment, transportOnThisRow: number): number {
    return s.roomRev + s.eventRev + transportOnThisRow;
}

/**
 * One row per room stay and/or per agenda line that overlaps [filterStart, filterEnd].
 * Transport is excluded from report revenue totals.
 */
export function buildReportSegmentsForRequest(r: any, filterStart: string, filterEnd: string): ReportSegment[] {
    if (!filterStart || !filterEnd) return [];
    const out: ReportSegment[] = [];
    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    for (let i = 0; i < rooms.length; i += 1) {
        const row = rooms[i];
        const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
        const outA = parseYmdAgenda(row?.departure || r?.checkOut);
        if (!inA || !outA) continue;
        const nightsInRange = eachOccupiedNightYmd(inA, outA).filter((d) =>
            ymdInInclusiveRange(d, filterStart, filterEnd)
        );
        if (!nightsInRange.length) continue;
        const nights = nightsInRange.length;
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        const roomRev = count * rate * nights;
        out.push({
            key: `room-${i}-${nightsInRange[0]}`,
            line: `Room · ${nightsInRange[0]}`,
            displayDate: nightsInRange[0],
            roomRev,
            eventRev: 0,
            roomNights: count * nights,
            stayNights: nights,
            pax: 0,
            agendaStart: '',
            agendaEnd: '',
            agendaDays: 0,
        });
    }
    if (!rooms.length) {
        const inA = parseYmdAgenda(r?.checkIn || r?.eventStart);
        const outA = parseYmdAgenda(r?.checkOut || r?.eventEnd);
        if (inA && outA) {
            const nightsInRange = eachOccupiedNightYmd(inA, outA).filter((d) =>
                ymdInInclusiveRange(d, filterStart, filterEnd)
            );
            if (nightsInRange.length) {
                const br = computeRequestRevenueBreakdownNoTax(r);
                const totalNights = Math.max(0, calculateNights(inA, outA));
                const nights = nightsInRange.length;
                const roomRev = totalNights > 0 ? (br.roomsRevenue * nights) / totalNights : br.roomsRevenue;
                if (roomRev > 0) {
                    out.push({
                        key: `accom-${nightsInRange[0]}`,
                        line: 'Accommodation (request dates)',
                        displayDate: nightsInRange[0],
                        roomRev,
                        eventRev: 0,
                        roomNights: nights * (Number(r?.totalRooms) || 1) || 0,
                        stayNights: nights,
                        pax: 0,
                        agendaStart: '',
                        agendaEnd: '',
                        agendaDays: 0,
                    });
                }
            }
        }
    }
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    for (let i = 0; i < agenda.length; i += 1) {
        const item = agenda[i];
        if (!item || typeof item !== 'object') continue;
        const sd = parseYmdAgenda(item.startDate);
        const ed = parseYmdAgenda(item.endDate || item.startDate) || sd;
        if (!sd) continue;
        const daysInRange: string[] = [];
        let dayCursor = new Date(`${sd}T00:00:00`).getTime();
        const dayEnd = new Date(`${ed || sd}T00:00:00`).getTime();
        while (dayCursor <= dayEnd) {
            const ymd = toYmdUtcMidnight(dayCursor);
            if (ymd && ymdInInclusiveRange(ymd, filterStart, filterEnd)) daysInRange.push(ymd);
            dayCursor += 86400000;
        }
        if (!daysInRange.length) continue;
        const rowCost = (Number(item.rate || 0) * Number(item.pax || 0)) + Number(item.rental || 0);
        const eventRev = rowCost * daysInRange.length;
        const paxN = Number(item.pax || 0) || 0;
        out.push({
            key: `agenda-${i}-${daysInRange[0]}`,
            line: `Event · ${daysInRange[0]}`,
            displayDate: daysInRange[0],
            roomRev: 0,
            eventRev,
            roomNights: 0,
            stayNights: 0,
            pax: paxN,
            agendaStart: daysInRange[0],
            agendaEnd: daysInRange[daysInRange.length - 1],
            agendaDays: daysInRange.length,
        });
    }
    if (out.length) return out;
    const br = computeRequestRevenueBreakdownNoTax(r);
    if (br.totalLineNoTax <= 0) return [];
    const inA = parseYmdAgenda(r?.checkIn || r?.eventStart);
    const outA = parseYmdAgenda(r?.checkOut || r?.eventEnd || inA);
    if (!inA || !rangesOverlapYmd(inA, outA || inA, filterStart, filterEnd)) return [];
    const nightsInRange = outA
        ? eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, filterStart, filterEnd))
        : inDateRangeYMD(inA, filterStart, filterEnd)
          ? [inA]
          : [];
    if (!nightsInRange.length) return [];
    const displayDate = nightsInRange[0];
    const totalNights = outA ? Math.max(0, calculateNights(inA, outA)) : 1;
    const scale = totalNights > 0 ? nightsInRange.length / totalNights : 1;
    const t = String(r?.requestType || '').toLowerCase();
    const evHeavy =
        t === 'event' || t === 'event_rooms' || t.includes('event') || t === 'event with rooms' || t.includes('series');
    if (evHeavy) {
        return [
            {
                key: 'fallback-1',
                line: 'Request total (line detail not split)',
                displayDate,
                roomRev: br.roomsRevenue * scale,
                eventRev: br.eventRevenue * scale,
                roomNights: 0,
                stayNights: nightsInRange.length,
                pax: 0,
                agendaStart: '',
                agendaEnd: '',
                agendaDays: 0,
            },
        ];
    }
    return [
        {
            key: 'fallback-1',
            line: 'Request total (line detail not split)',
            displayDate,
            roomRev: Math.max(0, br.roomsRevenue + br.eventRevenue) * scale,
            eventRev: 0,
            roomNights: 0,
            stayNights: nightsInRange.length,
            pax: 0,
            agendaStart: '',
            agendaEnd: '',
            agendaDays: 0,
        },
    ];
}

function isSeriesRequestOperational(r: any): boolean {
    return String(r?.requestType || '').toLowerCase().includes('series');
}

function requestTypeKey(r: any): string {
    return String(r?.requestType || '').toLowerCase().trim();
}

function isEventOnlyOperational(r: any): boolean {
    if (isSeriesRequestOperational(r)) return false;
    const t = requestTypeKey(r);
    if (t === 'event_rooms' || t.includes('event with room')) return false;
    if (t === 'event') return true;
    return false;
}

function isEventRoomsOperational(r: any): boolean {
    if (isSeriesRequestOperational(r)) return false;
    const t = requestTypeKey(r);
    return t === 'event_rooms' || t.includes('event with room');
}

function isEventsCateringEligibleOperational(r: any): boolean {
    return isEventOnlyOperational(r) || isEventRoomsOperational(r);
}

/** Check-in / room arrival / agenda start anchors for chart unit bucketing (no received date). */
export function getRequestOperationalCountDates(r: any): string[] {
    if (isSeriesRequestOperational(r)) {
        const rows = Array.isArray(r?.rooms) ? r.rooms : [];
        const dates = rows
            .map((row: any) => parseYmdAgenda(row?.arrival || row?.checkIn))
            .filter(Boolean) as string[];
        if (dates.length) return dates;
        const anchor = operationalStayAnchorYmd(r);
        return anchor ? [anchor] : [];
    }
    if (isEventsCateringEligibleOperational(r)) {
        const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
        const starts = agenda
            .map((row: any) => parseYmdAgenda(row?.startDate || row?.endDate))
            .filter(Boolean) as string[];
        if (starts.length) return [...new Set(starts)].sort();
    }
    const anchor = operationalStayAnchorYmd(r);
    return anchor ? [anchor] : [];
}

/**
 * True when stay (check-in/out) or agenda dates overlap the filter range.
 * Does not use received / request / created dates.
 */
export function requestOperationalDatesOverlapRange(
    r: any,
    filterStart: string,
    filterEnd: string
): boolean {
    if (!filterStart || !filterEnd) return true;

    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    for (const rr of rooms) {
        const a = parseYmdAgenda(rr?.arrival || r?.checkIn);
        const b = parseYmdAgenda(rr?.departure || r?.checkOut);
        if (a && b && rangesOverlapYmd(a, b, filterStart, filterEnd)) return true;
        if (a && !b && inDateRangeYMD(a, filterStart, filterEnd)) return true;
    }

    if (!rooms.length) {
        const inA = parseYmdAgenda(r?.checkIn || r?.eventStart);
        const outA = parseYmdAgenda(r?.checkOut || r?.eventEnd || inA);
        if (inA) {
            if (outA && rangesOverlapYmd(inA, outA, filterStart, filterEnd)) return true;
            if (inDateRangeYMD(inA, filterStart, filterEnd)) return true;
        }
    }

    for (const item of Array.isArray(r?.agenda) ? r.agenda : []) {
        const s = parseYmdAgenda(item?.startDate);
        const e = parseYmdAgenda(item?.endDate || item?.startDate) || s;
        if (s && rangesOverlapYmd(s, e, filterStart, filterEnd)) return true;
    }

    return false;
}

function sortedAgendaStartDates(r: any): string[] {
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    const starts = agenda
        .map((row: any) => parseYmdAgenda(row?.startDate))
        .filter(Boolean) as string[];
    return [...new Set(starts)].sort();
}

function sortedRoomArrivalDates(r: any): string[] {
    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    const dates = rooms
        .map((row: any) => parseYmdAgenda(row?.arrival || row?.checkIn || r?.checkIn))
        .filter(Boolean) as string[];
    return [...new Set(dates)].sort();
}

/**
 * Single anchor for Requests / Status charts and Total Requests KPI (one row per request).
 * Never uses received / request / created dates.
 *
 * - Event only: first agenda start, then group eventStart, then check-in.
 * - Event + Rooms: first room arrival / check-in (first stay night), then first agenda start, then eventStart.
 * - Series: earliest room arrival, then group check-in, then eventStart.
 * - Other accommodation: room arrival, check-in, eventStart, agenda start.
 */
export function getRequestChartBucketAnchorDate(r: any): string {
    const agendaStarts = sortedAgendaStartDates(r);
    const roomArrivals = sortedRoomArrivalDates(r);
    const checkIn = parseYmdAgenda(r?.checkIn);
    const eventStart = parseYmdAgenda(r?.eventStart);

    if (isEventOnlyOperational(r)) {
        if (agendaStarts.length) return agendaStarts[0];
        if (eventStart) return eventStart;
        if (checkIn) return checkIn;
        return '';
    }

    if (isEventRoomsOperational(r)) {
        if (roomArrivals.length) return roomArrivals[0];
        if (checkIn) return checkIn;
        if (agendaStarts.length) return agendaStarts[0];
        if (eventStart) return eventStart;
        return '';
    }

    if (isSeriesRequestOperational(r)) {
        if (roomArrivals.length) return roomArrivals[0];
        if (checkIn) return checkIn;
        if (eventStart) return eventStart;
        return '';
    }

    if (roomArrivals.length) return roomArrivals[0];
    if (checkIn) return checkIn;
    if (eventStart) return eventStart;
    if (agendaStarts.length) return agendaStarts[0];
    return '';
}

function endOnEarliestAgendaStart(r: any): string {
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    const rows = agenda
        .map((row: any) => ({
            start: parseYmdAgenda(row?.startDate),
            end: parseYmdAgenda(row?.endDate || row?.startDate),
        }))
        .filter((row) => row.start);
    if (!rows.length) return '';
    const earliest = [...rows.map((row) => row.start)].sort()[0];
    const ends = rows
        .filter((row) => row.start === earliest)
        .map((row) => row.end)
        .filter(Boolean)
        .sort();
    return ends[0] || earliest;
}

/** Departure/end on the same row as the earliest arrival or agenda start. */
function departureOnEarliestRoomArrival(r: any): string {
    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    const rows = rooms
        .map((row: any) => ({
            arrival: parseYmdAgenda(row?.arrival || row?.checkIn || r?.checkIn),
            departure: parseYmdAgenda(row?.departure || row?.checkOut || r?.checkOut),
        }))
        .filter((row) => row.arrival);
    if (!rows.length) return '';
    const earliest = [...rows.map((row) => row.arrival)].sort()[0];
    const deps = rows
        .filter((row) => row.arrival === earliest)
        .map((row) => row.departure)
        .filter(Boolean)
        .sort();
    return deps[0] || '';
}

/**
 * One departure/end per request: the end date on the earliest arrival or start row.
 * Later rooms and later agenda days are ignored.
 */
export function getRequestSearchDepartureDate(r: any): string {
    const checkOut = parseYmdAgenda(r?.checkOut);
    const eventEnd = parseYmdAgenda(r?.eventEnd);
    const roomDep = departureOnEarliestRoomArrival(r);
    const agendaEnd = endOnEarliestAgendaStart(r);

    if (isEventOnlyOperational(r)) {
        if (agendaEnd) return agendaEnd;
        if (eventEnd) return eventEnd;
        if (checkOut) return checkOut;
        return '';
    }

    if (roomDep) return roomDep;
    if (checkOut) return checkOut;
    if (isEventRoomsOperational(r) && agendaEnd) return agendaEnd;
    if (eventEnd) return eventEnd;
    if (agendaEnd) return agendaEnd;
    return '';
}

function ymdWithinOptionalBounds(date: string, from: string, to: string): boolean {
    const d = String(date || '').slice(0, 10);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
}

/**
 * Requests search: earliest arrival/start must fall in the arrival from–to range,
 * and the departure/end on that same stay must fall in the departure from–to range.
 * An empty bound is open. Both ranges are optional and combined.
 */
export function requestMatchesSearchDateRanges(
    r: any,
    arrivalFrom: string,
    arrivalTo: string,
    departureFrom: string,
    departureTo: string
): boolean {
    const fromA = String(arrivalFrom || '').trim();
    const toA = String(arrivalTo || '').trim();
    const fromD = String(departureFrom || '').trim();
    const toD = String(departureTo || '').trim();
    const hasArrival = !!(fromA || toA);
    const hasDeparture = !!(fromD || toD);
    if (!hasArrival && !hasDeparture) return true;

    if (hasArrival && !ymdWithinOptionalBounds(getRequestChartBucketAnchorDate(r), fromA, toA)) return false;
    if (hasDeparture && !ymdWithinOptionalBounds(getRequestSearchDepartureDate(r), fromD, toD)) return false;
    return true;
}

/** Chart/KPI anchor placement: anchor date must fall inside [filterStart, filterEnd]. Dashboard Total Requests uses overlap (see requestOperationalDatesOverlapRange). */
export function requestCountsInChartsPeriod(r: any, filterStart: string, filterEnd: string): boolean {
    if (!filterStart || !filterEnd) return false;
    const anchor = getRequestChartBucketAnchorDate(r);
    return !!anchor && ymdInInclusiveRange(anchor, filterStart, filterEnd);
}

/** Lowercase status key matching dashboard chart rows (inquiry, accepted, …). */
export function chartStatusKeyFromRequest(req: any): string {
    const raw = String(req?.status || '').trim().toLowerCase();
    if (raw === 'draft') return 'inquiry';
    if (raw === 'inquiry') return 'inquiry';
    if (raw === 'accepted') return 'accepted';
    if (raw === 'tentative') return 'tentative';
    if (raw === 'definite') return 'definite';
    if (raw === 'actual') return 'actual';
    if (raw === 'cancelled') return 'cancelled';
    return '';
}

/**
 * Add exactly +1 Requests bar and +1 Status stack entry for this request (never per room/agenda line).
 */
export function incrementUniqueRequestChartCounts(
    req: any,
    filterStart: string,
    filterEnd: string,
    getRow: (anchorYmd: string) => Record<string, unknown> | undefined,
    options: { includeInRequestCount?: boolean } = {}
): void {
    const anchor = getRequestChartBucketAnchorDate(req);
    if (!anchor || !ymdInInclusiveRange(anchor, filterStart, filterEnd)) return;
    const row = getRow(anchor);
    if (!row) return;

    const includeRequest = options.includeInRequestCount !== false;
    if (includeRequest) {
        row.totalRequests = (Number(row.totalRequests) || 0) + 1;
    }

    const status = chartStatusKeyFromRequest(req);
    if (status && Object.prototype.hasOwnProperty.call(row, status)) {
        row[status] = (Number(row[status]) || 0) + 1;
    }
}

/** @deprecated Use getRequestChartBucketAnchorDate + requestCountsInChartsPeriod */
export function getRequestChartBucketDatesInRange(
    r: any,
    filterStart: string,
    filterEnd: string
): string[] {
    if (!requestCountsInChartsPeriod(r, filterStart, filterEnd)) return [];
    const anchor = getRequestChartBucketAnchorDate(r);
    return anchor ? [anchor] : [];
}

/** Dashboard / CRM period filter — same rules as request search date filter. */
export function requestTouchesOperationalRange(
    r: any,
    range: { start: string; end: string }
): boolean {
    const start = String(range?.start || '').trim();
    const end = String(range?.end || '').trim();
    if (!start || !end) return true;
    return requestOperationalDatesOverlapRange(r, start, end);
}

export function requestTouchesOperationalDateRange(r: any, filterStart: string, filterEnd: string): boolean {
    return requestOperationalDatesOverlapRange(r, filterStart, filterEnd);
}

/** Ex-tax: sum of segment line totals in range (rooms + event only; transport excluded). */
export function sumRequestSegmentRevenueExTaxInRange(r: any, filterStart: string, filterEnd: string): number {
    const segs = buildReportSegmentsForRequest(r, filterStart, filterEnd);
    if (!segs.length) return 0;
    let t = 0;
    for (let si = 0; si < segs.length; si += 1) {
        t += segmentLineTotalExTax(segs[si], 0);
    }
    return t;
}

// --- Dashboard / account-profile charts: night- and agenda-day-level proration (not used by Reports vs LY) ---

function toYmdUtcMidnight(ms: number): string {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Occupied night dates: arrival night through night before checkout (same convention as dashboard overlap walks). */
export function eachOccupiedNightYmd(arrivalYmd: string, departureYmd: string): string[] {
    if (!arrivalYmd || !departureYmd) return [];
    const out: string[] = [];
    let c = new Date(`${arrivalYmd}T00:00:00`).getTime();
    const endMs = new Date(`${departureYmd}T00:00:00`).getTime();
    if (Number.isNaN(c) || Number.isNaN(endMs)) return [];
    while (c < endMs) {
        const y = toYmdUtcMidnight(c);
        if (y) out.push(y);
        c += 86400000;
    }
    return out;
}

function ymdInInclusiveRange(ymd: string, start: string, end: string): boolean {
    if (!ymd || !start || !end) return false;
    return ymd >= start && ymd <= end;
}

/** Inclusive agenda calendar days (start through end). */
export function eachInclusiveAgendaDayYmd(startYmd: string, endYmd: string): string[] {
    if (!startYmd) return [];
    const ed = endYmd || startYmd;
    const out: string[] = [];
    let c = new Date(`${startYmd}T00:00:00`).getTime();
    const endAt = new Date(`${ed}T00:00:00`).getTime();
    if (Number.isNaN(c) || Number.isNaN(endAt)) return [];
    while (c <= endAt) {
        const y = toYmdUtcMidnight(c);
        if (y) out.push(y);
        c += 86400000;
    }
    return out;
}

function isSeriesRequestDash(r: any): boolean {
    return String(r?.requestType || '').toLowerCase().includes('series');
}

function normalizeRequestTypeDash(raw: any): string {
    const t = String(raw || '').toLowerCase().trim();
    if (t === 'event' || t === 'events' || t === 'event only' || t === 'mice' || t === 'mice event') return 'event';
    if (t === 'event_rooms' || t === 'event with rooms' || t === 'event with room' || t.includes('event with room')) return 'event_rooms';
    if (t === 'series' || t === 'series group' || t.includes('series')) return 'series';
    if (t === 'accommodation' || t === 'accommodation only') return 'accommodation';
    return t || 'accommodation';
}

function isMiceChartEligibleDash(r: any): boolean {
    if (isSeriesRequestDash(r)) return false;
    const t = normalizeRequestTypeDash(r?.requestType);
    if (t === 'event') return true;
    if (t === 'event_rooms') return true;
    return false;
}

function isEventWithRoomsRequestDash(r: any): boolean {
    return normalizeRequestTypeDash(r?.requestType) === 'event_rooms';
}

export type DashboardFinancialBucket = {
    revenue: number;
    rooms: number;
    roomNights: number;
    roomsRevenue: number;
    miceRequests: number;
    miceRevenue: number;
    miceRoomsRevenue: number;
};

/** Room count on a given calendar night from room lines (staggered series) or request totalRooms / 1. */
function nightlyRoomInventoryForNightYmd(r: any, ny: string): number {
    const rows = Array.isArray(r?.rooms) ? r.rooms : [];
    let s = 0;
    for (const row of rows) {
        const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
        const outA = parseYmdAgenda(row?.departure || r?.checkOut);
        if (!inA || !outA) continue;
        for (const d of eachOccupiedNightYmd(inA, outA)) {
            if (d === ny) {
                s += Math.max(0, Number(row?.count || 0));
                break;
            }
        }
    }
    if (s > 0) return s;
    const tr = Number(r?.totalRooms ?? 0);
    if (Number.isFinite(tr) && tr > 0) return Math.round(tr);
    return 1;
}

function proratedRoomRevenueSubtotal(
    r: any,
    rangeStart: string,
    rangeEnd: string,
    br: { roomsRevenue: number; totalLineNoTax: number }
): number {
    let room = 0;
    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    let rowRoomSum = 0;

    for (const row of rooms) {
        const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
        const outA = parseYmdAgenda(row?.departure || r?.checkOut);
        if (!inA || !outA) continue;
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        for (const ny of eachOccupiedNightYmd(inA, outA)) {
            if (!ymdInInclusiveRange(ny, rangeStart, rangeEnd)) continue;
            room += count * rate;
        }
        const tn = Math.max(0, calculateNights(inA, outA));
        if (tn > 0) rowRoomSum += count * Number(row?.rate || 0) * tn;
    }

    if (!rooms.length) {
        const inA = parseYmdAgenda(r?.checkIn);
        const outA = parseYmdAgenda(r?.checkOut);
        if (inA && outA) {
            const tn = Math.max(0, calculateNights(inA, outA));
            const ni = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length;
            if (tn > 0 && br.roomsRevenue > 0) room += (br.roomsRevenue * ni) / tn;
        }
    } else if (rowRoomSum <= 0 && br.roomsRevenue > 0) {
        const inA = parseYmdAgenda(r?.checkIn);
        const outA = parseYmdAgenda(r?.checkOut);
        if (inA && outA) {
            const tn = Math.max(0, calculateNights(inA, outA));
            const ni = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length;
            if (tn > 0) room += (br.roomsRevenue * ni) / tn;
        }
    }
    return room;
}

function proratedEventRevenueSubtotal(r: any, rangeStart: string, rangeEnd: string): number {
    let event = 0;
    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    for (const item of agenda) {
        if (!item || typeof item !== 'object') continue;
        const sd = parseYmdAgenda(item.startDate);
        const ed = parseYmdAgenda(item.endDate || item.startDate) || sd;
        if (!sd) continue;
        let rowDays = 1;
        if (sd && ed) {
            const ms = new Date(`${ed}T00:00:00`).getTime() - new Date(`${sd}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) rowDays = Math.max(1, Math.floor(ms / 86400000) + 1);
        }
        const rowCost = Number(item?.rate || 0) * Number(item?.pax || 0) + Number(item?.rental || 0);
        const lineTotal = rowCost * rowDays;
        const days = eachInclusiveAgendaDayYmd(sd, ed);
        const hit = days.filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd));
        if (hit.length === 0) continue;
        event += lineTotal * (hit.length / rowDays);
    }
    return event;
}

/** Room-only ex-tax portion in range (dashboard performance vs budget). */
export function sumRequestProratedRoomRevenueExTaxInRange(r: any, rangeStart: string, rangeEnd: string): number {
    if (!rangeStart || !rangeEnd) return 0;
    const br = computeRequestRevenueBreakdownNoTax(r);
    let room = proratedRoomRevenueSubtotal(r, rangeStart, rangeEnd, br);
    const event = proratedEventRevenueSubtotal(r, rangeStart, rangeEnd);
    const sub = room + event;
    let fallbackRoom = 0;
    if (sub <= 0 && br.totalLineNoTax > 0) {
        const anchor = operationalStayAnchorYmd(r);
        if (anchor && ymdInInclusiveRange(anchor, rangeStart, rangeEnd)) {
            const t = String(r?.requestType || '').toLowerCase();
            const evHeavy =
                t === 'event' || t === 'event_rooms' || t.includes('event') || t === 'event with rooms' || t.includes('series');
            if (!evHeavy) {
                const inA = parseYmdAgenda(r?.checkIn);
                const outA = parseYmdAgenda(r?.checkOut);
                if (inA && outA) {
                    const tn = Math.max(0, calculateNights(inA, outA));
                    const ni = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length;
                    if (tn > 0) fallbackRoom += (br.totalLineNoTax * ni) / tn;
                    else fallbackRoom += br.totalLineNoTax;
                } else fallbackRoom += br.totalLineNoTax;
            }
        }
    }
    return room + fallbackRoom;
}

/** Event / agenda ex-tax portion in range (dashboard F&B performance). */
export function sumRequestProratedEventRevenueExTaxInRange(r: any, rangeStart: string, rangeEnd: string): number {
    if (!rangeStart || !rangeEnd) return 0;
    const br = computeRequestRevenueBreakdownNoTax(r);
    const room = proratedRoomRevenueSubtotal(r, rangeStart, rangeEnd, br);
    let event = proratedEventRevenueSubtotal(r, rangeStart, rangeEnd);
    const sub = room + event;
    if (sub <= 0 && br.totalLineNoTax > 0) {
        const anchor = operationalStayAnchorYmd(r);
        if (anchor && ymdInInclusiveRange(anchor, rangeStart, rangeEnd)) {
            const t = String(r?.requestType || '').toLowerCase();
            const evHeavy =
                t === 'event' || t === 'event_rooms' || t.includes('event') || t === 'event with rooms' || t.includes('series');
            if (evHeavy) {
                const inA = parseYmdAgenda(r?.checkIn);
                const outA = parseYmdAgenda(r?.checkOut);
                if (inA && outA) {
                    const tn = Math.max(0, calculateNights(inA, outA));
                    const ni = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length;
                    if (tn > 0) {
                        const tot = br.eventRevenue + br.roomsRevenue + br.transportRevenue;
                        event += (tot * ni) / tn;
                    } else event += br.totalLineNoTax;
                } else event += br.totalLineNoTax;
            }
        }
    }
    return event;
}

/** Ex-tax rooms + event/agenda in range (no transport). Aligns CRM funnel, Reports, and dashboard KPI revenue. */
export function sumRequestOperationalRevenueExTaxInRange(
    r: any,
    rangeStart: string,
    rangeEnd: string
): number {
    if (!rangeStart || !rangeEnd) return 0;
    return (
        sumRequestProratedRoomRevenueExTaxInRange(r, rangeStart, rangeEnd) +
        sumRequestProratedEventRevenueExTaxInRange(r, rangeStart, rangeEnd)
    );
}

/**
 * Ex-tax total for [rangeStart, rangeEnd]: room revenue by occupied nights in range,
 * agenda/event revenue by calendar days in range, transport once if any room/event attributed.
 * (Dashboard KPIs / feed — not Reports export.)
 */
export function sumRequestProratedRevenueExTaxInRange(r: any, rangeStart: string, rangeEnd: string): number {
    if (!rangeStart || !rangeEnd) return 0;
    const br = computeRequestRevenueBreakdownNoTax(r);
    const room = proratedRoomRevenueSubtotal(r, rangeStart, rangeEnd, br);
    const event = proratedEventRevenueSubtotal(r, rangeStart, rangeEnd);
    const sub = room + event;
    const transport = sub > 0 ? br.transportRevenue : 0;
    let fallback = 0;
    if (sub <= 0 && br.totalLineNoTax > 0) {
        const anchor = operationalStayAnchorYmd(r);
        if (anchor && ymdInInclusiveRange(anchor, rangeStart, rangeEnd)) {
            const t = String(r?.requestType || '').toLowerCase();
            const evHeavy =
                t === 'event' || t === 'event_rooms' || t.includes('event') || t === 'event with rooms' || t.includes('series');
            if (evHeavy) {
                const inA = parseYmdAgenda(r?.checkIn);
                const outA = parseYmdAgenda(r?.checkOut);
                if (inA && outA) {
                    const tn = Math.max(0, calculateNights(inA, outA));
                    const ni = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length;
                    if (tn > 0) fallback += (br.totalLineNoTax * ni) / tn;
                    else fallback += br.totalLineNoTax;
                } else {
                    fallback += br.totalLineNoTax;
                }
            } else {
                const inA = parseYmdAgenda(r?.checkIn);
                const outA = parseYmdAgenda(r?.checkOut);
                if (inA && outA) {
                    const tn = Math.max(0, calculateNights(inA, outA));
                    const ni = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length;
                    if (tn > 0) fallback += (br.totalLineNoTax * ni) / tn;
                    else fallback += br.totalLineNoTax;
                } else {
                    fallback += br.totalLineNoTax;
                }
            }
        }
    }

    return room + event + transport + fallback;
}

/** `day` = one chart bucket per calendar day (rooms sum occupancy each day). `month` = one bucket per month (rooms = line count once per line per month, not sum of daily counts). */
export type DashboardRoomsChartBucketGranularity = 'day' | 'month';

/**
 * Add prorated revenue / room nights / MICE slices into dashboard-style month (or day) buckets.
 * Caller supplies `includeRoomsChart` / `includeMiceChart` (same gates as AS.tsx).
 */
export function addProratedRequestFinancialsToDashboardBuckets(
    r: any,
    rangeStart: string,
    rangeEnd: string,
    keyFor: (isoYmd: string) => string,
    getBucket: (key: string) => DashboardFinancialBucket | undefined,
    opts: {
        skipPerf: boolean;
        includeRoomsChart: boolean;
        includeMiceChart: boolean;
        /** Defaults to `month` when omitted (rooms once per line per period bucket). */
        roomsChartBucketGranularity?: DashboardRoomsChartBucketGranularity;
    }
): void {
    if (opts.skipPerf || !rangeStart || !rangeEnd) return;
    const br = computeRequestRevenueBreakdownNoTax(r);
    const transport = br.transportRevenue;
    const allocDates: string[] = [];
    const roomBucketsAreDaily = opts.roomsChartBucketGranularity === 'day';
    const includeMiceRoomsRevenue = opts.includeMiceChart && isEventWithRoomsRequestDash(r);

    const touch = (ymd: string, fn: (b: DashboardFinancialBucket) => void) => {
        const k = keyFor(ymd);
        const b = getBucket(k);
        if (!b) return;
        fn(b);
        allocDates.push(ymd);
    };

    const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
    const anyRowWithRate = rooms.some((rr: any) => Number(rr?.rate || 0) > 0);

    const addRatedRoomRows = (alsoRoomsChart: boolean) => {
        for (let ri = 0; ri < rooms.length; ri++) {
            const row = rooms[ri];
            if (anyRowWithRate && Number(row?.rate || 0) <= 0) continue;
            const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
            const outA = parseYmdAgenda(row?.departure || r?.checkOut);
            if (!inA || !outA) continue;
            const count = Number(row?.count || 0);
            const rate = Number(row?.rate || 0);
            const tn = Math.max(0, calculateNights(inA, outA));
            if (tn <= 0) continue;
            const perNight = count * rate;
            const periodSeenForRooms = new Set<string>();
            for (const ny of eachOccupiedNightYmd(inA, outA)) {
                if (!ymdInInclusiveRange(ny, rangeStart, rangeEnd)) continue;
                const periodKey = keyFor(ny);
                touch(ny, (b) => {
                    b.revenue += perNight;
                    if (includeMiceRoomsRevenue) b.miceRoomsRevenue += perNight;
                    if (alsoRoomsChart) {
                        b.roomsRevenue += perNight;
                        b.roomNights += count;
                        if (roomBucketsAreDaily) {
                            b.rooms += count;
                        } else if (!periodSeenForRooms.has(periodKey)) {
                            periodSeenForRooms.add(periodKey);
                            b.rooms += count;
                        }
                    }
                });
            }
        }
    };

    if (!anyRowWithRate && br.roomsRevenue > 0) {
        const inA = parseYmdAgenda(r?.checkIn);
        const outA = parseYmdAgenda(r?.checkOut);
        if (inA && outA) {
            const tn = Math.max(0, calculateNights(inA, outA));
            const nights = eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd));
            if (tn > 0 && nights.length) {
                const perNightRoomRev = br.roomsRevenue / tn;
                const seenPeriodRooms = new Set<string>();
                for (const ny of nights) {
                    const periodKey = keyFor(ny);
                    const nightlyR = nightlyRoomInventoryForNightYmd(r, ny);
                    touch(ny, (b) => {
                        b.revenue += perNightRoomRev;
                        if (includeMiceRoomsRevenue) b.miceRoomsRevenue += perNightRoomRev;
                        if (opts.includeRoomsChart) {
                            b.roomsRevenue += perNightRoomRev;
                            b.roomNights += nightlyR;
                            if (roomBucketsAreDaily) {
                                b.rooms += nightlyR;
                            } else if (!seenPeriodRooms.has(periodKey)) {
                                seenPeriodRooms.add(periodKey);
                                b.rooms += nightlyR;
                            }
                        }
                    });
                }
            }
        }
    } else {
        addRatedRoomRows(opts.includeRoomsChart);
        let rowSum = 0;
        for (const row of rooms) {
            const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
            const outA = parseYmdAgenda(row?.departure || r?.checkOut);
            if (!inA || !outA) continue;
            const count = Number(row?.count || 0);
            const rate = Number(row?.rate || 0);
            rowSum += count * rate * Math.max(0, calculateNights(inA, outA));
        }
        if (rowSum <= 0 && br.roomsRevenue > 0) {
            const inA = parseYmdAgenda(r?.checkIn);
            const outA = parseYmdAgenda(r?.checkOut);
            const tn = Math.max(0, calculateNights(inA, outA));
            const nights = inA && outA ? eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)) : [];
            if (tn > 0 && nights.length) {
                const perNight = br.roomsRevenue / tn;
                const seenPeriodRooms = new Set<string>();
                for (const ny of nights) {
                    const periodKey = keyFor(ny);
                    const nightlyR = nightlyRoomInventoryForNightYmd(r, ny);
                    touch(ny, (b) => {
                        b.revenue += perNight;
                        if (includeMiceRoomsRevenue) b.miceRoomsRevenue += perNight;
                        if (opts.includeRoomsChart) {
                            b.roomsRevenue += perNight;
                            b.roomNights += nightlyR;
                            if (roomBucketsAreDaily) {
                                b.rooms += nightlyR;
                            } else if (!seenPeriodRooms.has(periodKey)) {
                                seenPeriodRooms.add(periodKey);
                                b.rooms += nightlyR;
                            }
                        }
                    });
                }
            }
        }
    }

    const agenda = Array.isArray(r?.agenda) ? r.agenda : [];
    for (const item of agenda) {
        if (!item || typeof item !== 'object') continue;
        const sd = parseYmdAgenda(item.startDate);
        const ed = parseYmdAgenda(item.endDate || item.startDate) || sd;
        if (!sd) continue;
        let rowDays = 1;
        if (sd && ed) {
            const ms = new Date(`${ed}T00:00:00`).getTime() - new Date(`${sd}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) rowDays = Math.max(1, Math.floor(ms / 86400000) + 1);
        }
        const rowCost = Number(item?.rate || 0) * Number(item?.pax || 0) + Number(item?.rental || 0);
        const lineTotal = rowCost * rowDays;
        const hit = eachInclusiveAgendaDayYmd(sd, ed).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd));
        if (!hit.length) continue;
        const daily = lineTotal / rowDays;
        for (const dy of hit) {
            touch(dy, (b) => {
                b.revenue += daily;
            });
        }
        if (opts.includeMiceChart && isMiceChartEligibleDash(r) && lineTotal > 0) {
            for (const dy of hit) {
                const k = keyFor(dy);
                const b = getBucket(k);
                if (!b) continue;
                b.miceRevenue += daily;
                b.miceRequests += 1 / rowDays;
            }
        }
    }

    let subForTransport = 0;
    for (const row of rooms) {
        const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
        const outA = parseYmdAgenda(row?.departure || r?.checkOut);
        if (!inA || !outA) continue;
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        for (const ny of eachOccupiedNightYmd(inA, outA)) {
            if (ymdInInclusiveRange(ny, rangeStart, rangeEnd)) subForTransport += count * rate;
        }
    }
    if (!rooms.length) {
        const inA = parseYmdAgenda(r?.checkIn);
        const outA = parseYmdAgenda(r?.checkOut);
        const tn = inA && outA ? Math.max(0, calculateNights(inA, outA)) : 0;
        const ni = inA && outA ? eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length : 0;
        if (tn > 0 && br.roomsRevenue > 0 && ni > 0) subForTransport += (br.roomsRevenue * ni) / tn;
    } else {
        let rowSum = 0;
        for (const row of rooms) {
            const inA = parseYmdAgenda(row?.arrival || r?.checkIn);
            const outA = parseYmdAgenda(row?.departure || r?.checkOut);
            if (!inA || !outA) continue;
            const count = Number(row?.count || 0);
            const rate = Number(row?.rate || 0);
            rowSum += count * rate * Math.max(0, calculateNights(inA, outA));
        }
        if (rowSum <= 0 && br.roomsRevenue > 0) {
            const inA = parseYmdAgenda(r?.checkIn);
            const outA = parseYmdAgenda(r?.checkOut);
            const tn = inA && outA ? Math.max(0, calculateNights(inA, outA)) : 0;
            const ni = inA && outA ? eachOccupiedNightYmd(inA, outA).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd)).length : 0;
            if (tn > 0 && ni > 0) subForTransport += (br.roomsRevenue * ni) / tn;
        }
    }
    for (const item of agenda) {
        if (!item || typeof item !== 'object') continue;
        const sd = parseYmdAgenda(item.startDate);
        const ed = parseYmdAgenda(item.endDate || item.startDate) || sd;
        if (!sd) continue;
        let rowDays = 1;
        if (sd && ed) {
            const ms = new Date(`${ed}T00:00:00`).getTime() - new Date(`${sd}T00:00:00`).getTime();
            if (!Number.isNaN(ms)) rowDays = Math.max(1, Math.floor(ms / 86400000) + 1);
        }
        const rowCost = Number(item?.rate || 0) * Number(item?.pax || 0) + Number(item?.rental || 0);
        const lineTotal = rowCost * rowDays;
        const hit = eachInclusiveAgendaDayYmd(sd, ed).filter((d) => ymdInInclusiveRange(d, rangeStart, rangeEnd));
        if (hit.length) subForTransport += lineTotal * (hit.length / rowDays);
    }

    if (transport > 0 && subForTransport > 0) {
        const sorted = [...new Set(allocDates)].sort();
        const anchor = sorted[0] || rangeStart;
        const k = keyFor(anchor);
        const b = getBucket(k);
        if (b) b.revenue += transport;
    }
}
