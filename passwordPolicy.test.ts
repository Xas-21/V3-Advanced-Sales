import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy } from './passwordPolicy';

describe('checkPasswordPolicy', () => {
    it('rejects short passwords', () => {
        expect(checkPasswordPolicy('Ab1!xx').ok).toBe(false);
    });

    it('rejects weak category mix', () => {
        expect(checkPasswordPolicy('abcdefgh').ok).toBe(false);
    });

    it('accepts an 8+ char strong password', () => {
        expect(checkPasswordPolicy('Reset@1a').ok).toBe(true);
    });
});
