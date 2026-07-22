# Plan 060: Normalize CRM pipeline out of the per-hotel JSON blob into relational tables

> **Executor instructions**: Follow step by step. Run every verification command and confirm
> the expected result before the next step. If a "STOP condition" occurs, stop and report —
> do not improvise. A reviewer maintains `plans/README.md`; do not edit the index.
>
> **Drift check (run first)**: `git diff --stat 7d43062..HEAD -- backend/data_access.py backend/routers/crm_state.py backend/migrations`
> If any in-scope file changed since this plan was written, compare the "Current state"
> excerpts to the live code; on a mismatch, STOP.

## Status
- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (CRM is business-critical; migration must be zero-loss)
- **Depends on**: none (do this before 061 so the new tables get FKs there, or add FKs inline here)
- **Category**: migration / tech-debt
- **Planned at**: commit `7d43062`, 2026-07-22

## Why this matters
Today the entire CRM pipeline for a hotel (all sales calls + all kanban cards + account
activities) is stored as **one JSONB document** in `crm_state.leads` / `crm_state.payload`,
one row per property. That is the real "JSON blob as database" anti-pattern: no per-card
foreign keys, no integrity, last-write-wins on the whole blob under concurrent edits, and
orphan IDs inside JSON. The owner wants CRM data relational with FKs and **zero data loss**.
CRM cards/sales-calls are open-ended objects (clients spread arbitrary fields), so each becomes
a real **row with typed/queryable columns + FKs + a small per-row `payload` for the long tail**
— the same hybrid already used by `request_rooms`, `account_contacts`, etc. This removes the
mega-blob while guaranteeing no field is dropped.

## Current state
- `backend/migrations/001_normalized_schema.sql:333-337` — `crm_state (property_id PK, leads JSONB, updated_at)`; a later migration also added a `payload JSONB` column (runtime reads/writes both).
- `backend/data_access.py:518-562` — `get_crm_state()` / `upsert_crm_state()` read/write the whole block as JSON. `get_crm_state` picks the richer of `leads`/`payload` via `_crm_block_score`.
- `backend/routers/crm_state.py:67-152` — the API already normalizes to a **stable output shape** and MUST keep returning it unchanged:
  ```python
  # GET /api/crm-state returns:
  {"propertyId", "salesCalls": [...], "pipeline": {waiting/qualified/proposal/negotiation/won/notInterested: [...]},
   "accountActivities": {...}, "leads": {"new": salesCalls, **pipeline}}
  # POST /api/crm-state accepts {propertyId, salesCalls, pipeline, accountActivities} and 409s on empty-over-existing.
  ```
- `backend/crm_recovery.py:8-19` and `crmStateModel.ts:337-345` — **two different** request-status→stage maps (BUG: `accepted` → `proposal` in one, the recovery uses `accepted`→`proposal` too but frontend request-kanban `CRM.tsx` uses `accepted`→`qualified`). Unify as part of this plan.
- Card fields seen in `crmStateModel.ts` (open-ended): `id, accountId, periodMonth, company, contact, propertyId, sourceCallIds[], linkedRequestId, linkedRequestType, linkedRequestRevenue, value, probability, lastContact, enteredFunnelAt, stage, subject, description, callLogs[], nextStep, position, email, phone, city, country, tags[], accountManager, ownerUserId, createdByUserId, callLoggedAt, linkedTemplateName, ...`.

Repo conventions: migrations are plain files under `backend/migrations/` (`.sql` for DDL, `.py` for data). Parameterized psycopg only. Child tables follow the "typed columns + `payload jsonb` + `idx`" pattern — see `data_access.py:997-1033` (`_insert_child`) and `_load_request_children_maps` (`data_access.py:723-780`) as the exemplar to match.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck FE | `npx tsc --noEmit` | exit 0 |
| Backend tests | `cd backend && python -m pytest tests -v` | all pass (+ new) |
| Apply a SQL migration (local) | `docker exec -i as-postgres-v3 psql -U neondb_owner -d neondb < backend/migrations/014_crm_normalize.sql` | no error |
| Run data migration | `docker compose exec as-backend python migrations/015_crm_blob_to_rows.py` | prints counts |

## Scope
**In scope:**
- Create: `backend/migrations/014_crm_normalize.sql` (DDL: `crm_sales_calls`, `crm_pipeline_cards` + FKs + indexes; keep `crm_state` table as-is for now — do NOT drop)
- Create: `backend/migrations/015_crm_blob_to_rows.py` (zero-loss blob → rows; idempotent; also copies rows back to `crm_state` blob on write via the DAL, see Step 4)
- Modify: `backend/data_access.py` — `get_crm_state`, `upsert_crm_state` to read/write the new tables and assemble the exact same block dict
- Create: `backend/tests/test_crm_normalized_roundtrip.py`
- Modify: `backend/crm_recovery.py` + `crmStateModel.ts` — unify the one stage map (see Step 5)

**Out of scope (do NOT touch):**
- `backend/routers/crm_state.py` output shape — must stay byte-compatible.
- Frontend CRM UI logic beyond the single stage-map constant in `crmStateModel.ts`.
- Dropping the legacy `crm_state` table — keep it as a rollback copy this plan.

## Git workflow
- Branch: the reviewer created a feature branch; commit onto it. Do NOT push/PR.
- Conventional commits, e.g. `feat(crm): normalize pipeline into relational tables`.

