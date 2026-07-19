# Plan 052: Stop leaking stack traces; add per-feature error boundaries

> **Executor instructions**: Follow step by step. Run every verification. Honor "STOP conditions". Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- main.tsx AS.tsx`

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: prod
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

In production a render error renders the full `error.stack` into the fallback UI (PROD-07) — leaking file paths and code structure to end users. There is also exactly one root error boundary wrapping the whole app, so any uncaught error in any feature blanks the entire dashboard instead of degrading one panel.

## Current state

- `main.tsx:39` — the root fallback renders `{error.stack ?? ''}` inside a `<pre>`:

```tsx
<p style={{ marginTop: 10, opacity: 0.9 }}>{error.message}</p>
<pre style={{ marginTop: 18, overflow: 'auto', fontSize: 12 }}>{error.stack ?? ''}</pre>
```

- `main.tsx:10-68` — `RootErrorBoundary` is the only boundary; `main.tsx:90-98` wraps the entire `<AdvancedSalesDashboard />`.
- Heavy lazy routes exist in `AS.tsx` (`React.lazy` at `AS.tsx:192-205` per audit) — good candidates for scoped boundaries.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit` | no new errors |
| Build (prod mode) | `npm run build` | exit 0 |
| Tests | `npm run test:frontend` | all pass |

## Scope

**In scope**: `main.tsx` (gate the stack), a small reusable `ErrorBoundary` (extract or add), and wrapping high-risk lazy routes in `AS.tsx`.
**Out of scope**: an external error-reporting service (separate decision); changing the app's routing.

## Steps

### Step 1: Gate the stack trace behind DEV

In `main.tsx`, only render `error.stack` when `import.meta.env.DEV`. In production show `error.message` (or a generic message) and the Reload / Reset buttons — never the stack.

```tsx
{import.meta.env.DEV && <pre style={{ marginTop: 18, overflow: 'auto', fontSize: 12 }}>{error.stack ?? ''}</pre>}
```

**Verify**: `npm run build` then serve the build (`npm run preview`) and trigger/simulate an error — the stack is not shown; in `npm run dev` it still is. `npx tsc --noEmit` clean.

### Step 2: Make the boundary reusable and wrap risky routes

Extract the boundary into a small reusable `ErrorBoundary` component accepting an optional `fallback`/label prop (or reuse `RootErrorBoundary` generalized). Wrap the highest-risk lazy routes (e.g. Contracts, RequestsManager, DashboardHub) each in their own boundary so a failure degrades one panel with a localized "This section failed to load — reload" message instead of white-screening the whole app.

**Verify**: `npm run build` exits 0; `npm run test:frontend` passes; simulate an error thrown in one wrapped route → only that panel shows the fallback, the rest of the app stays usable.

## Done criteria

- [x] Production build never renders `error.stack` to users (DEV-only).
- [x] A reusable error boundary wraps at least the heavy lazy routes (Contracts / RequestsManager / DashboardHub).
- [x] `npm run build` exits 0; `npm run test:frontend` passes; `npx tsc --noEmit` no new errors.
- [x] `plans/README.md` status row updated.

## Executor notes

- Extracted reusable `ErrorBoundary` (`variant: root | section`, `showDetails` defaults to `import.meta.env.DEV`).
- Root in `main.tsx` keeps Reload / Reset cached page behavior; production shows neither message nor stack.
- Section boundaries wrap lazy `Contracts`, `RequestsManager`, and `DashboardHubShell` render sites inside `AS.tsx` Suspense.
- Vitest: `ErrorBoundary.test.tsx` (red on missing module → green).

## STOP conditions

- Cited `main.tsx` lines don't match (drift).
- Wrapping a route boundary changes its normal rendering — revert that wrap and report.

## Maintenance notes

- Follow-up: wire the boundaries' `componentDidCatch` to an error-reporting service (Sentry etc.) if/when adopted — keep PII out of reports.
- Reviewer: confirm no `error.stack`/internal path is reachable in a production build.
