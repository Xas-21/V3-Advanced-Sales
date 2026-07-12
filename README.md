# Advanced Sales & Tour Management System (V3)

Full-stack hotel sales, events, CRM, and Feed management system with **real-time live updates** via WebSocket. Runs in Docker Compose with 3 containers.

## Quick start (local)

```bash
# Clone
git clone https://github.com/Xas-21/V3-Advanced-Sales.git
cd V3-Advanced-Sales

# Create .env file
cat > .env << 'ENVEOF'
DATABASE_URL=postgresql://neondb_owner:postgres@as-postgres-V2:5432/neondb
SESSION_SECRET=change-this-to-a-random-string
CORS_ORIGINS=http://localhost:5173,http://localhost
USE_FILE_STORAGE=false
DB_PASSWORD=postgres
ENVEOF

# Start all 3 containers (builds from source, provisions DB)
docker compose up -d

# Wait ~15 seconds for health checks, then restore live data:
# (See "Restoring VPS data locally" below)

# Open in browser
open http://localhost:5173
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  as-frontend │ ──> │ as-backend   │ ──> │ as-postgres  │
│  React + Vite│     │ FastAPI      │     │ PostgreSQL 18│
│  :5173       │     │ :8000        │     │ :5432        │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │ WebSocket
                           │ broadcasts
                      ┌────▼───────┐
                      │ All        │
                      │ connected  │
                      │ clients    │
                      └────────────┘
```

### Services

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| `as-backend` | Python 3.13 + FastAPI | 8000 | REST API + WebSocket |
| `as-frontend` | Node 22 + Vite + React 18 | 5173 | SPA dev server |
| `as-postgres-V2` | PostgreSQL 18 Alpine | 5432 | Relational database |

### Frontend app structure

- **`AS.tsx`** — Main dashboard shell, KPI cards, navigation
- **`CRM.tsx`** — Pipeline management
- **`RequestsManager.tsx`** — Booking request wizard (Accommodation/Events)
- **`Contracts.tsx`** — Contract generation
- **`Reports.tsx`** — Analytics & reports
- **`Settings.tsx`** — User/property/tax management
- **`Login.tsx`** — Authentication
- **`dashboardHub/`** — 10 analytics tabs + Social Feed

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS, Recharts, Lucide React
- **Backend:** Python 3.13, FastAPI, Uvicorn, psycopg3 (async PG driver)
- **Database:** PostgreSQL 18, 24 tables, 29 foreign keys, 71 indexes
- **Real-time:** WebSocket (authenticated via session cookie, property-scoped broadcasts)
- **Real-time:** WebSocket (authenticated via session cookie, property-scoped broadcasts)
- **Infrastructure:** Docker Compose, bind mounts for hot-reload development

## Live data dump & restore

### 1. Dump from VPS (SSH into VPS)

```bash
ssh root@187.55.225.134 "bash /opt/as-backups/backup_postgres.sh"
```

Or dump manually:

```bash
ssh root@187.55.225.134 \
  "docker exec -e PGPASSWORD=postgres_password as-postgres-V2 \
   pg_dump -U neondb_owner -Fc neondb > /tmp/as_live.dump"
scp root@187.55.225.134:/tmp/as_live.dump .
```

### 2. Restore locally

```bash
# Ensure postgres container is healthy first
docker compose ps

# Copy dump into the postgres container
docker cp ./as_live.dump as-postgres-V2:/tmp/as_live.dump

# Restore (replaces all data)
docker exec -e PGPASSWORD=postgres as-postgres-V2 \
  pg_restore -U neondb_owner -d neondb --clean --if-exists /tmp/as_live.dump

# Restart backend to reconnect
docker compose restart as-backend
```

### 3. Verify

```bash
# Log in via browser at http://localhost:5173
# Or test the API:
docker exec as-backend python3 -c "
import urllib.request, json
r = urllib.request.urlopen('http://localhost:8000/api/health')
print('Health:', r.status)
"
```

## Development

```bash
# Backend logs — hot-reloads on code changes (bind mount)
docker logs -f as-backend

# Frontend logs — hot-reloads on code changes (bind mount)
docker logs -f as-frontend

# Run backend tests
docker exec as-backend python3 -m pytest

# Rebuild images (after adding dependencies)
docker compose build --no-cache
docker compose up -d
```

## Environment variables (`.env`)

| Variable | Required | Description | Local default |
|----------|----------|-------------|---------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://neondb_owner:postgres@as-postgres-V2:5432/neondb` |
| `SESSION_SECRET` | Yes | 32+ char random string for session signing | (generate your own) |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins | `http://localhost:5173,http://localhost` |
| `USE_FILE_STORAGE` | No | Legacy JSON file fallback (disabled) | `false` |
| `DB_PASSWORD` | Yes | PostgreSQL password in connection | `postgres` |
| `VITE_API_BASE_URL` | No | Frontend API base (for production builds) | (leave empty for dev) |

## WebSocket live updates

The system uses WebSocket for real-time multi-user synchronization:

- **Endpoint:** `/ws` (via session cookie auth)
- **Scope:** Users receive updates only for their assigned properties
- **Events:** `{table, action, id, data}` — fires after every write operation
- **Frontend:** Patches local state without full-page refresh
- **Auto-reconnect:** Handles disconnection transparently

## Project resources

- **Live URL:** https://app.as-saas.com
- **VPS:** Hostinger 187.55.225.134 (root SSH)
- **Backups:** Daily `pg_dump -Fc` at 03:17 UTC, 7-day retention
- **Repo:** https://github.com/Xas-21/V3-Advanced-Sales

## License

Internal use — Advanced Sales & Tour Management System
