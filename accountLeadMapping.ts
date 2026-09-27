/** Full name for display and CRM lead fields (supports legacy `name` only). */
export function contactDisplayName(c: any): string {
    const fromParts = [c?.firstName, c?.lastName]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
    if (fromParts) return fromParts;
    return String(c?.name || '').trim();
}

/** Stored contact primary key for a browser id such as ``C{timestamp}``. */
export function persistedContactId(contacts: Array<{ id?: unknown }> | undefined, rawId: string): string {
    const id = String(rawId || '').trim();
    if (!id) return '';
    const list = Array.isArray(contacts) ? contacts : [];
    for (const c of list) {
        const cid = String(c?.id || '').trim();
        if (cid === id || cid.endsWith(`:${id}`)) return cid;
    }
    return id;
}

function withContactName(c: any) {
    return { ...c, name: contactDisplayName(c) };
}

/** Display name of the user who created the account (stored or inferred from first "Account created" activity). */
export function resolveAccountOwnerName(account: any): string {
    const direct = String(account?.accountOwnerName || account?.createdByName || '').trim();
    if (direct) return direct;
    const acts = Array.isArray(account?.activities) ? account.activities : [];
    const created = acts.find((a: any) => String(a?.title || '').trim() === 'Account created');
    if (created?.user) return String(created.user).trim();
    return '';
}

/** Map stored account records to the CRM profile "lead" shape. */
export function accountToLead(account: any): any {
    const c0raw = (account.contacts && account.contacts[0]) || {};
    const contacts = account.contacts?.length
        ? account.contacts.map(withContactName)
        : [withContactName({
            firstName: '',
            lastName: '',
            name: c0raw.name || '',
            position: c0raw.position || '',
            email: c0raw.email || '',
            phone: c0raw.phone || '',
            city: c0raw.city,
            country: c0raw.country
        })];
    const c0 = contacts[0];
    return {
        id: account.id,
        accountId: account.id,
        company: account.name || '',
        clientTaxId: account.clientTaxId ?? account.taxId ?? '',
        contact: contactDisplayName(c0),
        position: c0.position || '',
        email: c0.email || '',
        phone: c0.phone || '',
        city: account.city || c0.city || '',
        country: account.country || c0.country || '',
        street: account.street,
        website: account.website,
        notes: account.notes,
        tags: Array.isArray(account.tags) && account.tags.length
            ? account.tags
            : (account.type ? [account.type] : ['Corporate']),
        contacts,
        activities: Array.isArray(account.activities) ? account.activities : [],
        profileAuditLog: Array.isArray(account.profileAuditLog) ? account.profileAuditLog : [],
        winRate: account.winRate ?? 0,
        totalSpend: account.totalSpend ?? 0,
        totalRequests: account.totalRequests ?? 0,
        accountOwnerName: resolveAccountOwnerName(account),
        createdByUserId: account.createdByUserId,
    };
}

/**
 * When opening the account profile from a CRM card, keep pipeline fields on the lead
 * but use the saved account for tags, contacts, activities, and audit log (fixes tag drift).
 */
export function mergeAccountIntoCrmLead(account: any, crmLead: any) {
    const base = accountToLead(account);
    return {
        ...base,
        id: crmLead.id,
        subject: crmLead.subject,
        value: crmLead.value ?? 0,
        probability: crmLead.probability ?? 0,
        lastContact: crmLead.lastContact,
        description: crmLead.description,
        nextStep: crmLead.nextStep,
        followUpDate: crmLead.followUpDate,
        accountManager: crmLead.accountManager,
        tags: base.tags,
        contacts: base.contacts,
        company: base.company,
        city: base.city || crmLead.city,
        country: base.country || crmLead.country,
        activities: base.activities?.length ? base.activities : crmLead.activities || [],
        profileAuditLog: base.profileAuditLog || [],
        accountId: account.id
    };
}

/** Merge profile edits back into an account row. */
export function leadToAccount(lead: any, existing: any = {}): any {
    const aid = lead.accountId || lead.id;
    const tagList = Array.isArray(lead.tags) ? lead.tags : existing.tags;
    return {
        ...existing,
        id: aid,
        name: lead.company,
        accountOwnerName: lead.accountOwnerName ?? existing.accountOwnerName,
        createdByUserId: lead.createdByUserId ?? existing.createdByUserId,
        clientTaxId: lead.clientTaxId ?? existing.clientTaxId ?? '',
        type: (lead.tags && lead.tags[0]) || existing.type || 'Corporate',
        tags: tagList && tagList.length ? tagList : existing.tags,
        city: lead.city,
        country: lead.country,
        street: lead.street ?? existing.street,
        website: lead.website ?? existing.website,
        notes: lead.notes ?? existing.notes,
        activities: lead.activities ?? existing.activities ?? [],
        profileAuditLog: lead.profileAuditLog ?? existing.profileAuditLog ?? [],
        contacts: lead.contacts?.length
            ? lead.contacts.map((c: any) => ({
                ...c,
                name: contactDisplayName(c)
            }))
            : [withContactName({
                name: lead.contact,
                firstName: '',
                lastName: '',
                position: lead.position,
                email: lead.email,
                phone: lead.phone,
                city: lead.city,
                country: lead.country
            })],
        winRate: lead.winRate ?? existing.winRate ?? 0,
        totalSpend: lead.totalSpend ?? existing.totalSpend ?? 0,
        totalRequests: lead.totalRequests ?? existing.totalRequests ?? 0
    };
}
