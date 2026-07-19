/** Pure account-balance math. Balance = SUM(entry.amount). Currency ignored. */
export type LedgerType = 'deposit' | 'allocation' | 'cl_charge' | 'collection' | 'refund' | 'adjustment';

export interface LedgerEntry {
  id: string;
  accountId: string;
  propertyId?: string;
  requestId?: string;
  type: LedgerType;
  amount: number;
  date?: string;
  method?: string;
  note?: string;
  user?: string;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function computeBalance(entries: LedgerEntry[]): number {
  return (entries || []).reduce((s, e) => s + num(e.amount), 0);
}

/** Amount still owed for a CL request = its charged total minus what balance covered.
 *  We model it simply: owed = max(0, requestTotal - creditAppliedToThisRequest),
 *  where credit applied = sum of allocation entries for the request; cl_charge is
 *  the "owed" side. In the single-balance model the per-request owed equals the
 *  negative contribution not offset by allocations/collections to that request,
 *  capped by account outstanding (CL can be partly covered by leftover credit). */
export function requestOwed(entries: LedgerEntry[], requestId: string, requestTotal: number): number {
  const forReq = (entries || []).filter((e) => e.requestId === requestId);
  const applied = forReq
    .filter((e) => e.type === 'allocation' || e.type === 'collection')
    .reduce((s, e) => s + Math.abs(num(e.amount)), 0);
  const hasCl = forReq.some((e) => e.type === 'cl_charge');
  if (!hasCl) return 0;
  const uncovered = Math.max(0, num(requestTotal) - applied);
  // Cap by account outstanding so leftover prepaid credit covers part of a CL charge
  // (spec §6: 50k deposit − 30k R1 → 20k covers R2's 25k CL → 5k owed).
  return Math.min(uncovered, outstandingTotal(entries));
}

/** Total the account owes across everything = the negative part of the balance. */
export function outstandingTotal(entries: LedgerEntry[]): number {
  return Math.max(0, -computeBalance(entries));
}

/** How much positive balance can be applied to a request without going negative. */
export function applicableFromBalance(balance: number, requestDue: number): number {
  return Math.max(0, Math.min(num(balance), num(requestDue)));
}
