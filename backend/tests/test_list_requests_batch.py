"""list_requests batches child loads (plan 001)."""
import uuid

import psycopg
import pytest
from psycopg.rows import dict_row

from data_access import delete_request, get_request, list_requests, upsert_request
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
def batch_req_id():
    rid = f"R-batch-{uuid.uuid4().hex[:10]}"
    yield rid
    try:
        delete_request(rid)
    except Exception:
        pass


def test_list_requests_includes_batched_rooms_and_logs(batch_req_id):
    prop = _any_property_id()
    created = upsert_request(
        {
            "id": batch_req_id,
            "propertyId": prop,
            "requestName": "Batch list test",
            "requestType": "Rooms",
            "status": "Inquiry",
            "rooms": [
                {"id": "RM-1", "roomType": "Deluxe", "units": 1},
                {"id": "RM-2", "roomType": "Suite", "units": 2},
            ],
            "logs": [{"id": "LG-1", "note": "batched"}],
        }
    )
    assert created["id"] == batch_req_id
    assert len(created.get("rooms") or []) == 2

    listed = list_requests(prop)
    hit = next((r for r in listed if r.get("id") == batch_req_id), None)
    assert hit is not None
    assert len(hit.get("rooms") or []) == 2
    assert len(hit.get("logs") or []) == 1
    assert hit["logs"][0].get("note") == "batched"

    one = get_request(batch_req_id)
    assert one is not None
    assert len(one.get("rooms") or []) == 2
