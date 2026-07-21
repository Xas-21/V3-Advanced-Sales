import { apiUrl } from './backendApi';
import { paymentsMeetOrExceedTotal, sumPaymentAmounts } from './beoShared';
import type { LedgerEntry } from './accountBalance';
import { clampSplitAmount } from './accountBalance';
import { deleteLedgerEntry, postLedgerEntry, transferAllocation } from './accountLedgerApi';

export type SyncPayment = {
  id: string | number;
  amount: number;
  method: string;
  date?: string;
  note?: string;
  ledgerEntryId?: string;
};

/** Minimal request shape for dual-write helpers (keeps callers loosely typed). */
export type SyncRequest = {
  id?: string;
  payments?: SyncPayment[];
  totalCost?: string | number;
  grandTotalWithTax?: string | number;
  paidAmount?: number;
  paymentStatus?: string;
  collectLater?: boolean;
  confirmationNo?: string;
  requestName?: string;
  [key: string]: unknown;
};

const AMOUNT_EPS = 0.0001;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const newPaymentId = (): number => Date.now() + Math.floor(Math.random() * 1000);

const isBalanceMethod = (method: unknown): boolean =>
  String(method || '').trim().toLowerCase() === 'balance';

/** Attach ledgerEntryId without mutating the original payment. */
export function attachLedgerId(payment: SyncPayment, ledgerEntryId: string): SyncPayment {
  return { ...payment, ledgerEntryId: String(ledgerEntryId) };
}

/**
 * Prefer match by ledgerEntryId; fallback: method + amount (±eps) for legacy rows.
 * ponytail: heuristic match for payments without ledgerEntryId — upgrade when all rows are linked.
 */
export function findPaymentForLedger(
  payments: SyncPayment[],
  ledgerEntryId: string,
  fallback?: { amount: number; method: string }
): SyncPayment | undefined {
  const lid = String(ledgerEntryId || '').trim();
  if (lid) {
    const byId = (payments || []).find((p) => String(p.ledgerEntryId || '') === lid);
    if (byId) return byId;
  }
  if (!fallback) return undefined;
  const wantAmt = Math.abs(num(fallback.amount));
  const wantMethod = String(fallback.method || '').trim().toLowerCase();
  return (payments || []).find((p) => {
    if (String(p.method || '').trim().toLowerCase() !== wantMethod) return false;
    return Math.abs(Math.abs(num(p.amount)) - wantAmt) < AMOUNT_EPS;
  });
}

/** Append a red negative refund row (Balance refund) — do not silently delete. */
export function withRefundPayment(
  payments: SyncPayment[],
  amount: number,
  opts: { ledgerEntryId?: string; note?: string; date?: string } = {}
): SyncPayment[] {
  const abs = Math.abs(num(amount));
  if (!(abs > 0)) return [...(payments || [])];
  const row: SyncPayment = {
    id: newPaymentId(),
    amount: -abs,
    method: 'Balance refund',
    note: opts.note || 'Refunded to account balance',
    date: opts.date || todayIso(),
  };
  if (opts.ledgerEntryId) row.ledgerEntryId = String(opts.ledgerEntryId);
  return [...(payments || []), row];
}

/**
 * Remove or reduce a Balance payment by amount.
 * Prefer ledgerEntryId; else first Balance row matching amount (±eps) or larger for reduce.
 */
export function removeOrReduceBalancePayment(
  payments: SyncPayment[],
  amount: number,
  ledgerEntryId?: string
): SyncPayment[] {
  const abs = Math.abs(num(amount));
  const list = [...(payments || [])];
  if (!(abs > 0)) return list;

  const lid = String(ledgerEntryId || '').trim();
  let idx = -1;
  if (lid) {
    idx = list.findIndex((p) => String(p.ledgerEntryId || '') === lid && isBalanceMethod(p.method));
  }
  if (idx < 0) {
    idx = list.findIndex(
      (p) => isBalanceMethod(p.method) && Math.abs(Math.abs(num(p.amount)) - abs) < AMOUNT_EPS
    );
  }
  if (idx < 0) {
    idx = list.findIndex((p) => isBalanceMethod(p.method) && Math.abs(num(p.amount)) > abs + AMOUNT_EPS);
  }
  if (idx < 0) return list;

  const cur = Math.abs(num(list[idx].amount));
  if (Math.abs(cur - abs) < AMOUNT_EPS) {
    list.splice(idx, 1);
    return list;
  }
  if (cur > abs) {
    list[idx] = { ...list[idx], amount: cur - abs };
    return list;
  }
  list.splice(idx, 1);
  return list;
}

