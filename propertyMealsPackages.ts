/** Per-property meal plans (rooms) and event packages (MICE agenda).
 *  Canonical source: property record on the server (`mealPlans`, `eventPackages`).
 *  localStorage is legacy fallback until data is saved from Manage Property. */

import { apiUrl } from './backendApi';

export const MEALS_PACKAGES_CHANGED_EVENT = 'visatour-meals-packages-changed';

const MEAL_PLANS_PREFIX = 'visatour_property_meal_plans_v1::';
const EVENT_PACKAGES_PREFIX = 'visatour_property_event_packages_v1::';

export type EventPackageTimingId =
    | 'rental_only'
    | 'coffee_1'
    | 'coffee_2'
    | 'coffee_1_lunch'
    | 'coffee_2_lunch'
    | 'coffee_1_dinner'
    | 'coffee_2_dinner'
    | 'lunch_only'
    | 'dinner_only'
    | 'full_package';

export interface MealPlanEntry {
    id: string;
    name: string;
    code: string;
}

export interface EventPackageEntry {
    id: string;
    name: string;
    code: string;
    timingId: EventPackageTimingId;
}

export const EVENT_PACKAGE_TIMING_OPTIONS: { id: EventPackageTimingId; label: string }[] = [
    { id: 'rental_only', label: 'Rental only (no catering timings)' },
    { id: 'coffee_1', label: '1× Coffee break' },
    { id: 'coffee_2', label: '2× Coffee breaks' },
    { id: 'coffee_1_lunch', label: '1× Coffee break + Lunch' },
    { id: 'coffee_2_lunch', label: '2× Coffee breaks + Lunch' },
    { id: 'coffee_1_dinner', label: '1× Coffee break + Dinner' },
    { id: 'coffee_2_dinner', label: '2× Coffee breaks + Dinner' },
    { id: 'lunch_only', label: 'Lunch only' },
    { id: 'dinner_only', label: 'Dinner only' },
    { id: 'full_package', label: 'Full package (1 coffee + lunch + dinner)' },
];

export const DEFAULT_MEAL_PLANS: MealPlanEntry[] = [
    { id: 'mp-ro', name: 'Room Only', code: 'RO' },
    { id: 'mp-bb', name: 'Bed & Breakfast', code: 'BB' },
    { id: 'mp-hb', name: 'Half Board', code: 'HB' },
    { id: 'mp-fb', name: 'Full Board', code: 'FB' },
];

/** Default names match the standard catering combinations. */
export const DEFAULT_EVENT_PACKAGES: EventPackageEntry[] = [
    { id: 'ep-ro', name: 'Rental Only', code: 'RO', timingId: 'rental_only' },
    { id: 'ep-1cb', name: '1 Coffee Break', code: '1CB', timingId: 'coffee_1' },
    { id: 'ep-2cb', name: '2 Coffee Breaks', code: '2CB', timingId: 'coffee_2' },
    { id: 'ep-1cbl', name: '1 Coffee Break with Lunch', code: '1CBL', timingId: 'coffee_1_lunch' },
    { id: 'ep-2cbl', name: '2 Coffee Breaks with Lunch', code: '2CBL', timingId: 'coffee_2_lunch' },
    { id: 'ep-1cbd', name: '1 Coffee Break with Dinner', code: '1CBD', timingId: 'coffee_1_dinner' },
    { id: 'ep-2cbd', name: '2 Coffee Breaks with Dinner', code: '2CBD', timingId: 'coffee_2_dinner' },
    { id: 'ep-lo', name: 'Lunch only', code: 'LO', timingId: 'lunch_only' },
    { id: 'ep-do', name: 'Dinner only', code: 'DO', timingId: 'dinner_only' },
    {
        id: 'ep-full',
        name: 'Full Package (1 Coffee Break, Lunch & Dinner)',
        code: 'FULL',
        timingId: 'full_package',
    },
];

const LEGACY_EVENT_PACKAGE_TO_TIMING: Record<string, EventPackageTimingId> = {
    'Rental only': 'rental_only',
    Rental: 'rental_only',
    'Full Day': 'full_package',
    'Half Day': 'coffee_1_lunch',
    'Coffee Break only': 'coffee_1',
    'Coffee Break': 'coffee_1',
    'Lunch only': 'lunch_only',
    'Dinner only': 'dinner_only',
};

function mealPlansKey(propertyId: string) {
    return `${MEAL_PLANS_PREFIX}${propertyId}`;
}

function eventPackagesKey(propertyId: string) {
    return `${EVENT_PACKAGES_PREFIX}${propertyId}`;
}

function newId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isTimingId(x: unknown): x is EventPackageTimingId {
    return EVENT_PACKAGE_TIMING_OPTIONS.some((o) => o.id === x);
}

