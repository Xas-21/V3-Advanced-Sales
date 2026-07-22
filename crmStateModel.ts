/** CRM state: salesCalls (Activities) + pipeline (Kanban/Funnel). */

export const PIPELINE_STAGE_KEYS = [
    'waiting',
    'qualified',
    'proposal',
    'negotiation',
    'won',
    'notInterested',
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGE_KEYS)[number];

/** Stages that follow the log-call due date across months (Won/Cancelled stay put). */
export const PIPELINE_MOVABLE_STAGE_KEYS: PipelineStageKey[] = [
    'waiting',
    'qualified',
    'proposal',
    'negotiation',
];

export function isMovablePipelineStage(stage: string | null | undefined): boolean {
    return PIPELINE_MOVABLE_STAGE_KEYS.includes(String(stage || '') as PipelineStageKey);
}

export type CrmPipelineBuckets = Record<PipelineStageKey, any[]>;

export type CrmStatePayload = {
    salesCalls: any[];
    pipeline: CrmPipelineBuckets;
};

export function defaultPipelineBuckets(): CrmPipelineBuckets {
    return {
        waiting: [],
        qualified: [],
        proposal: [],
        negotiation: [],
        won: [],
        notInterested: [],
    };
}

export function defaultCrmState(): CrmStatePayload {
    return { salesCalls: [], pipeline: defaultPipelineBuckets() };
}

/** YYYY-MM from a date string or Date. */
export function periodMonthFromDate(raw: any): string {
    const s = String(raw || '').trim();
    if (!s) {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    const ymd = s.match(/^(\d{4})[-/.](\d{1,2})/);
    if (ymd) return `${ymd[1]}-${String(Number(ymd[2])).padStart(2, '0')}`;
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) {
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    }
    return periodMonthFromDate(null);
}

/** YYYY-MM from a date string; returns empty when input is blank (avoids defaulting to today). */
function safePeriodMonthFromDate(raw: any): string {
    const s = String(raw || '').trim();
    if (!s) return '';
    return periodMonthFromDate(s);
}

function findMovableCardsForAccountMonth(
    pipeline: CrmPipelineBuckets,
    accountId: string,
    periodMonth: string
): { card: any; stage: PipelineStageKey }[] {
    const aid = String(accountId || '').trim();
    const pm = String(periodMonth || '').trim();
    if (!aid || !pm) return [];
    const hits: { card: any; stage: PipelineStageKey }[] = [];
    for (const stage of PIPELINE_MOVABLE_STAGE_KEYS) {
        for (const c of pipeline[stage] || []) {
            if (String(c?.accountId || '') !== aid) continue;
            const cpm =
                String(c?.periodMonth || '').trim() ||
                safePeriodMonthFromDate(c?.lastContact || c?.date || c?.enteredFunnelAt || '');
            if (cpm === pm) hits.push({ card: c, stage });
        }
    }
    return hits;
}

function cardPeriodMonth(card: any, fallbackRaw?: string): string {
    return (
        String(card?.periodMonth || '').trim() ||
        safePeriodMonthFromDate(fallbackRaw || card?.lastContact || card?.date || card?.enteredFunnelAt || '')
    );
}

function salesCallFromLegacyLead(lead: any): any {
    const due =
        String(lead?.followUpDate || '').trim() ||
        String(lead?.dueDate || '').trim() ||
        String(lead?.date || '').trim() ||
        String(lead?.lastContact || '').trim();
    return {
        ...lead,
        dueDate: due,
        date: due || lead?.date,
        followUpRequired: !!lead?.followUpRequired,
        followUpDate: lead?.followUpDate || '',
        activityCompleted: lead?.activityCompleted ?? false,
    };
}

function pipelineCardFromLegacyLead(lead: any): any {
    const anchor =
        lead?.enteredFunnelAt || lead?.date || lead?.lastContact || lead?.callLoggedAt || new Date().toISOString();
    return {
        ...lead,
        periodMonth: lead?.periodMonth || periodMonthFromDate(anchor),
        sourceCallIds: Array.isArray(lead?.sourceCallIds) ? lead.sourceCallIds : [],
    };
}

