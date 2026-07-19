"""Account rate periods API (plan 037): CRUD + accountId filter + tenant write guard."""
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
            cur.execute("SELECT to_regclass('public.account_rates') AS t;")
            row = cur.fetchone()
    return bool(row and row.get("t"))


@pytest.fixture
def rates_fixtures():
    if not _table_ready():
        pytest.skip("account_rates table missing — run migrations/011_account_rates.py")

    home_pid = _any_property_id()
    other_pid = f"PZ_AR_{uuid.uuid4().hex[:8]}"
    uid = f"U-ar-{uuid.uuid4().hex[:10]}"
    username = f"ar_authz_{secrets.token_hex(4)}"
    password = f"Rates@{secrets.token_hex(6)}"
    account_id = f"A-ar-{uuid.uuid4().hex[:8]}"
    foreign_account_id = f"A-arx-{uuid.uuid4().hex[:8]}"

    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO properties (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;",
                (other_pid, "Account rates foreign"),
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
                    "Rates Authz",
                    home_pid,
                    json.dumps([home_pid]),
                ),
            )
            cur.execute(
                """
                INSERT INTO accounts (id, name, property_id, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (id) DO UPDATE SET property_id = EXCLUDED.property_id;
                """,
                (account_id, "Rates Test Account", home_pid),
            )
            cur.execute(
                """
                INSERT INTO accounts (id, name, property_id, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (id) DO UPDATE SET property_id = EXCLUDED.property_id;
                """,
                (foreign_account_id, "Foreign Rates Account", other_pid),
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
            "account_id": account_id,
            "foreign_account_id": foreign_account_id,
        }
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM account_rates WHERE account_id IN (%s, %s);", (account_id, foreign_account_id))
                cur.execute("DELETE FROM accounts WHERE id IN (%s, %s);", (account_id, foreign_account_id))
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


def test_account_rates_crud_and_filter(rates_fixtures):
    fx = rates_fixtures
    cookie = _session_cookie(fx["username"], fx["password"])
    headers = {"Cookie": cookie, "Content-Type": "application/json"}
    rate_id = f"AR-{uuid.uuid4().hex[:8]}"

    payload = {
        "id": rate_id,
        "propertyId": fx["home_pid"],
        "accountId": fx["account_id"],
        "startDate": "2026-06-01",
        "endDate": "2026-06-30",
        "segments": ["Corporate"],
        "rows": [{"id": "r1", "roomType": "Standard", "occupancy": "Single", "rate": 420}],
    }
    r = client.post("/api/account-rates", headers=headers, json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("id") == rate_id
    assert body.get("accountId") == fx["account_id"]

    listed = client.get(
        f"/api/account-rates?propertyId={fx['home_pid']}&accountId={fx['account_id']}",
        headers={"Cookie": cookie},
    )
    assert listed.status_code == 200
    rows = listed.json()
    assert isinstance(rows, list)
    assert any(str(x.get("id")) == rate_id for x in rows)

    other_acc = client.get(
        f"/api/account-rates?propertyId={fx['home_pid']}&accountId={fx['foreign_account_id']}",
        headers={"Cookie": cookie},
    )
    assert other_acc.status_code == 200
    assert not any(str(x.get("id")) == rate_id for x in other_acc.json())

    d = client.delete(
        f"/api/account-rates/{rate_id}?propertyId={fx['home_pid']}",
        headers={"Cookie": cookie},
    )
    assert d.status_code == 200, d.text


def test_scoped_user_cannot_upsert_foreign_account_rate(rates_fixtures):
    fx = rates_fixtures
    cookie = _session_cookie(fx["username"], fx["password"])
    headers = {"Cookie": cookie, "Content-Type": "application/json"}
    rate_id = f"AR-fx-{uuid.uuid4().hex[:8]}"

    # Seed a foreign-property rate row directly.
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO account_rates (id, property_id, account_id, start_date, end_date, segments, payload, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, NOW())
                ON CONFLICT (id) DO UPDATE SET property_id = EXCLUDED.property_id, payload = EXCLUDED.payload;
                """,
                (
                    rate_id,
                    fx["other_pid"],
                    fx["foreign_account_id"],
                    "2026-01-01",
                    "2026-12-31",
                    json.dumps(["Corporate"]),
                    json.dumps(
                        {
                            "id": rate_id,
                            "propertyId": fx["other_pid"],
                            "accountId": fx["foreign_account_id"],
                            "startDate": "2026-01-01",
                            "endDate": "2026-12-31",
                            "segments": ["Corporate"],
                            "rows": [],
                        }
                    ),
                ),
            )
        conn.commit()

    try:
        r = client.post(
            "/api/account-rates",
            headers=headers,
            json={
                "id": rate_id,
                "propertyId": fx["home_pid"],
                "accountId": fx["account_id"],
                "startDate": "2026-01-01",
                "endDate": "2026-12-31",
                "segments": ["Corporate"],
                "rows": [],
            },
        )
        assert r.status_code == 403, r.text
    finally:
        with psycopg.connect(get_database_url()) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM account_rates WHERE id = %s;", (rate_id,))
            conn.commit()
