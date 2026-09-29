/** Property rate plans: periods of room-type + meal-plan prices, one amount per occupancy. */

export type RatePlanLine = {
    id: string;
    roomType: string;
    mealPlan: string;
    /** Occupancy name → price. Null or a missing key means no price. 0 is a real price. */
    rates: Record<string, number | null>;
};

export type RatePlanPeriod = {
    id: string;
    startDate: string;
    endDate: string;
    lines: RatePlanLine[];
    updatedAt?: string;
};

export type RatePlan = {
    id: string;
    propertyId: string;
    code: string;
    name: string;
    periods: RatePlanPeriod[];
};

export type RateTouchRoom = {
    id: string;
    type: string;
    occupancy: string;
    mealPlan: string;
};

export type RateTouchSnap = {
    planId: string;
    stayStart: string;
    stayEnd: string;
    rooms: RateTouchRoom[];
};

function normKey(v: unknown): string {
    return String(v ?? '')
        .trim()
        .toLowerCase();
}

function ymd(v: unknown): string {
    return String(v ?? '').trim().slice(0, 10);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return !!aStart && !!aEnd && !!bStart && !!bEnd && !(aEnd < bStart || bEnd < aStart);
}

function spanDays(start: string, end: string): number {
    const s = Date.parse(ymd(start) + 'T00:00:00Z');
    const e = Date.parse(ymd(end) + 'T00:00:00Z');
    if (!Number.isFinite(s) || !Number.isFinite(e)) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.round((e - s) / 86400000));
}

function priceValue(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n;
}

export function normalizeRatePlanLine(raw: unknown, index = 0): RatePlanLine | null {
    const row = (raw && typeof raw === 'object' ? raw : {}) as {
        id?: unknown;
        roomType?: unknown;
        mealPlan?: unknown;
        rates?: unknown;
    };
    const roomType = String(row.roomType || '').trim();
    const mealPlan = String(row.mealPlan || '').trim();
    if (!roomType || !mealPlan) return null;
    const rates: Record<string, number | null> = {};
    const src = row.rates && typeof row.rates === 'object' ? (row.rates as Record<string, unknown>) : {};
    for (const [key, value] of Object.entries(src)) {
        const name = String(key || '').trim();
        if (!name) continue;
        rates[name] = priceValue(value);
    }
    return {
        id: String(row.id || `line-${index}`),
        roomType,
        mealPlan,
        rates,
    };
}

/** Last line wins when room type and meal plan match. Drops lines missing either. */
export function mergeRatePlanLines(input: unknown): RatePlanLine[] {
    const list = Array.isArray(input) ? input : [];
    const map = new Map<string, RatePlanLine>();
    list.forEach((raw, i) => {
        const line = normalizeRatePlanLine(raw, i);
        if (!line) return;
        map.set(`${normKey(line.roomType)}|${normKey(line.mealPlan)}`, line);
    });
    return [...map.values()];
}

export function normalizeRatePlan(raw: unknown): RatePlan | null {
    if (!raw || typeof raw !== 'object') return null;
    const doc = raw as {
        id?: unknown;
        propertyId?: unknown;
        code?: unknown;
        name?: unknown;
        periods?: unknown;
    };
    const id = String(doc.id || '').trim();
    if (!id) return null;
    const periods: RatePlanPeriod[] = [];
    (Array.isArray(doc.periods) ? doc.periods : []).forEach((rawPeriod, i) => {
        const p = (rawPeriod && typeof rawPeriod === 'object' ? rawPeriod : {}) as {
            id?: unknown;
            startDate?: unknown;
            endDate?: unknown;
            lines?: unknown;
            updatedAt?: unknown;
        };
        const startDate = ymd(p.startDate);
        const endDate = ymd(p.endDate);
        if (!startDate || !endDate) return;
        const period: RatePlanPeriod = {
            id: String(p.id || `period-${i}`),
            startDate,
            endDate,
            lines: mergeRatePlanLines(p.lines),
        };
        if (p.updatedAt) period.updatedAt = String(p.updatedAt);
        periods.push(period);
    });
    return {
        id,
        propertyId: String(doc.propertyId || '').trim(),
        code: String(doc.code || '').trim(),
        name: String(doc.name || '').trim(),
        periods,
    };
}

