# Plan 018: Redesign Hub Rooms tab (range honesty, gauges, Table)

> **Executor instructions**: Follow step by step. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- dashboardHub/pages/DashboardHubRoomsPage.tsx`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: `015-hub-chrome-foundation.md`
- **Category**: direction
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

Rooms hard-codes 90d occupancy/RevPAR with no RangeTabs, duplicates type vs capacity bars, uses a fragile radial gauge (`marginTop: -140`), raw HTML table, and `LoadingState` that looks empty (fixed in 013 kit — page must use it).

## Current state

- `DashboardHubRoomsPage.tsx` (~210 LOC)
- Local fetch `/api/rooms` via `apiUrl` (HubData has no rooms)
- Occupancy derived from hub `requests` for fixed 90d window
- Charts: Rooms by Type, Occupancy radial, Capacity by Type, optional size pie / room-nights trend, detail `<table>`

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Tests | `npm run test:frontend` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope:** `DashboardHubRoomsPage.tsx`  
**Out of scope:** Moving rooms into HubDataContext (nice follow-up, not required), backend rooms API

## Steps

### Step 1: Time window control

Add `RangeTabs` (default `'90'`) driving occupancy/RevPAR/request-derived series. Hero subtitle must state window. Inventory KPIs (total rooms/capacity) stay all-time.

**Verify**: switching 30D vs 90D changes occupancy metrics.

### Step 2: Merge type charts + fix gauge

- Combine “Rooms by Type” + “Capacity by Type” into one vertical bar with two series (`count`, `capacity`) or grouped bars
- Replace radial overlay with `Meter` / `Progress` + big number

### Step 3: shadcn Table + sections

- Inventory vs Utilization sections (`Section` from kit)
- Detail list → `src/components/ui/table` components, theme text colors via style/`colors`
- `useHubPageEnter([range, loading])`; Skeleton via LoadingState from kit while fetching

### Step 4: Empty / loading

Keep fetch; on error → EmptyState with clear text; never show gauges when `rooms.length === 0`.

## Done criteria

- [ ] RangeTabs affect utilization metrics
- [ ] No negative-margin radial hack
- [ ] shadcn Table for inventory detail
- [ ] Type+capacity not two nearly identical charts
- [ ] tsc / tests / build OK; README DONE

## STOP conditions

- Occupancy formula unclear after range change — keep existing formula, only change window bounds; do not invent PMS occupancy

## Maintenance notes

Pair visually with 019 MICE (inventory vs demand split).
