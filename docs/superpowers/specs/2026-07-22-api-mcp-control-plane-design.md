# API + Remote MCP Control Plane — Design Spec

**Date:** 2026-07-22  
**Status:** Approved (awaiting implementation plan)  
**Author:** Brainstormed with user via superpowers:brainstorming

## 1. Problem / Goal

Advanced Sales already has a full FastAPI backend (accounts, requests, CRM,
contracts, promotions, health, etc.) but authentication is **browser session
cookies only** (`as_session`). That blocks:

1. **AI agents in Cursor** from managing the live system (create/edit accounts and
   requests, monitor health/KPIs, etc.).
2. **Other systems** from creating accounts/requests via a stable machine credential.

We need a **control plane**: scoped API keys + dual-auth REST + remote MCP over
HTTPS, with a **Settings → Dev** UI so keys, permissions, and property scopes are
managed without writing code.

## 2. Decisions (locked with user)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Delivery shape | **Both** API keys + remote MCP + health/ops in the same first delivery |
| 2 | Key power model | **Scoped keys** — each key has permissions + property scope; admins can mint a full-admin key for agents |
| 3 | MCP hosting | **Remote MCP over HTTPS** mounted next to the FastAPI backend |
| 4 | Long-term surface | Design for **near-total mirror** of backend routers |
| 5 | Shipping style | Design for full coverage; **hard-cap v1** to a fixed must-have list |
| 6 | v1 hard-cap | Health, whoami, properties list, accounts CRUD/search, requests CRUD/search, **promotions read**, **KPI snapshot** |
| 7 | Dashboards meaning | **Health + KPI snapshot** (request counts by status, account totals, revenue rollups) |
| 8 | Architecture approach | **Approach 1** — dual-auth on existing FastAPI + thin MCP facade (not a separate gateway, not MCP-only) |
| 9 | Admin UX | New Settings tab **Dev** — create/edit/rotate/revoke keys, permissions, property scope, MCP connection info |

**MCP vs API for integrations:** keep **both**. REST is the source of truth for
other systems; MCP is an agent-friendly tool wrapper over the same handlers and
the same key scopes. Neither replaces the other.

## 3. Architecture

```text
┌─────────────────┐     Bearer API key      ┌──────────────────────────────┐
│ Other systems   │ ───────────────────────►│  FastAPI (existing app)      │
│ (REST clients)  │                         │                              │
└─────────────────┘                         │  Auth resolver:              │
                                            │   cookie session  OR         │
┌─────────────────┐     MCP (HTTPS)         │   Authorization: Bearer      │
│ Cursor / agents │ ───────────────────────►│                              │
│                 │                         │  /api/*  ← same routers      │
└─────────────────┘                         │  /mcp    ← MCP transport     │
                                            │  tools → same handlers       │
                                            └──────────────┬───────────────┘
                                                           │
                                                           ▼
                                                    PostgreSQL
                                              (users, sessions,
                                               api_keys, data…)
```

**Core rules**

- One FastAPI process remains the control plane.
- Browser keeps `as_session` cookie auth unchanged.
- Machines use `Authorization: Bearer <api_key>`.
- After auth, both paths produce the same actor shape so existing
  `require_permission` / property checks continue to apply.
- MCP tools do **not** talk to Postgres directly; they invoke the same service /
  router logic as REST.
- Even a “full” key must explicitly list permissions (no hidden god-mode bypass).
  Admins create that full key via the Dev UI when needed.

Rejected alternatives:

- **Separate integration gateway** — extra deployable and duplicated tenancy risk.
- **MCP-only** — blocks normal system-to-system REST integrations.

## 4. Components & data model

### 4.1 `api_keys` table

New migration (next available number in `backend/migrations/`):

