/** Pure helpers for multi-property (cluster) user assignment. */

type UserLike = {
    id?: string | null;
    propertyId?: string | null;
    property_ids?: string[] | null;
    assignedPropertyIds?: string[] | null;
    isAdmin?: boolean;
    role?: string | null;
} | null | undefined;

type PropLike = {
    id?: string | number | null;
    assignedUserIds?: Array<string | number> | null;
} | null | undefined;

function currentAssigned(user: UserLike): string[] {
    if (!user) return [];
    const fromIds = user.property_ids ?? user.assignedPropertyIds;
    if (Array.isArray(fromIds) && fromIds.length) {
        return [...new Set(fromIds.map((x) => String(x)))];
    }
    if (user.propertyId != null && String(user.propertyId).trim() !== '') {
        return [String(user.propertyId)];
    }
    return [];
}

/**
 * Grant or revoke a single property on a user without wiping the rest of their
 * cluster assignments. `assign=true` unions; `assign=false` removes only `propertyId`.
 */
export function nextUserPropertyAccess(
    user: UserLike,
    propertyId: string,
    assign: boolean,
): { propertyId: string | null; assignedPropertyIds: string[] } {
    const pid = String(propertyId ?? '').trim();
    const current = currentAssigned(user);
    if (!pid) {
        return {
            propertyId: user?.propertyId != null && String(user.propertyId).trim() !== ''
                ? String(user.propertyId)
                : null,
            assignedPropertyIds: current,
        };
    }

    if (assign) {
        const next = current.includes(pid) ? current : [...current, pid];
        const existingPrimary =
            user?.propertyId != null && String(user.propertyId).trim() !== ''
                ? String(user.propertyId)
                : null;
        const primary =
            existingPrimary && next.includes(existingPrimary) ? existingPrimary : next[0] || null;
        return { propertyId: primary, assignedPropertyIds: next };
    }

    const next = current.filter((id) => id !== pid);
    const oldPrimary =
        user?.propertyId != null && String(user.propertyId).trim() !== ''
            ? String(user.propertyId)
            : null;
    const newPrimary =
        oldPrimary === pid
            ? next[0] || null
            : oldPrimary && next.includes(oldPrimary)
              ? oldPrimary
              : next[0] || null;
    return { propertyId: newPrimary, assignedPropertyIds: next };
}

/** Client-side property switcher gate — mirrors backend can_access_property. */
export function userCanAccessProperty(user: UserLike, prop: PropLike): boolean {
    if (!prop || user == null) return false;
    if (user.isAdmin) return true;
    const role = String(user.role || '').trim().toLowerCase();
    if (role === 'admin' || role === 'super_admin') return true;
    const pid = String(prop.id ?? '');
    if (!pid) return false;
    if (String(user.propertyId ?? '') === pid) return true;
    const ids = user.property_ids || user.assignedPropertyIds || [];
    if (Array.isArray(ids) && ids.map((x) => String(x)).includes(pid)) return true;
    // Legacy display list on the property record (may drift; kept as fallback).
    if (
        Array.isArray(prop.assignedUserIds) &&
        prop.assignedUserIds.some((id) => String(id) === String(user.id ?? ''))
    ) {
        return true;
    }
    return false;
}
