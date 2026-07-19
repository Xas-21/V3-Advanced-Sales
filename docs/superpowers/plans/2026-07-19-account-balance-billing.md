# Account Balance & Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give accounts a deposit/credit ledger so prepaid money can be applied to (or split across) their requests, and let requests be marked "Collect Later" (CL) against that balance, with a Billing view on the account page.

**Architecture:** A new `account_ledger` flat collection (reusing the existing `list_flat`/`upsert_flat` framework) is the single source of truth. Account balance = `SUM(amount)` computed on the client. Requests gain two new payment sources in the shared Add Deposit modal: **Balance** (spend positive credit, capped, never negative) and **CL** (charge full remaining amount, may drive balance negative = owed). A Billing panel on the account page shows balance, per-request owed, history, add-deposit, and transfer/split.

**Tech Stack:** Python FastAPI + PostgreSQL (psycopg) backend; React 18 + TypeScript + Vite + Tailwind frontend; pytest (backend), vitest (frontend).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-account-balance-billing-design.md` — read it first.
- **Currency is ignored** — raw numbers only (`ponytail:` no FX).
- Entry types + sign: `deposit`/`collection` = `+`; `allocation`/`cl_charge`/`refund` = `−`; `adjustment` = as-is.
- Balance = `SUM(amount)`. Positive = prepaid credit; negative = owed (outstanding).
- **Balance apply never drives balance negative** (cap at available). **CL may go negative.**
- Reuse existing patterns: flat CRUD (`account_rates`), payment methods (`propertyPaymentMethods.ts`), linked requests (`filterRequestsForAccount`), currency formatting (`formatCompactCurrency`), modal pattern (`AccountLinkedRequestsModal.tsx`).
- PowerShell host: chain commands with `;` not `&&`. Backend tests may `pytest.skip` if no DB — that is acceptable locally.
- Windows dev: `docker compose up -d`; backend tests `npm run test:backend` (or `test:backend:win`); frontend tests `npm run test:frontend`.

---

### Task 1: Backend `account_ledger` collection + API

**Files:**
- Create: `backend/migrations/012_account_ledger.py`
- Modify: `backend/data_access.py` (`_FLAT_WITH_PID` ~L89; add `_extract_account_ledger` near `_extract_account_rates` L360; register in `_EXTRACTORS` L370; add `save_ledger_entry` + `transfer_allocation` after `delete_flat` L420)
- Create: `backend/routers/account_ledger.py`
- Modify: `backend/main.py:210` (register router next to `account_rates`)
- Test: `backend/tests/test_account_ledger.py`

**Interfaces:**
- Produces (backend, used by frontend Tasks 2-4):
  - `GET  /api/account-ledger?accountId=<id>&propertyId=<pid>` → `list[dict]` of entries (each: `{id, type, amount, accountId, propertyId, requestId?, method?, note?, date?, user?}`).
  - `POST /api/account-ledger` body = full entry dict → stored entry (sign-normalized).
  - `POST /api/account-ledger/{id}/transfer` body `{toRequestId}` → updated entry.
  - `DELETE /api/account-ledger/{id}?propertyId=<pid>` → `{message}`.
- Consumes: existing `list_flat`, `upsert_flat`, `delete_flat`, `get_flat`, `_FLAT_WITH_PID`, `_EXTRACTORS`, `_as_decimal`, `_gen_id` from `data_access.py`.

- [x] **Step 1: Create the migration** (mirrors `backend/migrations/011_account_rates.py`)

Create `backend/migrations/012_account_ledger.py`:

```python
"""Create account_ledger flat collection (account balance / billing).

Matches account_rates shape: typed cols + payload jsonb + timestamps.
Safe to run repeatedly (IF NOT EXISTS).

Run inside the backend container:
    python /app/migrations/012_account_ledger.py
"""
import sys

sys.path.insert(0, "/app")
from dotenv import load_dotenv

load_dotenv("/app/.env", override=True)
from utils import _get_pool

STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS account_ledger (
        id          TEXT PRIMARY KEY,
        property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
        account_id  TEXT REFERENCES accounts(id) ON DELETE CASCADE,
        request_id  TEXT REFERENCES requests(id) ON DELETE SET NULL,
        entry_type  TEXT,
        amount      NUMERIC,
        payload     JSONB,
        created_at  TIMESTAMPTZ DEFAULT now(),
        updated_at  TIMESTAMPTZ DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_account_ledger_account ON account_ledger (account_id)",
    "CREATE INDEX IF NOT EXISTS ix_account_ledger_property_updated ON account_ledger (property_id, updated_at DESC, id)",
]

pool = _get_pool()
applied, skipped = 0, 0
with pool.connection() as c:
    with c.cursor() as cur:
        for stmt in STATEMENTS:
            try:
                cur.execute(stmt)
                applied += 1
                print("OK  ", " ".join(stmt.split())[:100])
            except Exception as e:
                skipped += 1
                print("SKIP", " ".join(stmt.split())[:80], "->", str(e).splitlines()[0])
                c.rollback()
        c.commit()
print(f"\nACCOUNT_LEDGER: {applied} applied/verified, {skipped} skipped")
```

- [x] **Step 2: Run the migration**

Run: `docker compose exec as-backend python /app/migrations/012_account_ledger.py`
(If not using Docker: `cd backend; python migrations/012_account_ledger.py`)
Expected: prints `ACCOUNT_LEDGER: 3 applied/verified, 0 skipped` (or SKIP lines on re-run).

- [x] **Step 3: Register the collection in `data_access.py`**

In `_FLAT_WITH_PID` (around L89), add `"account_ledger",` to the set.

Add this extractor next to `_extract_account_rates` (around L360). Amount sign is
normalized here so the stored `amount` column and payload agree:

```python
_LEDGER_POSITIVE = {"deposit", "collection"}
_LEDGER_NEGATIVE = {"allocation", "cl_charge", "refund"}


def _signed_ledger_amount(entry_type: str, amount) -> float:
    v = float(_as_decimal(amount) or 0)
    t = str(entry_type or "").strip()
    if t in _LEDGER_POSITIVE:
        return abs(v)
    if t in _LEDGER_NEGATIVE:
        return -abs(v)
    return v  # adjustment: as-is


def _extract_account_ledger(p: dict) -> dict:
    return {
        "account_id": str(p.get("accountId") or "").strip() or None,
        "request_id": str(p.get("requestId") or "").strip() or None,
        "entry_type": str(p.get("type") or "").strip() or None,
        "amount": _signed_ledger_amount(p.get("type"), p.get("amount")),
    }
```

Register it in `_EXTRACTORS` (around L370):

```python
    "account_ledger": _extract_account_ledger,
```

- [x] **Step 4: Add `save_ledger_entry` + `transfer_allocation` to `data_access.py`**

Add after `delete_flat` (around L420). `save_ledger_entry` normalizes the payload
amount sign to match the typed column, then reuses `upsert_flat`:

```python
def save_ledger_entry(data: dict) -> dict:
    item = {**(data if isinstance(data, dict) else {})}
    item["amount"] = _signed_ledger_amount(item.get("type"), item.get("amount"))
    return upsert_flat("account_ledger", item, id_prefix="LE")


def transfer_allocation(entry_id: str, to_request_id: str) -> dict:
    existing = get_flat("account_ledger", str(entry_id))
    if not existing:
        raise KeyError("ledger entry not found")
    existing["requestId"] = str(to_request_id or "").strip() or None
    return save_ledger_entry(existing)
```

- [x] **Step 5: Create the router** (mirrors `backend/routers/account_rates.py`)

Create `backend/routers/account_ledger.py`:

```python
from fastapi import APIRouter, HTTPException
from typing import Optional

from data_access import delete_flat, list_flat, save_ledger_entry, transfer_allocation

router = APIRouter(prefix="/api/account-ledger")


@router.get("")
def get_ledger(accountId: Optional[str] = None, propertyId: Optional[str] = None):
    rows = list_flat("account_ledger", propertyId)
    aid = str(accountId or "").strip()
    if not aid:
        return rows
    return [r for r in rows if str((r or {}).get("accountId") or "").strip() == aid]


@router.post("")
def save_ledger(data: dict):
    return save_ledger_entry(data)


@router.post("/{id}/transfer")
def transfer_ledger(id: str, body: dict):
    try:
        return transfer_allocation(id, str((body or {}).get("toRequestId") or ""))
    except KeyError:
        raise HTTPException(status_code=404, detail="Ledger entry not found")


