"""Rate plan CRUD (Rate Structure): property-scoped payload, same shape as promotions."""
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
            cur.execute("SELECT to_regclass('public.rate_plans') AS t;")
            row = cur.fetchone()
    return bool(row and row.get("t"))


@pytest.fixture
def rate_plan_fixtures():
    if not _table_ready():
        pytest.skip("rate_plans table missing — run migrations/020_rate_plans.sql")

    home_pid = _any_property_id()
    other_pid = f"PZ_RP_{uuid.uuid4().hex[:8]}"
    uid = f"U-rp-{uuid.uuid4().hex[:10]}"
    username = f"rp_authz_{secrets.token_hex(4)}"
    password = f"Plans@{secrets.token_hex(6)}"

    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO properties (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;",
                (other_pid, "Rate plans foreign"),
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
                    "Rate Plan Authz",
                    home_pid,
                    json.dumps([home_pid]),
                ),
            )
        conn.commit()
    finally:
        conn.close()

    try:
        yield {"home_pid": home_pid, "other_pid": other_pid, "username": username, "password": password}
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM rate_plans WHERE property_id IN (%s, %s);", (home_pid, other_pid))
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


def test_rate_plans_crud(rate_plan_fixtures):
    fx = rate_plan_fixtures
    cookie = _session_cookie(fx["username"], fx["password"])
    headers = {"Cookie": cookie, "Content-Type": "application/json"}
    plan_id = f"RP-{uuid.uuid4().hex[:8]}"
    payload = {
        "id": plan_id,
        "propertyId": fx["home_pid"],
        "code": "TO",
        "name": "Tour Operator",
        "periods": [
            {
                "id": "per-1",
                "startDate": "2026-06-01",
                "endDate": "2026-06-30",
                "lines": [
                    {"id": "ln-1", "roomType": "Deluxe", "mealPlan": "BB", "rates": {"Single": 450, "Double": None}}
                ],
            }
        ],
    }
    saved = client.post("/api/rate-plans", headers=headers, json=payload)
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body.get("code") == "TO"
    assert body.get("periods")[0]["lines"][0]["rates"]["Single"] == 450

    listed = client.get(f"/api/rate-plans?propertyId={fx['home_pid']}", headers={"Cookie": cookie})
    assert listed.status_code == 200
    assert any(str(row.get("id")) == plan_id for row in listed.json())

    foreign = client.post(
        "/api/rate-plans",
        headers=headers,
        json={"id": f"RP-fx-{uuid.uuid4().hex[:6]}", "propertyId": fx["other_pid"], "code": "X", "name": "Nope", "periods": []},
    )
    assert foreign.status_code == 403

    deleted = client.delete(
        f"/api/rate-plans/{plan_id}?propertyId={fx['home_pid']}",
        headers={"Cookie": cookie},
    )
    assert deleted.status_code == 200, deleted.text
