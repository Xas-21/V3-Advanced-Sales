# Property Scope + Billing Payment Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Canonical advisor plan (full STOP/done criteria):** `plans/055-property-scope-billing-payment-sync.md`

**Goal:** On refresh **anywhere in the app**, lists show only the active property’s data (shared stale-load kit); Billing allocate/move/split/undo and request payment offset stay in sync with `account_ledger` and `request.payments`; money UX uses in-app system notices (no browser `alert`/`confirm` on those paths).

**Architecture:** Add `propertyScopedLoad.ts` and apply it to **all** property-scoped fetches (shell AS collections, Requests, CRM/Accounts filters, Reports/Promotions/Contracts, Hub pages, Messenger). Introduce `accountPaymentSync.ts` so every Balance/allocation lifecycle dual-writes ledger + request payments (with `ledgerEntryId` on new payment rows). Undo posts a red negative “Balance refund” payment.

**Tech Stack:** React 18 + TypeScript + Vite, FastAPI ledger already shipped, vitest, existing `ConfirmDialog` / `showSystemNotice`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-account-balance-billing-design.md` + sync addendum in plan 055.
- Ponytail: one sync helper; copy AS stale-fetch guard; do not invent a second ledger; do not mass-replace Settings/CRM/Landing alerts.
- PowerShell: chain with `;` not `&&`.
- Do not commit unless the user asks.
- Before exploring: `graphify query` from project root. After code changes: `graphify update .`.

---

## File map

| File | Responsibility |
|------|----------------|
| `propertyScopedLoad.ts` | Site-wide begin/isCurrent property load gate |
| `propertyScopedLoad.test.ts` | Gate unit tests |
| `AS.tsx` | Shell collections use kit; clear on property change |
| `RequestsManager.tsx` | Scoped fetch + list filter; payment offset↔ledger; notices |
| `CRM.tsx` / `AccountsPage.tsx` / `Reports.tsx` / `PromotionsPage.tsx` / `Contracts.tsx` | Scoped loads + display filters |
| `dashboardHub/pages/*` | Hub fetches (Rooms/Feed/…) use kit; no unscoped fallback |
| `messenger/MessengerContext.tsx` | Property-scoped chat lists use kit |
| `AccountBillingPanel.tsx` | Dual-write actions + success notices + ConfirmDialog undo |
| `AccountsPage.tsx` | `onRequestsPatched` / `onNotice` into Billing panel |
| `accountPaymentSync.ts` | Shared allocate / transfer / split / undo / reverse helpers |
| `accountPaymentSync.test.ts` | Pure helper tests |
| `SystemNoticeModal.tsx` | Optional tiny extract if notice UI would be duplicated |
| `plans/055-…md` / this file | Tracking |

---

### Task 1: Site-wide property load kit (P0)

**Files:** create `propertyScopedLoad.ts` + test; apply in `AS.tsx`, `RequestsManager.tsx`, CRM/Accounts/Reports/Promotions/Contracts, `dashboardHub/pages/*` (esp. Rooms + Feed), `messenger/MessengerContext.tsx`

**Rules (every collection):** no fetch until `activeProperty.id`; always pass `propertyId`; begin/isCurrent around await; clear old rows on property change; display-filter with `recordVisibleOnProperty` / `requestInProperty`.

- [x] **Step 1:** Implement `beginPropertyLoad` / `isPropertyLoadCurrent` (+ optional hook) + vitest
- [x] **Step 2:** Migrate AS.tsx request/accounts/promotions/financials/taxes/crm/tasks/presence loads to the kit; clear on property change
- [x] **Step 3:** Fix RequestsManager (no unscoped fetch; list + seed filter)
- [x] **Step 4:** Hub Rooms — remove unscoped `/api/rooms` fallback; audit other hub/local fetches
- [x] **Step 5:** Reports / Promotions / Contracts / Messenger list loads use kit
- [x] **Step 6:** CRM/Accounts display filters (defense in depth)
- [ ] **Step 7:** Manual matrix — 2 properties, hard refresh each main route → only active property data
- [x] **Step 8:** `npm run test:frontend -- propertyScopedLoad`; `npm run typecheck` → exit 0

---

### Task 2: `accountPaymentSync` helper (TDD)

**Files:** create `accountPaymentSync.ts`, `accountPaymentSync.test.ts`

- [ ] **Step 1:** Write failing tests for attach/find/`withRefundPayment`/`recomputePaymentStatus`
- [ ] **Step 2:** Implement pure helpers; tests pass
- [ ] **Step 3:** Implement async allocate / transfer / split / undo / reverse-from-payment (ledger + `POST /api/requests` with `_update: true`, `credentials: 'include'`)
- [ ] **Step 4:** New Balance payments store `ledgerEntryId` from ledger POST response
- [ ] **Step 5:** `npm run test:frontend -- accountPaymentSync` → pass

---

### Task 3: Billing panel dual-write + notices

**Files:** `AccountBillingPanel.tsx`, `AccountsPage.tsx`

- [ ] **Step 1:** Add `onRequestsPatched` + `onNotice` props; wire from AccountsPage
- [ ] **Step 2:** Deposit+allocate / move / split / undo call sync helper (not ledger-only)
- [ ] **Step 3:** Undo → ConfirmDialog → red negative refund payment on request + ledger delete/reverse
- [ ] **Step 4:** Success notices: deposit, allocate, move, split, undo
- [ ] **Step 5:** Manual smoke of all four Billing actions against two linked requests
- [ ] **Step 6:** `npm run build` → exit 0

---

### Task 4: Request payment offset/delete restores balance

**Files:** `RequestsManager.tsx`

- [ ] **Step 1:** Balance/CL offset & delete call `reverseBalancePaymentOnRequest`
- [ ] **Step 2:** Replace payment-path `window.confirm` with `ConfirmDialog`
- [ ] **Step 3:** Replace Balance/CL `alert(...)` with `showSystemNotice`
- [ ] **Step 4:** Notice on successful Balance/CL payment add
- [ ] **Step 5:** Manual smoke — Balance pay → offset → Billing balance restored
- [ ] **Step 6:** `rg "alert\\(|window\\.confirm" RequestsManager.tsx` — no hits on payment/Balance/CL paths

---

### Task 5: Spec note + graphify + index

- [ ] **Step 1:** Document dual-write + `ledgerEntryId` + refund row in billing design spec
- [ ] **Step 2:** `graphify update .`
- [ ] **Step 3:** Mark `plans/055` DONE in `plans/README.md`
- [ ] **Step 4:** `npm run typecheck`; `npm run test:frontend -- accountPaymentSync accountBalance`; `npm run build`

---

## Self-Review

**Coverage:** site-wide property load kit ✓; refresh leak on all main routes ✓; move/allocate/split/undo sync ✓; offset restores ledger ✓; system notices on money paths ✓.

**Ponytail ceilings:** heuristic match for legacy payments without `ledgerEntryId`; no backend transaction yet; public/landing pages excluded (no activeProperty).

**Out of scope:** Hub live flags; Settings/CRM/Landing alert sweeps.
