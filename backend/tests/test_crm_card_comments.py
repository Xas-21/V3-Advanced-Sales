"""CRM kanban card comments API: cap 5, target scope, any-user delete."""
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


def _table_ready() -> bool:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.crm_card_comments') AS t;")
            row = cur.fetchone()
    return bool(row and row.get("t"))


@pytest.fixture
def comments_fixtures():
    if not _table_ready():
        pytest.skip("crm_card_comments table missing — run migrations/013_crm_card_comments.py")

    home_pid = _any_property_id()
    uid = f"U-cc-{uuid.uuid4().hex[:10]}"
    uid2 = f"U-cc2-{uuid.uuid4().hex[:10]}"
    username = f"cc_user_{secrets.token_hex(4)}"
    username2 = f"cc_user2_{secrets.token_hex(4)}"
    password = f"Cc@{secrets.token_hex(6)}"
    password2 = f"Cc2@{secrets.token_hex(6)}"
    req_id = f"R-cc-{uuid.uuid4().hex[:8]}"
    acc_id = f"A-cc-{uuid.uuid4().hex[:8]}"

    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            for u, uname, pwd, name in (
                (uid, username, password, "Commenter One"),
                (uid2, username2, password2, "Commenter Two"),
            ):
                cur.execute(
                    """
                    INSERT INTO users (id, username, password, name, role, status, property_id,
                                       assigned_property_ids, session_version)
                    VALUES (%s, %s, %s, %s, 'Sales Manager', 'active', %s, %s::jsonb, 0)
                    """,
                    (u, uname, hash_password(pwd), name, home_pid, json.dumps([home_pid])),
                )
        conn.commit()
    finally:
        conn.close()

    try:
        yield {
            "home_pid": home_pid,
            "username": username,
            "password": password,
            "username2": username2,
            "password2": password2,
            "req_id": req_id,
            "acc_id": acc_id,
        }
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM crm_card_comments WHERE property_id = %s AND target_id IN (%s, %s);",
                    (home_pid, req_id, acc_id),
                )
                cur.execute("DELETE FROM users WHERE id IN (%s, %s);", (uid, uid2))
            conn.commit()
        finally:
            conn.close()


def _session_cookie(username: str, password: str) -> str:
    r = client.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    raw = r.headers.get("set-cookie") or ""
    return raw.split(";")[0]


def test_create_list_cap_and_scope(comments_fixtures):
    fx = comments_fixtures
    cookie = _session_cookie(fx["username"], fx["password"])
    pid = fx["home_pid"]
    headers = {"Cookie": cookie}

    created_ids = []
    for i in range(5):
        r = client.post(
            "/api/crm/card-comments",
            headers=headers,
            json={
                "propertyId": pid,
                "targetType": "request",
                "targetId": fx["req_id"],
                "body": f"note {i}",
            },
        )
        assert r.status_code == 200, r.text
        created_ids.append(r.json()["id"])

    r6 = client.post(
        "/api/crm/card-comments",
        headers=headers,
        json={
            "propertyId": pid,
            "targetType": "request",
            "targetId": fx["req_id"],
            "body": "overflow",
        },
    )
    assert r6.status_code == 400

    # Account target is an independent bucket
    r_acc = client.post(
        "/api/crm/card-comments",
        headers=headers,
        json={
            "propertyId": pid,
            "targetType": "account",
            "targetId": fx["acc_id"],
            "body": "account note",
        },
    )
    assert r_acc.status_code == 200, r_acc.text

    r_list_req = client.get(
        "/api/crm/card-comments",
        headers=headers,
        params={"propertyId": pid, "targetType": "request", "targetId": fx["req_id"]},
    )
    assert r_list_req.status_code == 200
    req_items = r_list_req.json()
    assert len(req_items) == 5
    assert all(x["targetType"] == "request" for x in req_items)
    # newest first
    assert req_items[0]["body"] == "note 4"

    r_list_acc = client.get(
        "/api/crm/card-comments",
        headers=headers,
        params={"propertyId": pid, "targetType": "account", "targetId": fx["acc_id"]},
    )
    assert len(r_list_acc.json()) == 1
    assert r_list_acc.json()[0]["body"] == "account note"


def test_any_user_can_delete(comments_fixtures):
    fx = comments_fixtures
    cookie1 = _session_cookie(fx["username"], fx["password"])
    cookie2 = _session_cookie(fx["username2"], fx["password2"])
    pid = fx["home_pid"]

    r = client.post(
        "/api/crm/card-comments",
        headers={"Cookie": cookie1},
        json={
            "propertyId": pid,
            "targetType": "request",
            "targetId": fx["req_id"],
            "body": "delete me",
        },
    )
    assert r.status_code == 200
    cid = r.json()["id"]

    d = client.delete(
        f"/api/crm/card-comments/{cid}",
        headers={"Cookie": cookie2},
        params={"propertyId": pid},
    )
    assert d.status_code == 200, d.text

    listed = client.get(
        "/api/crm/card-comments",
        headers={"Cookie": cookie1},
        params={"propertyId": pid, "targetType": "request", "targetId": fx["req_id"]},
    ).json()
    assert all(x["id"] != cid for x in listed)


def test_reject_empty_and_too_long(comments_fixtures):
    fx = comments_fixtures
    cookie = _session_cookie(fx["username"], fx["password"])
    headers = {"Cookie": cookie}
    pid = fx["home_pid"]
    base = {
        "propertyId": pid,
        "targetType": "request",
        "targetId": fx["req_id"],
    }
    assert client.post("/api/crm/card-comments", headers=headers, json={**base, "body": "   "}).status_code == 400
    assert client.post(
        "/api/crm/card-comments", headers=headers, json={**base, "body": "x" * 501}
    ).status_code == 400
