# Plan 019: Redesign Hub MICE tab (inventory vs demand)

> **Executor instructions**: Follow step by step. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- dashboardHub/pages/DashboardHubMicePage.tsx`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: `015-hub-chrome-foundation.md`; mirror patterns from `018-hub-rooms-redesign.md`
- **Category**: direction
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

MICE mixes venue inventory and event demand without clear sections; `hasVenues = venues.length > 0 || miceReqs.length > 0` can show a half-empty page; no date range; double pies; raw table; local `/api/venues` fetch.

## Current state

- `DashboardHubMicePage.tsx` (~188 LOC)
- Fetch venues; filter requests by MICE segment / event dates
- Seasonal composed chart is the strongest unique viz — promote it

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Tests | `npm run test:frontend` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope:** `DashboardHubMicePage.tsx`  
**Out of scope:** Venue CRUD, HubData venues injection (optional later)

## Steps

### Step 1: Two sections with honest empties

1. **Venue inventory** — KPIs + capacity bars + shadcn Table; EmptyState if no venues  
2. **Event demand** — RangeTabs (default 90); seasonal chart primary; event-type mix secondary; EmptyState if no MICE requests in range  

Page may show inventory-only or demand-only without forcing both.

### Step 2: Reduce pie fatigue

Keep at most one pie/donut; prefer bars for capacity tiers. Promote seasonal demand as primary chart (full width).

### Step 3: Chrome

`useHubPageEnter`; LoadingState while venues fetch; theme-safe colors.

### Step 4: Soften hasData gate

Remove OR-gate that pretends the page is “full” when only one side has data; render sections independently.

## Done criteria

- [ ] Inventory and demand sections independent
- [ ] RangeTabs on demand metrics
- [ ] ≤1 pie; seasonal chart primary
- [ ] shadcn Table for venues
- [ ] tsc / tests / build OK; README DONE

## STOP conditions

- MICE segment heuristic (`segment === mice` / event dates) must stay — do not redefine MICE taxonomy without product input

## Maintenance notes

Keep Rooms/MICE twin patterns aligned for future HubData inventory.
