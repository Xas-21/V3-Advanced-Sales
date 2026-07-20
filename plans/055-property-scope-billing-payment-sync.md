# Plan 055: Property-scoped request refresh + billing ↔ request payment sync

> **Executor instructions**: Follow step by step. Run every verification command and confirm the expected result before moving on. Honor "STOP conditions". Update this plan's status row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 805923b..HEAD -- RequestsManager.tsx AccountBillingPanel.tsx AccountsPage.tsx AS.tsx CRM.tsx Reports.tsx PromotionsPage.tsx Contracts.tsx Settings.tsx dashboardHub/ AccountBillingPanel.tsx accountBalance.ts accountLedgerApi.ts propertyScopedLoad.ts`
> If in-scope files drifted, re-read live excerpts before coding.
>
> **Also**: SDD checkbox twin — `docs/superpowers/plans/2026-07-20-property-scope-billing-payment-sync.md` (keep both in sync if you edit steps).

## Status

- **Priority**: P0 (property data leak on refresh — **site-wide**) + P1 (billing money correctness)
- **Effort**: L
- **Risk**: MED (money dual-write; must keep ledger + `request.payments` consistent)
- **Depends on**: none (billing ledger already shipped)
- **Category**: bug
- **Planned at**: commit `805923b`, 2026-07-20
- **Ponytail**: one shared `propertyScopedLoad` kit (not copy-paste refs per page); reuse AS stale-fetch idea; one `accountPaymentSync` helper for money; do **not** invent a second ledger; do **not** rewrite Settings/CRM/Landing browser alerts in this plan (only payment/billing/request money surfaces)

## Why this matters

1. **Refresh leak (site-wide)**: On browser refresh, any page that fetches before `activeProperty` is restored (or applies a late unscoped response) can show **another property’s** requests, accounts, CRM, promotions, rooms, etc. while the shell still shows the selected property. This must be fixed for **every** property-scoped surface, not only Requests / AS.
2. **Billing desync**: `AccountBillingPanel` mutates `account_ledger` only. Request UI reads `request.payments`. Move / allocate / split / undo look correct in Billing but wrong on the request — and offsetting a Balance payment on the request does not restore account credit.
3. **Browser chrome**: Balance/CL guards and some payment deletes still use `alert` / `window.confirm` (shows `localhost:5173`). Money UX must use the in-app system notice + `ConfirmDialog`.

## Current state

### Property refresh race (site-wide)

**Root pattern:** `activeProperty` starts `null` until `/api/properties` + localStorage restore finish. Any child that mounts and calls `GET /api/<collection>` without `propertyId` (or without a stale-response guard) can win the race and paint foreign rows.

**Already partially guarded in shell (`AS.tsx`):**
- `requestsLoadPropertyRef` / `promotionsLoadPropertyRef` / `financialsLoadPropertyRef` (~891–893, ~1521–1661)
- Skips some loads until `activeProperty?.id` exists
- Dashboard uses `scopedRequests` (~2004)

**Still vulnerable / incomplete (must cover in this plan):**

| Surface | File | Issue |
|---------|------|--------|
| Requests list | `RequestsManager.tsx` ~1366–1415 | Unscoped fetch when pid null; no stale guard; list not filtered |
| Shell accounts load | `AS.tsx` `fetchAccountsForProperty` / accounts effects ~927–1339 | Confirm every apply path uses same token guard + clear list on property change |
| CRM state | `AS.tsx` ~1710 crm-state fetch | Confirm stale guard + empty state while pid missing |
| Taxes / tasks / presence | `AS.tsx` | Align to shared kit |
| Hub Rooms | `dashboardHub/pages/DashboardHubRoomsPage.tsx` ~45 | Falls back to `/api/rooms` without propertyId |
| Hub other pages | `dashboardHub/pages/*` | Audit each local fetch; skip until pid; guard apply |
| Feed | `DashboardHubFeedPage.tsx` | Must not load feed for wrong/missing property |
| Reports / Promotions / Contracts | `Reports.tsx`, `PromotionsPage.tsx`, `Contracts.tsx` | Property-scoped fetches + display filters |
| CRM / Accounts UI | `CRM.tsx`, `AccountsPage.tsx` | Mostly consume shell props — still filter display with `recordVisibleOnProperty` / `requestInProperty` so a bad seed cannot leak |
| Messenger | `messenger/MessengerContext.tsx` | Property qs on list endpoints — skip until pid; ignore stale responses |