/** Migrate legacy `leads` buckets into salesCalls + pipeline. */
export function migrateLegacyLeads(raw: Record<string, any[]> | null | undefined): CrmStatePayload {
    const state = defaultCrmState();
    if (!raw || typeof raw !== 'object') return state;

    const newCalls = Array.isArray(raw.new) ? raw.new : [];
    state.salesCalls = newCalls.map(salesCallFromLegacyLead);

    PIPELINE_STAGE_KEYS.forEach((key) => {
        const arr = Array.isArray(raw[key]) ? raw[key] : [];
        state.pipeline[key] = arr.map(pipelineCardFromLegacyLead);
    });

    return mirrorOrphanPipelineCardsToSalesCalls(state);
}

/** Build a hub sales-call record from a pipeline-only card (pre-split legacy data). */
function buildMirrorSalesCallFromPipelineCard(
    card: any,
    stage: PipelineStageKey,
    mirrorId: string,
    pipelineCardId: string
): any {
    const due =
        String(card?.dueDate || '').trim() ||
        String(card?.date || '').trim() ||
        String(card?.lastContact || '').trim() ||
        String(card?.enteredFunnelAt || '').trim() ||
        new Date().toISOString().slice(0, 10);
    const terminal = stage === 'won' || stage === 'notInterested';
    const logged = Boolean(card?.callLoggedAt || card?.activityCompleted);
    return salesCallFromLegacyLead({
        ...card,
        id: mirrorId,
        pipelineCardId,
        subject: String(card?.subject || card?.company || 'Sales call').trim() || 'Sales call',
        dueDate: due,
        date: due,
        lastContact: due,
        enteredFunnelAt: card?.enteredFunnelAt || due,
        activityCompleted: terminal || logged,
        followUpRequired: false,
        followUpDate: '',
        mirroredFromPipeline: true,
        hubPipelineStage: stage,
    });
}

/**
 * Ensure every pipeline card has a matching Activities hub sales call.
 * Legacy pipeline-only cards are mirrored into `salesCalls`; the pipeline card keeps
 * `sourceCallIds` pointing at the hub record so Report/Completed dedupe correctly.
 */
export function mirrorOrphanPipelineCardsToSalesCalls(state: CrmStatePayload): CrmStatePayload {
    const salesCalls = [...(state.salesCalls || [])];
    const hubIds = new Set(salesCalls.map((c) => String(c?.id || '').trim()).filter(Boolean));
    const hubByPipelineCardId = new Map<string, string>();
    for (const c of salesCalls) {
        const pid = String(c?.pipelineCardId || '').trim();
        if (pid) hubByPipelineCardId.set(pid, String(c.id));
    }

    const pipeline = clonePipeline(state.pipeline);
    const additions: any[] = [];
    let pipelineTouched = false;

    for (const stage of PIPELINE_STAGE_KEYS) {
        pipeline[stage] = (pipeline[stage] || []).map((card) => {
            const cardId = String(card?.id || '').trim();
            if (!cardId) return card;

            const sources = Array.isArray(card.sourceCallIds)
                ? card.sourceCallIds.map((s: any) => String(s || '').trim()).filter(Boolean)
                : [];
            const linkedHub =
                sources.find((sid: string) => hubIds.has(sid)) || hubByPipelineCardId.get(cardId);

            if (linkedHub) {
                const nextSources = Array.from(new Set([...sources, linkedHub]));
                if (nextSources.length !== sources.length || nextSources.some((s, i) => s !== sources[i])) {
                    pipelineTouched = true;
                    return { ...card, sourceCallIds: nextSources };
                }
                return card;
            }

            const mirrorId =
                cardId.startsWith('L') && !hubIds.has(cardId) ? cardId : `L-mirror-${cardId}`;
            if (hubIds.has(mirrorId)) return card;

            const mirror = buildMirrorSalesCallFromPipelineCard(card, stage, mirrorId, cardId);
            additions.push(mirror);
            hubIds.add(mirrorId);
            hubByPipelineCardId.set(cardId, mirrorId);
            pipelineTouched = true;

            return { ...card, sourceCallIds: Array.from(new Set([...sources, mirrorId])) };
        });
    }

    if (!additions.length && !pipelineTouched) return state;
    return { salesCalls: [...additions, ...salesCalls], pipeline };
}

