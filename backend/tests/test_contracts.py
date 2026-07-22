"""Plan 062: contract records API — create/list/delete, tenant scope, status filter."""
from __future__ import annotations

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
            cur.execute("SELECT to_regclass('public.contracts') AS t;")
            return bool((cur.fetchone() or {}).get("t"))


def _session_cookie(username: str, password: str) -> str:
    r = client.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    raw = r.headers.get("set-cookie") or ""
    return raw.split(";")[0]


@pytest.fixture
def contracts_fixtures():
    if not _table_ready():
        pytest.skip("contracts table missing — run migrations/018_contracts.sql")

    home_pid = _any_property_id()
    other_pid = f"PZ_CT_{uuid.uuid4().hex[:8]}"
    uid = f"U-ct-{uuid.uuid4().hex[:10]}"
    username = f"ct_authz_{secrets.token_hex(4)}"
    password = f"Contract@{secrets.token_hex(6)}"
    account_id = f"A-ct-{uuid.uuid4().hex[:8]}"
    contract_ids: list[str] = []

    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO properties (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;",
                (other_pid, "Contracts foreign property"),
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
                    "Contracts Authz",
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
                (account_id, "Contracts Test Account", home_pid),
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
            "contract_ids": contract_ids,
        }
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                if contract_ids:
                    cur.execute("DELETE FROM contracts WHERE id = ANY(%s);", (contract_ids,))
                cur.execute(
                    "DELETE FROM contracts WHERE property_id = %s OR account_id = %s;",
                    (home_pid, account_id),
                )
                # Only delete contracts we may have created under other_pid in negative tests
                cur.execute("DELETE FROM contracts WHERE property_id = %s;", (other_pid,))
                cur.execute("DELETE FROM accounts WHERE id = %s;", (account_id,))
                cur.execute("DELETE FROM users WHERE id = %s;", (uid,))
                cur.execute("DELETE FROM properties WHERE id = %s;", (other_pid,))
            conn.commit()
        finally:
            conn.close()


def test_create_list_delete_and_status_filter(contracts_fixtures):
    ctx = contracts_fixtures
    cid = f"ctr-test-{uuid.uuid4().hex[:10]}"
    ctx["contract_ids"].append(cid)

    created = client.post(
        "/api/contracts",
        json={
            "id": cid,
            "propertyId": ctx["home_pid"],
            "accountId": ctx["account_id"],
            "templateId": "tpl-x",
            "templateName": "Rate Agreement",
            "status": "Signed",
            "agreementFileName": "acme-rate",
            "fieldValues": {"Company Name": "Acme"},
            "outputType": "word",
            "startDate": "2026-01-01",
            "endDate": "2026-12-31",
            "termNumber": 1,
            "createdBy": "Tester",
        },
        cookies=ctx["cookies"],
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["id"] == cid
    assert body["status"] == "Signed"
    assert body["fieldValues"]["Company Name"] == "Acme"

    listed = client.get(
        f"/api/contracts?propertyId={ctx['home_pid']}",
        cookies=ctx["cookies"],
    )
    assert listed.status_code == 200
    ids = {r["id"] for r in listed.json()}
    assert cid in ids

    signed_only = client.get(
        f"/api/contracts?propertyId={ctx['home_pid']}&status=signed",
        cookies=ctx["cookies"],
    )
    assert signed_only.status_code == 200
    signed_ids = {r["id"] for r in signed_only.json()}
    assert cid in signed_ids
    for r in signed_only.json():
        assert str(r.get("status") or "").lower() == "signed"

    generated_only = client.get(
        f"/api/contracts?propertyId={ctx['home_pid']}&status=generated",
        cookies=ctx["cookies"],
    )
    assert cid not in {r["id"] for r in generated_only.json()}

    deleted = client.delete(f"/api/contracts/{cid}", cookies=ctx["cookies"])
    assert deleted.status_code == 200
    after = client.get(
        f"/api/contracts?propertyId={ctx['home_pid']}",
        cookies=ctx["cookies"],
    ).json()
    assert cid not in {r["id"] for r in after}


def test_tenant_scope_blocks_foreign_property(contracts_fixtures):
    ctx = contracts_fixtures
    cid = f"ctr-foreign-{uuid.uuid4().hex[:10]}"
    ctx["contract_ids"].append(cid)

    denied = client.post(
        "/api/contracts",
        json={
            "id": cid,
            "propertyId": ctx["other_pid"],
            "templateId": "tpl-x",
            "templateName": "X",
            "status": "Generated",
            "fieldValues": {},
        },
        cookies=ctx["cookies"],
    )
    assert denied.status_code == 403, denied.text

    # Seed a foreign-property row directly, then ensure list does not leak it.
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO contracts (id, property_id, template_id, template_name, status, field_values)
                VALUES (%s, %s, 'tpl-y', 'Foreign', 'signed', '{}'::jsonb)
                ON CONFLICT (id) DO NOTHING;
                """,
                (cid, ctx["other_pid"]),
            )
        conn.commit()

    listed = client.get(
        f"/api/contracts?propertyId={ctx['other_pid']}",
        cookies=ctx["cookies"],
    )
    assert listed.status_code == 200
    assert cid not in {r["id"] for r in listed.json()}
