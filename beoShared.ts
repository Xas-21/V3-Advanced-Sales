import { contactDisplayName } from './accountLeadMapping';
import { DEFAULT_EVENT_PACKAGES, getAgendaTimingSlotsForPackageName } from './propertyMealsPackages';

export function sumPaymentAmounts(payments: any[] | undefined): number {
    return (payments || []).reduce((acc, p) => acc + Number(p?.amount ?? 0), 0);
}

/** YYYY-MM-DD from common request date fields. */
export function normalizeIsoDate(raw: unknown): string | null {
    if (raw == null) return null;
    const s = String(raw).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return s;
}

/** True when paid total covers grand total (2dp), and total is positive. */
export function paymentsMeetOrExceedTotal(paidSum: number, totalCost: number): boolean {
    if (!(totalCost > 0)) return false;
    return Math.round(paidSum * 100) >= Math.round(totalCost * 100);
}

/** Vehicle quantity on a transport row. Missing or invalid count is one trip (legacy rows). */
export function transportRowCount(trip: { count?: unknown } | null | undefined): number {
    const n = Number(trip?.count);
    if (Number.isFinite(n) && n > 0) return n;
    return 1;
}

/** Pre-tax transfer amount: cost per way × quantity. */
export function transportRowAmount(trip: { costPerWay?: unknown; count?: unknown } | null | undefined): number {
    return (Number(trip?.costPerWay) || 0) * transportRowCount(trip);
}

