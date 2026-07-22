"""
Full API smoke + CRUD coverage using FastAPI TestClient (no tunnel, no live server).
Run from backend folder: pytest tests/ -v

NOTE: The AS backend is Postgres-only in production. This suite exercises the
relational data-access layer through the HTTP routers. Auth tests require a
real admin user; they are skipped automatically when the configured test user
is absent from the database (so the suite stays green in prod without faking
credentials).
"""
import os
import secrets

import pytest

from fastapi.testclient import TestClient

from main import app

client = TestClient(app, base_url="https://testserver")

# ---------------------------------------------------------------------------
# Auth test fixture: create a throwaway admin directly in the DB (bypassing the
# /api/users auth gate) so the auth tests actually run — exercising real
# session-cookie + change-password flows — instead of skipping. Uses a unique
# random password (never a hardcoded/fake prod credential). The user row is
# deleted in teardown. Does NOT touch the real "Abdullah" account.
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def test_admin():
    import psycopg
    import uuid
    from security import hash_password
    from utils import get_database_url

    username = f"pytest_auth_{secrets.token_hex(4)}"
    password = f"Pytest@{secrets.token_hex(6)}"
    uid = f"U-{uuid.uuid4().hex[:10]}"
    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO users (id, username, password, name, role, status, property_id, session_version)
                   VALUES (%s, %s, %s, %s, 'Admin', 'active', %s, 0)""",
                (uid, username, hash_password(password), "Pytest Auth", PROP_ID),
            )
        conn.commit()
    finally:
        conn.close()
    try:
        yield {"username": username, "password": password, "id": uid}
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s", (uid,))
            conn.commit()
        finally:
            conn.close()


# A property id known to exist in the normalized `properties` table (stable for GET filters).
PROP_ID = os.environ.get("TEST_PROP_ID", "Psvnv5dahi")


@pytest.fixture(scope="module", autouse=True)
def ensure_test_property():
    """Guarantee the PROP_ID property row exists so FK-dependent inserts (users,
    requests, accounts) succeed on a fresh database such as CI. On an existing
    DB (local/prod) where the row already exists this is a no-op, and it only
    deletes the row on teardown if this fixture created it — never a real one.
    Autouse so every test in this module has the property available."""
    import psycopg
    from utils import get_database_url

    created = False
    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM properties WHERE id = %s", (PROP_ID,))
            if cur.fetchone() is None:
                cur.execute(
                    "INSERT INTO properties (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
                    (PROP_ID, "Pytest Property"),
                )
                created = True
        conn.commit()
    finally:
        conn.close()
    try:
        yield PROP_ID
    finally:
        if created:
            # FK from users/requests/accounts -> properties is ON DELETE SET NULL,
            # so this delete is safe even if a test left rows referencing it.
            conn = psycopg.connect(get_database_url())
            try:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM properties WHERE id = %s", (PROP_ID,))
                conn.commit()
            finally:
                conn.close()


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"
    assert body.get("live") is True
    assert body.get("ready") is True
    assert "database_connected" in body
    assert body.get("storage_mode") in ("postgres", "unavailable")
    assert body.get("version")


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert "message" in r.json()


def test_login_cors_preflight_render_origin():
    # CORS is locked to the production origin; a preflight from an unlisted
    # origin must NOT be echoed back (security). Use the configured origin.
    allowed = os.getenv("CORS_ORIGINS", "https://app.as-saas.com").split(",")[0].strip()
    r = client.options(
        "/api/login",
        headers={
            "Origin": allowed,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == allowed


def test_login_cors_preflight_custom_domain(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://as-saas.com/")
    from importlib import reload
    import cors_middleware
    import main as main_mod

    reload(cors_middleware)
    reload(main_mod)
    c = TestClient(main_mod.app)
    r = c.options(
        "/api/login",
        headers={
            "Origin": "https://as-saas.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "https://as-saas.com"


def test_login_cors_preflight_custom_domain_www(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://as-saas.com")
    from importlib import reload
    import cors_middleware
    import main as main_mod

    reload(cors_middleware)
    reload(main_mod)
    c = TestClient(main_mod.app)
    r = c.options(
        "/api/login",
        headers={
            "Origin": "https://www.as-saas.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "https://www.as-saas.com"


def test_login_success_sets_cookie_and_user_shape(test_admin):
    r = client.post(
        "/api/login",
        json={"username": test_admin["username"], "password": test_admin["password"]},
    )
    assert r.status_code == 200
    data = r.json()
    assert "user" in data
    assert data["user"].get("username") == test_admin["username"]
    assert "password" not in data["user"]
    assert "sessionVersion" in data["user"]
    assert isinstance(data["user"].get("sessionVersion"), int)
    assert "as_session" in r.cookies


def test_change_password_then_login_with_new(test_admin):
    # Establish a session first (change-password requires an authenticated cookie).
    login = client.post(
        "/api/login",
        json={"username": test_admin["username"], "password": test_admin["password"]},
    )
    assert login.status_code == 200
    u = test_admin["username"]
    old_pw = test_admin["password"]
    new_pw = f"Pytest@new{secrets.token_hex(4)}"
    r_bad = client.post(
        "/api/auth/change-password",
        json={"username": u, "current_password": "wrong", "new_password": "aaaa"},
    )
    assert r_bad.status_code == 400

    r_ok = client.post(
        "/api/auth/change-password",
        json={"username": u, "current_password": old_pw, "new_password": new_pw},
    )
    assert r_ok.status_code == 200
    assert r_ok.json().get("ok") is True
    assert isinstance(r_ok.json().get("sessionVersion"), int)

    r_old = client.post("/api/login", json={"username": u, "password": old_pw})
    assert r_old.status_code == 401

    r_new = client.post("/api/login", json={"username": u, "password": new_pw})
    assert r_new.status_code == 200

    # Restore password so later tests / teardown stay consistent.
    r_restore = client.post(
        "/api/auth/change-password",
        json={"username": u, "current_password": new_pw, "new_password": old_pw},
    )
    assert r_restore.status_code == 200


def test_get_users(test_admin):
    # Authenticate as the throwaway admin (session cookie set by TestClient).
    client.post(
        "/api/login",
        json={"username": test_admin["username"], "password": test_admin["password"]},
    )
    r = client.get("/api/users")
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list)
    for u in users:
        assert "password" not in u
        assert "sessionVersion" in u
        assert isinstance(u.get("sessionVersion"), int)


def test_patch_user_property_id_preserves_session_version(test_admin):
    """Assigning property must not invalidate sessions (no password POST / no session bump)."""
    client.post(
        "/api/login",
        json={"username": test_admin["username"], "password": test_admin["password"]},
    )
    r = client.get("/api/users")
    assert r.status_code == 200
    users = r.json()
    u = next((x for x in users if str(x.get("username", "")).lower() == test_admin["username"].lower()), None)
    assert u and u.get("id")
    uid = str(u["id"])
    v0 = int(u.get("sessionVersion") or 0)
    pid = str(u.get("propertyId") or PROP_ID)
    r2 = client.patch(f"/api/users/{uid}", json={"assigned_property_ids": [pid]})
    assert r2.status_code == 200
    r3 = client.get("/api/users")
    u2 = next((x for x in r3.json() if str(x.get("id")) == uid), None)
    assert u2 is not None
    assert pid in (u2.get("property_ids") or [])
    assert int(u2.get("sessionVersion") or 0) == v0


def test_patch_user_permission_grants_bumps_session_version(test_admin):
    """Permission overrides must bump session_version so clients re-auth."""
    import psycopg
    import uuid
    from security import hash_password
    from utils import get_database_url

    client.post(
        "/api/login",
        json={"username": test_admin["username"], "password": test_admin["password"]},
    )
    uid = f"U-{uuid.uuid4().hex[:10]}"
    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO users (id, username, password, name, role, status, property_id,
                                      permission_grants, permission_revokes, session_version)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, 0)""",
                (
                    uid,
                    f"perm_bump_{secrets.token_hex(3)}",
                    hash_password(f"Pytest@{secrets.token_hex(6)}"),
                    "Perm Bump",
                    "General Manager",
                    "active",
                    PROP_ID,
                    '["mutate.operational"]',
                    "[]",
                ),
            )
        conn.commit()
    finally:
        conn.close()
    try:
        r = client.patch(
            f"/api/users/{uid}",
            json={"permissionGrants": ["accounts.viewOnly"]},
        )
        assert r.status_code == 200, r.text
        body = r.json().get("user") or {}
        assert body.get("permissionGrants") == ["accounts.viewOnly"]
        assert int(body.get("sessionVersion") or 0) == 1
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s", (uid,))
            conn.commit()
        finally:
            conn.close()


