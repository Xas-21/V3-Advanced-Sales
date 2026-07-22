"""Plan 063: write authorization hardening — properties, templates, cxl, delete-impact, uploads."""
from __future__ import annotations

import json
import secrets
import uuid
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from data_access import upsert_payload_only
from dependencies import set_current_user
from main import app
from security import hash_password
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


def _session_cookie(username: str, password: str) -> str:
    r = client.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    raw = r.headers.get("set-cookie") or ""
    return raw.split(";")[0]


def _upload_table_ready() -> bool:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.upload_files') AS t;")
            row = cur.fetchone()
    return bool(row and row.get("t"))


def _ensure_upload_table() -> None:
    """Idempotent DDL so ownership tests can run before deploy applies 017."""
    with psycopg.connect(get_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS upload_files (
                    public_id            TEXT PRIMARY KEY,
                    uploaded_by_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
                    property_id          TEXT,
                    folder               TEXT,
                    created_at           TIMESTAMPTZ DEFAULT now()
                )
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_upload_files_uploader
                    ON upload_files (uploaded_by_user_id)
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_upload_files_property
                    ON upload_files (property_id)
                """
            )
        conn.commit()


@pytest.fixture
def clear_user_ctx():
    set_current_user(None)
    yield
    set_current_user(None)


@pytest.fixture
def authz_fixtures():
    home_pid = _any_property_id()
    other_pid = f"P-waz-{uuid.uuid4().hex[:8]}"
    admin_uid = f"U-waz-a-{uuid.uuid4().hex[:8]}"
    sales_uid = f"U-waz-s-{uuid.uuid4().hex[:8]}"
    other_uid = f"U-waz-o-{uuid.uuid4().hex[:8]}"
    admin_user = f"waz_admin_{secrets.token_hex(3)}"
    sales_user = f"waz_sales_{secrets.token_hex(3)}"
    other_user = f"waz_other_{secrets.token_hex(3)}"
    admin_pw = f"Admin@{secrets.token_hex(6)}"
    sales_pw = f"Sales@{secrets.token_hex(6)}"
    other_pw = f"Other@{secrets.token_hex(6)}"
    foreign_acc = f"A-waz-{uuid.uuid4().hex[:8]}"

    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO properties (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;",
                (other_pid, "waz foreign property"),
            )
            cur.execute(
                """
                INSERT INTO accounts (id, name, property_id)
                VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING;
                """,
                (foreign_acc, "waz foreign account", other_pid),
            )
            for uid, username, password, role, pid in (
                (admin_uid, admin_user, admin_pw, "Admin", home_pid),
                (sales_uid, sales_user, sales_pw, "Sales Manager", home_pid),
                (other_uid, other_user, other_pw, "Sales Manager", other_pid),
            ):
                cur.execute(
                    """
                    INSERT INTO users (id, username, password, name, role, status, property_id,
                                       assigned_property_ids, session_version)
                    VALUES (%s, %s, %s, %s, %s, 'active', %s, %s::jsonb, 0)
                    """,
                    (
                        uid,
                        username,
                        hash_password(password),
                        username,
                        role,
                        pid,
                        json.dumps([pid]),
                    ),
                )
        conn.commit()
    finally:
        conn.close()

    try:
        yield {
            "home_pid": home_pid,
            "other_pid": other_pid,
            "admin_uid": admin_uid,
            "sales_uid": sales_uid,
            "other_uid": other_uid,
            "admin_user": admin_user,
            "sales_user": sales_user,
            "other_user": other_user,
            "admin_pw": admin_pw,
            "sales_pw": sales_pw,
            "other_pw": other_pw,
            "foreign_acc": foreign_acc,
        }
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM sessions WHERE user_id IN (%s, %s, %s);",
                    (admin_uid, sales_uid, other_uid),
                )
                cur.execute(
                    "DELETE FROM users WHERE id IN (%s, %s, %s);",
                    (admin_uid, sales_uid, other_uid),
                )
                cur.execute("DELETE FROM accounts WHERE id = %s;", (foreign_acc,))
                cur.execute("DELETE FROM properties WHERE id = %s;", (other_pid,))
                if _upload_table_ready():
                    cur.execute(
                        "DELETE FROM upload_files WHERE uploaded_by_user_id IN (%s, %s, %s);",
                        (admin_uid, sales_uid, other_uid),
                    )
            conn.commit()
        finally:
            conn.close()


def test_non_admin_property_post_forbidden(authz_fixtures):
    fx = authz_fixtures
    cookie = _session_cookie(fx["sales_user"], fx["sales_pw"])
    pid = f"P-deny-{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/properties",
        headers={"Cookie": cookie, "Content-Type": "application/json"},
        json={"id": pid, "name": "should fail"},
    )
    assert r.status_code == 403, r.text


def test_admin_property_post_allowed(authz_fixtures):
    fx = authz_fixtures
    cookie = _session_cookie(fx["admin_user"], fx["admin_pw"])
    pid = f"P-ok-{uuid.uuid4().hex[:8]}"
    try:
        r = client.post(
            "/api/properties",
            headers={"Cookie": cookie, "Content-Type": "application/json"},
            json={"id": pid, "name": "admin ok"},
        )
        assert r.status_code == 200, r.text
        assert r.json().get("id") == pid
    finally:
        client.delete(f"/api/properties/{pid}", headers={"Cookie": cookie})


def test_non_admin_property_delete_forbidden(authz_fixtures):
    fx = authz_fixtures
    cookie = _session_cookie(fx["sales_user"], fx["sales_pw"])
    r = client.delete(
        f"/api/properties/{fx['home_pid']}",
        headers={"Cookie": cookie},
    )
    assert r.status_code == 403, r.text


def test_non_admin_contract_template_write_forbidden(authz_fixtures):
    fx = authz_fixtures
    cookie = _session_cookie(fx["sales_user"], fx["sales_pw"])
    tid = f"CT-deny-{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/contracts/templates",
        headers={"Cookie": cookie, "Content-Type": "application/json"},
        json={"id": tid, "name": "nope"},
    )
    assert r.status_code == 403, r.text
    r2 = client.delete(
        f"/api/contracts/templates/{tid}",
        headers={"Cookie": cookie},
    )
    assert r2.status_code == 403, r2.text


def test_admin_contract_template_write_allowed(authz_fixtures):
    fx = authz_fixtures
    cookie = _session_cookie(fx["admin_user"], fx["admin_pw"])
    tid = f"CT-ok-{uuid.uuid4().hex[:8]}"
    try:
        r = client.post(
            "/api/contracts/templates",
            headers={"Cookie": cookie, "Content-Type": "application/json"},
            json={"id": tid, "name": "ok"},
        )
        assert r.status_code == 200, r.text
    finally:
        client.delete(f"/api/contracts/templates/{tid}", headers={"Cookie": cookie})


def test_non_admin_cxl_reason_write_forbidden(authz_fixtures):
    fx = authz_fixtures
    cookie = _session_cookie(fx["sales_user"], fx["sales_pw"])
    rid = f"CX-deny-{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/cxl-reasons",
        headers={"Cookie": cookie, "Content-Type": "application/json"},
        json={"id": rid, "label": "nope"},
    )
    assert r.status_code == 403, r.text
    r2 = client.delete(f"/api/cxl-reasons/{rid}", headers={"Cookie": cookie})
    assert r2.status_code == 403, r2.text


def test_admin_cxl_reason_write_allowed(authz_fixtures):
    fx = authz_fixtures
    cookie = _session_cookie(fx["admin_user"], fx["admin_pw"])
    rid = f"CX-ok-{uuid.uuid4().hex[:8]}"
    try:
        r = client.post(
            "/api/cxl-reasons",
            headers={"Cookie": cookie, "Content-Type": "application/json"},
            json={"id": rid, "label": "ok"},
        )
        assert r.status_code == 200, r.text
    finally:
        client.delete(f"/api/cxl-reasons/{rid}", headers={"Cookie": cookie})


def test_upsert_payload_only_no_auth_raises(clear_user_ctx):
    with pytest.raises(PermissionError):
        upsert_payload_only(
            "cxl_reasons",
            {"id": f"CX-unit-{uuid.uuid4().hex[:8]}", "label": "deny"},
        )


def test_delete_impact_out_of_scope_404(authz_fixtures):
    fx = authz_fixtures
    cookie = _session_cookie(fx["sales_user"], fx["sales_pw"])
    r = client.get(
        f"/api/accounts/{fx['foreign_acc']}/delete-impact",
        headers={"Cookie": cookie},
    )
    assert r.status_code == 404, r.text


def test_upload_owner_can_get_and_delete(authz_fixtures, tmp_path, monkeypatch):
    _ensure_upload_table()
    fx = authz_fixtures
    monkeypatch.setenv("UPLOADS_DIR", str(tmp_path))
    cookie = _session_cookie(fx["sales_user"], fx["sales_pw"])
    r = client.post(
        "/api/uploads/local",
        headers={"Cookie": cookie},
        files={"file": ("pic.png", b"\x89PNG\r\n\x1a\n" + b"x" * 32, "image/png")},
        data={"folder": "feed", "propertyId": fx["home_pid"]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    public_id = body["public_id"]
    folder, filename = public_id.split("/", 1)

    g = client.get(
        f"/api/uploads/files/{folder}/{filename}",
        headers={"Cookie": cookie},
    )
    assert g.status_code == 200, g.text

    d = client.delete(
        "/api/uploads/local",
        headers={"Cookie": cookie},
        params={"publicId": public_id},
    )
    assert d.status_code == 200, d.text


def test_upload_foreign_property_user_gets_404(authz_fixtures, tmp_path, monkeypatch):
    _ensure_upload_table()
    fx = authz_fixtures
    monkeypatch.setenv("UPLOADS_DIR", str(tmp_path))
    owner_cookie = _session_cookie(fx["sales_user"], fx["sales_pw"])
    r = client.post(
        "/api/uploads/local",
        headers={"Cookie": owner_cookie},
        files={"file": ("pic.png", b"\x89PNG\r\n\x1a\n" + b"x" * 32, "image/png")},
        data={"folder": "chat", "propertyId": fx["home_pid"]},
    )
    assert r.status_code == 200, r.text
    public_id = r.json()["public_id"]
    folder, filename = public_id.split("/", 1)

    other_cookie = _session_cookie(fx["other_user"], fx["other_pw"])
    g = client.get(
        f"/api/uploads/files/{folder}/{filename}",
        headers={"Cookie": other_cookie},
    )
    assert g.status_code == 404, g.text

    # cleanup as owner
    client.delete(
        "/api/uploads/local",
        headers={"Cookie": owner_cookie},
        params={"publicId": public_id},
    )


def test_legacy_upload_without_ownership_row_still_loads(authz_fixtures, tmp_path, monkeypatch):
    """Backward-compat: files on disk with no upload_files row still require only auth."""
    fx = authz_fixtures
    monkeypatch.setenv("UPLOADS_DIR", str(tmp_path))
    folder = "feed"
    name = f"{uuid.uuid4().hex}.png"
    dest = Path(tmp_path) / folder
    dest.mkdir(parents=True, exist_ok=True)
    (dest / name).write_bytes(b"\x89PNG\r\n\x1a\n" + b"legacy")

    cookie = _session_cookie(fx["sales_user"], fx["sales_pw"])
    g = client.get(
        f"/api/uploads/files/{folder}/{name}",
        headers={"Cookie": cookie},
    )
    assert g.status_code == 200, g.text
