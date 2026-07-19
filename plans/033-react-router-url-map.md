# Plan 033: React-router website-style URL map

> **Executor instructions**: Follow step by step. Ponytail — thinnest router over existing `currentView`; do not rewrite modules. Use improve self-containment. Update `plans/README.md` + Notion `[033]` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- AS.tsx main.tsx package.json dashboardHub/DashboardHubShell.tsx messenger/MessengerContext.tsx`

## Status

- **Status**: DONE (2026-07-18)
- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `004-react-lazy-heavy-pages.md` (DONE — router was deferred there)
- **Category**: direction
- **Planned at**: commit `90c3a4c`, 2026-07-16
- **Notion**: `[033] React-router website-style URLs`

## Why this matters

**Plain language:** Today the app remembers “which screen you’re on” only in memory. Refresh or sharing a link drops you back to the default screen.

**Technical:** `AS.tsx` switches modules via `currentView` state. Hub tabs are also local state (`015` deferred URL sync). No `react-router-dom`. Messenger invite already uses `?joinChat=` — must survive routing.

## Current state

- Lazy-loaded feature modules in `AS.tsx` (plan 004).
- Hub: `dashboardHub/DashboardHubShell.tsx` local tab state.
- Invite deep-link: `messenger/MessengerContext.tsx` reads `joinChat` from `window.location.search`.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Build | `npm run build` | exit 0 |
| Frontend tests | `npm run test:frontend` | exit 0 |
| Manual | Open `/requests`, refresh → still Requests; back/forward works | works |
| Graphify | `graphify update .` | exit 0 |

## Scope

**In scope**: add `react-router-dom`; route table in shell; Hub tab ↔ URL; preserve `joinChat`  
**Out of scope**: SSR; renaming feature folders; marketing landing rewrite

## Steps

### Step 1: Install + BrowserRouter

Add dependency; wrap authenticated app (not necessarily public landing).

**Verify**: App still boots.

### Step 2: Map paths ↔ views

Suggested map (adjust to existing view enum names):

| Path | Module |
|------|--------|
| `/` or `/dashboard` | Main KPI |
| `/requests` | RequestsManager |
| `/crm` | CRM |
| `/accounts` | Accounts |
| `/contracts` | Contracts |
| `/reports` | Reports |
| `/settings` | Settings |
| `/hub/:tab` | Dashboard Hub |

Replace `setCurrentView` with `navigate` where needed; keep FAB/messenger mounted.

**Verify**: Direct URL opens correct module.

### Step 3: Hub nested param

Sync Hub active tab to `:tab` or `?tab=` — one convention only.

**Verify**: Refresh on `/hub/rooms` keeps Rooms.

### Step 4: Preserve joinChat

Ensure invite query still processed after router mount (search params not stripped).

## Checklist (Notion + executor)

- [x] `react-router-dom` installed
- [x] Main modules open via URL paths
- [x] Browser refresh keeps the same screen
- [x] Back / forward works between modules
- [x] Hub tab synced to URL
- [x] Messenger `?joinChat=` still joins (search preserved on navigate)
- [x] `npm run build` + `npm run test:frontend` pass
- [x] `plans/README.md` → DONE; Notion Status → Done (after human confirm)

## STOP conditions

- Rewriting all modules into a new folder tree → STOP.
- Breaking classic landing login flow → STOP and report.
