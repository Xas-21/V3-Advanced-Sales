"""Regression: re-saving an account must not null booker_contact_id on its requests."""
import uuid

import psycopg
import pytest
from psycopg.rows import dict_row

from data_access import delete_account, delete_request, get_account, get_request, upsert_account, upsert_request
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
def ids():
    suffix = uuid.uuid4().hex[:10].upper()
    acc_id, req_id = f"A-BKR-{suffix}", f"REQ-BKR-{suffix}"
    set_current_user({"id": "U-booker-resave", "role": "admin", "property_ids": []})
    yield acc_id, req_id
    for fn, x in ((delete_request, req_id), (delete_account, acc_id)):
        try:
            fn(x)
        except Exception:
            pass
    set_current_user(None)


def test_account_resave_keeps_request_booker(ids):
    acc_id, req_id = ids
    prop = _any_property_id()
    acc = upsert_account(
        {"id": acc_id, "name": "Booker resave", "propertyId": prop,
         "contacts": [{"id": "C1", "name": "Alice"}, {"id": "C2", "name": "Bob"}]}
    )
    bob_id = next(c["id"] for c in acc["contacts"] if c["name"] == "Bob")
    upsert_request(
        {"id": req_id, "propertyId": prop, "accountId": acc_id, "requestName": "R",
         "requestType": "Rooms", "status": "Inquiry", "bookerName": "Bob", "bookerContactId": bob_id}
    )

    # Re-save with an extra activity (what /api/accounts/sync does on any account change).
    upsert_account({**get_account(acc_id), "activities": [{"title": "touch"}]})
    assert get_request(req_id)["bookerContactId"] == bob_id

    # Removing a contact still deletes it (and SET NULL only applies to that contact).
    upsert_account({**get_account(acc_id), "contacts": [c for c in get_account(acc_id)["contacts"] if c["id"] != bob_id]})
    assert [c["name"] for c in get_account(acc_id)["contacts"]] == ["Alice"]
    assert get_request(req_id)["bookerContactId"] is None