@router.delete("/{id}")
def delete_ledger(id: str, propertyId: Optional[str] = None):
    delete_flat("account_ledger", id, propertyId)
    return {"message": "Deleted successfully"}
```

- [x] **Step 6: Register the router in `backend/main.py`**

After the `account_rates` line (L210) add:

```python
from routers import account_ledger  # add to the existing routers import group at top
app.include_router(account_ledger.router, dependencies=_auth_required)
```

(Match how `account_rates` is imported — add `account_ledger` to the same `from routers import (...)` block, then the `include_router` call beside L210.)

- [x] **Step 7: Write the failing test**

Create `backend/tests/test_account_ledger.py` (model auth/fixtures on `test_account_rates.py`; reuse its `_any_property_id`, user-creation, and login helpers verbatim, changing table/URL names):

```python
"""account_ledger API: sign normalization, accountId filter, transfer, tenant guard."""
import secrets, uuid
import psycopg, pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row
from main import app
from security import hash_password
from utils import get_database_url

client = TestClient(app, base_url="https://testserver")


def _table_ready() -> bool:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.account_ledger') AS t;")
            return bool((cur.fetchone() or {}).get("t"))


# --- reuse the exact fixture pattern from test_account_rates.py (property + user + login) ---
# (copy `_any_property_id`, the `rates_fixtures`-style fixture, and the auth cookie/login
#  helper; rename to `ledger_fixtures` and drop the account_rates-specific rows.)


def test_sign_normalization_and_filter(ledger_fixtures):
    ctx = ledger_fixtures
    # deposit stored positive
    r = client.post("/api/account-ledger", json={
        "type": "deposit", "amount": 50000, "accountId": ctx["account_id"],
        "propertyId": ctx["home_pid"], "date": "2026-07-19",
    }, cookies=ctx["cookies"])
    assert r.status_code == 200
    assert float(r.json()["amount"]) == 50000.0
    # cl_charge stored negative even if sent positive
    r2 = client.post("/api/account-ledger", json={
        "type": "cl_charge", "amount": 25000, "accountId": ctx["account_id"],
        "propertyId": ctx["home_pid"], "requestId": "R-x",
    }, cookies=ctx["cookies"])
    assert float(r2.json()["amount"]) == -25000.0
    # GET filtered by accountId returns both
    got = client.get(f"/api/account-ledger?accountId={ctx['account_id']}&propertyId={ctx['home_pid']}",
                     cookies=ctx["cookies"]).json()
    assert sum(float(e["amount"]) for e in got) == 25000.0  # 50000 - 25000


def test_transfer_repoints_request(ledger_fixtures):
    ctx = ledger_fixtures
    e = client.post("/api/account-ledger", json={
        "type": "allocation", "amount": 30000, "accountId": ctx["account_id"],
        "propertyId": ctx["home_pid"], "requestId": "R-old",
    }, cookies=ctx["cookies"]).json()
    moved = client.post(f"/api/account-ledger/{e['id']}/transfer",
                        json={"toRequestId": "R-new"}, cookies=ctx["cookies"]).json()
    assert moved["requestId"] == "R-new"
    assert float(moved["amount"]) == -30000.0
