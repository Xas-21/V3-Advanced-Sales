# Plan 023: Redesign Hub Agreements tab (naming + request vs templates)

> **Executor instructions**: Follow step by step. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- dashboardHub/pages/DashboardHubAgreementsPage.tsx`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (product naming)
- **Depends on**: `015-hub-chrome-foundation.md`
- **Category**: direction
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

Title says “Agreements & Contracts” but data is **booking requests** mapped via `agreementStatus()` to Signed/Pending/Lost — not `Contracts.tsx` documents. Templates are fetched only for a MiniStat count. High confusion risk for sales users who manage real contracts elsewhere.

## Current state

- `DashboardHubAgreementsPage.tsx` (~160 LOC)
- `SIGNED` / `PENDING` / `LOST` status buckets (~L14–23)
- Fetch `/api/contracts/templates` (~L33–43)
- Charts: status pie, signed volume/value, by-account, signed vs pending trend

**Do not embed `Contracts.tsx`.**

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Tests | `npm run test:frontend` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope:** `DashboardHubAgreementsPage.tsx`, optionally tab label in `dashboardHub/dashboardHubTabs.ts` if renaming  
**Out of scope:** `Contracts.tsx` feature work, changing request status enums

## Steps

### Step 1: Rename for honesty

- Hero title → **“Request agreements”** (or “Booking agreement status”)
- Subtitle: “Request statuses grouped as Signed / Pending / Lost — not contract documents”
- If renaming Hub tab label, update `dashboardHubTabs.ts` label to `Agreements` still OK if Hero clarifies; prefer tab **“Agreements”** + clear Hero

### Step 2: Split UI

shadcn Tabs: **Requests** | **Templates**
- Requests: existing KPIs/charts with range; pending queue as shadcn Table (account, status Badge, value, date)
- Templates: list name/type from fetched templates; if empty, EmptyState. If fetch fails, show error text once — do not pretend count is 0 without note

### Step 3: NaN dates

When ranging, exclude invalid dates (same as CRM plan: not “treat as in range”).

### Step 4: Motion + chrome

`useHubPageEnter`; theme Badges for Signed/Pending/Lost.

## Done criteria

- [ ] Copy no longer implies document Contracts module
- [ ] Templates surfaced as list or clearly empty
- [ ] Pending table present
- [ ] Invalid dates excluded from range
- [ ] tsc / tests / build OK; README DONE

## STOP conditions

- Stakeholder wants real contract analytics — stop; needs Contracts data model wire-up (new plan)

## Maintenance notes

Consider future plan to chart actual contracts from Contracts store — out of scope here.