function parseMealPlans(raw: string | null): MealPlanEntry[] | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        const out: MealPlanEntry[] = [];
        for (const row of parsed) {
            const name = String(row?.name ?? '').trim();
            const code = String(row?.code ?? '').trim();
            const id = String(row?.id ?? '').trim() || newId('mp');
            if (name && code) out.push({ id, name, code: code.toUpperCase() });
        }
        return out.length ? out : null;
    } catch {
        return null;
    }
}

function parseEventPackages(raw: string | null): EventPackageEntry[] | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        const out: EventPackageEntry[] = [];
        for (const row of parsed) {
            const name = String(row?.name ?? '').trim();
            const code = String(row?.code ?? '').trim();
            const id = String(row?.id ?? '').trim() || newId('ep');
            const timingId: EventPackageTimingId = isTimingId(row?.timingId) ? row.timingId : 'coffee_1';
            if (name && code) out.push({ id, name, code, timingId });
        }
        return out.length ? out : null;
    } catch {
        return null;
    }
}

function mealPlansFromArray(arr: unknown): MealPlanEntry[] {
    if (!Array.isArray(arr)) return [];
    const out: MealPlanEntry[] = [];
    for (const row of arr) {
        const name = String((row as any)?.name ?? '').trim();
        const code = String((row as any)?.code ?? '').trim();
        const id = String((row as any)?.id ?? '').trim() || newId('mp');
        if (name && code) out.push({ id, name, code: code.toUpperCase() });
    }
    return out;
}

function eventPackagesFromArray(arr: unknown): EventPackageEntry[] {
    if (!Array.isArray(arr)) return [];
    const out: EventPackageEntry[] = [];
    for (const row of arr) {
        const name = String((row as any)?.name ?? '').trim();
        const code = String((row as any)?.code ?? '').trim();
        const id = String((row as any)?.id ?? '').trim() || newId('ep');
        const timingId: EventPackageTimingId = isTimingId((row as any)?.timingId) ? (row as any).timingId : 'coffee_1';
        if (name && code) out.push({ id, name, code, timingId });
    }
    return out;
}

function dispatchChanged(
    propertyId: string,
    extra?: { mealPlans?: MealPlanEntry[]; eventPackages?: EventPackageEntry[] }
) {
    try {
        window.dispatchEvent(
            new CustomEvent(MEALS_PACKAGES_CHANGED_EVENT, { detail: { propertyId, ...extra } })
        );
    } catch {
        /* ignore */
    }
}

function postPropertyPatch(payload: Record<string, unknown>) {
    fetch(apiUrl('/api/properties'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    }).catch(() => {});
}

function loadMealPlansLocalOnly(propertyId: string): MealPlanEntry[] {
    if (!propertyId) return DEFAULT_MEAL_PLANS.map((m) => ({ ...m }));
    try {
        const list = parseMealPlans(localStorage.getItem(mealPlansKey(propertyId)));
        return list?.length ? list : DEFAULT_MEAL_PLANS.map((m) => ({ ...m }));
    } catch {
        return DEFAULT_MEAL_PLANS.map((m) => ({ ...m }));
    }
}

function loadEventPackagesLocalOnly(propertyId: string): EventPackageEntry[] {
    if (!propertyId) return DEFAULT_EVENT_PACKAGES.map((p) => ({ ...p }));
    try {
        const list = parseEventPackages(localStorage.getItem(eventPackagesKey(propertyId)));
        return list?.length ? list : DEFAULT_EVENT_PACKAGES.map((p) => ({ ...p }));
    } catch {
        return DEFAULT_EVENT_PACKAGES.map((p) => ({ ...p }));
    }
}

export function resolveMealPlansForProperty(
    propertyId: string,
    property?: { mealPlans?: unknown } | null
): MealPlanEntry[] {
    if (!propertyId) return DEFAULT_MEAL_PLANS.map((m) => ({ ...m }));
    if (property && 'mealPlans' in property && Array.isArray(property.mealPlans)) {
        return mealPlansFromArray(property.mealPlans);
    }
    return loadMealPlansLocalOnly(propertyId);
}

export function resolveEventPackagesForProperty(
    propertyId: string,
    property?: { eventPackages?: unknown } | null
): EventPackageEntry[] {
    if (!propertyId) return DEFAULT_EVENT_PACKAGES.map((p) => ({ ...p }));
    if (property && 'eventPackages' in property && Array.isArray(property.eventPackages)) {
        return eventPackagesFromArray(property.eventPackages);
    }
    return loadEventPackagesLocalOnly(propertyId);
}

export function loadMealPlansForProperty(propertyId: string): MealPlanEntry[] {
    return resolveMealPlansForProperty(propertyId, null);
}

