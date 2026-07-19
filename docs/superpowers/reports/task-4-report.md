# Task 4 Report — Account Billing panel

**Branch:** `feat/account-balance-billing`  
**Scope:** `AccountBillingPanel.tsx` (create) + `AccountsPage.tsx` only  
**Date:** 2026-07-20  
**Commit:** `a796468`

## Status

**DONE_WITH_CONCERNS**

## Files changed

| File | Change |
|------|--------|
| `AccountBillingPanel.tsx` | **Created** — modal panel: balance header, add deposit, linked-request owed list, ledger history (undo), transfer select on `allocation`/`cl_charge` |
| `AccountsPage.tsx` | Import + `billingAccount` state; Billing button on account profile; mount panel with props |

## `filterRequestsForAccount` signature (found & used)

From `accountProfileData.ts` L13:

```ts
export function filterRequestsForAccount(
  requests: any[],
  accountId: string | undefined,
  accountName: string | undefined
): any[]
```

**Used as:**

```ts
filterRequestsForAccount(sharedRequests, billingAccount.id, billingAccount.name || aname)
```

(Plan Step 2 snippet passed the account object as the 2nd arg — that does not match the real API.)

## Panel behavior

- Loads via `fetchLedger(account.id, propertyId)` on mount; refetches after deposit / transfer / delete.
- Balance: `computeBalance` → green “Prepaid credit” (≥0) / red “Outstanding to collect” (<0) via `formatCompactCurrency`.
- Deposit: amount + `resolvePaymentMethodsForProperty(propertyId)` + note + date → `postLedgerEntry({ type: 'deposit', ... })`.
- Linked requests: total + `requestOwed(entries, req.id, total)` in red when owed.
- History: sorted by date/id; typed amount colored; Undo → `deleteLedgerEntry` when `canEdit`.
- Transfer: “Move to request” on `allocation`/`cl_charge` → `transferAllocation`.
- Writes gated by `canEdit={canMutateOperational(currentUser)}`.

## Build / test

- `npm run build` — **PASS** (vite, ~16s, exit 0).
- `npm run test:frontend` — **PASS** (29 files / 133 tests, incl. `accountBalance.test.ts`).

## Concerns

1. **Billing button placement:** CRMProfileView is out of scope, so the button sits in a slim AccountsPage toolbar above the profile (near View Requests conceptually) rather than inside the profile header action row next to “View Requests”.
2. **Payment methods:** panel calls `resolvePaymentMethodsForProperty(propertyId)` without the live `activeProperty` object (props don’t include it); falls back to LS / defaults — usually fine.
3. **No Docker runtime smoke** of deposit → Balance/CL → owed list end-to-end in this session.
4. **Deposit split UI:** design §5 mentions splitting a deposit across requests; plan Task 4 only requires transfer of existing `allocation`/`cl_charge` rows (implemented). New allocations from Billing still come via request Add Deposit (Task 3).

## Commit

```
git add AccountBillingPanel.tsx AccountsPage.tsx
git commit -m "feat(accounts): Billing panel with balance, owed, history, transfer"
```

Skipped plan Step 6 `graphify update` per task instructions.
