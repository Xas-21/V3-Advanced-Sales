# Account Balance & Billing — Design Spec

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan
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

### 3.1 Data model — `account_ledger_entries`

New table (migration file, same style as `001_normalized_schema.sql`):

```sql
CREATE TABLE IF NOT EXISTS account_ledger_entries (
    id          TEXT PRIMARY KEY,
    account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    request_id  TEXT REFERENCES requests(id) ON DELETE SET NULL,
    type        TEXT NOT NULL,      -- deposit | allocation | cl_charge | collection | refund | adjustment
    amount      NUMERIC NOT NULL,   -- signed
    date        DATE,
    method      TEXT,               -- payment method for deposit/collection
    note        TEXT,
    entry_user  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON account_ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_request ON account_ledger_entries(request_id);
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

### 3.2 Backend — `backend/data_access.py`

Follow the existing account-children pattern (`_insert_account_contact`,
`_insert_account_activity`, the `_row_to_account_dict` loader, and the
DELETE-then-reinsert children block inside `upsert_account`).

- `_row_to_account_dict` also loads `ledger` (ordered by `created_at`, `id`) and
  computes `balance = sum(amount)`; both added to the account dict as
  `ledger: [...]` and `balance: number`.
- New helpers:
  - `add_ledger_entry(account_id, entry) -> dict` — insert one entry, broadcast, return it with new balance.
  - `list_ledger(account_id) -> list` — entries for the Billing history.
  - `transfer_allocation(account_id, entry_id, to_request_id) -> dict` — repoint an
    existing `allocation`/`cl_charge` entry's `request_id` (the "transfer/split"
    action; splitting = create a second smaller allocation and reduce the first).
- Ledger entries are **append-driven** via a dedicated endpoint (not rebuilt on
  every `upsert_account`, so a normal account edit never touches the ledger).

### 3.3 Backend — API (`backend/routers/accounts.py`, prefix `/api`)

- `GET  /accounts/{account_id}/ledger` → `{ balance, entries: [...] }`
- `POST /accounts/{account_id}/ledger` → body `{ type, amount, request_id?, method?, note?, date? }`; server enforces sign per type; returns new balance + entry.
- `POST /accounts/{account_id}/ledger/{entry_id}/transfer` → body `{ toRequestId }`.

Server-side rules (trust boundary — do not rely on the client):
- `deposit`/`collection` stored as `+abs(amount)`; `allocation`/`cl_charge`/`refund` as `−abs(amount)`.
- **Balance apply** (`allocation`) is rejected if it would drive balance < 0 (capped/blocked server-side); CL (`cl_charge`) is allowed to go negative.
- Tenant/property scope reused from existing account access checks (`_assert_write_access`).

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
- `backend/migrations/00X_account_ledger.sql` — new table + indexes.
- `accountBalance.ts` — pure balance/owed helpers.
- `AccountBillingPanel.tsx` — Billing tab UI (keeps `AccountsPage.tsx` from growing further).

**Modify**
- `backend/data_access.py` — ledger loader in `_row_to_account_dict`, `add_ledger_entry`, `list_ledger`, `transfer_allocation`.
- `backend/routers/accounts.py` — 3 ledger endpoints.
- `RequestsManager.tsx` — payment source selector (Balance / CL) + guard in the shared Add Deposit modal.
- `AccountsPage.tsx` / `CRMProfileView.tsx` — mount the Billing tab.
- `backendApi.ts` (or a small `accountLedgerApi.ts`) — ledger client calls.

## 9. Testing

- **Backend (pytest, `backend/tests/`):** balance = sum of entries; allocation cannot
  drive balance negative (rejected); cl_charge can; transfer repoints request_id;
  deposit/collection forced positive, allocation/cl_charge/refund forced negative.
- **Frontend pure logic (`accountBalance.ts`):** `computeBalance`, `requestOwed`,
  `outstandingTotal` — the worked example (§6) as one assert-based check.
