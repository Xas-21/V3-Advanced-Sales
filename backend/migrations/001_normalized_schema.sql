-- ============================================================================
-- AS System — Normalized Relational Schema (Phase 2)
-- Author: Full-Stack Lead (Hermes) | 2026-07-12
-- Strategy: ADDITIVE ONLY. Legacy JSON tables (accounts_rows, requests_rows,
-- app_collection_rows, app_collection_maps, app_collections) are NOT dropped.
-- New relational tables are created alongside; data is copied in, verified,
-- and legacy tables retired only after explicit sign-off. ZERO DATA LOSS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Reference / master entities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  TEXT PRIMARY KEY,
    username           TEXT UNIQUE NOT NULL,
    password           TEXT NOT NULL,                 -- bcrypt hash
    name               TEXT,
    email              TEXT,
    role               TEXT NOT NULL DEFAULT 'Sales Executive',
    status             TEXT DEFAULT 'active',
    property_id        TEXT,                          -- FK -> properties.id (SET NULL)
    permission_grants  JSONB DEFAULT '[]'::jsonb,
    permission_revokes JSONB DEFAULT '[]'::jsonb,
    stats              JSONB DEFAULT '{}'::jsonb,
    session_version    INTEGER DEFAULT 0,
    avatar             TEXT,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS properties (
    id                  TEXT PRIMARY KEY,
    name                TEXT,
    city                TEXT,
    country             TEXT,
    email               TEXT,
    phone               TEXT,
    logo_url            TEXT,
    total_rooms         INTEGER,
    account_types       JSONB DEFAULT '[]'::jsonb,
    segments            JSONB DEFAULT '[]'::jsonb,
    occupancy_types     JSONB DEFAULT '[]'::jsonb,
    payment_methods     JSONB DEFAULT '[]'::jsonb,
    event_packages      JSONB DEFAULT '[]'::jsonb,
    form_configurations JSONB DEFAULT '{}'::jsonb,
    alert_settings      JSONB DEFAULT '{}'::jsonb,
    call_settings       JSONB DEFAULT '{}'::jsonb,
    assigned_user_ids   JSONB DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Accounts (was: accounts_rows payload)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
    id                  TEXT PRIMARY KEY,
    name                TEXT,
    type                TEXT,
    city                TEXT,
    street              TEXT,
    country             TEXT,
    website             TEXT,
    notes               TEXT,
    client_tax_id       TEXT,
    account_owner_name  TEXT,
    owner_user_id       TEXT,                          -- FK -> users.id (SET NULL)
    owner_username      TEXT,
    created_by_user_id  TEXT,                          -- FK -> users.id (SET NULL)
    created_by_username TEXT,
    property_id         TEXT,                          -- FK -> properties.id (SET NULL)
    tags                JSONB DEFAULT '[]'::jsonb,
    total_requests      INTEGER,
    win_rate            NUMERIC,
    total_spend         NUMERIC,
    profile_audit_log   JSONB DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_contacts (
    id          TEXT PRIMARY KEY,
    account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    first_name  TEXT,
    last_name   TEXT,
    name        TEXT,
    position    TEXT,
    email       TEXT,
    phone       TEXT,
    city        TEXT,
    country     TEXT
);

CREATE TABLE IF NOT EXISTS account_activities (
    id           TEXT PRIMARY KEY,
    account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    title        TEXT,
    body         TEXT,
    activity_user TEXT,
    at           TIMESTAMPTZ,
    crm_lead_id  TEXT
);

-- ---------------------------------------------------------------------------
-- Requests (was: requests_rows payload)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requests (
    id                  TEXT PRIMARY KEY,
    account_id          TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    account_name        TEXT,
    property_id         TEXT REFERENCES properties(id) ON DELETE SET NULL,
    created_by_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    request_name        TEXT,
    request_type        TEXT,
    segment             TEXT,
    status              TEXT,
    payment_status      TEXT,
    check_in            DATE,
    check_out           DATE,
    event_start         TIMESTAMPTZ,
    event_end           TIMESTAMPTZ,
    nights              INTEGER,
    total_rooms         INTEGER,
    adr                 NUMERIC,
    total_cost          NUMERIC,
    grand_total_no_tax  NUMERIC,
    received_date       DATE,
    offer_deadline      DATE,
    deposit_deadline    DATE,
    payment_deadline    DATE,
    meal_plan           TEXT,
    booker_name         TEXT,
    booker_contact_id   TEXT,
    promotion_id        TEXT,
    confirmation_no      TEXT,
    note                TEXT,
    cancel_reason       TEXT,
    cancel_note         TEXT,
    updated_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at_ts       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_rooms (
    id          TEXT PRIMARY KEY,
    request_id  TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    type        TEXT,
    count       INTEGER,
    nights      INTEGER,
    occupancy   TEXT,
    rate        NUMERIC,
    meal_plan   TEXT,
    arrival     TEXT,
    departure   TEXT
);

CREATE TABLE IF NOT EXISTS request_payments (
    id          TEXT PRIMARY KEY,
    request_id  TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    amount      NUMERIC,
    date        DATE,
    method      TEXT,
    note        TEXT
);

CREATE TABLE IF NOT EXISTS request_agenda (
    id                  TEXT PRIMARY KEY,
    request_id          TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    venue               TEXT,
    shape               TEXT,
    pax                 INTEGER,
    package             TEXT,
    start_date          DATE,
    end_date            DATE,
    start_time          TEXT,
    end_time            TEXT,
    lunch_time          TEXT,
    dinner_time         TEXT,
    coffee1             TEXT,
    coffee2             TEXT,
    rental              NUMERIC,
    notes               TEXT,
    combined            BOOLEAN,
    combined_venue_names TEXT
);

CREATE TABLE IF NOT EXISTS request_logs (
    id          TEXT PRIMARY KEY,
    request_id  TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    date        TIMESTAMPTZ,
    action      TEXT,
    log_user    TEXT,
    details     TEXT
);

CREATE TABLE IF NOT EXISTS request_alerts (
    id          TEXT PRIMARY KEY,
    request_id  TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    title       TEXT,
    message     TEXT,
    created_by  TEXT,
    created_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS request_feedback (
    request_id      TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
    template        TEXT,
    source          TEXT,
    public_token    TEXT,
    answers         JSONB DEFAULT '{}'::jsonb,
    submitted_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS request_transportation (
    id          TEXT PRIMARY KEY,
    request_id  TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    type        TEXT,
    pax         INTEGER,
    timing      TEXT,
    cost_per_way NUMERIC,
    notes       TEXT
);

CREATE TABLE IF NOT EXISTS request_invoices (
    request_id  TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
    agreement   JSONB,
    inv1        JSONB,
    inv2        JSONB,
    inv3        JSONB
);

-- ---------------------------------------------------------------------------
-- Property reference collections (were: app_collection_rows)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
    id          TEXT PRIMARY KEY,
    property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
    name        TEXT,
    count       INTEGER,
    size        TEXT,
    base_rate   NUMERIC,
    capacity    INTEGER
);

CREATE TABLE IF NOT EXISTS venues (
    id          TEXT PRIMARY KEY,
    property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
    name        TEXT,
    is_combined BOOLEAN,
    shapes      JSONB DEFAULT '[]'::jsonb,
    width       NUMERIC,
    length      NUMERIC,
    height      NUMERIC,
    area        NUMERIC,
    capacity    INTEGER
);

CREATE TABLE IF NOT EXISTS taxes (
    id          TEXT PRIMARY KEY,
    property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
    label       TEXT,
    rate        NUMERIC,
    scope       TEXT
);

CREATE TABLE IF NOT EXISTS financials (
    id          TEXT PRIMARY KEY,
    property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
    year        INTEGER,
    months      JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT PRIMARY KEY,
    property_id  TEXT REFERENCES properties(id) ON DELETE SET NULL,
    task         TEXT,
    client       TEXT,
    priority     TEXT,
    completed    BOOLEAN,
    date         DATE,
    star         BOOLEAN,
    category     TEXT,
    description  TEXT,
    assigned_to  TEXT,
    assignees    JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS promotions (
    id                    TEXT PRIMARY KEY,
    property_id           TEXT REFERENCES properties(id) ON DELETE CASCADE,
    name                  TEXT,
    status                TEXT,
    start_date            DATE,
    end_date              DATE,
    terms                 TEXT,
    segments              JSONB DEFAULT '[]'::jsonb,
    linked_accounts       JSONB DEFAULT '[]'::jsonb,
    include_rooms_revenue BOOLEAN,
    include_events_revenue BOOLEAN
);

-- ---------------------------------------------------------------------------
-- Contract templates & cancellation reasons (were: app_collections arrays)
-- Stored as id+payload to guarantee lossless capture; refine later.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract_templates (
    id       TEXT PRIMARY KEY,
    payload  JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS cxl_reasons (
    id       TEXT PRIMARY KEY,
    payload  JSONB NOT NULL
);

-- ---------------------------------------------------------------------------
-- CRM state (was: app_collection_maps crm_state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_state (
    property_id TEXT PRIMARY KEY,
    leads       JSONB DEFAULT '[]'::jsonb,
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Sessions (Phase 1 auth hardening) — signed server-side sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,                     -- cryptographically random token
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip           TEXT,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked      BOOLEAN DEFAULT FALSE
);

-- ---------------------------------------------------------------------------
-- Indexes (preserve JSON query parity + speed up FK joins)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_accounts_property      ON accounts(property_id);
CREATE INDEX IF NOT EXISTS ix_accounts_owner         ON accounts(owner_user_id);
CREATE INDEX IF NOT EXISTS ix_accounts_created_by    ON accounts(created_by_user_id);
CREATE INDEX IF NOT EXISTS ix_requests_account       ON requests(account_id);
CREATE INDEX IF NOT EXISTS ix_requests_property      ON requests(property_id);
CREATE INDEX IF NOT EXISTS ix_requests_created_by    ON requests(created_by_user_id);
CREATE INDEX IF NOT EXISTS ix_requests_status        ON requests(status);
CREATE INDEX IF NOT EXISTS ix_requests_type          ON requests(request_type);
CREATE INDEX IF NOT EXISTS ix_account_contacts_acc   ON account_contacts(account_id);
CREATE INDEX IF NOT EXISTS ix_account_activities_acc ON account_activities(account_id);
CREATE INDEX IF NOT EXISTS ix_request_rooms_req      ON request_rooms(request_id);
CREATE INDEX IF NOT EXISTS ix_request_payments_req  ON request_payments(request_id);
CREATE INDEX IF NOT EXISTS ix_request_agenda_req    ON request_agenda(request_id);
CREATE INDEX IF NOT EXISTS ix_request_logs_req      ON request_logs(request_id);
CREATE INDEX IF NOT EXISTS ix_rooms_property        ON rooms(property_id);
CREATE INDEX IF NOT EXISTS ix_venues_property        ON venues(property_id);
CREATE INDEX IF NOT EXISTS ix_taxes_property         ON taxes(property_id);
CREATE INDEX IF NOT EXISTS ix_financials_property     ON financials(property_id);
CREATE INDEX IF NOT EXISTS ix_tasks_property         ON tasks(property_id);
CREATE INDEX IF NOT EXISTS ix_promotions_property    ON promotions(property_id);
CREATE INDEX IF NOT EXISTS ix_sessions_user          ON sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_sessions_expires       ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS ix_users_username         ON users(username);

-- ---------------------------------------------------------------------------
-- User-ownership foreign keys (added 2026-07-12)
-- DELETE user -> keep their accounts/requests, clear owner link (SET NULL).
-- This is the safety net; app may reassign to fallback admin before delete.
-- ---------------------------------------------------------------------------
ALTER TABLE accounts
  ADD CONSTRAINT accounts_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_owner_user_id_fkey
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE requests
  ADD CONSTRAINT requests_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Relationship foreign keys (added 2026-07-12) — full relational integrity
-- DELETE rules: CASCADE for child/sub-items, SET NULL for owner links.
-- ---------------------------------------------------------------------------
-- Request sub-items -> requests (delete a request, wipe its children)
ALTER TABLE request_rooms         ADD CONSTRAINT fk_request_rooms_req         FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;
ALTER TABLE request_payments      ADD CONSTRAINT fk_request_payments_req      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;
ALTER TABLE request_agenda        ADD CONSTRAINT fk_request_agenda_req        FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;
ALTER TABLE request_alerts        ADD CONSTRAINT fk_request_alerts_req        FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;
ALTER TABLE request_logs          ADD CONSTRAINT fk_request_logs_req          FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;
ALTER TABLE request_feedback      ADD CONSTRAINT fk_request_feedback_req      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;
ALTER TABLE request_invoices      ADD CONSTRAINT fk_request_invoices_req      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;
ALTER TABLE request_transportation ADD CONSTRAINT fk_request_transportation_req FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;
-- Account sub-items -> accounts
ALTER TABLE account_contacts      ADD CONSTRAINT fk_account_contacts_acc      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE account_activities    ADD CONSTRAINT fk_account_activities_acc     FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
-- Property-scoped collections -> properties (delete property wipes its config)
ALTER TABLE rooms                 ADD CONSTRAINT fk_rooms_prop                FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE venues                ADD CONSTRAINT fk_venues_prop               FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE taxes                 ADD CONSTRAINT fk_taxes_prop                FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE promotions            ADD CONSTRAINT fk_promotions_prop            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE financials            ADD CONSTRAINT fk_financials_prop           FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Performance indexes (added 2026-07-12)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_request_alerts_req        ON request_alerts(request_id);
CREATE INDEX IF NOT EXISTS ix_request_transportation_req ON request_transportation(request_id);
CREATE INDEX IF NOT EXISTS ix_accounts_name             ON accounts(name);
CREATE INDEX IF NOT EXISTS ix_requests_check_in         ON requests(check_in);
CREATE INDEX IF NOT EXISTS ix_properties_name          ON properties(name);