export function mergeCrmStateFromApi(block: any): CrmStatePayload {
    if (!block || typeof block !== 'object') return defaultCrmState();

    if (Array.isArray(block.salesCalls) || (block.pipeline && typeof block.pipeline === 'object')) {
        const state = defaultCrmState();
        if (Array.isArray(block.salesCalls)) {
            state.salesCalls = block.salesCalls.map(salesCallFromLegacyLead);
        }
        if (block.pipeline && typeof block.pipeline === 'object') {
            PIPELINE_STAGE_KEYS.forEach((key) => {
                const arr = block.pipeline[key];
                if (Array.isArray(arr)) {
                    state.pipeline[key] = arr.map(pipelineCardFromLegacyLead);
                }
            });
        }
        if (block.leads && typeof block.leads === 'object') {
            const migrated = migrateLegacyLeads(block.leads);
            if (!state.salesCalls.length && migrated.salesCalls.length) {
                state.salesCalls = migrated.salesCalls;
            }
            PIPELINE_STAGE_KEYS.forEach((key) => {
                if (!state.pipeline[key].length && migrated.pipeline[key].length) {
                    state.pipeline[key] = migrated.pipeline[key];
                }
            });
        }
        return mirrorOrphanPipelineCardsToSalesCalls(state);
    }

    if (block.leads && typeof block.leads === 'object') {
        return migrateLegacyLeads(block.leads);
    }

    return defaultCrmState();
}

/** Flatten pipeline buckets with stage label. */
export function flattenPipeline(pipeline: CrmPipelineBuckets): any[] {
    const out: any[] = [];
    for (const stage of PIPELINE_STAGE_KEYS) {
        const arr = pipeline[stage] || [];
        for (const card of arr) {
            out.push({ ...card, stage });
        }
    }
    return out;
}

export function findPipelineCardStage(
    pipeline: CrmPipelineBuckets,
    cardId: string
): PipelineStageKey | null {
    for (const stage of PIPELINE_STAGE_KEYS) {
        if ((pipeline[stage] || []).some((c: any) => String(c?.id) === String(cardId))) return stage;
    }
    return null;
}

export function findPipelineCard(pipeline: CrmPipelineBuckets, cardId: string): any | null {
    for (const stage of PIPELINE_STAGE_KEYS) {
        const hit = (pipeline[stage] || []).find((c: any) => String(c?.id) === String(cardId));
        if (hit) return hit;
    }
    return null;
}

/** Find monthly pipeline card for account (accountId + periodMonth). */
export function findMonthlyPipelineCard(
    pipeline: CrmPipelineBuckets,
    accountId: string,
    periodMonth: string
): { card: any; stage: PipelineStageKey } | null {
    const aid = String(accountId || '').trim();
    const pm = String(periodMonth || '').trim();
    if (!aid || !pm) return null;
    for (const stage of PIPELINE_STAGE_KEYS) {
        const hit = (pipeline[stage] || []).find(
            (c: any) => String(c?.accountId || '') === aid && String(c?.periodMonth || '') === pm
        );
        if (hit) return { card: hit, stage };
    }
    return null;
}

export function movePipelineCard(
    pipeline: CrmPipelineBuckets,
    cardId: string,
    targetStage: PipelineStageKey
): CrmPipelineBuckets {
    const out = { ...pipeline } as CrmPipelineBuckets;
    let card: any = null;
    for (const stage of PIPELINE_STAGE_KEYS) {
        const arr = out[stage] || [];
        const idx = arr.findIndex((c: any) => String(c?.id) === String(cardId));
        if (idx >= 0) {
            card = arr[idx];
            out[stage] = arr.filter((_, i) => i !== idx);
            break;
        }
    }
    if (!card) return pipeline;
    out[targetStage] = [card, ...(out[targetStage] || [])];
    return out;
}

/**
 * Linked request status → account pipeline stage.
 * Keep in parity with backend/crm_recovery.py STAGE_FROM_REQUEST.
 */
export const STAGE_FROM_REQUEST: Record<string, PipelineStageKey> = {
    inquiry: 'waiting',
    draft: 'waiting',
    accepted: 'proposal',
    tentative: 'negotiation',
    definite: 'won',
    actual: 'won',
    cancelled: 'notInterested',
    lost: 'notInterested',
};

