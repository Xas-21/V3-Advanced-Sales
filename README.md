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

**Do not use `npm run dev` online.** Build a static frontend and serve it with nginx; API stays on FastAPI.

```bash
# On the server (with production .env):
# DATABASE_URL=postgresql://as_owner:STRONG@as-postgres:5432/as-postgres
# CORS_ORIGINS=https://app.as-saas.com
# SESSION_SECRET=<long random>
# DB_PASSWORD=<same as URL>
# VITE_API_BASE_URL=   # leave empty — nginx proxies /api and /ws

docker compose -f docker-compose.prod.yml up -d --build
```

| Service | Role |
|---------|------|
| `as-postgres` | PostgreSQL 18 |
| `as-backend` | FastAPI + WebSocket (internal) |
| `as-frontend` | nginx → built `dist/` on port **80**, proxies `/api` and `/ws` |

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
| `DATABASE_URL` | Yes | `postgresql://as_owner:…@as-postgres:5432/as-postgres` |
| `DB_PASSWORD` | Yes | Matches Postgres password |
| `SESSION_SECRET` | Yes | 32+ char random string |
| `CORS_ORIGINS` | Yes | Comma-separated origins |
| `USE_FILE_STORAGE` | No | Keep `false` |
| `VITE_API_BASE_URL` | No | Leave empty in Docker (nginx proxies) |

## WebSocket

- **Endpoint:** `/ws` (session cookie)
- **Scope:** Assigned properties only
- **Events:** `{table, action, id, data}` after writes

## Project resources

- **Live URL:** https://app.as-saas.com
- **Repo:** https://github.com/Xas-21/V3-Advanced-Sales

## License

Internal use — Advanced Sales & Tour Management System
