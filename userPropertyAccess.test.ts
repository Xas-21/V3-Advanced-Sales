import { describe, expect, it } from 'vitest';
import { nextUserPropertyAccess, userCanAccessProperty } from './userPropertyAccess';

describe('nextUserPropertyAccess', () => {
    it('adds a second property without removing the first', () => {
        const next = nextUserPropertyAccess(
            { propertyId: 'P-A', property_ids: ['P-A'] },
            'P-B',
            true,
        );
        expect(next.assignedPropertyIds).toEqual(['P-A', 'P-B']);
        expect(next.propertyId).toBe('P-A');
    });

    it('keeps an existing multi-property set when re-assigning one of them', () => {
        const next = nextUserPropertyAccess(
            { propertyId: 'P-A', property_ids: ['P-A', 'P-B'] },
            'P-B',
            true,
        );
        expect(next.assignedPropertyIds).toEqual(['P-A', 'P-B']);
        expect(next.propertyId).toBe('P-A');
    });

    it('revokes only the selected property from a cluster assignment', () => {
        const next = nextUserPropertyAccess(
            { propertyId: 'P-A', property_ids: ['P-A', 'P-B'] },
            'P-B',
            false,
        );
        expect(next.assignedPropertyIds).toEqual(['P-A']);
        expect(next.propertyId).toBe('P-A');
    });

    it('moves primary when the primary property is revoked', () => {
        const next = nextUserPropertyAccess(
            { propertyId: 'P-A', property_ids: ['P-A', 'P-B'] },
            'P-A',
            false,
        );
        expect(next.assignedPropertyIds).toEqual(['P-B']);
        expect(next.propertyId).toBe('P-B');
    });
});

describe('userCanAccessProperty', () => {
    it('allows non-admins via property_ids even when primary differs', () => {
        const user = { id: 'U1', propertyId: 'P-A', property_ids: ['P-A', 'P-B'] };
        expect(userCanAccessProperty(user, { id: 'P-B', assignedUserIds: [] })).toBe(true);
        expect(userCanAccessProperty(user, { id: 'P-C', assignedUserIds: [] })).toBe(false);
    });

    it('allows admins for any property', () => {
        expect(userCanAccessProperty({ id: 'U1', isAdmin: true }, { id: 'P-Z' })).toBe(true);
    });
});