/**
 * Linked request status → account pipeline stage.
 * Unknown/unmapped status → null, meaning "leave the card in place" (the caller
 * `updatePipelineForLinkedRequest` only patches value, does not move the card).
 */
export function requestStatusToAccountPipelineStage(status: string): PipelineStageKey | null {
    const s = String(status || '').toLowerCase().trim();
    return STAGE_FROM_REQUEST[s] ?? null;
}

/** Legacy combined buckets for components still expecting crmLeads shape. */
export function crmStateToLegacyLeads(state: CrmStatePayload): Record<string, any[]> {
    return {
        new: state.salesCalls,
        ...state.pipeline,
    };
}

export function filterPipelineForProperty(
    pipeline: CrmPipelineBuckets,
    propertyId: string,
    accounts: any[]
): CrmPipelineBuckets {
    const pid = String(propertyId);
    const allowedAccountIds = new Set((accounts || []).map((a: any) => String(a.id)));
    const out = defaultPipelineBuckets();
    PIPELINE_STAGE_KEYS.forEach((key) => {
        out[key] = (pipeline[key] || [])
            .filter((c: any) => {
                const lp = c.propertyId != null && String(c.propertyId).trim() !== '' ? String(c.propertyId) : '';
                if (lp) return lp === pid;
                if (!c.accountId) return false;
                return allowedAccountIds.has(String(c.accountId));
            })
            .map((c: any) => (c.propertyId ? c : { ...c, propertyId: pid }));
    });
    return out;
}

export function filterSalesCallsForProperty(
    salesCalls: any[],
    propertyId: string,
    accounts: any[]
): any[] {
    const pid = String(propertyId);
    const allowedAccountIds = new Set((accounts || []).map((a: any) => String(a.id)));
    return salesCalls
        .filter((c: any) => {
            const lp = c.propertyId != null && String(c.propertyId).trim() !== '' ? String(c.propertyId) : '';
            if (lp) return lp === pid;
            if (!c.accountId) return false;
            return allowedAccountIds.has(String(c.accountId));
        })
        .map((c: any) => (c.propertyId ? c : { ...c, propertyId: pid }));
}

function clonePipeline(pipeline: CrmPipelineBuckets): CrmPipelineBuckets {
    const out = defaultPipelineBuckets();
    PIPELINE_STAGE_KEYS.forEach((k) => {
        out[k] = [...(pipeline[k] || [])];
    });
    return out;
}

/** Sync pipeline cards that already reference this request (status + revenue). */
export function updatePipelineForLinkedRequest(
    pipeline: CrmPipelineBuckets,
    request: any,
    computeRevenue: (req: any) => number
): CrmPipelineBuckets {
    const rid = String(request?.id || '').trim();
    if (!rid) return pipeline;

    let cardId: string | null = null;
    let fromStage: PipelineStageKey | null = null;
    for (const stage of PIPELINE_STAGE_KEYS) {
        const hit = (pipeline[stage] || []).find((c: any) => String(c?.linkedRequestId || '') === rid);
        if (hit) {
            cardId = String(hit.id);
            fromStage = stage;
            break;
        }
    }
    if (!cardId || !fromStage) return pipeline;

    const revenue = computeRevenue(request);
    const targetStage = requestStatusToAccountPipelineStage(String(request?.status || ''));
    const patch = (c: any) =>
        c.id === cardId
            ? {
                  ...c,
                  linkedRequestType: String(request?.requestType || c?.linkedRequestType || ''),
                  value: revenue,
                  linkedRequestRevenue: revenue,
              }
            : c;

    if (!targetStage || fromStage === targetStage) {
        const out = clonePipeline(pipeline);
        const stageKey = targetStage || fromStage;
        out[stageKey] = (out[stageKey] || []).map(patch);
        return out;
    }
    let out = movePipelineCard(pipeline, cardId, targetStage);
    out[targetStage] = (out[targetStage] || []).map(patch);
    return out;
}

/** Clear a deleted request from any linked pipeline card and zero its revenue. */
export function clearPipelineLinkForDeletedRequest(
    pipeline: CrmPipelineBuckets,
    requestId: string
): CrmPipelineBuckets {
    const rid = String(requestId || '').trim();
    if (!rid) return pipeline;
    const out = clonePipeline(pipeline);
    PIPELINE_STAGE_KEYS.forEach((stage) => {
        out[stage] = (out[stage] || []).map((c: any) => {
            if (String(c?.linkedRequestId || '') !== rid) return c;
            const next = { ...c };
            delete next.linkedRequestId;
            delete next.linkedRequestType;
            delete next.linkedRequestRevenue;
            next.value = 0;
            return next;
        });
    });
    return out;
}