**Helpers already exist for display filter:** `recordVisibleOnProperty` / `requestInProperty` in `userProfileMetrics.ts` (~254–263).

**Ponytail kit to add (one module, reuse everywhere):**

```ts
// propertyScopedLoad.ts
export type PropertyLoadGate = { current: string }; // mutable token holder (useRef.current)

/** Call before await. Returns false if propertyId is empty (caller must not fetch). */
export function beginPropertyLoad(gate: PropertyLoadGate, propertyId: string | undefined | null): boolean;

/** Call after await, before setState. Returns false if property switched or cleared mid-flight. */
export function isPropertyLoadCurrent(gate: PropertyLoadGate, propertyId: string | undefined | null): boolean;

/** Optional React hook wrapping a ref + the two helpers. */
export function usePropertyLoadGate(): {
  gate: PropertyLoadGate;
  begin: (propertyId: string | undefined | null) => boolean;
  isCurrent: (propertyId: string | undefined | null) => boolean;
};
```

Rules for every property-scoped collection load on the site:

1. **Do not fetch** until `activeProperty?.id` is truthy (show empty / skeleton meanwhile).
2. **Always** pass `?propertyId=` (or equivalent) on list GETs — never unscoped “all assigned properties” on an operational page.
3. **After await**, only `setState` if `isPropertyLoadCurrent(gate, pid)`.
4. **On property change**, clear prior collection state immediately (or replace only after current load succeeds) so old rows never flash.
5. **Belt-and-suspenders:** list UIs also filter with `recordVisibleOnProperty` / `requestInProperty`.

### Billing vs payments (one-way ledger)

Working dual-write lives only in `RequestsManager` Balance/CL confirm (~L5630+): `postLedgerEntry` **and** `extraPayments` with `method: 'Balance'|'CL'`.

Billing panel ledger-only paths:

| Action | File | Gap |
|--------|------|-----|
| Allocate on deposit | `AccountBillingPanel.tsx:160-170` | no `request.payments` row |
| Move / transfer | `AccountBillingPanel.tsx:200-211` + `transfer_allocation` | ledger `requestId` only |
| Undo / delete ledger | `AccountBillingPanel.tsx:186-197` | leaves payment on request |
| Split | `AccountBillingPanel.tsx:215+` | ledger-only; no success notice |
| Offset/delete payment | `RequestsManager.tsx` ~2968, ~4909-4950 | payments-only; no ledger reverse |

`onSettleClRequests` in `AccountsPage.tsx` (~1024) only clears CL flags after deposits — does not sync payment rows.

Payment rows today have **no** `ledgerEntryId`, so undo/move matching is fragile unless we add that field going forward (and best-effort match for legacy rows).

### System notice patterns (reuse)

