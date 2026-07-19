import { type CurrencyCode, convertSarToCurrency, resolveCurrencyCode } from './currency';

/**
 * Compact money display: no K/M below 1,000; K for [1,000 .. 999,999]; M from 1,000,000.
 * Millions use up to three significant figures (e.g. SAR 2.56M, SAR 2.00M) for dashboard readability.
 */

export function coerceMoneyNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const n = parseFloat(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
}

function formatScaledUnit(unit: number): string {
    const r1 = Math.round(unit * 10) / 10;
    if (Math.abs(r1 - Math.round(r1)) < 1e-6) {
        return String(Math.round(r1));
    }
    return r1.toFixed(1).replace(/\.0$/, '');
}

/** Mantissa for millions: always up to 3 significant figures (e.g. "2.00", "2.56", "12.3", "256"). */
function formatMillionMantissa(unit: number): string {
    const x = Math.abs(unit);
    if (x === 0) return '0';
    if (x >= 1000) {
        return x % 1 === 0 ? String(Math.round(x)) : x.toFixed(1);
    }
    const str = x.toPrecision(3);
    if (str.includes('e') || str.includes('E')) {
        return x >= 100 ? String(Math.round(x)) : x.toFixed(2);
    }
    return str;
}

/** Number + optional K/M only (e.g. "0", "500", "1.5K", "2.56M"). */
export function formatCompactAmount(value: number): string {
    const v = coerceMoneyNumber(value);
    if (v === 0) return '0';
    const neg = v < 0;
    const n = Math.abs(v);
    const sign = neg ? '-' : '';
    if (n < 1000) {
        return `${sign}${Math.round(n)}`;
    }
    if (n < 1_000_000) {
        const kLabel = formatScaledUnit(n / 1000);
        // Rounding can push 999_999 → "1000K"; promote to M so the label stays in-band.
        if (Number(kLabel) >= 1000) {
            return `${sign}${formatMillionMantissa(n / 1_000_000)}M`;
        }
        return `${sign}${kLabel}K`;
    }
    return `${sign}${formatMillionMantissa(n / 1_000_000)}M`;
}

/** Same rules with "SAR " prefix; zero → "SAR 0". */
export function formatCompactSar(value: number): string {
    const v = coerceMoneyNumber(value);
    if (v === 0) return 'SAR 0';
    return `SAR ${formatCompactAmount(v)}`;
}

/** Same compact rules in any target currency (source values remain SAR). */
export function formatCompactCurrency(valueSar: number, currency: CurrencyCode): string {
    const code = resolveCurrencyCode(currency);
    const converted = convertSarToCurrency(coerceMoneyNumber(valueSar), code);
    if (converted === 0) return `${code} 0`;
    return `${code} ${formatCompactAmount(converted)}`;
}
