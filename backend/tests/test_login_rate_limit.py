"""Login rate limiter: per (forwarded IP, username), 10 failures / minute → 429."""
from __future__ import annotations

import routers.auth as auth_mod
from fastapi.testclient import TestClient

from main import app
from security import SESSION_COOKIE_NAME

client = TestClient(app, base_url="https://testserver")


def setup_function():
    auth_mod._login_attempts.clear()


def teardown_function():
    auth_mod._login_attempts.clear()


def test_ten_failed_logins_same_forwarded_ip_then_429():
    headers = {"X-Forwarded-For": "203.0.113.10"}
    body = {"username": "rate_limit_victim", "password": "wrong-password"}

    for _ in range(10):
        r = client.post("/api/login", json=body, headers=headers)
        assert r.status_code == 401

    r = client.post("/api/login", json=body, headers=headers)
    assert r.status_code == 429


def test_different_forwarded_ip_not_throttled():
    victim = {"username": "rate_limit_victim", "password": "wrong-password"}
    for _ in range(10):
        r = client.post(
            "/api/login",
            json=victim,
            headers={"X-Forwarded-For": "203.0.113.10"},
        )
        assert r.status_code == 401

    other = client.post(
        "/api/login",
        json=victim,
        headers={"X-Forwarded-For": "198.51.100.20"},
    )
    assert other.status_code == 401


def test_login_success_body_has_no_token_cookie_set(monkeypatch):
    """SEC-07: session stays httpOnly-cookie only; body must not echo the token."""
    import auth_db

    fake_user = {
        "id": "U-rate-limit",
        "username": "cookie_only_user",
        "name": "Cookie Only",
        "email": None,
        "role": "Admin",
        "status": "active",
        "propertyId": "P1",
        "property_ids": ["P1"],
        "permissionGrants": [],
        "permissionRevokes": [],
        "sessionVersion": 0,
        "avatar": None,
    }

    monkeypatch.setattr(auth_db, "authenticate", lambda u, p: (True, "ok"))
    monkeypatch.setattr(auth_db, "get_user_by_username", lambda u: fake_user)
    monkeypatch.setattr(auth_db, "create_session", lambda uid, ver: "test-session-token")

    r = client.post(
        "/api/login",
        json={"username": "cookie_only_user", "password": "any"},
        headers={"X-Forwarded-For": "203.0.113.99"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "token" not in data
    assert data.get("user", {}).get("username") == "cookie_only_user"
    assert r.cookies.get(SESSION_COOKIE_NAME) == "test-session-token"
