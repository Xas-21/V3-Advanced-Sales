/** Stable display order for rooms/venues (and any `{ sortOrder?, id? }` rows). */

const MISSING = Number.MAX_SAFE_INTEGER;

export function sortOrderValue(item: { sortOrder?: unknown } | null | undefined): number {
    const raw = item?.sortOrder;
    if (raw === null || raw === undefined || raw === '') return MISSING;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : MISSING;
}

/** Ascending sortOrder; missing last; ties by id. Does not mutate input. */
export function sortBySortOrder<T extends { id?: unknown; sortOrder?: unknown }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        const d = sortOrderValue(a) - sortOrderValue(b);
        if (d !== 0) return d;
        return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
    });
}

/** Move index `from` to `to` (0-based). Returns a new array. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
    if (from === to) return [...items];
    if (from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
    const next = [...items];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    return next;
}

/** Assign sortOrder 0..n-1 in current array order. */
export function withReassignedSortOrder<T extends Record<string, unknown>>(items: T[]): T[] {
    return items.map((item, i) => ({ ...item, sortOrder: i }));
}

/** Next sortOrder for a newly created row (max existing + 1, or 0). */
export function nextSortOrder(items: { sortOrder?: unknown }[]): number {
    let max = -1;
    for (const it of items) {
        const n = sortOrderValue(it);
        if (n !== MISSING && n > max) max = n;
    }
    return max + 1;
}
