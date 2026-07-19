"""GET /api/users/{id} tenant isolation (plan 038): non-admins must not read cross-tenant users."""
import json
import secrets
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from main import app
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


@pytest.fixture
def user_get_authz_fixtures():
    """Home property + foreign property + scoped non-admin + same-tenant peer + foreign user."""
    home_pid = _any_property_id()
    other_pid = f"PZ_UGET_{uuid.uuid4().hex[:8]}"
    caller_uid = f"U-uget-caller-{uuid.uuid4().hex[:8]}"
    peer_uid = f"U-uget-peer-{uuid.uuid4().hex[:8]}"
    foreign_uid = f"U-uget-foreign-{uuid.uuid4().hex[:8]}"
    caller_user = f"uget_caller_{secrets.token_hex(4)}"
    peer_user = f"uget_peer_{secrets.token_hex(4)}"
    foreign_user = f"uget_foreign_{secrets.token_hex(4)}"
    caller_pw = f"Caller@{secrets.token_hex(6)}"
    peer_pw = f"Peer@{secrets.token_hex(6)}"
    foreign_pw = f"Foreign@{secrets.token_hex(6)}"

    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO properties (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;",
                (other_pid, "User-get authz foreign"),
            )
            for uid, username, password, name, pid in (
                (caller_uid, caller_user, caller_pw, "UGet Caller", home_pid),
                (peer_uid, peer_user, peer_pw, "UGet Peer", home_pid),
                (foreign_uid, foreign_user, foreign_pw, "UGet Foreign", other_pid),
            ):
                cur.execute(
                    """
                    INSERT INTO users (id, username, password, name, role, status, property_id,
                                       assigned_property_ids, session_version)
                    VALUES (%s, %s, %s, %s, 'Sales Manager', 'active', %s, %s::jsonb, 0)
                    """,
                    (
                        uid,
                        username,
                        hash_password(password),
                        name,
                        pid,
                        json.dumps([pid]),
                    ),
                )
        conn.commit()
    finally:
        conn.close()

    try:
        yield {
            "home_pid": home_pid,
            "other_pid": other_pid,
            "caller_uid": caller_uid,
            "peer_uid": peer_uid,
            "foreign_uid": foreign_uid,
            "caller_user": caller_user,
            "caller_pw": caller_pw,
        }
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM users WHERE id = ANY(%s);",
                    ([caller_uid, peer_uid, foreign_uid],),
                )
                cur.execute("DELETE FROM properties WHERE id = %s;", (other_pid,))
            conn.commit()
        finally:
            conn.close()


def _session_cookie(username: str, password: str) -> str:
    r = client.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    raw = r.headers.get("set-cookie") or ""
    return raw.split(";")[0]


def test_non_admin_cross_tenant_get_user_returns_404(user_get_authz_fixtures):
    fx = user_get_authz_fixtures
    cookie = _session_cookie(fx["caller_user"], fx["caller_pw"])
    headers = {"Cookie": cookie}

    r = client.get(f"/api/users/{fx['foreign_uid']}", headers=headers)
    assert r.status_code == 404, r.text
    assert r.json().get("detail") == "User not found"


def test_non_admin_same_tenant_get_user_returns_200(user_get_authz_fixtures):
    fx = user_get_authz_fixtures
    cookie = _session_cookie(fx["caller_user"], fx["caller_pw"])
    headers = {"Cookie": cookie}

    r = client.get(f"/api/users/{fx['peer_uid']}", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert str(body.get("id")) == fx["peer_uid"]
    assert fx["home_pid"] in (body.get("property_ids") or [])


def test_admin_can_get_cross_tenant_user(user_get_authz_fixtures):
    fx = user_get_authz_fixtures
    admin_uid = f"U-uget-admin-{uuid.uuid4().hex[:8]}"
    admin_user = f"uget_admin_{secrets.token_hex(4)}"
    admin_pw = f"Admin@{secrets.token_hex(6)}"

    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (id, username, password, name, role, status, property_id,
                                   assigned_property_ids, session_version)
                VALUES (%s, %s, %s, %s, 'Admin', 'active', %s, %s::jsonb, 0)
                """,
                (
                    admin_uid,
                    admin_user,
                    hash_password(admin_pw),
                    "UGet Admin",
                    fx["home_pid"],
                    json.dumps([fx["home_pid"]]),
                ),
            )
        conn.commit()
    finally:
        conn.close()

    try:
        cookie = _session_cookie(admin_user, admin_pw)
        headers = {"Cookie": cookie}
        r = client.get(f"/api/users/{fx['foreign_uid']}", headers=headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert str(body.get("id")) == fx["foreign_uid"]
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s;", (admin_uid,))
            conn.commit()
        finally:
            conn.close()
