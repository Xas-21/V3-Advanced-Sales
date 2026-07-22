# Plan 067: Characterization tests for booking money math (safety net)

> **Executor instructions**: Follow step by step; verify each step; obey STOP conditions.
> A reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7d43062..HEAD -- RequestsManager.tsx accountBalance.ts backend/data_access.py`

## Status
- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (tests only; no behavior change)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `7d43062`, 2026-07-22

## Why this matters
Booking totals, tax stacking, promo application and ledger sign math run in floating-point with
essentially no automated tests (`plans/041` covered currency/format helpers but not the request
total calculators). Before we change anything money-related (or normalize CRM revenue), we need a
safety net that pins current outputs so a regression fails CI. This is a **characterization** net
— it captures today's behavior, not a redesign to Decimal (that can come later behind the net).

## Current state (verified)
- `RequestsManager.tsx:2096-2100` — `calculateAccFinancials` / `calculateEvtFinancials` run on every save; no tests.
- `accountBalance.ts:17-23` — `Number()` sums; only `accountBalance.test.ts` + `currency.test.ts` exist.
- `backend/data_access.py:394-401` — ledger sign map (`deposit/collection` +, `allocation/cl_charge/refund` −); `_as_decimal`→`float` (`:1427-1431`).
- Frontend test runner: `vitest` (`package.json:19` `test:frontend`). Backend: `pytest`.

## Scope
**In scope:** new `*.test.ts` for the request money calculators + ledger balance; new `backend/tests/test_ledger_signs.py`. Extract pure helpers ONLY if a calculator can't be imported without React (see Step 1). 
**Out of scope:** converting float→Decimal (a later plan behind this net); changing any calculation output.

## Steps

### Step 1: Make the calculators testable (minimal extraction if needed)
If `calculateAccFinancials`/`calculateEvtFinancials` are defined inside the React component and can't be imported, extract them verbatim into a pure module `requestFinancials.ts` (no behavior change) and import back into `RequestsManager.tsx`. If they're already pure/exported, skip extraction.
**Verify**: `npx tsc --noEmit` exit 0; app still builds.

### Step 2: Golden-fixture tests (pin current outputs)
Create `requestFinancials.test.ts` with 3 realistic request shapes: (a) rooms-only, (b) MICE/event-only with tax stack, (c) event+rooms with a promotion. Compute today's outputs once, paste them as the expected golden values, and assert. Include one known-tricky case (multiple taxes + rounding).
**Verify**: `npx vitest run requestFinancials.test.ts` all pass.

### Step 3: Ledger sign test (backend)
`backend/tests/test_ledger_signs.py`: assert `deposit`/`collection` → positive, `allocation`/`cl_charge`/`refund` → negative, `adjustment` → as-is, using `data_access._signed_ledger_amount`. Model after `backend/tests/test_account_ledger.py`.
**Verify**: `cd backend && python -m pytest tests/test_ledger_signs.py -v` pass.

### Step 4: Balance test
Extend or add a `accountBalance` test covering deposit − allocation + collection − refund across a small ledger, pinning the current total.
**Verify**: `npx vitest run` all pass.

## Done criteria
- [ ] New FE money tests exist and pass (`vitest run`)
- [ ] New backend ledger-sign test passes (`pytest`)
- [ ] No calculation output changed (only tests + optional verbatim extraction)
- [ ] `npx tsc --noEmit` exit 0; only in-scope files changed

## STOP conditions
- Extracting a calculator changes any output value (it must be a verbatim move).
- A "golden" value looks wrong (a real bug) — record it and report; do NOT silently encode a bug as expected without flagging it to the reviewer.

## Maintenance notes
- Reviewer: this net enables a future float→Decimal migration; that migration must keep these tests green (or update goldens deliberately).
