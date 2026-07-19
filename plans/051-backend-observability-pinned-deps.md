# Plan 051: Backend logging/request-IDs and pinned dependencies

> **Executor instructions**: Follow step by step. Run every verification. Honor "STOP conditions". Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- backend/main.py backend/requirements.txt Dockerfile.backend`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: prod / dependencies
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

Two production-operability gaps:
1. **No logging configuration, request IDs, or structured logs** (PROD-05): there's an import-time `print(...)`, ad-hoc `logging.error` in the global handler, but no `basicConfig`/formatter and no correlation ID. Production 500s can't be traced across the stack, and debugging needs code changes.
2. **Unpinned backend dependencies** (PROD-06): `requirements.txt` pins only `bcrypt`; everything else floats, so image rebuilds are non-reproducible and can silently pull a breaking/vulnerable transitive version.

## Current state

- `backend/main.py:3` — `print("Advanced Sales Backend: LOADING MAIN APP...")` at import; `main.py:70` ad-hoc `import logging`; global 500 handler logs via `logging.error(...)` (audit cites `main.py:76-82`) but there is no `logging.basicConfig`/handler/formatter and no request-ID middleware.
- `backend/requirements.txt` (verified) — `fastapi, uvicorn, websockets, pydantic, httpx, pytest, psycopg[binary], psycopg-pool, python-dotenv, python-multipart, slowapi, bcrypt>=4.0,<5, bleach[css]` — only bcrypt is bounded.
- `Dockerfile.backend:6-7` — `COPY backend/requirements.txt .` then `pip install --no-cache-dir -r requirements.txt` (no lockfile).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Backend tests | `cd backend && python -m pytest tests -q` | all pass |
| Freeze current resolved versions | `cd backend && python -m pip freeze` | list of exact versions to pin from |
| Build image | `docker compose -f docker-compose.prod.yml build as-backend` | exit 0 |

## Scope

**In scope**: `backend/main.py` (logging + request-ID middleware), `backend/requirements.txt` (pin), optionally a `requirements.lock`.
**Out of scope**: changing framework versions (pin what's currently resolved, don't upgrade here); router business logic.

## Steps

### Step 1: Configure logging

In `backend/main.py`, at startup configure `logging.basicConfig` with a formatter (include timestamp, level, logger, message). In production (detect via an env like `APP_ENV`/`ENVIRONMENT`, or always structured) prefer a JSON formatter. Replace the import-time `print` (`main.py:3`) with a `logger.info(...)`.

**Verify**: start the app locally; logs appear with the configured format; no bare `print` at import (`grep -n "print(" backend/main.py` → none, or only intentional CLI).

### Step 2: Add a request-ID middleware

Add middleware that reads an incoming `X-Request-ID` or generates a `uuid4`, stores it (contextvar), returns it on the response header, and includes it in log records (via a `logging.Filter` or by logging it in the middleware around each request). Ensure the global 500 handler logs the request ID.

**Verify**: `curl -i http://localhost:8000/api/health` shows an `X-Request-ID` response header; a forced error logs that same ID. Backend tests still pass.

### Step 3: Pin dependencies

Run `python -m pip freeze` in the backend venv to get resolved versions. Pin each `requirements.txt` entry to `==<version>` (keep `bcrypt>=4.0,<5` or pin it too). Optionally generate a `requirements.lock` via `pip-compile` and install from it in `Dockerfile.backend`.

**Verify**: `cd backend && python -m pip install -r requirements.txt` is a no-op (already satisfied); `docker compose -f docker-compose.prod.yml build as-backend` exits 0; `cd backend && python -m pytest tests -q` passes.

## Done criteria

- [ ] Structured logging configured; import-time `print` replaced with a logger call.
- [ ] Every request gets an `X-Request-ID` (incoming or generated), returned in the response and present in logs incl. 500s.
- [ ] `requirements.txt` pins exact versions; backend image builds.
- [ ] `cd backend && python -m pytest tests -q` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- `pip freeze` reveals a currently-installed version with a known critical CVE — pin to the nearest safe patch and note it, don't blindly pin the vulnerable one.
- The request-ID contextvar conflicts with the existing auth contextvar wiring — reuse the same middleware ordering; report if unclear.

## Maintenance notes

- Reviewer: confirm logs don't include secrets/PII (data-minimization) — no request bodies with credentials logged.
- Follow-up: ship logs to a collector; add `/metrics` if observability is expanded.