```

- [x] **Step 8: Run tests to verify they pass**

Run: `npm run test:backend` (or `cd backend; python -m pytest tests/test_account_ledger.py -v`)
Expected: PASS (or SKIP if no DB configured locally — then verify against the Docker DB).

- [x] **Step 9: Commit**

```bash
git add backend/migrations/012_account_ledger.py backend/data_access.py backend/routers/account_ledger.py backend/main.py backend/tests/test_account_ledger.py
git commit -m "feat(backend): account_ledger collection + API"
```

---

### Task 2: Frontend balance helpers + ledger API client

**Files:**
- Create: `accountBalance.ts`
- Create: `accountBalance.test.ts`
- Create: `accountLedgerApi.ts`
- Reference: `backendApi.ts` (`apiUrl`), `formatCompactCurrency.ts`

**Interfaces:**
- Produces (used by Tasks 3-4):
  - `type LedgerType = 'deposit' | 'allocation' | 'cl_charge' | 'collection' | 'refund' | 'adjustment'`
  - `interface LedgerEntry { id: string; accountId: string; propertyId?: string; requestId?: string; type: LedgerType; amount: number; date?: string; method?: string; note?: string; user?: string }`
  - `computeBalance(entries: LedgerEntry[]): number`
  - `requestOwed(entries: LedgerEntry[], requestId: string, requestTotal: number): number`
  - `outstandingTotal(entries: LedgerEntry[]): number`
  - `applicableFromBalance(balance: number, requestDue: number): number`
  - `fetchLedger(accountId: string, propertyId?: string): Promise<LedgerEntry[]>`
  - `postLedgerEntry(entry: Partial<LedgerEntry> & { type: LedgerType; amount: number; accountId: string }): Promise<LedgerEntry>`
  - `transferAllocation(entryId: string, toRequestId: string): Promise<LedgerEntry>`
  - `deleteLedgerEntry(entryId: string, propertyId?: string): Promise<void>`
- Consumes: `apiUrl` from `backendApi.ts`.

- [x] **Step 1: Write the failing test**

Create `accountBalance.test.ts`:

```ts
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:frontend -- accountBalance`
Expected: FAIL — `Cannot find module './accountBalance'`.

- [x] **Step 3: Write `accountBalance.ts`**

```ts
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
 *  negative contribution not offset by allocations/collections to that request. */
export function requestOwed(entries: LedgerEntry[], requestId: string, requestTotal: number): number {
  const forReq = (entries || []).filter((e) => e.requestId === requestId);
  const applied = forReq
    .filter((e) => e.type === 'allocation' || e.type === 'collection')
    .reduce((s, e) => s + Math.abs(num(e.amount)), 0);
  const hasCl = forReq.some((e) => e.type === 'cl_charge');
  if (!hasCl) return 0;
  return Math.max(0, num(requestTotal) - applied);
}

/** Total the account owes across everything = the negative part of the balance. */
export function outstandingTotal(entries: LedgerEntry[]): number {
  return Math.max(0, -computeBalance(entries));
}

/** How much positive balance can be applied to a request without going negative. */
export function applicableFromBalance(balance: number, requestDue: number): number {
  return Math.max(0, Math.min(num(balance), num(requestDue)));
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:frontend -- accountBalance`
Expected: PASS (both tests).

- [x] **Step 5: Write the ledger API client `accountLedgerApi.ts`**

```ts
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
  await fetch(apiUrl(`/api/account-ledger/${encodeURIComponent(entryId)}${qs}`), {
    method: 'DELETE',
    credentials: 'include',
  });
}
```

Note: match the existing fetch/credentials convention in `backendApi.ts` consumers
(check whether other calls pass `credentials: 'include'`; if the codebase uses a
shared wrapper, use that instead of raw `fetch`).

- [x] **Step 6: Commit**

```bash
git add accountBalance.ts accountBalance.test.ts accountLedgerApi.ts
git commit -m "feat(frontend): account balance helpers + ledger API client"
```

---

### Task 3: Request Add Deposit modal — Balance & CL options

**Files:**
- Modify: `RequestsManager.tsx` — modal render (`paymentModal`, ~L5368-5621), state (`newPayment` ~L766, `showPaymentModal` ~L764), confirm handler (~L5417-5617).

**Interfaces:**
- Consumes: `fetchLedger`, `postLedgerEntry` (Task 2); `computeBalance`, `applicableFromBalance` (Task 2); existing `sumPaymentAmounts`, `calculateAccFinancialsForRequest`, `updateRequest`, `requestLogUser`, `activeProperty`, `accForm.accountId`/`selectedRequest.accountId`.
- Produces: writes both a `request_payment` (method `'Balance'`) and a ledger entry; sets a CL marker on the request (`paymentStatus: 'CL'` or a `collectLater: true` flag + badge).

- [x] **Step 1: Add ledger state + fetch the linked account balance when the modal opens**

Near the payment modal state (~L764), add:

```tsx
const [ledgerEntries, setLedgerEntries] = useState<import('./accountBalance').LedgerEntry[]>([]);
const [paymentSource, setPaymentSource] = useState<'method' | 'balance' | 'cl'>('method');
const [balanceMode, setBalanceMode] = useState<'full' | 'partial'>('full');
```

Add an effect that loads the ledger for the request's account whenever the modal opens:

```tsx
useEffect(() => {
  if (!showPaymentModal) return;
  const acctId =
    paymentModalSource === 'form'
      ? String(accForm.accountId || '')
      : String(selectedRequest?.accountId || (activeOptionsMenu !== null ? requests[activeOptionsMenu]?.accountId : '') || '');
  if (!acctId) { setLedgerEntries([]); return; }
  import('./accountLedgerApi').then(({ fetchLedger }) =>
    fetchLedger(acctId, String(activeProperty?.id || '')).then(setLedgerEntries).catch(() => setLedgerEntries([]))
  );
}, [showPaymentModal, paymentModalSource, accForm.accountId, selectedRequest, activeOptionsMenu, requests, activeProperty]);

