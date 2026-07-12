-- Reconcile sessions table with auth_db.py expectations.
-- The table created in 001 lacked the columns auth_db.py writes. Add them (additive).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token TEXT UNIQUE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill token from id where missing (id was the opaque token before this migration).
UPDATE sessions SET token = id WHERE token IS NULL;
