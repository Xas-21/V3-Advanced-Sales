# Plan 042: Harden backend input boundaries and file uploads

> **Executor instructions**: Follow step by step. Run every verification command and confirm the expected result before moving on. Honor "STOP conditions". Update this plan's status row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- backend/routers/uploads.py backend/routers/accounts.py backend/routers/reqs.py`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (tightening schemas may reject payloads the client currently sends — test the flows)
- **Depends on**: 040 (CI gate to catch regressions)
- **Category**: security
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

Three input-boundary gaps (SEC-04/05/06 from the audit):
1. **SVG uploads served inline** — an authenticated user can upload an SVG with embedded script; if another user opens the file URL directly it can execute in-origin (stored XSS). CSP `script-src 'self'` mitigates but is a single fragile barrier.
2. **API bodies accepted as raw `dict`** — `create_request`, `upsert_account`, `sync_accounts` take untyped `dict`, so there's no shape/size/type enforcement and unexpected client keys get persisted into `payload jsonb` verbatim (mass-assignment surface).
3. **`scan-extract` reads the whole upload into memory with no size cap** — a large POST can exhaust worker memory (DoS), unlike `/api/uploads/local` which caps at 20MB.

## Current state

- `backend/routers/uploads.py:19-24` — `ALLOWED_EXTENSIONS` includes `.svg`; `IMAGE_EXT` (`:24`) includes `.svg`; `_guess_media_type` (`:64`) maps `.svg` → `image/svg+xml`. The file-serving handler serves images inline (audit cites `uploads.py:60-64,163-168`). `MAX_UPLOAD_BYTES = 20MB` (`:17`) and the local-upload path streams with a byte counter (audit cites `:103-115`).
- `backend/routers/accounts.py:16` `upsert_account_endpoint(data: dict)`; `:29` `sync_accounts(payload: dict)`; `:68-73` `scan_extract_business_card` does `content = await file.read()` with **no size cap and no extension/content-type check**.
- `backend/routers/reqs.py:17` `create_request(data: dict)` (audit).
- Good pattern to mirror: `backend/routers/contact.py:13-19` already uses a Pydantic `BaseModel` with `Field(min_length=..., max_length=...)`; `backend/routers/users.py` uses a `_USER_PATCH_SAFE` allowlist. Match this discipline.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Backend tests | `cd backend && python -m pytest tests -q` | all pass |

## Scope

**In scope**:
- `backend/routers/uploads.py` (SVG handling)
- `backend/routers/accounts.py` (schema + upload cap)
- `backend/routers/reqs.py` (schema)
- `backend/tests/` (new tests)

**Out of scope**:
- `data_access.py` column extraction (already allowlisted — don't change persistence logic).
- The 20MB local-upload path (already safe — use only as the pattern).
- Changing the request/account **response** shapes.

## Steps

### Step 1 (SEC-04): Stop serving SVG inline

Choose the least-disruptive option and apply it:
- **Preferred**: remove `.svg` from `ALLOWED_EXTENSIONS` and `IMAGE_EXT` in `uploads.py:19-24` if SVG uploads aren't a product requirement (confirm via `grep -rn "svg" --include=*.tsx .` for UI that expects SVG upload).
- **If SVG must stay**: in the file-serving handler force `content_disposition_type="attachment"` and `media_type="application/octet-stream"` for `.svg`, and ensure `X-Content-Type-Options: nosniff` is present on the response.

**Verify**: add a test in `backend/tests/test_upload_svg.py` asserting an uploaded `.svg` is either rejected (preferred) or served as an attachment, not `image/svg+xml` inline. `python -m pytest tests/test_upload_svg.py -q` → PASS.

### Step 2 (SEC-06): Cap the scan-extract upload

In `accounts.py:68-73`, before `parse_business_card_image`, enforce a size limit and content-type gate. Reuse `MAX_UPLOAD_BYTES` (import from `uploads.py` or define a local `SCAN_MAX_BYTES = 10 * 1024 * 1024`). Read with a cap:

```python
content = await file.read()
if len(content) > SCAN_MAX_BYTES:
    raise HTTPException(status_code=413, detail="File too large")
ext = Path(file.filename or "").suffix.lower()
if ext not in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
    raise HTTPException(status_code=400, detail="Unsupported image type")
```

**Verify**: test in `test_upload_svg.py` (or `test_scan_extract.py`) that an oversized/unsupported upload returns 413/400. `python -m pytest -q` → PASS.

### Step 3 (SEC-05): Add Pydantic schemas at the raw-`dict` boundaries

For `accounts.py:16` `upsert_account_endpoint`, `accounts.py:29` `sync_accounts`, and `reqs.py:17` `create_request`, introduce Pydantic models. Because these persist into `payload jsonb`, use **explicit known fields + a controlled catch-all** rather than blindly forbidding extras (that could break the client). Minimum viable: a model with the required identity fields typed (e.g. `id`, `propertyId`, and for sync `accounts: list`, `allowClear: bool = False`) and validate types; keep passing the validated dict to `data_access`.

STOP and report if the request/account payloads are large/loosely-shaped enough that modeling them fully is a multi-day effort — in that case ship a minimal model validating just identity + list/bool fields (the DoS/mass-assignment-relevant ones) and note the rest as follow-up.

**Verify**: existing `test_api_full.py` and account/request tests still pass (`python -m pytest -q`), proving the models accept current valid payloads. Add one test that a malformed body (e.g. `accounts` not a list, or missing `propertyId`) returns 422/400.

### Step 4: Full regression

**Verify**: `cd backend && python -m pytest tests -q` → all pass.

## Done criteria

- [ ] SVG is no longer served inline as `image/svg+xml` (rejected or attachment).
- [ ] `scan-extract` rejects oversized/unsupported uploads (413/400).
- [ ] `upsert_account`, `sync_accounts`, `create_request` validate their bodies via Pydantic.
- [ ] `cd backend && python -m pytest tests -q` exits 0 with new tests passing.
- [ ] No response-shape change; no files outside scope modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Cited lines don't match "Current state" (drift).
- The frontend genuinely uploads SVGs as a feature (Step 1) — switch to the attachment variant and note it.
- Fully modeling request/account payloads is L-effort — ship the minimal identity/list/bool model and report the rest as follow-up.
- Existing tests fail because the client sends payloads your model rejects — loosen the model to accept them (validation should reject malformed, not valid, payloads).

## Maintenance notes

- Reviewer: confirm no valid client payload is rejected (check `backendApi.ts` call sites for these endpoints).
- Follow-up: consider `extra="forbid"` once the full payload shape is modeled and the client is confirmed to send only known keys.
