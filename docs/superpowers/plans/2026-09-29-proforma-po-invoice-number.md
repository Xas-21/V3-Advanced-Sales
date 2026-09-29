# Proforma PO and invoice number Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First OPTS Proforma click asks for PO or skip, mints a unique-per-property invoice number, and downloads; later clicks open a page to download, re-issue, or edit PO without minting a new number.

**Architecture:** Requests have no document payload column. Store a `proforma` JSONB column on `requests` (not a new table). Mint and re-issue only update that column so rooms, agenda, and totals are never rewritten. A small TS module owns number shape, fingerprint, and “figures unchanged”. PDF builder/renderer gain invoice number and optional PO.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, Vitest, FastAPI, Postgres JSONB, pytest, existing jspdf.

## Global Constraints

- Invoice number is one `A–Z` letter plus seven digits. Unique per property. Other properties may reuse it. Never replaced on re-issue.
- First issue: PO modal (Continue or Skip). Close without those actions downloads nothing.
- Later clicks: Download (frozen `issuedOn`), Re-issue (always on; date becomes today; note if fingerprint matches), Edit PO (save only; add/change/clear).
- PDF: Invoice No under Date. PO under To only when non-empty. No empty PO row.
- Do not change on-screen request totals, tax rows, bill-to (account only), filename, event packages, Rate Structure, or account rates.
- No new npm package. No new table. Do not leave a half-written number if mint fails.
- PO edit must not call `upsert_request` with a partial body (that deletes and reinserts children).

---

### Task 1: Pure issue helpers and PDF model

**Files:**
- Create: `proformaIssue.ts`
- Create: `proformaIssue.test.ts`
- Modify: `proformaInvoice.ts`
- Modify: `proformaInvoice.test.ts`
- Modify: `proformaPdf.ts`

**Interfaces:**
- Produces: `ProformaIssue`, `INVOICE_NUMBER_RE`, `isInvoiceNumber(s)`, `mintInvoiceNumber(taken: Set<string>)`, `proformaFingerprint(model)`, `figuresUnchanged(stored, current)`, `normalizeProforma(raw)`, `buildProformaInvoice` fields `invoiceNumber` and `poNumber`

- [x] Number helper + fingerprint tests, then implementation.
- [x] `buildProformaInvoice` copies `invoiceNumber` and trimmed `poNumber` from input. Empty PO is `''`.
- [x] PDF prints Invoice No under Date. To block appends PO Number only when `poNumber` is non-empty.

### Task 2: Persist proforma on the request (column + issue API)

**Files:**
- Create: `backend/migrations/021_request_proforma.sql`
- Create: `backend/tests/test_request_proforma.py`
- Modify: `backend/data_access.py` (`_request_dict_from_row`, `issue_request_proforma`, `patch_request_proforma_po`, `reissue_request_proforma`)
- Modify: `backend/routers/reqs.py`
- Modify: `backend/main.py` only if a new router is added (prefer `reqs.py`)

**Endpoints:**
- `POST /api/requests/{req_id}/proforma/issue` body `{ poNumber?, fingerprint, issuedOn }`
- `POST /api/requests/{req_id}/proforma/reissue` body `{ fingerprint, issuedOn }`
- `POST /api/requests/{req_id}/proforma/po` body `{ poNumber }`

**SQL:** `ALTER TABLE requests ADD COLUMN IF NOT EXISTS proforma JSONB;` unique index on `(property_id, (proforma->>'invoiceNumber'))` where number is non-empty.

- [x] Migration + pytest: first issue mints, second issue same request returns same number, second request on same property cannot reuse, foreign property 403, PO patch does not change number or date.

### Task 3: OPTS modals

**Files:**
- Create: `ProformaIssueModal.tsx` (first-issue PO + later actions; theme colors from parent)
- Modify: `RequestsManager.tsx` OPTS Proforma handler only

- [x] First click: PO field, Continue, Skip, backdrop close = cancel.
- [x] Later click: show number, PO or none, issuedOn, issuedBy, fingerprint note, Download / Re-issue / Edit PO.
- [x] Merge returned `proforma` into that request in list state. On API failure: alert, no download.
- [x] Do not change other OPTS items.

### Task 4: Review

- [x] Vitest: `proformaIssue`, `proformaInvoice`, `proformaPdf`.
- [x] Pytest: `test_request_proforma.py`.
- [x] Confirm `upsert_request` child delete path is not used for PO edit.

---
