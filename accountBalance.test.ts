import { describe, it, expect } from 'vitest';
import { computeBalance, requestOwed, outstandingTotal, applicableFromBalance, type LedgerEntry } from './accountBalance';

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
});
