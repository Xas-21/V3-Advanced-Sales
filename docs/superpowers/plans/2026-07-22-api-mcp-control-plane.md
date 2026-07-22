# API + Remote MCP Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add scoped API keys, dual-auth REST (cookie or Bearer), Settings → Dev UI, KPI snapshot, and a remote MCP server at `/mcp` so agents and other systems can manage Advanced Sales with the same permission/property scopes.

**Architecture:** Extend the existing FastAPI app: middleware resolves Bearer API key first, else `as_session` cookie; both produce a request-scoped actor. Key CRUD is admin-only. MCP (Python `mcp` SDK, Streamable HTTP) mounts on the same process and calls the same data-access/router logic. Browser session behavior stays unchanged; API-key actors get explicit permission + property enforcement on the v1 surface.

**Tech Stack:** FastAPI, Postgres (`api_keys` table), bcrypt/HMAC hashing via existing `security.py` patterns, React/TS Settings UI, `mcp` Python SDK (Streamable HTTP), pytest TestClient, Vitest for any small frontend helpers.

**Spec:** `docs/superpowers/specs/2026-07-22-api-mcp-control-plane-design.md` (includes §0 post-approval adjustments from 2026-07-22 agent landings).

## Global Constraints

- Dual auth: `Authorization: Bearer <key>` **or** cookie `as_session`; MCP requires Bearer.
- Permission IDs must match `userPermissions.ts` (`nav.dashboard`, `mutate.operational`, `promotions.view`, `accounts.delete`, `requests.delete`, …). Never invent `view_dashboard`.
- KPI snapshot permission: `nav.dashboard`.
- Settings → Dev + `/api/api-keys*` are **admin-only** in v1 (`require_admin` / `isSystemAdmin`).
- v1 hard-cap only: health, whoami, properties list, accounts CRUD/search, requests CRUD/search, promotions **read**, KPI snapshot, key admin UI/API.
- API-key actors: enforce permissions + property scope server-side on v1 routes. Session users: keep current `require_user` router gate (do not re-permission the whole browser app in v1).
- Migration file: `backend/migrations/014_api_keys.py` (013 is crm comments).
- Prefer `SettingsDevPanel.tsx` over dumping UI into giant `Settings.tsx`.
- Mount MCP with lifespan (`mcp.session_manager.run()`); migrate `on_event` startup/shutdown into that lifespan.
- No separate gateway service. No MCP-only path that skips REST.
- After code changes: `graphify update .`
- Do not commit secrets; raw key shown once in UI only.
- Tests: `cd backend && pytest …` (or `npm run test:backend` from repo root when available).

## File map

| File | Responsibility |
|------|----------------|
| `backend/migrations/014_api_keys.py` | Create `api_keys` table |
| `backend/api_keys.py` | Hash/verify/create/list/patch/rotate/revoke; actor builder |
| `backend/dependencies.py` | Keep cookie deps; helpers that read actor from context |
| `backend/main.py` | Bearer-first middleware; lifespan; mount `/mcp`; include api-keys + ops routers |
| `backend/routers/api_keys.py` | Admin REST for keys |
| `backend/routers/auth.py` | `GET /api/auth/whoami` |
| `backend/routers/ops.py` | `GET /api/ops/kpi-snapshot` |
| `backend/key_authz.py` | v1 route permission map for `auth_method == "key"` |
| `backend/mcp_server.py` | FastMCP tools wrapping shared handlers |
| `backend/requirements.txt` | Add `mcp` package |
| `backend/tests/test_api_keys.py` | Key lifecycle + dual auth + scope tests |
| `backend/tests/test_mcp_tools.py` | MCP tool happy-path + deny |
| `SettingsDevPanel.tsx` | Dev tab UI |
| `Settings.tsx` | Fifth admin tab wiring only |
| `userPermissions.ts` | Export permission groups usable by Dev checkboxes (reuse labels) |

---

### Task 1: `api_keys` table + crypto helpers

**Files:**
- Create: `backend/migrations/014_api_keys.py`
- Create: `backend/api_keys.py`
- Create: `backend/tests/test_api_keys_crypto.py`
- Test: `backend/tests/test_api_keys_crypto.py`

