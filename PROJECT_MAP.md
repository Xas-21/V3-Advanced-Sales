# PROJECT_MAP — Advanced Sales (AS) System, V3

> **Version 3** — Full-stack sales management system with real-time live updates via WebSocket.
> Accounts & requests are fully relational (no JSONB payload). All 24 tables with FK enforcement.

## [TECH_STACK]

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Frontend | React + TypeScript | 18.x | Vite, Tailwind CSS, Recharts, Lucide |
| Backend | FastAPI + Uvicorn | Python 3.13 | Async API, psycopg3 PG driver |
| Database | PostgreSQL | 18 Alpine | Container + DB: `as-postgres` (user `as_owner`) |
| Real-time | WebSocket | — | `ws.py` router + `websocket_manager.py` |
| Auth | Cookie-based sessions | — | Same session for REST + WebSocket |
| Edge | Traefik + Let's Encrypt | — | `app.as-saas.com` → containers |
| Orc | Docker Compose | — | 3 services |
| CI | GitHub | — | `Xas-21/V3-Advanced-Sales` |

## [SYSTEM_FLOW]

```
Browser → app.as-saas.com
  ├── Frontend (port 5173) — React SPA
  │     ├── REST API → /api/* → FastAPI → data_access.py → PostgreSQL
  │     └── WebSocket → /ws → live updates broadcast
  └── Backend (port 8000) — FastAPI
        ├── Routers (routers/*.py) → thin dispatch
        ├── data_access.py — single relational DAL (tenant-scoped)
        └── websocket_manager.py — broadcasts mutations to connected clients
```

### Real-time live updates (WebSocket)
- Clients connect after login via `/ws` with session cookie
- Subscription scope = user's property_id (or assigned_property_ids, or global for admins)
- Every write operation (create/update/delete) broadcasts the affected table + row id to all subscribers of that property
- Frontend receives `{table, action, id, data}` messages and patches state without refresh

### Data access pattern
1. HTTP → FastAPI router → `data_access.py` function
2. DAL opens pooled PG connection, applies **tenant scope** (`_tenant_scope` → allowed `property_id`)
3. Reads: typed columns + child-table joins → reconstructed nested document
4. Writes: typed columns + FK-enforced child writes; returns the full reconstructed document
5. After write: WebSocket broadcast to all connected clients with matching property scope

## [DATA INVENTORY] (2026-07-12 live)

| Table | Rows | Notes |
|-------|------|-------|
| `users` | 7 | Abdullah admin, Shaden agent, 5 others |
| `properties` | 3 | Shaden (Ps8b83kgbm), 2 others |
| `accounts` | 408 | With FK to users/properties |
| `account_contacts` | 468 | FK to accounts (cascade) |
| `account_activities` | 960 | FK to accounts (cascade) |
| `requests` | 375 | FK to accounts (nullable), properties |
| `request_rooms` | 741 | FK to requests (cascade) |
| `request_agenda` | 99 | FK to requests (cascade) |
| `request_logs` | 1139 | FK to requests (cascade) |
| `request_payments` | 233 | FK to requests (cascade) |
| `request_invoices` | 375 | FK to requests (cascade) |
| `request_alerts` | 10 | FK to requests (cascade) |
| `request_feedback` | 375 | FK to requests (cascade) |
| `request_transportation` | 3 | FK to requests (cascade) |
| `venues` | 16 | FK to properties |
| `rooms` | 13 | FK to properties |
| `taxes` | 3 | FK to properties |
| `financials` | 1 | FK to properties |
| `tasks` | 7 | FK to properties |
| `contract_templates` | 4 | No FK (reference) |
| `cxl_reasons` | 0 | Reference (empty OK) |
| `crm_state` | 3 | Seeded per property |
| `feed_posts` | 1 | Social feed |
| `feed_comments` | 0 | FK to posts (cascade) |
| `feed_reactions` | 0 | FK to posts (cascade) |

**Total child rows (nested into accounts/requests):** 4,403

## [ARCHITECTURE]

