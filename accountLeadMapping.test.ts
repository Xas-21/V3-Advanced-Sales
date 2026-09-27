import { describe, expect, it } from 'vitest';
import { persistedContactId } from './accountLeadMapping';

describe('persistedContactId', () => {
    it('maps a browser contact id onto the stored primary key', () => {
        const stored = 'A9:contact:2:C1790500461184';
        expect(persistedContactId([{ id: stored }], 'C1790500461184')).toBe(stored);
        expect(persistedContactId([{ id: stored }], stored)).toBe(stored);
        expect(persistedContactId([{ id: stored }], 'C999')).toBe('C999');
    });
});
