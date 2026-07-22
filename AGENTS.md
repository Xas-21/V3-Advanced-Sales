# Advanced Sales Dashboard — Agent Guide

## Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide icons
- **Backend:** Python FastAPI (`backend/`), PostgreSQL, pytest (`backend/tests/`)

## Layout

- `AS.tsx` — main dashboard shell, routing, KPIs
- `CRM.tsx` — CRM pipeline, accounts, activities
- `RequestsManager.tsx` — booking request wizard
- `Contracts.tsx`, `Reports.tsx`, `Settings.tsx` — feature modules (Settings taxonomy DnD + staff assignment)
- `sortOrder.ts`, `userPropertyAccess.ts` — room/venue order + multi-property access helpers
- `backend/main.py` — FastAPI entry; routers in `backend/routers/`
- `backend/sort_order.py` — rooms/venues list sort by `sortOrder`
- `backend/utils.py` — shared backend helpers
- `backend/data_access.py` — `upsert_flat` merges partial property POSTs (do not wipe payload)

## Local feature work (Docker Compose)

```bash
docker compose up -d          # as-frontend uses Vite (npm run dev) for HMR
docker compose logs -f as-frontend
npm run test:backend          # pytest (host or in container)
```

Optional host-only (without Docker frontend):

```bash
npm run dev                   # Vite :5173
npm run dev:api:win           # FastAPI :8000
```

## Production (when features are finalized)

Do **not** run `npm run dev` online. Build and serve static assets:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

See README → **Production deploy**.

## Ops / health

`GET /api/health` — process is `live` when it responds; `ready` is true (HTTP 200) only when Postgres is reachable, otherwise HTTP 503 with `status: degraded|error`. Optional `APP_VERSION` env overrides the payload `version`.

## Conventions

- Prefer minimal, focused diffs; match existing naming and patterns
- Do not commit secrets (`.env`, API keys)
- Frontend uses Tailwind; themes: Luxury, Light, Desert
- Database container + DB name: `as-postgres` (user `as_owner`) — not Neon

## Password migration (fresh Postgres)

After deploying auth that expects bcrypt hashes, run against **as-postgres**:

```bash
cd backend
python scripts/migrate_db_passwords.py          # write hashes
python scripts/migrate_db_passwords.py --dry-run  # report only
```

This hashes leftover **plaintext** passwords in the relational `users` table (skips rows that already look like bcrypt). Safe to re-run. Login only accepts bcrypt hashes — plaintext leftovers will not authenticate until migrated.
