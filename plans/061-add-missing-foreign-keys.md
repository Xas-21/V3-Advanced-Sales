# Plan 061: Add the missing foreign keys (close orphan gaps)

> **Executor instructions**: Follow step by step; verify each step; obey STOP conditions.
> A reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7d43062..HEAD -- backend/migrations`

## Status
- **Priority**: P1
- **Effort**: S–M
- **Risk**: MED (adding a FK aborts if orphan rows exist — must clean/nullify first)
- **Depends on**: 060 (so `crm_pipeline_cards`/`crm_sales_calls` exist and get FKs; and `crm_card_comments` links resolve)
- **Category**: migration / tech-debt
- **Planned at**: commit `7d43062`, 2026-07-22

## Why this matters
Several ID columns are stored as plain TEXT with no `REFERENCES`, so rows can point at
deleted parents (orphans) and the database can't enforce tenancy/integrity. The owner wants
real relational integrity. This adds the missing FKs after nullifying/cleaning any existing
dangling values, using the same `ON DELETE SET NULL` (owner links) / `CASCADE` (child rows)
rules already used in `001_normalized_schema.sql`.

## Current state (no FK today — confirmed in `backend/migrations/001_normalized_schema.sql`)
- `users.property_id` (line 21) — comment says FK but none exists.
- `accounts.property_id` (line 71) — no FK.
- `requests.promotion_id` (line 134), `requests.booker_contact_id` (line 133) — no FK.
- `crm_card_comments` (`backend/migrations/013_crm_card_comments.py:18-29`) — `property_id`, `target_id`, `author_user_id` all plain TEXT.
- `account_activities.crm_lead_id` (line 101) — no FK (points into CRM; leave nullable, see STOP).

## Commands
| Purpose | Command | Expected |
|---|---|---|
| Apply migration | `docker exec -i as-postgres-v3 psql -U neondb_owner -d neondb < backend/migrations/016_add_missing_fks.sql` | no error |
| Count orphans (example) | `docker exec as-postgres-v3 psql -U neondb_owner -d neondb -c "SELECT count(*) FROM users u LEFT JOIN properties p ON u.property_id=p.id WHERE u.property_id IS NOT NULL AND p.id IS NULL;"` | 0 after cleanup |
| Backend tests | `cd backend && python -m pytest tests -v` | pass |

## Scope
**In scope:** Create `backend/migrations/016_add_missing_fks.sql` only.
**Out of scope:** any application code; `account_activities.crm_lead_id` (CRM lead ids are not a stable table PK — leave as TEXT).

## Steps

### Step 1: Nullify dangling values first (so ADD CONSTRAINT won't abort)
In `016_add_missing_fks.sql`, before each `ADD CONSTRAINT`, run an `UPDATE ... SET col = NULL WHERE col IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parent WHERE id = col)`. For `crm_card_comments`, delete comments whose `author_user_id` has no user, and whose `target_id` has no matching request/account (log count via `RAISE NOTICE`).

### Step 2: Add the FKs (idempotent guard)
Wrap each in a `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` block so re-runs are safe:
```sql
ALTER TABLE users    ADD CONSTRAINT fk_users_property    FOREIGN KEY (property_id)  REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE accounts ADD CONSTRAINT fk_accounts_property FOREIGN KEY (property_id)  REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE requests ADD CONSTRAINT fk_requests_promotion FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE SET NULL;
ALTER TABLE requests ADD CONSTRAINT fk_requests_booker_contact FOREIGN KEY (booker_contact_id) REFERENCES account_contacts(id) ON DELETE SET NULL;
ALTER TABLE crm_card_comments ADD CONSTRAINT fk_crm_comments_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ix_users_property ON users(property_id);
CREATE INDEX IF NOT EXISTS ix_accounts_property ON accounts(property_id);
CREATE INDEX IF NOT EXISTS ix_requests_promotion ON requests(promotion_id);
```
`booker_contact_id`: verify it actually stores `account_contacts.id` values; if it stores a free-form contact id that isn't the contacts PK, **STOP** and report (don't add that FK).

### Step 3: Verify no orphans, FK count rose
**Verify**: each orphan count query returns 0; `SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND table_schema='public';` increased by the number added; `pytest` still green.

## Done criteria
- [ ] Migration applies cleanly and is re-runnable (no error on second run)
- [ ] All orphan-count queries return 0
- [ ] `pytest` passes
- [ ] Only `016_add_missing_fks.sql` added (`git status`)

## STOP conditions
- Any `ADD CONSTRAINT` aborts due to remaining orphans after the nullify step (investigate; do not force).
- `booker_contact_id` values are not `account_contacts.id` PKs.
- Deleting orphan `crm_card_comments` would remove >5% of comments (report first).

## Maintenance notes
- Reviewer: confirm the SET NULL rules match product intent (deleting a property should not delete users/accounts — it nulls the link).
- After this, deleting a promotion/contact safely nulls references instead of leaving orphans.