/** Reconcile all linked pipeline cards against the current requests list. */
export function syncAllPipelineCardsFromRequests(
    pipeline: CrmPipelineBuckets,
    requests: any[],
    computeRevenue: (req: any) => number
): CrmPipelineBuckets {
    const byId = new Map<string, any>();
    for (const r of requests || []) {
        const id = String(r?.id || '').trim();
        if (id) byId.set(id, r);
    }

    const linkedIds = new Set<string>();
    PIPELINE_STAGE_KEYS.forEach((stage) => {
        (pipeline[stage] || []).forEach((c: any) => {
            const id = String(c?.linkedRequestId || '').trim();
            if (id) linkedIds.add(id);
        });
    });

    let out = pipeline;
    for (const id of linkedIds) {
        const req = byId.get(id);
        if (req) {
            out = updatePipelineForLinkedRequest(out, req, computeRevenue);
        } else {
            out = clearPipelineLinkForDeletedRequest(out, id);
        }
    }
    return out;
}

export type PipelineLinkExtras = {
    company?: string;
    contact?: string;
    tags?: string[];
    sourceCallIds?: string[];
    propertyId?: string;
    pipelineCardId?: string;
};

/** After CRM request wizard save: link request to monthly card and move to proposal. */
export function linkRequestToMonthlyPipelineCard(
    pipeline: CrmPipelineBuckets,
    accountId: string,
    periodMonth: string,
    request: any,
    computeRevenue: (req: any) => number,
    extras?: PipelineLinkExtras
): CrmPipelineBuckets {
    const aid = String(accountId || '').trim();
    const pm = String(periodMonth || '').trim();
    if (!aid || !pm || !request?.id) return pipeline;

    const revenue = computeRevenue(request);
    const existing = findMonthlyPipelineCard(pipeline, aid, pm);
    const cardId = String(extras?.pipelineCardId || existing?.card?.id || `P${Date.now()}`);
    const sourceIds = new Set<string>([
        ...(Array.isArray(existing?.card?.sourceCallIds) ? existing.card.sourceCallIds : []),
        ...(extras?.sourceCallIds || []),
    ]);

    const card = {
        ...(existing?.card || {}),
        id: cardId,
        accountId: aid,
        periodMonth: pm,
        company: extras?.company || existing?.card?.company || String(request?.account || request?.accountName || ''),
        contact: extras?.contact || existing?.card?.contact || String(request?.bookerName || ''),
        tags: extras?.tags?.length ? extras.tags : existing?.card?.tags || [],
        propertyId: extras?.propertyId || existing?.card?.propertyId || request?.propertyId,
        sourceCallIds: [...sourceIds],
        linkedRequestId: request.id,
        linkedRequestType: String(request?.requestType || ''),
        linkedRequestRevenue: revenue,
        value: revenue,
        probability: 50,
        lastContact: new Date().toISOString().slice(0, 10),
        enteredFunnelAt: existing?.card?.enteredFunnelAt || new Date().toISOString().slice(0, 10),
    };

    let out = clonePipeline(pipeline);
    PIPELINE_STAGE_KEYS.forEach((k) => {
        out[k] = (out[k] || []).filter((c: any) => String(c?.id) !== cardId);
    });
    out.proposal = [card, ...(out.proposal || [])];
    return out;
}

