# Plan 007: Gate Settings users/properties fetch until admin needs them

> **Executor instructions**: Follow step by step. Ponytail — do not invent caching layers. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- Settings.tsx`

## Status

- **Status**: DONE (2026-07-15)
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW–MED
- **Depends on**: ideally after `006-settings-lazy-profile-imports.md` (independent OK)
- **Category**: perf
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

Every Settings open runs `GET /api/users` and `GET /api/properties` (`Settings.tsx:192-206`), even for non-admins who are forced onto the profile tab only (`:208-212`). When those responses land, profile rememos/`mergedUser` work runs again.

## Current state

```tsx
// Settings.tsx ~192-206
useEffect(() => {
  fetch(apiUrl('/api/users')).then(... setUsers ...);
  fetch(apiUrl('/api/properties')).then(... setProperties ...);
}, []);
```

- `appIsAdmin = isSystemAdmin(currentUser)` at `:182`.
- Profile tab uses `currentUser` + `UserPerformanceDashboard`; staff list needs `users` / `properties`.
- `users` also used when opening property → users sub-tab and global Users tab.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Manual | Non-admin opens Settings | no `/api/users` or `/api/properties` in Network (or only after admin tab) |
| Manual | Admin opens Users / Property staff | lists still populate |

## Scope

**In scope**: `Settings.tsx` fetch `useEffect` (+ small helpers if needed)  
**Out of scope**: Backend user list pagination; changing `isSystemAdmin`; profile KPI math (011)

## Steps

### Step 1: Fetch only when needed

Replace the mount-always effect with one of these (pick the smaller correct one):

**Option A (Ponytail preferred):**  
- If `!appIsAdmin`, skip both fetches.  
- If `appIsAdmin`, fetch when `activeTab` is one of: `users`, `property`, `rooms`, `venues`, `taxes`, `financial`, `config` (any tab that needs directories), **or** fetch once on first admin Settings visit if those tabs all need warm data.

**Option B:** Fetch users/properties only when `activeTab === 'users'` or when entering property management that shows staff (`managingProperty` + users sub-view).

Ensure: opening **profile** as admin does **not** require the directories for first paint; if some profile chrome needs `users` for `mergedUser`, keep using `currentUser` until directory loads (dashboard already merges).

Use a `loadedRef` or `directoryFetched` flag so switching tabs does not spam refetch.

**Verify**: Non-admin Settings → Network has no users/properties list calls. Admin Users tab → list still works.

### Step 2: Preserve error handling

Keep `.catch` logging; do not add toast frameworks.

**Verify**: Force 401 on `/api/users` still does not crash Settings.

## STOP conditions

- Admin Users tab empty because fetch never runs → STOP and fix gate.
- Property tab breaks for admin missing `properties` state → expand gate to include that tab, don’t fetch on every profile open.

## Done criteria

- [ ] Profile-only / non-admin path does not always hit both directory endpoints on mount
- [ ] Admin staff/property flows still get users + properties
- [ ] `npm run test:frontend` exit 0
- [ ] `plans/README.md` → DONE