export function recomputePaymentStatus(
  payments: SyncPayment[],
  requestTotal: number,
  collectLater?: boolean
): { paidAmount: number; paymentStatus: string; collectLater?: boolean } {
  const paidAmount = sumPaymentAmounts(payments);
  const total = num(requestTotal);
  const isClMethod = (method: unknown) =>
    String(method || '').trim().toUpperCase() === 'CL';
  const hasPositiveClLine = (payments || []).some(
    (p) => isClMethod(p.method) && num(p.amount) > 0
  );

  if (collectLater) {
    if (total > 0 && paymentsMeetOrExceedTotal(paidAmount, total)) {
      return { paidAmount, paymentStatus: 'Paid', collectLater: false };
    }
    if (!(paidAmount > 0) && !hasPositiveClLine) {
      return { paidAmount, paymentStatus: 'Unpaid', collectLater: false };
    }
    return { paidAmount, paymentStatus: 'CL', collectLater: true };
  }

  let paymentStatus = 'Unpaid';
  if (total > 0) {
    if (paymentsMeetOrExceedTotal(paidAmount, total)) paymentStatus = 'Paid';
    else if (paidAmount > 0) paymentStatus = 'Deposit';
  } else if (paidAmount > 0) {
    paymentStatus = 'Paid';
  }
  return { paidAmount, paymentStatus };
}

