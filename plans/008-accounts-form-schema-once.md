# Plan 008: Resolve account form schema once for incomplete checks

> **Executor instructions**: Follow step by step. Ponytail — no new packages. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- AccountsPage.tsx accountProfileCompleteness.ts formConfigurations.ts`

## Status

- **Status**: DONE (2026-07-15)
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (do before 009/010 Accounts work or in parallel)
- **Category**: perf
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

`incompleteAccounts` maps every same-property account through `isAccountProfileIncomplete` → `getAccountProfileGaps` → `getResolvedFormSchema` → `loadPropertyFormOverrides`, which **clones** `property.formConfigurations` on every call (`formConfigurations.ts:334-336`). Opening Accounts pays N deep clones just for incompleteness badges.

## Current state

```tsx
// AccountsPage.tsx ~471-474
const incompleteAccounts = useMemo(() => {
  return accountsSameProperty
    .filter((a: any) => isAccountProfileIncomplete(a, propertyIdForForms, activeProperty))
    .sort(...);
}, [accountsSameProperty, propertyIdForForms, activeProperty]);
```

```ts
// formConfigurations.ts ~330-336
export function loadPropertyFormOverrides(...) {
  ...
  return clone(fc as PropertyFormConfigStore);
}
```

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |

## Scope

**In scope**: `AccountsPage.tsx` and/or `accountProfileCompleteness.ts` / thin helper  
**Out of scope**: Changing which fields count as incomplete; revenue indexing (009); duplicate detection (010)

## Steps

### Step 1: Resolve schema once per memo

In the `incompleteAccounts` `useMemo` (or a preceding memo):

1. Call `getResolvedFormSchema` / `loadPropertyFormOverrides` **once** for `propertyIdForForms` + `activeProperty`.
2. Pass that resolved schema into gap checks for each account.

Prefer extending `getAccountProfileGaps` / `isAccountProfileIncomplete` with an optional preloaded schema argument, **or** add `isAccountProfileIncompleteWithSchema(account, schema)` — match existing naming in `accountProfileCompleteness.ts`.

Do **not** change clone behavior globally inside `loadPropertyFormOverrides` for all callers unless clearly safe (other callers may rely on isolation).

**Verify**: Incomplete badge/list still flags the same accounts as before on a known incomplete account.

### Step 2: Tiny unit check (optional but preferred)

If easy: one vitest asserting two accounts with same property only invoke override load once when using the new API — only if a lightweight test harness already exists for these modules. Otherwise manual verify is enough; do not add a heavy test framework.

**Verify**: `npm run test:frontend` exit 0.

## STOP conditions

- Incomplete detection results change for a known account → STOP; schema must be identical to previous resolve path.
- Touching every `loadPropertyFormOverrides` caller with behavior change → STOP; keep fix local to incomplete scan.

## Done criteria

- [ ] Incomplete scan does not clone form config once per account
- [ ] Behavior of incompleteness unchanged
- [ ] `npm run test:frontend` exit 0
- [ ] `plans/README.md` → DONE
