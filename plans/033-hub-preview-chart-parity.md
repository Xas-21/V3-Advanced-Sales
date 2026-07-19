# Plan 033: Restore missing original charts on Hub Preview tabs (parity pass)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- dashboardHub/pages/`
> If preview files changed since this plan was written, re-read Card/MiniStat
> titles before editing; on a mismatch, treat it as a STOP condition.
>
> **Graphify**: Before broad exploration, run `graphify query "DashboardHub preview pages"`.
> After editing code under `dashboardHub/`, run `graphify update .`.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (previews already wired in `DashboardHubShell.tsx`)
- **Category**: direction / tech-debt (preview completeness)
- **Planned at**: commit `90c3a4c`, 2026-07-18 (working tree may be ahead for Hub previews)
- **Notion**: https://app.notion.com/p/3a1dd599118881a2b46cfe7647f852bf
- **Completed**: 2026-07-18 — parity restored; all Hub previews promoted to originals; preview tabs removed

## Why this matters

Preview tabs were intentionally thinner (honest metrics + de-dupe vs Revenue Mix / Requests). That left some original charts missing, so side-by-side compare feels incomplete — especially **Sales Performance** (no Requests-by-rep, no radar). This plan restores **parity charts that are unique to each tab**, and explicitly **does not** restore cross-tab duplicates already rejected in `plans/HUB_DUPLICATION_AUDIT.md`.

## Audit matrix (Original → Preview)

Legend: **RESTORE** = put back on preview · **KEEP OUT** = intentional (Ponytail / de-dupe) · **OK** = already covered (maybe renamed)

### Sales Performance — largest gap (user-reported)

| Original | Preview | Verdict |
|----------|---------|---------|
| Won Revenue / Won Requests / Avg Conversion / Active Reps KPIs | MiniStats (won-aligned) | OK |
| Revenue by Rep | Won revenue by rep | OK (honest rename) |
| **Requests by Rep** | — | **RESTORE** |
| Conversion Rate bars | Rep win rate (≥2 decided) | OK (stricter filter) |
| Won vs Pipeline trend | Won vs pending by month | OK |
| **Top Rep Comparison (RadarChart)** | — | **RESTORE** |
| Rep Leaderboard | Leaderboard (+ pending col) | OK |

### Promotions

| Original | Preview | Verdict |
|----------|---------|---------|
| Total / Active / **Expired** / Avg Discount KPIs | Campaigns / Active(+expired sub) / Linked / Attributed | **RESTORE** Expired as its own MiniStat (keep linked KPIs) |
| Status Mix | Status mix (filtered) | OK |
| **Promotion Types** | — | **RESTORE** |
| Discount Depth | Discount depth (filtered) | OK |
| **Campaign Timeline** | — | **RESTORE** |
| — | Linked usage / top campaigns | OK (preview-only; keep) |

### Agreements

| Original | Preview | Verdict |
|----------|---------|---------|
| Signed / Pending / Lost KPIs | Proxy-labeled KPIs | OK |
| **Signed Value** MiniStat | — | **RESTORE** (label “Signed value (request proxy)”) |
| Contract Templates | Templates | OK |
| Agreement Status | Status mix (proxy) | OK |
| **Signed Volume & Value** (composed) | — | **RESTORE** |
| Signed Value by Account | — | **KEEP OUT** (Revenue Mix / Accounts ownership) |
| Signed vs Pending Trend | Status trend stacked | OK (counts; restore volume+value chart above) |

### Rooms

| Original | Preview | Verdict |
|----------|---------|---------|
| Total Rooms / Capacity / 90d Occ / **RevPAR** | Inventory / Capacity / period Occ / Room-nights | **RESTORE** RevPAR MiniStat only (period-aware, same formula as original) |
| Rooms by Type + Capacity by Type | Merged units & capacity | OK (de-dupe) |
| Occupancy gauge | Meter | OK |
| Inventory size / Room-nights / Detail | Present | OK |

### MICE

| Original | Preview | Verdict |
|----------|---------|---------|
| Venues / **Total Area** / **Total Capacity** / MICE Revenue | Events / Revenue / Confirmed / Venues | **RESTORE** Area + Capacity MiniStats (keep events KPI) |
| Seasonal Demand & Revenue | MICE demand & revenue | OK |
| Venue Capacity Tiers / Event Type / Venues by Capacity / Detail | Present (+ status mix) | OK |

### CRM

| Original | Preview | Verdict |
|----------|---------|---------|
| Funnel / Leads vs Pipeline / Stage Distribution / Sales Calls | Stage counts / Cards by stage / Stage mix / Sales calls | OK |
| **Stage-to-Stage Conversion** | — | **KEEP OUT** (false conversion from counts — plan 020 honesty) |

### Accounts

| Original | Preview | Verdict |
|----------|---------|---------|
| Portfolio Revenue KPI + Top by Revenue bar | One attributed-revenue chart | **KEEP OUT** second revenue wall (de-dupe) |
| Type / Locations / Creation vs Activity / Volume table | Present (period-aware) | OK |

### Activities

| Original | Preview | Verdict |
|----------|---------|---------|
| Timeline / Source / Top Actions / By User / Recent | Same + participation Meter; Active Users fixed | OK |

## Ponytail rules for the executor

1. Edit **preview files only** — never originals unless a bug is shared.
2. Prefer copy-from-original chart JSX with preview conventions: `GRID_2`, `CHART_H`, `PageShell`, `MiniStat` (not local `StatCard`), honest labels.
3. Do not reintroduce Stage-to-Stage Conversion or Signed Value by Account.
4. No new dependencies; Recharts already used (`RadarChart`, `PolarGrid`, etc. on original Sales Performance).
5. Fewest files: only the preview pages listed in Steps.