/** Set agreement template name on monthly pipeline card and move to proposal. */
export function linkAgreementTemplateToMonthlyPipelineCard(
    pipeline: CrmPipelineBuckets,
    accountId: string,
    periodMonth: string,
    templateName: string,
    extras?: PipelineLinkExtras
): CrmPipelineBuckets {
    const aid = String(accountId || '').trim();
    const pm = String(periodMonth || '').trim();
    const tpl = String(templateName || '').trim();
    if (!aid || !pm || !tpl) return pipeline;

    const existing = findMonthlyPipelineCard(pipeline, aid, pm);
    const cardId = String(extras?.pipelineCardId || existing?.card?.id || `P${Date.now()}`);
    const card = {
        ...(existing?.card || {}),
        id: cardId,
        accountId: aid,
        periodMonth: pm,
        company: extras?.company || existing?.card?.company || '',
        contact: extras?.contact || existing?.card?.contact || '',
        tags: extras?.tags || existing?.card?.tags || [],
        propertyId: extras?.propertyId || existing?.card?.propertyId,
        sourceCallIds: extras?.sourceCallIds || existing?.card?.sourceCallIds || [],
        linkedTemplateName: tpl,
        probability: 50,
        lastContact: new Date().toISOString().slice(0, 10),
        enteredFunnelAt: existing?.card?.enteredFunnelAt || new Date().toISOString().slice(0, 10),
    };

    let out = clonePipeline(pipeline);
    PIPELINE_STAGE_KEYS.forEach((k) => {
        out[k] = (out[k] || []).filter((c: any) => String(c?.id) !== cardId);
    });
    out.proposal = [card, ...(out.proposal || [])];
    return out;
}

function findPipelineCardForLogCall(
    pipeline: CrmPipelineBuckets,
    accountId: string,
    opts?: { pipelineCardId?: string; priorDueDate?: string; dueDate?: string }
): { card: any; stage: PipelineStageKey } | null {
    const aid = String(accountId || '').trim();
    const cardIdHint = String(opts?.pipelineCardId || '').trim();
    if (cardIdHint) {
        const stage = findPipelineCardStage(pipeline, cardIdHint);
        const card = findPipelineCard(pipeline, cardIdHint);
        if (stage && card) return { card, stage };
    }
    if (!aid) return null;

    const oldPm = safePeriodMonthFromDate(opts?.priorDueDate);
    if (oldPm) {
        const inOldMonth = findMovableCardsForAccountMonth(pipeline, aid, oldPm);
        if (inOldMonth.length === 1) return inOldMonth[0];
        if (inOldMonth.length > 1 && cardIdHint) {
            const hit = inOldMonth.find((h) => String(h.card?.id) === cardIdHint);
            if (hit) return hit;
        }
        if (inOldMonth.length > 0) return inOldMonth[0];
        const found = findMonthlyPipelineCard(pipeline, aid, oldPm);
        if (found && isMovablePipelineStage(found.stage)) return found;
    }

    const movableForAccount: { card: any; stage: PipelineStageKey }[] = [];
    for (const stage of PIPELINE_MOVABLE_STAGE_KEYS) {
        for (const c of pipeline[stage] || []) {
            if (String(c?.accountId || '') === aid) movableForAccount.push({ card: c, stage });
        }
    }
    if (movableForAccount.length === 1) return movableForAccount[0];

    const newPm = safePeriodMonthFromDate(opts?.dueDate);
    if (newPm) {
        const found = findMonthlyPipelineCard(pipeline, aid, newPm);
        if (found && isMovablePipelineStage(found.stage)) return found;
    }

    return null;
}

function resolvePipelineStageAfterLogCall(
    existingStage: PipelineStageKey | null,
    targetStage: PipelineStageKey
): PipelineStageKey {
    if (!existingStage) return targetStage;
    if (existingStage === 'won' || existingStage === 'notInterested') return existingStage;
    if (targetStage === 'notInterested' || targetStage === 'won') return targetStage;
    const rank: Record<PipelineStageKey, number> = {
        waiting: 0,
        qualified: 1,
        proposal: 2,
        negotiation: 3,
        won: 4,
        notInterested: 4,
    };
    return rank[existingStage] >= rank[targetStage] ? existingStage : targetStage;
}

