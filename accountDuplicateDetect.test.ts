import { describe, expect, it } from 'vitest';
import { buildSystemDuplicateItems } from './accountDuplicateUtils';

describe('buildSystemDuplicateItems', () => {
    it('detects same-name duplicates', () => {
        const accounts = [
            { id: 'A1', name: 'Acme Corp', contacts: [] },
            { id: 'A2', name: 'ACME CORP', contacts: [] },
            { id: 'A3', name: 'Other', contacts: [] },
        ];
        const items = buildSystemDuplicateItems(accounts);
        const namePairs = items.filter((x) => x.reason === 'same-name');
        expect(namePairs).toHaveLength(1);
        expect(namePairs[0].baseAccountId).toBe('A1');
        expect(namePairs[0].candidateAccountId).toBe('A2');
    });

    it('detects shared contact email via index (not full pairwise scan)', () => {
        const accounts = [
            { id: 'A1', name: 'One', contacts: [{ email: 'shared@example.com', phone: '0501111111' }] },
            { id: 'A2', name: 'Two', contacts: [{ email: 'shared@example.com', phone: '0502222222' }] },
            { id: 'A3', name: 'Three', contacts: [{ email: 'unique@example.com', phone: '0503333333' }] },
        ];
        const items = buildSystemDuplicateItems(accounts);
        const emailPairs = items.filter((x) => String(x.reason).startsWith('same-contact-email:'));
        expect(emailPairs).toHaveLength(1);
        expect(emailPairs[0].reason).toContain('shared@example.com');
        expect(new Set([emailPairs[0].baseAccountId, emailPairs[0].candidateAccountId])).toEqual(
            new Set(['A1', 'A2'])
        );
        expect(items.some((x) => x.baseAccountId === 'A3' || x.candidateAccountId === 'A3')).toBe(false);
    });

    it('prefers email over phone for the same account pair', () => {
        const accounts = [
            {
                id: 'A1',
                name: 'One',
                contacts: [{ email: 'both@example.com', phone: '0509999999' }],
            },
            {
                id: 'A2',
                name: 'Two',
                contacts: [{ email: 'both@example.com', phone: '0509999999' }],
            },
        ];
        const items = buildSystemDuplicateItems(accounts).filter(
            (x) => x.source === 'system-detection' && x.reason !== 'same-name'
        );
        expect(items).toHaveLength(1);
        expect(items[0].reason.startsWith('same-contact-email:')).toBe(true);
    });
});
