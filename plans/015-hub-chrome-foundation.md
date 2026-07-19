# Plan 015: Hub chrome foundation (tabs, kit, shadcn, GSAP enter)

> **Executor instructions**: Follow step by step. Run every verification before the next step. If a STOP condition hits, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- dashboardHub/analyticsKit.tsx dashboardHub/DashboardHubTabBar.tsx dashboardHub/DashboardHubShell.tsx dashboardHub/PAGE_CONTRACT.md src/components/ui package.json`
> If in-scope files drifted, compare Current state excerpts to live code before proceeding.

## Status

- **Status**: DONE (2026-07-15) — applied on main working tree (worktree executor discarded: stale base dropped HubDataProvider)
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (Batch A/B done; this is Batch D foundation)
- **Category**: direction (UX redesign foundation)
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

All ten Hub analytics tabs share the same visual debt: tiny TabBar labels, kit components that ignore installed shadcn, `LoadingState` that looks like empty data, hardcoded `#000` on active range tabs, and zero use of already-installed `gsap` / `@gsap/react`. Fixing chrome once makes every per-tab redesign (016–025) cheaper and visually coherent under Luxury / Light / Desert.

## Current state

- `dashboardHub/DashboardHubTabBar.tsx` — 12 tabs at `text-[8px]`, active glow; Still renders “Soon” when `!tab.live` though all tabs are `live: true` in `dashboardHubTabs.ts`.
- `dashboardHub/DashboardHubShell.tsx` — lazy pages; fallback is plain “Loading…” text (`HubTabLoadFallback`).
- `dashboardHub/analyticsKit.tsx` — `Hero`, `MiniStat`, `Card`, `RangeTabs` (active text `#000` at ~L174), `FilterChips`, `EmptyState`, `LoadingState` (= `EmptyState` text only ~L259–261). Charts use `colors.*` from theme.
- `dashboardHub/PAGE_CONTRACT.md` — **stale**: forbids shared utils and Shell edits; reality is `HubDataContext` + lazy Shell. Plans 016+ supersede it.
- shadcn present: `src/components/ui/{button,card,tabs,badge,separator,input,textarea,label,progress,table}.tsx`. Missing: `skeleton`, `select`, `empty` (add via CLI as needed).
- `gsap` + `@gsap/react` in `package.json`; unused under `dashboardHub/`.
- Themes: `colors` object from `AS.tsx` THEMES — Hub pages must keep chart/KPI colors from `colors`, not replace with purple-on-white shadcn defaults.

**Design read (executor must honor):** Product ops dashboard redesign for hotel sales teams; Luxury/Light/Desert language; dials `VARIANCE=4`, `MOTION=3`, `VISUAL_DENSITY=7`. Not a marketing landing. Prefer existing theme `colors` + restrained motion (transform/opacity only). Respect `prefers-reduced-motion`.

**Exemplar conventions:** Match existing Hub page shape (`export default function DashboardHubXxxPage({ colors })` + `useHubData()`). Prefer minimal diffs (Ponytail). Skills if available: `.agents/skills/shadcn/SKILL.md`, `.claude/skills/gsap-react/SKILL.md`, `.agents/skills/redesign-existing-projects/SKILL.md`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Add shadcn pieces | `npx shadcn@latest add skeleton` (and `select` if missing) | files under `src/components/ui/` |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Frontend tests | `npm run test:frontend` | exit 0 |
| Build | `npm run build` | exit 0 |

## Suggested executor toolkit

- Read `.agents/skills/shadcn/SKILL.md` before adding components (`npx shadcn@latest`, npm not pnpm).
- Read `.claude/skills/gsap-react/SKILL.md` — use `useGSAP` + scope ref + cleanup.
- Do **not** apply landing-page anti-slop density rules; this is a dense dashboard.

## Scope

**In scope:**
- `dashboardHub/DashboardHubTabBar.tsx`
- `dashboardHub/DashboardHubShell.tsx` (fallback only)
- `dashboardHub/analyticsKit.tsx`
- `dashboardHub/hubMotion.ts` (create — small GSAP enter helper)
- `dashboardHub/PAGE_CONTRACT.md` (update to match HubData + kit + motion)
- `src/components/ui/skeleton.tsx` (via shadcn CLI; optionally `select.tsx`)
- Optional thin bridge: style helpers only if needed inside `analyticsKit.tsx`

**Out of scope:**
- Individual tab page chart layouts (016–025)
- `AS.tsx` theme definitions / sidebar routing
- Feed page (`DashboardHubFeedPage.tsx`)
- Legacy modules (`CRM.tsx`, `AccountsPage.tsx`, etc.)
- URL-synced tabs / react-router
- Deleting `DashboardHubComingSoon.tsx` (optional cleanup only if zero risk)

## Git workflow

- Branch: `advisor/015-hub-chrome-foundation`
- Commits: conventional-ish short messages like Batch A (`fix: …` / `feat: …`)
- Do NOT push or open a PR unless asked

## Steps

### Step 1: Add Skeleton (and Select if you will use it in RangeTabs)

Run `npx shadcn@latest add skeleton`. Confirm `src/components/ui/skeleton.tsx` exists.

**Verify**: file exists; `npx tsc --noEmit -p tsconfig.json` still exits 0.

