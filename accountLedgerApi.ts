import { apiUrl } from './backendApi';
import type { LedgerEntry, LedgerType } from './accountBalance';

export async function fetchLedger(accountId: string, propertyId?: string): Promise<LedgerEntry[]> {
  const qs = new URLSearchParams({ accountId });
  if (propertyId) qs.set('propertyId', propertyId);
  const res = await fetch(apiUrl(`/api/account-ledger?${qs.toString()}`), { credentials: 'include' });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function postLedgerEntry(
  entry: Partial<LedgerEntry> & { type: LedgerType; amount: number; accountId: string }
): Promise<LedgerEntry> {
  const res = await fetch(apiUrl('/api/account-ledger'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`ledger post failed: ${res.status}`);
  return res.json();
}

export async function transferAllocation(entryId: string, toRequestId: string): Promise<LedgerEntry> {
  const res = await fetch(apiUrl(`/api/account-ledger/${encodeURIComponent(entryId)}/transfer`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ toRequestId }),
  });
  if (!res.ok) throw new Error(`ledger transfer failed: ${res.status}`);
  return res.json();
}

export async function deleteLedgerEntry(entryId: string, propertyId?: string): Promise<void> {
  const qs = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
  const res = await fetch(apiUrl(`/api/account-ledger/${encodeURIComponent(entryId)}${qs}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`ledger delete failed: ${res.status}`);
}