**Interfaces:**
- Produces: `generate_api_key() -> tuple[raw_secret, prefix, key_hash]`
- Produces: `verify_raw_key(raw: str, key_hash: str) -> bool`
- Produces: `create_key(...)`, `get_key_by_prefix(prefix)`, `touch_last_used(key_id)`
- Secret format: `as_live_<8hex>_<32hex>` where prefix stored is `as_live_<8hex>`

- [ ] **Step 1: Write failing crypto tests**

```python
# backend/tests/test_api_keys_crypto.py
from api_keys import generate_api_key, verify_raw_key

def test_generate_and_verify_roundtrip():
    raw, prefix, hashed = generate_api_key()
    assert raw.startswith("as_live_")
    assert prefix.startswith("as_live_")
    assert verify_raw_key(raw, hashed) is True
    assert verify_raw_key(raw + "x", hashed) is False
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

```bash
cd backend && pytest tests/test_api_keys_crypto.py -v
```

Expected: `ModuleNotFoundError` or import error for `api_keys`.

- [ ] **Step 3: Add migration `014_api_keys.py`**

Mirror `013_crm_card_comments.py` style:

```python
STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS api_keys (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        key_prefix      TEXT NOT NULL UNIQUE,
        key_hash        TEXT NOT NULL,
        owner_user_id   TEXT NOT NULL,
        permissions     JSONB NOT NULL DEFAULT '[]'::jsonb,
        property_ids    JSONB,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        expires_at      TIMESTAMPTZ,
        rate_limit_rpm  INTEGER,
        last_used_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        revoked_at      TIMESTAMPTZ
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys (owner_user_id)",
    "CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (key_prefix)",
]
```

- [ ] **Step 4: Implement `backend/api_keys.py`**

```python
import hashlib
import hmac
import json
import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from security import get_session_secret
from utils import _get_pool

def generate_api_key() -> tuple[str, str, str]:
    body = secrets.token_hex(4)
    secret = secrets.token_hex(16)
    prefix = f"as_live_{body}"
    raw = f"{prefix}_{secret}"
    hashed = _hash_raw(raw)
    return raw, prefix, hashed

def _hash_raw(raw: str) -> str:
    # HMAC-SHA256 with SESSION_SECRET — verify is constant-time via compare_digest
    mac = hmac.new(get_session_secret().encode(), raw.encode(), hashlib.sha256).hexdigest()
    return mac

def verify_raw_key(raw: str, key_hash: str) -> bool:
    if not raw or not key_hash:
        return False
    return hmac.compare_digest(_hash_raw(raw), key_hash)
```

Also implement DB helpers: `insert_key`, `list_keys`, `get_by_prefix`, `update_key`, `revoke_key`, `rotate_key`, `actor_from_key_row(row) -> dict` with shape:

```python
{
  "id": f"apikey:{row['id']}",
  "username": f"key:{row['key_prefix']}",
  "name": row["name"],
  "role": "api_key",
  "status": "active",
  "propertyId": (row["property_ids"] or [None])[0] if row.get("property_ids") else None,
  "property_ids": row.get("property_ids") or [],
  "permissionGrants": row.get("permissions") or [],
  "permissionRevokes": [],
  "auth_method": "key",
  "api_key_id": row["id"],
  "sessionVersion": 0,
}
```

Property scope: if `property_ids` is null/empty, treat as **unrestricted within owner’s accessible properties** at enforcement time (see Task 3). Store empty list as “all properties” sentinel by using SQL `NULL` for all-access keys.

- [ ] **Step 5: Run migration against local/dev DB**

```bash
cd backend && python migrations/014_api_keys.py
```

- [ ] **Step 6: Re-run crypto tests — expect PASS**

```bash
cd backend && pytest tests/test_api_keys_crypto.py -v
```

- [ ] **Step 7: Commit**

```bash
git add backend/migrations/014_api_keys.py backend/api_keys.py backend/tests/test_api_keys_crypto.py
git commit -m "feat: add api_keys table and key hashing helpers"
```

---

### Task 2: Bearer-first middleware + whoami

**Files:**
- Modify: `backend/main.py` (auth middleware)
- Modify: `backend/auth_db.py` — add `has_permission` branch for `role == "api_key"` (grants only; never auto-admin)
- Modify: `backend/routers/auth.py` — add `GET /api/auth/whoami`
- Modify: `backend/tests/test_api_keys.py` (start file)
- Test: `backend/tests/test_api_keys.py`

**Interfaces:**
- Consumes: `api_keys.get_by_prefix` + `verify_raw_key`
- Produces: middleware sets actor via `set_current_user` before `require_user` runs
- Produces: `GET /api/auth/whoami` → `{ id, name, role, auth_method, permissions, property_ids, api_key_id? }`

- [ ] **Step 1: Write failing auth tests**

```python
# backend/tests/test_api_keys.py (new)
import secrets, uuid, json
import pytest
from fastapi.testclient import TestClient
from main import app
from security import hash_password
from utils import get_database_url
import psycopg
from api_keys import generate_api_key, _hash_raw  # or public insert helper