/** Local calendar YYYY-MM-DD in the user's timezone (any time of day maps to that calendar date). */
export function localCalendarIsoDate(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function isSameLocalCalendarDay(iso: string | null | undefined, today: Date = new Date()): boolean {
    const t = normalizeIsoDate(iso);
    if (!t) return false;
    return t === localCalendarIsoDate(today);
}

/**
 * Earliest agenda session start only — no requestDate, receivedDate, deadlines, or stored eventStart fallback.
 */
export function getFirstAgendaStartIso(req: any): string | null {
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    const dates: string[] = [];
    for (const item of agenda) {
        const s = normalizeIsoDate(item?.startDate);
        if (s) dates.push(s);
    }
    if (!dates.length) return null;
    return dates.sort()[0];
}

/**
 * Series: earliest room arrival; if none, property-level check-in only (no received/deadlines).
 */
export function getFirstSeriesArrivalIso(req: any): string | null {
    const dates: string[] = [];
    for (const g of Array.isArray(req?.rooms) ? req.rooms : []) {
        const a = normalizeIsoDate(g?.arrival);
        if (a) dates.push(a);
    }
    if (dates.length) return dates.sort()[0];
    return normalizeIsoDate(req?.checkIn);
}

const PAID_STATUS_RE = /^paid$/i;

/** Full payment: explicit Paid status or paid amount ≥ total (total must be > 0 for amount path). */
export function isRequestPaidInFullForActual(req: any): boolean {
    const ps = String(req?.paymentStatus ?? '').trim();
    if (PAID_STATUS_RE.test(ps)) return true;

    const total = parseFloat(String(req?.totalCost ?? '0').replace(/,/g, '')) || 0;
    if (!(total > 0)) return false;

    const hasLines = Array.isArray(req?.payments) && req.payments.length > 0;
    const paid = hasLines
        ? sumPaymentAmounts(req.payments)
        : parseFloat(String(req?.paidAmount ?? '0').replace(/,/g, '')) || 0;
    return paymentsMeetOrExceedTotal(paid, total);
}

/**
 * Definite + paid in full + local calendar today equals check-in and/or first agenda start (per type).
 * Does not use received date, offer/deposit/payment deadlines, or requestDate.
 */
export function shouldPromoteDefiniteToActual(req: any, today: Date = new Date()): boolean {
    if (String(req?.status ?? '').trim() !== 'Definite') return false;
    if (!isRequestPaidInFullForActual(req)) return false;

    const t = normalizeRequestTypeKey(req?.requestType);
    const todayIso = localCalendarIsoDate(today);

    if (t === 'accommodation') {
        const ci = normalizeIsoDate(req?.checkIn);
        return ci !== null && ci === todayIso;
    }
    if (t === 'event') {
        const firstAg = getFirstAgendaStartIso(req);
        return firstAg !== null && firstAg === todayIso;
    }
    if (t === 'series') {
        const firstArr = getFirstSeriesArrivalIso(req);
        return firstArr !== null && firstArr === todayIso;
    }
    if (t === 'event_rooms') {
        const ci = normalizeIsoDate(req?.checkIn);
        const firstAg = getFirstAgendaStartIso(req);
        return (ci !== null && ci === todayIso) || (firstAg !== null && firstAg === todayIso);
    }
    const ci = normalizeIsoDate(req?.checkIn);
    const firstAg = getFirstAgendaStartIso(req);
    return (ci !== null && ci === todayIso) || (firstAg !== null && firstAg === todayIso);
}

export function calculateNights(inDate: string, outDate: string) {
    if (!inDate || !outDate) return 0;
    const diff = new Date(outDate).getTime() - new Date(inDate).getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/** Add calendar days to an ISO date (YYYY-MM-DD). Uses noon UTC to avoid DST edge cases. */
export function addCalendarDaysIso(isoDate: string, deltaDays: number): string {
    const base = String(isoDate || '').slice(0, 10);
    if (!base) return '';
    const d = new Date(`${base}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + deltaDays);
    return d.toISOString().slice(0, 10);
}

export function normalizeRequestTypeKey(raw: string = '') {
    const t = String(raw || '').toLowerCase().trim();
    if (t === 'event' || t === 'events' || t === 'event only' || t === 'mice' || t === 'mice event') return 'event';
    if (t === 'event_rooms' || t === 'event with rooms' || t === 'event with room' || t.includes('event with room')) return 'event_rooms';
    if (t === 'series' || t === 'series group') return 'series';
    if (t === 'accommodation' || t === 'accommodation only') return 'accommodation';
    return t || 'accommodation';
}

/**
 * Rooms tab / room-inventory charts: pure event & catering types have no accommodation block.
 * Event + Rooms, series stays, and accommodation still contribute.
 */
export function shouldIncludeRequestInRoomsChart(req: any): boolean {
    return normalizeRequestTypeKey(req?.requestType || '') !== 'event';
}

export function calculateEventAgendaDays(agenda: any[] = []) {
    if (!Array.isArray(agenda) || agenda.length === 0) return 0;
    return agenda.reduce((sum: number, item: any) => {
        const start = item?.startDate;
        const end = item?.endDate || item?.startDate;
        if (!start || !end) return sum;
        const ms = new Date(end).getTime() - new Date(start).getTime();
        if (Number.isNaN(ms)) return sum;
        return sum + Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
    }, 0);
}

export function inclusiveCalendarDays(start: string, end: string) {
    if (!start || !end) return 0;
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (Number.isNaN(ms)) return 0;
    return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
}

/** Sum of (agenda row pax × inclusive row days) across all rows — used for "total attendees" / cover counts. */
export function sumAgendaAttendeeDays(agenda: any[] = []) {
    if (!Array.isArray(agenda) || agenda.length === 0) return 0;
    return agenda.reduce((sum: number, item: any) => {
        const start = String(item?.startDate || '').slice(0, 10);
        const end = String(item?.endDate || item?.startDate || '').slice(0, 10);
        const rowDays = start && end ? inclusiveCalendarDays(start, end) : 1;
        const safeDays = Math.max(1, rowDays || 1);
        const pax = Number(item?.pax) || 0;
        return sum + pax * safeDays;
    }, 0);
}

/** One booking slice per venue name for an agenda row (single `venue` or `combinedVenueNames`). */
export function expandAgendaRowVenueOccupancies(row: any, req?: any): { name: string; start: string; end: string }[] {
    const a = String(row?.startDate || req?.eventStart || req?.checkIn || '').trim().slice(0, 10);
    const b = String(
        row?.endDate || row?.startDate || req?.eventEnd || req?.checkOut || req?.eventStart || req?.checkIn || ''
    )
        .trim()
        .slice(0, 10) || a;
    if (!a) return [];
    if (row?.combined && Array.isArray(row.combinedVenueNames) && row.combinedVenueNames.length > 0) {
        const out: { name: string; start: string; end: string }[] = [];
        for (const raw of row.combinedVenueNames) {
            const name = String(raw || '').trim();
            if (name) out.push({ name, start: a, end: b || a });
        }
        return out;
    }
    const v = String(row?.venue || '').trim();
    if (!v) return [];
    return [{ name: v, start: a, end: b || a }];
}

/** Venue text for BEO / detail tables: combined rows use `combinedVenueNames`; otherwise `venue`. */
export function formatAgendaRowVenueDisplay(row: any): string {
    if (row?.combined && Array.isArray(row.combinedVenueNames) && row.combinedVenueNames.length > 0) {
        const names = row.combinedVenueNames
            .map((n: any) => String(n ?? '').trim())
            .filter(Boolean);
        if (names.length) return names.join(', ');
    }
    return String(row?.venue ?? '').trim();
}

export function isoInclusiveRangesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
    const a1 = String(s1 || '').slice(0, 10);
    const b1 = String(e1 || s1 || '').slice(0, 10) || a1;
    const a2 = String(s2 || '').slice(0, 10);
    const b2 = String(e2 || s2 || '').slice(0, 10) || a2;
    if (!a1 || !a2) return false;
    return a1 <= b2 && a2 <= b1;
}

/** First venue/date overlap with another request (same property), excluding `requestId` when editing. */
export function findFirstAgendaVenueConflict(opts: {
    agenda: any[];
    requestId?: string | null;
    propertyId?: string | null;
    candidates: any[];
}): { venue: string; ref: any } | null {
    const { agenda, requestId, propertyId, candidates } = opts;
    if (!Array.isArray(agenda) || agenda.length === 0) return null;
    const mine: { name: string; start: string; end: string }[] = [];
    for (const row of agenda) mine.push(...expandAgendaRowVenueOccupancies(row, {}));
    if (!mine.length) return null;

    const normPid = String(propertyId || '').trim();
    const skipStatus = new Set(['cancelled', 'lost']);

    for (const other of candidates || []) {
        if (String(other?.id || '') === String(requestId || '')) continue;
        const pid = String(other?.propertyId || '').trim();
        if (normPid && pid && pid !== normPid) continue;
        const st = String(other?.status || '').trim().toLowerCase();
        if (skipStatus.has(st)) continue;

        const rows = Array.isArray(other?.agenda) ? other.agenda : [];
        for (const orow of rows) {
            const occs = expandAgendaRowVenueOccupancies(orow, other);
            for (const o of occs) {
                const on = o.name.trim().toLowerCase();
                if (!on) continue;
                for (const m of mine) {
                    if (m.name.trim().toLowerCase() !== on) continue;
                    if (isoInclusiveRangesOverlap(m.start, m.end, o.start, o.end)) {
                        return { venue: m.name, ref: other };
                    }
                }
            }
        }
    }
    return null;
}

export function getEventDateWindow(r: any) {
    const agenda = r?.agenda || [];
    const dates: string[] = [];
    for (const item of agenda) {
        if (item?.startDate) dates.push(item.startDate);
        const e = item?.endDate || item?.startDate;
        if (e) dates.push(e);
    }
    if (dates.length) {
        const sorted = [...new Set(dates)].sort();
        return { start: sorted[0], end: sorted[sorted.length - 1] };
    }
    if (r?.eventStart || r?.eventEnd) {
        return { start: r.eventStart || r.eventEnd, end: r.eventEnd || r.eventStart };
    }
    return { start: r?.checkIn || '', end: r?.checkOut || '' };
}

export function formatAgendaPackageSummary(agenda: any[] = []) {
    const pkgs = [...new Set((agenda || []).map((i: any) => String(i?.package || '').trim()).filter(Boolean))];
    return pkgs.length ? pkgs.join(' / ') : '';
}

/** Coffee break times: `coffee1` / `coffee2`; legacy `coffeeTime` maps to first slot. */
export function formatAgendaRowCoffeeBreak(row: any): string {
    const a = String(row?.coffee1 ?? '').trim() || String(row?.coffeeTime ?? '').trim();
    const b = String(row?.coffee2 ?? '').trim();
    return [a, b].filter(Boolean).join(' & ');
}

export function formatAgendaRowLunch(row: any): string {
    return String(row?.lunchTime ?? row?.lunch ?? '').trim();
}

export function formatAgendaRowDinner(row: any): string {
    return String(row?.dinnerTime ?? row?.dinner ?? '').trim();
}

export function formatAgendaRowSessionNotes(row: any): string {
    return String(row?.notes ?? '').trim();
}

/** Request-level note plus all non-empty agenda row notes (for BEO "Special requests"). */
export function formatBeoSpecialRequestsCombined(req: any): string {
    const main = String(req?.note ?? '').trim();
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    const chunks: string[] = [];
    if (main) chunks.push(main);
    const rowBlocks = agenda
        .map((row: any, i: number) => {
            const n = formatAgendaRowSessionNotes(row);
            if (!n) return null;
            const bits: string[] = [];
            if (row.startDate) bits.push(String(row.startDate));
            if (row.venue) bits.push(String(row.venue));
            const head = bits.length ? ` — ${bits.join(' · ')}` : '';
            return `• Session ${i + 1}${head}\n${n}`;
        })
        .filter(Boolean) as string[];
    if (rowBlocks.length) {
        if (chunks.length) chunks.push('');
        chunks.push('Agenda row notes:');
        chunks.push(rowBlocks.join('\n\n'));
    }
    return chunks.join('\n').trim();
}

export function getAccountForRequest(req: any, accounts: any[]): any | null {
    if (!req || !Array.isArray(accounts) || accounts.length === 0) return null;
    const aid = req.accountId || req.accommodation?.accountId;
    if (aid) {
        const byId = accounts.find((a: any) => String(a?.id) === String(aid));
        if (byId) return byId;
    }
    const an = String(req.account || req.accountName || '').trim().toLowerCase();
    if (an) {
        const byName = accounts.find((a: any) => String(a?.name || '').trim().toLowerCase() === an);
        if (byName) return byName;
    }
    return null;
}

function escapeHtml(raw: any) {
    return String(raw ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** One meal code for list/detail when all room rows match; `MIX` when they differ; fallback to request-level meal. */
export function deriveRequestMealLabelFromRooms(rooms: unknown, fallbackRequestMeal?: string): string {
    const list = Array.isArray(rooms) ? rooms : [];
    const codes = new Set<string>();
    for (const r of list) {
        const raw = String((r as any)?.mealPlan ?? '').trim().toUpperCase();
        if (raw) codes.add(raw);
    }
    if (codes.size === 0) {
        return String(fallbackRequestMeal ?? '').trim();
    }
    if (codes.size === 1) return [...codes][0];
    return 'MIX';
}

export function calculateAccFinancialsForRequest(
    form: any,
    taxesList: any[],
    fallbackRequestType?: string | null
) {
    const nights = calculateNights(form.checkIn, form.checkOut);
    const rtNorm = normalizeRequestTypeKey(form.requestType || fallbackRequestType || '');
    const usePerRoomStayNights = rtNorm === 'series' || rtNorm === 'event_rooms';

    const perRoomNightsResolved = (r: any): number => {
        if (!usePerRoomStayNights) return nights;
        const a = String(r?.arrival || '').slice(0, 10);
        const d = String(r?.departure || '').slice(0, 10);
        if (a && d) return calculateNights(a, d);
        const manual = Number(r?.nights);
        if (a && Number.isFinite(manual) && manual > 0) return manual;
        return nights;
    };

    const roomsCostNoTax = (form.rooms || []).reduce((acc: number, r: any) => {
        const rowNights = perRoomNightsResolved(r);
        return acc + (Number(r.rate || 0) * Number(r.count || 0) * rowNights);
    }, 0);

    const totalRoomNights = (form.rooms || []).reduce((acc: number, r: any) => {
        const rowNights = perRoomNightsResolved(r);
        return acc + (Number(r.count || 0) * rowNights);
    }, 0);

    const transCostNoTax = (form.transportation || []).reduce(
        (acc: number, t: any) => acc + transportRowAmount(t),
        0
    );

    const eventCostNoTax = (form.agenda || []).reduce((acc: number, item: any) => {
        const start = String(item?.startDate || '').slice(0, 10);
        const end = String(item?.endDate || item?.startDate || '').slice(0, 10);
        const rowDays = start && end ? inclusiveCalendarDays(start, end) : 1;
        const safeDays = Math.max(1, rowDays || 1);
        return acc + (((Number(item.rate) || 0) * (Number(item.pax) || 0)) + (Number(item.rental) || 0)) * safeDays;
    }, 0) || 0;

    let roomsTaxMultiplier = 0;
    let eventTaxMultiplier = 0;
    let transTaxMultiplier = 0;

    (taxesList || []).forEach((tax: any) => {
        const rate = (Number(tax?.rate) || 0) / 100;
        if (tax.scope?.accommodation) roomsTaxMultiplier += rate;
        if (tax.scope?.events) eventTaxMultiplier += rate;
        if (tax.scope?.transport) transTaxMultiplier += rate;
    });

    const roomsCostWithTax = roomsCostNoTax * (1 + roomsTaxMultiplier);
    const transCostWithTax = transCostNoTax * (1 + transTaxMultiplier);
    const eventCostWithTax = eventCostNoTax * (1 + eventTaxMultiplier);

    const totalCostNoTax = roomsCostNoTax + transCostNoTax + eventCostNoTax;
    const totalCostWithTax = roomsCostWithTax + transCostWithTax + eventCostWithTax;
    const adr = totalRoomNights > 0 ? roomsCostNoTax / totalRoomNights : 0;

    const hasPaymentLines = Array.isArray(form.payments) && form.payments.length > 0;
    const paidAmountVal = hasPaymentLines
        ? sumPaymentAmounts(form.payments)
        : form.paidAmount !== undefined
          ? parseFloat(form.paidAmount?.toString().replace(/,/g, '') || '0')
          : 0;

    let paymentStatus = 'Unpaid';
    if (totalCostWithTax > 0) {
        if (paymentsMeetOrExceedTotal(paidAmountVal, totalCostWithTax)) paymentStatus = 'Paid';
        else if (paidAmountVal > 0) paymentStatus = 'Deposit';
    }

    const totalEventPax = (form.agenda || []).reduce((acc: number, item: any) => acc + Number(item.pax), 0) || 0;
    const totalEventAttendeeDays = sumAgendaAttendeeDays(form.agenda || []);
    const totalEventDays = calculateEventAgendaDays(form.agenda || []);
    const ddr = totalEventPax > 0 ? eventCostNoTax / totalEventPax : 0;

    return {
        nights,
        roomsCostNoTax,
        roomsCostWithTax,
        transCostNoTax,
        transCostWithTax,
        eventCostNoTax,
        eventCostWithTax,
        totalRooms: (form.rooms || []).reduce((acc: number, r: any) => acc + Number(r.count || 0), 0),
        totalRoomNights,
        adr,
        ddr,
        totalEventPax,
        totalEventAttendeeDays,
        totalEventDays,
        grandTotalNoTax: totalCostNoTax,
        grandTotalWithTax: totalCostWithTax,
        totalCostWithTax,
        paidAmount: paidAmountVal,
        paymentStatus,
    };
}

/** BEO total (incl. tax): event portion only — no transport on the BEO. */
export function getBeoScopeGrandTotalInclTax(fin: any, _requestTypeRaw?: string | null) {
    return Number(fin?.eventCostWithTax || 0);
}

export function deriveBeoPaymentView(paidRaw: number, scopeTotalInclTax: number) {
    const paid = Number(paidRaw || 0);
    const total = Math.max(0, Number(scopeTotalInclTax || 0));
    const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
    let paymentStatus = 'Unpaid';
    if (total > 0) {
        if (paymentsMeetOrExceedTotal(paid, total)) paymentStatus = 'Paid';
        else if (paid > 0) paymentStatus = 'Deposit';
    } else if (paid > 0) {
        paymentStatus = 'Paid';
    }
    const payLabel = paymentStatus === 'Deposit' ? 'Partial / deposit' : paymentStatus;
    return { remaining, paymentStatus, payLabel };
}

export function printBeoDocument(req: any, fin: any, notes: string, accounts: any[], activeProperty?: any) {
    const w = window.open('', '_blank');
    if (!w) {
        alert('Please allow pop-ups to print or save the BEO as PDF.');
        return;
    }
    const acc = getAccountForRequest(req, accounts);
    const beoType = normalizeRequestTypeKey(req.requestType);
    const ev = getEventDateWindow(req);
    const fallbackDays = ev.start && ev.end ? inclusiveCalendarDays(ev.start, ev.end) : 1;
    const dayDenom = Math.max(1, fin.totalEventDays || fallbackDays);
    const eventCostPerDay = fin.eventCostWithTax / dayDenom;
    const scopeGrand = getBeoScopeGrandTotalInclTax(fin, req.requestType);
    const paid = Number(fin.paidAmount || 0);
    const { remaining, payLabel } = deriveBeoPaymentView(paid, scopeGrand);
    const pkg = formatAgendaPackageSummary(req.agenda || []) || req.mealPlan || '—';

    const contactsRowsHtml = (() => {
        if (!acc) {
            return '<tr><td>1</td><td>Primary Contact</td><td>—</td><td>—</td><td>—</td></tr>';
        }
        const rows: string[] = [];
        const clist = Array.isArray(acc.contacts) ? acc.contacts : [];
        clist.forEach((c: any, i: number) => {
            const name = contactDisplayName(c);
            if (!name && !c?.email && !c?.phone && !c?.position) return;
            rows.push(
                `<tr><td>${i + 1}</td><td>${escapeHtml(name || `Contact ${i + 1}`)}</td><td>${escapeHtml(c?.position || '—')}</td><td>${escapeHtml(c?.phone || '—')}</td><td>${escapeHtml(c?.email || '—')}</td></tr>`
            );
        });
        if (!rows.length) {
            rows.push(
                `<tr><td>1</td><td>Primary Contact</td><td>—</td><td>${escapeHtml(acc?.phone || '—')}</td><td>${escapeHtml(acc?.email || '—')}</td></tr>`
            );
        }
        return rows.join('');
    })();

    const specialRequestsCombined = formatBeoSpecialRequestsCombined(req);

    const packageTimingSummary = (row: any) => {
        const slots = getAgendaTimingSlotsForPackageName(String(row?.package || ''), DEFAULT_EVENT_PACKAGES);
        if (!slots.length) return '';
        const getVal = (field: string) => {
            if (field === 'coffee1') return String(row?.coffee1 ?? row?.coffeeTime ?? '').trim();
            if (field === 'coffee2') return String(row?.coffee2 ?? '').trim();
            if (field === 'lunchTime') return String(row?.lunchTime ?? row?.lunch ?? '').trim();
            if (field === 'dinnerTime') return String(row?.dinnerTime ?? row?.dinner ?? '').trim();
            return '';
        };
        return slots
            .map((slot) => {
                const v = getVal(slot.field);
                return v ? `${slot.label}: ${v}` : '';
            })
            .filter(Boolean)
            .join(' | ');
    };
    const agendaRows = (req.agenda || []).length === 0
        ? '<tr><td colspan="11" class="sub">No agenda rows</td></tr>'
        : (req.agenda || []).map((row: any) => {
            const line = (Number(row.rate || 0) * Number(row.pax || 0)) + Number(row.rental || 0);
            const venueCell = formatAgendaRowVenueDisplay(row) || '—';
            return `<tr><td>${escapeHtml(row.startDate || '—')}</td><td>${escapeHtml(row.endDate || row.startDate || '—')}</td><td>${escapeHtml([row.startTime, row.endTime].filter(Boolean).join(' – ') || '—')}</td><td>${escapeHtml(packageTimingSummary(row) || '—')}</td><td>${escapeHtml(venueCell)}</td><td>${escapeHtml(row.shape || '—')}</td><td>${escapeHtml(row.package || '—')}</td><td style="text-align:center">${escapeHtml(String(row.pax ?? '—'))}</td><td style="text-align:right">${Number(row.rate || 0).toLocaleString()}</td><td style="text-align:right">${Number(row.rental || 0).toLocaleString()}</td><td style="text-align:right">${line.toLocaleString()}</td></tr>`;
        }).join('');

    const remainingBlock = remaining > 0
        ? `<p><strong>Remaining balance:</strong> ${remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</p>`
        : '<p><strong>Remaining balance:</strong> 0 SAR</p>';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>BEO ${escapeHtml(req.confirmationNo)}</title>
<style>
body{font-family:system-ui,Segoe UI,sans-serif;padding:24px;color:#111;font-size:12px;line-height:1.4}
h1{font-size:22px;margin:0 0 8px}
h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#666;margin:20px 0 8px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
th{background:#f0f0f0;font-size:10px;text-transform:uppercase}
td.sub,.sub{color:#666;font-style:italic}
.num{text-align:right}
.paybox{border:1px solid #ddd;border-radius:8px;padding:12px;margin:16px 0;background:#fafafa}
.header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.prop-logo{height:56px;max-width:170px;object-fit:contain}
</style></head><body>
<div class="header">
<div>
<h1>Banquet event order (BEO)</h1>
<p><strong>Property:</strong> ${escapeHtml(activeProperty?.name || req?.propertyName || 'Property')}</p>
</div>
${activeProperty?.logoUrl ? `<img src="${escapeHtml(activeProperty.logoUrl)}" class="prop-logo" />` : ''}
</div>
<p><strong>Confirmation:</strong> ${escapeHtml(req.confirmationNo)} &nbsp;|&nbsp; <strong>System ID:</strong> ${escapeHtml(req.id)}</p>
<p><strong>Account:</strong> ${escapeHtml(req.account || '—')}</p>
<h2>Contacts</h2>
<table><thead><tr><th style="width:48px">#</th><th>Name</th><th>Position</th><th>Phone</th><th>Email</th></tr></thead><tbody>${contactsRowsHtml}</tbody></table>
<h2>Event summary</h2>
<p><strong>Status:</strong> ${escapeHtml(req.status || '—')} &nbsp;|&nbsp; <strong>Request type:</strong> ${escapeHtml(req.requestType || beoType)}</p>
<p><strong>Start:</strong> ${escapeHtml(ev.start || '—')} &nbsp; <strong>End:</strong> ${escapeHtml(ev.end || '—')} &nbsp;|&nbsp; <strong>Package:</strong> ${escapeHtml(pkg)}</p>
<p><strong>Total attendees (pax × days per row):</strong> ${fin.totalEventAttendeeDays ?? fin.totalEventPax} &nbsp;|&nbsp; <strong>Headcount (agenda pax):</strong> ${fin.totalEventPax} &nbsp;|&nbsp; <strong>Event days:</strong> ${fin.totalEventDays || fallbackDays}</p>
<p><strong>DDR (per person, excl. tax basis):</strong> ${fin.ddr.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR &nbsp;|&nbsp; <strong>Event cost per day (incl. tax):</strong> ${eventCostPerDay.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</p>
<h2>Agenda</h2>
<table><thead><tr><th>Start</th><th>End</th><th>Session time</th><th>Package timing</th><th>Venue</th><th>Shape</th><th>Package</th><th>Pax</th><th class="num">Rate</th><th class="num">Rental</th><th class="num">Line</th></tr></thead><tbody>${agendaRows}</tbody></table>
<h2>Pricing</h2>
<p><strong>Event total (incl. tax):</strong> ${scopeGrand.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</p>
<div class="paybox">
<h2>Payment</h2>
<p><strong>Payment status:</strong> ${escapeHtml(payLabel)}</p>
<p><strong>Amount paid:</strong> ${paid.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</p>
${remainingBlock}
</div>
<h2>Special requests (from request)</h2>
<p style="white-space:pre-wrap;border:1px solid #ddd;padding:12px;border-radius:8px;min-height:40px">${escapeHtml(specialRequestsCombined || '—')}</p>
<h2>Operations notes</h2>
<p style="white-space:pre-wrap;border:1px solid #ddd;padding:12px;border-radius:8px;min-height:60px">${escapeHtml(notes || '—')}</p>
<p class="sub" style="margin-top:24px">Generated ${new Date().toLocaleString()}</p>
</body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
        try {
            w.focus();
            w.print();
            w.addEventListener('afterprint', () => {
                try {
                    w.close();
                } catch {
                    /* ignore */
                }
            });
        } catch (e) {
            console.error(e);
        }
    }, 200);
}

/**
 * Request wizards use `bg-primary` / `text-primary` in class names, but `primary` is not defined in
 * tailwind.config — those utilities are stripped, leaving e.g. only `text-black` (invisible on dark cards).
 * Use theme colors here so "Add room / trip / agenda" match and stay readable in all themes.
 */
export function requestSectionAddButtonStyle(colors: { textMain: string; border: string; primary: string }) {
    return {
        color: colors.textMain,
        borderColor: colors.border,
        backgroundColor: `${String(colors.primary)}1a`,
    };
}

export const REQUEST_SECTION_ADD_BTN_CLASS =
    'px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 shrink-0 transition-colors hover:bg-white/5';

export const REQUEST_SECTION_ADD_BTN_LG_CLASS =
    'px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-wider flex items-center gap-2 shrink-0 transition-colors hover:bg-white/5';

export const REQUEST_SECTION_ICON_ADD_BTN_CLASS =
    'p-2 rounded-lg border transition-colors hover:bg-white/5 flex items-center justify-center shrink-0';
