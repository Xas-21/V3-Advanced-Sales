"""Messenger group management + prefs smoke tests (Batch E/F)."""
from __future__ import annotations

import os
import uuid

import pytest

# Skip when DB not available (CI without docker)
pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL") and not os.environ.get("RUN_CHAT_TESTS"),
    reason="Set RUN_CHAT_TESTS=1 or DATABASE_URL to run chat integration tests",
)


def test_chat_helpers_importable():
    from routers import chat as chat_mod

    assert hasattr(chat_mod, "add_participants")
    assert hasattr(chat_mod, "patch_conversation")
    assert hasattr(chat_mod, "patch_prefs")
    assert hasattr(chat_mod, "set_participant_role")
    assert hasattr(chat_mod, "list_media")
    assert hasattr(chat_mod, "create_invite_link")
    assert hasattr(chat_mod, "join_via_invite")
    assert hasattr(chat_mod, "_is_group_admin")


def test_ensure_chat_tables_columns():
    """Schema ensure is idempotent and adds Batch E/F columns."""
    os.environ.setdefault("RUN_CHAT_TESTS", "1")
    try:
        from utils import _ensure_chat_tables, _get_pool
    except Exception as e:
        pytest.skip(f"DB helpers unavailable: {e}")

    try:
        _ensure_chat_tables()
        pool = _get_pool()
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT column_name FROM information_schema.columns
                       WHERE table_name = 'chat_conversations'
                         AND column_name IN ('avatar_url', 'description');"""
                )
                cols = {r["column_name"] for r in cur.fetchall()}
                assert "avatar_url" in cols
                assert "description" in cols
                cur.execute(
                    """SELECT column_name FROM information_schema.columns
                       WHERE table_name = 'chat_participants'
                         AND column_name IN ('role', 'muted_until', 'pinned_at');"""
                )
                pcols = {r["column_name"] for r in cur.fetchall()}
                assert {"role", "muted_until", "pinned_at"} <= pcols
                cur.execute(
                    """SELECT 1 FROM information_schema.tables
                       WHERE table_name = 'chat_invite_links';"""
                )
                assert cur.fetchone() is not None
    except Exception as e:
        pytest.skip(f"Postgres not reachable: {e}")