client = TestClient(app, base_url="https://testserver")
PROP_ID = os.environ.get("TEST_PROP_ID", "Psvnv5dahi")

# reuse / mirror test_admin fixture pattern from test_api_full.py

def test_bearer_key_reaches_whoami(test_admin_and_key):
    raw, meta = test_admin_and_key
    r = client.get("/api/auth/whoami", headers={"Authorization": f"Bearer {raw}"})
    assert r.status_code == 200
    body = r.json()
    assert body["auth_method"] == "key"
    assert "mutate.operational" in body["permissions"]
```

- [ ] **Step 2: Run — expect FAIL (404 whoami or 401)**

```bash
cd backend && pytest tests/test_api_keys.py::test_bearer_key_reaches_whoami -v
```

- [ ] **Step 3: Update middleware in `main.py`**

Replace cookie-only resolution with:

```python
async def auth_context_and_security_headers(request: Request, call_next):
    user = None
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        raw = auth.split(" ", 1)[1].strip()
        try:
            from api_keys import resolve_bearer_key
            user = resolve_bearer_key(raw)  # None if invalid/revoked/expired
        except Exception:
            user = None
    if user is None:
        token = request.cookies.get("as_session")
        try:
            user = resolve_session(token)
        except Exception:
            user = None
    set_current_user(user)
    try:
        response = await call_next(request)
    finally:
        set_current_user(None)
    # ... existing security headers ...
    return response
```

`resolve_bearer_key(raw)`:
1. Split prefix = raw.rsplit("_", 1)[0] if format valid (`as_live_<8hex>` is first two underscore segments — parse carefully: prefix is `as_live_<body>`, raw is `prefix + '_' + secret`).
2. Load row by `key_prefix`.
3. Reject if not active, expired, or hash mismatch.
4. `touch_last_used` (best-effort).
5. Return `actor_from_key_row(row)`.

- [ ] **Step 4: Fix `has_permission` for api_key role**

```python
def has_permission(user: dict, permission: str) -> bool:
    if user.get("auth_method") == "key" or user.get("role") == "api_key":
        grants = set(user.get("permissionGrants") or [])
        return permission in grants
    if user.get("role") in (ROLE_SUPER_ADMIN, ROLE_ADMIN):
        return True
    # also treat role case-insensitively for Admin:
    if str(user.get("role") or "").strip().lower() in ("super_admin", "admin"):
        return True
    ...
```

- [ ] **Step 5: Add whoami endpoint**

```python
@router.get("/auth/whoami")
def whoami(session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME)):
    user = require_user(session_id)
    return {
        "id": user.get("id"),
        "name": user.get("name"),
        "role": user.get("role"),
        "auth_method": user.get("auth_method") or "session",
        "permissions": list(user.get("permissionGrants") or []),
        "property_ids": list(user.get("property_ids") or []),
        "api_key_id": user.get("api_key_id"),
    }
