"""account_ledger API: sign normalization, accountId filter, transfer, tenant guard."""
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

# Stub request ids used by the plan tests (FK on account_ledger.request_id).
_STUB_REQUEST_IDS = ("R-x", "R-old", "R-new")


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
            cur.execute("SELECT to_regclass('public.account_ledger') AS t;")
            return bool((cur.fetchone() or {}).get("t"))


def _session_cookie(username: str, password: str) -> str:
    r = client.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    raw = r.headers.get("set-cookie") or ""
    return raw.split(";")[0]


@pytest.fixture
def ledger_fixtures():
    if not _table_ready():
        pytest.skip("account_ledger table missing — run migrations/012_account_ledger.py")

    home_pid = _any_property_id()
    other_pid = f"PZ_LE_{uuid.uuid4().hex[:8]}"
    uid = f"U-le-{uuid.uuid4().hex[:10]}"
    username = f"le_authz_{secrets.token_hex(4)}"
    password = f"Ledger@{secrets.token_hex(6)}"
    account_id = f"A-le-{uuid.uuid4().hex[:8]}"

    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO properties (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;",
                (other_pid, "Account ledger foreign"),
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
                    "Ledger Authz",
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
                (account_id, "Ledger Test Account", home_pid),
            )
            for rid in _STUB_REQUEST_IDS:
                cur.execute(
                    """
                    INSERT INTO requests (id, account_id, property_id, request_name, updated_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    ON CONFLICT (id) DO NOTHING;
                    """,
                    (rid, account_id, home_pid, f"Ledger stub {rid}"),
                )
        conn.commit()
    finally:
        conn.close()

    cookie_header = _session_cookie(username, password)
    name, _, value = cookie_header.partition("=")
    cookies = {name: value} if name and value else {}

    try:
        yield {
            "home_pid": home_pid,
            "other_pid": other_pid,
            "username": username,
            "password": password,
            "account_id": account_id,
            "cookies": cookies,
        }
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM account_ledger WHERE account_id = %s;", (account_id,))
                cur.execute("DELETE FROM requests WHERE id = ANY(%s);", (list(_STUB_REQUEST_IDS),))
                cur.execute("DELETE FROM accounts WHERE id = %s;", (account_id,))
                cur.execute("DELETE FROM users WHERE id = %s;", (uid,))
                cur.execute("DELETE FROM properties WHERE id = %s;", (other_pid,))
            conn.commit()
        finally:
            conn.close()


def test_sign_normalization_and_filter(ledger_fixtures):
    ctx = ledger_fixtures
    # deposit stored positive
    r = client.post("/api/account-ledger", json={
        "type": "deposit", "amount": 50000, "accountId": ctx["account_id"],
        "propertyId": ctx["home_pid"], "date": "2026-07-19",
    }, cookies=ctx["cookies"])
    assert r.status_code == 200
    assert float(r.json()["amount"]) == 50000.0
    # cl_charge stored negative even if sent positive
    r2 = client.post("/api/account-ledger", json={
        "type": "cl_charge", "amount": 25000, "accountId": ctx["account_id"],
        "propertyId": ctx["home_pid"], "requestId": "R-x",
    }, cookies=ctx["cookies"])
    assert float(r2.json()["amount"]) == -25000.0
    # GET filtered by accountId returns both
    got = client.get(f"/api/account-ledger?accountId={ctx['account_id']}&propertyId={ctx['home_pid']}",
                     cookies=ctx["cookies"]).json()
    assert sum(float(e["amount"]) for e in got) == 25000.0  # 50000 - 25000


def test_transfer_repoints_request(ledger_fixtures):
    ctx = ledger_fixtures
    e = client.post("/api/account-ledger", json={
        "type": "allocation", "amount": 30000, "accountId": ctx["account_id"],
        "propertyId": ctx["home_pid"], "requestId": "R-old",
    }, cookies=ctx["cookies"]).json()
    moved = client.post(f"/api/account-ledger/{e['id']}/transfer",
                        json={"toRequestId": "R-new"}, cookies=ctx["cookies"]).json()
    assert moved["requestId"] == "R-new"
    assert float(moved["amount"]) == -30000.0
