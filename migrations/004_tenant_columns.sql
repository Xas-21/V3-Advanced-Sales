-- Additive: multi-property assignment + last-sync marker for JSON->normalized sync.
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_property_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Track sync progress so analytics reads from normalized tables that mirror legacy rows.
CREATE TABLE IF NOT EXISTS sync_markers (
    source TEXT PRIMARY KEY,
    last_requests_at TIMESTAMPTZ,
    last_accounts_at TIMESTAMPTZ
);