## Current state (excerpts)

Sales Performance original has Requests by Rep + Radar (`dashboardHub/pages/DashboardHubSalesPerformancePage.tsx` ~162–228). Preview stops at won-by-rep + win-rate + trend + table (`DashboardHubSalesPerformancePreviewPage.tsx` ~313–417).

Exemplar preview patterns: `DashboardHubRevenueMixPage.tsx`, `hubPreviewShared.tsx` (`GRID_2`, `CHART_H`, `PreviewBanner`).

Themes: use `colors` prop / `useHubData()` — Luxury / Light / Desert.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Orient | `graphify query "DashboardHub SalesPerformance preview"` | exits 0 |
| Typecheck focus | `npx tsc --noEmit -p tsconfig.json 2>&1 \| Select-String Preview` | no Preview errors |
| Graph update | `graphify update .` | rebuilds graph |
| Docker FE (if used) | `docker restart as-frontend` | container restarts |

## Steps

### Step 1 — Sales Performance preview parity

**File:** `dashboardHub/pages/DashboardHubSalesPerformancePreviewPage.tsx`

1. Port `topByRequests` (or equivalent) from original; add Card **"Requests by rep"** beside or under won-revenue-by-rep (`GRID_2`).
2. Port `radar` computation + **RadarChart** Card **"Top rep comparison (normalized)"** — show when `radar.reps.length >= 2`.
3. Keep won-only revenue series; do not bring back pending-inflated “Revenue by Rep”.
4. Import any missing Recharts symbols (`RadarChart`, `Radar`, `PolarGrid`, `PolarAngleAxis`).

**Verify:** Preview tab shows Requests-by-rep + radar when ≥2 reps have data; leaderboard still shows won vs pending columns.

### Step 2 — Promotions preview parity

**File:** `dashboardHub/pages/DashboardHubPromotionsPreviewPage.tsx`

1. Add MiniStat **"Expired"** (filtered set — same period as other stats).
2. Restore **Promotion Types** bar chart from original `typeMix` (filtered).
3. Restore **Campaign Timeline** stacked area from original `timeline` (filtered).
4. Keep linked-request / attributed-value charts.

**Verify:** Preview has Types + Timeline + Expired KPI; MiniStats still use filtered data (not unfiltered `enriched`).

### Step 3 — Agreements preview parity

**File:** `dashboardHub/pages/DashboardHubAgreementsPreviewPage.tsx`

1. Add MiniStat **"Signed value (request proxy)"** using same signed-status totalCost sum as original.
2. Restore **Signed volume & value** ComposedChart (counts + value) full-width or `GRID_2`.
3. Do **not** restore Signed Value by Account.

**Verify:** Signed value KPI + volume/value chart present; no by-account revenue bar.

### Step 4 — Rooms + MICE KPI parity

**Files:**
- `dashboardHub/pages/DashboardHubRoomsPreviewPage.tsx` — add period-aware **RevPAR** MiniStat (reuse original `util.revpar` formula; RangeTabs already drive period).
- `dashboardHub/pages/DashboardHubMicePreviewPage.tsx` — add **Total area** and **Total capacity** MiniStats from venues inventory (static inventory OK).

**Verify:** Both KPIs visible; Rooms still has single merged type chart (not two duplicates).

### Step 5 — Smoke + docs

1. `npx tsc --noEmit` filtered for `Preview` — no new errors.
2. `graphify update .`
3. Update `plans/HUB_DUPLICATION_AUDIT.md` with a one-line note: “033 restored unique charts; KEEP OUT list unchanged.”
4. Mark this plan DONE in `plans/README.md`.

## Out of scope

- Promoting any preview to replace originals
- Editing original `DashboardHub*Page.tsx` (except if a shared bug blocks restore — then STOP)
- Restoring CRM Stage-to-Stage Conversion
- Restoring Agreements Signed Value by Account / Accounts dual revenue walls
- Backend, Neon, VisaTour, Hermes/Obsidian
- Requests / Revenue Mix (no preview tabs)

## STOP conditions

- Original radar/`topByRequests` helpers missing or renamed — STOP and report.
- Restoring a KEEP OUT chart would require inventing new revenue definitions — STOP.
- Preview file missing / not wired in shell — STOP.

## Done criteria

- [x] Sales Performance preview: Requests by rep + radar present
- [x] Promotions preview: Expired MiniStat + Types + Timeline present
- [x] Agreements preview: Signed value MiniStat + Volume & Value chart; no by-account chart
- [x] Rooms preview: RevPAR MiniStat; MICE preview: Area + Capacity MiniStats
- [x] No Preview TypeScript errors; graphify updated; README status DONE

## Checklist

- [x] Drift-check `dashboardHub/pages/` vs planned SHA; re-read Card titles if changed
- [x] Sales Performance preview: restore **Requests by rep** + **Top rep comparison (radar)**
- [x] Promotions preview: **Expired** MiniStat + **Promotion Types** + **Campaign Timeline**
- [x] Agreements preview: **Signed value** MiniStat + **Signed volume & value** chart (no by-account)
- [x] Rooms preview: period-aware **RevPAR** MiniStat
- [x] MICE preview: **Total area** + **Total capacity** MiniStats
- [x] Do **not** restore CRM stage-to-stage conversion or Accounts dual revenue walls
- [x] Promote previews → originals; remove preview tabs; Notion + README DONE

## Test plan

Manual: open each `*-preview` tab next to original; confirm restored cards appear; confirm KEEP OUT items still absent. No new automated test required (UI parity).

## Maintenance

When promoting a preview later, carry these restored charts into the original file and delete the preview tab.