def test_login_invalid():
    r = client.post(
        "/api/login",
        json={"username": "Abdullah", "password": "wrong"},
    )
    assert r.status_code == 401
    assert "detail" in r.json()


def test_login_missing_password():
    r = client.post("/api/login", json={"username": "Abdullah"})
    # FastAPI validates the request body and returns 422 for a missing required field.
    assert r.status_code in (400, 422)
    assert "password" in str(r.json().get("detail", "")).lower()


def test_get_properties():
    r = client.get("/api/properties")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_rooms_filtered():
    r = client.get("/api/rooms", params={"propertyId": PROP_ID})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_venues_filtered():
    r = client.get("/api/venues", params={"propertyId": PROP_ID})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_taxes_filtered():
    r = client.get("/api/taxes", params={"propertyId": PROP_ID})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)


def test_get_financials_filtered():
    r = client.get("/api/financials", params={"propertyId": PROP_ID})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_requests_filtered():
    r = client.get("/api/requests", params={"propertyId": PROP_ID})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_accounts_filtered():
    r = client.get("/api/accounts", params={"propertyId": PROP_ID})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_crm_state():
    r = client.get("/api/crm-state", params={"propertyId": PROP_ID})
    assert r.status_code == 200
    data = r.json()
    assert data.get("propertyId") == PROP_ID
    assert "leads" in data