- `RequestsManager`: `showSystemNotice(title, message)` + modal ~L6252.
- `ConfirmDialog.tsx` — themed confirm (used for account/request delete).
- Anti-patterns still in money paths: `RequestsManager.tsx` `alert(...)` ~5495 / ~5607; `window.confirm` on payment remove ~2968 / ~4937.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npm run typecheck` | exit 0 |
| Frontend tests | `npm run test:frontend -- accountBalance` | pass |
| Build | `npm run build` | exit 0 |
| Graphify | `graphify update .` | completes |

## Scope

**In scope**

- **New** `propertyScopedLoad.ts` (+ small vitest) — site-wide begin/isCurrent gate (and optional hook)
- `AS.tsx` — migrate existing load refs to the kit; ensure accounts/crm/taxes/tasks/promotions/financials/presence/requests all follow the 5 rules; clear collections on property change
- `RequestsManager.tsx` — kit + list filter; Balance/CL notices; payment offset/delete ↔ ledger; money-path `alert`/`confirm` → system UI
- `CRM.tsx`, `AccountsPage.tsx`, `Reports.tsx`, `PromotionsPage.tsx`, `Contracts.tsx` — no unscoped list fetch; display filter; kit on any local async loads
- `dashboardHub/pages/*` (esp. Rooms, Feed, and any page that calls `/api/*` with optional propertyId) — skip until pid + stale guard
- `messenger/MessengerContext.tsx` — property-scoped conversation/user lists use kit
- `AccountBillingPanel.tsx` — dual-write via helper; success/error notices; ConfirmDialog for undo
- `AccountsPage.tsx` — pass `onSyncRequests` / notice callbacks into Billing panel
- **New** `accountPaymentSync.ts` (+ `accountPaymentSync.test.ts`) — allocate / transfer / split / undo / reverse-from-payment
- Spec note update under `docs/superpowers/specs/2026-07-19-account-balance-billing-design.md` (sync rule)

**Out of scope**

- Backend transactional ledger+payments API (frontend dual-write is enough for v1; `ponytail:` upgrade path = one FastAPI endpoint later)
- Changing tenant auth (`_filter_by_tenant`) — backend still returns all assigned properties when `propertyId` omitted; frontend must never omit it on operational pages
- Flipping Hub `live:` flags
- Replacing every `alert` in Settings / CRM / Landing / Feed (separate DX pass) — except money paths noted above
- Currency / FX on ledger
- Public pages without a property shell (`RequestFeedbackPublicPage`, `LandingPage`) — no activeProperty

## Suggested executor toolkit

- Graphify before grepping: `graphify query "activeProperty propertyId fetch RequestsManager DashboardHubRooms"`
- Superpowers: `executing-plans` or `subagent-driven-development` task-by-task
- Ponytail: one `propertyScopedLoad` kit + one `accountPaymentSync` helper — no per-page reinvented refs

---

## Steps

### Step 0: Drift check + read exemplars

Run the drift check. Read:

- `AS.tsx` `refreshSharedRequests` / promotions / financials guards (~891, ~1521–1661)
- `userProfileMetrics.ts` `recordVisibleOnProperty` / `requestInProperty`
- `RequestsManager` Balance confirm dual-write (~5630-5700)
- `AccountBillingPanel` allocate / move / undo / split
- `ConfirmDialog.tsx`
- Hub Rooms fetch fallback (`DashboardHubRoomsPage.tsx` ~45)

**Verify**: you can list every shell collection that loads by property before coding.

---

### Step 1 (P0): Site-wide property load kit + apply everywhere

**Create:** `propertyScopedLoad.ts`, `propertyScopedLoad.test.ts`

**Implement kit** (`beginPropertyLoad` / `isPropertyLoadCurrent` / optional `usePropertyLoadGate`) as in Current state.

**Apply (checklist — tick every row):**

| # | Target | Required behavior |
|---|--------|-------------------|
| 1 | `AS.tsx` requests / accounts / promotions / financials / taxes / crm-state / tasks / presence | Use kit; never unscoped list GET; clear state when pid changes or missing |
| 2 | `RequestsManager.tsx` `fetchRequests` / `fetchRequestsLive` / taxes | Same; filter `listPageRequests` + seed merge with `requestInProperty` |
| 3 | `CRM.tsx` / `AccountsPage.tsx` | Filter displayed accounts/requests/leads with `recordVisibleOnProperty`; no local unscoped collection fetch |
| 4 | `Reports.tsx` / `PromotionsPage.tsx` / `Contracts.tsx` | Scoped fetch + kit + display filter |
| 5 | `dashboardHub/pages/DashboardHubRoomsPage.tsx` | **Remove** unscoped `/api/rooms` fallback; skip until pid |
| 6 | Other hub pages that fetch (`Feed`, any rooms/venues/local loads) | Same rules |
| 7 | `messenger/MessengerContext.tsx` | Begin/isCurrent around conversation/user list loads keyed by property |

**Refactor note:** Replace ad-hoc `requestsLoadPropertyRef` / `promotionsLoadPropertyRef` / `financialsLoadPropertyRef` in AS with the shared kit (same behavior, one API).

**Verify**

- Manual matrix (user assigned to ≥2 properties):
  - Property A → hard refresh on Dashboard, Requests, CRM, Accounts, Reports, Promotions, Contracts, Hub Rooms, Feed, Messenger → **only A data**.
  - Switch to B → **only B data** (no A rows left in lists).
- `npm run test:frontend -- propertyScopedLoad` pass.
- `npm run typecheck` exit 0.

**STOP**: Do not “fix” by filtering only in one page. If a new fetch path is found mid-work, add it to the table above rather than shipping Requests-only.

---

### Step 2: Shared dual-write helper + `ledgerEntryId`

**Create:** `accountPaymentSync.ts`, `accountPaymentSync.test.ts`

**Responsibility:** keep ledger and `request.payments` aligned for Balance/allocation flows.

Suggested exports (names can match style; keep thin):

```ts
// Types
type SyncPayment = {
  id: string | number;
  amount: number;
  method: string; // 'Balance' | 'CL' | 'Balance refund' etc.
  date?: string;
  note?: string;
  ledgerEntryId?: string;
};

// Pure helpers (unit-tested)
export function attachLedgerId(payment: SyncPayment, ledgerEntryId: string): SyncPayment;
export function findPaymentForLedger(payments: SyncPayment[], ledgerEntryId: string, fallback?: { amount: number; method: string }): SyncPayment | undefined;
export function withRefundPayment(payments: SyncPayment[], amount: number, opts: { ledgerEntryId?: string; note?: string; date?: string }): SyncPayment[];
export function removeOrReduceBalancePayment(payments: SyncPayment[], amount: number, ledgerEntryId?: string): SyncPayment[];
export function recomputePaymentStatus(payments: SyncPayment[], requestTotal: number, collectLater?: boolean): { paidAmount: number; paymentStatus: string; collectLater?: boolean };

// Async (uses accountLedgerApi + fetch to /api/requests with credentials + _update: true)
export async function allocateBalanceToRequest(args: { accountId; propertyId; request; amount; date?; note?; user? }): Promise<{ request; ledgerEntry }>;
export async function transferBalanceBetweenRequests(args: { entry; fromRequest; toRequest; propertyId }): Promise<{ fromRequest; toRequest }>;
export async function splitBalanceAcrossRequests(args: { entry; fromRequest?; toRequest; splitAmount; accountId; propertyId }): Promise<...>;
export async function undoLedgerLinkedToRequest(args: { entry; request; propertyId }): Promise<{ request }>; // delete/reverse ledger + refund payment row
export async function reverseBalancePaymentOnRequest(args: { request; payment; accountId; propertyId }): Promise<{ request }>; // offset/delete → restore ledger
```

**Conventions**

- Persist requests with `{ ...req, _update: true, payments, paidAmount, paymentStatus, collectLater }` via `POST /api/requests` + `credentials: 'include'` (same as `AccountsPage` `onSettleClRequests`).
- New Balance payments **must** store `ledgerEntryId` from `postLedgerEntry` response `id`.
- Undo / move: prefer match by `ledgerEntryId`; fallback: `method === 'Balance'` + amount (± epsilon) + optional date.
- **Undo UX (user rule):** do not only delete the payment silently — append a **negative** payment row, method like `Balance refund` (or note `Refunded to account balance`), amount `-abs`, styled red via existing `isClPaymentMethod` / amount `< 0` coloring (extend `isClPaymentMethod` or add `isBalanceRefundMethod` if needed). Then recalc status so paid returns toward zero.
- Free-credit deposit (no allocate) = ledger only (no request payment) — OK.

**Tests (vitest):** pure helpers — attach id, find, refund row, recompute status after refund. No network.

**Verify:** `npm run test:frontend -- accountPaymentSync accountBalance` all pass.

---

### Step 3: Wire `AccountBillingPanel` through the helper

**Files:** `AccountBillingPanel.tsx`, `AccountsPage.tsx`

1. Extend props:

```ts
onRequestsPatched?: (requests: any[]) => void; // merge into sharedRequests
onNotice?: (title: string, message: string) => void; // system toast/modal from parent
```

2. Parent (`AccountsPage`): implement `onRequestsPatched` like `onSettleClRequests` merge + `onAfterRequestsMutate`; implement `onNotice` with a small local system-notice modal **or** lift a shared notice — match `RequestsManager` styling (dark card, dismiss). Prefer extracting a tiny `SystemNoticeModal.tsx` if both need it (`ponytail:` only if copy-paste would exceed ~40 lines twice).

3. Replace panel actions:
   - **Post deposit + allocate** → deposit ledger + `allocateBalanceToRequest` (or deposit then allocate helper).
   - **Move** → `transferBalanceBetweenRequests` then reload ledger.
   - **Split** → `splitBalanceAcrossRequests`; on success `onNotice('Split complete', '...')`.
   - **Undo** → `ConfirmDialog` then `undoLedgerLinkedToRequest` (refund payment on linked request) then reload ledger; `onNotice('Undone', '...')`.

4. Success notices for: deposit posted, allocated to request, moved, split, undone. Errors stay inline **and** notice.

**Verify (manual)**

- Deposit + allocate → request shows Balance payment + paid amount.
- Move allocation A→B → A loses Balance payment (or refunded), B gains it; panel history matches.
- Undo allocation → panel balance restores; request shows red negative refund line; paid ~0 (or reduced by undo amount).
- Split → both requests’ payments reflect split; notice appears.

**STOP**: If `postLedgerEntry` response shape lacks `id`, fix client typing first — do not invent ids client-side for linking.

---

### Step 4: Request payment offset/delete restores ledger

**Files:** `RequestsManager.tsx`

1. In `handleOffsetPayment` / `handleDeletePayment` / `removePaymentLine`: when payment `method` is `Balance` or `CL` (use `isClPaymentMethod` + Balance check):
   - Call `reverseBalancePaymentOnRequest` (delete matching ledger allocation / post compensating entry; for CL reverse `cl_charge` carefully — prefer delete matching `ledgerEntryId`).
2. Replace `window.confirm` with `ConfirmDialog` for those removes.
3. Replace Balance≤0 / missing-account `alert(...)` with `showSystemNotice(...)`.
4. After Balance apply success, ensure notice: `Payment added successfully` (or equivalent).

**Verify**

- Create Balance payment from request modal → ledger allocation exists.
- Offset/delete that payment → account Billing balance increases again; allocation gone (or reversed).
- No `alert(` / `window.confirm(` left on those payment paths (`rg "alert\\(|window\\.confirm" RequestsManager.tsx` should not hit Balance/CL/payment-delete lines).

---

### Step 5: Docs + graphify + index

1. Spec addendum in `docs/superpowers/specs/2026-07-19-account-balance-billing-design.md`: **ledger and `request.payments` stay dual-written for Balance/CL/allocation; payment rows store `ledgerEntryId`; undo posts a red negative refund payment.**
2. `graphify update .`
3. Mark this plan DONE in `plans/README.md` Batch K table.

**Verify:** `npm run typecheck && npm run build` exit 0; `npm run test:frontend -- accountPaymentSync accountBalance` pass.

---

## Done criteria

- [x] **Every** property-scoped page/collection uses `propertyScopedLoad` (or equivalent begin/isCurrent): no unscoped list GET on operational pages; no stale apply after property switch/refresh.
- [ ] Hard refresh on Dashboard / Requests / CRM / Accounts / Reports / Promotions / Contracts / Hub Rooms / Feed / Messenger with a multi-property user shows **only** the active property’s data. *(optional remaining — manual smoke)*
- [x] Billing allocate / move / split / undo updates **both** ledger and request payment records (including red refund on undo).
- [x] Offset/delete Balance payment on request restores account balance / removes allocation.
- [x] Money-path user messages use system notice / `ConfirmDialog` — not browser `alert`/`confirm` on those paths.
- [x] Tests for `propertyScopedLoad` + sync helpers pass; typecheck + build pass.
- [x] `plans/README.md` status updated.

## STOP conditions

- Cannot link ledger↔payment without response `id` — stop and report.
- Transfer of partial allocation amounts needs product decision beyond whole-entry move — implement whole-entry move + split first; stop if product demands partial move without split UI.
- Schema migration for `ledgerEntryId` on backend not required (store on payment JSON in request payload).

## Maintenance notes

- Any new Billing action that touches allocations must go through `accountPaymentSync.ts`.
- Reviewers: reject PRs that call `transferAllocation` / `deleteLedgerEntry` from the panel without updating requests.
- Later upgrade: single backend endpoint that dual-writes in one transaction.

## Considered and rejected (Ponytail)

| Idea | Why rejected |
|------|----------------|
| Filter only in UI, keep unscoped fetch | Race still loads foreign data into state / WS merges |
| Ledger as sole source for request paid | Breaks BEO / reports / payment tables that read `request.payments` |
| Rewrite all Settings/CRM alerts now | Out of scope; money paths only this plan |
| DB trigger linking payments↔ledger | Overkill; JSON `ledgerEntryId` is enough for v1 |
