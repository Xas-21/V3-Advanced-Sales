# Plan 010: Replace O(n²) contact-duplicate scan with Map index

> **Executor instructions**: Follow step by step. Keep same-name duplicate logic. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- AccountsPage.tsx accountProfileCompleteness.ts`

## Status

- **Status**: DONE (2026-07-15)
- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (can follow 008/009)
- **Category**: perf
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

`systemDuplicateItems` (`AccountsPage.tsx:363-431`) already groups same-name in O(n), then does nested `i`/`j` account loops with nested contact email/phone compares — O(accounts² × contacts²) on every Accounts open, even when the duplicate UI is closed. Result merges into `allDuplicateItems` (`:438-440`).

## Current state

- Same-name pairs: `byName` Map + pair loops (`:363-394`) — keep.
- Contact pairs: double account loop + contact cross product (`:395-423`) using `meaningfulContactEmail` / `meaningfulContactPhone`.
- Output shape: `pushPair(left, right, reason, key)` objects with `source: 'system-detection'`.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Manual | Accounts with two accounts sharing a contact email | still appears in duplicate queue/UI |

## Scope

**In scope**: `AccountsPage.tsx` `systemDuplicateItems` memo (extract helper OK)  
**Out of scope**: Scan-queue API; merging UX redesign; virtualization

## Steps

### Step 1: Index contacts by email/phone

Replace the nested contact search with:

1. Walk all `accountsSameProperty` once.
2. For each contact with meaningful email → `Map<email, accountId[]>` (or list of `{account, contact}`).
3. Same for phone.
4. For each map key with 2+ accounts, emit pairs (same `pushPair` / reason strings like `same-contact-email:${ea}`).

Deduplicate with the existing `seenContactKey` / final `seen` filter so pair order does not create duplicates.

Keep same-name block as-is unless a one-line cleanup is obvious.

**Verify**: Known duplicate email pair still detected; unique contacts produce no false pairs.

### Step 2: Optional defer (only if still heavy)

Ponytail: **do not** add `requestIdleCallback` unless profiling still shows lag after Map indexing. Prefer correct O(n) sync first.

## Test plan

- Small pure helper test: 3 accounts, shared email between A and B, unique C → exactly one system pair reason containing that email.
- Place beside extracted helper or in `AccountsPage` is fine as `accountDuplicateDetect.test.ts` if extracted.

## STOP conditions

- Duplicate reasons/labels change in a way that breaks merge/scan queue consumers → STOP; preserve `reason` string prefixes.
- Skipping same-name detection → STOP; only rewrite contact branch.

## Done criteria

- [ ] Contact duplicate detection is Map/index based (no full account×account nested contact scan)
- [ ] Same-name detection still works
- [ ] `npm run test:frontend` exit 0
- [ ] `plans/README.md` → DONE
