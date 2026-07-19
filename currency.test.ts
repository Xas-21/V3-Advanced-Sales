import { describe, expect, it } from 'vitest';
import {
    SAR_PER_CURRENCY,
    convertCurrencyToSar,
    convertSarToCurrency,
    formatCurrencyAmount,
    getCurrencySymbol,
    resolveCurrencyCode,
} from './currency';

/** Intl currency style uses NBSP between code and amount on this runtime. */
const nbsp = '\u00a0';

describe('resolveCurrencyCode', () => {
    it('accepts known codes case-insensitively', () => {
        expect(resolveCurrencyCode('SAR')).toBe('SAR');
        expect(resolveCurrencyCode('usd')).toBe('USD');
        expect(resolveCurrencyCode('EUR')).toBe('EUR');
    });

    it('falls back to SAR for unknown / empty / nullish', () => {
        expect(resolveCurrencyCode('XYZ')).toBe('SAR');
        expect(resolveCurrencyCode('')).toBe('SAR');
        expect(resolveCurrencyCode(null)).toBe('SAR');
        expect(resolveCurrencyCode(undefined)).toBe('SAR');
    });
});

describe('convertSarToCurrency / convertCurrencyToSar', () => {
    it('converts with SAR_PER_CURRENCY rates', () => {
        expect(SAR_PER_CURRENCY).toEqual({ SAR: 1, USD: 3.75, EUR: 4.05 });
        expect(convertSarToCurrency(375, 'USD')).toBe(100);
        expect(convertCurrencyToSar(100, 'USD')).toBe(375);
        expect(convertSarToCurrency(100, 'SAR')).toBe(100);
    });

    it('returns 0 for non-finite amounts', () => {
        expect(convertSarToCurrency(Number.NaN, 'SAR')).toBe(0);
        expect(convertCurrencyToSar(Number.POSITIVE_INFINITY, 'USD')).toBe(0);
    });
});

describe('formatCurrencyAmount', () => {
    it('formats a normal SAR amount', () => {
        expect(formatCurrencyAmount(1234.5, 'SAR')).toBe(`SAR${nbsp}1,234.50`);
    });

    it('formats zero', () => {
        expect(formatCurrencyAmount(0, 'SAR')).toBe(`SAR${nbsp}0.00`);
    });

    it('formats a negative amount', () => {
        expect(formatCurrencyAmount(-50, 'SAR')).toBe(`-SAR${nbsp}50.00`);
    });

    it('formats a large value with thousands separators', () => {
        expect(formatCurrencyAmount(1_234_567.89, 'SAR')).toBe(`SAR${nbsp}1,234,567.89`);
    });

    it('converts SAR input then formats in target currency', () => {
        expect(formatCurrencyAmount(375, 'USD')).toBe('$100.00');
    });

    it('uses SAR formatting when currency code is unknown (via resolve)', () => {
        // resolveCurrencyCode coerces unknown → SAR before format
        expect(formatCurrencyAmount(10, 'XYZ' as any)).toBe(`SAR${nbsp}10.00`);
    });
});

describe('getCurrencySymbol', () => {
    it('returns a non-empty symbol/code for SAR', () => {
        expect(getCurrencySymbol('SAR')).toBe('SAR');
    });
});
