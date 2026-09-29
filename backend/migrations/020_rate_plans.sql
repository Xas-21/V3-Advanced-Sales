-- Property rate plans (Rate Structure). Periods and price lines live in payload.
CREATE TABLE IF NOT EXISTS rate_plans (
    id          TEXT PRIMARY KEY,
    property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
    code        TEXT,
    name        TEXT,
    payload     JSONB,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_plans_property ON rate_plans (property_id);