/** Upsert pipeline card from a logged sales call (monthly key + interest routing). */
export function upsertPipelineCardFromLogCall(
    pipeline: CrmPipelineBuckets,
    lead: any,
    targetStage: PipelineStageKey | null,
    opts?: {
        nowIso?: string;
        sourceCallId?: string;
        dueDate?: string;
        pipelineCardId?: string;
        priorDueDate?: string;
    }
): { pipeline: CrmPipelineBuckets; cardId: string; periodMonth: string } {
    const accountId = String(lead?.accountId || '').trim();
    const due = String(
        opts?.dueDate || lead?.dueDate || lead?.date || lead?.lastContact || ''
    ).trim();
    const periodMonth = periodMonthFromDate(due || opts?.nowIso || new Date().toISOString());
    if (!accountId) {
        return { pipeline, cardId: '', periodMonth };
    }

    const located = findPipelineCardForLogCall(pipeline, accountId, {
        pipelineCardId: String(opts?.pipelineCardId || lead?.pipelineCardId || '').trim() || undefined,
        priorDueDate: opts?.priorDueDate,
        dueDate: due,
    });
    const existingStage = located?.stage ?? null;
    const existingCard = located?.card ?? null;

    if (existingStage && !isMovablePipelineStage(existingStage)) {
        return {
            pipeline,
            cardId: String(existingCard?.id || ''),
            periodMonth: String(existingCard?.periodMonth || periodMonth),
        };
    }

    if (!targetStage && !existingCard) {
        return { pipeline, cardId: '', periodMonth };
    }

    const finalStage = targetStage
        ? resolvePipelineStageAfterLogCall(existingStage, targetStage)
        : existingStage || 'waiting';

    const cardId = String(existingCard?.id || `P${Date.now()}`);
    const priorPm =
        cardPeriodMonth(existingCard || {}, opts?.priorDueDate) ||
        safePeriodMonthFromDate(opts?.priorDueDate);
    const monthChanged = Boolean(priorPm && periodMonth && priorPm !== periodMonth);

    const sourceIds = new Set<string>([
        ...(Array.isArray(existingCard?.sourceCallIds) ? existingCard.sourceCallIds : []),
    ]);
    if (opts?.sourceCallId) sourceIds.add(String(opts.sourceCallId));

    const dueYmd = due || new Date().toISOString().slice(0, 10);
    const card = {
        ...(existingCard || {}),
        id: cardId,
        accountId,
        periodMonth,
        subject: String(lead?.subject || existingCard?.subject || '').trim() || existingCard?.company || lead?.company || '',
        company: lead?.company || existingCard?.company || '',
        contact: lead?.contact || existingCard?.contact || '',
        description: lead?.description ?? existingCard?.description ?? '',
        callLogs: Array.isArray(lead?.callLogs) && lead.callLogs.length ? lead.callLogs : existingCard?.callLogs || [],
        nextStep: lead?.nextStep ?? existingCard?.nextStep ?? '',
        position: lead?.position || existingCard?.position,
        email: lead?.email || existingCard?.email,
        phone: lead?.phone || existingCard?.phone,
        city: lead?.city || existingCard?.city,
        country: lead?.country || existingCard?.country,
        tags: lead?.tags?.length ? lead.tags : existingCard?.tags || [],
        propertyId: lead?.propertyId || existingCard?.propertyId,
        value: existingCard?.value ?? lead?.value ?? 0,
        probability: existingCard?.probability,
        accountManager: lead?.accountManager || existingCard?.accountManager,
        ownerUserId: lead?.ownerUserId || existingCard?.ownerUserId,
        createdByUserId: lead?.createdByUserId || existingCard?.createdByUserId,
        sourceCallIds: [...sourceIds],
        lastContact: dueYmd,
        date: dueYmd,
        dueDate: dueYmd,
        enteredFunnelAt: monthChanged ? dueYmd : existingCard?.enteredFunnelAt || dueYmd,
        callLoggedAt: opts?.nowIso || existingCard?.callLoggedAt,
    };

    let out = clonePipeline(pipeline);
    if (monthChanged && priorPm) {
        PIPELINE_MOVABLE_STAGE_KEYS.forEach((k) => {
            out[k] = (out[k] || []).filter((c: any) => {
                if (String(c?.accountId || '') !== accountId) return true;
                const cpm = cardPeriodMonth(c);
                return cpm !== priorPm;
            });
        });
    } else {
        PIPELINE_STAGE_KEYS.forEach((k) => {
            out[k] = (out[k] || []).filter((c: any) => String(c?.id) !== cardId);
        });
    }
    out[finalStage] = [
        {
            ...card,
            probability:
                card.probability ??
                (finalStage === 'waiting' ? 10 : finalStage === 'qualified' ? 25 : 50),
        },
        ...(out[finalStage] || []),
    ];
    return { pipeline: out, cardId, periodMonth };
}
