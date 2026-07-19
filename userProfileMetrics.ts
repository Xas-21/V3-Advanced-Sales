import { flattenCrmLeads } from './accountProfileData';
import { calculateNights, inclusiveCalendarDays, normalizeRequestTypeKey } from './beoShared';
import {
    eachInclusiveAgendaDayYmd,
    eachOccupiedNightYmd,
    parseYmdAgenda,
    requestTouchesOperationalDateRange,
    sumRequestProratedRevenueExTaxInRange,
} from './operationalSegmentRevenue';

export const PROFILE_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function parseYmd(raw: any): string {
    if (!raw) return '';
    const s = String(raw).trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Date used to bucket profile/dashboard revenue by calendar month.
 * Uses a clear priority — **not** “earliest of all fields”, so e.g. `createdAt` in March cannot
 * override June `checkIn` / event dates (that mismatch looked like “fake” revenue in the wrong month).
 */
export function getPrimaryOperationalDate(req: any): string {
    const checkIn = parseYmd(req?.checkIn);
    const eventStart = parseYmd(req?.eventStart);
    const agendaStart = (() => {
        const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
        const starts = agenda
            .map((row: any) => parseYmd(row?.startDate || row?.endDate))
            .filter(Boolean) as string[];
        if (!starts.length) return '';
        return starts.sort()[0];
    })();
    /** Stay / event anchors first (same idea as Events & Catering calendar). */
    const stayOrEvent = [checkIn, eventStart].filter(Boolean).sort() as string[];
    if (stayOrEvent.length) return stayOrEvent[0];
    if (agendaStart) return agendaStart;

    const firstRoomArrival = (() => {
        const rooms = Array.isArray(req?.rooms) ? req.rooms : [];
        const dates: string[] = [];
        for (const row of rooms) {
            const a = parseYmd(row?.arrival || row?.checkIn);
            if (a) dates.push(a);
        }
        if (!dates.length) return '';
        return dates.sort()[0];
    })();
    if (firstRoomArrival) return firstRoomArrival;

    const requestDate = parseYmd(req?.requestDate);
    if (requestDate) return requestDate;
    const receivedDate = parseYmd(req?.receivedDate);
    if (receivedDate) return receivedDate;
    return parseYmd(String(req?.createdAt || '').split('T')[0] || req?.createdAt) || '';
}

const asNumber = (v: any) => parseFloat(String(v ?? 0).replace(/,/g, '')) || 0;

const normStatus = (s: any) => String(s || '').trim().toLowerCase();

/**
 * Pre-tax total: same rules as `calculateAccFinancialsForRequest` (rooms + transport + event rows × inclusive days).
 */
export function computeProfileRequestPreTax(req: any): number {
    const st = normStatus(req?.status);
    if (st === 'cancelled' || st === 'lost') return 0;
    const rooms = Array.isArray(req?.rooms) ? req.rooms : [];
    const agenda = Array.isArray(req?.agenda) ? req.agenda : [];
    const transport = Array.isArray(req?.transportation) ? req.transportation : [];
    const inD = parseYmd(req?.checkIn);
    const outD = parseYmd(req?.checkOut);
    const globalNights = inD && outD ? calculateNights(inD, outD) : 0;
    const rt = normalizeRequestTypeKey(req?.requestType || '');
    const usePerRoomStayNights = rt === 'event_rooms' || rt === 'series';

    const perRoomNights = (row: any): number => {
        if (!usePerRoomStayNights) return globalNights;
        const a = parseYmd(row?.arrival || req?.checkIn);
        const b = parseYmd(row?.departure || req?.checkOut);
        if (a && b) return calculateNights(a, b);
        const manual = Number(row?.nights);
        if (a && Number.isFinite(manual) && manual > 0) return manual;
        return globalNights;
    };

    let roomsRevenue = 0;
    for (const row of rooms) {
        const count = Number(row?.count || 0);
        const rate = Number(row?.rate || 0);
        const n = perRoomNights(row);
        roomsRevenue += count * rate * n;
    }

    const eventRevenue = agenda.reduce((s: number, item: any) => {
        const start = parseYmd(item?.startDate);
        const end = parseYmd(item?.endDate || item?.startDate);
        const rowDays = start && end ? inclusiveCalendarDays(start, end) : 1;
        const safeDays = Math.max(1, rowDays || 1);
        const line = (Number(item?.rate || 0) * Number(item?.pax || 0) + Number(item?.rental || 0)) * safeDays;
        return s + line;
    }, 0);

    const transportRevenue = transport.reduce((s: number, t: any) => s + Number(t?.costPerWay || 0), 0);
    let lineSum = roomsRevenue + eventRevenue + transportRevenue;
    const storedNoTax = asNumber(req?.grandTotalNoTax ?? req?.totalCostNoTax);
    if (lineSum <= 0 && storedNoTax > 0) lineSum = storedNoTax;
    return lineSum;
}

/** Activity / log `user` may be a string or a nested object from APIs. */
export function normalizeActivityUser(raw: any): string {
    if (raw == null) return '';
    if (typeof raw === 'object') {
        return String((raw as any).name || (raw as any).username || (raw as any).userName || (raw as any).email || '')
            .trim();
    }
    return String(raw).trim();
}

export function logUserMatchesLog(logUser: string | undefined, user: any): boolean {
    const lu = String(logUser || '').trim().toLowerCase();
    if (!lu) return false;
    const parts = [user?.name, user?.username, user?.email]
        .filter(Boolean)
        .map((x: string) => String(x).trim().toLowerCase());
    return parts.some((c) => {
        if (!c) return false;
        if (lu === c) return true;
        const first = c.split(/\s+/)[0] || '';
        return (first && lu.includes(first)) || c.includes(lu);
    });
}

/** Prefer real user id; fall back to username/email so new logins still attribute correctly. */
export function resolveUserAttributionId(user: any): string {
    if (!user) return '';
    const id = user.id;
    if (id != null && String(id).trim() !== '') return String(id).trim();
    const u = String(user.username || '').trim();
    if (u) return u;
    const e = String(user.email || '').trim();
    if (e) return e;
    return '';
}

function userHasProfileIdentity(user: any): boolean {
    return !!(resolveUserAttributionId(user) || String(user?.name || '').trim());
}

/** True if stored creator id matches the user's id, username, or email (string-safe). */
export function createdByMatchesUser(createdByRaw: any, user: any): boolean {
    if (createdByRaw == null || createdByRaw === '') return false;
    const c = String(createdByRaw).trim();
    if (!c) return false;
    const attrId = resolveUserAttributionId(user);
    if (attrId && c === attrId) return true;
    if (attrId && !Number.isNaN(Number(c)) && !Number.isNaN(Number(attrId)) && Number(c) === Number(attrId)) return true;
    const unm = String(user?.name || '').trim().toLowerCase();
    const unu = String(user?.username || '').trim().toLowerCase();
    const uem = String(user?.email || '').trim().toLowerCase();
    const cl = c.toLowerCase();
    if (unu && cl === unu) return true;
    if (uem && cl === uem) return true;
    if (unm && cl === unm) return true;
    return false;
}

export function requestAttributedToUser(req: any, user: any): boolean {
    if (!user || !userHasProfileIdentity(user)) return false;
    if (createdByMatchesUser(req?.createdByUserId, user)) return true;
    const logs = Array.isArray(req?.logs) ? req.logs : [];
    const created = logs.find((l: any) => String(l?.action || '').toLowerCase().includes('request created'));
    if (created && logUserMatchesLog(created.user, user)) return true;
    return false;
}

/** Match legacy / API-only username fields on account rows (e.g. seed or backend payloads). */
function accountUsernameFieldsMatch(acc: any, user: any): boolean {
    for (const key of ['createdByUsername', 'ownerUsername'] as const) {
        const v = String(acc?.[key] ?? '').trim();
        if (!v) continue;
        const vl = v.toLowerCase();
        const unm = String(user?.username || '').trim().toLowerCase();
        const uname = String(user?.name || '').trim().toLowerCase();
        const uem = String(user?.email || '').trim().toLowerCase();
        if (unm && vl === unm) return true;
        if (uem && vl === uem) return true;
        if (uname && vl === uname) return true;
        const first = uname.split(/\s+/)[0] || '';
        if (first && (vl.includes(first) || uname.includes(vl))) return true;
    }
    return false;
}

export function accountAttributedToUser(acc: any, user: any): boolean {
    if (!user || !userHasProfileIdentity(user)) return false;
    if (createdByMatchesUser(acc?.createdByUserId, user)) return true;
    if (createdByMatchesUser(acc?.ownerUserId, user)) return true;
    if (accountUsernameFieldsMatch(acc, user)) return true;

    const acts = Array.isArray(acc?.activities) ? acc.activities : [];
    for (const a of acts) {
        const t = String(a?.title || a?.action || '').toLowerCase();
        if (
            (t.includes('account') && t.includes('creat')) ||
            t.includes('new account') ||
            t.includes('account created')
        ) {
            const who = normalizeActivityUser(a.user);
            if (logUserMatchesLog(who, user)) return true;
        }
    }
    return false;
}

export function crmLeadAttributedToUser(lead: any, user: any): boolean {
    if (!user || !userHasProfileIdentity(user)) return false;
    if (createdByMatchesUser(lead?.createdByUserId, user)) return true;
    if (createdByMatchesUser(lead?.ownerUserId, user)) return true;
    const am = String(lead?.accountManager || '').trim().toLowerCase();
    const unm = String(user?.name || '').trim().toLowerCase();
    const unu = String(user?.username || '').trim().toLowerCase();
    const uem = String(user?.email || '').trim().toLowerCase();
    if (am && unm && (am === unm || unm.startsWith(am) || am.startsWith(unm.split(/\s+/)[0] || ''))) return true;
    if (am && unu && am === unu) return true;
    if (am && uem && am === uem) return true;
    return false;
}

/** Display name for who created / owns a sales call (Activities "Assign to" column). */
export function resolveCrmCallCreatorName(
    call: any,
    userDirectory?: { id: string; name: string }[]
): string {
    const cid = String(call?.createdByUserId || call?.ownerUserId || '').trim();
    if (cid && Array.isArray(userDirectory)) {
        const hit = userDirectory.find((u) => String(u.id) === cid);
        if (hit?.name) return hit.name;
    }
    const manager = String(call?.accountManager || '').trim();
    if (manager) return manager;
    return '—';
}

/** Include on a property-scoped profile when row has no property, global marker, or same id. */
export function recordVisibleOnProperty(propertyId: string | undefined, recordPropertyId: any): boolean {
    if (!propertyId) return true;
    const rp = String(recordPropertyId ?? '').trim();
    if (!rp || rp === 'P-GLOBAL') return true;
    return rp === String(propertyId);
}

export function requestInProperty(req: any, propertyId: string | undefined): boolean {
    return recordVisibleOnProperty(propertyId, req?.propertyId);
}

function taskAssigneeEntries(task: any): { id: string; name: string }[] {
    if (Array.isArray(task?.assignees) && task.assignees.length) {
        return task.assignees
            .map((x: any) => ({
                id: String(x?.id ?? x?.userId ?? '').trim(),
                name: String(x?.name ?? '').trim(),
            }))
            .filter((x) => x.name);
    }
    const raw = String(task?.assignedTo || '').trim();
    if (!raw) return [];
    return raw
        .split(/\s*,\s*/)
        .map((name) => ({ id: '', name: name.trim() }))
        .filter((x) => x.name);
}

export function taskAssignedToUser(task: any, user: any): boolean {
    if (!user) return false;
    const uid = resolveUserAttributionId(user);
    const n = String(user?.name || '').trim().toLowerCase();
    const u = String(user?.username || '').trim().toLowerCase();
    const em = String(user?.email || '').trim().toLowerCase();
    const legacyId = String(task?.assignedToUserId ?? '').trim();
    if (uid && legacyId && String(legacyId) === String(uid)) return true;
    for (const a of taskAssigneeEntries(task)) {
        if (uid && a.id && String(a.id) === String(uid)) return true;
        const an = a.name.toLowerCase();
        if (n && an && (an === n || n.includes(an) || an.includes(n.split(/\s+/)[0] || ''))) return true;
        if (u && an && (an === u || an.includes(u) || u.includes(an))) return true;
        if (em && an === em) return true;
    }
    return false;
}

const OPEN_PIPELINE = new Set(['inquiry', 'draft', 'accepted', 'tentative']);

export function monthlySalesCallTarget(user: any, year: number): number {
    const yt = user?.stats?.yearlyTargets || {};
    const raw = Number(yt[String(year)] ?? yt[year] ?? 0);
    if (!raw) return 0;
    return Math.max(1, Math.round(raw / 12));
}

export function filterUserRequests(requests: any[], propertyId: string | undefined, user: any) {
    return (requests || []).filter((r) => requestInProperty(r, propertyId) && requestAttributedToUser(r, user));
}

export function filterUserAccounts(accounts: any[], user: any) {
    return (accounts || []).filter((a) => accountAttributedToUser(a, user));
}

export function filterUserCrmLeads(crmLeads: Record<string, any[]>, propertyId: string | undefined, user: any) {
    const flat = flattenCrmLeads(crmLeads || {});
    return flat.filter((lead) => {
        if (!recordVisibleOnProperty(propertyId, lead.propertyId)) return false;
        return crmLeadAttributedToUser(lead, user);
    });
}

export function countCallsInMonth(leads: any[], ymPrefix: string): number {
    return leads.filter((l) => {
        const d = parseYmd(l?.lastContact || l?.date);
        return d.startsWith(ymPrefix);
    }).length;
}

export function countCallsInYear(leads: any[], year: number): number {
    const p = `${year}-`;
    return leads.filter((l) => {
        const d = parseYmd(l?.lastContact || l?.date);
        return d.startsWith(p);
    }).length;
}

export function buildMonthlyHistory(
    requests: any[],
    userLeads: any[],
    propertyId: string | undefined,
    user: any,
    anchor: Date,
    monthsBack: number
): { month: string; revenue: number; calls: number }[] {
    const out: { month: string; revenue: number; calls: number }[] = [];
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(y, m - i, 1);
        const label = PROFILE_MONTH_LABELS[d.getMonth()];
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const { start: ms, end: me } = ymdBoundsForCalendarMonth(d.getFullYear(), d.getMonth());
        let revenue = 0;
        for (const req of requests) {
            if (!requestInProperty(req, propertyId)) continue;
            if (!requestAttributedToUser(req, user)) continue;
            if (normStatus(req?.status) === 'cancelled' || normStatus(req?.status) === 'lost') continue;
            revenue += sumRequestProratedRevenueExTaxInRange(req, ms, me);
        }
        const calls = countCallsInMonth(userLeads, ym);
        out.push({ month: label, revenue, calls });
    }
    return out;
}