| Column | Purpose |
|--------|---------|
| `id` | Primary key |
| `name` | Human label |
| `key_prefix` | Non-secret prefix for lookup/UI (e.g. `as_live_ab12`) |
| `key_hash` | Hash of the full secret (never store plaintext) |
| `owner_user_id` | Creator (audit + tenant default) |
| `permissions` | JSON array of permission strings (same vocabulary as users) |
| `property_ids` | JSON array; empty/null = all properties the actor may access |
| `is_active` | Soft enable |
| `expires_at` | Optional |
| `rate_limit_rpm` | Optional simple ceiling |
| `last_used_at` | Updated on successful auth |
| `created_at` / `revoked_at` | Lifecycle |

Raw secret format: `as_live_<prefix_body>_<secret>` (exact encoding can follow
existing security helpers). Shown **once** on create/rotate.

### 4.2 Auth resolver

Extend middleware / `dependencies.py`:

1. If `Authorization: Bearer …` present → resolve API key → build actor from key
   scopes → set request context (`auth_method: "key"`).
2. Else cookie `as_session` → existing `resolve_session` (`auth_method: "session"`).
3. Else anonymous (public routes only, e.g. health liveness).

Actor must remain compatible with `require_user`, `require_permission`,
`require_property_access`, and admin checks.

### 4.3 Key management API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/api-keys` | List keys (no secrets) |
| `POST` | `/api/api-keys` | Create; returns raw secret once |
| `PATCH` | `/api/api-keys/{id}` | Update name, permissions, property_ids, expiry, rate limit |
| `POST` | `/api/api-keys/{id}/rotate` | New secret; old invalid immediately |
| `POST` | `/api/api-keys/{id}/revoke` | `is_active=false`, set `revoked_at` |

Gate: admin or permission `manage_api_keys`.

### 4.4 KPI snapshot

`GET /api/ops/kpi-snapshot?property_id=&from=&to=`

Returns a stable JSON shape:

- Request counts by status
- Account totals (count; optional active/inactive if cheap)
- Simple revenue rollup (reuse existing financials / request revenue helpers where possible)

Permission: reuse existing `view_dashboard` for KPI snapshot (REST + MCP + Dev
presets). Do not invent a parallel `view_ops_kpi` in v1.

### 4.5 Remote MCP server

- Mount at `/mcp` using Streamable HTTP (MCP remote transport).
- **Bearer API key required** for MCP (no cookie-only remote agent auth in v1).
- Each tool is a thin wrapper calling shared handlers.
- Tool availability / success still enforced by key permissions + property scope.

### 4.6 Minimal audit

Log `key_id` + action + resource on mutating REST/MCP calls (reuse request-id
logging). Optional `api_audit` table if a DB row is as cheap as structured logs;
structured logs are enough for v1 if queryability is deferred.

## 5. Settings → Dev page (UI)

Add a fifth **admin-only** tab in `Settings.tsx` next to the existing admin tabs:

```text
[ Settings ] [ Properties ] [ User Mgmt ] [ Configurations ] [ Dev ]
```

Non-admins never see Dev (same pattern as Properties / User Mgmt / Configurations).

### 5.1 Page contents

1. **Header** — “Developer access”; one sentence that API keys power REST and remote MCP.
2. **Connection strip** — copyable MCP URL (`https://<host>/mcp`), link to OpenAPI/`/docs`, short Cursor connection note.
3. **Keys table** — name, prefix, status (active / revoked / expired), last used, property-scope summary, permission count, actions (Edit / Rotate / Revoke).
4. **Create / Edit drawer or modal**:
   - Name
   - Permission checkboxes grouped by domain (Accounts, Requests, Promotions, Ops/KPI, Properties read, Key admin, …)
   - Property scope: All accessible **or** multi-select properties
   - Optional expiry and rate limit
   - Presets: “Agent full”, “Integration (accounts+requests)”, “Read-only ops”
5. **Secret reveal once** after create/rotate — copy button + warning it will not be shown again.
6. **Key detail** — last used; optional recent audit blurbs; **enabled MCP tools preview** derived from current permissions so the admin sees what Cursor will get.

Edits via this UI take effect on the **next** REST/MCP request (no redeploy, no code change).

### 5.2 Out of scope for Dev UI