def test_requests_post_then_delete():
    payload = {
        "propertyId": PROP_ID,
        "type": "accommodation",
        "status": "draft",
        "guestName": "Pytest Guest",
    }
    r = client.post("/api/requests", json=payload)
    assert r.status_code == 200
    created = r.json()
    rid = created.get("id")
    assert rid
    d = client.delete(f"/api/requests/{rid}")
    assert d.status_code == 200


def test_requests_reject_id_collision_on_create():
    # Relational integrity: requests reference accounts via FK, so the test
    # creates the referenced accounts first (cleaned up afterwards).
    client.post(
        "/api/accounts",
        json={"id": "A_pytest_collision", "name": "Collision Acct", "propertyId": PROP_ID},
    )
    client.post(
        "/api/accounts",
        json={"id": "A_pytest_collision_other", "name": "Collision Acct Other", "propertyId": PROP_ID},
    )
    rid = "REQ_pytest_collision_guard"
    created_at = "2026-06-14T10:00:00+00:00"
    first = {
        "id": rid,
        "propertyId": PROP_ID,
        "requestName": "Collision Guard Original",
        "accountId": "A_pytest_collision",
        "confirmationNo": "CNF-COLLISION-1",
        "createdAt": created_at,
        "status": "Inquiry",
    }
    r1 = client.post("/api/requests", json=first)
    assert r1.status_code == 200
    try:
        clash = {
            "id": rid,
            "propertyId": PROP_ID,
            "requestName": "Collision Guard Replacement",
            "accountId": "A_pytest_collision_other",
            "confirmationNo": "CNF-COLLISION-2",
            "createdAt": "2026-06-15T10:00:00+00:00",
            "status": "Inquiry",
        }
        r2 = client.post("/api/requests", json=clash)
        assert r2.status_code == 409

        update = {
            **first,
            "requestName": "Collision Guard Updated",
            "status": "Tentative",
        }
        r3 = client.post("/api/requests", json=update)
        assert r3.status_code == 200
        assert r3.json().get("requestName") == "Collision Guard Updated"
    finally:
        client.delete(f"/api/requests/{rid}")
        client.delete("/api/accounts/A_pytest_collision")
        client.delete("/api/accounts/A_pytest_collision_other")


def test_crm_state_post_roundtrip():
    r_get = client.get("/api/crm-state", params={"propertyId": PROP_ID})
    assert r_get.status_code == 200
    prev = r_get.json()
    leads = prev.get("leads") or {}
    # minimal write: same structure back
    r_post = client.post(
        "/api/crm-state",
        json={
            "propertyId": PROP_ID,
            "leads": leads,
            "accountActivities": prev.get("accountActivities") or {},
        },
    )
    assert r_post.status_code == 200
    assert r_post.json().get("propertyId") == PROP_ID


def test_accounts_sync_roundtrip():
    baseline = client.get("/api/accounts", params={"propertyId": PROP_ID})
    assert baseline.status_code == 200
    prev = baseline.json() if isinstance(baseline.json(), list) else []

    temp_account = {
        "id": "A_pytest_sync",
        "name": "Pytest Shared Account",
        "propertyId": PROP_ID,
        "city": "Riyadh",
        "type": "Corporate",
        "contacts": [],
    }
    sync = client.put(
        "/api/accounts/sync",
        json={"propertyId": PROP_ID, "accounts": [*prev, temp_account]},
    )
    assert sync.status_code == 200
    assert sync.json().get("propertyId") == PROP_ID

    after = client.get("/api/accounts", params={"propertyId": PROP_ID})
    assert after.status_code == 200
    rows = after.json()
    assert any(str(a.get("id")) == "A_pytest_sync" for a in rows)

    restore = client.put(
        "/api/accounts/sync",
        json={"propertyId": PROP_ID, "accounts": prev, "allowClear": True},
    )
    assert restore.status_code == 200
