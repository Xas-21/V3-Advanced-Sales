# Plan 047: Remove dead code, unused modals, and mock data

> **Executor instructions**: Follow step by step. This plan deletes code — confirm each item is truly unused before removing. Run every verification. Honor "STOP conditions". Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- AS.tsx AccommodationRequestModal.tsx EventRequestModal.tsx SeriesGroupRequestModal.tsx`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED (deleting the wrong thing breaks a view — verify render sites first)
- **Depends on**: 040 (typecheck confirms nothing references removed symbols)
- **Category**: tech-debt / dead code
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

The audit found dead code and stale mock data shipping to production: a whole unused `RequestsView` component (which also hides the latent `selectedCurrency` crash, BUG-01), and `mock*` lead/venue arrays still wired into the request modals (BUG-06) — at worst users could pick fake leads/venues; at best it's dead placeholder data inflating the bundle and the tsc error count. Removing them shrinks the god-file, kills the landmine, and makes the typecheck gate honest.

## Current state

- **BUG-01 / dead component**: `RequestsView` defined at `AS.tsx:2647` (props `{ theme, subView, setSubView, searchParams, setSearchParams }`), body runs to ~`AS.tsx:2801`, contains `selectedCurrency` at `:2780` which is undefined in its scope. **Verified never rendered** — a repo-wide search finds it only at its own definition (and in `graphify-out/` artifacts). The app uses the imported `RequestsManager` (`AS.tsx:7490`) and `EventsView` (`AS.tsx:7274`).
- **BUG-06 / mock data in modals**: implicit-`any[]` `mock*` variables read at render time in `AccommodationRequestModal.tsx:27,189`, `EventRequestModal.tsx:21,23,160,264`, `SeriesGroupRequestModal.tsx:25,201` (`TS7034`/`TS7005`). Confidence LOW — must confirm whether they feed visible UI or are leftovers.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Confirm no render site | `grep -rn "RequestsView" --include=*.tsx .` | only the definition in AS.tsx |
| Inspect mock usage | `grep -rn "mockLeads\|mockVenues\|mock" AccommodationRequestModal.tsx EventRequestModal.tsx SeriesGroupRequestModal.tsx` | see where each mock is read |
| Typecheck | `npx tsc --noEmit` | fewer errors after removal |
| Tests / build | `npm run test:frontend && npm run build` | pass / exit 0 |

## Scope

**In scope**: `AS.tsx` (delete `RequestsView`), the three request modals (mock data), plus a sweep for other unused modals (Step 3).
**Out of scope**: extracting the *live* views into files (plan 049); correctness fixes in live code (plan 046).

## Steps

### Step 1 (BUG-01): Delete the dead `RequestsView`

Confirm `grep -rn "RequestsView" --include=*.tsx .` returns only the definition. Delete the component `AS.tsx:2647`–end-of-component (~`:2801`). Ensure no JSX/route referenced it (typecheck will catch a stray reference).

**Verify**: `npx tsc --noEmit` no longer reports the `selectedCurrency` `TS2304` at the old :2780; `npm run build` exits 0; `npm run test:frontend` passes; app still renders Requests via `RequestsManager`.

### Step 2 (BUG-06): Resolve mock data in the request modals

For each `mock*` in the three modals: trace whether it feeds a rendered `<select>`/list. 
- If the modal receives real data via props/queries → replace the `mock*` reference with the real source and delete the mock array.
- If the mock array is unused leftover → delete it.
- Type the resulting data explicitly so tsc catches regressions.

If a modal genuinely has **no** real data source wired (only the mock), STOP and report — that's a functional gap needing product input, not a silent deletion.

**Verify**: `npx tsc --noEmit` clears the `TS7034/7005` mock errors; open each modal (or a component test) and confirm lead/venue pickers show real data or are correctly empty. `npm run test:frontend` passes.

### Step 3: Sweep for other unused modals/components

Enumerate root-level `*Modal.tsx` and check each has a render site:

```bash
for f in *Modal.tsx; do n="${f%.tsx}"; c=$(grep -rl "<$n" --include=*.tsx . | grep -v "$f" | wc -l); echo "$n rendered_in=$c"; done
```

For any modal with `rendered_in=0`, verify (grep for the name without `<`, e.g. lazy/dynamic import) and, if truly unreferenced, delete it. List each deletion in the completion report. Do the same quick check for obviously-stale root components flagged by the audit.

**Verify**: after deletions, `npx tsc --noEmit`, `npm run build`, `npm run test:frontend` all pass.

## Done criteria

- [ ] `RequestsView` deleted; its `selectedCurrency` error is gone from `tsc`.
- [ ] Mock arrays in the three request modals removed or replaced with real data (or STOP-reported as a functional gap).
- [ ] Unused-modal sweep done; every deletion listed in the report with evidence it had zero render sites.
- [ ] `npm run build` exits 0; `npm run test:frontend` passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- `grep` shows `RequestsView` (or any modal you're about to delete) IS referenced/lazy-imported — do not delete; report.
- A request modal has only mock data and no real source — report as a functional gap.
- Deleting anything breaks a test or the build — restore and report.

## Maintenance notes

- Reviewer: verify each deleted component's grep evidence in the report before approving.
- This shrinks `AS.tsx`, easing plan 049 (decomposition).
