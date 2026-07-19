# Plan 046: Fix the real correctness bugs surfaced by typecheck

> **Executor instructions**: Follow step by step. Each fix has its own verification. Honor "STOP conditions". Update `plans/README.md` when done. Best run **after** plan 040 so `tsc --noEmit` is wired and these fixes reduce the error count.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- Reports.tsx RequestsManager.tsx AccountsPage.tsx websocket-client.ts AS.tsx`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED (behavioral fixes to effect deps/keys — test the affected views)
- **Depends on**: 040 (typecheck gate)
- **Category**: bug
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

Among the ~50 tsc errors, most are cosmetic but a handful are **real logic bugs** (BUG-03/04/05) plus one broken type contract (DEBT-02). They don't crash today but cause silent wrong behavior (stale reactivity, unstable React keys, dead feature branches) and remove compiler protection on the live-update path. Fixing them + turning on the gate (040) stops the next one from becoming a live crash.

## Current state

- **BUG-03** `Reports.tsx:1374` and `Reports.tsx:2321` — `selectedEntity === 'Promotions'`, but the `selectedEntity` union has no `'Promotions'` member (`TS2367: no overlap`). Either Promotions was retired (dead branch) or the type lies.
- **BUG-04** `RequestsManager.tsx:581` — effect deps reference `accForm.requestDate, accForm.eventStart, accForm.eventEnd` which don't exist on the accommodation form shape (tsc suggests `requestName`); same at `:588` (`evtForm.eventStart/eventEnd`) and `:2808` (`req.requestType`). These deps are perpetually `undefined`, so the promotion auto-link effect never re-fires on those fields.
- **BUG-05** `AccountsPage.tsx:353` (twice) — `Property 'key' does not exist on type '{ account: any; contact: any; }'` → `.key` is `undefined` at runtime (unstable React keys / wrong value downstream).
- **DEBT-02** `websocket-client.ts:14` declares `interface WebSocketMessage` **without** `export`; `AS.tsx:82` imports it as `type` (`TS2459`). Type-only, erased at build, but `handleLiveUpdate`'s message is effectively untyped.
- **BUG-07 (cosmetic sweep)** recharts `<Legend>`/formatter typings, `Uint8Array→BlobPart`, implicit-`any` params, ref-type mismatches, `accountRates.ts:70`. These are not runtime hazards; fix to reduce noise so the gate is clean. The one to actually check: `AS.tsx:6370` (a div-typed ref attached to a `<button>`).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit` | error count drops after each step |
| Tests | `npm run test:frontend` | all pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**: the files listed above + any test files.
**Out of scope**: deleting dead `RequestsView` / mock modals (that's plan 047), the currency-formatter dedup (plan 048), AS.tsx decomposition (plan 049).

## Steps

### Step 1 (DEBT-02): Export `WebSocketMessage`

Add `export` to the interface at `websocket-client.ts:14`. Confirm `handleLiveUpdate` (`AS.tsx:4653`) now type-checks against it; fix any newly-surfaced field mismatches on the message shape (that's the protection returning).

**Verify**: `npx tsc --noEmit` no longer reports `TS2459` for `WebSocketMessage`.

### Step 2 (BUG-03): Resolve the Promotions branches

Determine at runtime whether Promotions is still a selectable entity (grep the UI for where `selectedEntity` is set: `grep -rn "selectedEntity" Reports.tsx`). If Promotions is retired → delete the `'Promotions'` branches (`Reports.tsx:1374` redundant guard, `:2321` block). If still real → add `'Promotions'` to the `selectedEntity` union type.

**Verify**: `npx tsc --noEmit` no longer reports `TS2367` at those lines; `npm run test:frontend` passes.

### Step 3 (BUG-04): Fix RequestsManager effect deps

Read the accommodation/event form types. Replace the non-existent field names in the dep arrays at `RequestsManager.tsx:581,588` with the real fields the effect should react to (e.g. `checkIn`/`checkOut` for accommodation; the actual event date fields). Fix the `req.requestType` access at `:2808` to the real field, or remove the dead branch if the field doesn't exist.

**Verify**: `npx tsc --noEmit` clears those errors; manually confirm (or add a light test) that changing the relevant date fields re-triggers promotion auto-link. `npm run test:frontend` passes.

### Step 4 (BUG-05): Fix AccountsPage `.key`

At `AccountsPage.tsx:353`, derive the key from the real row identity (`account.id`/`contact.id`) instead of the non-existent `.key`.

**Verify**: `npx tsc --noEmit` clears the `TS2339` at :353; the accounts list renders with stable keys (no React key warnings in console).

### Step 5 (BUG-07): Cosmetic sweep

Fix implicit-`any` params (add types), ref generic types (incl. checking `AS.tsx:6370`), and `accountRates.ts:70`. For genuinely hard recharts `<Legend>` typings, wrap in a small typed wrapper or a single documented `// @ts-expect-error <reason>` (never a silent ignore).

**Verify**: `npx tsc --noEmit` error count is at/near zero; `npm run build` exits 0; `npm run test:frontend` passes.

## Done criteria

- [ ] `WebSocketMessage` is exported and `handleLiveUpdate` type-checks.
- [ ] BUG-03/04/05 resolved (union fixed or branch deleted; correct effect deps; real row keys).
- [ ] `npx tsc --noEmit` error count materially reduced (ideally 0, enabling 040's blocking gate).
- [ ] `npm run build` exits 0; `npm run test:frontend` passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Cited lines don't match (drift).
- Fixing BUG-04's effect deps changes user-visible auto-link behavior in a way you can't verify safe — report and propose a test first.
- A recharts typing can't be resolved without a risky refactor — use one documented `@ts-expect-error` and move on.

## Maintenance notes

- After this + 047 + 048, the ~50-error count should approach zero; flip 040's typecheck to blocking.
- Reviewer: scrutinize BUG-04 (behavioral) and BUG-03 (feature presence) most.
