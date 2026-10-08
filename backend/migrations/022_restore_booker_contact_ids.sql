-- ============================================================================
-- 022: Restore requests.booker_contact_id nulled by account saves.
-- upsert_account used to delete + reinsert account_contacts, which fired
-- fk_requests_booker_contact ON DELETE SET NULL. booker_name survived, so
-- re-link by name within the same account (lowest idx wins). Idempotent.
-- ============================================================================

WITH ranked AS (
  SELECT r.id AS req_id,
         c.id AS contact_id,
         row_number() OVER (PARTITION BY r.id ORDER BY c.idx ASC, c.id ASC) AS rn
  FROM requests r
  JOIN account_contacts c
    ON c.account_id = r.account_id
   AND lower(coalesce(nullif(trim(c.name), ''), trim(concat_ws(' ', c.first_name, c.last_name))))
       = lower(trim(r.booker_name))
  WHERE (r.booker_contact_id IS NULL OR r.booker_contact_id = '')
    AND coalesce(trim(r.booker_name), '') <> ''
)
UPDATE requests r
   SET booker_contact_id = ranked.contact_id
  FROM ranked
 WHERE ranked.req_id = r.id AND ranked.rn = 1;
