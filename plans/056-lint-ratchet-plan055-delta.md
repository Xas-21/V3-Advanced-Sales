# Plan 056: Restore ESLint warn ratchet after plan 055 (≤2319)

> **Executor instructions**: Follow step by step. Verify each gate. Do **not** raise `--max-warnings`. Do **not** mass-fix the whole repo’s 2364 legacy warnings. When done, set this plan DONE in `plans/README.md`.
>
> **Drift check**: `git rev-parse --short HEAD` — planned at `72e3b70`. Re-read excerpts if HEAD moved.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (regression from 055)
- **Category**: dx
- **Planned at**: commit `72e3b70`, 2026-07-21
- **Execution**: DONE — `npm run lint` at 2310 warnings (≤2319); typecheck + focused vitest green

## Why this matters

CI runs `npm run lint` with `--max-warnings 2319`. At `805923b` the tree had **exactly 2319** warnings. After plan 055 (`55df5c6`…`72e3b70`) the count is **2364** (+45), so the frontend job fails. Copilot’s “fix all 2364 / eliminate every `any`” is out of scope — only the **delta** must clear (ideally with a few warnings of headroom).

## Evidence (reproduced locally)

| Commit | Warnings |
|--------|----------|
| `805923b` (pre-055) | 2319 |
| `72e3b70` (HEAD) | 2364 |

File-level delta (sum = +45):

| File | Δ | Cause |
|------|---|--------|
| `accountPaymentSync.ts` | +19 | new file, `any` on request payloads |
| `AccountBillingPanel.tsx` | +12 | more `any` after dual-write rewrite |
| `RequestsManager.tsx` | +9 | net new warns in payment/notice paths |
| Hub Rooms/Mice/Agreements + `Reports.tsx` | +4 | `useEffect` missing whole `*Load` object (non-destructured gate) |
| `SystemNoticeModal.tsx` | +1 | `theme: any` |
| `AccountsPage.tsx` / `CRM.tsx` | +1 each | small churn |
| `AS.tsx` | −2 | slight cleanup |

## Current state (bad patterns)

**Non-destructured gate** (eslint wants the object; object is new every render):

```ts
const roomsLoad = usePropertyLoadGate();
// deps: roomsLoad.begin, roomsLoad.isCurrent
// warn: missing dependency 'roomsLoad'
```

**Exemplar (correct)** — `dashboardHub/pages/DashboardHubFeedPage.tsx`:

```ts
const { begin: beginFeedLoad, isCurrent: isFeedLoadCurrent } = usePropertyLoadGate();
```

**New `any`s** — `accountPaymentSync.ts` (`persistRequest(request: any)`, allocate/transfer/split/undo/reverse signatures) and `SystemNoticeModal.tsx` (`theme: any`).

## Commands

| Purpose | Command | Success |
|---------|---------|---------|
| Lint count | `npx eslint . --report-unused-disable-directives -f json -o eslint-out.json` then count `warningCount` | ≤ 2319 |
| Lint ratchet | `npm run lint` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Sync tests | `npx vitest run accountPaymentSync.test.ts propertyScopedLoad.test.ts` | pass |

## Scope

**In scope**

- `Reports.tsx`, `dashboardHub/pages/DashboardHubRoomsPage.tsx`, `DashboardHubMicePage.tsx`, `DashboardHubAgreementsPage.tsx` — destructure `usePropertyLoadGate`
- `accountPaymentSync.ts` (+ tests if signatures change) — replace request `any` with a small `SyncRequest` type
- `SystemNoticeModal.tsx` — type `theme` without `any`
- `AccountBillingPanel.tsx` — replace prop/helper/`catch (e: any)` with concrete/`unknown` types (enough to drop ≥12 warns; clearing all panel `any`s is fine)
- `RequestsManager.tsx` — only enough edits to drop ≥9 net warnings (prefer typing new payment-reverse helpers / unused vars from 055; no drive-by refactors)
- `plans/README.md` — Batch L / plan 056 status

**Out of scope**

- Raising `max-warnings` in `package.json` / CI
- Repo-wide `any` cleanup, unused-vars sweeps, `@ts-ignore` churn
- Changing billing/payment runtime behavior

## Steps

1. Destructure gates in the four pages (match FeedPage). Expect −4 `react-hooks/exhaustive-deps`.
2. Add `SyncRequest` in `accountPaymentSync.ts`; replace every request `any`. Run vitest for that file.
3. Type `SystemNoticeModal` theme as `{ colors?: Record<string, string | undefined> }` (or match ConfirmDialog if one exists).
4. Type `AccountBillingPanel` props/helpers/`catch (e: unknown)`.
5. Clear ≥9 Warnings in `RequestsManager` tied to 055 (inspect with eslint JSON diff vs `805923b` **by warningCount**, not by line — lines shifted).
6. `npm run lint` must exit 0; `npm run typecheck` exit 0.
7. Mark plan DONE in `plans/README.md`.

## Done criteria

- [ ] `npm run lint` exits 0 (warnings ≤ 2319)
- [ ] Warning count ≤ 2319 (prefer ≤ 2315 headroom)
- [ ] `npm run typecheck` exits 0
- [ ] `npx vitest run accountPaymentSync.test.ts propertyScopedLoad.test.ts` passes
- [ ] No change to `max-warnings` value

## STOP conditions

- If clearing the listed files cannot get ≤2319 without touching unrelated modules → STOP and report remaining Δ (do not bump ratchet).
- If typing `SyncRequest` breaks callers extensively → use a minimal structural type + `unknown` catches only; do not rewrite RequestsManager forms.

## Maintenance

Future feature PRs: run `npm run lint` before push. Prefer destructuring `usePropertyLoadGate`. Keep new modules free of `any` or the ratchet will fail again.
