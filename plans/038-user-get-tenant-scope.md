# Plan 038: Scope `GET /api/users/{user_id}` to the caller's tenant

> **Executor instructions**: Follow step by step. Run every verification command and confirm the expected result before moving on. If a "STOP condition" occurs, stop and report — do not improvise. When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- backend/routers/users.py`
> If `backend/routers/users.py` changed since this plan was written, compare the "Current state" excerpt against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

`GET /api/users/{user_id}` requires only that the caller be logged in — it does **no tenant scoping**. Any authenticated non-admin user can read any other user across every property/tenant by iterating IDs (IDOR / cross-tenant disclosure). The response exposes `username`, `name`, `email`, `role`, `propertyId`, and permission sets (see `_row_to_client`). The sibling list endpoint in the same file already scopes non-admins correctly, so this is an inconsistency, not a design gap. This is a production go/no-go blocker.

## Current state

- `backend/routers/users.py:108-118` — the vulnerable endpoint:

```python
@router.get("/{user_id}")
def get_user(user_id: str, session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME)):
    require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s;", (user_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return _row_to_client(row)
```

- The **correct pattern already exists** in the list endpoint, `backend/routers/users.py:90-105`:
  - `user = require_user(session_id)` returns the caller dict.
  - `is_admin(user)` (imported from `auth_db`) → admin sees everyone.
  - Non-admins are scoped by `ids = user.get("property_ids") or ([user["propertyId"]] if user.get("propertyId") else [])`, then `WHERE property_id = ANY(%s)`.
- `_row_to_client` (`backend/routers/users.py:61-82`) returns `propertyId` and `property_ids` (from `assigned_property_ids`) on the fetched row — use these to decide visibility.
- Convention: this file uses `psycopg` with parameterized queries (`%s`), `with pool.connection()` / `with conn.cursor()`. Match it exactly.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Backend tests | `cd backend && python -m pytest tests -q` | all pass |
| Single test | `cd backend && python -m pytest tests/test_flat_list_tenant.py -q` | pass |

(If a project venv exists, activate it first, e.g. Windows `backend\venv\Scripts\activate`. If pytest cannot run at all, that is a STOP condition — report it.)

## Scope

**In scope** (only files you may modify):
- `backend/routers/users.py`
- `backend/tests/test_get_user_tenant_scope.py` (create)

**Out of scope** (do NOT touch):
- The list endpoint `get_users` (already correct — use it only as the pattern).
- `_row_to_client`, `patch_user`, `save_user`, `_normalize_user_patch`.
- Any change to the response shape of `_row_to_client`.

## Steps

### Step 1: Write the failing test

Create `backend/tests/test_get_user_tenant_scope.py`. Model it on the existing `backend/tests/test_flat_list_tenant.py` (same fixtures/client setup — read it first). Cover:
- A non-admin caller in property A requesting a user in property B → expect **404** (do not reveal existence; return 404, not 403).
- A non-admin caller requesting a user within their own `property_ids` → expect 200 and the correct user.
- An admin caller requesting any user → expect 200.

**Verify**: `cd backend && python -m pytest tests/test_get_user_tenant_scope.py -q` → FAIL (cross-tenant case currently returns 200).

### Step 2: Add tenant scoping to `get_user`

Rewrite the body of `get_user` to capture the caller and enforce scope, mirroring the list endpoint. Target shape:

```python
@router.get("/{user_id}")
def get_user(user_id: str, session_id: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME)):
    caller = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s;", (user_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    if not is_admin(caller):
        caller_ids = caller.get("property_ids") or ([caller["propertyId"]] if caller.get("propertyId") else [])
        target = _row_to_client(row)
        target_ids = target.get("property_ids") or []
        if not set(caller_ids) & set(target_ids):
            raise HTTPException(status_code=404, detail="User not found")
    return _row_to_client(row)
```

Note: return **404** (not 403) on cross-tenant to avoid confirming the user exists.

**Verify**: `cd backend && python -m pytest tests/test_get_user_tenant_scope.py -q` → PASS.

### Step 3: Regression run

**Verify**: `cd backend && python -m pytest tests -q` → all pass (no existing test broken).

## Test plan

- New file `backend/tests/test_get_user_tenant_scope.py`, three cases above, patterned on `test_flat_list_tenant.py`.
- Verification: backend pytest green, including the 3 new cases.

## Done criteria

- [ ] `cd backend && python -m pytest tests -q` exits 0; the 3 new cases pass.
- [ ] Cross-tenant `GET /api/users/{id}` for a non-admin returns 404.
- [ ] No files outside the in-scope list modified (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

- `backend/routers/users.py:108-118` does not match the "Current state" excerpt (code drifted).
- pytest cannot run in this environment at all.
- The caller dict returned by `require_user` does not contain `property_ids`/`propertyId` (assumption false) — report and stop.

## Maintenance notes

- If a "directory of all staff across properties" feature is ever intended, it must be a separate, explicitly-authorized admin endpoint — do not loosen this one.
- Reviewer: confirm 404 (not 403) on cross-tenant, and that admins are unaffected.
