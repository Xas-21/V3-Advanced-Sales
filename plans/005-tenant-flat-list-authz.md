# Plan 005: Tenant-filter flat entity lists

> **Executor instructions**: Security fix — match existing `_filter_by_tenant` patterns. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- backend/data_access.py backend/migrations/008_write_authz_test.py backend/tests`

## Status

- **Status**: DONE (2026-07-15)
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `90c3a4c`, 2026-07-14

## Why this matters

`_list_doc` for `_FLAT_WITH_PID` (rooms, venues, taxes, financials, tasks, promotions) filters SQL by client `property_id` but **never** applies `_filter_by_tenant`. Omitting `propertyId` returns the full table. Accounts/requests already tenant-filter; flats do not.

## Current state

- `backend/data_access.py:173-216` — `_list_doc`: for `_FLAT_WITH_PID` returns payloads without `_filter_by_tenant`; only `properties` / `_FLAT_BY_ID` are scoped.
- Write path uses `_assert_write_access` (incoming property only) — upsert IDOR is a **separate** follow-up, not this plan.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Backend tests | `npm run test:backend` | exit 0 |
| Authz migration test | run pytest including write authz tests | pass |

## Scope

**In scope**: `backend/data_access.py` (`_list_doc`), regression test
**Out of scope**: Upsert hijack (SEC-02), feed/chat property clamp, frontend

## Steps

### Step 1: Filter flat lists

After building `out` for `table in _FLAT_WITH_PID`, always:

```python
out = _filter_by_tenant(out, _tenant_scope())
```

Also: if `property_id` is provided and scope is not None and `property_id not in scope`, return `[]` or raise PermissionError (match how other routers behave — prefer empty list or 403 consistently with accounts).

**Verify**: Non-admin cookie cannot read another property’s `/api/tasks?propertyId=foreign`.

### Step 2: Regression test

Extend `backend/migrations/008_write_authz_test.py` or `backend/tests/` with a list-IDOR case for one flat router (e.g. tasks or taxes).

**Verify**: `npm run test:backend` exit 0.

## STOP conditions

- Admin “list all properties’ taxes” breaks and product requires it → gate with `is_admin()` only, don’t leave unscoped for staff.

## Done criteria

- `_FLAT_WITH_PID` lists are tenant-scoped for non-admins.
- New/extended test covers cross-property list denial.
