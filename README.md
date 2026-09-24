# Advanced Sales & Tour Management System (V3)

Full-stack hotel sales, events, CRM, and Feed management with **real-time WebSocket** updates. Runs on Docker Compose with PostgreSQL **`as-postgres`**.

## Database

| Item | Value |
|------|--------|
| Container / service | `as-postgres` |
| Database name | `as-postgres` |
| User | `as_owner` |
| Password | from `.env` → `DB_PASSWORD` |
| Connection | `postgresql://as_owner:…@as-postgres:5432/as-postgres` |

This is your **real** Postgres (Docker). Neon cloud is not used.

> If you still have an old volume named `as-postgres-v2-data` with database `neondb`, dump it and restore into the new `as-postgres` container (see below). Do not point production at Neon.

## Local feature work (while finishing features)

Uses Vite HMR (`npm run dev` **inside** the frontend container only).

```bash
git clone https://github.com/Xas-21/V3-Advanced-Sales.git
cd V3-Advanced-Sales
cp .env.example .env   # set SESSION_SECRET + DB_PASSWORD

docker compose up -d --build
# App (dev HMR): http://localhost:5173
# API:            http://localhost:8000
```

```bash
# Logs
docker logs -f as-frontend
docker logs -f as-backend

# Backend tests
docker exec as-backend python3 -m pytest
```

## Production deploy (when features are finalized)

**Do not use `npm run dev` online.** Build a static frontend and serve it with nginx; API stays on FastAPI. The prod stack **reuses the existing V3 database** (`neondb_owner`/`neondb`, external volume `as-postgres-v3-data`) and sits **behind the owner's existing Traefik** (TLS, no raw port 80 published).

Required prod `.env` vars:

```bash
# Reuse the real V3 DB (host `as-postgres` = network alias):
DATABASE_URL=postgresql://neondb_owner:${V3_DB_PASSWORD}@as-postgres:5432/neondb
V3_DB_PASSWORD=<password baked into the as-postgres-v3-data volume>
SESSION_SECRET=<long random, 32+ chars>
CORS_ORIGINS=https://<your-domain>
APP_DOMAIN=<your-domain>            # Traefik Host() rule for as-frontend
TRAEFIK_CERTRESOLVER=letsencrypt    # name of your Traefik ACME resolver
VITE_API_BASE_URL=                  # leave EMPTY — same-origin; nginx proxies /api and /ws
```

The owner's Traefik network must already exist (declared `external: true` as `traefik`):

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Load the current V3 database

`deploy/as-postgres-v3.dump` is a full custom-format dump of the normalized local V3 database (accounts, requests, users, properties, foreign keys). Copy `.env.example` to `.env` and set `V3_DB_PASSWORD` before the first Postgres start. Then restore:

```bash
docker compose -f docker-compose.prod.yml up -d as-postgres
docker cp deploy/as-postgres-v3.dump as-postgres-v3:/tmp/as-postgres-v3.dump
docker exec as-postgres-v3 pg_restore -U neondb_owner -d neondb --no-owner --no-acl --clean --if-exists /tmp/as-postgres-v3.dump
docker exec as-postgres-v3 rm /tmp/as-postgres-v3.dump
```

On a brand-new empty database, drop `--clean --if-exists` if restore reports missing objects. Users sign in with their existing passwords. Sessions in the dump are not required.

| Service | Role |
|---------|------|
| `as-postgres` (container `as-postgres-v3`) | PostgreSQL 18 — reuses external volume `as-postgres-v3-data` |
| `as-backend` | FastAPI + WebSocket (internal); uploads persist on `as-uploads-data` at `/data/uploads` |
| `as-frontend` | nginx → built `dist/`, behind Traefik (`websecure`/TLS); proxies `/api` and `/ws` |

### Schema migrations (automatic, on boot)

On backend startup `apply_sql_migrations()` applies every `backend/migrations/*.sql` (sorted by filename) not yet recorded in the `schema_migrations` table, each in its own transaction. All `.sql` are idempotent (`IF NOT EXISTS` / guarded `ADD CONSTRAINT`), so re-applying on the already-migrated V3 DB is a safe no-op.

**Confirm migrations applied** after `up`:

