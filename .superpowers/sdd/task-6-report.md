# Task 6 Report: Contracts + Activity Timeline tabs

## Status
**Complete**

## Changes (CRMProfileView.tsx)
1. **Overview** — Removed Contracts and Activity Timeline cards; Overview now has performance chart, Tags/KPIs/Preferred Business, and Active Opportunities only.
2. **Contracts tab** — `profileTab === 'contracts'` renders the contracts card (+ New Contract, status/dates, download/upload/delete handlers unchanged).
3. **Activity Timeline tab** — `profileTab === 'timeline'` renders timeline list with manual edit/delete, pagination, and request links unchanged.
4. **Modals** — Activity modal remains at profile root (outside tab conditionals).

## Commit
- Branch: `feat/account-profile-tabs-merge-fix`
- `fc3af59` — `feat: move contracts and activity timeline into account profile tabs`

## Tests
- `npx vitest run accountMergeUtils.test.ts`: **4/4 passed**
- `graphify update .`: graph rebuilt (6248 nodes)
- Manual UI tab smoke: not run

## Concerns
- ~~Tab order in DOM is overview → contracts → timeline → contacts (UI pill order unchanged).~~ **Fixed:** DOM panel order now matches pills: overview → contacts → contracts → timeline.
- Manual acceptance checklist (merge A→B, live sync, tab reset) not run in this session.

---

## Final review fixes (2026-07-22)

### Changes
1. **accountMergeUtils.test.ts** — `afterEach(() => vi.unstubAllGlobals())` on the persist describe; tombstone assertion after `persistAccountMergeToBackend`; `clearMergedAccountTombstones('p1')` before/after persist test.
2. **CRMProfileView.tsx** — Reordered exclusive tab panels to match pill order: overview → contacts → contracts → timeline (presentation only).

### Commit
- `7813644` — `test: unstub fetch and align profile tab panel order`

### Tests
- `npx vitest run accountMergeUtils.test.ts`: **4/4 passed** (927ms)
