# Plan 009: Index requests once for Accounts list revenue columns

> **Executor instructions**: Follow step by step. Match existing `filterRequestsForAccount` semantics. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- AccountsPage.tsx accountProfileData.ts operationalSegmentRevenue.ts`

## Status

- **Status**: DONE (2026-07-15)
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (008 optional first)
- **Category**: perf
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

`requestStatsByAccountId` loops every account and calls `filterRequestsForAccount(sharedRequests, …)` then `computeRequestRevenueBreakdownNoTax` per match (`AccountsPage.tsx:236-248`). That is ~O(accounts × requests) plus line-item revenue work on every Accounts open — the main list lag vs CRM/Requests.

## Current state

```tsx
// AccountsPage.tsx ~236-248
const requestStatsByAccountId = useMemo(() => {
  const m = new Map<string, { revSar: number; reqCount: number }>();
  for (const a of accounts) {
    const id = String(a?.id ?? '');
    if (!id) continue;
    const reqs = filterRequestsForAccount(sharedRequests, id, a?.name);
    let revSar = 0;
    for (const r of reqs) {
      revSar += computeRequestRevenueBreakdownNoTax(r).totalLineNoTax;
    }
    m.set(id, { revSar, reqCount: reqs.length });
  }
  return m;
}, [accounts, sharedRequests]);
```

Matching rules live in `accountProfileData.ts`:

```ts
// requestMatchesAccount — id first, else normalized name
export function filterRequestsForAccount(requests, accountId, accountName) {
  return requests.filter((r) => requestMatchesAccount(r, accountId, accountName));
}
```

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Manual | Accounts list Total Rev / Total Req | same numbers as before for sample accounts |

## Scope

**In scope**: `AccountsPage.tsx` and optionally a small helper in `accountProfileData.ts`  
**Out of scope**: Server-side aggregates API; virtualizing the table; profile chart (CRMProfileView) rewrite beyond reusing an index if trivial

## Steps

### Step 1: Build a one-pass index from sharedRequests

Add a helper (prefer `accountProfileData.ts` so it is reusable), e.g. `buildRequestStatsByAccount(accounts, sharedRequests)`:

1. Walk `sharedRequests` **once**.
2. For each request, compute `rev = computeRequestRevenueBreakdownNoTax(r).totalLineNoTax` once.
3. Attribute to account id when `req.accountId` matches an account id in the book.
4. Also support name fallback: build `Map<normalizedName, accountId[]>` or attribute to name key then fold into account ids — **must preserve** current `requestMatchesAccount` behavior (id wins; else exact normalized name match).

Ponytail: if name fallback is rare, still must be correct — do not drop name matching to “save” code.

**Verify**: For 2–3 known accounts, `reqCount` and `revSar` match pre-change values.

### Step 2: Wire AccountsPage memo

Replace the nested loop `useMemo` with the helper. Keep the same `Map<string, { revSar; reqCount }>` consumer API used by sort/columns (`AccountsPage.tsx` ~324–337, ~853–866).

**Verify**: Sort by Total Rev still works; no blank columns.

## Test plan

- Prefer a small vitest on the new helper: 3 accounts, 4 requests (id match, name match, unmatched, multi-request sum).
- Pattern: keep tests next to module if the repo adds `accountProfileData.test.ts`; otherwise manual OK for this plan if time-boxed — but helper pure function is easy to test; **write the unit test**.

**Verify**: `npx vitest run accountProfileData` or `npm run test:frontend` includes the new file.

## STOP conditions

- Revenue totals diverge from old path on production-like fixture → STOP.
- Tempted to call a new backend endpoint → STOP; out of scope.

## Done criteria

- [ ] Accounts list stats built in one pass over requests (not filter-per-account)
- [ ] Totals match previous semantics (id + name matching)
- [ ] Unit test for helper passes
- [ ] `npm run test:frontend` exit 0
- [ ] `plans/README.md` → DONE