## Steps

### Step 1: DDL for the two new tables (zero-loss hybrid)
Create `backend/migrations/014_crm_normalize.sql`:
```sql
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
```
Note: `linked_request_id` FK is `ON DELETE SET NULL` (a deleted request must not delete the card — matches `clearPipelineLinkForDeletedRequest`). `account_id` FK is `SET NULL` because some cards are property-only.

**Verify**: apply file, then `docker exec as-postgres-v3 psql -U neondb_owner -d neondb -c "\d crm_pipeline_cards"` → shows the table with FKs.

### Step 2: Zero-loss data migration (blob → rows), idempotent
Create `backend/migrations/015_crm_blob_to_rows.py`. For every `crm_state` row: parse the block via the SAME normalization the router uses (`salesCalls`, `pipeline{stage:[cards]}`), then upsert each sales call into `crm_sales_calls` and each card into `crm_pipeline_cards`, preserving the FULL object in `payload`. Extract typed columns best-effort; **the row's `payload` keeps the entire original object so nothing is lost**. `account_id`/`linked_request_id` must be nullified if they don't exist in `accounts`/`requests` (log skipped FK into `migration_orphans`). Use `ON CONFLICT (id) DO UPDATE`. Guard: never delete `crm_state` rows.

**Verify**: run it; assert `SELECT count(*) FROM crm_pipeline_cards` + `crm_sales_calls` ≈ total cards+calls counted from the blobs (print both; must match minus logged orphans). Add a self-check `assert` at the bottom that round-trips one synthetic block.

### Step 3: Rewrite `get_crm_state` to read from rows, assemble identical block
In `data_access.py`, change `get_crm_state(property_id)` to: tenant-check as today; query `crm_sales_calls` + `crm_pipeline_cards` for that `property_id`; rebuild `{"salesCalls": [payload...], "pipeline": {stage: [payload... ordered by idx]}, "accountActivities": {...}}`. Each row's returned object = its `payload` (so the exact original shape is preserved). Keep `accountActivities` in the `crm_state` blob for now (out of scope to normalize; read it from the existing row).

**Verify**: `pytest tests/test_crm_normalized_roundtrip.py` (Step 6) passes; manual `GET /api/crm-state?propertyId=<id>` returns the same keys/shape as before.

### Step 4: Rewrite `upsert_crm_state` to write rows (transactional replace per property)
`upsert_crm_state(property_id, block)`: in ONE transaction, `_assert_write_access(pid)`, then for that property `DELETE FROM crm_pipeline_cards WHERE property_id=%s` + `DELETE FROM crm_sales_calls WHERE property_id=%s`, re-insert each card/call with `idx` = array index and `payload` = full object, typed columns extracted. Continue to also write the `accountActivities` (+ a mirror of the block) into the legacy `crm_state` row so rollback stays possible this plan. Keep the existing `_broadcast_change("updated","crm_state",...)`.

**Verify**: save then re-GET returns identical data; `pytest` roundtrip passes; existing `test_api_full.py` CRM roundtrip still passes.

### Step 5: Unify the request-status → pipeline-stage map
Make `backend/crm_recovery.py:STAGE_FROM_REQUEST` and `crmStateModel.ts:requestStatusToAccountPipelineStage` agree. Canonical map (confirm with owner default): `inquiry→waiting, draft→waiting, accepted→proposal, tentative→negotiation, definite→won, actual→won, cancelled→notInterested, lost→notInterested`, unknown→`qualified`. If `CRM.tsx` maps `accepted→qualified` for the request-kanban view, align it to `proposal` too. Add a shared TS constant exported from `crmStateModel.ts` and a Python constant already central in `crm_recovery.py`.

**Verify**: `npx tsc --noEmit` exit 0; add a tiny assert test in `test_crm_normalized_roundtrip.py` for the Python map.

### Step 6: Tests
Create `backend/tests/test_crm_normalized_roundtrip.py` (model after `backend/tests/test_account_ledger.py` for DB fixture usage): (a) save a block with 2 sales calls (one with an unusual extra field) + 3 cards across stages, re-read, assert the extra field survives (zero-loss) and stage buckets match; (b) empty-over-existing still 409 at the router; (c) stage-map parity assert.

**Verify**: `cd backend && python -m pytest tests/test_crm_normalized_roundtrip.py -v` all pass.

## Done criteria
- [ ] `npx tsc --noEmit` exits 0
- [ ] `cd backend && python -m pytest tests -v` all pass incl. new file
- [ ] `GET /api/crm-state` response shape unchanged (spot-check keys)
- [ ] `crm_pipeline_cards`/`crm_sales_calls` populated; blob `crm_state` still present (rollback)
- [ ] No file outside the in-scope list modified (`git status`)

## STOP conditions
- Migration row counts don't reconcile with blob card/call counts (beyond logged orphans).
- The API response shape would change in any key the frontend reads.
- A card/sales-call field would be dropped (verify `payload` retains the full object).
- `crm_state.py` or CRM UI needs changes beyond the single stage-map constant.

## Maintenance notes
- Reviewer: verify zero-loss by diffing one property's old blob JSON vs reassembled block.
- Once stable in production for a release, a follow-up plan can stop writing the legacy `crm_state` blob and drop that column.
- `accountActivities` normalization is deliberately deferred (still in the blob) — note for a future plan.