```

Note: for session users, `permissionGrants` may be incomplete vs frontend role defaults — that is OK for v1 whoami; document it. For keys, grants are the full truth.

- [ ] **Step 6: Tests PASS + commit**

```bash
cd backend && pytest tests/test_api_keys.py -v
git add backend/main.py backend/auth_db.py backend/routers/auth.py backend/api_keys.py backend/tests/test_api_keys.py
git commit -m "feat: resolve Bearer API keys in auth middleware and add whoami"
```

---

### Task 3: Key admin REST + key-scoped authz on v1 routes

**Files:**
- Create: `backend/routers/api_keys.py`
- Create: `backend/key_authz.py`
- Modify: `backend/main.py` — `include_router(api_keys.router)`
- Modify: `backend/routers/accounts.py`, `reqs.py`, `promotions.py`, `properties.py` — call `enforce_key_authz` at start of handlers (or shared dependency)
- Modify: `backend/tests/test_api_keys.py`
- Test: `backend/tests/test_api_keys.py`

**Interfaces:**
- Produces REST:
  - `GET /api/api-keys`
  - `POST /api/api-keys` body `{ name, permissions[], property_ids|null, expires_at?, rate_limit_rpm? }` → `{ ...meta, secret }` once
  - `PATCH /api/api-keys/{id}`
  - `POST /api/api-keys/{id}/rotate` → new secret once
  - `POST /api/api-keys/{id}/revoke`
- Produces: `enforce_key_authz(action: str, property_id: Optional[str])` no-op for session users; for keys checks map + property

**Action → permission map (v1):**

| action | permission |
|--------|------------|
| `properties.list` | *(any authenticated key)* |
| `accounts.read` | `nav.accounts` **or** `mutate.operational` **or** `accounts.viewOnly` |
| `accounts.write` | `mutate.operational` (deny if only `accounts.viewOnly`) |
| `accounts.delete` | `accounts.delete` |
| `requests.read` | `nav.requests` **or** `mutate.operational` |
| `requests.write` | `mutate.operational` |
| `requests.delete` | `requests.delete` |
| `promotions.read` | `promotions.view` |
| `ops.kpi` | `nav.dashboard` |

Property rule for keys:
- If key `property_ids` is non-empty: request/account `propertyId` must be in that list.
- If null/empty: allow any property (admin-minted “all” key). Still subject to permission checks.

- [ ] **Step 1: Failing tests for create key + scoped deny**

```python
def test_create_list_revoke_key(test_admin):
    login = client.post("/api/login", json={...})
    cookies = login.cookies
    r = client.post("/api/api-keys", cookies=cookies, json={
        "name": "integ",
        "permissions": ["mutate.operational", "nav.accounts", "nav.requests"],
        "property_ids": [PROP_ID],
    })
    assert r.status_code == 200
    secret = r.json()["secret"]
    assert secret.startswith("as_live_")
    # scoped key cannot write without mutate — already has it
    r2 = client.post("/api/accounts", headers={"Authorization": f"Bearer {secret}"}, json={
        "id": f"A-test-{uuid.uuid4().hex[:8]}",
        "propertyId": PROP_ID,
        "name": "API Key Account",
    })
    assert r2.status_code == 200

def test_key_missing_permission_denied(test_admin):
    # create key with only promotions.view
    # POST /api/accounts → 403
```

- [ ] **Step 2: Implement router + `key_authz.py`**

```python
# key_authz.py
from fastapi import HTTPException
from dependencies import get_current_user_ctx
from auth_db import has_permission

def enforce_key_authz(action: str, property_id: str | None = None) -> None:
    user = get_current_user_ctx()
    if not user or user.get("auth_method") != "key":
        return
    # permission check via ACTION_MAP ...
    # property check via user["property_ids"]
