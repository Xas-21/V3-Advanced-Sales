"""Plan 035: admin password-only update hardens + revokes sessions."""
import json
import secrets
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from main import app
from scripts.migrate_db_passwords import looks_like_bcrypt, migrate
from security import hash_password
from utils import get_database_url

client = TestClient(app, base_url="https://testserver")


def _any_property_id() -> str:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM properties ORDER BY id ASC LIMIT 1;")
            row = cur.fetchone()
    if not row:
        pytest.skip("no properties in database")
    return str(row["id"])


def _session_cookie(username: str, password: str) -> str:
    r = client.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    raw = r.headers.get("set-cookie") or ""
    return raw.split(";")[0]


@pytest.fixture
def admin_pw_fixtures():
    home_pid = _any_property_id()
    admin_uid = f"U-apw-a-{uuid.uuid4().hex[:8]}"
    target_uid = f"U-apw-t-{uuid.uuid4().hex[:8]}"
    admin_user = f"apw_admin_{secrets.token_hex(3)}"
    target_user = f"apw_target_{secrets.token_hex(3)}"
    admin_pw = f"Admin@{secrets.token_hex(6)}"
    target_pw = f"Target@{secrets.token_hex(6)}"

    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            for uid, username, password, role, name in (
                (admin_uid, admin_user, admin_pw, "Admin", "APW Admin"),
                (target_uid, target_user, target_pw, "Sales Manager", "APW Target"),
            ):
                cur.execute(
                    """
                    INSERT INTO users (id, username, password, name, role, status, property_id,
                                       assigned_property_ids, session_version)
                    VALUES (%s, %s, %s, %s, %s, 'active', %s, %s::jsonb, 0)
                    """,
                    (
                        uid,
                        username,
                        hash_password(password),
                        name,
                        role,
                        home_pid,
                        json.dumps([home_pid]),
                    ),
                )
        conn.commit()
    finally:
        conn.close()

    try:
        yield {
            "admin_uid": admin_uid,
            "target_uid": target_uid,
            "admin_user": admin_user,
            "target_user": target_user,
            "admin_pw": admin_pw,
            "target_pw": target_pw,
            "home_pid": home_pid,
        }
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM sessions WHERE user_id IN (%s, %s);", (admin_uid, target_uid))
                cur.execute("DELETE FROM users WHERE id IN (%s, %s);", (admin_uid, target_uid))
            conn.commit()
        finally:
            conn.close()


def test_admin_password_only_update_hashes_and_revokes_sessions(admin_pw_fixtures):
    fx = admin_pw_fixtures
    target_cookie = _session_cookie(fx["target_user"], fx["target_pw"])
    admin_cookie = _session_cookie(fx["admin_user"], fx["admin_pw"])
    new_pw = f"Reset@{secrets.token_hex(6)}"

    # Target session works before reset.
    r_me = client.get("/api/auth/me", headers={"Cookie": target_cookie})
    assert r_me.status_code == 200, r_me.text

    r = client.post(
        "/api/users",
        headers={"Cookie": admin_cookie, "Content-Type": "application/json"},
        json={
            "id": fx["target_uid"],
            "username": fx["target_user"],
            "password": new_pw,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("user", {}).get("id") == fx["target_uid"]
    assert int(body["user"].get("sessionVersion") or 0) >= 1

    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT password FROM users WHERE id = %s;", (fx["target_uid"],))
            row = cur.fetchone()
    assert row and looks_like_bcrypt(str(row["password"]))

    # Old session invalidated.
    r_stale = client.get("/api/auth/me", headers={"Cookie": target_cookie})
    assert r_stale.status_code == 401

    r_old = client.post("/api/login", json={"username": fx["target_user"], "password": fx["target_pw"]})
    assert r_old.status_code == 401

    r_new = client.post("/api/login", json={"username": fx["target_user"], "password": new_pw})
    assert r_new.status_code == 200, r_new.text


def test_admin_empty_update_returns_400(admin_pw_fixtures):
    fx = admin_pw_fixtures
    admin_cookie = _session_cookie(fx["admin_user"], fx["admin_pw"])
    r = client.post(
        "/api/users",
        headers={"Cookie": admin_cookie, "Content-Type": "application/json"},
        json={"id": fx["target_uid"], "notAField": "x", "password": ""},
    )
    assert r.status_code == 400
    assert "No updatable fields" in (r.json().get("detail") or "")


def test_admin_weak_password_rejected(admin_pw_fixtures):
    fx = admin_pw_fixtures
    admin_cookie = _session_cookie(fx["admin_user"], fx["admin_pw"])
    r = client.post(
        "/api/users",
        headers={"Cookie": admin_cookie, "Content-Type": "application/json"},
        json={"id": fx["target_uid"], "username": fx["target_user"], "password": "short"},
    )
    assert r.status_code == 400


def test_admin_password_update_with_settings_shaped_payload(admin_pw_fixtures):
    """Mirrors Settings edit-user modal: full row fields + password (8-char policy)."""
    fx = admin_pw_fixtures
    admin_cookie = _session_cookie(fx["admin_user"], fx["admin_pw"])
    new_pw = "Abcd@123"  # 8 chars, 3+ categories
    r = client.post(
        "/api/users",
        headers={"Cookie": admin_cookie, "Content-Type": "application/json"},
        json={
            "id": fx["target_uid"],
            "username": fx["target_user"],
            "name": "APW Target",
            "role": "Sales Manager",
            "status": "Active",
            "propertyId": fx["home_pid"],
            "permissionGrants": [],
            "permissionRevokes": [],
            "property_ids": [fx["home_pid"]],
            "isAdmin": False,
            "sessionVersion": 0,
            "password": new_pw,
        },
    )
    assert r.status_code == 200, r.text
    r_old = client.post("/api/login", json={"username": fx["target_user"], "password": fx["target_pw"]})
    assert r_old.status_code == 401
    r_new = client.post("/api/login", json={"username": fx["target_user"], "password": new_pw})
    assert r_new.status_code == 200, r_new.text


def test_migrate_db_passwords_dry_run_and_idempotent(admin_pw_fixtures):
    fx = admin_pw_fixtures
    # Inject one plaintext leftover; dry-run must not change it.
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET password = %s WHERE id = %s;",
                ("PlaintextLeftover9!", fx["target_uid"]),
            )
        conn.commit()

    n = migrate(dry_run=True)
    assert n >= 1
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT password FROM users WHERE id = %s;", (fx["target_uid"],))
            row = cur.fetchone()
    assert row["password"] == "PlaintextLeftover9!"

    n2 = migrate(dry_run=False)
    assert n2 >= 1
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT password FROM users WHERE id = %s;", (fx["target_uid"],))
            row = cur.fetchone()
    assert looks_like_bcrypt(str(row["password"]))

    n3 = migrate(dry_run=False)
    assert n3 == 0
