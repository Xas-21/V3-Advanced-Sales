# Plan 024: Redesign Hub Activities tab (fix Active Users + naming)

> **Executor instructions**: Follow step by step. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- dashboardHub/pages/DashboardHubActivitiesPage.tsx dashboardHub/dashboardHubTabs.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: `015-hub-chrome-foundation.md`
- **Category**: direction
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

“Active Users” MiniStat uses `byUser.length` after `.slice(0, 10)` — undercounts when >10 users. Tab name “Activities” collides with CRM call activities (`CrmActivitiesView`); content is request logs + account activities mashup. Recent table uses index keys; no source split.

## Current state

- `DashboardHubActivitiesPage.tsx` (~175–181 LOC)
- Aggregates `request.logs` + `account.activities`
- Charts: timeline, source mix, top actions, by-user; recent table

**Not** a wrapper of `CrmActivitiesView.tsx`.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Tests | `npm run test:frontend` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope:** `DashboardHubActivitiesPage.tsx`; optional label in `dashboardHubTabs.ts`  
**Out of scope:** `CrmActivitiesView.tsx`, writing new activity APIs

## Steps

### Step 1: Fix Active Users bug

```ts
// Compute unique user count BEFORE slice
const userCounts = /* Map user -> count */;
const activeUserCount = userCounts.size;
const byUserTop = [...userCounts.entries()].sort(...).slice(0, 10);
```

MiniStat uses `activeUserCount`; chart uses `byUserTop`.

**Verify**: with >10 users in fixture/manual data, KPI > 10 while chart shows top 10.

### Step 2: Rename for clarity

- Hero title: **“Team activity log”**
- Optional tab label: `Activity log` in `dashboardHubTabs.ts` (keep id `activities`)
- Subtitle: “Request logs & account activities (not CRM call agenda)”

### Step 3: Hierarchy

- Primary: KPIs + activity timeline  
- Tabs: By user | Actions | Recent  
- Source mix as small Badge strip or secondary  
- shadcn Table for recent; stable keys (`${source}-${date}-${action}-${i}` minimum)
- Truncate long action labels on Y-axis (slice 24 + ellipsis)
- `useHubPageEnter([range])`

### Step 4: Optional source filter

FilterChips: All | Requests | Accounts — filters `logs` before aggregates.

## Done criteria

- [ ] Active Users counts uniques before slice (bug fixed)
- [ ] Naming clarifies vs CRM Activities
- [ ] Table + motion; action labels truncated
- [ ] tsc / tests / build OK; README DONE

## STOP conditions

- None

## Test plan

Add a tiny vitest if easy: extract pure `countActiveUsers(logs)` to a 5-line helper in the page file or `analyticsKit` — optional. Prefer one assert-based check in a new `dashboardHub/activityStats.test.ts` modeled after `accountDuplicateDetect.test.ts` if you extract the helper. Otherwise manual verify.

## Maintenance notes

If product wants CRM agenda inside Hub, that is a separate plan wrapping/linking `CrmActivitiesView`.
