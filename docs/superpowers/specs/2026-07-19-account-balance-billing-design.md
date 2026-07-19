# Account Balance & Billing — Design Spec

**Date:** 2026-07-19
**Status:** Implemented (Billing on CRMProfileView; deposit allocate + split; Balance/CL on requests)
**Author:** Brainstormed with user via superpowers:brainstorming

## 1. Problem / Goal

Accounts prepay money that is not yet tied to a specific booking. Today the app
only records **per-request payments** (`request_payments`) — there is no concept
of money held at the **account** level. Sales needs to:

- Record a **deposit / credit balance** on an account (e.g. Account X pays 50k up front).
- **Apply that balance to one or more requests** linked to the account, either the
  full request amount or a partial amount.
- Mark a request as **CL (Collect Later)** when the client will pay after the service,
  charging it against the account balance and tracking what is still owed.
- See, from the **account page**, a **Billing** view: current balance, per-request
  allocation, outstanding (to-collect) amounts, full history, and an add-deposit action.

## 2. Decisions (locked with user)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Currency | **Ignored** — one balance number per account, raw amounts. `ponytail:` known ceiling; upgrade path = per-currency buckets. |
| 2 | "CL" meaning | **Collect Later** (receivable / pay after service). |
| 3 | Balance sign | **Single balance can go negative.** Positive = prepaid credit; negative = total owed. |
| 4 | Allocation | **Full ledger** — one deposit can be split across several requests; allocations can be transferred between requests later. |
| 5 | Scope | **Full** — backend ledger + request "Balance"/"CL" options + account Billing tab. |
| 6 | Balance underfunds a full-amount apply | **Cap at available balance** (partial payment); remainder stays due. |
| 7 | CL request marking | **"CL / Collect Later" badge** on the request + appears in account Billing outstanding list, owed amount in **red**. |

## 3. Architecture

The **ledger is the single source of truth**. A new relational child table of
`accounts` (mirroring the existing `account_contacts` / `account_activities`
pattern) stores every money movement. The account balance is always
`SUM(amount)` over its ledger entries — never a stored, drifting field.

Chosen over: (B) a JSON blob on `accounts` — breaks the relational child-table
pattern accounts already use; (C) deriving from `request_payments` only — cannot
represent unallocated deposits or transfers.

### 3.1 Data model — `account_ledger` (reuse the flat-collection framework)

`ponytail:` The backend already has a generic flat-collection framework
(`_upsert_doc` / `_list_doc` / `_delete_doc`, exposed as `list_flat` /
`upsert_flat` / `delete_flat`, driven by `_FLAT_WITH_PID` + `_EXTRACTORS`).
`account_rates` (migration `011`, router `account_rates.py`) uses it with almost
no bespoke code. The ledger reuses the same machinery — typed columns for
querying + a `payload jsonb` holding the full entry. This avoids hand-written
loader/upsert/delete SQL entirely.

New migration `012_account_ledger.py` (mirrors `011_account_rates.py` exactly):

```sql
CREATE TABLE IF NOT EXISTS account_ledger (
    id          TEXT PRIMARY KEY,
    property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
    account_id  TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    request_id  TEXT REFERENCES requests(id) ON DELETE SET NULL,
    entry_type  TEXT,               -- deposit | allocation | cl_charge | collection | refund | adjustment
    amount      NUMERIC,            -- signed
    payload     JSONB,              -- full entry: {type, amount, date, method, note, user, requestId, accountId, propertyId}
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_account_ledger_account ON account_ledger (account_id);
CREATE INDEX IF NOT EXISTS ix_account_ledger_property_updated ON account_ledger (property_id, updated_at DESC, id);
```

**Entry types and sign:**

| type | sign | request_id | created when |
|------|------|-----------|--------------|
| `deposit` | `+` | null (or set if applied immediately) | Account pays money in (Billing → Add Deposit) |
| `allocation` | `−` | required | Prepaid balance applied to a request via "Balance" option |
| `cl_charge` | `−` | required | Request set to CL — charges full remaining amount to the account |
| `collection` | `+` | optional | Owed CL money later paid in |
| `refund` | `−` | optional | Money returned to client |
| `adjustment` | `±` | optional | Manual correction |

