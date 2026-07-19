# Plan 049: Decompose the `AS.tsx` god-file

> **Executor instructions**: Follow step by step. This is a structural refactor of the largest file in the repo — go one component at a time, verifying after each. Behavior must not change. Honor "STOP conditions". Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- AS.tsx`

## Status

- **Priority**: P2 (do the cheap wins; the full split is optional/ongoing)
- **Effort**: L
- **Risk**: MED (mechanical extraction can break implicit shared scope/closures)
- **Depends on**: 040 (typecheck gate), 047 (delete dead `RequestsView` first), 048 (currency hook removes cross-cutting inline state)
- **Category**: tech-debt / architecture
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

`AS.tsx` is a ~9,000-line god-file holding the shell, routing, KPIs, WebSocket wiring, currency, and multiple full sub-views inline. Every feature change edits one enormous file (merge-conflict prone, stale-closure prone, too big for the compiler-less build to be safe — it's where BUG-01 hid). Extracting the self-contained views into their own files with explicit props makes the codebase reviewable and the typecheck meaningful.

## Current state

Self-contained components currently inline in `AS.tsx` (line numbers approximate — confirm with the drift check and by reading):
- `CalendarView` (`~991`)
- `EventsView` (`~1364`)
- `RequestsView` (`~2647`) — **dead; deleted by plan 047, do not extract**
- `MainChart` (`~2806`)
- `ToDoView` (`~3282`)
- `DistributionChart` (`~3554`)
- `AlertsBell` (`~3686`)
- WebSocket wiring / `handleLiveUpdate` (`~4653`)
- `AdvancedSalesDashboard` (`~3841`) — the main shell (keep in AS.tsx, or make AS.tsx a thin entry)

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Line count | `wc -l AS.tsx` | shrinks after each extraction |
| Typecheck | `npx tsc --noEmit` | no new errors after each move |
| Tests / build | `npm run test:frontend && npm run build` | pass / exit 0 |

## Scope

**In scope**: `AS.tsx` and new component files it extracts to (e.g. `views/CalendarView.tsx`, `views/EventsView.tsx`, `views/ToDoView.tsx`, `charts/MainChart.tsx`, etc. — match the repo's existing folder conventions; the repo currently keeps components at root, so root-level files like `CalendarView.tsx` are acceptable if that's the convention).
**Out of scope**: changing any component's behavior, props semantics, or styling; backend; the main shell's logic.

## Steps

### Step 0: Prerequisites

Ensure plan 047 (dead `RequestsView` removed) and 048 (currency hook) have landed — they remove the trickiest cross-cutting inline state so extraction is cleaner.

### Step 1: Extract one leaf component (proof of pattern)

Start with the most self-contained one (e.g. `CalendarView` or `AlertsBell`). Cut it into its own file, export it, and add explicit typed props for everything it currently reads from the enclosing scope (theme, data, setters). Import it back into `AS.tsx`. Do **one** component only.

**Verify**: `npx tsc --noEmit` no new errors; `npm run build` exits 0; `npm run test:frontend` passes; the extracted view renders identically (spot-check in the app).

### Step 2: Repeat per component

Extract the remaining self-contained views/charts one at a time (`EventsView`, `MainChart`, `ToDoView`, `DistributionChart`, `AlertsBell`), verifying after each. If any component reads a large web of enclosing state that can't be cleanly passed as props, STOP for that one and report it (leave it inline rather than force a risky untangle).

**Verify** (after each): typecheck + build + tests pass.

### Step 3: Leave the shell coherent

`AdvancedSalesDashboard` and the routing/WebSocket wiring may stay in `AS.tsx` (now much smaller). Do not force a split that obscures the data flow.

**Verify**: `wc -l AS.tsx` materially reduced; `npm run build` exits 0; `npm run test:frontend` passes.

## Done criteria

- [x] At least the clearly self-contained views/charts are extracted into their own files with explicit typed props.
- [x] `AS.tsx` line count materially reduced (report before/after).
- [x] No behavior/visual change; `npm run build` exits 0; `npm run test:frontend` passes; `npx tsc --noEmit` no new errors.
- [x] `plans/README.md` status row updated.

## Execution notes (2026-07-19)

Extracted to root-level files (repo convention): `CalendarView.tsx`, `EventsView.tsx`, `MainChart.tsx`, `ToDoView.tsx`, `DistributionChart.tsx`, `AlertsBell.tsx`. Also moved `rechartsTooltipThemeProps` into `rechartsChartLegend.tsx`. Left `AdvancedSalesDashboard` + routing/WebSocket in `AS.tsx`. Line count: **8195 → 5355**.

## Follow-up (2026-07-20)

Extracted pure dashboard date/axis helpers to `dashboardShellDates.ts`. Line count: **~5352 → ~5257**. Shell/WebSocket remain in `AS.tsx` by design (plan Step 3 / STOP).

## STOP conditions

- A component's dependency on enclosing scope is too tangled to pass as props without behavior risk — leave it inline, report it.
- Any extraction changes rendered output — revert that one and report.
- `RequestsView` still present (plan 047 not done) — do 047 first.

## Maintenance notes

- This is safe to do incrementally across several PRs; each extracted component is independently shippable.
- Reviewer: verify props fully capture what the component used from the old closure (no reliance on module-level mutable state).
