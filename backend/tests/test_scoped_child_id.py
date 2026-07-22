"""TDD: parent-scoped child IDs must not collide across parents or re-saves."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from child_ids import (
    child_id_token,
    ensure_scoped_child_id,
    resolve_child_pk,
    scoped_child_id,
)


def test_scoped_child_id_unique_across_parents():
    a = scoped_child_id("REQ-4EAD1BE3B066", "room", 0, 1784464314019)
    b = scoped_child_id("REQ-E66F0ADF6B6D", "room", 0, 1784464314019)
    assert a != b
    assert a.startswith("REQ-4EAD1BE3B066:room:0:")
    assert "1784464314019" in a


def test_scoped_child_id_unique_within_parent_by_index():
    a = scoped_child_id("A1", "activity", 0, "dup")
    b = scoped_child_id("A1", "activity", 1, "dup")
    assert a != b


def test_ensure_scoped_child_id_sets_id():
    out = ensure_scoped_child_id("REQ-1", "room", 1, {"id": 99, "type": "Deluxe", "count": 3})
    assert out["id"] == "REQ-1:room:1:99"
    assert out["type"] == "Deluxe"
    assert out["count"] == 3


def test_resolve_child_pk_reindexes_stale_scoped_log_ids():
    """Prepending a new log must not reuse parent:log:0 from an older row."""
    new_log = resolve_child_pk("REQ-47FE4071E886", "log", 0, None)
    old_log = resolve_child_pk("REQ-47FE4071E886", "log", 1, "REQ-47FE4071E886:log:0")
    assert new_log == "REQ-47FE4071E886:log:0"
    assert old_log == "REQ-47FE4071E886:log:1"
    assert new_log != old_log


def test_child_id_token_keeps_stable_suffix():
    assert child_id_token("REQ-1", "room", "REQ-1:room:0:1784") == "1784"
    assert child_id_token("REQ-1", "log", "REQ-1:log:0") is None
    assert child_id_token("REQ-1", "room", "RM-9") == "RM-9"


if __name__ == "__main__":
    test_scoped_child_id_unique_across_parents()
    test_scoped_child_id_unique_within_parent_by_index()
    test_ensure_scoped_child_id_sets_id()
    test_resolve_child_pk_reindexes_stale_scoped_log_ids()
    test_child_id_token_keeps_stable_suffix()
    print("OK")
