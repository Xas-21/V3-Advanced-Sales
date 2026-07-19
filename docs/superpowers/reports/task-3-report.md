# Task 3 Report — Request Add Deposit modal: Balance & CL

**Branch:** `feat/account-balance-billing`  
**Scope:** `RequestsManager.tsx` only  
**Date:** 2026-07-19

## Status

**DONE_WITH_CONCERNS**

## Edits (line anchors after implementation)

| Area | Approx. lines | Change |
|------|---------------|--------|
| Import | ~L76 | `computeBalance`, `applicableFromBalance`, `LedgerEntry`, `LedgerType` from `./accountBalance` |
| State | ~L773–775 | `ledgerEntries`, `paymentSource`, `balanceMode` |
| Effect + memo | ~L789–820 | Load ledger via `fetchLedger` when modal opens; `accountBalance = computeBalance(...)` |
| Form badge | ~L3835–3855 | Red **CL · Collect Later** when `accForm.collectLater` or `paymentStatus === 'CL'` |
| Detail badge | ~L4930–4952 | Same CL pill for `request.collectLater` / `paymentStatus === 'CL'` |
| Modal UI | ~L5445–5535 | Method / Balance / CL segmented control; balance radios; conditional method/amount fields; exact Balance≤0 alert |
| Confirm handler | ~L5545–5830 | Compute `effectiveAmt` / `postingMethod` / ledger type; `postLedgerEntry` before append; feed into existing form/detail/opts branches; CL sets `paymentStatus: 'CL'` + `collectLater: true` |
| Reset sites | open + close (`emptyNewPayment`) | `setPaymentSource('method'); setBalanceMode('full')` |

## Build / verify

- `npm run build` — **PASS** (vite production build, ~1m 35s, exit 0). No type errors from modal changes. Bundle emits `accountLedgerApi-*.js` (dynamic import) and updated `RequestsManager-*.js`.
- Normal methods: confirm path leaves `paymentSource === 'method'` as default; `effectiveAmt`/`effectiveMethod` stay `newPayment.amount`/`newPayment.method`; Method dropdown + amount field still shown; three-source branches (`form` / `detail` / else) and status auto-promotion unchanged except CL override of `paymentStatus`.
- Unit gate: logic capped in already-tested `accountBalance.ts` (`applicableFromBalance` / `computeBalance`). No component unit test (per plan).

## Concerns

1. **Form `requestDue`:** Form branch uses `calculateAccFinancialsForRequest(...).grandTotalWithTax` (adaptation) because draft `accForm` often lacks `totalCost`; detail/opts still use `totalCost` as in the plan.
2. **CL + paidAmount:** Confirm still appends a request payment for the full remaining due with method `CL`, so `paidAmount` can look fully paid while badge shows CL via `collectLater` / stored `paymentStatus`. Spec’s “owed remainder” is account-Billing (Task 4), not this badge.
3. **Ledger post failures:** `postLedgerEntry` is awaited before append; a network/API failure aborts the whole confirm (no request payment). Acceptable for integrity; no retry/toast yet.
4. **No runtime smoke** against Docker (Task 4 Billing deposit path not built yet) — Balance UX needs a ledger deposit via API or Task 4.

## Commit

```
git add RequestsManager.tsx
git commit -m "feat(requests): Balance & CL payment sources in Add Deposit modal"
```
