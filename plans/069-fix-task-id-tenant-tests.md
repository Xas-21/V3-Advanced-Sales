# Plan 069: Fix the two pre-existing task-id tenant tests (test-only, no app/data change)

> **Executor instructions**: Follow step by step; verify; obey STOP conditions. A reviewer
> maintains `plans/README.md`. TEST-ONLY: do NOT change any application code or the database.
>
> **Drift check (run first)**: `git diff --stat 7d43062..HEAD -- backend/tests/test_flat_list_tenant.py backend/data_access.py`

## Status
- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (edits one test file only)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `7d43062`, 2026-07-22

## Why this matters
Two tests in `backend/tests/test_flat_list_tenant.py` fail against current (correct) behavior.
`upsert_flat` stores property-scoped catalog rows (rooms/venues/taxes/tasks/promotions/financials)
under a namespaced primary key `"{propertyId}::{id}"` (`backend/data_access.py:441-442`) — this is
intentional and is what makes cross-tenant id collisions impossible. The two tests predate that
behavior and assert an un-prefixed id / expect a 403 from an unrealistic setup, so they fail (and
were hidden by CI `continue-on-error`). Fixing them makes CI trustworthy again. **No application
behavior changes** — the app is correct; the tests are stale.

## Current state (verified)
- `backend/data_access.py:441-442`:
  ```python
  if table in {"taxes", "rooms", "venues", "tasks", "promotions", "financials"} and property_id and "::" not in row_id:
      row_id = f"{property_id}::{row_id}"
  ```
  So a task POSTed with `{id:"X", propertyId:"P"}` is stored/returned with id `"P::X"`. An id that
  ALREADY contains `"::"` is NOT re-prefixed (used to address an existing row).
- Fixture (`test_flat_list_tenant.py:60-82`) inserts the foreign task via direct SQL with the
  **un-prefixed** id `task_id` and `property_id = other_pid` — unrealistic (a real task for a
  property is stored prefixed `other_pid::task_id`).
- Failing test A — `test_scoped_user_cannot_upsert_foreign_task_with_home_property` (`:140-166`):
  posts `{id: task_id, propertyId: home_pid}` and expects 403. Actual: `upsert_flat` prefixes to
  `home_pid::task_id` (a new row it's allowed to create) → 200, and the foreign row is untouched.
  The IDOR guard never fires because the sent id gets namespaced away from the foreign row.
- Failing test B — `test_scoped_user_can_create_task_on_home_property` (`:169-194`): posts
  `{id: new_id, propertyId: home_pid}`, asserts `body.id == new_id` and cleans up `WHERE id = new_id`.
  Actual id is `home_pid::new_id` → assertion fails AND cleanup misses the real row.

## Scope
**In scope:** `backend/tests/test_flat_list_tenant.py` ONLY.
**Out of scope:** `backend/data_access.py` and all app code — the prefix behavior is correct, do NOT change it. The DB.

## Steps

### Step 1: Make the fixture store the foreign task the way the app really does
In the fixture (`:60-82`), insert the foreign task with the property-scoped id so it mirrors real
storage. Change the inserted `id` from `task_id` to `f"{other_pid}::{task_id}"` (keep `payload.id`
as that same scoped id), and update the fixture teardown delete accordingly. Expose the scoped id to
tests (e.g. add `"scoped_task_id": f"{other_pid}::{task_id}"` to the yielded dict; keep `task_id` too).

### Step 2: Fix test A to exercise the REAL IDOR guard (keep the 403 intent)
Post the **full scoped foreign id** with the attacker's home property:
`json={"id": fx["scoped_task_id"], "propertyId": fx["home_pid"], ...}`. Because the id contains
`"::"`, `upsert_flat` does not re-prefix, loads the existing foreign row, and
`_assert_upsert_write_access(other_pid, home_pid, row_exists=True)` raises PermissionError → **403**.
Keep `assert r.status_code == 403`. Keep the "row still belongs to other_pid" check, querying
`WHERE id = fx["scoped_task_id"]`.

### Step 3: Fix test B to expect the scoped id + clean up the real row
- `assert str(body.get("id")) == f"{fx['home_pid']}::{new_id}"`.
- `assert str(body.get("propertyId")) == fx["home_pid"]` (unchanged).
- Cleanup: delete `WHERE id = %s` with `f"{fx['home_pid']}::{new_id}"` (the real stored id).

### Step 4: Run the file
**Verify**: `docker exec as-backend python -m pytest tests/test_flat_list_tenant.py -v` → all 5 pass.

## Done criteria
- [ ] `docker exec as-backend python -m pytest tests/test_flat_list_tenant.py -v` → 5 passed, 0 failed
- [ ] Full suite has no NEW failures: `docker exec as-backend python -m pytest tests -q` (the 2 previously-failing task tests now pass; count of failures drops by 2)
- [ ] Only `backend/tests/test_flat_list_tenant.py` changed (`git status`)

## STOP conditions
- Making test A post the scoped id does NOT yield 403 (would mean the IDOR guard for prefixed rows
  differs from the analysis — report the actual status + response body; do not weaken the assertion
  to make it pass).
- Any change would be needed outside the test file.

## Maintenance notes
- Reviewer: confirm the fix characterizes real behavior (prefix + IDOR guard), not a weakened assertion.
- The app's `::` prefixing is the source of truth here; if it's ever removed, these tests change again.
