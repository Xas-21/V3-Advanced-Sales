"""Proforma issue: unique invoice number per property, PO patch, re-issue keeps the number."""
import json
import re
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
INVOICE_RE = re.compile(r"^[A-Z]\d{7}$")


def _column_ready() -> bool:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'requests' AND column_name = 'proforma';
                """
            )
            return cur.fetchone() is not None


def _any_property_id() -> str:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM properties ORDER BY id ASC LIMIT 1;")
            row = cur.fetchone()
    if not row:
        pytest.skip("no properties in database")
    return str(row["id"])


@pytest.fixture
def proforma_fixtures():
    if not _column_ready():
        pytest.skip("requests.proforma missing — run migrations/021_request_proforma.sql")

    home_pid = _any_property_id()
    other_pid = f"PZ_PF_{uuid.uuid4().hex[:8]}"
    uid = f"U-pf-{uuid.uuid4().hex[:10]}"
    username = f"pf_authz_{secrets.token_hex(4)}"
    password = f"Proforma@{secrets.token_hex(6)}"
    req_a = f"R-pf-{uuid.uuid4().hex[:8]}"
    req_b = f"R-pfb-{uuid.uuid4().hex[:8]}"
    req_other = f"R-pfx-{uuid.uuid4().hex[:8]}"

    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO properties (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;",
                (other_pid, "Proforma foreign"),
            )
            cur.execute(
                """
                INSERT INTO users (id, username, password, name, role, status, property_id,
                                   assigned_property_ids, session_version)
                VALUES (%s, %s, %s, %s, 'Sales Manager', 'active', %s, %s::jsonb, 0)
                """,
                (uid, username, hash_password(password), "Proforma User", home_pid, json.dumps([home_pid])),
            )
            for rid, pid in ((req_a, home_pid), (req_b, home_pid), (req_other, other_pid)):
                cur.execute(
                    """
                    INSERT INTO requests (id, property_id, request_name, created_at, updated_at)
                    VALUES (%s, %s, %s, NOW(), NOW())
                    """,
                    (rid, pid, "Proforma test"),
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
            "req_a": req_a,
            "req_b": req_b,
            "req_other": req_other,
        }
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM requests WHERE id IN (%s, %s, %s);", (req_a, req_b, req_other))
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


def test_proforma_issue_unique_and_po(proforma_fixtures):
    fx = proforma_fixtures
    cookie = _session_cookie(fx["username"], fx["password"])
    headers = {"Cookie": cookie, "Content-Type": "application/json"}

    first = client.post(
        f"/api/requests/{fx['req_a']}/proforma/issue",
        headers=headers,
        json={"poNumber": "PO-1", "fingerprint": "fp-a", "issuedOn": "2026-09-29"},
    )
    assert first.status_code == 200, first.text
    doc = first.json()
    assert INVOICE_RE.match(str(doc.get("invoiceNumber") or ""))
    assert doc.get("poNumber") == "PO-1"
    number = doc["invoiceNumber"]

    again = client.post(
        f"/api/requests/{fx['req_a']}/proforma/issue",
        headers=headers,
        json={"poNumber": "SHOULD-NOT-WIN", "fingerprint": "fp-a2", "issuedOn": "2026-09-30"},
    )
    assert again.status_code == 200, again.text
    assert again.json().get("invoiceNumber") == number
    assert again.json().get("poNumber") == "PO-1"

    second = client.post(
        f"/api/requests/{fx['req_b']}/proforma/issue",
        headers=headers,
        json={"poNumber": "", "fingerprint": "fp-b", "issuedOn": "2026-09-29"},
    )
    assert second.status_code == 200, second.text
    assert second.json().get("invoiceNumber") != number
    assert INVOICE_RE.match(str(second.json().get("invoiceNumber") or ""))

    po = client.post(
        f"/api/requests/{fx['req_a']}/proforma/po",
        headers=headers,
        json={"poNumber": "PO-9"},
    )
    assert po.status_code == 200, po.text
    assert po.json().get("invoiceNumber") == number
    assert po.json().get("poNumber") == "PO-9"
    assert po.json().get("issuedOn") == "2026-09-29"

    reissue = client.post(
        f"/api/requests/{fx['req_a']}/proforma/reissue",
        headers=headers,
        json={"fingerprint": "fp-new", "issuedOn": "2026-10-01"},
    )
    assert reissue.status_code == 200, reissue.text
    assert reissue.json().get("invoiceNumber") == number
    assert reissue.json().get("issuedOn") == "2026-10-01"
    assert reissue.json().get("poNumber") == "PO-9"

    foreign = client.post(
        f"/api/requests/{fx['req_other']}/proforma/issue",
        headers=headers,
        json={"fingerprint": "x", "issuedOn": "2026-09-29"},
    )
    assert foreign.status_code == 403