/** Requests already filtered by property + user attribution — status/date only (Plan 011). */
export function sumRevenueInYmdRangeAttributed(requests: any[], start: string, end: string): number {
    let sum = 0;
    for (const req of requests || []) {
        if (normStatus(req?.status) === 'cancelled' || normStatus(req?.status) === 'lost') continue;
        sum += sumRequestProratedRevenueExTaxInRange(req, start, end);
    }
    return sum;
}

export function countRequestsInYmdRangeAttributed(requests: any[], start: string, end: string): number {
    let n = 0;
    for (const req of requests || []) {
        if (normStatus(req?.status) === 'cancelled' || normStatus(req?.status) === 'lost') continue;
        if (!requestTouchesOperationalDateRange(req, start, end)) continue;
        n += 1;
    }
    return n;
}

export function countOpenPipelineAttributed(requests: any[]): number {
    let n = 0;
    for (const req of requests || []) {
        if (OPEN_PIPELINE.has(normStatus(req?.status))) n += 1;
    }
    return n;
}

/** Open-pipeline requests whose operational window touches [start, end] (YYYY-MM-DD). */
export function countOpenPipelineInYmdRangeAttributed(requests: any[], start: string, end: string): number {
    let n = 0;
    for (const req of requests || []) {
        if (!OPEN_PIPELINE.has(normStatus(req?.status))) continue;
        if (!requestTouchesOperationalDateRange(req, start, end)) continue;
        n += 1;
    }
    return n;
}

