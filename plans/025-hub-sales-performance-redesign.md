# Plan 025: Redesign Hub Sales Performance (metric consistency + kit parity)

> **Executor instructions**: Follow step by step. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- dashboardHub/pages/DashboardHubSalesPerformancePage.tsx`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (revenue definition)
- **Depends on**: `015-hub-chrome-foundation.md`
- **Category**: direction
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

Local `StatCard` (~L117–128) diverges from kit `MiniStat`. Per-rep `revenue` includes pending (~L63) while page KPI `totalRevenue` is won-only (~L113) — chart/table vs KPI mismatch. Dense stack: multiple bars + radar + table. Parallel concept to Settings `UserPerformanceDashboard` but separate UI.

## Current state

- `DashboardHubSalesPerformancePage.tsx` (~244 LOC)
- Leaderboard from requests via `resolveUserKey` / won-lost helpers
- Radar for top 5 reps

**Do not redesign Settings `UserPerformanceDashboard.tsx` here.**

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Tests | `npm run test:frontend` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope:** `DashboardHubSalesPerformancePage.tsx`  
**Out of scope:** Unifying with Settings performance dashboard metrics engine (future plan)

## Steps

### Step 1: Align revenue definition

Choose **won-only** as the primary revenue (matches KPI):
- `repStats.revenue` = sum of won only
- Add optional `pipelineValue` field for pending+won if needed for a secondary chart
- Table columns: Won revenue | Pipeline (optional) | Conversion | Requests
- Chart titles must say “Won revenue” where applicable

### Step 2: Replace StatCard with MiniStat

Delete local `StatCard`; use kit `MiniStat` for parity with sibling tabs.

### Step 3: Hierarchy + motion

- Primary: KPIs + leaderboard Table (shadcn) + won vs pipeline trend  
- Secondary Tabs: By volume | By conversion | Compare (radar)  
- Radar only in Compare tab (reduces default density)
- `useHubPageEnter([range])`
- Optional: highlight rank-1 row with subtle `colors.primary` border (CSS), not loud GSAP loops

### Step 4: Empty / range

Keep RangeTabs; EmptyState when no reps; exclude NaN dates from range like other plans.

## Done criteria

- [ ] Won revenue definition consistent across KPI, bars, table
- [ ] No local StatCard
- [ ] Radar not on default view
- [ ] shadcn Table leaderboard; motion wired
- [ ] tsc / tests / build OK; README DONE

## STOP conditions

- Product requires pending-included revenue as primary — stop and confirm; then label KPIs “incl. pipeline” everywhere consistently instead of mixing

## Maintenance notes

Future: share status helpers (`isWon`/`isLost`) with Settings dashboard — out of scope.
