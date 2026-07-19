# Plan 022: Redesign Hub Promotions tab (filter-aligned KPIs)

> **Executor instructions**: Follow step by step. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- dashboardHub/pages/DashboardHubPromotionsPage.tsx`

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: `015-hub-chrome-foundation.md`
- **Category**: direction
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

Default range is `'all'` unlike peers’ `'90'`. MiniStats use full `enriched` while charts use `filtered` — Active/Expired ignore chips/range. No campaign list or bridge to `PromotionsPage.tsx`.

## Current state

- `DashboardHubPromotionsPage.tsx` (~164 LOC)
- `effectiveStatus` date-aware; FilterChips for status; charts for status/type/discount/timeline

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Tests | `npm run test:frontend` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope:** `DashboardHubPromotionsPage.tsx`  
**Out of scope:** `PromotionsPage.tsx` editor

## Steps

### Step 1: Align defaults + KPIs

- Default `range` to `'90'`
- Compute Active/Expired/Total/Avg discount from **`filtered`** (or add separate “Active now (all-time)” MiniStat explicitly labeled)

### Step 2: Hierarchy

- Primary: KPIs + timeline  
- Secondary: status/type/discount  
- When `filtered.length === 0` but `enriched.length > 0`, show EmptyState “No promotions match filters” (not page-level empty)

### Step 3: Campaign table + chrome

- shadcn Table of filtered promos (title, status Badge, dates, discount)
- Status Badge colors from theme tokens (Active=green, Expired=red, Scheduled=blue, Draft=muted)
- `useHubPageEnter([range, statusFilter])`

## Done criteria

- [ ] Default range 90D
- [ ] KPI numbers match visible filters (or explicitly labeled exceptions)
- [ ] Filter-empty vs no-data distinguished
- [ ] Table + Badges; motion wired
- [ ] tsc / tests / build OK; README DONE

## STOP conditions

- `effectiveStatus` logic must stay date-correct — do not simplify to raw `status` field only

## Maintenance notes

Bridge to promotions editor deferred until AS exposes view switch.
