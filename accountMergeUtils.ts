import { contactDisplayName } from './accountLeadMapping';
import { apiUrl } from './backendApi';
import { migrateLegacyLeads } from './crmStateModel';

/** propertyId -> deleted account ids that must not be re-synced until hydrate clears. */
const mergeTombstonesByProperty = new Map<string, Set<string>>();

export function rememberMergedAccountTombstone(propertyId: string, accountId: string): void {
    const pid = String(propertyId || '').trim();
    const aid = String(accountId || '').trim();
    if (!pid || !aid) return;
    let set = mergeTombstonesByProperty.get(pid);
    if (!set) {
        set = new Set();
        mergeTombstonesByProperty.set(pid, set);
    }
    set.add(aid);
}

export function clearMergedAccountTombstones(propertyId: string): void {
    const pid = String(propertyId || '').trim();
    if (!pid) return;
    mergeTombstonesByProperty.delete(pid);
}

export function filterAccountsExcludingMergeTombstones(accounts: any[], propertyId: string): any[] {
    const pid = String(propertyId || '').trim();
    const blocked = mergeTombstonesByProperty.get(pid);
    if (!blocked || blocked.size === 0) return accounts || [];
    return (accounts || []).filter((a) => !blocked.has(String(a?.id || '').trim()));
}

function contactIdentityKey(c: any, fallbackIdx: number): string {
    const e = String(c?.email || '').trim().toLowerCase();
    if (e) return `e:${e}`;
    const p = String(c?.phone || '').replace(/\D/g, '');
    if (p.length >= 7) return `p:${p}`;
    const n = contactDisplayName(c)
        .toLowerCase()
        .replace(/\s+/g, '');
    if (n.length >= 2) return `n:${n}`;
    return `row:${fallbackIdx}`;
}

function mergeScalar(a: string | undefined, b: string | undefined): string {
    const x = String(a ?? '').trim();
    if (x) return x;
    return String(b ?? '').trim();
}

/** Merge two contact rows: keep primary values; fill blanks from secondary. */
function mergeContactPair(primary: any, secondary: any): any {
    const out = { ...primary };
    const keys = ['firstName', 'lastName', 'position', 'email', 'phone', 'city', 'country'] as const;
    for (const k of keys) {
        out[k] = mergeScalar(out[k], secondary?.[k]);
    }
    out.name = contactDisplayName(out);
    return out;
}

/**
 * Deduplicate contacts by email / phone / display name; merge missing fields instead of dropping data.
 */
function isMeaninglessContact(c: any): boolean {
    const n = contactDisplayName(c).trim();
    const e = String(c?.email || '').trim();
    const p = String(c?.phone || '').replace(/\D/g, '');
    return !n && !e && p.length < 7;
}

export function mergeContactLists(primaryList: any[], secondaryList: any[]): any[] {
    const a = Array.isArray(primaryList) ? primaryList : [];
    const b = Array.isArray(secondaryList) ? secondaryList : [];
    const map = new Map<string, any>();
    let idx = 0;
    for (const c of [...a, ...b]) {
        if (!c || isMeaninglessContact(c)) continue;
        const k = contactIdentityKey(c, idx++);
        const prev = map.get(k);
        if (!prev) {
            map.set(k, { ...c, name: contactDisplayName(c) });
        } else {
            map.set(k, mergeContactPair(prev, c));
        }
    }
    return Array.from(map.values());
}

function mergeScalarFields(dest: any, src: any, keys: string[]) {
    const out = { ...dest };
    for (const k of keys) {
        const cur = out[k];
        const empty =
            cur == null ||
            (typeof cur === 'string' && !String(cur).trim()) ||
            (typeof cur === 'number' && !Number.isFinite(cur));
        if (empty && src[k] != null && String(src[k]).trim() !== '') {
            out[k] = src[k];
        }
    }
    return out;
}

function uniqueStrings(list: any[]): string[] {
    const s = new Set<string>();
    for (const x of list || []) {
        const t = String(x || '').trim();
        if (t) s.add(t);
    }
    return [...s];
}

function sortActivities(a: any, b: any): number {
    const ta = Date.parse(String(a?.at || '')) || 0;
    const tb = Date.parse(String(b?.at || '')) || 0;
    return ta - tb;
}

/**
 * Merge `source` account record into `dest` (same property). Keeps dest id and name; combines contacts, logs, tags.
 */
