# Billing Deposit Delete + Stuck CL Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Admin-default permission to delete free account billing deposits, and fix stuck-red CL paid amounts (list after undo + payment records after settle).

**Architecture:** Extend `userPermissions` + gate Billing Undo for free deposits; fix `recomputePaymentStatus` so fully paid (or empty) CL clears; paint payment-table CL rows red only while CL is still open.

**Tech Stack:** React/TypeScript, Vitest, existing `accountPaymentSync` / `AccountBillingPanel` / `RequestsManager`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-21-billing-deposit-delete-cl-colors-design.md`
- Permission id exactly: `accounts.deleteBillingDeposits`
- Admin-only default (do not add to non-Admin `ROLE_DEFAULTS`)
- Free deposit = `entry.type === 'deposit' && !entry.requestId`
- Do not change non-CL unpaid-zero list styling beyond clearing stuck CL flags
- Keep lint ≤ `--max-warnings 2319`; prefer no new `any`
- Planned at: `87dcd8d`

---

### Task 1: Permission + Billing deposit Undo gate

**Files:**
- Modify: `userPermissions.ts`
- Modify: `AccountBillingPanel.tsx`
- Modify: `AccountsPage.tsx`

**Interfaces:**
- Produces: `canDeleteBillingDeposits(user: any): boolean`
- Produces: `AccountBillingPanel` prop `currentUser?: any` (or equivalent) used only for this gate

- [ ] **Step 1: Add permission id, label, modal section, helper**

In `userPermissions.ts`:

1. Add `'accounts.deleteBillingDeposits'` to `ALL_PERMISSION_IDS` (near other `accounts.*`).
2. Add label: `'Accounts: delete free billing deposits'`.
3. In `USER_MODAL_SECTIONS` Accounts `permissions` array, append `'accounts.deleteBillingDeposits'`.
4. Add helper after `canDeleteAccounts`:

```ts
export function canDeleteBillingDeposits(user: any): boolean {
    return can(user, 'accounts.deleteBillingDeposits');
}
```

Do **not** add this id to non-Admin entries in `ROLE_DEFAULTS` (Admin already gets `ALL_PERMISSION_IDS`).

- [ ] **Step 2: Gate free-deposit Undo in Billing panel**

In `AccountBillingPanel.tsx`:

1. Import `canDeleteBillingDeposits` from `./userPermissions`.
2. Add prop `currentUser?: any` to `AccountBillingPanelProps` and destructure it.
3. Helper:

```ts
function isFreeDeposit(entry: LedgerEntry): boolean {
    return entry.type === 'deposit' && !String(entry.requestId || '').trim();
}
```

4. Where Undo button is rendered (`canEdit ? ( <button ... Undo`)`), change to:

```ts
const showUndo =
    canEdit &&
    (!isFreeDeposit(entry) || canDeleteBillingDeposits(currentUser));
```

Only render Undo when `showUndo`.

5. At start of `runUndo`, after `if (!canEdit) return;`:

```ts
if (isFreeDeposit(entry) && !canDeleteBillingDeposits(currentUser)) {
    const msg = 'You do not have permission to delete free account deposits.';
    setError(msg);
    onNotice?.('Permission denied', msg);
    return;
}
```

- [ ] **Step 3: Pass currentUser from AccountsPage**

In `AccountsPage.tsx` where `<AccountBillingPanel` is rendered, add:

```tsx
currentUser={currentUser}
```

