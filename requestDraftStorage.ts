const NEW_REQUEST_DRAFT_KEY = 'visatour_new_request_draft_v1';

export type NewRequestDraft = {
    propertyId: string;
    step: number;
    requestType: string | null;
    accForm: Record<string, unknown>;
    evtForm: Record<string, unknown>;
    accountSearch?: string;
    updatedAt: number;
};

export function readNewRequestDraft(propertyId: string): NewRequestDraft | null {
    const pid = String(propertyId || '').trim() || 'P-GLOBAL';
    try {
        const raw = sessionStorage.getItem(NEW_REQUEST_DRAFT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as NewRequestDraft;
        if (String(parsed?.propertyId || '') !== pid) return null;
        if (!parsed?.accForm || typeof parsed.accForm !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
}

export function writeNewRequestDraft(draft: NewRequestDraft): void {
    try {
        sessionStorage.setItem(NEW_REQUEST_DRAFT_KEY, JSON.stringify(draft));
    } catch {
        /* quota / private mode */
    }
}

export function clearNewRequestDraft(): void {
    try {
        sessionStorage.removeItem(NEW_REQUEST_DRAFT_KEY);
    } catch {
        /* ignore */
    }
}