export function mergeAccountRecords(dest: any, source: any): any {
    const destName = String(dest?.name || '').trim();
    const contacts = mergeContactLists(dest?.contacts || [], source?.contacts || []);
    const activities = [...(dest?.activities || []), ...(source?.activities || [])].sort(sortActivities);
    const profileAuditLog = [...(dest?.profileAuditLog || []), ...(source?.profileAuditLog || [])];
    const tags = uniqueStrings([...(dest?.tags || []), ...(source?.tags || [])]);

    let merged = {
        ...dest,
        ...mergeScalarFields(dest, source, [
            'city',
            'country',
            'street',
            'website',
            'notes',
            'clientTaxId',
            'taxId',
            'type',
        ]),
        name: destName || String(source?.name || '').trim(),
        contacts,
        activities,
        profileAuditLog,
        tags: tags.length ? tags : dest?.tags || source?.tags || [],
    };

    if (!String(merged.accountOwnerName || '').trim() && String(source?.accountOwnerName || '').trim()) {
        merged = { ...merged, accountOwnerName: source.accountOwnerName };
    }
    if (!String(merged.createdByUserId || '').trim() && String(source?.createdByUserId || '').trim()) {
        merged = { ...merged, createdByUserId: source.createdByUserId };
    }

    return merged;
}

export function repointRequestsForAccountMerge(
    requests: any[],
    sourceAccountId: string,
    sourceAccountName: string,
    destAccountId: string,
    destAccountName: string
): any[] {
    const sid = String(sourceAccountId || '').trim();
    const sname = String(sourceAccountName || '').trim().toLowerCase();
    const did = String(destAccountId || '').trim();
    const dname = String(destAccountName || '').trim();
    return (requests || []).map((r) => {
        const rid = String(r?.accountId || '').trim();
        const an = String(r?.account || r?.accountName || '').trim().toLowerCase();
        const matchId = sid && rid === sid;
        const matchName = sname && (an === sname || (!rid && an === sname));
        if (matchId || matchName) {
            return {
                ...r,
                accountId: did,
                account: dname,
                accountName: dname,
            };
        }
        return r;
    });
}

export function repointCrmLeadsForAccountMerge(
    crmLeads: Record<string, any[]>,
    sourceAccountId: string,
    sourceAccountName: string,
    destAccountId: string,
    destAccountName: string
): Record<string, any[]> {
    const sid = String(sourceAccountId || '').trim();
    const sname = String(sourceAccountName || '').trim();
    const did = String(destAccountId || '').trim();
    const dname = String(destAccountName || '').trim();
    const out: Record<string, any[]> = { ...crmLeads };
    for (const k of Object.keys(out)) {
        out[k] = (out[k] || []).map((l: any) => {
            const aid = String(l?.accountId || '').trim();
            const company = String(l?.company || '').trim();
            if (sid && aid === sid) {
                return { ...l, accountId: did, company: dname };
            }
            if (sname && company === sname) {
                return { ...l, accountId: did, company: dname };
            }
            return l;
        });
    }
    return out;
}

export type AccountMergeApplyInput = {
    accounts: any[];
    sharedRequests: any[];
    crmLeads: Record<string, any[]>;
    destAccountId: string;
    sourceAccountId: string;
};

export function applyAccountMergeInMemory(input: AccountMergeApplyInput): {
    nextAccounts: any[];
    nextRequests: any[];
    nextCrmLeads: Record<string, any[]>;
    mergedAccount: any;
} | null {
    const { accounts, sharedRequests, crmLeads, destAccountId, sourceAccountId } = input;
    const dest = accounts.find((a: any) => String(a?.id) === String(destAccountId));
    const source = accounts.find((a: any) => String(a?.id) === String(sourceAccountId));
    if (!dest || !source || String(dest.id) === String(source.id)) return null;

    const destName = String(dest.name || '').trim();
    const sourceName = String(source.name || '').trim();
    const merged = mergeAccountRecords(dest, source);
    const nextAccounts = accounts.filter((a: any) => String(a?.id) !== String(sourceAccountId)).map((a: any) => (String(a.id) === String(destAccountId) ? merged : a));
    const nextRequests = repointRequestsForAccountMerge(
        sharedRequests,
        sourceAccountId,
        sourceName,
        destAccountId,
        destName
    );
    const nextCrmLeads = repointCrmLeadsForAccountMerge(
        crmLeads,
        sourceAccountId,
        sourceName,
        destAccountId,
        destName
    );
    return { nextAccounts, nextRequests, nextCrmLeads, mergedAccount: merged };
}

