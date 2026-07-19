import { computeRequestRevenueBreakdownNoTax } from './operationalSegmentRevenue';

/** Join requests to an account by stable id, then by normalized account name. */
export function requestMatchesAccount(req: any, accountId: string | undefined, accountName: string | undefined): boolean {
    const aid = String(accountId || '').trim();
    if (aid && String(req.accountId || '').trim() === aid) return true;
    const n = String(accountName || '').trim().toLowerCase();
    if (!n) return false;
    const ra = String(req.account || req.accountName || '').trim().toLowerCase();
    return ra === n;
}

export function filterRequestsForAccount(requests: any[], accountId: string | undefined, accountName: string | undefined): any[] {
    if (!requests?.length) return [];
    return requests.filter((r) => requestMatchesAccount(r, accountId, accountName));
}

export type AccountRequestStats = { revSar: number; reqCount: number };

/**
 * One pass over requests → per-account revenue/count (same matching as filterRequestsForAccount).
 * A request may attribute to multiple accounts when id matches one and name matches another.
 */
export function buildRequestStatsByAccount(
    accounts: any[],
    sharedRequests: any[] | undefined | null
): Map<string, AccountRequestStats> {
    const stats = new Map<string, AccountRequestStats>();
    const byId = new Map<string, true>();
    const byName = new Map<string, string[]>();

    for (const a of accounts || []) {
        const id = String(a?.id ?? '').trim();
        if (!id) continue;
        stats.set(id, { revSar: 0, reqCount: 0 });
        byId.set(id, true);
        const n = String(a?.name || '').trim().toLowerCase();
        if (!n) continue;
        const list = byName.get(n);
        if (list) list.push(id);
        else byName.set(n, [id]);
    }

    for (const r of sharedRequests || []) {
        const matched = new Set<string>();
        const rid = String(r?.accountId || '').trim();
        if (rid && byId.has(rid)) matched.add(rid);
        const rn = String(r?.account || r?.accountName || '').trim().toLowerCase();
        if (rn) {
            for (const aid of byName.get(rn) || []) matched.add(aid);
        }
        if (!matched.size) continue;
        const rev = computeRequestRevenueBreakdownNoTax(r).totalLineNoTax;
        for (const aid of matched) {
            const s = stats.get(aid);
            if (!s) continue;
            s.revSar += rev;
            s.reqCount += 1;
        }
    }

    return stats;
}

const WON = new Set(['definite', 'actual']);
const OPEN = new Set(['inquiry', 'tentative', 'accepted']);
const INQUIRY_TENTATIVE = new Set(['inquiry', 'tentative']);

export function filterOpenBookingRequests(requestsForAccount: any[]): any[] {
    if (!requestsForAccount?.length) return [];
    return requestsForAccount.filter((r) => OPEN.has(String(r.status || '').toLowerCase()));
}

/** Active Opportunities: Inquiry through Tentative only. */
export function filterInquiryToTentativeRequests(requestsForAccount: any[]): any[] {
    if (!requestsForAccount?.length) return [];
    return requestsForAccount.filter((r) => INQUIRY_TENTATIVE.has(String(r.status || '').toLowerCase()));
}

