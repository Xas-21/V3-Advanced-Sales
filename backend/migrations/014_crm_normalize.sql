-- Plan 060: CRM pipeline relational tables (typed cols + payload jsonb).
-- Keeps legacy crm_state as rollback copy — do NOT drop it.

CREATE TABLE IF NOT EXISTS crm_sales_calls (
    id            TEXT PRIMARY KEY,
    property_id   TEXT REFERENCES properties(id) ON DELETE CASCADE,
    account_id    TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    subject       TEXT,
    description   TEXT,
    due_date      DATE,
    last_contact  DATE,
    owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    activity_completed BOOLEAN DEFAULT FALSE,
    follow_up_required BOOLEAN DEFAULT FALSE,
    follow_up_date DATE,
    idx           INTEGER DEFAULT 0,
    payload       JSONB NOT NULL,          -- open-ended long tail (zero-loss)
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_pipeline_cards (
    id            TEXT PRIMARY KEY,
    property_id   TEXT REFERENCES properties(id) ON DELETE CASCADE,
    account_id    TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    stage         TEXT NOT NULL,           -- waiting|qualified|proposal|negotiation|won|notInterested
    period_month  TEXT,                    -- YYYY-MM
    linked_request_id TEXT REFERENCES requests(id) ON DELETE SET NULL,
    value         NUMERIC,
    probability   NUMERIC,
    last_contact  DATE,
    entered_funnel_at DATE,
    idx           INTEGER DEFAULT 0,
    payload       JSONB NOT NULL,          -- open-ended long tail (zero-loss)
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_crm_sales_calls_prop ON crm_sales_calls(property_id);
CREATE INDEX IF NOT EXISTS ix_crm_sales_calls_acc ON crm_sales_calls(account_id);
CREATE INDEX IF NOT EXISTS ix_crm_pipeline_cards_prop_stage ON crm_pipeline_cards(property_id, stage);
CREATE INDEX IF NOT EXISTS ix_crm_pipeline_cards_acc ON crm_pipeline_cards(account_id);
CREATE INDEX IF NOT EXISTS ix_crm_pipeline_cards_linked_req ON crm_pipeline_cards(linked_request_id);
