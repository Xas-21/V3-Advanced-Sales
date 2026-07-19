# Plan 041: Characterization tests for money, revenue, and booking-critical logic

> **Executor instructions**: Follow step by step. These are characterization tests — they pin **current** behavior so future refactors can't silently break money/booking output. Run every verification. Honor "STOP conditions". Update this plan's status row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- currency.ts reportsVsLastYear.ts contractsStore.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (tests only — no production code changes)
- **Depends on**: 040 (so the new tests are enforced by CI)
- **Category**: tests
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

All 10 existing frontend test files cover peripheral utilities. The features the product exists for — **currency/revenue math, revenue-vs-last-year, and contract totals** — have **zero** automated coverage. A refactor to any of these can silently produce wrong money on invoices/reports with no failing test. Characterization tests (assert the current output for representative inputs) are the highest-leverage safety net before any further change to these modules.

This plan writes **pure-function** tests only (fast, no DOM/network) — the highest value for the least effort. A booking-wizard component smoke test is noted as an optional follow-up.

## Current state

Target the pure calculation modules (read each before writing tests to capture the *actual* current behavior — do not assume):

- `currency.ts` — `resolveCurrencyCode(...)`, `formatCurrencyAmount(...)`, and any rounding helpers. Used across dashboards for all money display.
- `reportsVsLastYear.ts` — `buildVsLyMatrix(...)` (or the exported revenue-delta builder). Powers "vs last year" reports.
- `contractsStore.ts` — the contract **total/amount math** (find the exported pure helpers that compute totals before PDF/DOCX generation; do NOT test the jsPDF/docxtemplater rendering itself).
- `formatSar.ts` / `formatCompactCurrency.ts` — compact currency formatting used in KPIs.

Existing test conventions (match these):
- Framework: **vitest** (`npm run test:frontend` → `vitest run`).
- Pattern to model after: `accountRates.test.ts` and `userProfileMetrics.test.ts` (root-level `*.test.ts`, `import { describe, it, expect } from 'vitest'`, direct imports of the util under test).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Run all frontend tests | `npm run test:frontend` | all pass incl. new |
| Run one file | `npx vitest run currency.test.ts` | pass |

## Scope

**In scope** (create):
- `currency.test.ts`
- `reportsVsLastYear.test.ts`
- `contractsStore.calc.test.ts` (pure total math only)
- `formatCompactCurrency.test.ts` (if not already covered)

**Out of scope**:
- Any change to the production modules under test (this is characterization — if you find a bug, record it as a finding, do not fix it here).
- Testing PDF/DOCX byte output, jsPDF, docxtemplater, or DOM rendering.
- The booking wizard component (`RequestsManager.tsx`) — optional follow-up, not this plan.

## Steps

### Step 1: Characterize `currency.ts`

Read `currency.ts`. For each exported pure function, write `it(...)` cases capturing current output for: a normal SAR amount, zero, a negative, a large value (thousands separator), and an unknown/edge currency code for `resolveCurrencyCode`. Assert the **actual** returned strings/values (run the function mentally or via a scratch test to read current output, then pin it).

**Verify**: `npx vitest run currency.test.ts` → PASS.

### Step 2: Characterize `reportsVsLastYear.ts`

Read the exported matrix/delta builder. Construct a small representative input (this-year vs last-year figures for 2–3 segments, including a zero-last-year row to pin the divide-by-zero/percent behavior) and assert the full output structure.

**Verify**: `npx vitest run reportsVsLastYear.test.ts` → PASS.

### Step 3: Characterize contract total math

Read `contractsStore.ts` and identify the pure functions that compute contract/line totals (before rendering). Write cases for: single line, multiple lines, tax/rounding if present, and empty. Assert current totals.

If the total logic is **not** extractable as a pure function (entangled with PDF generation), STOP and report — extracting it is a separate refactor plan, not this one.

**Verify**: `npx vitest run contractsStore.calc.test.ts` → PASS.

### Step 4: Full suite

**Verify**: `npm run test:frontend` → all pass (38 existing + new).

## Test plan

- New files listed in Scope, patterned on `accountRates.test.ts`.
- Each asserts current (characterized) behavior; total new tests ≥ ~15 across the files.
- Verification: `npm run test:frontend` green.

## Done criteria

- [ ] `npm run test:frontend` exits 0 with the new test files present and passing.
- [ ] `currency.ts`, `reportsVsLastYear.ts`, and contract total math each have ≥1 dedicated test file.
- [ ] No production module modified (`git status` shows only new `*.test.ts` files).
- [ ] Any behavior that looks like a bug is listed in the completion report (not fixed here).
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Contract total logic cannot be tested without invoking PDF/DOCX generation — report; needs an extraction plan first.
- A function's current output looks clearly wrong (e.g. money rounding errors) — pin current behavior in the test with a `// characterization: suspected bug, see report` note and report it; do not fix in this plan.

## Maintenance notes

- These are characterization tests: if a future PR *intentionally* changes money formatting, it must update these tests deliberately (that's the point — the change becomes visible in review).
- Optional follow-up: a happy-path smoke test of the `RequestsManager` booking wizard (needs `@testing-library/react` + jsdom; larger setup).
- Reviewer: confirm no production code changed and that edge cases (zero, negative, divide-by-zero) are covered.
