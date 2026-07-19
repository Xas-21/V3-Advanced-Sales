# Plan 034: Upsert IDOR — write-path tenant authz

> **Executor instructions**: Security P0. Ponytail — fix ownership check on existing rows; match `005` list patterns. Update README + Notion `[034]` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- backend/data_access.py backend/tests backend/migrations/008_write_authz_test.py`

## Status

- **Status**: DONE (2026-07-18)
- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: `005-tenant-flat-list-authz.md` (DONE)
- **Category**: security
- **Planned at**: commit `90c3a4c`, 2026-07-16
- **Notion**: `[034] Upsert IDOR — write-path tenant authz`

## Why this matters

**Plain language:** A staff user at Hotel A must not be able to change Hotel B’s rooms/taxes by guessing an ID. List views were fixed; saving/updating may still be weak.

**Technical:** `upsert_flat` (`data_access.py` ~354–363) calls `_assert_write_access(property_id)` on the **incoming** `propertyId` only. It does **not** load the existing row. Attack: know foreign `id`, send upsert with *your* `propertyId` → overwrites/moves the row. `delete_flat` already resolves existing property — upsert should be symmetric.

## Current state

```python
# backend/data_access.py ~354-363
def upsert_flat(table: str, data: dict, id_prefix: str = "X") -> dict:
    ...
    property_id = str(item.get("propertyId") or "").strip() or None
    _assert_write_access(property_id)  # incoming only
    _upsert_doc(table, row_id, property_id, item, typed)
```

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Backend tests | `npm run test:backend` | exit 0 |
| Focused | `cd backend && pytest tests/ -k upsert -v` | pass (after adding cases) |

## Scope

**In scope**: `upsert_flat` (+ any sibling upserts with same pattern); pytest for cross-property upsert  
**Out of scope**: Frontend; Messenger; Feed; payload-only templates (no property)

## Steps

### Step 1: Load-then-check on upsert

If row exists in `_FLAT_WITH_PID`:
1. `_assert_write_access(existing.propertyId)`
2. `_assert_write_access(incoming propertyId)`
3. Optionally: non-admin cannot change `propertyId` to a different property (or require both in scope)

**Verify**: Cross-property upsert returns 403 / PermissionError.

### Step 2: Regression tests

Extend `test_flat_list_tenant.py` or new `test_upsert_idor.py`: create row as property A admin fixture; as property-B-only user attempt upsert same id → denied.

### Step 3: Audit accounts/requests upserts

Quick pass: same pattern elsewhere? Fix shared helper once if shared.

## Checklist

- [x] Existing-row property checked before overwrite
- [x] Incoming property still checked
- [x] Non-admin cannot steal/move foreign flat rows
- [x] Automated test for cross-property upsert denial
- [x] Admin still can manage across properties (if product requires)
- [x] `npm run test:backend` pass (plan 034 suite: `test_flat_list_tenant.py` 5/5; `test_api_full` has pre-existing PROP_ID/401 failures unrelated to this change)
- [x] README + Notion → Done (after human confirm)

## STOP conditions

- Product requires non-admin cross-property edits → STOP and ask.
- Changing public API response shapes → STOP.
