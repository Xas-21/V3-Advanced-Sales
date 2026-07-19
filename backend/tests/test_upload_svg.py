"""Plan 042: SVG upload rejection, scan-extract caps, body schema validation."""
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from dependencies import require_user
from main import app
from routers.uploads import _ext_of

client = TestClient(app, base_url="https://testserver")

_FAKE_USER = {"id": "u-042", "username": "pytest042", "role": "Admin", "propertyId": "P_test"}


@pytest.fixture(autouse=True)
def _auth_override():
    app.dependency_overrides[require_user] = lambda: _FAKE_USER
    try:
        yield
    finally:
        app.dependency_overrides.pop(require_user, None)


def test_svg_extension_not_allowed():
    assert _ext_of("evil.svg") == ""
    assert _ext_of("photo.PNG") == ".png"


def test_svg_upload_rejected():
    # Handler also calls require_user() directly (not only via Depends).
    with patch("routers.uploads.require_user", return_value=_FAKE_USER):
        r = client.post(
            "/api/uploads/local",
            files={"file": ("evil.svg", b'<svg onload="alert(1)"></svg>', "image/svg+xml")},
            data={"folder": "general"},
        )
    assert r.status_code == 400
    assert "not allowed" in (r.json().get("detail") or "").lower()


def test_scan_extract_rejects_unsupported_type():
    r = client.post(
        "/api/accounts/scan-extract",
        files={"file": ("card.svg", b"<svg/>", "image/svg+xml")},
    )
    assert r.status_code == 400
    assert "unsupported" in (r.json().get("detail") or "").lower()


def test_scan_extract_rejects_oversized():
    big = b"\xff\xd8\xff" + (b"x" * (10 * 1024 * 1024))
    r = client.post(
        "/api/accounts/scan-extract",
        files={"file": ("card.jpg", big, "image/jpeg")},
    )
    assert r.status_code == 413
    assert "too large" in (r.json().get("detail") or "").lower()


def test_sync_accounts_rejects_non_list_accounts():
    r = client.put(
        "/api/accounts/sync",
        json={"propertyId": "P_test", "accounts": "not-a-list"},
    )
    assert r.status_code == 422


def test_sync_accounts_rejects_missing_property_id():
    r = client.put("/api/accounts/sync", json={"accounts": []})
    assert r.status_code == 422


def test_create_request_rejects_non_list_rooms():
    r = client.post(
        "/api/requests",
        json={"propertyId": "P_test", "rooms": "not-a-list"},
    )
    assert r.status_code == 422


def test_upsert_account_rejects_non_list_contacts():
    r = client.post(
        "/api/accounts",
        json={"propertyId": "P_test", "name": "X", "contacts": "nope"},
    )
    assert r.status_code == 422
