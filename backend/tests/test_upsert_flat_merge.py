"""Partial flat upserts must merge into the existing payload (not replace it)."""
import uuid

import psycopg
import pytest
from psycopg.rows import dict_row

from data_access import delete_flat, get_flat, upsert_flat
from dependencies import set_current_user
from utils import get_database_url


@pytest.fixture
def admin_ctx():
    set_current_user({"id": "U-merge-test", "role": "admin", "property_ids": []})
    yield
    set_current_user(None)


def test_upsert_properties_partial_keeps_name(admin_ctx):
    pid = f"P-merge-{uuid.uuid4().hex[:8]}"
    try:
        upsert_flat(
            "properties",
            {
                "id": pid,
                "name": "Keep Me Resort",
                "city": "AlUla",
                "country": "Saudi Arabia",
                "email": "keep@example.com",
                "totalRooms": 10,
                "assignedUserIds": ["U1"],
                "paymentMethods": ["Cash"],
            },
            id_prefix="P",
        )
        upsert_flat(
            "properties",
            {"id": pid, "paymentMethods": ["Cash", "Bank Transfer"]},
            id_prefix="P",
        )
        doc = get_flat("properties", pid)
        assert doc is not None
        assert doc.get("name") == "Keep Me Resort"
        assert doc.get("city") == "AlUla"
        assert doc.get("paymentMethods") == ["Cash", "Bank Transfer"]
        assert doc.get("assignedUserIds") == ["U1"]
    finally:
        try:
            delete_flat("properties", pid)
        except Exception:
            with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM properties WHERE id = %s;", (pid,))
                conn.commit()
