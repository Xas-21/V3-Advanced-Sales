# Plan 062: Persist contracts server-side + tenant-scope templates + real PDF + signed KPI

> **Executor instructions**: Follow step by step; verify each step; obey STOP conditions.
> A reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7d43062..HEAD -- contractsStore.ts Contracts.tsx backend/routers/contracts.py backend/data_access.py AS.tsx`

## Status
- **Priority**: P1
- **Effort**: L
- **Risk**: MED (must migrate existing localStorage records without losing history)
- **Depends on**: 063 (template writes become admin-only) — coordinate; do 063 first
- **Category**: bug / feature / data-integrity
- **Planned at**: commit `7d43062`, 2026-07-22

## Why this matters
Generated/signed **contract records** are stored only in the browser (`localStorage` key
`visatour_contract_records_v1`), so history is lost on a new device or for a second user, and
the dashboard "signed contracts" KPI is hardcoded to `0`. Contract **templates** are stored
payload-only and are not tenant-scoped. The "PDF" export is raw text, not a rendered document.
Owner wants contracts working for production.

## Current state (verified)
- `contractsStore.ts:51-52` — `RECORD_KEY='visatour_contract_records_v1'`; `:438-440` writes records to localStorage; `:377-405` "PDF" via `mammoth.extractRawText`+`jspdf.text`.
- `backend/routers/contracts.py` — only `/templates` GET/POST/DELETE (payload-only). No contract-record routes.
- `AS.tsx:2283-2284` — dashboard `signed: '0'` hardcoded.
- Templates stored via `upsert_payload_only("contract_templates")` (`data_access.py:491-497`), id-keyed, not property-scoped by column.

## Scope
**In scope:** new migration `backend/migrations/018_contracts.sql`; new `backend/routers/contract_records.py` (+ register in `backend/main.py` with `_auth_required`); `backend/data_access.py` helpers; `contractsStore.ts` (read/write API + one-time localStorage migration); `Contracts.tsx` (list from API); `AS.tsx` (signed KPI from API); tests.
**Out of scope:** template *editor* UI; changing the DOCX generation (`docxtemplater`) — only the PDF fallback and record persistence.

## Steps

### Step 1: `contracts` table (server-side records)
`backend/migrations/018_contracts.sql`:
```sql
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
```
`field_values` is legitimately variable per template → JSONB is appropriate here (a document field-map, not a blob-as-database).

### Step 2: Data-access + routes for contract records
Add `list_contracts(property_id)`, `upsert_contract(data)`, `delete_contract(id)` in `data_access.py` following the `requests` pattern (typed columns + tenant scope via `_assert_write_access` and `_filter_by_tenant`). Create `backend/routers/contract_records.py` with `GET/POST/DELETE /api/contracts` (tenant-scoped), register in `main.py` under `_auth_required`.
**Verify**: create a record via POST, list returns it scoped; `pytest` new test passes.

### Step 3: Frontend — read/write records via API + one-time migration
In `contractsStore.ts`, replace localStorage record read/write with `apiUrl('/api/contracts')` calls. On first load, if the localStorage key exists and the server has none for that property, POST them up, then mark migrated (keep a `..._migrated_v1` flag; do not delete localStorage yet — safety). `Contracts.tsx` lists from the API.
**Verify**: `npx tsc --noEmit` exit 0; records survive a hard refresh and appear in a second browser.

### Step 4: Dashboard signed KPI from API
`AS.tsx:2283-2284` — compute `signed` from contracts where `status='signed'` for the active property instead of `'0'`.
**Verify**: KPI reflects seeded signed contracts.

### Step 5: Honest PDF export
In `contractsStore.ts:377-405`, either (a) render the DOCX→PDF properly, or (b) if that's out of reach, rename the action to "Download Word" and remove the misleading "PDF" label so users aren't given a broken file. Pick (b) if `mammoth`+`jspdf` can't preserve layout. Document the choice in a code comment.
**Verify**: exporting produces a valid file; no raw-text-masquerading-as-PDF.

### Step 6: Tests
`backend/tests/test_contracts.py`: create/list/delete tenant scope + status filter. Model after `test_account_ledger.py`.
**Verify**: `cd backend && python -m pytest tests -v` pass.

## Done criteria
- [ ] Contract records persist server-side and survive refresh/other device
- [ ] Templates carry `property_id`; cross-tenant templates not listed
- [ ] Dashboard signed count reflects DB
- [ ] PDF action produces a valid file or is relabeled honestly
- [ ] `npx tsc --noEmit` exit 0; `pytest` pass; only in-scope files changed

## STOP conditions
- localStorage → server migration would create duplicates on re-run (must be idempotent by record id).
- DOCX→PDF rendering can't be done reliably in-browser (then take option 5b, don't ship a broken PDF).

## Maintenance notes
- Reviewer: verify the one-time localStorage migration cannot double-post; keep localStorage as fallback for one release.
- `field_values` JSONB is intentional (variable template fields) — not a normalization target.
