"""Fail-closed tenant scope (plan 044): no auth -> deny; admin -> full; non-admin -> ids only."""
import uuid

import psycopg
import pytest
from psycopg.rows import dict_row

from data_access import (
    get_public_feedback_by_token,
    list_requests,
    submit_public_feedback,
    upsert_request,
)
from dependencies import set_current_user
from utils import ADMIN_SCOPE, _is_admin_scope, _tenant_scope, get_database_url


def _any_property_id() -> str:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM properties ORDER BY id ASC LIMIT 1;")
            row = cur.fetchone()
    if not row:
        pytest.skip("no properties in database")
    return str(row["id"])


@pytest.fixture
def clear_user_ctx():
    set_current_user(None)
    yield
    set_current_user(None)


def test_no_auth_context_denies_tenant_scope(clear_user_ctx):
    scope = _tenant_scope()
    assert not _is_admin_scope(scope)
    assert scope == set()


def test_admin_gets_admin_scope(clear_user_ctx):
    set_current_user({"id": "U-admin", "role": "admin", "property_ids": []})
    assert _tenant_scope() is ADMIN_SCOPE
    assert _is_admin_scope(_tenant_scope())


def test_non_admin_scoped_to_property_ids(clear_user_ctx):
    set_current_user(
        {
            "id": "U-sales",
            "role": "Sales Manager",
            "property_ids": ["P-HOME"],
            "propertyId": "P-HOME",
        }
    )
    scope = _tenant_scope()
    assert not _is_admin_scope(scope)
    assert scope == {"P-HOME"}


def test_no_auth_list_requests_returns_empty(clear_user_ctx):
    prop = _any_property_id()
    assert list_requests(prop) == []


def test_no_auth_upsert_request_denied(clear_user_ctx):
    prop = _any_property_id()
    with pytest.raises(PermissionError):
        upsert_request(
            {
                "id": f"R-deny-{uuid.uuid4().hex[:8]}",
                "propertyId": prop,
                "requestName": "should fail",
                "status": "Inquiry",
            }
        )


def test_admin_list_requests_not_empty_when_data_exists(clear_user_ctx):
    prop = _any_property_id()
    rid = f"R-admin-{uuid.uuid4().hex[:8]}"
    set_current_user({"id": "U-admin", "role": "admin", "property_ids": []})
    try:
        upsert_request(
            {
                "id": rid,
                "propertyId": prop,
                "requestName": "admin scope ok",
                "status": "Inquiry",
            }
        )
        listed = list_requests(prop)
        assert any(r.get("id") == rid for r in listed)
    finally:
        from data_access import delete_request

        try:
            delete_request(rid)
        except Exception:
            pass


def test_non_admin_list_hides_other_property(clear_user_ctx):
    home = _any_property_id()
    other = f"P-fc-{uuid.uuid4().hex[:8]}"
    rid_home = f"R-fc-h-{uuid.uuid4().hex[:8]}"
    rid_other = f"R-fc-o-{uuid.uuid4().hex[:8]}"

    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO properties (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;",
                (other, "fail-closed other"),
            )
        conn.commit()

    set_current_user({"id": "U-admin", "role": "admin", "property_ids": []})
    try:
        upsert_request(
            {"id": rid_home, "propertyId": home, "requestName": "home", "status": "Inquiry"}
        )
        upsert_request(
            {"id": rid_other, "propertyId": other, "requestName": "other", "status": "Inquiry"}
        )

        set_current_user(
            {
                "id": "U-scoped",
                "role": "Sales Manager",
                "property_ids": [home],
                "propertyId": home,
            }
        )
        ids = {r.get("id") for r in list_requests()}
        assert rid_home in ids
        assert rid_other not in ids
    finally:
        set_current_user({"id": "U-admin", "role": "admin", "property_ids": []})
        from data_access import delete_request

        for rid in (rid_home, rid_other):
            try:
                delete_request(rid)
            except Exception:
                pass
        with psycopg.connect(get_database_url()) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM properties WHERE id = %s;", (other,))
            conn.commit()


def test_public_feedback_explicit_opt_in_works_without_auth(clear_user_ctx):
    """Public feedback must keep working via dedicated helpers, not fail-open scope."""
    prop = _any_property_id()
    rid = f"R-fb-{uuid.uuid4().hex[:8]}"
    token = f"tok-{uuid.uuid4().hex}"

    set_current_user({"id": "U-admin", "role": "admin", "property_ids": []})
    try:
        upsert_request(
            {
                "id": rid,
                "propertyId": prop,
                "requestName": "Feedback public",
                "requestType": "Rooms",
                "status": "Inquiry",
                "feedback": {
                    "publicToken": token,
                    "template": "default",
                    "source": "link",
                    "answers": {},
                },
            }
        )
    finally:
        set_current_user(None)

    # No auth context — scoped list is empty, but explicit public helper works.
    assert list_requests(prop) == []
    lookup = get_public_feedback_by_token(token)
    assert lookup is not None
    assert lookup["requestId"] == rid
    assert lookup["requestName"] == "Feedback public"
    assert (lookup.get("feedback") or {}).get("publicToken") == token

    result = submit_public_feedback(token, {"q1": 5})
    assert result.get("requestId") == rid
    assert result.get("submittedAt")

    again = get_public_feedback_by_token(token)
    assert again is not None
    assert (again.get("feedback") or {}).get("answers", {}).get("q1") == 5

    set_current_user({"id": "U-admin", "role": "admin", "property_ids": []})
    from data_access import delete_request

    try:
        delete_request(rid)
    except Exception:
        pass
    set_current_user(None)