function sortPeriods(periods: RatePlanPeriod[]): RatePlanPeriod[] {
    return [...periods].sort((a, b) => {
        const span = spanDays(a.startDate, a.endDate) - spanDays(b.startDate, b.endDate);
        if (span !== 0) return span;
        const u = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        if (u !== 0) return u;
        return String(b.id).localeCompare(String(a.id));
    });
}

function linePrice(line: RatePlanLine, occupancy: string): number | null {
    const want = normKey(occupancy);
    if (!want) return null;
    const key = Object.keys(line.rates).find((k) => normKey(k) === want);
    if (!key) return null;
    const n = priceValue(line.rates[key]);
    return n == null ? null : n;
}

/**
 * Price for one room on one plan. Null means the plan has no price (caller keeps the typed rate).
 * Overlapping periods: shorter window, then latest updatedAt, then id.
 */
export function lookupRatePlanPrice(args: {
    plan: RatePlan | null | undefined;
    stayStart: string;
    stayEnd: string;
    roomType: string;
    occupancy: string;
    mealPlan: string;
}): number | null {
    const plan = args.plan ? normalizeRatePlan(args.plan) : null;
    const stayStart = ymd(args.stayStart);
    const stayEnd = ymd(args.stayEnd || args.stayStart);
    const roomKey = normKey(args.roomType);
    const mealKey = normKey(args.mealPlan);
    if (!plan || !stayStart || !stayEnd || !roomKey || !mealKey || !normKey(args.occupancy)) return null;
    const hits = plan.periods.filter((p) => overlaps(stayStart, stayEnd, p.startDate, p.endDate));
    const period = sortPeriods(hits)[0];
    if (!period) return null;
    const line = period.lines.find((l) => normKey(l.roomType) === roomKey && normKey(l.mealPlan) === mealKey);
    if (!line) return null;
    return linePrice(line, args.occupancy);
}

/** Which rooms to refill after a user change. Plan or dates: every room. Otherwise only changed rows. */
export function ratePlanTouch(prev: RateTouchSnap, next: RateTouchSnap): { all: boolean; ids: string[] } {
    if (prev.planId !== next.planId || prev.stayStart !== next.stayStart || prev.stayEnd !== next.stayEnd) {
        return { all: true, ids: next.rooms.map((r) => String(r.id)) };
    }
    const before = new Map(prev.rooms.map((r) => [String(r.id), r]));
    const ids = next.rooms
        .filter((r) => {
            const b = before.get(String(r.id));
            if (!b) return true;
            return (
                normKey(b.type) !== normKey(r.type) ||
                normKey(b.occupancy) !== normKey(r.occupancy) ||
                normKey(b.mealPlan) !== normKey(r.mealPlan)
            );
        })
        .map((r) => String(r.id));
    return { all: false, ids };
}

export function ratePlanGapNote(hasPrice: boolean, planAvailable: boolean, ready: boolean): string | null {
    if (!planAvailable || !ready || hasPrice) return null;
    return 'No price on this plan for this room';
}

export function pickRatePlanPeriod(
    plan: RatePlan | null | undefined,
    selectedPeriodId: string,
    todayYmd: string
): RatePlanPeriod | null {
    const normalized = plan ? normalizeRatePlan(plan) : null;
    if (!normalized || !normalized.periods.length) return null;
    const selected = normalized.periods.find((p) => p.id === selectedPeriodId);
    if (selected) return selected;
    const today = ymd(todayYmd);
    const containing = normalized.periods.filter((p) => today >= p.startDate && today <= p.endDate);
    if (containing.length) return sortPeriods(containing)[0];
    return [...normalized.periods].sort((a, b) => {
        const end = b.endDate.localeCompare(a.endDate);
        if (end !== 0) return end;
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    })[0];
}

