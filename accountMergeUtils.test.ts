import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    applyAccountMergeInMemory,
    persistAccountMergeToBackend,
    repointCrmLeadsForAccountMerge,
} from './accountMergeUtils';

describe('account merge CRM + requests', () => {
    it('repoints sales calls in legacy new bucket and requests by accountId', () => {
        const accounts = [
            { id: 'dest', name: 'Acme', propertyId: 'p1', contacts: [{ email: 'a@x.com', firstName: 'A' }] },
            {
                id: 'src',
                name: 'Acme Dup',
                propertyId: 'p1',
                contacts: [{ email: 'b@x.com', firstName: 'B' }],
            },
        ];
        const sharedRequests = [
            { id: 'r1', accountId: 'src', account: 'Acme Dup', accountName: 'Acme Dup' },
            { id: 'r2', accountId: 'dest', account: 'Acme', accountName: 'Acme' },
        ];
        const crmLeads = {
            new: [{ id: 'c1', accountId: 'src', company: 'Acme Dup', subject: 'Call' }],
            waiting: [{ id: 'l1', accountId: 'src', company: 'Acme Dup' }],
            qualified: [],
            proposal: [],
            negotiation: [],
            won: [],
            notInterested: [],
        };

        const applied = applyAccountMergeInMemory({
            accounts,
            sharedRequests,
            crmLeads,
            destAccountId: 'dest',
            sourceAccountId: 'src',
        });
        expect(applied).not.toBeNull();
        expect(applied!.nextAccounts.map((a) => a.id)).toEqual(['dest']);
        expect(applied!.nextAccounts[0].contacts.length).toBe(2);
        expect(applied!.nextRequests.find((r) => r.id === 'r1')).toMatchObject({
            accountId: 'dest',
            account: 'Acme',
            accountName: 'Acme',
        });
        expect(applied!.nextCrmLeads.new[0]).toMatchObject({
            accountId: 'dest',
            company: 'Acme',
        });
        expect(applied!.nextCrmLeads.waiting[0]).toMatchObject({
            accountId: 'dest',
            company: 'Acme',
        });
    });

    it('persistAccountMergeToBackend POSTs salesCalls + pipeline from nextCrmLeads', async () => {
        const posts: { url: string; body: any }[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                const u = String(url);
                if (init?.method === 'POST' || init?.method === 'PUT') {
                    posts.push({ url: u, body: JSON.parse(String(init.body || '{}')) });
                }
                if (u.includes('/api/account-rates')) {
                    return { ok: true, status: 200, json: async () => [], text: async () => '' };
                }
                return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
            })
        );

        const nextCrmLeads = repointCrmLeadsForAccountMerge(
            {
                new: [{ id: 'c1', accountId: 'src', company: 'Old' }],
                waiting: [{ id: 'l1', accountId: 'src', company: 'Old' }],
                qualified: [],
                proposal: [],
                negotiation: [],
                won: [],
                notInterested: [],
            },
            'src',
            'Old',
            'dest',
            'New'
        );

        await persistAccountMergeToBackend({
            mergedAccount: { id: 'dest', name: 'New', propertyId: 'p1' },
            sourceAccountId: 'src',
            sourceAccountName: 'Old',
            nextRequests: [{ id: 'r1', accountId: 'dest', account: 'New', accountName: 'New' }],
            previousRequests: [{ id: 'r1', accountId: 'src', account: 'Old', accountName: 'Old' }],
            nextCrmLeads,
            propertyId: 'p1',
        });

        const crmPost = posts.find((p) => p.url.includes('/api/crm-state'));
        expect(crmPost).toBeTruthy();
        expect(crmPost!.body.leads).toBeUndefined();
        expect(Array.isArray(crmPost!.body.salesCalls)).toBe(true);
        expect(crmPost!.body.salesCalls[0]).toMatchObject({ accountId: 'dest', company: 'New' });
        expect(crmPost!.body.pipeline.waiting[0]).toMatchObject({ accountId: 'dest', company: 'New' });
    });
});
