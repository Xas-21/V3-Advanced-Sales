import { describe, it, expect } from 'vitest';
import {
  attachLedgerId,
  findPaymentForLedger,
  withRefundPayment,
  removeOrReduceBalancePayment,
  recomputePaymentStatus,
  type SyncPayment,
} from './accountPaymentSync';

const pay = (over: Partial<SyncPayment>): SyncPayment =>
  ({ id: 'p1', amount: 1000, method: 'Balance', ...over });

describe('accountPaymentSync pure helpers', () => {
  it('attachLedgerId stores ledgerEntryId on the payment', () => {
    const p = pay({ id: 1, amount: 500 });
    expect(attachLedgerId(p, 'led-9')).toEqual({ ...p, ledgerEntryId: 'led-9' });
    expect(p.ledgerEntryId).toBeUndefined();
  });

  it('findPaymentForLedger prefers ledgerEntryId, then amount+method fallback', () => {
    const payments: SyncPayment[] = [
      pay({ id: 'a', amount: 3000, method: 'Balance', ledgerEntryId: 'L1' }),
      pay({ id: 'b', amount: 2000, method: 'Balance' }),
      pay({ id: 'c', amount: 2000, method: 'Cash' }),
    ];
    expect(findPaymentForLedger(payments, 'L1')?.id).toBe('a');
    expect(findPaymentForLedger(payments, 'missing', { amount: 2000, method: 'Balance' })?.id).toBe('b');
    expect(findPaymentForLedger(payments, 'missing', { amount: 2000, method: 'Cash' })?.id).toBe('c');
    expect(findPaymentForLedger(payments, 'missing')).toBeUndefined();
  });

  it('withRefundPayment appends a negative Balance refund row', () => {
    const payments = [pay({ id: 'a', amount: 5000, ledgerEntryId: 'L1' })];
    const next = withRefundPayment(payments, 5000, {
      ledgerEntryId: 'L1',
      note: 'Refunded to account balance',
      date: '2026-07-20',
    });
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(payments[0]);
    expect(next[1].amount).toBe(-5000);
    expect(next[1].method).toMatch(/balance refund/i);
    expect(next[1].note).toMatch(/refunded to account balance/i);
    expect(next[1].ledgerEntryId).toBe('L1');
    expect(next[1].date).toBe('2026-07-20');
    expect(next[1].id).toBeTruthy();
  });

  it('removeOrReduceBalancePayment removes exact match or reduces amount', () => {
    const linked = pay({ id: 'a', amount: 5000, method: 'Balance', ledgerEntryId: 'L1' });
    const other = pay({ id: 'b', amount: 1000, method: 'Cash' });
    expect(removeOrReduceBalancePayment([linked, other], 5000, 'L1')).toEqual([other]);

    const partial = pay({ id: 'c', amount: 8000, method: 'Balance', ledgerEntryId: 'L2' });
    expect(removeOrReduceBalancePayment([partial], 3000, 'L2')).toEqual([
      { ...partial, amount: 5000 },
    ]);

    const legacy = pay({ id: 'd', amount: 2000, method: 'Balance' });
    expect(removeOrReduceBalancePayment([legacy, other], 2000)).toEqual([other]);
  });

  it('recomputePaymentStatus derives paidAmount and status; honors collectLater', () => {
    const payments = [
      pay({ amount: 3000, method: 'Balance' }),
      pay({ amount: 2000, method: 'Cash' }),
    ];
    expect(recomputePaymentStatus(payments, 5000)).toEqual({
      paidAmount: 5000,
      paymentStatus: 'Paid',
    });
    expect(recomputePaymentStatus(payments, 10000)).toEqual({
      paidAmount: 5000,
      paymentStatus: 'Deposit',
    });
    expect(recomputePaymentStatus([], 5000)).toEqual({
      paidAmount: 0,
      paymentStatus: 'Unpaid',
    });

    const afterRefund = withRefundPayment(payments, 5000, { note: 'Refunded to account balance' });
    expect(recomputePaymentStatus(afterRefund, 5000)).toEqual({
      paidAmount: 0,
      paymentStatus: 'Unpaid',
    });

    expect(recomputePaymentStatus(payments, 5000, true)).toEqual({
      paidAmount: 5000,
      paymentStatus: 'CL',
      collectLater: true,
    });
  });
});