### Backend structure
```
backend/
├── main.py              — FastAPI entry, WS app, shutdown
├── data_access.py       — Single relational DAL (all tables)
├── utils.py             — Helpers, schema migration, child defs
├── auth_db.py           — Session resolution
├── security.py          — Password hashing, SESSION_COOKIE_NAME
├── websocket_manager.py — WebSocket connection manager + broadcast
├── cors_middleware.py   — CORS config
├── dependencies.py      — Tenant scope, require_user helpers
├── crm_recovery.py      — CRM state migration
├── routers/
│   ├── accounts.py      — CRUD accounts (list/get/upsert/delete)
│   ├── reqs.py          — CRUD requests (list/get/upsert with collision guard)
│   ├── auth.py          — Login/logout/session
│   ├── users.py         — User CRUD + admin
│   ├── properties.py    — Property CRUD
│   ├── rooms.py         — Room types
│   ├── venues.py        — Venues
│   ├── taxes.py         — Tax config
│   ├── financials.py    — Financial targets
│   ├── tasks.py         — Tasks
│   ├── promotions.py    — Promotions
│   ├── contracts.py     — Contract templates
│   ├── cxl_reasons.py   — Cancellation reasons
│   ├── crm_state.py     — CRM pipeline state
│   ├── contact.py       — Contact sync
│   ├── feed.py          — Social feed (posts/comments/reactions)
│   ├── uploads.py       — File upload endpoint
│   └── ws.py            — WebSocket live-updates endpoint
├── migrations/
│   └── 001_normalized_schema.sql  — Schema DDL + FKs + indexes
├── tests/
│   └── test_api_full.py — 22 pytest tests
├── requirements.txt
└── Dockerfile.backend
```

### Frontend structure (top-level)
```
AS.tsx                   — Main app shell, routing, KPIs
CRM.tsx                  — CRM pipeline
RequestsManager.tsx      — Booking request wizard
Contracts.tsx            — Contract manager
Reports.tsx              — Reports & analytics
Settings.tsx             — System config (users, properties, taxes)
Login.tsx                — Auth UI
dashboardHub/            — Dashboard hub (10 analytics tabs + Feed)
  ├── pages/             ─ DashboardHubFeedPage, DashboardHubRequestsPage, etc.
  └── dashboardHubTabs.ts
package.json
Dockerfile.frontend
docker-compose.yml
```

### Key DB design decisions
- **Fully relational** — no JSONB payload on accounts or requests (dropped after verified parity).
- **10 child tables** for nested arrays/objects (rooms, agenda, payments, etc.), each with `idx` for order.
- **29 foreign keys** total (verified: 0 orphaned rows).
- **71 indexes** for query performance.
- **Tenant model**: `properties` root; every flat entity has `property_id`; reads filtered by `_tenant_scope`.
- **FK cascade**: property delete → cascade to all children; user delete → SET NULL on ownership cols.
- **Backups**: daily 03:17 via `scripts/backup_postgres.sh`, 7-day retention, `pg_dump -Fc` to `/var/backups/as-postgres/`.

## [VERIFICATION]

- **Auth:** login 200 → session cookie → all protected endpoints 200.
- **Read path parity (payload vs normalized):** accounts 408/408, requests 375/375 — **0 true data loss**.
- **Test suite:** 22 passed, 1 failed (pre-existing unrelated: users table missing `assigned_property_ids` column).
- **FK integrity:** 0 orphan rows.
- **Security:** bcrypt passwords, httpOnly+Secure SameSite=Lax sessions, CORS restricted, tenant-enforced DAL.
- **WebSocket:** authenticated connect + property-scoped broadcast verified.

## [ORPHANS & PENDING]

- [x] DONE: Full import into local/Docker Postgres `as-postgres` (29 tables, 408 accounts, 375 requests)
- [x] DONE: Password remediation (81 payload ghost owners → Abdullah)
- [x] DONE: FK/index schema hardening (29 FKs, 71 indexes)
- [x] DONE: Feed feature (backend + frontend, 8 emoji reactions)
- [x] DONE: Dashboard Hub (10 analytics tabs)
- [x] DONE: Payload column removed from accounts + requests
- [x] DONE: Child tables backfilled (4403 rows)
- [x] DONE: WebSocket live updates (ws.py + websocket_manager.py)
- [x] DONE: Automated Postgres backups (daily cron)
- [ ] PENDING: Users table missing `assigned_property_ids` column (router references it — pre-existing bug)
- [ ] PENDING: Legacy payload helpers in `utils.py` retained for script toolchain (not in live path)
- [ ] PENDING: No Social Feed frontend link yet (Feed feature exists, no nav entry)
- [ ] OPTIONAL: CI secret `TEST_ADMIN_PASS` to un-skip 4 auth tests
