-- Plan 063: ownership metadata for local uploads (additive; legacy files grandfathered).
-- Safe to re-run (IF NOT EXISTS). Reviewer/deploy runner applies this — do not auto-apply.

CREATE TABLE IF NOT EXISTS upload_files (
    public_id            TEXT PRIMARY KEY,
    uploaded_by_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    property_id          TEXT,
    folder               TEXT,
    created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upload_files_uploader
    ON upload_files (uploaded_by_user_id);

CREATE INDEX IF NOT EXISTS idx_upload_files_property
    ON upload_files (property_id);
