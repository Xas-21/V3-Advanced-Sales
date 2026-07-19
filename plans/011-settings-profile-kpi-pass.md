# Plan 011: Cheapen Settings profile KPIs, chart, and activity log

> **Executor instructions**: Follow step by step. Preserve displayed KPI numbers. Ponytail — no new chart library. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- UserPerformanceDashboard.tsx userProfileMetrics.ts AccountProfilePerformanceChart.tsx accountProfileChartData.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `006` (lazy dashboard) strongly recommended first; `007` helpful
- **Category**: perf
- **Planned at**: commit `90c3a4c`, 2026-07-15
- **DONE**: 2026-07-15 — attributed KPI helpers + activity cap 150 + idle-deferred chart series / lazy chart

## Why this matters

Default Settings tab is `profile`, which mounts `UserPerformanceDashboard`. That component:

1. Walks **all** `sharedRequests` separately for revenue, request count, and pipeline (`UserPerformanceDashboard.tsx:231-251` → `userProfileMetrics.ts:369+`).
2. Builds `userAttributedRequests`, then `buildAccountProfileChartData` (night proration) for Recharts (`:349-360`).
3. Builds full activity log over every request log (`:393-395` → `buildProfileActivityLog` nested loops), then maps **all** `displayedLogs` to DOM (`~905+`).

This is the remaining lag on user profile after Settings chunk cleanup.

## Current state

```ts
// userProfileMetrics.ts ~369-376 — full scan + prorated revenue per attributed request
export function sumRevenueInYmdRange(...) {
  for (const req of requests) {
    if (!requestInProperty(...)) continue;
    if (!requestAttributedToUser(...)) continue;
    ...
    sum += sumRequestProratedRevenueExTaxInRange(req, start, end);
  }
}
```

```ts
// buildProfileActivityLog ~446-461 — nested request × logs
for (const req of requests) {
  ...
  for (const log of logs) { ... }
}
```

`userAttributedRequests` already filters once at `UserPerformanceDashboard.tsx:349-354` but KPIs above **do not reuse** it.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Manual | Settings → profile KPIs for own user | revenue / req count / pipeline match pre-change for same period |
| Manual | Activity list | still shows recent items; scroll OK |

## Scope

**In scope**: `UserPerformanceDashboard.tsx`, `userProfileMetrics.ts` (helpers), optionally `AccountProfilePerformanceChart.tsx` lazy boundary  
**Out of scope**: Accounts list (009/010); Settings directory fetch (007); changing dashboard chart business rules

## Steps

### Step 1: Reuse one attributed request list for KPIs

In `UserPerformanceDashboard`:

1. Keep / hoist `userAttributedRequests` (property + attribution filter).
2. Derive `monthRevenue`, `monthReqCount`, `activePipeInPeriod`, `recentRequestsList` from that array (or thin helpers that accept **pre-filtered** requests and only apply status/date rules).

Avoid three full passes over the entire property request book.

**Verify**: KPI numbers unchanged for Month/Year/Full toggles on a known user.

### Step 2: Cap or early-stop activity log

In `buildProfileActivityLog` or at the call site:

- After collecting rows, sort by `atMs` desc and **slice** to a reasonable cap (e.g. 100–200) before return, **or** stop pushing once enough recent rows exist.
- Ensure the UI list does not `.map` thousands of nodes; cap `displayedLogs` if needed.

Preserve 60-day window semantics for what is considered; capping display/collection size is OK (Ponytail). Document the cap in a one-line comment.

**Verify**: Busy property profile still opens; activity section shows newest entries.

### Step 3: Defer chart series build (light touch)

Ponytail options (pick **one**):

- **A**: `React.lazy` the `AccountProfilePerformanceChart` inside the dashboard and only compute `buildAccountProfileChartData` when the chart section mounts / is in view; show KPI cards first.
- **B**: Defer `buildAccountProfileChartData` with `requestIdleCallback` / `setTimeout(0)` and keep a “Loading chart…” placeholder.

Do not rewrite proration math. Do not add IntersectionObserver frameworks if A is enough.

**Verify**: Chart appears with same series shortly after open; no blank forever.

## Test plan

- Unit-test any new “stats from prefiltered requests” helper against the old full-scan functions on a tiny fixture (same totals).
- Model after simple vitest files in repo root / `*.test.ts`.

## STOP conditions

- KPI totals change vs old helpers on fixture → STOP.
- Chart permanently missing → STOP.
- Large refactor of `operationalSegmentRevenue.ts` → STOP; out of scope.

## Done criteria

- [x] Profile KPIs do not each re-scan the full unfiltered request list
- [x] Activity list bounded (cap or equivalent)
- [x] Chart work deferred or lazy without changing formula
- [x] `npm run test:frontend` exit 0
- [x] `plans/README.md` → DONE