**Balance = `SUM(amount)`** across all entries for the account.
Positive = prepaid credit available; negative = total outstanding (owed).

### 3.2 Backend — `backend/data_access.py` (minimal additions)

Register `account_ledger` in the flat framework — no bespoke SQL:

- Add `"account_ledger"` to `_FLAT_WITH_PID`.
- Add extractor `_extract_account_ledger(p)` → typed cols
  `{account_id, request_id, entry_type, amount}` (mirrors `_extract_account_rates`),
  and register it in `_EXTRACTORS`.
- Thin wrapper `save_ledger_entry(data) -> dict`: **normalize the amount sign by
  `type`** (deposit/collection → `+abs`; allocation/cl_charge/refund → `−abs`;
  adjustment → as-is) on the payload, then delegate to `upsert_flat("account_ledger", data, "LE")`.
  This is the one server-side data-integrity guard (not lazy about balance integrity).
- `transfer_allocation(entry_id, to_request_id)`: `get_flat` the entry, set
  `requestId = to_request_id` in its payload, `save_ledger_entry` it back
  (splitting = post one reduced allocation + one new allocation, both via `save_ledger_entry`).

The account **balance is not stored** — it is computed as `SUM(amount)` on the
client from the fetched entries (see §3.4). `ponytail:` the "Balance-apply must
not go negative" rule is enforced client-side in the modal (consistent with the
app's other client-side financial logic, e.g. `paymentStatus`); CL may go negative
by design. Upgrade path = a server-side balance check summing the collection.

### 3.3 Backend — API (`backend/routers/account_ledger.py`, mirrors `account_rates.py`)

New router registered in `main.py` next to `account_rates` (with `_auth_required`):

- `GET    /api/account-ledger?accountId=&propertyId=` → entries (filtered by account, tenant-scoped by `list_flat`).
- `POST   /api/account-ledger` → body is a full entry `{type, amount, accountId, propertyId, requestId?, method?, note?, date?}`; calls `save_ledger_entry`.
- `POST   /api/account-ledger/{id}/transfer` → body `{ toRequestId }`; calls `transfer_allocation`.
- `DELETE /api/account-ledger/{id}?propertyId=` → `delete_flat` (undo an entry).

Tenant/property write access is enforced by the flat framework
(`_assert_upsert_write_access` / `_assert_write_access`) — the real security boundary.

### 3.4 Frontend — shared helper `accountBalance.ts` (new)

Small pure module (keep the logic out of the giant components):

```ts
export type LedgerEntry = { id: string; requestId?: string; type: LedgerType; amount: number; date?: string; method?: string; note?: string; user?: string };
export function computeBalance(entries: LedgerEntry[]): number;         // sum
export function requestOwed(entries: LedgerEntry[], requestId: string, requestTotal: number): number; // CL remaining for one request
export function outstandingTotal(entries: LedgerEntry[]): number;       // -min(balance,0)
```

Plus a thin API client (extend `backendApi.ts` usage): `fetchLedger`, `postLedgerEntry`, `transferAllocation`.

## 4. Request-side UX — Add Deposit modal (`RequestsManager.tsx`)

The shared payment modal (currently one `method` dropdown + amount) gains a
**payment source** control while keeping existing methods working unchanged:

