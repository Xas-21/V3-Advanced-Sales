"""Flat list tenant isolation (plan 005): non-admins must not read other properties' tasks/taxes/etc."""
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
def flat_authz_fixtures():
    """Home property (existing) + foreign property + scoped non-admin + foreign task."""
    home_pid = _any_property_id()
    other_pid = f"PZ_FLAT_{uuid.uuid4().hex[:8]}"
    uid = f"U-flat-{uuid.uuid4().hex[:10]}"
    username = f"flat_authz_{secrets.token_hex(4)}"
    password = f"Flat@{secrets.token_hex(6)}"
    task_id = f"TK-authz-{uuid.uuid4().hex[:8]}"

    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO properties (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;",
                (other_pid, "Flat authz foreign"),
            )
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
                    "Flat Authz",
                    home_pid,
                    json.dumps([home_pid]),
                ),
            )
            cur.execute(
                """
                INSERT INTO tasks (id, property_id, payload, updated_at)
                VALUES (
                    %s, %s,
                    %s::jsonb,
                    NOW()
                )
                ON CONFLICT (id) DO UPDATE SET property_id = EXCLUDED.property_id, payload = EXCLUDED.payload;
                """,
                (
                    task_id,
                    other_pid,
                    json.dumps(
                        {
                            "id": task_id,
                            "propertyId": other_pid,
                            "title": "FOREIGN TASK AUTHZ",
                            "status": "open",
                        }
                    ),
                ),
            )
        conn.commit()
    finally:
        conn.close()

    try:
        yield {
            "home_pid": home_pid,
            "other_pid": other_pid,
            "username": username,
            "password": password,
            "task_id": task_id,
        }
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM tasks WHERE id = %s;", (task_id,))
                cur.execute("DELETE FROM users WHERE id = %s;", (uid,))
                cur.execute("DELETE FROM properties WHERE id = %s;", (other_pid,))
            conn.commit()
        finally:
            conn.close()


def _session_cookie(username: str, password: str) -> str:
    r = client.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    raw = r.headers.get("set-cookie") or ""
    return raw.split(";")[0]


def test_scoped_user_cannot_list_foreign_property_tasks(flat_authz_fixtures):
    fx = flat_authz_fixtures
    cookie = _session_cookie(fx["username"], fx["password"])
    headers = {"Cookie": cookie}

    r = client.get(f"/api/tasks?propertyId={fx['other_pid']}", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert body == [] or all(str(t.get("propertyId") or "") != fx["other_pid"] for t in body)
    assert not any(str(t.get("id") or "") == fx["task_id"] for t in body)


def test_scoped_user_unscoped_tasks_omit_foreign(flat_authz_fixtures):
    fx = flat_authz_fixtures
    cookie = _session_cookie(fx["username"], fx["password"])
    headers = {"Cookie": cookie}

    r = client.get("/api/tasks", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert not any(str(t.get("id") or "") == fx["task_id"] for t in body)
    assert not any(str(t.get("propertyId") or "") == fx["other_pid"] for t in body)


def test_scoped_user_cannot_upsert_foreign_task_with_home_property(flat_authz_fixtures):
    """Plan 034: IDOR — overwrite foreign row by sending an allowed propertyId."""
    fx = flat_authz_fixtures
    cookie = _session_cookie(fx["username"], fx["password"])
    headers = {"Cookie": cookie, "Content-Type": "application/json"}

    r = client.post(
        "/api/tasks",
        headers=headers,
        json={
            "id": fx["task_id"],
            "propertyId": fx["home_pid"],
            "title": "HIJACK ATTEMPT",
            "status": "open",
        },
    )
    assert r.status_code == 403, r.text

    # Row must still belong to the foreign property.
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT property_id, payload FROM tasks WHERE id = %s;", (fx["task_id"],))
            row = cur.fetchone()
    assert row is not None
    assert str(row["property_id"]) == fx["other_pid"]
    payload = row["payload"] if isinstance(row["payload"], dict) else {}
    assert payload.get("title") == "FOREIGN TASK AUTHZ"


def test_scoped_user_can_create_task_on_home_property(flat_authz_fixtures):
    fx = flat_authz_fixtures
    cookie = _session_cookie(fx["username"], fx["password"])
    headers = {"Cookie": cookie, "Content-Type": "application/json"}
    new_id = f"TK-home-{uuid.uuid4().hex[:8]}"

    try:
        r = client.post(
            "/api/tasks",
            headers=headers,
            json={
                "id": new_id,
                "propertyId": fx["home_pid"],
                "title": "HOME TASK OK",
                "status": "open",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert str(body.get("id")) == new_id
        assert str(body.get("propertyId")) == fx["home_pid"]
    finally:
        with psycopg.connect(get_database_url()) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM tasks WHERE id = %s;", (new_id,))
            conn.commit()


def test_admin_can_upsert_foreign_property_task(flat_authz_fixtures):
    """Admins (unscoped) may still manage rows across properties."""
    fx = flat_authz_fixtures
    admin_uid = f"U-admin-{uuid.uuid4().hex[:10]}"
    admin_user = f"flat_admin_{secrets.token_hex(4)}"
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
                    "Flat Admin",
                    fx["home_pid"],
                    json.dumps([fx["home_pid"]]),
                ),
            )
        conn.commit()
    finally:
        conn.close()

    try:
        cookie = _session_cookie(admin_user, admin_pw)
        headers = {"Cookie": cookie, "Content-Type": "application/json"}
        r = client.post(
            "/api/tasks",
            headers=headers,
            json={
                "id": fx["task_id"],
                "propertyId": fx["other_pid"],
                "title": "ADMIN UPDATE OK",
                "status": "open",
            },
        )
        assert r.status_code == 200, r.text
        assert r.json().get("title") == "ADMIN UPDATE OK"
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                # Restore fixture title for other tests sharing the same DB row in parallel? 
                # Fixture cleans task at end; restore payload for clarity.
                cur.execute(
                    """
                    UPDATE tasks
                       SET payload = %s::jsonb
                     WHERE id = %s;
                    """,
                    (
                        json.dumps(
                            {
                                "id": fx["task_id"],
                                "propertyId": fx["other_pid"],
                                "title": "FOREIGN TASK AUTHZ",
                                "status": "open",
                            }
                        ),
                        fx["task_id"],
                    ),
                )
                cur.execute("DELETE FROM users WHERE id = %s;", (admin_uid,))
            conn.commit()
        finally:
            conn.close()
