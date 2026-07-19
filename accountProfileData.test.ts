import { describe, expect, it, vi } from 'vitest';
import {
    buildRequestStatsByAccount,
    filterRequestsForAccount,
} from './accountProfileData';

vi.mock('./operationalSegmentRevenue', () => ({
    computeRequestRevenueBreakdownNoTax: (r: any) => ({
        totalLineNoTax: Number(r?.mockRev ?? 0),
    }),
}));

describe('buildRequestStatsByAccount', () => {
    const accounts = [
        { id: 'A1', name: 'Acme Corp' },
        { id: 'A2', name: 'Beta LLC' },
        { id: 'A3', name: 'Acme Corp' }, // same name as A1
    ];

    it('matches by account id and sums multiple requests', () => {
        const requests = [
            { id: 'R1', accountId: 'A1', mockRev: 100 },
            { id: 'R2', accountId: 'A1', mockRev: 50 },
            { id: 'R3', accountId: 'A2', mockRev: 20 },
        ];
        const stats = buildRequestStatsByAccount(accounts, requests);
        expect(stats.get('A1')).toEqual({ revSar: 150, reqCount: 2 });
        expect(stats.get('A2')).toEqual({ revSar: 20, reqCount: 1 });
        expect(stats.get('A3')).toEqual({ revSar: 0, reqCount: 0 });
    });

    it('matches by account name when id missing', () => {
        const requests = [{ id: 'R4', account: 'Beta LLC', mockRev: 40 }];
        const stats = buildRequestStatsByAccount(accounts, requests);
        expect(stats.get('A2')).toEqual({ revSar: 40, reqCount: 1 });
        expect(stats.get('A1')?.reqCount).toBe(0);
    });

    it('attributes name match to all accounts with that name', () => {
        const requests = [{ id: 'R5', accountName: 'Acme Corp', mockRev: 10 }];
        const stats = buildRequestStatsByAccount(accounts, requests);
        expect(stats.get('A1')).toEqual({ revSar: 10, reqCount: 1 });
        expect(stats.get('A3')).toEqual({ revSar: 10, reqCount: 1 });
    });

    it('ignores unmatched requests', () => {
        const requests = [{ id: 'R6', accountId: 'NOPE', account: 'Unknown', mockRev: 99 }];
        const stats = buildRequestStatsByAccount(accounts, requests);
        expect(stats.get('A1')?.reqCount).toBe(0);
        expect(stats.get('A2')?.reqCount).toBe(0);
    });

    it('matches legacy filterRequestsForAccount counts', () => {
        const requests = [
            { id: 'R1', accountId: 'A1', mockRev: 100 },
            { id: 'R2', account: 'Beta LLC', mockRev: 25 },
            { id: 'R3', accountName: 'Acme Corp', mockRev: 5 },
            { id: 'R4', accountId: 'GHOST', mockRev: 1 },
        ];
        const stats = buildRequestStatsByAccount(accounts, requests);
        for (const a of accounts) {
            const legacy = filterRequestsForAccount(requests, a.id, a.name);
            const legacyRev = legacy.reduce((s, r) => s + Number(r.mockRev || 0), 0);
            expect(stats.get(a.id)).toEqual({ revSar: legacyRev, reqCount: legacy.length });
        }
    });
});
