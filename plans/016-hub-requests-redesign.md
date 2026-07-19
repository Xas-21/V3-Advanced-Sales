# Plan 016: Redesign Hub Requests tab (hierarchy + de-dupe charts)

> **Executor instructions**: Follow step by step. Verify each step. STOP conditions → report, do not improvise. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- dashboardHub/pages/DashboardHubRequestsPage.tsx dashboardHub/analyticsKit.tsx dashboardHub/hubMotion.ts`

## Status

- **Status**: REJECTED preview redesign (2026-07-15) — operator preferred original layout. Preview tab removed. Follow-up applied on original: wider chart grid + taller charts (scroll OK).
- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/015-hub-chrome-foundation.md`
- **Category**: direction
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

Requests is the densest Hub tab (~10 chart cards in one flat grid). Pipeline Funnel and Status Mix tell the same story; lead-time scatter + buckets compete; there is no primary insight. Sales users need volume/ADR/win first, then optional depth — not a wall of equal Recharts cards.

## Current state

- File: `dashboardHub/pages/DashboardHubRequestsPage.tsx` (~307 LOC)
- Uses `useHubData()` + kit (`Hero`, `RangeTabs`, `FilterChips`, `MiniStat`, `Card`)
- KPI strip: 5 MiniStats (L176–182); chart grid starts L184 with Volume&ADR, Revenue, Funnel radial, Status pie, Segment pie, Top accounts, Property bars, Lead scatter, Lead buckets, Cancellations
- Empty only at page level; zero-series charts still render
- No GSAP / shadcn yet (after 013: use `useHubPageEnter`, Section, Skeleton patterns)

**Design read:** Ops dashboard; Luxury/Light/Desert; denser allowed; motion restrained. Skills: redesign-existing-projects, shadcn, gsap-react.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Frontend tests | `npm run test:frontend` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope:** `dashboardHub/pages/DashboardHubRequestsPage.tsx` only (plus reading kit/hubMotion — do not rework kit unless 013 incomplete)

**Out of scope:** Revenue Mix page (017 owns de-dupe vs this tab), `RequestsManager.tsx`, backend aggregations, Feed

## Git workflow

- Branch: `advisor/016-hub-requests-redesign`
- Do not push unless asked

## Steps

### Step 1: Page shell + motion

Wrap root in ref from `useHubPageEnter([range, segFilter])`. Add `data-hub-animate` to Hero, KPI row, primary section. Keep `colors` prop API.

**Verify**: tab switch animates once; with OS reduced-motion, no slide.

### Step 2: Information hierarchy

Restructure body into:
1. **Primary** (always visible): Volume & ADR trend + Revenue trend (or one composed chart if space) + 4 KPIs max (drop one of Cancel/Win if needed — keep Cancel as delta on Win or subtext).
2. **Secondary** (shadcn `Tabs`: Overview | Pipeline | Segments | Lead time):
   - Pipeline: **one** status viz (prefer horizontal funnel/bars; drop RadialBar funnel **or** Status pie — not both)
   - Segments: segment mix + top accounts
   - Lead time: keep **buckets bar**; drop scatter unless it shows a clear outlier story
   - Cancellations: only if cancel count > 0; else EmptyState inside tab

Use kit `Section` + `Separator` from 013 between primary and tabs.

**Verify**: default view shows ≤4 chart cards before interacting with tabs.

### Step 3: Filters

Keep segment `FilterChips`; if segment count > 8, switch to shadcn `Select` (from 013) styled with `colors` borders/background. Range stays in Hero `right`.

**Verify**: filtering still changes KPIs/charts; All works.

### Step 4: Empty / zero honesty

- Page EmptyState when no requests in range (unchanged intent)
- Per-chart EmptyState when series empty
- Remove unused recharts imports after chart cut

**Verify**: `npx tsc --noEmit`; no unused import lint noise if eslint covers it.

## Test plan

- Manual: property with data — primary charts populate; Pipeline tab single status viz; Lead time empty-friendly
- Manual: empty property — page EmptyState
- `npm run test:frontend`

## Done criteria

- [ ] ≤4 charts visible before secondary tabs
- [ ] Funnel radial + Status pie not both present
- [ ] `useHubPageEnter` wired; reduced-motion safe
- [ ] `tsc` / `test:frontend` / `build` exit 0
- [ ] Only in-scope file modified (kit only if fixing import path)
- [ ] README status DONE

## STOP conditions

- Aggregation logic in `aggReq` must change for new KPIs beyond display — stop (out of scope metrics redesign)
- 013 not landed (no `hubMotion` / Section) — stop or complete 013 first

## Maintenance notes

- 015 Revenue Mix must not reintroduce duplicate account/segment charts as primary
- Reviewer: count charts on default tab view
