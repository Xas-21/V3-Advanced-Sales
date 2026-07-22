-- Plan 062: server-side contract records + tenant-scope column on templates.
-- Safe to re-run (IF NOT EXISTS / IF NOT EXISTS column).

CREATE TABLE IF NOT EXISTS contracts (
    id            TEXT PRIMARY KEY,
    property_id   TEXT REFERENCES properties(id) ON DELETE CASCADE,
    request_id    TEXT REFERENCES requests(id) ON DELETE SET NULL,
    account_id    TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    template_id   TEXT,
    template_name TEXT,
    status        TEXT NOT NULL DEFAULT 'draft',  -- draft|generated|sent|signed|cancelled
    field_values  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_contracts_property ON contracts(property_id);
CREATE INDEX IF NOT EXISTS ix_contracts_request ON contracts(request_id);
CREATE INDEX IF NOT EXISTS ix_contracts_status ON contracts(status);
-- Tenant-scope templates by column too:
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS property_id TEXT REFERENCES properties(id) ON DELETE CASCADE;
