# Plan 044: Make the tenant-scope helper fail closed

> **Executor instructions**: Follow step by step. This is a defense-in-depth change that flips a fail-open default to fail-closed — it can surface latent code paths, which is the point. Run every verification. Honor "STOP conditions". Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- backend/utils.py backend/data_access.py`

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: MED — flipping the default to deny may reveal internal callers that ran without an auth context; that's the vulnerability being closed, but it needs careful testing.
- **Depends on**: 040 (CI), ideally after 038 (both touch authz)
- **Category**: security
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

`_tenant_scope()` returns `None` (= "admin-wide, no restriction") in two different situations: a real admin, **and** when there is no auth context at all. Today all data routers require auth via middleware, so it's not directly exploitable — but any new internal caller, a route registered without `require_user`, or a middleware-ordering change would silently grant cross-tenant read/write instead of denying. A security default should fail **closed**.

## Current state

- `backend/utils.py:42-62` — `_tenant_scope()`:

```python
user = get_current_user_ctx()
if not user:
    return None  # No auth context (e.g. public feedback route) -> caller's responsibility
if str(user.get("role") or "").strip().lower() in ("super_admin", "admin"):
    return None
ids = set(user.get("property_ids") or [])
if user.get("propertyId"):
    ids.add(user["propertyId"])
return ids
```

- `backend/utils.py:65-68` — `_filter_by_tenant(payloads, scope)` treats `scope is None` as "return everything".
- `data_access._assert_write_access` / `_assert_upsert_write_access` treat `scope is None` as full access (audit cites `data_access.py:53-54`, and the read/write guards at `:400-410, 626-661, 1032-1038`).
- **Important**: the comment names the *public feedback route* as a legitimate no-context caller. That path must keep working — do not break `RequestFeedbackPublicPage` / the public feedback endpoint.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Backend tests | `cd backend && python -m pytest tests -q` | all pass |
| Find callers | `grep -rn "_tenant_scope\|_filter_by_tenant\|_assert_write_access\|_assert_upsert_write_access" backend` | enumerate every use |

## Scope

**In scope**: `backend/utils.py`, `backend/data_access.py`, `backend/tests/`.
**Out of scope**: router-level `require_user` wiring (already present); the public feedback endpoint's intended unauthenticated behavior (must stay working).

## Steps

### Step 1: Enumerate callers and distinguish the three states

Run the grep. Introduce an explicit sentinel so the three cases are distinct instead of overloading `None`:
- admin / full access → an explicit `ADMIN_SCOPE` sentinel (or `return None` kept **only** for admin),
- non-admin → set of ids (possibly empty = sees nothing),
- **no auth context → deny** (empty set), except for endpoints that intentionally run public.

Decide the representation (a module-level `ADMIN_SCOPE = object()` sentinel is clean). Update `_filter_by_tenant` and the `_assert_*` guards to treat "no context" as deny, and `ADMIN_SCOPE` as full access.

### Step 2: Preserve intentional public paths explicitly

For the public feedback route (and any other genuinely public data call found in Step 1), pass an explicit opt-in (e.g. a parameter or a dedicated data function) rather than relying on the fail-open default. The public path must remain functional; the change is that it's **explicit**, not a silent side effect of missing context.

**Verify**: exercise the public feedback flow test (or add one) — it still returns data. `python -m pytest -q` for that test → PASS.

### Step 3: Add a regression test for fail-closed

Add `backend/tests/test_tenant_scope_fail_closed.py`: calling a scoped data read/write with **no** current-user context returns nothing / raises (deny), while an admin context still gets full access and a non-admin gets only their ids.

**Verify**: `python -m pytest tests/test_tenant_scope_fail_closed.py -q` → PASS.

### Step 4: Full regression

**Verify**: `cd backend && python -m pytest tests -q` → all pass. If a previously-passing test now fails because it relied on fail-open, that test was asserting the vulnerability — fix the test to set an auth context, and note it in the report.

## Done criteria

- [ ] "No auth context" yields deny (empty scope), not full access, for scoped data functions.
- [ ] Admin still gets full access; non-admin still scoped to their ids.
- [ ] Public feedback flow still works via an explicit opt-in.
- [ ] New fail-closed test passes; `cd backend && python -m pytest tests -q` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Step 1 reveals many callers relying on fail-open in non-public paths — STOP and report the list before flipping; each needs an auth context or explicit public opt-in.
- The public feedback endpoint can't be made explicit without a larger refactor — report; do not ship a change that breaks public feedback.
- Cited lines don't match (drift).

## Maintenance notes

- Reviewer: every data function that can run publicly must now say so explicitly; scrutinize any new `ADMIN_SCOPE`/opt-in use in review.
- This composes with plan 038 (both enforce tenant isolation); land 038 first if sequencing.
