# Plan 054: Cross-platform test/dev scripts + complete `.env.example`

> **Executor instructions**: Follow step by step. Run every verification. Honor "STOP conditions". Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- package.json .env.example`

## Status

- **Priority**: P2 (DX-02) / P3 (DX-03)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: relevant to 040 (CI runs on Linux and needs cross-platform test scripts)
- **Category**: dx
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

- **DX-02**: `npm run test` chains `test:backend`, which hardcodes `.\venv\Scripts\pytest.exe` (Windows-only). CI runs on Linux, and non-Windows contributors can't run the documented one-command test. This directly blocks plan 040's CI backend job.
- **DX-03**: `.env.example` omits `APP_VERSION` (read by the health payload) and `UPLOADS_DIR` (set in prod compose), plus `CONTACT_TO_EMAIL` (from plan 043) — minor onboarding/ops gaps.

## Current state

- `package.json` scripts: `dev:api:win` (`:9`) and `db:import:postgres` (`:10`) use `.\venv\Scripts\python.exe`; `test:backend` (`:15`) = `cd backend && .\venv\Scripts\pytest.exe tests -v`; `test` (`:18`) chains it. A cross-platform `dev:api` (`:8`) already exists (`node scripts/dev-api.mjs`) — precedent for a Node wrapper.
- `.env.example` documents `DATABASE_URL, DB_PASSWORD, SESSION_SECRET, CORS_ORIGINS, USE_FILE_STORAGE, VITE_API_BASE_URL`. Missing: `APP_VERSION` (`backend/main.py` health), `UPLOADS_DIR` (`docker-compose.prod.yml`), `CONTACT_TO_EMAIL` (plan 043).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Backend tests (cross-platform) | `cd backend && python -m pytest tests -q` | all pass on any OS |
| Full test | `npm run test` | runs on Linux + Windows |

## Scope

**In scope**: `package.json` (test/backend scripts), `.env.example`.
**Out of scope**: rewriting the `:win` convenience aliases away (keep them as Windows shortcuts); the CI file itself (plan 040 owns it, but this plan makes its backend job runnable).

## Steps

### Step 1 (DX-02): Make backend scripts cross-platform

Change `test:backend` to invoke pytest via the interpreter without a hardcoded Windows path — e.g. `cd backend && python -m pytest tests -v` (relies on the active venv/`PATH`). Keep a `test:backend:win` alias pointing at `.\venv\Scripts\pytest.exe` for local Windows convenience if desired. Do the same principle for `db:import:postgres` (use `python -m ...` or the existing Node wrapper pattern).

**Verify**: `cd backend && python -m pytest tests -q` passes on the current machine; `npm run test` runs `test:backend` without the `.exe` path. (CI on Linux will exercise the cross-platform form.)

### Step 2 (DX-03): Complete `.env.example`

Add commented entries: `APP_VERSION=` (health payload override), `UPLOADS_DIR=/data/uploads` (prod uploads path), and `CONTACT_TO_EMAIL=` (contact recipient — see plan 043). Keep placeholders only; no real values.

**Verify**: `.env.example` lists all env vars the code reads (cross-check `grep -rn "os.getenv\|import.meta.env" backend src *.ts *.tsx | grep -o '[A-Z_]\{3,\}'` against the file).

## Done criteria

- [ ] `test:backend` and `db:import:postgres` run without a hardcoded Windows `.exe` path; `:win` aliases kept if useful.
- [ ] `npm run test` is runnable on Linux (verifiable via plan 040's CI).
- [ ] `.env.example` documents `APP_VERSION`, `UPLOADS_DIR`, `CONTACT_TO_EMAIL`.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- `python`/`pytest` isn't on PATH in the intended environment such that `python -m pytest` fails — provide a small Node wrapper (like `scripts/dev-api.mjs`) that resolves `Scripts` vs `bin` instead.

## Maintenance notes

- Reviewer: confirm the CI backend job (plan 040) uses the cross-platform script and goes green.
- Keep `.env.example` updated whenever a new env var is introduced.
