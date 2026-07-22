"""Plan 060: CRM normalized tables round-trip (zero-loss) + stage-map parity."""
import json
import secrets
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from crm_recovery import STAGE_FROM_REQUEST, stage_from_request_status
from main import app
from security import hash_password
from utils import get_database_url

client = TestClient(app, base_url="https://testserver")

PIPELINE_KEYS = ["waiting", "qualified", "proposal", "negotiation", "won", "notInterested"]


def _tables_ready() -> bool:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.crm_sales_calls') AS a;")
            a = (cur.fetchone() or {}).get("a")
            cur.execute("SELECT to_regclass('public.crm_pipeline_cards') AS b;")
            b = (cur.fetchone() or {}).get("b")
    return bool(a and b)


def _session_cookie(username: str, password: str) -> dict:
    r = client.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    raw = r.headers.get("set-cookie") or ""
    name, _, value = raw.split(";")[0].partition("=")
    return {name: value} if name and value else {}


@pytest.fixture
def crm_norm_fixtures():
    if not _tables_ready():
        pytest.skip("crm normalize tables missing — apply migrations/014_crm_normalize.sql")

    # Dedicated property so teardown never touches a real hotel's CRM rows.
    home_pid = f"P-cn-{uuid.uuid4().hex[:8]}"
    uid = f"U-cn-{uuid.uuid4().hex[:10]}"
    username = f"cn_admin_{secrets.token_hex(4)}"
    password = f"CrmNorm@{secrets.token_hex(6)}"

    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO properties (id, name) VALUES (%s, %s);",
                (home_pid, "CRM normalize test property"),
            )
            cur.execute(
                """
                INSERT INTO users (id, username, password, name, role, status, property_id,
                                   assigned_property_ids, session_version)
                VALUES (%s, %s, %s, %s, 'Admin', 'active', %s, %s::jsonb, 0)
                """,
                (
                    uid,
                    username,
                    hash_password(password),
                    "CRM Norm Admin",
                    home_pid,
                    json.dumps([home_pid]),
                ),
            )
        conn.commit()
    finally:
        conn.close()

    cookies = _session_cookie(username, password)
    try:
        yield {"home_pid": home_pid, "cookies": cookies, "uid": uid}
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM crm_sales_calls WHERE property_id = %s;", (home_pid,))
                cur.execute("DELETE FROM crm_pipeline_cards WHERE property_id = %s;", (home_pid,))
                cur.execute("DELETE FROM crm_state WHERE property_id = %s;", (home_pid,))
                cur.execute("DELETE FROM users WHERE id = %s;", (uid,))
                cur.execute("DELETE FROM properties WHERE id = %s;", (home_pid,))
            conn.commit()
        finally:
            conn.close()


def test_stage_from_request_map_parity():
    """Canonical map: matches plan 060 / crmStateModel.ts STAGE_FROM_REQUEST."""
    assert STAGE_FROM_REQUEST == {
        "inquiry": "waiting",
        "draft": "waiting",
        "accepted": "proposal",
        "tentative": "negotiation",
        "definite": "won",
        "actual": "won",
        "cancelled": "notInterested",
        "lost": "notInterested",
    }
    assert stage_from_request_status("accepted") == "proposal"
    assert stage_from_request_status("inquiry") == "waiting"
    assert stage_from_request_status("draft") == "waiting"
    assert stage_from_request_status("no-such-status") == "qualified"


def test_crm_normalized_zero_loss_roundtrip(crm_norm_fixtures):
    pid = crm_norm_fixtures["home_pid"]
    cookies = crm_norm_fixtures["cookies"]
    unusual = f"unusualExtra_{uuid.uuid4().hex[:8]}"

    call_a = {
        "id": f"SC-rt-{uuid.uuid4().hex[:8]}",
        "subject": "Call A",
        "description": "first",
        unusual: {"keep": True, "n": 42},
    }
    call_b = {
        "id": f"SC-rt-{uuid.uuid4().hex[:8]}",
        "subject": "Call B",
    }
    card_waiting = {
        "id": f"PC-rt-{uuid.uuid4().hex[:8]}",
        "stage": "waiting",
        "company": "Wait Co",
        unusual: "survives-on-card",
    }
    card_proposal = {
        "id": f"PC-rt-{uuid.uuid4().hex[:8]}",
        "stage": "proposal",
        "company": "Prop Co",
        "value": 1200,
    }
    card_won = {
        "id": f"PC-rt-{uuid.uuid4().hex[:8]}",
        "stage": "won",
        "company": "Won Co",
    }

    block = {
        "propertyId": pid,
        "salesCalls": [call_a, call_b],
        "pipeline": {
            "waiting": [card_waiting],
            "qualified": [],
            "proposal": [card_proposal],
            "negotiation": [],
            "won": [card_won],
            "notInterested": [],
        },
        "accountActivities": {"acct-x": [{"id": "act-1", "note": "hi"}]},
    }

    r_post = client.post("/api/crm-state", json=block, cookies=cookies)
    assert r_post.status_code == 200, r_post.text
    body = r_post.json()
    assert body.get("propertyId") == pid
    assert "salesCalls" in body and "pipeline" in body and "accountActivities" in body

    r_get = client.get("/api/crm-state", params={"propertyId": pid}, cookies=cookies)
    assert r_get.status_code == 200, r_get.text
    got = r_get.json()

    assert len(got.get("salesCalls") or []) == 2
    found_a = next(c for c in got["salesCalls"] if c.get("id") == call_a["id"])
    assert found_a.get(unusual) == {"keep": True, "n": 42}
    assert found_a.get("subject") == "Call A"

    pipe = got.get("pipeline") or {}
    for k in PIPELINE_KEYS:
        assert k in pipe
    assert len(pipe["waiting"]) == 1
    assert len(pipe["proposal"]) == 1
    assert len(pipe["won"]) == 1
    assert pipe["waiting"][0].get(unusual) == "survives-on-card"
    assert pipe["waiting"][0].get("company") == "Wait Co"
    assert pipe["proposal"][0].get("id") == card_proposal["id"]
    assert (got.get("accountActivities") or {}).get("acct-x") == [{"id": "act-1", "note": "hi"}]
    # GET still exposes legacy leads shape
    assert "leads" in got
    assert got["leads"].get("new") == got["salesCalls"]


def test_crm_empty_over_existing_409(crm_norm_fixtures):
    pid = crm_norm_fixtures["home_pid"]
    cookies = crm_norm_fixtures["cookies"]
    seed = {
        "propertyId": pid,
        "salesCalls": [{"id": f"SC-e-{uuid.uuid4().hex[:8]}", "subject": "seed"}],
        "pipeline": {k: [] for k in PIPELINE_KEYS},
        "accountActivities": {},
    }
    seed["pipeline"]["qualified"] = [
        {"id": f"PC-e-{uuid.uuid4().hex[:8]}", "stage": "qualified", "company": "Seed"}
    ]
    assert client.post("/api/crm-state", json=seed, cookies=cookies).status_code == 200

    empty = {
        "propertyId": pid,
        "salesCalls": [],
        "pipeline": {k: [] for k in PIPELINE_KEYS},
        "accountActivities": {},
    }
    r = client.post("/api/crm-state", json=empty, cookies=cookies)
    assert r.status_code == 409, r.text