function requestAccountFieldsChanged(before: any, after: any): boolean {
    return (
        String(before?.accountId || '') !== String(after?.accountId || '') ||
        String(before?.account || '').trim() !== String(after?.account || '').trim() ||
        String(before?.accountName || '').trim() !== String(after?.accountName || '').trim()
    );
}

/**
 * Persist merge to the backend so a refresh does not bring back the duplicate account.
 * Order: repoint requests → CRM leads → upsert merged account → delete source account.
 */
export async function persistAccountMergeToBackend(opts: {
    mergedAccount: any;
    sourceAccountId: string;
    sourceAccountName: string;
    nextRequests: any[];
    previousRequests: any[];
    nextCrmLeads: Record<string, any[]>;
    propertyId: string;
}): Promise<void> {
    const {
        mergedAccount,
        sourceAccountId,
        sourceAccountName,
        nextRequests,
        previousRequests,
        nextCrmLeads,
        propertyId,
    } = opts;
    const sid = String(sourceAccountId || '').trim();
    const sname = String(sourceAccountName || '').trim().toLowerCase();
    if (!sid) throw new Error('Missing source account id');
    const pid = String(propertyId || '').trim();
    if (!pid) throw new Error('Missing property id for merge persistence');

    const prevById = new Map((previousRequests || []).map((r: any) => [String(r?.id), r]));
    const requestsToPersist: any[] = [];
    for (const r of nextRequests || []) {
        const o = prevById.get(String(r?.id));
        if (!o) continue;
        if (!requestAccountFieldsChanged(o, r)) continue;
        const touchedSource =
            String(o.accountId || '').trim() === sid ||
            String(o.account || '')
                .trim()
                .toLowerCase() === sname ||
            String(o.accountName || '')
                .trim()
                .toLowerCase() === sname;
        if (touchedSource) requestsToPersist.push(r);
    }

    for (const r of requestsToPersist) {
        const res = await fetch(apiUrl('/api/requests'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(r),
        });
        if (!res.ok) {
            const t = await res.text().catch(() => '');
            throw new Error(`Failed to repoint request ${r?.id}: ${res.status} ${t}`);
        }
    }

    const migratedCrm = migrateLegacyLeads(nextCrmLeads);
    const crmRes = await fetch(apiUrl('/api/crm-state'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            propertyId: pid,
            salesCalls: migratedCrm.salesCalls,
            pipeline: migratedCrm.pipeline,
        }),
    });
    if (!crmRes.ok) {
        const t = await crmRes.text().catch(() => '');
        throw new Error(`Failed to persist CRM state: ${crmRes.status} ${t}`);
    }

    const accPayload = { ...mergedAccount, propertyId: String(mergedAccount?.propertyId || '').trim() || pid };
    const accRes = await fetch(apiUrl('/api/accounts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accPayload),
    });
    if (!accRes.ok) {
        const t = await accRes.text().catch(() => '');
        throw new Error(`Failed to save merged account: ${accRes.status} ${t}`);
    }

    // Reassign account rate periods to destination before source delete (FK cascade would drop them).
    const destId = String(mergedAccount?.id || '').trim();
    if (destId) {
        const ratesRes = await fetch(
            apiUrl(
                `/api/account-rates?propertyId=${encodeURIComponent(pid)}&accountId=${encodeURIComponent(sid)}`
            )
        );
        if (ratesRes.ok) {
            const rates = await ratesRes.json().catch(() => []);
            if (Array.isArray(rates)) {
                for (const period of rates) {
                    const moved = { ...period, accountId: destId, propertyId: String(period?.propertyId || pid) };
                    const moveRes = await fetch(apiUrl('/api/account-rates'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(moved),
                    });
                    if (!moveRes.ok) {
                        const t = await moveRes.text().catch(() => '');
                        throw new Error(`Failed to reassign account rate ${period?.id}: ${moveRes.status} ${t}`);
                    }
                }
            }
        }
    }

    const delRes = await fetch(apiUrl(`/api/accounts/${encodeURIComponent(sid)}`), { method: 'DELETE' });
    if (!delRes.ok && delRes.status !== 404) {
        const t = await delRes.text().catch(() => '');
        throw new Error(`Failed to remove duplicate account: ${delRes.status} ${t}`);
    }

    rememberMergedAccountTombstone(pid, sid);
}