function filterAttributedRequests(requests: any[], propertyId: string | undefined, user: any): any[] {
    return (requests || []).filter(
        (req) => requestInProperty(req, propertyId) && requestAttributedToUser(req, user)
    );
}

export function sumRevenueInYmdRange(requests: any[], propertyId: string | undefined, user: any, start: string, end: string): number {
    return sumRevenueInYmdRangeAttributed(filterAttributedRequests(requests, propertyId, user), start, end);
}

export function countRequestsInYmdRange(requests: any[], propertyId: string | undefined, user: any, start: string, end: string): number {
    return countRequestsInYmdRangeAttributed(filterAttributedRequests(requests, propertyId, user), start, end);
}

export function countOpenPipeline(requests: any[], propertyId: string | undefined, user: any): number {
    return countOpenPipelineAttributed(filterAttributedRequests(requests, propertyId, user));
}

/** Open-pipeline requests whose primary operational date falls in [start, end] (YYYY-MM-DD). */
export function countOpenPipelineInYmdRange(
    requests: any[],
    propertyId: string | undefined,
    user: any,
    start: string,
    end: string
): number {
    return countOpenPipelineInYmdRangeAttributed(filterAttributedRequests(requests, propertyId, user), start, end);
}

export function ymdBoundsForCalendarMonth(year: number, monthIndex0: number): { start: string; end: string } {
    const start = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-01`;
    const last = new Date(year, monthIndex0 + 1, 0);
    const end = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
    return { start, end };
}

export function ymdBoundsForCalendarYear(year: number): { start: string; end: string } {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export type ProfileActivityRow = { id: string; title: string; desc: string; date: string; atMs: number; kind: string };

/** Newest rows on the profile strip (light DOM). */
export const PROFILE_ACTIVITY_PREVIEW_CAP = 30;
/** Newest rows loaded only when “View all” opens. */
export const PROFILE_ACTIVITY_MODAL_CAP = 90;
/** Default / modal-sized cap (Plan 011+). */
export const PROFILE_ACTIVITY_LOG_CAP = PROFILE_ACTIVITY_MODAL_CAP;

function activityRowMatchesQuery(title: string, desc: string, query: string | undefined): boolean {
    if (!query) return true;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return title.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
}

export function buildProfileActivityLog(
    requests: any[],
    accounts: any[],
    tasks: any[],
    user: any,
    propertyId: string | undefined,
    maxAgeMs: number,
    maxRows: number = PROFILE_ACTIVITY_LOG_CAP,
    query?: string,
    dayPrefix?: string
): ProfileActivityRow[] {
    const now = Date.now();
    const minAt = now - maxAgeMs;
    const rows: ProfileActivityRow[] = [];
    const day = String(dayPrefix || '').trim();

    for (const req of requests) {
        if (!requestInProperty(req, propertyId)) continue;
        const logs = Array.isArray(req?.logs) ? req.logs : [];
        for (const log of logs) {
            if (!logUserMatchesLog(normalizeActivityUser(log.user), user)) continue;
            const at = Date.parse(log.date || '') || 0;
            if (at < minAt) continue;
            const date = String(log.date || '').replace('T', ' ').slice(0, 16);
            if (day && !date.startsWith(day)) continue;
            const title = String(log.action || 'Request activity');
            const desc = `${req.requestName || req.confirmationNo || req.id}${log.details ? ` — ${String(log.details).slice(0, 120)}` : ''}`;
            if (!activityRowMatchesQuery(title, desc, query)) continue;
            rows.push({
                id: `req-${req.id}-${at}-${log.action}`,
                title,
                desc,
                date,
                atMs: at,
                kind: 'request',
            });
        }
    }

    for (const acc of accounts) {
        const acts = Array.isArray(acc?.activities) ? acc.activities : [];
        for (const act of acts) {
            if (!logUserMatchesLog(normalizeActivityUser(act.user), user)) continue;
            const at = Date.parse(act.at || '') || 0;
            if (at < minAt) continue;
            const date = String(act.at || '').replace('T', ' ').slice(0, 16);
            if (day && !date.startsWith(day)) continue;
            const title = String(act.title || 'Account activity');
            const desc = `${acc.name || acc.id}${act.body ? ` — ${String(act.body).slice(0, 120)}` : ''}`;
            if (!activityRowMatchesQuery(title, desc, query)) continue;
            rows.push({
                id: `acc-${acc.id}-${at}-${act.title}`,
                title,
                desc,
                date,
                atMs: at,
                kind: 'account',
            });
        }
    }

    for (const task of tasks || []) {
        if (!taskAssignedToUser(task, user)) continue;
        const at = Date.parse(`${task.date || ''}T12:00:00`) || 0;
        if (at < minAt) continue;
        const date = String(task.date || '').replace('T', ' ').slice(0, 16);
        if (day && !date.startsWith(day)) continue;
        const title = task.completed ? 'Task completed' : 'Task';
        const desc = String(task.task || task.title || '');
        if (!activityRowMatchesQuery(title, desc, query)) continue;
        rows.push({
            id: `task-${task.id}-${at}`,
            title,
            desc,
            date,
            atMs: at,
            kind: 'task',
        });
    }

    rows.sort((a, b) => b.atMs - a.atMs);
    // ponytail: walk sources then slice — correct newest-N; upgrade = early-stop heap if lists get huge
    return rows.slice(0, Math.max(1, maxRows));
}

/** Inclusive month range; labels like "Jan 2025". */
export function monthRangeRevenueSeries(
    requests: any[],
    propertyId: string | undefined,
    user: any,
    fromMonthLabel: string,
    fromYear: string,
    toMonthLabel: string,
    toYear: string
): { month: string; revenue: number }[] {
    const mi = (s: string) => PROFILE_MONTH_LABELS.indexOf(s as (typeof PROFILE_MONTH_LABELS)[number]);
    let y0 = parseInt(fromYear, 10);
    let m0 = mi(fromMonthLabel);
    let y1 = parseInt(toYear, 10);
    let m1 = mi(toMonthLabel);
    if (!Number.isFinite(y0)) y0 = new Date().getFullYear();
    if (!Number.isFinite(y1)) y1 = y0;
    if (m0 < 0) m0 = 0;
    if (m1 < 0) m1 = 11;
    const out: { month: string; revenue: number }[] = [];
    let cy = y0;
    let cm = m0;
    let guard = 0;
    while (guard++ < 120) {
        const label = `${PROFILE_MONTH_LABELS[cm]} ${cy}`;
        const { start: ms, end: me } = ymdBoundsForCalendarMonth(cy, cm);
        let rev = 0;
        for (const req of requests) {
            if (!requestInProperty(req, propertyId)) continue;
            if (!requestAttributedToUser(req, user)) continue;
            if (normStatus(req?.status) === 'cancelled' || normStatus(req?.status) === 'lost') continue;
            rev += sumRequestProratedRevenueExTaxInRange(req, ms, me);
        }
        out.push({ month: label, revenue: rev });
        if (cy === y1 && cm === m1) break;
        cm += 1;
        if (cm > 11) {
            cm = 0;
            cy += 1;
        }
    }
    return out;
}

/** Min/max operational dates among requests attributed to the user (for “full history” chart range). */
export function userAttributedOperationalDateBounds(
    requests: any[],
    propertyId: string | undefined,
    user: any
): { min: string; max: string } | null {
    const dates: string[] = [];
    for (const req of requests || []) {
        if (!requestInProperty(req, propertyId)) continue;
        if (!requestAttributedToUser(req, user)) continue;
        const rooms = Array.isArray(req?.rooms) ? req.rooms : [];
        for (const row of rooms) {
            const a = parseYmdAgenda(row?.arrival || req?.checkIn);
            const b = parseYmdAgenda(row?.departure || req?.checkOut);
            if (a && b) dates.push(...eachOccupiedNightYmd(a, b));
        }
        if (!rooms.length) {
            const a = parseYmdAgenda(req?.checkIn);
            const b = parseYmdAgenda(req?.checkOut);
            if (a && b) dates.push(...eachOccupiedNightYmd(a, b));
        }
        for (const item of Array.isArray(req?.agenda) ? req.agenda : []) {
            const sd = parseYmdAgenda(item?.startDate);
            const ed = parseYmdAgenda(item?.endDate || item?.startDate);
            if (sd) dates.push(...eachInclusiveAgendaDayYmd(sd, ed || sd));
        }
        const pd = getPrimaryOperationalDate(req);
        if (pd) dates.push(pd);
    }
    const sorted = [...new Set(dates)].filter(Boolean).sort();
    if (!sorted.length) return null;
    return { min: sorted[0], max: sorted[sorted.length - 1] };
}

/** Same month iteration as `monthRangeRevenueSeries`, but counts requests per month. */
export function monthRangeRequestSeries(
    requests: any[],
    propertyId: string | undefined,
    user: any,
    fromMonthLabel: string,
    fromYear: string,
    toMonthLabel: string,
    toYear: string
): { month: string; requests: number }[] {
    const mi = (s: string) => PROFILE_MONTH_LABELS.indexOf(s as (typeof PROFILE_MONTH_LABELS)[number]);
    let y0 = parseInt(fromYear, 10);
    let m0 = mi(fromMonthLabel);
    let y1 = parseInt(toYear, 10);
    let m1 = mi(toMonthLabel);
    if (!Number.isFinite(y0)) y0 = new Date().getFullYear();
    if (!Number.isFinite(y1)) y1 = y0;
    if (m0 < 0) m0 = 0;
    if (m1 < 0) m1 = 11;
    const out: { month: string; requests: number }[] = [];
    let cy = y0;
    let cm = m0;
    let guard = 0;
    while (guard++ < 120) {
        const label = `${PROFILE_MONTH_LABELS[cm]} ${cy}`;
        const { start: ms, end: me } = ymdBoundsForCalendarMonth(cy, cm);
        let n = 0;
        for (const req of requests || []) {
            if (!requestInProperty(req, propertyId)) continue;
            if (!requestAttributedToUser(req, user)) continue;
            if (normStatus(req?.status) === 'cancelled' || normStatus(req?.status) === 'lost') continue;
            if (!requestTouchesOperationalDateRange(req, ms, me)) continue;
            n += 1;
        }
        out.push({ month: label, requests: n });
        if (cy === y1 && cm === m1) break;
        cm += 1;
        if (cm > 11) {
            cm = 0;
            cy += 1;
        }
    }
    return out;
}

function parseCreatedYmd(req: any): string {
    return parseYmd(String(req?.createdAt || '').split('T')[0] || req?.createdAt);
}

/** Recent requests attributed to this user, sorted by `createdAt` desc, optional created-date range. */
export function getProfileRecentRequests(
    requests: any[],
    propertyId: string | undefined,
    user: any,
    createdFrom: string,
    createdTo: string,
    limit: number
): any[] {
    const rows = (requests || []).filter(
        (r) => requestInProperty(r, propertyId) && requestAttributedToUser(r, user)
    );
    const withDates = rows
        .map((req) => ({ req, cd: parseCreatedYmd(req) }))
        .filter((x) => x.cd);
    let filtered = withDates;
    if (createdFrom) filtered = filtered.filter((x) => x.cd >= createdFrom);
    if (createdTo) filtered = filtered.filter((x) => x.cd <= createdTo);
    filtered.sort((a, b) => (a.cd < b.cd ? 1 : a.cd > b.cd ? -1 : 0));
    return filtered.slice(0, Math.max(1, limit)).map((x) => x.req);
}

/** Count leads with any dated last-contact / activity (all-time rollup for profile KPI). */
export function countCallsAllTime(leads: any[]): number {
    let n = 0;
    for (const l of leads || []) {
        const d = parseYmd(l?.lastContact || l?.date);
        if (d) n += 1;
    }
    return n;
}
