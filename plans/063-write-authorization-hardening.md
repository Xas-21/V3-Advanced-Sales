# Plan 063: Lock down write authorization (properties, global config, uploads, delete-impact)

> **Executor instructions**: Follow step by step; verify each step; obey STOP conditions.
> A reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7d43062..HEAD -- backend/routers/properties.py backend/routers/contracts.py backend/routers/cxl_reasons.py backend/routers/uploads.py backend/routers/accounts.py backend/data_access.py`

## Status
- **Priority**: P0
- **Effort**: S–M
- **Risk**: MED (must not block legitimate admin provisioning)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `7d43062`, 2026-07-22

## Why this matters
Four write paths are under-protected today. Any authenticated user (even a Sales Executive)
can create/edit/delete **properties** and **global contract templates / cancellation reasons**,
can read/delete **any uploaded file** by id, and can probe **any account's delete-impact**.
These break the multi-tenant boundary the rest of the app enforces. Fixes are small and local.

## Current state (verified)
- `backend/routers/properties.py:14-22` — `POST /api/properties` and `DELETE /api/properties/{id}` have no admin gate; `data_access.upsert_flat`/`delete_flat` treat `properties` as a global (`_FLAT_BY_ID`) row so `_assert_write_access(None)` passes for any authed user (`data_access.py:61-69,450-451`).
- `backend/routers/contracts.py:23-33` and `backend/routers/cxl_reasons.py:15-25` — `upsert_payload_only` (`data_access.py:491-497`) has **no** write check; `delete_flat` for these id-keyed tables resolves `pid=None` → passes.
- `backend/routers/uploads.py:136-193` — `GET`/`DELETE` only `require_user`; no ownership/tenant check.
- `backend/routers/accounts.py:99-118` — `delete-impact` counts by id with no `get_account()` scope check.
- Auth helpers to reuse: `dependencies.require_admin` (`dependencies.py:48-52`) and `data_access.get_account` (already tenant-scoped, returns None out-of-scope, `data_access.py:1194-1209`).

Convention: routers take `session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME)` and call `require_user`/`require_admin` — see `backend/routers/users.py:119-163` as the exemplar.

## Scope
**In scope:** `backend/routers/properties.py`, `backend/routers/contracts.py`, `backend/routers/cxl_reasons.py`, `backend/routers/accounts.py`, `backend/routers/uploads.py`, `backend/data_access.py` (add write checks to `upsert_payload_only`), new tests under `backend/tests/`.
**Out of scope:** the tenant-scoping of normal data routers (already correct); changing upload storage layout.

## Steps

### Step 1: Properties → admin-only writes
In `properties.py`, add `session_id` Cookie param + `require_admin(session_id)` to `create_property` and `remove_property`. (Product note: if property *managers* must edit their own property settings later, that's a separate permission — for now admin-only is the safe default; confirm with reviewer.)
**Verify**: non-admin `POST /api/properties` → 403; admin → 200. Add `backend/tests/test_property_write_authz.py`.

### Step 2: Contract templates + cxl reasons → admin-only writes
In `contracts.py` and `cxl_reasons.py`, add `require_admin(session_id)` to the POST and DELETE handlers.
**Verify**: non-admin POST/DELETE → 403.

### Step 3: Defense-in-depth in the data layer
In `data_access.upsert_payload_only` add `_assert_write_access(str(item.get("propertyId") or "").strip() or None)` at the top (mirrors `upsert_flat`). This keeps a check even if a future route forgets it.
**Verify**: unit test calling `upsert_payload_only` with no auth context raises `PermissionError`.

### Step 4: Account delete-impact → tenant-scoped
In `accounts.py` delete-impact handler, first call `get_account(account_id)` (tenant-scoped) and if it returns None raise `HTTPException(404)` before computing counts.
**Verify**: scoped user requesting a foreign account id → 404.

### Step 5: Upload ownership/tenant guard
Record ownership at upload time and enforce on GET/DELETE. Minimal approach: create table `upload_files(public_id TEXT PRIMARY KEY, uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, property_id TEXT, folder TEXT, created_at TIMESTAMPTZ DEFAULT now())` in a new migration `backend/migrations/017_upload_files.sql`; insert on `POST /local`; on `GET/DELETE` require the caller be admin OR the uploader OR share the file's `property_id` scope. If the file has no ownership row (legacy uploads), fall back to current behavior (require_user) and log once — do NOT break existing feed/chat images.
**Verify**: uploader can GET/DELETE own file; a different scoped user gets 404 for a file in another property; legacy files still load.

### Step 6: Tests
`backend/tests/test_property_write_authz.py`, extend a test for cxl/contracts authz and delete-impact scope. Model after `backend/tests/test_tenant_scope_fail_closed.py`.
**Verify**: `cd backend && python -m pytest tests -v` all pass.

## Done criteria
- [ ] Non-admin blocked (403) from property + template + cxl writes; admin allowed
- [ ] `upsert_payload_only` raises without auth context (unit test)
- [ ] delete-impact returns 404 for out-of-scope account
- [ ] Upload GET/DELETE enforce ownership/tenant; legacy files still served
- [ ] `pytest` green; only in-scope files changed

## STOP conditions
- Enforcing upload ownership breaks existing feed/chat `<img>` loads for legacy files (must keep backward-compat fallback).
- Requiring admin on properties breaks a documented manager self-service flow (report; may need a permission instead of admin).

## Maintenance notes
- Reviewer: confirm whether property editing should be `require_admin` or a granular permission; this plan chose admin as the safe default.
- Upload ownership table is additive; existing files are grandfathered.