- Editing MCP server implementation
- Changing business rules of accounts/requests
- Non-admin self-service key creation (v1)

## 6. Data flow, security, errors

### 6.1 Auth flow

Every request: Bearer key → else session cookie → else anonymous.

### 6.2 MCP call flow

Client → `/mcp` with Bearer → tool invoke → permission + property check → shared
handler → structured result or error.

### 6.3 Security rules

- Hash secrets at rest; show raw secret once.
- Prefix is non-secret; full token is secret.
- MCP requires Bearer in v1.
- CORS remains locked to app origins for browsers; machine clients use Bearer, not cookies.
- Per-key rate limit to blunt abuse.
- Revoke is immediate.
- Property-scoped keys cannot read/write other properties.
- No permission bypass for keys.

### 6.4 Error semantics

| HTTP | Meaning |
|------|---------|
| 401 | Missing/invalid/revoked/expired key or session |
| 403 | Missing permission or property out of scope |
| 404 | Resource missing or not visible in scope (match existing behavior) |
| 429 | Rate limited |

MCP tools map to structured `{ ok: false, error, code }` using the same codes so
agents can recover cleanly.

## 7. v1 surface (hard cap)

| Capability | REST | MCP tool (illustrative names) |
|------------|------|-------------------------------|
| Health / readiness | `GET /api/health` | `health_check` |
| Who am I / scopes | `GET /api/auth/whoami` | `whoami` |
| Properties list | existing properties list | `list_properties` |
| Accounts search/CRUD | existing accounts routes | `search_accounts`, `get_account`, `create_account`, `update_account`, `delete_account` |
| Requests search/CRUD | existing reqs routes | `search_requests`, `get_request`, `create_request`, `update_request`, `delete_request` |
| Promotions read | existing promotions GET | `list_promotions`, `get_promotion` |
| KPI snapshot | `GET /api/ops/kpi-snapshot` | `get_kpi_snapshot` |
| Key admin | `/api/api-keys` (+ Settings Dev UI) | optional later `list_api_keys`; not required in v1 MCP |

### 7.1 Explicitly out of v1 (designed for later expansion)

CRM cards/tasks, contracts, ledger writes, users admin via MCP, chat/presence,
uploads, full Dashboard Hub parity tools, and any remaining routers until
near-total coverage.

Expansion rule: for each new router domain, (1) ensure dual-auth works,
(2) add matching MCP tools, (3) add permission checkboxes/presets on Dev UI.

## 8. Testing

Extend existing pytest / TestClient style (`test_api_full` patterns):

- Cookie auth still works on protected routes.
- Bearer key works on the same routes.
- Missing write permission → 403.
- Property-scoped key cannot access another property.
- Revoked / expired key → 401.
- KPI snapshot returns a stable shape for fixture data.
- Promotions are read-only via key (writes denied if not granted).
- MCP: v1 tools listed; one happy-path tool call; one permission-denied tool call.
- Dev API: create → patch permissions → rotate → revoke lifecycle.

Manual smoke: create scoped key in Settings → Dev → configure Cursor MCP to
`/mcp` → create account + request → confirm in UI → revoke → tools fail.

## 9. Implementation notes (for the plan)

- Prefer extending `dependencies.py` / middleware once over per-router auth forks.
- Prefer thin MCP tool wrappers over duplicated business logic.
- Settings Dev tab should match existing admin tab patterns in `Settings.tsx`
  (colors/theme tokens already used there).
- Document Cursor MCP remote config snippet in README or Dev page help text.
- After code lands, run `graphify update .`.

## 10. Success criteria

1. Admin can create a scoped API key entirely from **Settings → Dev**.
2. Another system can create an account and a request with that key over REST.
3. Cursor can connect to remote `/mcp` with the same key and perform the v1 tools.
4. Changing permissions or property scope in Dev takes effect without code changes.
5. Revoking a key immediately blocks REST and MCP.
6. Health + KPI snapshot are available to authorized keys/agents.
7. Existing browser cookie sessions remain unaffected.
