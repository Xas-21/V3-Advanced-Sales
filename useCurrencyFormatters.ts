import { useMemo } from 'react';
import {
    formatCurrencyAmount as formatCurrencyAmountHelper,
    resolveCurrencyCode,
    type CurrencyCode,
} from './currency';
import { formatCompactCurrency } from './formatCompactCurrency';

export type CurrencyFormatters = {
    selectedCurrency: CurrencyCode;
    formatMoneyCompact: (amountSar: number) => string;
    formatCurrencyAmount: (amountSar: number, maxFractionDigits?: number) => string;
};

/** Shared currency display helpers — same wrappers previously inlined across views. */
export function useCurrencyFormatters(currency: unknown): CurrencyFormatters {
    return useMemo(() => {
        const selectedCurrency = resolveCurrencyCode(currency);
        const formatMoneyCompact = (amountSar: number) =>
            formatCompactCurrency(amountSar, selectedCurrency);
        const formatCurrencyAmount = (amountSar: number, maxFractionDigits = 2) =>
            formatCurrencyAmountHelper(amountSar, selectedCurrency, {
                maximumFractionDigits: maxFractionDigits,
            });
        return { selectedCurrency, formatMoneyCompact, formatCurrencyAmount };
    }, [currency]);
}