```

Wire into accounts/reqs/promotions list/get/post/delete and properties list.

- [ ] **Step 3: Register router (admin-only endpoints use `require_admin`)**

- [ ] **Step 4: Tests PASS + commit**

```bash
cd backend && pytest tests/test_api_keys.py -v
git commit -m "feat: admin API key CRUD and key-scoped route authorization"
```

---

### Task 4: KPI snapshot endpoint

**Files:**
- Create: `backend/routers/ops.py`
- Modify: `backend/main.py` — include router with `_auth_required`
- Modify: `backend/tests/test_api_keys.py` or `test_ops_kpi.py`
- Test: `backend/tests/test_ops_kpi.py`

**Interfaces:**
- Produces: `GET /api/ops/kpi-snapshot?property_id=&from=&to=`
- Response shape (stable):

```json
{
  "property_id": "P…",
  "from": "2026-01-01",
  "to": "2026-07-22",
  "requests_by_status": {"Inquiry": 3, "Confirmed": 1},
  "accounts_total": 12,
  "revenue_total": 12345.0,
  "currency": null
}
```

Implementation: load `list_requests(property_id)` + `list_accounts(property_id)` via `data_access`; count statuses; sum a single revenue field already present on requests (use the same field the hub uses if obvious — e.g. `totalRevenue` / `grandTotal` / payload — pick one existing numeric and document it in the handler docstring; do not invent a parallel ledger).

Gate: `require_user` + `enforce_key_authz("ops.kpi", property_id)` + for keys require `nav.dashboard`.

- [ ] **Step 1: Failing test for shape + permission**

- [ ] **Step 2: Implement `ops.py`**

- [ ] **Step 3: PASS + commit**

```bash
git commit -m "feat: add ops KPI snapshot endpoint for API keys and agents"
```

---

### Task 5: Settings → Dev UI

**Files:**
- Create: `SettingsDevPanel.tsx`
- Modify: `Settings.tsx` — add tab `{ id: 'dev', label: 'Dev', icon: Code2 }` for `appIsAdmin`; render `<SettingsDevPanel colors={…} properties={properties} apiUrl={…} />`
- Reuse: `PERMISSION_LABELS` / `ALL_PERMISSION_IDS` / `USER_MODAL_SECTIONS` from `userPermissions.ts` for checkbox groups
- Optional small helper: `apiKeyPresets.ts` with Agent full / Integration / Read-only ops
- Test: manual smoke + optional Vitest for preset builder if extracted

**Interfaces:**
- Consumes: `/api/api-keys` CRUD with session cookie (`credentials: 'include'`) via existing `apiUrl()`
- Produces: UI to create/edit/rotate/revoke; copy MCP URL; show secret once

**UI requirements (from spec §5):**
1. Header “Developer access”
2. Connection strip: MCP URL `${origin}/mcp` (or backend API origin + `/mcp`), OpenAPI `/docs`, Cursor note
3. Keys table: name, prefix, status, last used, scope summary, permission count, Edit / Rotate / Revoke
4. Create/Edit modal: name, grouped permission checkboxes, property multi-select or “All properties”, optional expiry, presets
5. Secret reveal once with copy
6. Tools preview: derive enabled MCP tool names from permissions (static map in the panel)

- [ ] **Step 1: Add tab + empty panel renders for admin**

- [ ] **Step 2: Wire list/create/revoke against backend**

- [ ] **Step 3: Edit permissions/properties + rotate + presets**

- [ ] **Step 4: Manual check in Docker frontend — create key, copy secret, revoke**

- [ ] **Step 5: Commit**

```bash
git add Settings.tsx SettingsDevPanel.tsx apiKeyPresets.ts
git commit -m "feat: add Settings Dev tab for API key and MCP control"
```

**Merge note:** `Settings.tsx` was recently changed for taxonomy drag-reorder and profile property seeding (`dc966ce`). Rebase/merge carefully; only touch the `tabs` array and a `activeTab === 'dev'` branch.

---

### Task 6: Remote MCP server + v1 tools

**Files:**
- Create: `backend/mcp_server.py`
- Modify: `backend/requirements.txt` — add pinned `mcp` (check latest compatible with Python version in Docker; pin exact version after `pip index` / image Python)
- Modify: `backend/main.py` — lifespan + `app.mount("/mcp", …)`
- Create: `backend/tests/test_mcp_tools.py`
- Test: `backend/tests/test_mcp_tools.py`

**Interfaces:**
- Public URL: `https://<api-host>/mcp` with `streamable_http_path="/"` on the mounted app so path is `/mcp` not `/mcp/mcp`
- Auth: tools read Bearer from the ASGI scope / request headers (FastMCP auth hook or middleware already set context — prefer resolving Bearer again inside tool entry via a small `mcp_auth` helper that raises if missing)
- Tools (names exact):