export function formatRequestStatusLabel(status: string): string {
    const s = String(status || '').trim();
    if (!s) return '—';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function computeAccountMetrics(requestsForAccount: any[]): {
    totalRequests: number;
    totalSpend: number;
    /** % of all linked requests in Definite or Actual status. */
    winRate: number;
    /** % of all linked requests in Cancelled or Lost status. */
    cancellationRate: number;
    openPipelineCount: number;
    wonCount: number;
    cancelledCount: number;
    otherCount: number;
} {
    if (!requestsForAccount.length) {
        return {
            totalRequests: 0,
            totalSpend: 0,
            winRate: 0,
            cancellationRate: 0,
            openPipelineCount: 0,
            wonCount: 0,
            cancelledCount: 0,
            otherCount: 0,
        };
    }
    let totalSpend = 0;
    let wonCount = 0;
    let cancelledCount = 0;
    let otherCount = 0;
    let openCount = 0;
    const total = requestsForAccount.length;
    for (const r of requestsForAccount) {
        const paid = parseFloat(String(r.paidAmount || '0').replace(/,/g, '')) || 0;
        totalSpend += paid;
        const st = String(r.status || '').toLowerCase();
        if (WON.has(st)) {
            wonCount += 1;
        } else if (st === 'cancelled' || st === 'lost') {
            cancelledCount += 1;
        } else {
            otherCount += 1;
        }
        if (OPEN.has(st)) openCount += 1;
    }
    const winRate = total > 0 ? Math.round((wonCount / total) * 100) : 0;
    const cancellationRate = total > 0 ? Math.round((cancelledCount / total) * 100) : 0;
    return {
        totalRequests: total,
        totalSpend,
        winRate,
        cancellationRate,
        openPipelineCount: openCount,
        wonCount,
        cancelledCount,
        otherCount,
    };
}

export type TimelineItem = {
    id: string;
    sortKey: number;
    icon: 'call' | 'doc' | 'visit' | 'request' | 'note';
    title: string;
    body: string;
    whenLabel: string;
    by: string;
    meta?: { requestId?: string; stage?: string; activityId?: string; source?: 'manual' | 'call' | 'request' };
};

function parseWhen(s: string | undefined): number {
    if (!s) return 0;
    const t = Date.parse(s);
    return Number.isNaN(t) ? 0 : t;
}

/** Flatten CRM pipeline leads with stage label for matching & display */
export function flattenCrmLeads(leads: Record<string, any[]>): any[] {
    if (!leads || typeof leads !== 'object') return [];
    const out: any[] = [];
    for (const [stage, arr] of Object.entries(leads)) {
        if (!Array.isArray(arr)) continue;
        for (const l of arr) {
            out.push({ ...l, stage });
        }
    }
    return out;
}

export function filterSalesCallsForAccount(
    flatLeads: any[],
    accountId: string | undefined,
    accountName: string | undefined
): any[] {
    const aid = String(accountId || '').trim();
    const name = String(accountName || '').trim().toLowerCase();
    return flatLeads.filter((l) => {
        if (aid && String(l.accountId || '').trim() === aid) return true;
        const c = String(l.company || '').trim().toLowerCase();
        return name && c === name;
    });
}

const STAGE_OPPORTUNITY = new Set(['new', 'waiting', 'qualified', 'proposal', 'negotiation']);

export function filterOpenOpportunityLeads(flatLeads: any[], accountId: string | undefined, accountName: string | undefined): any[] {
    return filterSalesCallsForAccount(flatLeads, accountId, accountName).filter((l) =>
        STAGE_OPPORTUNITY.has(String(l.stage || '').toLowerCase())
    );
}

export function buildAccountTimeline(input: {
    requestsForAccount: any[];
    salesCalls: any[];
    manualActivities?: any[];
}): TimelineItem[] {
    const items: TimelineItem[] = [];

    for (const call of input.salesCalls) {
        const when = call.lastContact || call.followUpDate || call.date || '';
        const completed =
            call.activityCompleted === true ||
            call.activityCompleted === 1 ||
            String(call.activityCompleted || '').toLowerCase() === 'true';
        const baseTitle =
            call.subject || `${String(call.stage || 'Call').toUpperCase()} — ${call.company || 'Sales call'}`;
        const title = completed ? `${baseTitle} (completed)` : baseTitle;
        const loggedHint = call.callLoggedAt
            ? `Logged: ${new Date(call.callLoggedAt).toLocaleString()}`
            : '';
        const body =
            [call.description, call.nextStep, loggedHint].filter(Boolean).join('\n') || '—';
        items.push({
            id: `call-${call.id}`,
            sortKey: parseWhen(when) || parseWhen(call.followUpDate),
            icon: 'call',
            title,
            body,
            whenLabel: when ? String(when) : '—',
            by: call.accountManager || '—',
            meta: { stage: call.stage, source: 'call' }
        });
    }

    for (const req of input.requestsForAccount) {
        const logs = Array.isArray(req.logs) ? req.logs : [];
        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            items.push({
                id: `req-${req.id}-log-${i}`,
                sortKey: parseWhen(log.date),
                icon: 'request',
                title: log.action || 'Request activity',
                body: log.details || '',
                whenLabel: log.date ? new Date(log.date).toLocaleString() : '—',
                by: log.user || '—',
                meta: { requestId: req.id, source: 'request' }
            });
        }
    }

    const manual = input.manualActivities || [];
    for (let i = 0; i < manual.length; i++) {
        const a = manual[i];
        const aid = a.id != null ? String(a.id) : `i${i}`;
        items.push({
            id: `act-${aid}`,
            sortKey: parseWhen(a.at || a.date),
            icon: 'note',
            title: a.title || 'Activity',
            body: a.body || '',
            whenLabel: a.at || a.date ? new Date(a.at || a.date).toLocaleString() : '—',
            by: a.user || a.userName || '—',
            meta: { activityId: aid, source: 'manual' }
        });
    }

    items.sort((a, b) => b.sortKey - a.sortKey);
    return items;
}