async function persistRequest(request: SyncRequest): Promise<SyncRequest> {
  const payload: SyncRequest = { ...request, _update: true };
  const res = await fetch(apiUrl('/api/requests'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`request persist failed: ${res.status}`);
  return payload;
}

function requestTotalOf(request: SyncRequest): number {
  return (
    parseFloat(String(request?.totalCost ?? request?.grandTotalWithTax ?? '0').replace(/,/g, '')) || 0
  );
}

function applyPaymentsToRequest(
  request: SyncRequest,
  payments: SyncPayment[],
  collectLater?: boolean
): SyncRequest {
  const { paidAmount, paymentStatus, collectLater: cl } = recomputePaymentStatus(
    payments,
    requestTotalOf(request),
    collectLater ?? !!request?.collectLater
  );
  return {
    ...request,
    payments,
    paidAmount: Number(paidAmount.toFixed(2)),
    paymentStatus,
    ...(cl ? { collectLater: true } : { collectLater: false }),
  };
}

export async function allocateBalanceToRequest(args: {
  accountId: string;
  propertyId: string;
  request: SyncRequest;
  amount: number;
  date?: string;
  note?: string;
  user?: string;
}): Promise<{ request: SyncRequest; ledgerEntry: LedgerEntry }> {
  const amount = Math.abs(num(args.amount));
  if (!(amount > 0)) throw new Error('allocate amount must be > 0');
  const date = args.date || todayIso();
  const ledgerEntry = await postLedgerEntry({
    type: 'allocation',
    amount,
    accountId: args.accountId,
    propertyId: args.propertyId || undefined,
    requestId: String(args.request?.id || ''),
    method: 'Balance',
    note: args.note,
    date,
    user: args.user,
  });
  const payment = attachLedgerId(
    {
      id: newPaymentId(),
      amount,
      method: 'Balance',
      date,
      note: args.note,
    },
    ledgerEntry.id
  );
  const payments = [...(args.request?.payments || []), payment];
  const request = await persistRequest(applyPaymentsToRequest(args.request, payments));
  return { request, ledgerEntry };
}

export async function transferBalanceBetweenRequests(args: {
  entry: LedgerEntry;
  fromRequest: SyncRequest;
  toRequest: SyncRequest;
  propertyId: string;
}): Promise<{ fromRequest: SyncRequest; toRequest: SyncRequest; ledgerEntry: LedgerEntry }> {
  const entry = args.entry;
  const abs = Math.abs(num(entry.amount));
  const ledgerEntry = await transferAllocation(entry.id, String(args.toRequest?.id || ''));

  const matched = findPaymentForLedger(args.fromRequest?.payments || [], entry.id, {
    amount: abs,
    method: entry.method || 'Balance',
  });
  let fromPayments = [...(args.fromRequest?.payments || [])] as SyncPayment[];
  if (matched) {
    fromPayments = removeOrReduceBalancePayment(fromPayments, abs, matched.ledgerEntryId || entry.id);
  } else {
    fromPayments = withRefundPayment(fromPayments, abs, {
      ledgerEntryId: entry.id,
      note: 'Refunded to account balance (moved)',
      date: entry.date || todayIso(),
    });
  }

  const toPayment = attachLedgerId(
    {
      id: newPaymentId(),
      amount: abs,
      method: 'Balance',
      date: entry.date || todayIso(),
      note: entry.note ? `Moved: ${entry.note}` : 'Moved allocation',
    },
    ledgerEntry.id || entry.id
  );
  const toPayments = [...(args.toRequest?.payments || []), toPayment] as SyncPayment[];

  const fromRequest = await persistRequest(applyPaymentsToRequest(args.fromRequest, fromPayments));
  const toRequest = await persistRequest(applyPaymentsToRequest(args.toRequest, toPayments));
  return { fromRequest, toRequest, ledgerEntry };
}

export async function splitBalanceAcrossRequests(args: {
  entry: LedgerEntry;
  fromRequest?: SyncRequest;
  toRequest: SyncRequest;
  splitAmount: number;
  accountId: string;
  propertyId: string;
}): Promise<{ fromRequest?: SyncRequest; toRequest: SyncRequest; splitLedgerEntry: LedgerEntry }> {
  const entry = args.entry;
  const splitAmt = clampSplitAmount(entry.amount, args.splitAmount);
  if (!(splitAmt > 0)) throw new Error('invalid split amount');
  const fullAbs = Math.abs(num(entry.amount));
  const remainder = fullAbs - splitAmt;
  const date = entry.date || todayIso();

  let splitLedgerEntry: LedgerEntry;
  if (entry.type === 'deposit' && !entry.requestId) {
    splitLedgerEntry = await postLedgerEntry({
      type: 'allocation',
      amount: splitAmt,
      accountId: args.accountId,
      propertyId: args.propertyId || undefined,
      requestId: String(args.toRequest?.id || ''),
      method: 'Balance',
      note: 'Split from deposit',
      date,
    });
  } else if (entry.type === 'allocation' || entry.type === 'cl_charge') {
    await postLedgerEntry({
      ...entry,
      amount: remainder,
      accountId: args.accountId,
      propertyId: args.propertyId || entry.propertyId || undefined,
    });
    splitLedgerEntry = await postLedgerEntry({
      type: 'allocation',
      amount: splitAmt,
      accountId: args.accountId,
      propertyId: args.propertyId || undefined,
      requestId: String(args.toRequest?.id || ''),
      method: entry.method || 'Balance',
      note: entry.note ? `Split: ${entry.note}` : 'Split allocation',
      date,
    });
  } else {
    throw new Error('Only deposits and allocations can be split');
  }

  let fromRequest = args.fromRequest;
  if (fromRequest && entry.requestId) {
    const fromPayments = removeOrReduceBalancePayment(
      [...(fromRequest.payments || [])] as SyncPayment[],
      splitAmt,
      entry.id
    );
    fromRequest = await persistRequest(applyPaymentsToRequest(fromRequest, fromPayments));
  }

  const toPayment = attachLedgerId(
    {
      id: newPaymentId(),
      amount: splitAmt,
      method: 'Balance',
      date,
      note: entry.note ? `Split: ${entry.note}` : 'Split allocation',
    },
    splitLedgerEntry.id
  );
  const toPayments = [...(args.toRequest?.payments || []), toPayment] as SyncPayment[];
  const toRequest = await persistRequest(applyPaymentsToRequest(args.toRequest, toPayments));
  return { fromRequest, toRequest, splitLedgerEntry };
}

export async function undoLedgerLinkedToRequest(args: {
  entry: LedgerEntry;
  request: SyncRequest;
  propertyId: string;
}): Promise<{ request: SyncRequest }> {
  const entry = args.entry;
  const abs = Math.abs(num(entry.amount));
  await deleteLedgerEntry(entry.id, args.propertyId || undefined);
  const payments = withRefundPayment(args.request?.payments || [], abs, {
    ledgerEntryId: entry.id,
    note: 'Refunded to account balance',
    date: todayIso(),
  });
  const request = await persistRequest(applyPaymentsToRequest(args.request, payments));
  return { request };
}

/**
 * Offset/delete a Balance or CL payment → restore ledger credit.
 * Prefer delete matching ledgerEntryId; else compensating deposit/refund post.
 */
export async function reverseBalancePaymentOnRequest(args: {
  request: SyncRequest;
  payment: SyncPayment;
  accountId: string;
  propertyId: string;
  mode?: 'offset' | 'delete';
}): Promise<{ request: SyncRequest }> {
  const payment = args.payment;
  const abs = Math.abs(num(payment.amount));
  const method = String(payment.method || '').trim();
  const isCl = method.toUpperCase() === 'CL';
  const isBal = isBalanceMethod(method);
  if (!isBal && !isCl) {
    throw new Error('reverseBalancePaymentOnRequest only handles Balance/CL payments');
  }

  const lid = String(payment.ledgerEntryId || '').trim();
  if (lid) {
    await deleteLedgerEntry(lid, args.propertyId || undefined);
  } else if (isBal) {
    // Compensating credit when legacy Balance row has no ledger link
    await postLedgerEntry({
      type: 'deposit',
      amount: abs,
      accountId: args.accountId,
      propertyId: args.propertyId || undefined,
      method: 'Balance',
      note: `Restored from request payment #${payment.id}`,
      date: todayIso(),
      requestId: String(args.request?.id || '') || undefined,
    });
  } else {
    // CL without link: post compensating collection-like credit via deposit
    await postLedgerEntry({
      type: 'deposit',
      amount: abs,
      accountId: args.accountId,
      propertyId: args.propertyId || undefined,
      method: 'CL',
      note: `Reversed CL payment #${payment.id}`,
      date: todayIso(),
      requestId: String(args.request?.id || '') || undefined,
    });
  }

  let payments: SyncPayment[];
  if (args.mode === 'delete') {
    payments = (args.request?.payments || []).filter(
      (p: SyncPayment) => String(p.id) !== String(payment.id)
    );
  } else {
    // Default: offset with refund-style negative row for Balance; mirror offset for CL
    if (isBal) {
      payments = withRefundPayment(args.request?.payments || [], abs, {
        ledgerEntryId: lid || undefined,
        note: `Refunded to account balance (offset #${payment.id})`,
        date: todayIso(),
      });
    } else {
      payments = [
        ...(args.request?.payments || []),
        {
          ...payment,
          id: newPaymentId(),
          amount: -abs,
          note: `Offset for payment #${payment.id}`,
          date: todayIso(),
        },
      ];
    }
  }

  const stillHasCl = payments.some(
    (p) => String(p.method || '').trim().toUpperCase() === 'CL' && num(p.amount) > 0
  );
  const request = await persistRequest(
    applyPaymentsToRequest(args.request, payments, stillHasCl ? true : false)
  );
  return { request };
}
