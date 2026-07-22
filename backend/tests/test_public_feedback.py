"""Public guest-feedback routes: GET/POST by token, no auth cookie required."""
from __future__ import annotations

import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from data_access import delete_request, upsert_request
from dependencies import set_current_user
from main import app
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


@pytest.fixture
def clear_user_ctx():
    set_current_user(None)
    yield
    set_current_user(None)


@pytest.fixture
def feedback_seed(clear_user_ctx):
    prop = _any_property_id()
    rid = f"R-pfb-{uuid.uuid4().hex[:8]}"
    token = f"tok-{uuid.uuid4().hex}"

    set_current_user({"id": "U-admin", "role": "admin", "property_ids": []})
    try:
        upsert_request(
            {
                "id": rid,
                "propertyId": prop,
                "requestName": "Public feedback route test",
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

    yield {"request_id": rid, "token": token, "property_id": prop}

    set_current_user({"id": "U-admin", "role": "admin", "property_ids": []})
    try:
        delete_request(rid)
    except Exception:
        pass
    set_current_user(None)


def test_bad_token_returns_404_not_401(clear_user_ctx):
    r = client.get("/api/requests/feedback/does-not-exist-token")
    assert r.status_code == 404, r.text
    assert r.status_code != 401


def test_get_feedback_without_auth(feedback_seed):
    token = feedback_seed["token"]
    r = client.get(f"/api/requests/feedback/{token}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["requestId"] == feedback_seed["request_id"]
    assert body["requestName"] == "Public feedback route test"
    assert (body.get("feedback") or {}).get("publicToken") == token


def test_submit_feedback_without_auth_and_reget(feedback_seed):
    token = feedback_seed["token"]
    answers = {"q1": 5, "comment": "Great stay"}

    post = client.post(
        f"/api/requests/feedback/{token}/submit",
        json={"answers": answers},
    )
    assert post.status_code == 200, post.text
    posted = post.json()
    assert posted.get("requestId") == feedback_seed["request_id"]
    assert posted.get("submittedAt")

    again = client.get(f"/api/requests/feedback/{token}")
    assert again.status_code == 200, again.text
    fb = again.json().get("feedback") or {}
    assert fb.get("answers", {}).get("q1") == 5
    assert fb.get("answers", {}).get("comment") == "Great stay"
    assert fb.get("submittedAt")


def test_submit_bad_token_returns_404(clear_user_ctx):
    r = client.post(
        "/api/requests/feedback/missing-token/submit",
        json={"answers": {"q1": 1}},
    )
    assert r.status_code == 404, r.text


def test_submit_requires_answers_object(feedback_seed):
    token = feedback_seed["token"]
    r = client.post(
        f"/api/requests/feedback/{token}/submit",
        json={"notAnswers": {}},
    )
    assert r.status_code == 400, r.text