### Step 2: Upgrade TabBar readability

In `DashboardHubTabBar.tsx`:
- Raise label size to ~`text-[11px]` / `text-xs`, padding `px-3 py-1.5`, remove or soften active glow (`boxShadow` pulse).
- Keep horizontal scroll.
- Remove dead “Soon” badge path **or** only show when `!tab.live` (all currently live — badge should never appear).
- Ensure active/inactive contrast works on Luxury, Light, and Desert (`colors.primary` vs `colors.textMain` / `colors.border`). Active label must **not** hardcode `#000` if primary is light — use a contrast helper or existing theme pattern from AS (prefer `colors.bg` or theme-provided onPrimary if present; if none, use `color-mix` / simple luminance check inline).

**Verify**: visual smoke in browser on Luxury + Light; no Soon badges.

### Step 3: Real loading fallback in Shell

Replace `HubTabLoadFallback` text with a Skeleton strip that roughly matches Hero + KPI row (3–4 skeleton blocks). Keep `aria-busy`.

**Verify**: throttle network or hard-refresh while switching tabs → skeleton, not “Loading…”.

### Step 4: Fix analyticsKit controls + loading

In `analyticsKit.tsx`:
1. `RangeTabs`: remove `#000` active text; use theme-safe contrast (same rule as TabBar).
2. `LoadingState`: render Skeleton grid (import from `@/components/ui/skeleton`), not `EmptyState`.
3. Optionally wrap `RangeTabs` internals with shadcn `Tabs`/`TabsList`/`TabsTrigger` **only if** you can pass `colors` via style without breaking Luxury themes. If shadcn semantic tokens fight the theme, keep custom buttons but fix contrast — **do not** force purple muted backgrounds.
4. Add `Section` helper (title + optional description + children) using `Separator` from shadcn for primary vs secondary chart zones — used by later plans.
5. Export a `PageShell` wrapper: `ref` root + `className`/style padding that pages can opt into.

**Verify**: grep shows no `#000` in `RangeTabs`; `LoadingState` imports Skeleton.

### Step 5: Add `hubMotion.ts` + wire PageShell enter

Create `dashboardHub/hubMotion.ts`:

```ts
import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/** Tab-enter: opacity + slight y on root children with [data-hub-animate]. Honors prefers-reduced-motion. */
export function useHubPageEnter(deps: unknown[] = []) {
  const rootRef = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const q = rootRef.current?.querySelectorAll('[data-hub-animate]');
    if (!q?.length) return;
    if (reduced) {
      gsap.set(q, { opacity: 1, y: 0 });
      return;
    }
    gsap.fromTo(q, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.05, ease: 'power2.out', overwrite: 'auto' });
  }, { scope: rootRef, dependencies: deps, revertOnUpdate: true });
  return rootRef;
}
```

Export `useHubPageEnter` from kit or keep import path `../hubMotion`. Document in `PAGE_CONTRACT.md` that pages should put `data-hub-animate` on Hero, KPI row, and primary chart section — **do not** animate every chart node.

**Verify**: temporary wire Requests in plan 016; this plan only needs the helper file + export.

### Step 6: Update PAGE_CONTRACT.md

Replace stale rules:
- Data: prefer `useHubData()`; local fetch only for inventory not in context (rooms/venues/templates).
- Shared kit + `hubMotion` allowed.
- Shell/TabBar may be edited for chrome.
- shadcn structural components OK; chart colors still from `colors`.
- Motion: transform/opacity only; reduced-motion respected.

**Verify**: contract no longer says “Do NOT modify DashboardHubShell” or “No shared new utils”.

## Test plan

- No new vitest required if pure UI; optional: tiny test that `rangeBounds` / `inRange` still work (already in kit) — skip unless you touch those helpers.
- Manual: switch Hub tabs under Luxury/Light/Desert; confirm TabBar readable; confirm Skeleton on lazy load; confirm RangeTabs readable on Light theme.

## Done criteria

- [ ] `npx tsc --noEmit -p tsconfig.json` exits 0
- [ ] `npm run test:frontend` exits 0
- [ ] `npm run build` exits 0
- [ ] `RangeTabs` has no hardcoded `#000` active color
- [ ] `LoadingState` uses Skeleton, not EmptyState-as-loading
- [ ] `hubMotion.ts` exists with `useHubPageEnter` + reduced-motion branch
- [ ] TabBar labels ≥ 11px; no Soon badges when all tabs live
- [ ] `PAGE_CONTRACT.md` updated
- [ ] No edits outside Scope (`git status`)
- [ ] `plans/README.md` status row → DONE

## STOP conditions

- Theme contrast cannot be solved without changing global `THEMES` in `AS.tsx` — stop and report (may need a one-line onPrimary token; do not invent a new theme system).
- shadcn Tabs forced styling breaks Desert/Luxury — keep custom RangeTabs with contrast fix only.
- GSAP enter causes layout thrash on dense charts — reduce to Hero+KPI only.

## Maintenance notes

- Plans 016–025 must import `useHubPageEnter` and mark `data-hub-animate` regions.
- Reviewers: check Light theme RangeTabs/TabBar contrast first.
- Deferred: URL-synced active tab; deleting ComingSoon.
