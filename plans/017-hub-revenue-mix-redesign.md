# Plan 017: Redesign Hub Revenue Mix (collection-first, de-dupe vs Requests)

> **Executor instructions**: Follow step by step. Verify each step. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- dashboardHub/pages/DashboardHubRevenueMixPage.tsx`

## Status

- **Status**: DONE (2026-07-15) — preview promoted into `DashboardHubRevenueMixPage.tsx`; preview tab removed.
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `015-hub-chrome-foundation.md`, preferably after `016-hub-requests-redesign.md` (to avoid re-adding duplicate charts)
- **Category**: direction
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

Revenue Mix overlaps Requests (top accounts, segment mix, monthly revenue) while its unique story — **collection health (paid vs outstanding)** — is buried. `financials` category pie is not range-filtered while request revenue is, which misleads period analysis.

## Current state

- `dashboardHub/pages/DashboardHubRevenueMixPage.tsx` (~206 LOC)
- Hero + RangeTabs + 5 MiniStats + charts including collection radial with negative-margin overlay (~same hack as Rooms)
- `financials` from HubData aggregated without `rangeBounds`
- No segment filter despite segment mix charts

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Tests | `npm run test:frontend` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope:** `DashboardHubRevenueMixPage.tsx`  
**Out of scope:** Requests page, backend financials API, changing `financials` schema

## Steps

### Step 1: Motion + shell

`useHubPageEnter([range])` + `data-hub-animate` on Hero/KPIs/primary.

### Step 2: Lead with collection

Primary row:
- KPIs: Total revenue, Collected, Outstanding, Collection rate (drop avg deal size to subtext or secondary)
- Replace radial gauge + negative margin with kit `Meter` or shadcn `Progress` + large rate number
- Stacked bar or area: paid vs outstanding over months

### Step 3: Secondary tabs (shadcn Tabs)

Tabs: **Composition** | **Accounts** | **Financials**
- Composition: segment / property mix (keep)
- Accounts: top accounts by revenue
- Financials: category pie — subtitle must say **“All financials (not filtered by range)”** OR filter `financials` by `date` with same `rangeBounds` if field exists. Prefer filter when `date` present; otherwise label clearly.

Do **not** duplicate Requests’ Volume&ADR / lead-time charts.

### Step 4: Empty honesty

Empty when no request revenue in range; Financials tab can still show data with callout if only financials exist.

## Done criteria

- [ ] Collection is above-the-fold primary
- [ ] No radial negative-margin overlay
- [ ] Financials range behavior labeled or filtered
- [ ] No Request-specific lead-time/funnel charts
- [ ] tsc / test:frontend / build OK
- [ ] README DONE

## STOP conditions

- Cannot determine financials date field shape — label “unscoped” and do not invent dates
- 013 missing Progress/Meter — use existing `Meter` from analyticsKit

## Maintenance notes

Reviewer: open Requests + Revenue Mix side by side — primary stories must differ.