| Tool | Permission / notes |
|------|--------------------|
| `health_check` | no user perms; may be unauthenticated **or** require any key — choose **require any valid key** for remote MCP consistency |
| `whoami` | any valid key |
| `list_properties` | any valid key |
| `search_accounts` | accounts.read |
| `get_account` | accounts.read |
| `create_account` | accounts.write |
| `update_account` | accounts.write |
| `delete_account` | accounts.delete |
| `search_requests` | requests.read |
| `get_request` | requests.read |
| `create_request` | requests.write |
| `update_request` | requests.write |
| `delete_request` | requests.delete |
| `list_promotions` | promotions.read |
| `get_promotion` | promotions.read |
| `get_kpi_snapshot` | ops.kpi |

Each tool calls `data_access` / existing functions directly (same as routers), then `enforce_key_authz`.

**Lifespan migration in `main.py`:**

```python
from contextlib import asynccontextmanager
from mcp_server import mcp, mcp_app

@asynccontextmanager
async def lifespan(app: FastAPI):
    if storage_mode() == "postgres":
        init_database()
    async with mcp.session_manager.run():
        yield
    close_database()

app = FastAPI(..., lifespan=lifespan)
# remove on_event startup/shutdown
app.mount("/mcp", mcp_app)  # mcp_app from streamable_http_app(streamable_http_path="/")
```

- [ ] **Step 1: Add dependency + minimal FastMCP app with `health_check`**

- [ ] **Step 2: Failing test — list tools / call health with Bearer**

Use MCP client test utilities if available; otherwise hit Streamable HTTP initialize+tools/list with httpx, or unit-test tool functions directly:

```python
def test_mcp_create_account_tool_respects_permissions(monkeypatch):
    # call underlying tool function with a fake key actor lacking mutate.operational → error
```

- [ ] **Step 3: Implement all v1 tools**

- [ ] **Step 4: PASS + commit**

```bash
git commit -m "feat: mount remote MCP server with v1 Advanced Sales tools"
```

---

### Task 7: Docs smoke + graphify + end-to-end checklist

**Files:**
- Modify: `README.md` or Dev panel help only (short “Connect Cursor” snippet) — prefer Dev panel text to avoid doc sprawl; one README subsection is OK
- Run: `graphify update .`

Cursor remote MCP config example (put in Dev panel):

```json
{
  "mcpServers": {
    "advanced-sales": {
      "url": "https://YOUR_API_HOST/mcp",
      "headers": {
        "Authorization": "Bearer as_live_…"
      }
    }
  }
}
```

- [ ] **Step 1: Manual E2E checklist**

1. Admin → Settings → Dev → create “Agent full” key (all v1 perms, all properties).
2. `curl -H "Authorization: Bearer …" https://api/api/auth/whoami`
3. Create account + request via REST with that key.
4. Point Cursor at `/mcp` with the key; run `get_kpi_snapshot` + `search_accounts`.
5. Revoke key in Dev → REST and MCP fail with 401.
6. Browser login still works with cookie (no regression).

- [ ] **Step 2: `graphify update .`**

- [ ] **Step 3: Commit docs/graphify if needed**

```bash
git commit -m "docs: document Advanced Sales remote MCP connection"
```

---

## Spec coverage checklist (self-review)

| Spec item | Task |
|-----------|------|
| Dual auth cookie \| Bearer | Task 2 |
| Scoped permissions + property_ids | Tasks 1, 3, 5 |
| Remote MCP `/mcp` | Task 6 |
| Settings Dev UI | Task 5 |
| v1 accounts/requests CRUD | Tasks 3, 6 |
| Promotions read | Tasks 3, 6 |
| KPI snapshot + health | Tasks 4, 6 |
| Key create/rotate/revoke | Tasks 3, 5 |
| Admin-only key admin | Tasks 3, 5 |
| Tests | Tasks 1–4, 6 |
| Near-total coverage later | Out of v1 — expansion rule in spec §7.1 |

## Placeholder scan

None intentional. Exact MCP package version must be pinned at Task 6 Step 1 against the Docker Python version (resolve then, do not leave “latest”).

## Type / name consistency

- Actor field: `auth_method: "key" | "session"`
- Table: `api_keys`
- Routes: `/api/api-keys`, `/api/auth/whoami`, `/api/ops/kpi-snapshot`, mount `/mcp`
- Tool names: as listed in Task 6 (stable; Dev UI preview must use the same strings)
