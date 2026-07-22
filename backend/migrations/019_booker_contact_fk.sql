-- ============================================================================
-- 019: Backfill requests.booker_contact_id to real account_contacts.id,
--      null remaining unresolved pointers, then add FK + index.
-- Idempotent: safe to re-run (duplicate_object / IF NOT EXISTS).
-- ABSOLUTE: never writes requests.booker_name — only booker_contact_id.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Step 1: Backfill unique + ambiguous name matches (same account, lowest idx)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Step 2: Null only pointers that still don't resolve (keep booker_name)
-- ---------------------------------------------------------------------------

UPDATE requests r
   SET booker_contact_id = NULL
 WHERE r.booker_contact_id IS NOT NULL AND r.booker_contact_id <> ''
   AND NOT EXISTS (SELECT 1 FROM account_contacts x WHERE x.id = r.booker_contact_id);

-- ---------------------------------------------------------------------------
-- Step 3: Guard — abort if any non-null booker_contact_id is still invalid
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  invalid_cnt integer;
BEGIN
  SELECT count(*) INTO invalid_cnt
  FROM requests r
  WHERE r.booker_contact_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM account_contacts c WHERE c.id = r.booker_contact_id);

  IF invalid_cnt > 0 THEN
    RAISE EXCEPTION
      'STOP: % non-null booker_contact_id values still do not reference account_contacts — refusing ADD CONSTRAINT',
      invalid_cnt;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 4: Add FK (idempotent) + index
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE requests
    ADD CONSTRAINT fk_requests_booker_contact
    FOREIGN KEY (booker_contact_id) REFERENCES account_contacts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS ix_requests_booker_contact ON requests(booker_contact_id);