export function saveMealPlansForProperty(propertyId: string, plans: MealPlanEntry[]): void {
    if (!propertyId) return;
    const clean = plans
        .map((p) => ({
            id: p.id || newId('mp'),
            name: String(p.name || '').trim(),
            code: String(p.code || '').trim().toUpperCase(),
        }))
        .filter((p) => p.name && p.code);
    try {
        localStorage.setItem(mealPlansKey(propertyId), JSON.stringify(clean));
    } catch {
        /* ignore */
    }
    dispatchChanged(propertyId, { mealPlans: clean });
    postPropertyPatch({ id: propertyId, mealPlans: clean });
}

export function loadEventPackagesForProperty(propertyId: string): EventPackageEntry[] {
    return resolveEventPackagesForProperty(propertyId, null);
}

export function saveEventPackagesForProperty(propertyId: string, packages: EventPackageEntry[]): void {
    if (!propertyId) return;
    const clean = packages
        .map((p) => ({
            id: p.id || newId('ep'),
            name: String(p.name || '').trim(),
            code: String(p.code || '').trim(),
            timingId: isTimingId(p.timingId) ? p.timingId : 'coffee_1',
        }))
        .filter((p) => p.name && p.code);
    try {
        localStorage.setItem(eventPackagesKey(propertyId), JSON.stringify(clean));
    } catch {
        /* ignore */
    }
    dispatchChanged(propertyId, { eventPackages: clean });
    postPropertyPatch({ id: propertyId, eventPackages: clean });
}

export function getTimingSlotsForTimingId(timingId: EventPackageTimingId): {
    field: 'coffee1' | 'coffee2' | 'lunchTime' | 'dinnerTime';
    label: string;
}[] {
    switch (timingId) {
        case 'rental_only':
            return [];
        case 'coffee_1':
            return [{ field: 'coffee1', label: 'Coffee break' }];
        case 'coffee_2':
            return [
                { field: 'coffee1', label: 'Coffee break 1' },
                { field: 'coffee2', label: 'Coffee break 2' },
            ];
        case 'coffee_1_lunch':
            return [
                { field: 'coffee1', label: 'Coffee break' },
                { field: 'lunchTime', label: 'Lunch time' },
            ];
        case 'coffee_2_lunch':
            return [
                { field: 'coffee1', label: 'Coffee break 1' },
                { field: 'coffee2', label: 'Coffee break 2' },
                { field: 'lunchTime', label: 'Lunch time' },
            ];
        case 'coffee_1_dinner':
            return [
                { field: 'coffee1', label: 'Coffee break' },
                { field: 'dinnerTime', label: 'Dinner time' },
            ];
        case 'coffee_2_dinner':
            return [
                { field: 'coffee1', label: 'Coffee break 1' },
                { field: 'coffee2', label: 'Coffee break 2' },
                { field: 'dinnerTime', label: 'Dinner time' },
            ];
        case 'lunch_only':
            return [{ field: 'lunchTime', label: 'Lunch time' }];
        case 'dinner_only':
            return [{ field: 'dinnerTime', label: 'Dinner time' }];
        case 'full_package':
            return [
                { field: 'coffee1', label: 'Coffee break' },
                { field: 'lunchTime', label: 'Lunch time' },
                { field: 'dinnerTime', label: 'Dinner time' },
            ];
        default:
            return [];
    }
}

export function resolveEventPackageTimingId(
    packageName: string,
    eventPackages: EventPackageEntry[]
): EventPackageTimingId {
    const n = String(packageName || '').trim();
    const byName = eventPackages.find((p) => p.name === n);
    if (byName && isTimingId(byName.timingId)) return byName.timingId;
    const legacy = LEGACY_EVENT_PACKAGE_TO_TIMING[n];
    if (legacy) return legacy;
    return 'full_package';
}

export function getAgendaTimingSlotsForPackageName(
    packageName: string,
    eventPackages: EventPackageEntry[]
): { field: 'coffee1' | 'coffee2' | 'lunchTime' | 'dinnerTime'; label: string }[] {
    return getTimingSlotsForTimingId(resolveEventPackageTimingId(packageName, eventPackages));
}

/** Normalize legacy agenda row fields for the form (coffeeTime / lunch / dinner). */
export function normalizeAgendaRowTimes(row: any): any {
    if (!row || typeof row !== 'object') return row;
    const r = { ...row };
    const c1 = String(r.coffee1 ?? '').trim();
    const ct = String(r.coffeeTime ?? '').trim();
    if (!c1 && ct) r.coffee1 = ct;
    const lt = String(r.lunchTime ?? '').trim();
    const l = String(r.lunch ?? '').trim();
    if (!lt && l) r.lunchTime = l;
    const dt = String(r.dinnerTime ?? '').trim();
    const d = String(r.dinner ?? '').trim();
    if (!dt && d) r.dinnerTime = d;
    return r;
}

export function defaultEventPackageName(eventPackages: EventPackageEntry[]): string {
    const first = eventPackages[0]?.name?.trim();
    return first || DEFAULT_EVENT_PACKAGES[0].name;
}
