# Plan 004: React.lazy heavy pages (defer router)

> **Executor instructions**: Ponytail — **do not** add react-router in this plan. Lazy only. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- AS.tsx main.tsx dashboardHub/DashboardHubShell.tsx package.json`

## Status

- **Status**: DONE (2026-07-15)
- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: none (measure after 001 if possible)
- **Category**: perf
- **Planned at**: commit `90c3a4c`, 2026-07-14

## Why this matters

`AS.tsx` statically imports CRM, RequestsManager, Settings, Reports, Contracts, DashboardHubShell (which imports all hub pages), and the GSAP landing. Every refresh parses that JS even on landing/login. Lazy loading shrinks first paint without URL routing.

## Current state

- `AS.tsx` top-level imports for feature modules (~80–96).
- View switching via `currentView` / `isAuthenticated` / landing flags — keep that.
- `vite.config.js` already has vendor manualChunks for react/recharts/lucide.
- Almost no `React.lazy` in app code today.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Build | `npm run build` | exit 0; more async chunks under `dist/assets` |
| Frontend tests | `npm run test:frontend` | exit 0 |

## Scope

**In scope**: `AS.tsx`, possibly `dashboardHub/DashboardHubShell.tsx` (lazy hub pages), thin Suspense fallback UI
**Out of scope**: `react-router-dom`, folder moves, renaming routes, deleting classic landing

## Steps

### Step 1: Lazy-wrap feature modules in AS.tsx

Replace static imports with:

```ts
const CRM = React.lazy(() => import('./CRM'));
const RequestsManager = React.lazy(() => import('./RequestsManager'));
// … Settings, Reports, Contracts, DashboardHubShell, PromotionsPage, AccountsPage, etc.
```

Wrap the authenticated view switch / heavy branches in `<Suspense fallback={…}>`. Keep Login eager. Lazy the Taste landing import used as default landing.

**Verify**: `npm run build` produces separate chunks; opening landing does not need to parse CRM chunk (Network tab).

### Step 2: Lazy hub tab pages inside DashboardHubShell

Change `DashboardHubShell.tsx` static page imports to `React.lazy` per tab so opening Hub does not pull every hub page.

**Verify**: Build + manual open Hub → Feed tab loads its chunk when selected.

## STOP conditions

- Circular import breaks lazy factory → STOP; fix import graph, don’t force router.
- Default export missing on a module → add default or use `.then(m => ({ default: m.X }))`.

## Done criteria

- No static import of CRM/RequestsManager/Settings from the initial AS evaluate path.
- `npm run build` exit 0.
- App still navigates via existing `currentView`.
