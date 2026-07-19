# Plan 035: Admin password-reset hardening + migration rotation

> **Executor instructions**: Ponytail — fix empty-update / KeyError paths; revoke sessions on admin-set password; keep bcrypt migration path. Update README + Notion `[035]` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- backend/routers/users.py backend/auth_db.py backend/scripts Settings.tsx`

## Status

- **Status**: DONE (2026-07-18)
- **Priority**: P1
- **Effort**: S–M
- **Risk**: MED
- **Depends on**: none (pairs well after `034`)
- **Category**: security
- **Planned at**: commit `90c3a4c`, 2026-07-16
- **Notion**: `[035] Admin password-reset KeyError + migration password rotation`

## Why this matters

**Plain language:** When an admin sets a user’s password in Settings, the server must never crash, must always save a strong hash, and should log the user out of old sessions so the old password stops working immediately.

**Technical:**
1. `create_or_update_user` (`users.py` ~164–177): if `_normalize_user_patch` yields empty `updates` and password handling fails edge cases, `set_clause` can be empty or `_SQL_COLS[k]` can KeyError on unexpected keys.
2. Admin password set on update may not call `bump_session_version_and_revoke` (unlike `change_password` in `auth_db.py`).
3. Migration scripts / plaintext leftovers: ensure `scripts/migrate_db_passwords.py` (or equivalent) is the documented path and safe to re-run.

## Current state

- Self-service: `POST /api/auth/change-password` → `auth_db.change_password` (revokes sessions).
- Admin: `POST /api/users` create_or_update with `password` field; Settings UI “Set new password”.
- `_row_to_client` assumes `row["id"]` present — None row would blow up.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Backend tests | `npm run test:backend` | exit 0 |
| Manual | Admin sets another user’s password → they must re-login | works |

## Scope

**In scope**: `backend/routers/users.py`, session bump on admin password set, small tests, migration script sanity  
**Out of scope**: Email “forgot password” product; OAuth

## Steps

### Step 1: Harden update SQL builder

- Only keys in `_SQL_COLS`; ignore unknown.
- If no fields and no password → 400 (already on PATCH; mirror on POST update).
- Never emit empty `SET` clause.

### Step 2: Revoke sessions on admin password set

After successful password hash update via admin path, call `bump_session_version_and_revoke(user_id)`.

### Step 3: Migration note + idempotent hash script

Confirm migrate script hashes plaintext only; document in AGENTS.md if missing. Add one test or dry-run guard.

## Checklist

- [x] No KeyError / 500 on admin password-only update
- [x] Empty / invalid patch returns 400 with clear message
- [x] Admin-set password invalidates existing sessions
- [x] Password stored as bcrypt (not plaintext)
- [x] Migration script safe / documented
- [x] Backend tests cover admin password update (`test_admin_password_reset.py` 4/4)
- [x] README + Notion → Done (after human confirm)

## STOP conditions

- Building full forgot-password email flow → STOP (new product).
