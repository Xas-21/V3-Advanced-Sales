# Plan 002: Resolve session once per request

> **Executor instructions**: Follow step by step. STOP on ambiguity — do not weaken auth. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- backend/main.py backend/dependencies.py backend/auth_db.py`

## Status

- **Status**: DONE (2026-07-15)
- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `90c3a4c`, 2026-07-14

## Why this matters

Middleware already calls `resolve_session` and `set_current_user`. Then every data router `Depends(require_user)` calls `resolve_session` **again**, including `UPDATE sessions SET last_seen` + commit. Post-login parallel fetches double session DB work.

## Current state

- `backend/main.py:32-45` — middleware resolves cookie → `set_current_user(user)`.
- `backend/dependencies.py:33-37` — `require_user` calls `resolve_session(session_id)` again.
- `backend/auth_db.py:152-178` — each resolve SELECTs session + user version, UPDATEs `last_seen`, commits, then `get_user_by_id`.
- Context helpers already exist: `get_current_user_ctx`, `set_current_user`.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Backend tests | `npm run test:backend` | exit 0 |

## Scope

**In scope**: `backend/dependencies.py`, optionally `backend/auth_db.py` (throttle last_seen)
**Out of scope**: Changing cookie format, login/logout UX, frontend

## Steps

### Step 1: Prefer context in require_* 

Change `require_user` / `require_admin` / permission helpers that re-resolve to:

1. `user = get_current_user_ctx()`
2. If None, fall back to `resolve_session(cookie)` once (for paths that skip middleware — should be rare)
3. If still None → 401

Do **not** remove middleware resolution.

**Verify**: Authed GET `/api/properties` still 200 with cookie; without cookie 401.

### Step 2: Throttle last_seen

In `resolve_session`, only UPDATE `last_seen` if older than 5 minutes (SQL `WHERE token=%s AND last_seen < NOW() - interval '5 minutes'` or read-then-conditional update).

**Verify**: Two rapid API calls do not need two successful last_seen updates (optional log/assert in test).

## STOP conditions

- Any route starts accepting unauthenticated access that previously required auth → STOP.
- WebSocket auth path breaks → STOP and fix before merge.

## Done criteria

- Happy-path authenticated HTTP request: at most one full `resolve_session` DB round-trip (middleware).
- `npm run test:backend` exit 0.
