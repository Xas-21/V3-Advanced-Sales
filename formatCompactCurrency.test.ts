import { describe, expect, it } from 'vitest';
import {
    coerceMoneyNumber,
    formatCompactAmount,
    formatCompactCurrency,
    formatCompactSar,
} from './formatCompactCurrency';

describe('coerceMoneyNumber', () => {
    it('parses comma-separated strings and finite numbers', () => {
        expect(coerceMoneyNumber(1234.5)).toBe(1234.5);
        expect(coerceMoneyNumber('1,234.5')).toBe(1234.5);
    });

    it('returns 0 for non-numeric input', () => {
        expect(coerceMoneyNumber('x')).toBe(0);
        expect(coerceMoneyNumber(undefined)).toBe(0);
    });
});

describe('formatCompactAmount', () => {
    it('returns 0 / plain / K / M bands', () => {
        expect(formatCompactAmount(0)).toBe('0');
        expect(formatCompactAmount(500)).toBe('500');
        expect(formatCompactAmount(1500)).toBe('1.5K');
        expect(formatCompactAmount(1_000_000)).toBe('1.00M');
        expect(formatCompactAmount(2_560_000)).toBe('2.56M');
        expect(formatCompactAmount(-1500)).toBe('-1.5K');
    });

    it('promotes top-of-K band rounding into millions', () => {
        // 999_999 / 1000 rounds to 1000K; promote to M instead of emitting an out-of-band K label
        expect(formatCompactAmount(999_999)).toBe('1.00M');
    });
});

describe('formatCompactSar / formatCompactCurrency', () => {
    it('prefixes SAR and handles zero', () => {
        expect(formatCompactSar(0)).toBe('SAR 0');
        expect(formatCompactSar(1500)).toBe('SAR 1.5K');
        expect(formatCompactCurrency(0, 'SAR')).toBe('SAR 0');
        expect(formatCompactCurrency(500, 'SAR')).toBe('SAR 500');
        expect(formatCompactCurrency(1500, 'SAR')).toBe('SAR 1.5K');
        expect(formatCompactCurrency(1_000_000, 'SAR')).toBe('SAR 1.00M');
        expect(formatCompactCurrency(2_560_000, 'SAR')).toBe('SAR 2.56M');
        expect(formatCompactCurrency(-1500, 'SAR')).toBe('SAR -1.5K');
    });

    it('converts SAR source into target currency before compacting', () => {
        expect(formatCompactCurrency(375, 'USD')).toBe('USD 100');
    });

    it('falls back to SAR label for unknown currency code', () => {
        expect(formatCompactCurrency(100, 'XYZ' as any)).toBe('SAR 100');
    });
});