- **Existing methods** (Cash, Bank Transfer, …) — behave exactly as today (append a `request_payment`). No ledger involvement.
- **Balance** — enabled only when the linked account's balance > 0. Shows
  *"Available balance: {X} — from {account name}"*. Two radios:
  - **Deduct full request amount** → applies `min(available balance, request amount still due)` (decision #6: cap at available).
  - **Deposit only** → small numeric field for a partial amount (still capped at available balance).
  On confirm: create ① a `request_payment` with `method: "Balance"` (so
  `paidAmount`/`paymentStatus`/auto-status-promotion all work as they do now) **and**
  ② a ledger `allocation` (−) tied to this request+account.
- **CL** — always shown (payment after service). Charges the **full remaining
  request amount** as a ledger `cl_charge` (−), driving balance negative for any
  uncovered part. Marks the request with a **"CL / Collect Later"** badge
  (decision #7). The covered part (if balance was positive) is reflected as paid;
  the remainder is the owed amount shown in red.
- **Guard:** if balance ≤ 0 and user selects **Balance**, block with the exact
  message: *"Please choose a valid payment method, or CL if payment will be after the service."*

The account linked to the request is already available on the request
(`req.accountId` / `accForm.accountId`); the modal fetches that account's ledger
to show the live balance.

## 5. Account page — Billing tab (`AccountsPage.tsx` / `CRMProfileView.tsx`)

A new **Billing** panel on the account profile:

1. **Balance header** — large number; **green** when ≥ 0 ("prepaid credit"),
   **red** when < 0 ("outstanding to collect"). Zeroed CL shows green.
2. **Add Deposit** button → posts a `deposit` (+); optional immediate allocation
   to a linked request, or left as free credit.
3. **Linked requests list** — each request linked to this account with: total,
   amount covered from balance/CL, and **per-request owed amount in red** for CL.
4. **Ledger history** — chronological entries (deposit / allocation / CL charge /
   collection / refund / adjustment) with date, request #, amount, user.
5. **Transfer / split** — move an `allocation` from one request to another, or split
   a deposit across several requests.

Reuse existing data plumbing: linked requests via `filterRequestsForAccount`
(`accountProfileData.ts`); currency formatting via `formatCompactCurrency` /
`currency.ts`; permissions via `userPermissions.ts` (reuse the payment-mutation
permission that already gates Add Deposit).

## 6. Worked example (user scenario)

1. Account X deposits 50k → `deposit +50k`; balance **50k** (green).
2. Request R1 (30k): **Balance → deduct full** → `allocation −30k` + R1 payment 30k;
   balance **20k**; R1 shows Paid/Deposit as normal.
3. Request R2 (25k): **CL** → `cl_charge −25k`; balance **−5k** (red); R2 gets the
   CL badge and shows 5k owed on the account Billing outstanding list.
4. Client pays the 5k later: Billing → record `collection +5k`; balance **0** (green).

## 7. Non-goals / ceilings

- **Currency ignored** — raw numbers only (`ponytail:`). No FX conversion.
- No interest, no automated reminders/dunning, no PDF statements in v1.
- No approval workflow on deposits/refunds beyond the existing payment permission.

## 8. Files touched (map)

**Create**
- `backend/migrations/012_account_ledger.py` — new flat table + indexes (mirrors `011_account_rates.py`).
- `backend/routers/account_ledger.py` — GET/POST/transfer/DELETE (mirrors `account_rates.py`).
- `backend/tests/test_account_ledger.py` — API + sign-normalization + transfer tests.
- `accountBalance.ts` — pure balance/owed helpers.
- `accountBalance.test.ts` — vitest for the helpers (worked example §6).
- `accountLedgerApi.ts` — small ledger client (`fetchLedger`, `postLedgerEntry`, `transferAllocation`, `deleteLedgerEntry`).
- `AccountBillingPanel.tsx` — Billing panel UI, opened as a modal like `AccountLinkedRequestsModal.tsx` (keeps `AccountsPage.tsx` from growing).

**Modify**
- `backend/data_access.py` — add `account_ledger` to `_FLAT_WITH_PID`, `_extract_account_ledger`, register in `_EXTRACTORS`, add `save_ledger_entry` + `transfer_allocation`.
- `backend/main.py` — `include_router(account_ledger.router, dependencies=_auth_required)`.
- `RequestsManager.tsx` — payment source selector (Balance / CL) + guard in the shared Add Deposit modal.
- `AccountsPage.tsx` — a "Billing" button that opens `AccountBillingPanel`.

## 9. Testing

- **Backend (pytest, `backend/tests/test_account_ledger.py`):** `save_ledger_entry`
  sign normalization (deposit/collection → +, allocation/cl_charge/refund → −);
  POST then GET round-trips an entry filtered by `accountId`; transfer repoints
  `requestId`; tenant write guard rejects a foreign property. (Balance-not-negative
  is a client rule per §3.2, so it is covered by the frontend test, not backend.)
- **Frontend pure logic (`accountBalance.ts`):** `computeBalance`, `requestOwed`,
  `outstandingTotal` — the worked example (§6) as one assert-based check.