const accountBalance = useMemo(() => {
  // computeBalance imported statically at top of file
  return computeBalance(ledgerEntries);
}, [ledgerEntries]);
```

Add `import { computeBalance, applicableFromBalance } from './accountBalance';` to the top imports.

- [x] **Step 2: Add the payment-source selector to the modal body**

In `paymentModal` (~L5381, above the Method/Amount grid), insert a three-way segmented control:

```tsx
<div className="grid grid-cols-3 gap-2">
  {(['method', 'balance', 'cl'] as const).map((src) => (
    <button key={src} type="button"
      onClick={() => {
        if (src === 'balance' && accountBalance <= 0) {
          alert('Please choose a valid payment method, or CL if payment will be after the service.');
          return;
        }
        setPaymentSource(src);
      }}
      className="py-2 rounded-xl border text-xs font-bold uppercase"
      style={{
        borderColor: paymentSource === src ? colors.green : colors.border,
        color: paymentSource === src ? colors.green : colors.textMain,
        opacity: src === 'balance' && accountBalance <= 0 ? 0.4 : 1,
      }}>
      {src === 'method' ? 'Method' : src === 'balance' ? 'Balance' : 'CL'}
    </button>
  ))}
</div>
{paymentSource === 'balance' && (
  <div className="text-xs" style={{ color: colors.textMuted }}>
    Available balance: <span style={{ color: colors.green }}>{accountBalance.toLocaleString()}</span> — from linked account
    <div className="mt-2 flex gap-3">
      <label className="flex items-center gap-1"><input type="radio" checked={balanceMode === 'full'} onChange={() => setBalanceMode('full')} /> Deduct full request amount</label>
      <label className="flex items-center gap-1"><input type="radio" checked={balanceMode === 'partial'} onChange={() => setBalanceMode('partial')} /> Deposit only</label>
    </div>
  </div>
)}
{paymentSource === 'cl' && (
  <div className="text-xs" style={{ color: colors.textMuted }}>
    Collect Later — charges the full remaining amount to the account balance (may go negative = owed).
  </div>
)}
```

Show the Method dropdown only when `paymentSource === 'method'`, and the manual amount field when `paymentSource === 'method' || (paymentSource === 'balance' && balanceMode === 'partial')`.

- [x] **Step 3: Branch the confirm handler for Balance / CL**

At the very top of the confirm `onClick` (~L5418), before the existing `paymentModalSource` branches, compute the effective amount + method and post the ledger entry. Keep the existing per-source payment-append logic (it already recomputes `paymentStatus`/status), just feed it the right amount/method:

```tsx
const acctId = paymentModalSource === 'form'
  ? String(accForm.accountId || '')
  : String(selectedRequest?.accountId || (activeOptionsMenu !== null ? requests[activeOptionsMenu]?.accountId : '') || '');
const reqForAmt = paymentModalSource === 'form' ? accForm
  : (paymentModalSource === 'detail' ? selectedRequest : (activeOptionsMenu !== null ? requests[activeOptionsMenu] : null));
const requestTotal = parseFloat(String(reqForAmt?.totalCost ?? reqForAmt?.grandTotalWithTax ?? '0').replace(/,/g, '')) || 0;
const alreadyPaid = sumPaymentAmounts(reqForAmt?.payments || []);
const requestDue = Math.max(0, requestTotal - alreadyPaid);