```bash
docker logs as-backend | Select-String "schema_migrations:"          # e.g. "schema_migrations: 0 applied, 5 skipped"
docker exec -i as-postgres-v3 psql -U neondb_owner -d neondb -c "SELECT filename, applied_at FROM schema_migrations ORDER BY filename;"
docker exec as-backend python3 -c "import urllib.request,json; print(json.load(urllib.request.urlopen('http://localhost:8000/api/health')))"
```

**One-time data migrations are MANUAL** — the `.py` files under `backend/migrations/` (e.g. `002_migrate.py`, `015_crm_blob_to_rows.py`) read legacy blobs and are **not** run by the boot runner. Run them by hand once, only when migrating legacy data:

```bash
docker exec as-backend python3 migrations/015_crm_blob_to_rows.py
```

After auth that expects bcrypt hashes:

```bash
docker exec as-backend python3 scripts/migrate_db_passwords.py
```

### Migrating data from the old Neon-named local DB

If you previously used `as-postgres-V2` / `neondb`:

```bash
# Dump old container (if still running)
docker exec -e PGPASSWORD="$DB_PASSWORD" as-postgres-V2 \
  pg_dump -U neondb_owner -Fc neondb > as_legacy.dump

# Start new stack, then restore into as-postgres
docker compose up -d as-postgres
docker cp as_legacy.dump as-postgres:/tmp/as_legacy.dump
docker exec -e PGPASSWORD="$DB_PASSWORD" as-postgres \
  pg_restore -U as_owner -d as-postgres --clean --if-exists /tmp/as_legacy.dump
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ as-frontend │ ──> │ as-backend   │ ──> │ as-postgres  │
│ Vite (local)│     │ FastAPI      │     │ PostgreSQL 18│
│ nginx (prod)│     │ :8000        │     │ DB as-postgres│
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │ WebSocket
                           ▼
                      connected clients
```

### Frontend modules

- **`AS.tsx`** — Main dashboard shell, KPI cards, navigation
- **`CRM.tsx`** — Pipeline management
- **`RequestsManager.tsx`** — Booking request wizard (Discard on new/edit/duplicate)
- **`Contracts.tsx` / `Reports.tsx` / `Settings.tsx`** — Settings: staff property assignment, taxonomy drag-reorder (rooms/venues/occupancy/segments), profile chips from user `propertyId` / `property_ids`
- **`sortOrder.ts` / `userPropertyAccess.ts`** — display order + multi-property assignment helpers
- **`dashboardHub/`** — Analytics tabs + Social Feed

### Notes

- Partial property POSTs (payment methods, occupancy, taxonomy) **merge** into the existing property document server-side (`upsert_flat`) so other fields are not wiped.
- Profile assignment chips need the properties catalog on first load (Settings fetches `/api/properties` for every role, including profile-only users).

## Tech stack

- **Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS, Recharts, Lucide
- **Backend:** Python 3.13, FastAPI, Uvicorn, psycopg3
- **Database:** PostgreSQL 18 (`as-postgres`)
- **Real-time:** WebSocket (session cookie, property-scoped)
- **Infrastructure:** Docker Compose

## Environment variables (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | `postgresql://neondb_owner:…@as-postgres:5432/neondb` (prod reuses V3 DB) |
| `V3_DB_PASSWORD` | Yes (prod) | Password for the V3 Postgres (matches the `as-postgres-v3-data` volume) |
| `DB_PASSWORD` | Dev | Legacy dev / V2-reference container password (`docker-compose.yml`) |
| `SESSION_SECRET` | Yes | 32+ char random string |
| `CORS_ORIGINS` | Yes | Comma-separated origins (`https://<domain>` in prod) |
| `APP_DOMAIN` | Yes (prod) | Public domain Traefik routes to `as-frontend` |
| `TRAEFIK_CERTRESOLVER` | No | Traefik ACME resolver name (default `letsencrypt`) |
| `USE_FILE_STORAGE` | No | Keep `false` |
| `VITE_API_BASE_URL` | No | Leave empty in Docker (same-origin; nginx proxies) |

## WebSocket

- **Endpoint:** `/ws` (session cookie)
- **Scope:** Assigned properties only
- **Events:** `{table, action, id, data}` after writes

## Project resources

- **Live URL:** https://app.as-saas.com
- **Repo:** https://github.com/Xas-21/V3-Advanced-Sales

## License

Internal use — Advanced Sales & Tour Management System
