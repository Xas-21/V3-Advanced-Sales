"""Regression: re-saving a request after prepending logs must not UniqueViolation."""
import uuid

import psycopg
import pytest
from psycopg.rows import dict_row

from data_access import delete_request, get_request, upsert_request
from dependencies import set_current_user
from utils import get_database_url


def _any_property_id() -> str:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM properties ORDER BY id ASC LIMIT 1;")
            row = cur.fetchone()
    if not row:
        pytest.skip("no properties in database")
    return str(row["id"])


@pytest.fixture
def req_id():
    rid = f"REQ-LOG-{uuid.uuid4().hex[:10].upper()}"
    set_current_user({"id": "U-log-resave", "role": "admin", "property_ids": []})
    yield rid
    try:
        delete_request(rid)
    except Exception:
        pass
    set_current_user(None)


def test_upsert_request_allows_prepended_logs_on_resave(req_id):
    prop = _any_property_id()
    created = upsert_request(
        {
            "id": req_id,
            "propertyId": prop,
            "requestName": "Log resave",
            "requestType": "Rooms",
            "status": "Inquiry",
            "logs": [
                {"action": "Request Created", "details": "first"},
                {"action": "Duplicated request", "details": "copied"},
            ],
        }
    )
    assert created["id"] == req_id
    logs = created.get("logs") or []
    assert len(logs) == 2
    # Simulate client re-save: prepend a change log while keeping prior scoped ids.
    updated = upsert_request(
        {
            "id": req_id,
            "propertyId": prop,
            "requestName": "Log resave edited",
            "requestType": "Rooms",
            "status": "Inquiry",
            "_update": True,
            "logs": [
                {"action": "Modified Details", "details": "Name changed"},
                logs[0],
                logs[1],
            ],
        }
    )
    assert updated["id"] == req_id
    again = get_request(req_id)
    assert again is not None
    assert len(again.get("logs") or []) == 3
    ids = [str(x.get("id")) for x in again["logs"]]
    assert len(ids) == len(set(ids)), ids