export type PriceChartRow = { roomType: string } & Record<string, number | null | string>;

/** One group per room type on the period. Missing price is null, not 0. */
export function priceChartRows(
    period: RatePlanPeriod | null | undefined,
    mealPlan: string,
    occupancies: string[]
): PriceChartRow[] {
    if (!period) return [];
    const mealKey = normKey(mealPlan);
    const roomTypes: string[] = [];
    for (const line of period.lines) {
        if (!roomTypes.some((name) => normKey(name) === normKey(line.roomType))) roomTypes.push(line.roomType);
    }
    return roomTypes.map((roomType) => {
        const line = period.lines.find(
            (l) => normKey(l.roomType) === normKey(roomType) && normKey(l.mealPlan) === mealKey
        );
        const row: PriceChartRow = { roomType };
        for (const occ of occupancies) {
            row[occ] = line ? linePrice(line, occ) : null;
        }
        return row;
    });
}

export function coverageStats(
    period: RatePlanPeriod | null | undefined,
    mealPlan: string,
    occupancies: string[]
): { filled: number; total: number; missing: string[] } {
    const rows = priceChartRows(period, mealPlan, occupancies);
    const missing: string[] = [];
    let filled = 0;
    const meal = String(mealPlan || '').trim();
    for (const row of rows) {
        for (const occ of occupancies) {
            if (row[occ] == null) missing.push(`${row.roomType} · ${occ} · ${meal}`);
            else filled += 1;
        }
    }
    return { filled, total: rows.length * occupancies.length, missing };
}

function requestNights(req: { nights?: unknown; checkIn?: unknown; checkOut?: unknown }): number {
    const stored = Number(req?.nights);
    if (Number.isFinite(stored) && stored > 0) return stored;
    return spanDays(ymd(req?.checkIn), ymd(req?.checkOut || req?.checkIn));
}

function isCancelledStatus(status: unknown): boolean {
    return String(status || '')
        .trim()
        .toLowerCase()
        .includes('cancel');
}

export type PlanUseRow = {
    planId: string;
    label: string;
    requestCount: number;
    roomRevenue: number;
};

/** One row per plan. Cancelled stays are excluded. Requests with no plan are not a row. */
export function planUseStats(plans: unknown[], requests: unknown[], from: string, to: string): PlanUseRow[] {
    const rangeStart = ymd(from);
    const rangeEnd = ymd(to);
    const normalized = (Array.isArray(plans) ? plans : [])
        .map(normalizeRatePlan)
        .filter(Boolean) as RatePlan[];
    return normalized.map((plan) => {
        let requestCount = 0;
        let roomRevenue = 0;
        for (const raw of Array.isArray(requests) ? requests : []) {
            const req = (raw && typeof raw === 'object' ? raw : {}) as {
                ratePlanId?: unknown;
                status?: unknown;
                checkIn?: unknown;
                checkOut?: unknown;
                nights?: unknown;
                rooms?: unknown;
            };
            if (String(req?.ratePlanId || '').trim() !== plan.id) continue;
            if (isCancelledStatus(req?.status)) continue;
            const stayStart = ymd(req?.checkIn);
            const stayEnd = ymd(req?.checkOut || req?.checkIn);
            if (!overlaps(stayStart, stayEnd, rangeStart, rangeEnd)) continue;
            requestCount += 1;
            const nights = requestNights(req);
            const rooms = Array.isArray(req.rooms) ? req.rooms : [];
            for (const rawRoom of rooms) {
                const room = (rawRoom && typeof rawRoom === 'object' ? rawRoom : {}) as { rate?: unknown; count?: unknown };
                const rate = Number(room?.rate);
                const count = Number(room?.count);
                if (!Number.isFinite(rate) || !Number.isFinite(count)) continue;
                roomRevenue += rate * count * nights;
            }
        }
        const code = plan.code || plan.id;
        const name = plan.name || '';
        return {
            planId: plan.id,
            label: name ? `${code} — ${name}` : code,
            requestCount,
            roomRevenue,
        };
    });
}
