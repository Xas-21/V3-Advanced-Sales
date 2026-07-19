# Plan 048: Extract a shared currency-formatter hook (kill 8x duplication)

> **Executor instructions**: Follow step by step. This is a DRY refactor — behavior must not change. Run every verification. Honor "STOP conditions". Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- currency.ts AS.tsx RequestsManager.tsx Settings.tsx CRM.tsx`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (mechanical extraction; characterization tests from plan 041 guard the math)
- **Depends on**: 041 (currency tests give a safety net), 040 (typecheck)
- **Category**: tech-debt / duplication
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

The identical currency-formatter trio is re-declared in 8+ components. Any change to formatting rules must be made in 8 places, drift is already visible (some sites use `formatSar`, others `formatCurrencyAmount`), and this duplication is exactly what let BUG-01 hide (`selectedCurrency` "looks defined" because it usually is). One hook removes the duplication and the class of bug.

## Current state

The repeated block — `const selectedCurrency = resolveCurrencyCode(currency)` + `formatMoneyCompact` + `formatCurrencyAmount` wrappers — appears at:
- `AS.tsx:1379`, `AS.tsx:2815`
- `RequestsManager.tsx:401`
- `Settings.tsx:164`
- `CRM.tsx:276`
- `CRMProfileView.tsx:139`
- `AccountProfilePerformanceChart.tsx:69`
- `Reports.tsx:220`

Underlying helpers live in `currency.ts` (`resolveCurrencyCode`, `formatCurrencyAmount`), `formatCompactCurrency.ts`, `formatSar.ts`.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Find all sites | `grep -rn "resolveCurrencyCode(currency)" --include=*.tsx .` | the sites above |
| Typecheck | `npx tsc --noEmit` | no new errors |
| Tests | `npm run test:frontend` | all pass (incl. plan 041 currency tests) |

## Scope

**In scope**: a new hook file (e.g. `useCurrencyFormatters.ts`), and the 8 call sites above.
**Out of scope**: changing `currency.ts` math/rounding; changing displayed output (this must be a pure refactor).

## Steps

### Step 1: Create the hook

Create `useCurrencyFormatters.ts` exporting `useCurrencyFormatters(currency)` that returns `{ selectedCurrency, formatMoneyCompact, formatCurrencyAmount }`, wrapping the existing `currency.ts` helpers exactly as the current inline blocks do. Use `useMemo` keyed on `currency` so identities are stable. Do not change any formatting logic.

**Verify**: `npx tsc --noEmit` clean for the new file.

### Step 2: Replace each site, one at a time

For each of the 8 sites, replace the inline trio with `const { selectedCurrency, formatMoneyCompact, formatCurrencyAmount } = useCurrencyFormatters(currency);`. After **each** file, run the currency tests + typecheck so a regression is isolated to one file.

Where a site currently uses `formatSar` instead of `formatCurrencyAmount`, keep its current visible output (do not "unify" the display in this plan — that's a behavior change; note divergences in the report for a separate decision).

**Verify** (after each file): `npm run test:frontend` passes; `npx tsc --noEmit` no new errors.

### Step 3: Full pass

**Verify**: `grep -rn "resolveCurrencyCode(currency)" --include=*.tsx .` now shows only the hook; `npm run build` exits 0; `npm run test:frontend` passes.

## Done criteria

- [ ] `useCurrencyFormatters` hook exists and is used at all 8 sites.
- [ ] No visible formatting change (plan 041 currency tests still pass unchanged).
- [ ] `grep` shows the inline trio only inside the hook.
- [ ] `npm run build` exits 0; `npm run test:frontend` passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Plan 041's currency tests don't exist yet — land 041 first (they're the safety net) or add a quick characterization test before refactoring.
- A site's `formatSar` vs `formatCurrencyAmount` difference means the hook would change its output — keep that site's current behavior and report the divergence; do not unify here.
- Cited lines don't match (drift).

## Maintenance notes

- Follow-up (separate decision): unify `formatSar` vs `formatCurrencyAmount` usage once product confirms the intended display everywhere.
- Reviewer: diff the rendered output of one screen per theme before/after to confirm zero visual change.
