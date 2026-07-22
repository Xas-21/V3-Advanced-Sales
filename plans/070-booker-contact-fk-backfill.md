# Plan 070: Backfill booker_contact_id to real contacts (name-preserving) + add the FK

> **Executor instructions**: Follow step by step; verify; obey STOP conditions. A reviewer
> maintains `plans/README.md`. Migration-only. NEVER drop or null `booker_name`.
>
> **Drift check (run first)**: `git diff --stat 7d43062..HEAD -- backend/migrations`

## Status
- **Priority**: P2
- **Effort**: S–M
- **Risk**: MED (data backfill — must preserve every booker name; only the id pointer is touched)
- **Depends on**: 061 (FK conventions) — independent otherwise
- **Category**: migration / data-integrity
- **Planned at**: commit `7d43062`, 2026-07-22

## Why this matters
`requests.booker_contact_id` holds a legacy import placeholder (`contact-1`) for all 211 bookers,
matching **0** real `account_contacts.id`, so plan 061 correctly could not add the FK. We can recover
the real link by matching the request's `booker_name` to a contact of the same name within the same
account, WITHOUT removing any booker (the `booker_name` column is never touched). New bookings already
store the real contact id (the frontend writes `account_contacts.id`), so once existing rows are
repaired the FK is safe to add and won't break new saves.

## Current state (verified against the live V3 DB)
- 211 requests have both `booker_contact_id` and `booker_name`; all `booker_contact_id = 'contact-1'` (0 match `account_contacts.id`).
- Matching `lower(trim(booker_name))` to `account_contacts.name` within the same `account_id`:
  - **182** rows → exactly one matching contact (safe backfill).
  - **14** rows → multiple same-named contacts (pick lowest `idx` deterministically).
  - **15** rows → no matching contact (set `booker_contact_id = NULL`, keep `booker_name`).
- `account_contacts.id` is the scoped PK (e.g. `A1778101805651:contact:0`); `payload->>'id'` equals that id.
- Frontend writes `bookerContactId` = the contact's `_id` (= `account_contacts.id`) on selection (`RequestsManager.tsx` booker selects), so new/edited requests already satisfy the FK.

## Commands
| Purpose | Command | Expected |
|---|---|---|
| Apply migration | `Get-Content backend/migrations/019_booker_contact_fk.sql \| docker exec -i as-postgres-v3 psql -U neondb_owner -d neondb` | no error |
| Booker names preserved | `docker exec as-postgres-v3 psql -U neondb_owner -d neondb -c "SELECT count(booker_name) FROM requests;"` | unchanged (211) |
| No invalid ids remain | see Step 3 verify | 0 |

## Scope
**In scope:** create `backend/migrations/019_booker_contact_fk.sql` only.
**Out of scope:** any app/frontend code (frontend already writes real ids); `booker_name` (never modify).

## Steps

### Step 1: Backfill unique + ambiguous matches (name-within-account)
In `019_booker_contact_fk.sql`, first repair the pointer where a same-account, same-name contact exists.
Use the lowest-`idx` contact when several share the name (deterministic, still the correct person by name):
```sql
WITH ranked AS (
  SELECT r.id AS req_id,
         c.id AS contact_id,
         row_number() OVER (PARTITION BY r.id ORDER BY c.idx ASC, c.id ASC) AS rn
  FROM requests r
  JOIN account_contacts c
    ON c.account_id = r.account_id
   AND lower(trim(c.name)) = lower(trim(r.booker_name))
  WHERE r.booker_contact_id IS NOT NULL AND r.booker_contact_id <> ''
    AND NOT EXISTS (SELECT 1 FROM account_contacts x WHERE x.id = r.booker_contact_id)
)
UPDATE requests r
   SET booker_contact_id = ranked.contact_id
  FROM ranked
 WHERE ranked.req_id = r.id AND ranked.rn = 1;
```
(`booker_name` is untouched.)

### Step 2: Null only the genuinely unmatched pointers (keep the name)
```sql
UPDATE requests r
   SET booker_contact_id = NULL
 WHERE r.booker_contact_id IS NOT NULL AND r.booker_contact_id <> ''
   AND NOT EXISTS (SELECT 1 FROM account_contacts x WHERE x.id = r.booker_contact_id);
```
This clears only pointers that still don't resolve (the ~15 no-match rows). `booker_name` stays.

### Step 3: Add the FK (guarded/idempotent) + index
```sql
DO $$ BEGIN
  ALTER TABLE requests
    ADD CONSTRAINT fk_requests_booker_contact
    FOREIGN KEY (booker_contact_id) REFERENCES account_contacts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS ix_requests_booker_contact ON requests(booker_contact_id);
```
**Verify** (must all hold before/after):
- `SELECT count(*) FROM requests WHERE booker_contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM account_contacts c WHERE c.id = requests.booker_contact_id);` → **0**
- `SELECT count(booker_name) FROM requests;` → **unchanged (211 with a name)** — no booker name lost.
- Roughly ~196 rows have a non-null `booker_contact_id` after backfill; ~15 are NULL (report actual).
- Re-running the whole file is a clean no-op (idempotent).

## Done criteria
- [ ] Migration applies cleanly and is re-runnable (no error on 2nd run)
- [ ] 0 requests with a non-null `booker_contact_id` that doesn't reference a real contact
- [ ] `booker_name` populated count unchanged (no booker removed)
- [ ] FK `fk_requests_booker_contact` exists (ON DELETE SET NULL)
- [ ] Only `019_booker_contact_fk.sql` added (`git status`)

## STOP conditions
- After Step 1+2, any non-null `booker_contact_id` still fails to reference a contact (ADD CONSTRAINT would abort) — investigate; do NOT force.
- The backfill would change `booker_name` on any row (it must never be written).
- More than ~30 rows would be nulled in Step 2 (expected ~15) — report before proceeding, the name-match may be off.

## Maintenance notes
- Reviewer: confirm `booker_name` is never in an UPDATE SET; only `booker_contact_id` is repaired/nulled.
- This is the follow-up 061 deferred. The runner (plan 064) will apply `019_*.sql` automatically on deploy; on the already-migrated dev DB it re-runs as a no-op.
- ON DELETE SET NULL means deleting a contact clears the booker pointer but keeps the booker name — matches the "never remove the booker" requirement.
