/** Account contracted room rates by date period, room type, occupancy, and request segment(s). */

export type AccountRateRow = {
    id: string;
    roomType: string;
    occupancy: string;
    rate: number;
};

export type AccountRatePeriod = {
    id: string;
    propertyId: string;
    accountId: string;
    startDate: string;
    endDate: string;
    segments: string[];
    rows: AccountRateRow[];
    updatedAt?: string;
};

function normKey(v: unknown): string {
    return String(v ?? '')
        .trim()
        .toLowerCase();
}

function ymd(v: unknown): string {
    return String(v ?? '').trim().slice(0, 10);
}

/** Inclusive stay/period windows overlap (same rule as promotions). */
export function overlapsRateWindow(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return !!aStart && !!aEnd && !!bStart && !!bEnd && !(aEnd < bStart || bEnd < aStart);
}

function periodSpanDays(start: string, end: string): number {
    const s = Date.parse(start + 'T00:00:00Z');
    const e = Date.parse(end + 'T00:00:00Z');
    if (!Number.isFinite(s) || !Number.isFinite(e)) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.round((e - s) / 86400000));
}

export function normalizeAccountRateRows(input: unknown): AccountRateRow[] {
    if (!Array.isArray(input)) return [];
    return input
        .map((r: any, i: number) => ({
            id: String(r?.id || `row-${i}`),
            roomType: String(r?.roomType || '').trim(),
            occupancy: String(r?.occupancy || '').trim(),
            rate: Math.max(0, Number(r?.rate) || 0),
        }))
        .filter((r) => r.roomType && r.occupancy);
}

export function normalizeAccountRatePeriod(raw: any): AccountRatePeriod | null {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const accountId = String(raw.accountId || '').trim();
    const propertyId = String(raw.propertyId || '').trim();
    if (!id || !accountId) return null;
    const segments = Array.isArray(raw.segments)
        ? [...new Set(raw.segments.map((s: unknown) => String(s ?? '').trim()).filter(Boolean))]
        : [];
    return {
        id,
        propertyId,
        accountId,
        startDate: ymd(raw.startDate),
        endDate: ymd(raw.endDate),
        segments,
        rows: normalizeAccountRateRows(raw.rows),
        updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
    };
}

/**
 * Resolve a catalog rate for a new-request draft room.
 * Returns null when segment/dates/room/occupancy do not match (caller leaves rate 0).
 * Multi-match: narrowest period (shortest end−start), then latest updatedAt, then id.
 */
export function lookupAccountRoomRate(args: {
    periods: AccountRatePeriod[] | unknown[];
    accountId: string;
    segment: string;
    stayStart: string;
    stayEnd: string;
    roomType: string;
    occupancy: string;
}): number | null {
    const accountId = String(args.accountId || '').trim();
    const segmentKey = normKey(args.segment);
    const roomKey = normKey(args.roomType);
    const occKey = normKey(args.occupancy);
    const stayStart = ymd(args.stayStart);
    const stayEnd = ymd(args.stayEnd || args.stayStart);
    if (!accountId || !segmentKey || !roomKey || !occKey || !stayStart || !stayEnd) return null;

    type Cand = { rate: number; span: number; updatedAt: string; id: string };
    const candidates: Cand[] = [];

    for (const raw of args.periods || []) {
        const p = normalizeAccountRatePeriod(raw);
        if (!p) continue;
        if (String(p.accountId) !== accountId) continue;
        if (!p.segments.length) continue;
        if (!p.segments.some((s) => normKey(s) === segmentKey)) continue;
        const pStart = ymd(p.startDate);
        const pEnd = ymd(p.endDate);
        if (!overlapsRateWindow(stayStart, stayEnd, pStart, pEnd)) continue;
        const row = p.rows.find((r) => normKey(r.roomType) === roomKey && normKey(r.occupancy) === occKey);
        if (!row) continue;
        candidates.push({
            rate: Math.max(0, Number(row.rate) || 0),
            span: periodSpanDays(pStart, pEnd),
            updatedAt: String(p.updatedAt || ''),
            id: p.id,
        });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => {
        if (a.span !== b.span) return a.span - b.span;
        const u = b.updatedAt.localeCompare(a.updatedAt);
        if (u !== 0) return u;
        return b.id.localeCompare(a.id);
    });
    return candidates[0].rate;
}
