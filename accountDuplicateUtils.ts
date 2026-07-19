import { meaningfulContactEmail, meaningfulContactPhone } from './accountProfileCompleteness';

/**
 * Fuzzy account name matching for duplicate detection (spacing, case, punctuation).
 */

const INVISIBLE_SORT_CHARS = /[\u200B-\u200D\uFEFF\u061C\u202A-\u202E\u2066-\u2069]/g;

/** Normalize account name for stable A–Z list sorting (trim, strip invisible/bidi chars). */
export function accountNameSortKey(name: unknown): string {
    return String(name ?? '')
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .replace(INVISIBLE_SORT_CHARS, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

/** Case-insensitive A–Z compare with natural number ordering (e.g. "1st" before "88"). */
export function compareAccountNames(a: unknown, b: unknown): number {
    return accountNameSortKey(a).localeCompare(accountNameSortKey(b), undefined, {
        sensitivity: 'base',
        numeric: true,
    });
}

/** Collapse spaces and punctuation so "Al Boraq" and "ALBORAQ" match. */
export function normalizeAccountNameKey(name: string): string {
    const raw = String(name ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}+/gu, '');
    const compact = raw.replace(/[\s._\-/]+/g, '').replace(/[^a-z0-9\u0600-\u06FF]/gi, '');
    return compact || raw.replace(/\s+/g, '').toLowerCase();
}

function samePropertyAccount(account: any, propertyId: string | undefined): boolean {
    if (!propertyId) return true;
    const pid = String(account?.propertyId ?? '').trim();
    if (!pid || pid === 'P-GLOBAL') return true;
    return pid === propertyId;
}

/**
 * Accounts that may be duplicates of `candidateName` (same normalized key or strong substring overlap).
 */
export function findPotentialDuplicateAccounts(
    candidateName: string,
    accounts: any[],
    opts?: { excludeAccountId?: string; propertyId?: string }
): any[] {
    const key = normalizeAccountNameKey(candidateName);
    if (!key || key.length < 2) return [];
    const pid = opts?.propertyId != null ? String(opts.propertyId).trim() : '';
    const ex = opts?.excludeAccountId != null ? String(opts.excludeAccountId) : '';

    const out: any[] = [];
    for (const a of accounts || []) {
        if (!a) continue;
        if (ex && String(a.id) === ex) continue;
        if (pid && !samePropertyAccount(a, pid)) continue;
        const ak = normalizeAccountNameKey(String(a.name || ''));
        if (!ak) continue;
        if (ak === key) {
            out.push(a);
            continue;
        }
        if (key.length >= 4 && ak.length >= 4) {
            if (ak.includes(key) || key.includes(ak)) {
                out.push(a);
            }
        }
    }
    return out;
}

/** True when the scanned contact email/phone is already on the account. */
export function isScannedContactOnAccount(account: any, scannedContact: any): boolean {
    if (!account || !scannedContact) return false;
    const contacts = Array.isArray(account.contacts) ? account.contacts : [];
    const scannedEmails = String(scannedContact?.email || '')
        .split(/[,;]+/)
        .map((s) => meaningfulContactEmail(s))
        .filter(Boolean);
    const scannedPhone = meaningfulContactPhone(scannedContact?.phone);
    if (!scannedEmails.length && !scannedPhone) return false;

    for (const c of contacts) {
        const rowEmail = meaningfulContactEmail(c?.email);
        const rowPhone = meaningfulContactPhone(c?.phone);
        if (rowEmail && scannedEmails.includes(rowEmail)) return true;
        if (scannedPhone && rowPhone && scannedPhone === rowPhone) return true;
    }
    return false;
}

/** Scan queue rows that no longer need review (contact already saved, or account gone). */
export function isScanDuplicateQueueItemStale(item: any, accounts: any[]): boolean {
    if (item?.source !== 'business-card-scan') return false;
    const candidateId = String(item?.candidateAccountId || '').trim();
    const candidate = (accounts || []).find((a) => String(a?.id) === candidateId);
    if (!candidate) return true;
    return isScannedContactOnAccount(candidate, item?.scannedContact);
}

function pushSystemDuplicatePair(out: any[], left: any, right: any, reason: string, key: string) {
    out.push({
        id: `sys-${reason}-${key}-${String(left?.id || '')}-${String(right?.id || '')}`,
        source: 'system-detection',
        reason,
        scannedAccountName: String(left?.name || ''),
        candidateAccountId: String(right?.id || ''),
        candidateAccountName: String(right?.name || ''),
        baseAccountId: String(left?.id || ''),
        baseAccountName: String(left?.name || ''),
        scannedContact: (left?.contacts && left.contacts[0]) || null,
        status: 'open',
    });
}

function addAccountToContactIndex(map: Map<string, any[]>, key: string, account: any) {
    if (!key) return;
    const list = map.get(key);
    if (!list) {
        map.set(key, [account]);
        return;
    }
    if (!list.some((a) => String(a?.id) === String(account?.id))) list.push(account);
}

/**
 * System-detected duplicate account pairs (same normalized name, or shared contact email/phone).
 * Contact matching is Map-indexed (O(contacts)), not account×account nested scans.
 */
export function buildSystemDuplicateItems(accountsSameProperty: any[]): any[] {
    const list = Array.isArray(accountsSameProperty) ? accountsSameProperty : [];
    const out: any[] = [];

    const byName = new Map<string, any[]>();
    for (const a of list) {
        const key = normalizeAccountNameKey(String(a?.name || ''));
        if (!key) continue;
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key)!.push(a);
    }
    for (const [k, group] of byName.entries()) {
        if (group.length < 2) continue;
        for (let i = 0; i < group.length; i += 1) {
            for (let j = i + 1; j < group.length; j += 1) {
                pushSystemDuplicatePair(out, group[i], group[j], 'same-name', k);
            }
        }
    }

    const emailToAccounts = new Map<string, any[]>();
    const phoneToAccounts = new Map<string, any[]>();
    const indexById = new Map<string, number>();
    list.forEach((a, idx) => {
        const id = String(a?.id ?? '');
        if (id) indexById.set(id, idx);
        const contacts = Array.isArray(a?.contacts) ? a.contacts : [];
        for (const c of contacts) {
            addAccountToContactIndex(emailToAccounts, meaningfulContactEmail(c?.email), a);
            addAccountToContactIndex(phoneToAccounts, meaningfulContactPhone(c?.phone), a);
        }
    });

    const seenContactPair = new Set<string>();
    const emitContactPairs = (map: Map<string, any[]>, reasonPrefix: 'same-contact-email' | 'same-contact-phone') => {
        for (const [contactKey, group] of map.entries()) {
            if (group.length < 2) continue;
            const ordered = [...group].sort(
                (a, b) => (indexById.get(String(a?.id)) ?? 0) - (indexById.get(String(b?.id)) ?? 0)
            );
            for (let i = 0; i < ordered.length; i += 1) {
                for (let j = i + 1; j < ordered.length; j += 1) {
                    const left = ordered[i];
                    const right = ordered[j];
                    const pairKey = `${left?.id}:${right?.id}`;
                    if (seenContactPair.has(pairKey)) continue;
                    seenContactPair.add(pairKey);
                    const reason = `${reasonPrefix}:${contactKey}`;
                    pushSystemDuplicatePair(out, left, right, reason, `${left?.id}-${right?.id}`);
                }
            }
        }
    };
    // Email preferred over phone for a given account pair (matches prior first-match behavior).
    emitContactPairs(emailToAccounts, 'same-contact-email');
    emitContactPairs(phoneToAccounts, 'same-contact-phone');

    const seen = new Set<string>();
    return out.filter((item) => {
        const key = `${item.baseAccountId}|${item.candidateAccountId}|${item.reason}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

