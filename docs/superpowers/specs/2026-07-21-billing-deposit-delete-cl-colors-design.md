# Account Billing — Deposit Delete Permission + Stuck CL Colors

**Date:** 2026-07-21  
**Status:** Approved (awaiting spec file review → implementation plan)  
**Author:** Brainstormed with user via superpowers:brainstorming

## 1. Problem / Goal

Three related gaps after plan 055 billing dual-write:

1. **Delete free deposit** — Operators need to remove an unallocated account deposit from the Billing panel, but only users with an explicit permission (Admin by default; grantable later in Edit User).
2. **Red zero after undo** — Allocate a deposit to a request from Billing, then Undo: request list paid amount shows **0 in red**. Expected: **normal (black/textMain) zero** when there is no open CL.
3. **CL payment records stay red after settle** — Request with CL shows red (expected). Paying from Billing turns the **list** amount green, but **payment records** (method + amount cells) stay red. Expected: settled CL lines show **green** like other paid money.

Out of scope: changing unpaid-zero color for non-CL requests; backend broadcast / WS work; renaming Undo for allocations.

## 2. Decisions (locked with user)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Who may delete free deposits | New permission; **Admin only by default**; grant via Edit User modal |
| 2 | Permission scope | **A** — only free-credit deposits (`type === 'deposit'` and no `requestId`). Allocations / CL Undo stay on normal billing `canEdit` |
| 3 | Unpaid zero color policy | **Only fix stuck-red CL cases** — do not change general unpaid-zero styling for non-CL requests |
| 4 | Approach | Permission + **data/status fix** + payment-row color keyed to **open CL**, not “method === CL forever” |

## 3. Architecture

### 3.1 Permission

- Id: `accounts.deleteBillingDeposits`
- Label: `Accounts: delete free billing deposits`
- Add to `ALL_PERMISSION_IDS`, `PERMISSION_LABELS`, and `USER_MODAL_SECTIONS` → Accounts section.
- `ROLE_DEFAULTS`: Admin already gets all via `ALL_PERMISSION_IDS`. Do **not** add to other roles’ default sets.
- Helper: `canDeleteBillingDeposits(user)` → `can(user, 'accounts.deleteBillingDeposits')` (same style as `canDeleteAccounts`).

### 3.2 Billing panel gate

In `AccountBillingPanel.tsx`:

- Accept `currentUser` (or a boolean `canDeleteDeposits`) from `AccountsPage` (and any other Billing host).
- Show **Undo** on a free deposit only if `canEdit && canDeleteBillingDeposits(...)`.
- `runUndo` must refuse free-deposit delete without that permission (UI hide is not enough).
- Allocations / `cl_charge` / deposits that already have `requestId`: unchanged — still `canEdit`.

### 3.3 Stuck CL status (data)

Root causes:

- `recomputePaymentStatus` in `accountPaymentSync.ts` returns `paymentStatus: 'CL'` whenever `collectLater` is true — even if payments already cover the total.
- Request list `paid_amount` uses `clOpen = collectLater || paymentStatus === 'CL'` → red.
- After Undo of a Balance allocation, dual-write can leave `collectLater: true` / `CL` with net paid ≈ 0 → red zero.
- Billing settle path (`onSettleClRequests`) already sets `Paid` + `collectLater: false` on list; payment **rows** still paint red solely because `isClPaymentMethod(p.method)`.

Fixes:

1. **`recomputePaymentStatus`**: If `collectLater` but payments meet/exceed request total (same `paymentsMeetOrExceedTotal` rule), treat as settled: `paymentStatus: 'Paid'`, `collectLater: false`. If collectLater and paidAmount ≤ 0 (and not still owing via open CL charge semantics), return `Unpaid` + `collectLater: false` when there is no remaining CL debt signal — keep CL only while CL is still an open receivable (positive CL exposure / unpaid CL). Prefer the minimal rule:

   - If `collectLater` and `paymentsMeetOrExceedTotal(paidAmount, total)` → `{ paidAmount, paymentStatus: 'Paid', collectLater: false }`
   - Else if `collectLater` → keep CL (current behavior for open CL)
   - Else existing Unpaid / Deposit / Paid logic

2. **Undo / allocate dual-write** — already goes through `applyPaymentsToRequest` → will pick up the new recompute. Ensure patched requests merge into `sharedRequests` (already via `onRequestsPatched`).

3. **Do not** invent a new list color scheme for non-CL zeros.

### 3.4 Payment records color

In `RequestsManager.tsx` payment tables (form + detail):

- Today: method and amount use red if `isClPaymentMethod(p.method)` always.
- Change: red for CL method/amount only when the **request still has open CL** (`collectLater || paymentStatus === 'CL'` after status recompute — i.e. `clOpen`).
- When CL is settled (`!clOpen`), CL method rows use the same green path as other positive payments (negative amounts stay red).

## 4. Files (expected)

| File | Change |
|------|--------|
| `userPermissions.ts` | New permission id, label, Accounts modal section, helper |
| `AccountBillingPanel.tsx` | Gate free-deposit Undo; pass/check permission |
| `AccountsPage.tsx` | Pass `currentUser` / permission into Billing panel |
| `accountPaymentSync.ts` (+ tests) | Settle CL in `recomputePaymentStatus` when paid in full |
| `RequestsManager.tsx` | Payment row colors depend on open CL |

## 5. Verification

- Admin sees Undo on free deposit; non-Admin with billing edit but without the new grant does not; granting via Edit User enables it.
- Allocate deposit → request → Undo → list paid amount is 0 with **non-red** (textMain) color when not CL.
- Request with CL (red) → pay from Billing until settled → list green **and** payment records CL lines green.
- `npm run typecheck`, focused vitest on `accountPaymentSync`, `npm run lint` within ratchet.

## 6. Non-goals

- Deleting allocated deposits that still have `requestId` via this permission (use existing Undo / reverse flows).
- Changing unpaid zero color for never-CL requests.
- New backend permission check endpoint (client permission + existing authz on ledger delete is enough for this pass; server-side perm mirror can be a follow-up if IDOR on ledger delete is a concern).
