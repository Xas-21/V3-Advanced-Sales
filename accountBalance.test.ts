import { describe, it, expect } from 'vitest';
import {
  computeBalance,
  requestOwed,
  outstandingTotal,
  applicableFromBalance,
  requestHasOpenCl,
  isClPaymentMethod,
  clampSplitAmount,
  type LedgerEntry,
} from './accountBalance';

const e = (over: Partial<LedgerEntry>): LedgerEntry =>
  ({ id: Math.random().toString(36), accountId: 'A1', type: 'deposit', amount: 0, ...over } as LedgerEntry);

describe('accountBalance', () => {
  it('worked example from spec §6', () => {
    const entries: LedgerEntry[] = [
      e({ type: 'deposit', amount: 50000 }),
      e({ type: 'allocation', amount: -30000, requestId: 'R1' }),
      e({ type: 'cl_charge', amount: -25000, requestId: 'R2' }),
    ];
    expect(computeBalance(entries)).toBe(-5000);         // 50000 - 30000 - 25000
    expect(outstandingTotal(entries)).toBe(5000);        // -min(balance,0)
    expect(requestOwed(entries, 'R2', 25000)).toBe(5000); // R2 only covered by 20000 leftover
    entries.push(e({ type: 'collection', amount: 5000 }));
    expect(computeBalance(entries)).toBe(0);
    expect(outstandingTotal(entries)).toBe(0);
  });

  it('applicableFromBalance caps at available and request due', () => {
    expect(applicableFromBalance(20000, 30000)).toBe(20000); // balance limited
    expect(applicableFromBalance(50000, 30000)).toBe(30000); // request limited
    expect(applicableFromBalance(-5000, 30000)).toBe(0);     // no positive balance
  });

  it('requestHasOpenCl clears when account deposit zeros outstanding', () => {
    const entries: LedgerEntry[] = [
      e({ type: 'cl_charge', amount: -25000, requestId: 'R2' }),
    ];
    expect(requestHasOpenCl(entries, 'R2', 25000)).toBe(true);
    entries.push(e({ type: 'deposit', amount: 25000 }));
    expect(requestHasOpenCl(entries, 'R2', 25000)).toBe(false);
    expect(isClPaymentMethod('CL')).toBe(true);
    expect(isClPaymentMethod('Cash')).toBe(false);
  });

  it('clampSplitAmount requires a strict remainder on the original entry', () => {
    expect(clampSplitAmount(-30000, 10000)).toBe(10000);
    expect(clampSplitAmount(50000, 20000)).toBe(20000);
    expect(clampSplitAmount(-30000, 30000)).toBe(0); // cannot take whole
    expect(clampSplitAmount(-30000, 0)).toBe(0);
    expect(clampSplitAmount(-30000, 40000)).toBe(0);
  });

  it('deposit − allocation + collection − refund pins current balance total', () => {
    // Frontend ledger rows already carry signed amounts (backend normalizes on write).
    const entries: LedgerEntry[] = [
      e({ type: 'deposit', amount: 10000 }),
      e({ type: 'allocation', amount: -4000, requestId: 'R1' }),
      e({ type: 'collection', amount: 2500 }),
      e({ type: 'refund', amount: -1500 }),
    ];
    // 10000 - 4000 + 2500 - 1500 = 7000
    expect(computeBalance(entries)).toBe(7000);
  });
});
