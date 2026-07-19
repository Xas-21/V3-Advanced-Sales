# Plan 006: Strip dead Settings imports and lazy-load profile dashboard

> **Executor instructions**: Follow step by step. Ponytail — smallest diff. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- Settings.tsx UserPerformanceDashboard.tsx AS.tsx`

## Status

- **Status**: DONE (2026-07-15)
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (do first in Accounts/Settings lag series)
- **Category**: perf
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

Opening Settings parses unused Recharts + a large `userProfileMetrics` import list that nothing in `Settings.tsx` uses anymore (dashboard moved to `UserPerformanceDashboard`). The dashboard itself is still a static import, so the chart stack loads before the profile tab paints.

## Current state

- `Settings.tsx:2-5` — imports `AreaChart`, `BarChart`, `PieChart`, `LineChart`, etc. **No JSX usages** of those components in the file.
- `Settings.tsx:52-74` — large `userProfileMetrics` named import block; symbols appear **only** on the import line (unused).
- `Settings.tsx:76` — `import { UserPerformanceDashboard } from './UserPerformanceDashboard';`
- Used at `Settings.tsx:3148` (users tab stats) and `Settings.tsx:3263` (profile tab).
- Convention: `AS.tsx` already uses `React.lazy` + `Suspense` for heavy pages — match that pattern.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Build | `npm run build` | exit 0; Settings chunk smaller / dashboard separate async chunk |

## Scope

**In scope**: `Settings.tsx` only  
**Out of scope**: Changing KPI math, `UserPerformanceDashboard` internals (plan 011), fetch gating (plan 007)

## Steps

### Step 1: Delete dead imports

Remove the entire `recharts` import (`Settings.tsx:2-5`).  
Remove the unused `userProfileMetrics` import block (`Settings.tsx:52-74`) **only if** grep shows zero usages of those symbols in `Settings.tsx` outside the import.

**Verify**: `rg "AreaChart|sumRevenueInYmdRange|PROFILE_MONTH_LABELS" Settings.tsx` → no matches (or only intentional ones).

### Step 2: Lazy-load UserPerformanceDashboard

```tsx
const UserPerformanceDashboard = lazy(() =>
  import('./UserPerformanceDashboard').then((m) => ({ default: m.UserPerformanceDashboard }))
);
```

Ensure `lazy` / `Suspense` are imported from `react`. Wrap both mount sites (profile + users-stats) in `<Suspense fallback={…}>` — a thin “Loading…” div matching existing Settings chrome is enough.

If `UserPerformanceDashboard` is a **named** export only, keep the `.then(m => ({ default: m.UserPerformanceDashboard }))` form. Do not add a default export unless already present.

**Verify**: `npm run build` → separate chunk referencing UserPerformanceDashboard; Settings still opens profile and users-stats UI.

## STOP conditions

- Profile or users-stats tab blank/errors after lazy → STOP; fix export/Suspense, don’t leave broken.
- Accidental removal of an import that is still referenced → STOP; restore that symbol only.

## Done criteria

- [ ] No unused recharts import in `Settings.tsx`
- [ ] No unused `userProfileMetrics` barrel import in `Settings.tsx`
- [ ] `UserPerformanceDashboard` loaded via `lazy`
- [ ] `npm run build` and `npm run test:frontend` exit 0
- [ ] `plans/README.md` status → DONE
