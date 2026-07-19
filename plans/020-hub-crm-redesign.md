# Plan 020: Redesign Hub CRM tab (honest metrics + clarity)

> **Executor instructions**: Follow step by step. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- dashboardHub/pages/DashboardHubCrmPage.tsx`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (metric labeling)
- **Depends on**: `015-hub-chrome-foundation.md`
- **Category**: direction
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

Hub CRM is analytics over `crmState`, not a wrapper of `CRM.tsx`. “Stage conversion” compares concurrent stage counts (`stageConv` ~L82–89), not cohort flow — misleading. `pipelineValue` ignores range (~L51–52). Invalid dates are treated as in-range (`Number.isNaN(t) ? true`).

## Current state

- `DashboardHubCrmPage.tsx` (~175 LOC)
- Funnel + stage bars + pie + conversion bars + call trend
- No bridge CTA to operational CRM

**Important:** Do not redesign `CRM.tsx` in this plan.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Tests | `npm run test:frontend` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope:** `DashboardHubCrmPage.tsx`  
**Out of scope:** `CRM.tsx`, crm-state backend shape changes, wiring `AS.tsx` navigation (unless a simple `window` custom event already exists — prefer a labeled note “Open CRM from sidebar” if no hook)

## Steps

### Step 1: Fix filter honesty

- `inRange`: **exclude** NaN dates when range ≠ `all` (change `Number.isNaN(t) ? true` → `false`)
- Apply same range filter to `pipelineValue` sources
- Document in subtitle: “Items dated in range”

### Step 2: Relabel conversion

Rename chart to **“Stage share (not cohort conversion)”** or replace bars with % of total open pipeline. Do **not** claim conversion unless cohort data exists.

### Step 3: Hierarchy + motion

- Primary: KPI strip (leads, win rate, pipeline value, calls) + funnel OR stage bars (one primary)
- Secondary Tabs: Mix | Calls
- Drop redundant pie if stage bars exist
- `useHubPageEnter([range])`

### Step 4: Optional bridge

Hero `right` or Section footer text: “Manage pipeline in CRM (sidebar)” — no fake deep-link if AS has no API.

## Done criteria

- [ ] NaN dates excluded from ranged filters
- [ ] pipelineValue respects range
- [ ] No misleading “conversion” labeling
- [ ] Chart count reduced; motion wired
- [ ] tsc / tests / build OK; README DONE

## STOP conditions

- Product owner insists on true cohort conversion — stop; needs event history not in `crmState`

## Maintenance notes

If AS later exposes `setCurrentView('crm')`, replace bridge copy with a real button.
