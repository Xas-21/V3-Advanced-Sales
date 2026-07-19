# Plan 021: Redesign Hub Accounts tab (range scope + Table)

> **Executor instructions**: Follow step by step. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- dashboardHub/pages/DashboardHubAccountsPage.tsx`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `015-hub-chrome-foundation.md`
- **Category**: direction
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

RangeTabs mostly only affect “New (XD)” MiniStat; type/location/top charts are all-time while the control implies period filtering. Raw HTML table; no link into operational `AccountsPage.tsx`.

## Current state

- `DashboardHubAccountsPage.tsx` (~185 LOC)
- Hub analytics only — does not embed `AccountsPage.tsx`
- Top accounts table at bottom (~raw `<table>`)

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Tests | `npm run test:frontend` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope:** `DashboardHubAccountsPage.tsx`  
**Out of scope:** `AccountsPage.tsx` CRUD (Batch B already optimized list)

## Steps

### Step 1: Make range meaningful OR honest

Pick one (prefer A):
- **A:** Filter creation-trend and “new accounts” clearly; relabel RangeTabs area “New accounts window”; keep portfolio mix as “All-time portfolio” Section
- **B:** Filter top revenue using requests in range only; label charts accordingly

Do not leave RangeTabs implying all charts are filtered.

### Step 2: Layout

- Primary: KPIs + type mix + top revenue (range-aware if B)
- Secondary: locations + creation vs activity
- shadcn `Table` for top accounts; truncate long names
- `useHubPageEnter`

### Step 3: Location grain

Prefer `country` then `city`; label column “Location” with value showing whichever used.

### Step 4: Bridge copy

Footer note: manage accounts via sidebar Accounts — unless a view-switch helper exists.

## Done criteria

- [ ] Range control labeling matches filtered series
- [ ] shadcn Table for top accounts
- [ ] Motion wired
- [ ] tsc / tests / build OK; README DONE

## STOP conditions

- None beyond 013 dependency

## Maintenance notes

Keep Hub vs AccountsPage separation (insight vs CRUD).
