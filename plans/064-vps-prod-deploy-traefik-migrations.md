# Plan 064: Production deploy for the VPS — reuse as-postgres-v3, Traefik TLS, uploads volume, ordered migration runner

> **Executor instructions**: Follow step by step; verify each step; obey STOP conditions.
> A reviewer maintains `plans/README.md`. This plan changes deploy config + adds a migration
> runner. It must NOT change app behavior.
>
> **Drift check (run first)**: `git diff --stat 7d43062..HEAD -- docker-compose.prod.yml Dockerfile.backend backend/utils.py backend/main.py`

## Status
- **Priority**: P0
- **Effort**: M
- **Risk**: MED (misconfig = empty DB or broken login in prod)
- **Depends on**: 060–063, 065 migrations should exist so the runner applies them
- **Category**: prod / migration
- **Planned at**: commit `7d43062`, 2026-07-22

## Why this matters
The owner will clone the repo on a VPS, keep the existing **`as-postgres-v3`** database + its
Docker volume, run `as-frontend`/`as-backend`, store uploads (files/invoices/agreements) on a
persistent volume, and terminate TLS with their existing **Traefik** + domain. Today
`docker-compose.prod.yml` would create a *fresh empty* `as-postgres-data` volume with different
credentials, publishes port 80 directly (no TLS wiring), and no migrations are auto-applied.
This plan makes the prod stack reuse the real DB, run behind Traefik over HTTPS, persist uploads,
and apply schema migrations idempotently on boot.

## Current state (verified)
- `docker-compose.prod.yml:8-24` — creates `as-postgres` with `as_owner`/`as-postgres` and a new `as-postgres-data` volume (mismatch with existing V3 which is `neondb_owner`/`neondb`, volume `as-postgres-v3-data`).
- `docker-compose.prod.yml:58-80` — frontend publishes `80:80`; no Traefik labels.
- `backend/routers/auth.py:138-141` — cookie `secure=True` (needs HTTPS at edge — Traefik provides it).
- `nginx.conf:14-33` — already proxies `/api` and upgrades `/ws` (frontend serves both).
- `backend/utils.py:853-864` — `init_database()` creates only feed/chat/crm_comments; does NOT apply `migrations/*.sql`.
- Existing dev DB (source of truth): `docker-compose.yml:4-26` — container `as-postgres-v3`, `neondb_owner`/`neondb`, external volume `as-postgres-v3-data`.

## Scope
**In scope:** `docker-compose.prod.yml`, a new `backend/migrations/run_sql_migrations.py` (or add `apply_sql_migrations()` to `backend/utils.py`) + call from `init_database()`, `.env.example` (document prod vars), `README.md` prod section.
**Out of scope:** app/business logic; the dev `docker-compose.yml`.

## Steps

### Step 1: Ordered, idempotent SQL migration runner applied on boot
Add `apply_sql_migrations()` to `backend/utils.py`: create a `schema_migrations(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())` table; list `backend/migrations/*.sql` sorted by filename; skip any already recorded; execute the rest in a transaction; record filename. Call it from `init_database()` **before** the feed/chat ensures. `.sql` files are written with `IF NOT EXISTS` / guarded `ADD CONSTRAINT`, so re-apply on the already-migrated V3 DB is a safe no-op.
- Data migrations (`002_migrate.py`, `015_crm_blob_to_rows.py`) stay **manual/one-shot** (they read legacy blobs) — document that in the runbook; the runner handles DDL only.
**Verify**: boot backend against a copy of V3 → logs "schema_migrations: N applied, M skipped"; app health `ready:true`; no duplicate-constraint crash.

### Step 2: Prod compose — reuse the real V3 database
Rewrite the `as-postgres` service in `docker-compose.prod.yml` to match the existing V3 container: `POSTGRES_USER=neondb_owner`, `POSTGRES_DB=neondb`, `POSTGRES_PASSWORD=${V3_DB_PASSWORD}`, and mount the **existing** volume as `external: true` named `as-postgres-v3-data`. `DATABASE_URL` (in `.env`) must be `postgresql://neondb_owner:${V3_DB_PASSWORD}@as-postgres:5432/neondb`. Keep the network alias `as-postgres`.
**Verify**: `docker compose -f docker-compose.prod.yml config` shows the external volume + correct creds; a dry `up` on a clone mounts existing data (row counts non-zero).

### Step 3: Traefik labels + drop direct port publish
On `as-frontend`, remove `ports: [80:80]`; add Traefik labels (router on the owner's domain, entrypoint `websecure`, TLS via their resolver) and join the external Traefik network. Provide placeholders the owner fills: `${APP_DOMAIN}`, cert resolver name. Ensure `/ws` and `/api` still flow through the frontend nginx (they do — nginx proxies them). Keep `VITE_API_BASE_URL` empty (same-origin).
**Verify**: `docker compose -f docker-compose.prod.yml config` includes labels; document that Traefik must forward the `Upgrade`/`Connection` headers for `/ws` (nginx already re-adds them; Traefik→nginx is HTTP/1.1).

### Step 4: Persist uploads volume
Confirm `as-uploads-data` is a named volume mounted at `/data/uploads` on `as-backend` and that `UPLOADS_DIR=/data/uploads`. Document that files/invoices/agreements persist there. (Frontend serves them via `/api/uploads/...` proxied to backend.)
**Verify**: compose shows the volume; uploading a file then restarting the backend keeps the file.

### Step 5: Document prod env + runbook
Update `.env.example` and `README.md` prod section: required vars (`V3_DB_PASSWORD`, `SESSION_SECRET`, `CORS_ORIGINS=https://<domain>`, `APP_DOMAIN`, empty `VITE_API_BASE_URL`), the one-time data-migration note, and "confirm migrations applied" check.
**Verify**: a first-time reader can deploy from the README alone.

## Done criteria
- [ ] `docker compose -f docker-compose.prod.yml config` valid; DB service uses `neondb_owner`/`neondb` + external `as-postgres-v3-data`
- [ ] Backend boot applies pending `.sql` migrations idempotently (log line), no crash on already-migrated DB
- [ ] Frontend has Traefik labels, no raw `80:80`; `/ws` + `/api` still work behind TLS
- [ ] Uploads persist across backend restart
- [ ] README prod section updated; `.env.example` lists all prod vars
- [ ] Only in-scope files changed

## STOP conditions
- The existing V3 volume name/credentials differ from `docker-compose.yml` (`neondb_owner`/`neondb`/`as-postgres-v3-data`) — confirm with owner before writing compose.
- Applying a `.sql` migration on the real V3 DB errors (means a migration isn't idempotent — fix that migration, don't force).
- Removing `80:80` would break the owner's Traefik setup (confirm they route by Docker network, not host port).

## Maintenance notes
- Reviewer: the migration runner is DDL-only and idempotent; data migrations remain manual by design.
- Secrets live only in the VPS `.env` (never committed).