(Use the same `currentUser` prop/variable already available on the page.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`  
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add userPermissions.ts AccountBillingPanel.tsx AccountsPage.tsx
git commit -m "Add permission to delete free account billing deposits."
```

---

### Task 2: Fix `recomputePaymentStatus` for settled / empty CL (TDD)

**Files:**
- Modify: `accountPaymentSync.test.ts`
- Modify: `accountPaymentSync.ts`

**Interfaces:**
- Consumes: `recomputePaymentStatus(payments, requestTotal, collectLater?)`
- Produces: updated semantics — fully paid CL → Paid + `collectLater: false`; empty paid with stale CL flag and no positive CL lines → Unpaid + `collectLater: false`

- [ ] **Step 1: Update / add failing tests**

Replace the final assertion in the existing `recomputePaymentStatus` test that expects fully paid + `collectLater: true` → `CL`. New expectations:

```ts
  // Fully paid while collectLater was set → settle CL
  expect(recomputePaymentStatus(payments, 5000, true)).toEqual({
    paidAmount: 5000,
    paymentStatus: 'Paid',
    collectLater: false,
  });

  // Open CL (underpaid) still CL
  expect(recomputePaymentStatus(payments, 10000, true)).toEqual({
    paidAmount: 5000,
    paymentStatus: 'CL',
    collectLater: true,
  });

  // Stale CL flag after undo/refund to zero with no CL payment lines → Unpaid
  expect(recomputePaymentStatus(afterRefund, 5000, true)).toEqual({
    paidAmount: 0,
    paymentStatus: 'Unpaid',
    collectLater: false,
  });

  // Fully covering CL line settles
  const withClLine: SyncPayment[] = [
    { id: 'cl1', amount: 5000, method: 'CL' },
  ];
  expect(recomputePaymentStatus(withClLine, 5000, true)).toEqual({
    paidAmount: 5000,
    paymentStatus: 'Paid',
    collectLater: false,
  });

  // Underpaid CL line stays open
  expect(recomputePaymentStatus([{ id: 'cl2', amount: 1000, method: 'CL' }], 5000, true)).toEqual({
    paidAmount: 1000,
    paymentStatus: 'CL',
    collectLater: true,
  });
```

- [ ] **Step 2: Run tests — expect FAIL on old CL-always behavior**

Run: `npx vitest run accountPaymentSync.test.ts`  
Expected: FAIL (fully paid + collectLater still returns CL)

- [ ] **Step 3: Implement recompute**

In `accountPaymentSync.ts` `recomputePaymentStatus`, replace the early `if (collectLater) return CL` block with:

```ts
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
```

(Remove duplicate `const total = num(requestTotal)` if already declared below.)

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run accountPaymentSync.test.ts`  
Expected: exit 0, all tests pass

- [ ] **Step 5: Commit**

```bash
git add accountPaymentSync.ts accountPaymentSync.test.ts
git commit -m "Clear collect-later when billing payments settle or undo to unpaid."
```

---

### Task 3: Payment records color when CL is settled

**Files:**
- Modify: `RequestsManager.tsx` (payment tables in form + detail views)

**Interfaces:**
- Consumes: request/form `collectLater`, `paymentStatus`
- Produces: CL method/amount cells red only when `clOpen` is true

- [ ] **Step 1: Locate both payment tables**

Find the two blocks that use `isClPaymentMethod(p.method)` for method + amount cell colors (form ~4321 and detail ~5454).

- [ ] **Step 2: Key color off open CL**

In the **form** table scope (has `accForm`):

```ts
const clOpen = !!(accForm.collectLater || accForm.paymentStatus === 'CL');
```

Method cell:

```tsx
style={{ color: isClPaymentMethod(p.method) && clOpen ? colors.red : undefined }}
```

Amount cell:

```tsx
style={{
  color:
    p.amount < 0 || (isClPaymentMethod(p.method) && clOpen)
      ? colors.red
      : colors.green,
}}
```

In the **detail** table scope (has `request`):

```ts
const clOpen = !!(request.collectLater || request.paymentStatus === 'CL');
```

Same method/amount style pattern with `clOpen`.

Do **not** change the request-list `paid_amount` column logic (it already uses `clOpen` → red / else textMain or green).

- [ ] **Step 3: Typecheck + lint**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: typecheck exit 0; lint exit 0 (warnings ≤ 2319).

- [ ] **Step 4: Commit**

```bash
git add RequestsManager.tsx
git commit -m "Show settled CL payment rows in green once collect-later clears."
```

---

### Task 4: Index + verify

**Files:**
- Modify: `plans/README.md` — mark plan 058 DONE when execution finishes (executor may skip if reviewer maintains index)
- Modify: `docs/superpowers/specs/2026-07-21-billing-deposit-delete-cl-colors-design.md` — set Status to Implemented

- [ ] **Step 1: Full gates**

```bash
npm run typecheck
npx vitest run accountPaymentSync.test.ts
npm run lint
```

Expected: all exit 0

- [ ] **Step 2: Manual smoke (required)**

1. Admin: Billing → free deposit shows Undo; delete works.
2. Non-admin with `mutate.operational` but without `accounts.deleteBillingDeposits`: free deposit has no Undo; allocation Undo still works.
3. Allocate deposit to request → Undo → list paid amount 0 is **not red**.
4. Request with CL (red) → pay from Billing until settled → list green **and** payment records CL amount/method green.

- [ ] **Step 3: Commit docs if status rows updated**

```bash
git add plans/README.md docs/superpowers/specs/2026-07-21-billing-deposit-delete-cl-colors-design.md
git commit -m "Mark billing deposit-delete and CL color plan done."
```

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| `accounts.deleteBillingDeposits` + Admin default + modal | Task 1 |
| Gate free-deposit Undo only | Task 1 |
| `recomputePaymentStatus` settle when fully paid | Task 2 |
| Undo → clear stale CL → non-red zero | Task 2 |
| Payment records color by open CL | Task 3 |
| Verification / lint | Task 4 |

## Self-review

- No TBD placeholders.
- Existing test that expected fully paid + CL must be updated (called out in Task 2).
- Only `AccountsPage` hosts Billing panel — no other callers.
