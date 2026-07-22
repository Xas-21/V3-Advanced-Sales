-- ============================================================================
-- 016: Add missing foreign keys (after cleaning orphans)
-- Idempotent: safe to re-run (duplicate_object / IF NOT EXISTS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Step 1: Nullify / delete dangling values so ADD CONSTRAINT won't abort
-- ---------------------------------------------------------------------------

UPDATE users u
SET property_id = NULL
WHERE u.property_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM properties p WHERE p.id = u.property_id);

UPDATE accounts a
SET property_id = NULL
WHERE a.property_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM properties p WHERE p.id = a.property_id);

UPDATE requests r
SET promotion_id = NULL
WHERE r.promotion_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM promotions p WHERE p.id = r.promotion_id);

-- booker_contact_id: STOP — values are NOT account_contacts.id PKs
-- (local DB: 211 non-null, 0 matching account_contacts.id; e.g. contact-1, C178...).
-- Do not nullify or add FK here until the column stores real contact PKs.
-- UPDATE requests SET booker_contact_id = NULL ... intentionally omitted.

DO $$
DECLARE
  orphan_author_cnt integer;
  orphan_target_cnt integer;
  total_cnt integer;
BEGIN
  SELECT count(*) INTO total_cnt FROM crm_card_comments;

  SELECT count(*) INTO orphan_author_cnt
  FROM crm_card_comments c
  WHERE c.author_user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.author_user_id);

  SELECT count(*) INTO orphan_target_cnt
  FROM crm_card_comments c
  WHERE c.target_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.id = c.target_id)
    AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = c.target_id);

  RAISE NOTICE 'crm_card_comments: total=%, orphan_author=%, orphan_target=%',
    total_cnt, orphan_author_cnt, orphan_target_cnt;

  -- STOP if delete would remove >5% of comments (when any comments exist)
  IF total_cnt > 0 AND (orphan_author_cnt + orphan_target_cnt)::float / total_cnt > 0.05 THEN
    RAISE EXCEPTION
      'STOP: orphan crm_card_comments delete would remove >5%% (orphan_author=% orphan_target=% total=%)',
      orphan_author_cnt, orphan_target_cnt, total_cnt;
  END IF;

  DELETE FROM crm_card_comments c
  WHERE (
      c.author_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.author_user_id)
    )
     OR (
      c.target_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.id = c.target_id)
      AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = c.target_id)
    );

  GET DIAGNOSTICS orphan_author_cnt = ROW_COUNT;
  RAISE NOTICE 'crm_card_comments: deleted orphan rows=%', orphan_author_cnt;
END $$;

-- ---------------------------------------------------------------------------
-- Step 2: Add FKs (idempotent via duplicate_object)
-- Skip adding a second FK when the column already references the parent
-- under a differently named constraint (live DB drift vs 001).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'users'
      AND kcu.column_name = 'property_id'
      AND ccu.table_name = 'properties'
  ) THEN
    RAISE NOTICE 'SKIP fk_users_property: users.property_id already has FK to properties';
  ELSE
    BEGIN
      ALTER TABLE users
        ADD CONSTRAINT fk_users_property
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'accounts'
      AND kcu.column_name = 'property_id'
      AND ccu.table_name = 'properties'
  ) THEN
    RAISE NOTICE 'SKIP fk_accounts_property: accounts.property_id already has FK to properties (reviewer: live is ON DELETE CASCADE; plan wanted SET NULL)';
  ELSE
    BEGIN
      ALTER TABLE accounts
        ADD CONSTRAINT fk_accounts_property
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE requests
    ADD CONSTRAINT fk_requests_promotion
    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- STOP: fk_requests_booker_contact NOT added — booker_contact_id is not account_contacts.id
-- DO $$ BEGIN
--   ALTER TABLE requests
--     ADD CONSTRAINT fk_requests_booker_contact
--     FOREIGN KEY (booker_contact_id) REFERENCES account_contacts(id) ON DELETE SET NULL;
-- EXCEPTION
--   WHEN duplicate_object THEN NULL;
-- END $$;

DO $$
BEGIN
  ALTER TABLE crm_card_comments
    ADD CONSTRAINT fk_crm_comments_author
    FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS ix_users_property ON users(property_id);
CREATE INDEX IF NOT EXISTS ix_accounts_property ON accounts(property_id);
CREATE INDEX IF NOT EXISTS ix_requests_promotion ON requests(promotion_id);