let effectiveAmt = Number(newPayment.amount || 0);
let effectiveMethod = newPayment.method;
let ledgerType: import('./accountBalance').LedgerType | null = null;
let clFlag = false;

if (paymentSource === 'balance') {
  effectiveMethod = 'Balance';
  effectiveAmt = balanceMode === 'full'
    ? applicableFromBalance(accountBalance, requestDue)
    : applicableFromBalance(accountBalance, Number(newPayment.amount || 0));
  ledgerType = 'allocation';
} else if (paymentSource === 'cl') {
  effectiveMethod = 'CL';
  effectiveAmt = requestDue;      // charge full remaining amount
  ledgerType = 'cl_charge';
  clFlag = true;
}

if (ledgerType && acctId && effectiveAmt > 0) {
  const { postLedgerEntry } = await import('./accountLedgerApi');
  await postLedgerEntry({
    type: ledgerType, amount: effectiveAmt, accountId: acctId,
    propertyId: String(activeProperty?.id || ''),
    requestId: String(reqForAmt?.id || ''), method: effectiveMethod,
    note: newPayment.note || '', date: newPayment.date, user: requestLogUser,
  } as any);
}
// then feed effectiveAmt/effectiveMethod into the existing append logic:
const amt = effectiveAmt;             // replaces the existing `const amt = Number(newPayment.amount || 0)`
const postingMethod = effectiveMethod; // use in place of newPayment.method when building the payment row
```

For **CL**, mark the request so it shows a badge: when building `updateData`/state,
set `paymentStatus: clFlag ? 'CL' : paymentStatus` and add `collectLater: true`.
For **Balance**, the appended payment (method `'Balance'`) flows through the
existing paid/status logic unchanged.

Replace the existing `const amt = Number(newPayment.amount || 0);` line with the
computed `amt` above, and swap `newPayment.method` → `postingMethod` in the three
payment-row builders and the log messages.

- [x] **Step 4: Reset the new state when the modal closes**

Wherever `setNewPayment(emptyNewPayment())` runs on close (~L5535, L5613, L5725), also add:

```tsx
setPaymentSource('method'); setBalanceMode('full');
```

- [x] **Step 5: Add the CL badge on the request**

Find where `paymentStatus` badges render (RequestsManager list/detail, e.g. ~L3801 and ~L4884 use `fin.paymentStatus`). Add a CL case so a request with `paymentStatus === 'CL'` (or `collectLater`) shows a red **"CL · Collect Later"** pill using `colors.red`.

- [x] **Step 6: Verify build + types**

Run: `npm run build`
Expected: type-checks and builds with no errors referencing the modal changes.

- [x] **Step 7: Manual smoke (documented, not automated)**

With `docker compose up -d`: create an account, add a deposit via Billing (Task 4)
or POST `/api/account-ledger`; open a linked request's Add Deposit → **Balance** shows the
balance, **CL** is always available, Balance is blocked with the exact message when balance ≤ 0.

- [x] **Step 8: Commit**

```bash
git add RequestsManager.tsx
git commit -m "feat(requests): Balance & CL payment sources in Add Deposit modal"
```

---

### Task 4: Account Billing panel

**Files:**
- Create: `AccountBillingPanel.tsx`
- Modify: `AccountsPage.tsx` — add a "Billing" button + panel mount (model on the existing `AccountLinkedRequestsModal` usage, imported L39).
- Reference: `accountProfileData.ts` (`filterRequestsForAccount`), `formatCompactCurrency.ts`, `userPermissions.ts` (payment-mutation gate), `currency.ts`.

**Interfaces:**
- Consumes: `fetchLedger`, `postLedgerEntry`, `transferAllocation`, `deleteLedgerEntry` (Task 2); `computeBalance`, `outstandingTotal`, `requestOwed` (Task 2); `filterRequestsForAccount`; the account object + `sharedRequests` already available in `AccountsPage`.
- Produces: a self-contained modal component `AccountBillingPanel({ account, linkedRequests, propertyId, currency, theme, canEdit, onClose })`.

- [x] **Step 1: Create `AccountBillingPanel.tsx`**

Build a modal (same overlay/animation classes as `AccountLinkedRequestsModal.tsx`) with:
1. **Balance header** — `computeBalance(entries)`; green when `>= 0` (label "Prepaid credit"), red when `< 0` (label "Outstanding to collect"), using `formatCompactCurrency`.
2. **Add Deposit** — inputs (amount, method from `resolvePaymentMethodsForProperty`, note, date) → `postLedgerEntry({ type: 'deposit', ... })`, then refetch.
3. **Linked requests list** — for each request from `filterRequestsForAccount`, show total and `requestOwed(entries, req.id, total)`; render owed in **red** (`colors.red`) with the request number.
4. **History** — entries sorted by date/created; show type, request #, signed amount, user; a delete (undo) per entry when `canEdit` via `deleteLedgerEntry`.
5. **Transfer** — on an `allocation`/`cl_charge` row, a "Move to request" select → `transferAllocation(entry.id, toRequestId)`.

Fetch entries in a `useEffect` on mount via `fetchLedger(account.id, propertyId)`; keep a local `entries` state and refetch after each mutation. Gate all write buttons behind `canEdit`.

- [x] **Step 2: Wire the Billing button in `AccountsPage.tsx`**

Add `import AccountBillingPanel from './AccountBillingPanel';` and a state
`const [billingAccount, setBillingAccount] = useState<any | null>(null);`.
On the account profile header/actions (next to the existing linked-requests entry),
add a **Billing** button: `onClick={() => setBillingAccount(account)}`. Render:

```tsx
{billingAccount && (
  <AccountBillingPanel
    account={billingAccount}
    linkedRequests={filterRequestsForAccount(sharedRequests, billingAccount)}
    propertyId={String(activeProperty?.id || '')}
    currency={currency}
    theme={theme}
    canEdit={canMutateOperational(currentUser)}
    onClose={() => setBillingAccount(null)}
  />
)}
```

(Use whichever permission already guards Add Deposit; `canMutateOperational` is imported in `AccountsPage.tsx` L43. Confirm `filterRequestsForAccount`'s exact signature — it's imported L21 — and pass args accordingly.)

- [x] **Step 3: Verify build + types**

Run: `npm run build`
Expected: clean build; `AccountBillingPanel` type-checks.

- [x] **Step 4: Run the full frontend test suite**

Run: `npm run test:frontend`
Expected: PASS, including `accountBalance.test.ts`.

- [x] **Step 5: Commit**

```bash
git add AccountBillingPanel.tsx AccountsPage.tsx
git commit -m "feat(accounts): Billing panel with balance, owed, history, transfer"
```

- [x] **Step 6: Update the graph**

Run: `graphify update .`
(AST-only, keeps `graphify-out/graph.json` current after new files.)

---

## Self-Review

**Spec coverage:**
- Account deposit/credit ledger → Task 1 (table/API) + Task 4 (Add Deposit UI). ✓
- Apply balance to request, full or partial, capped → Task 2 (`applicableFromBalance`) + Task 3 (Balance option). ✓
- Balance blocked with exact message when ≤ 0 → Task 3 Step 2. ✓
- CL = collect later, charges full remaining, may go negative, red owed → Task 3 (cl_charge) + Task 2 (`requestOwed`/`outstandingTotal`) + Task 3 Step 5 badge. ✓
- Split/transfer allocations across requests → Task 1 `transfer_allocation` + Task 4 Step 1(5). ✓
- Account Billing view: balance, per-request, history, add deposit → Task 4. ✓
- Green at 0 / red when owed → Task 4 Step 1 + Task 3 Step 5. ✓

**Placeholder scan:** No TBD/TODO; all code steps include code. The `test_account_ledger.py` fixture is intentionally described as "copy from `test_account_rates.py`" with the exact helpers named — the implementer copies that concrete fixture (paste the real one when implementing).

**Type consistency:** `LedgerEntry`/`LedgerType` defined once in Task 2 and reused verbatim in Tasks 3-4; `computeBalance`/`applicableFromBalance`/`requestOwed`/`outstandingTotal` signatures match across tasks; backend entry shape (`type/amount/accountId/propertyId/requestId/method/note/date/user`) matches the frontend `LedgerEntry` field names (camelCase in payload).

**Known ceilings (`ponytail:`):** currency ignored (raw numbers); Balance-not-negative enforced client-side only; `requestOwed` uses a simple per-request model (allocations+collections offset the CL charge) rather than FIFO lot tracking.
