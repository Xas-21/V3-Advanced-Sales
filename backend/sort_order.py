"""Stable display order for rooms/venues payloads (sortOrder field)."""

from __future__ import annotations

_MISSING = 2**31 - 1


def _sort_order_value(item: dict) -> int:
    raw = item.get("sortOrder")
    if raw is None or raw == "":
        return _MISSING
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return _MISSING
    return n


def sort_by_sort_order(items: list) -> list:
    """Ascending sortOrder; missing last; ties by id. Does not mutate input."""
    return sorted(
        items,
        key=lambda it: (
            _sort_order_value(it if isinstance(it, dict) else {}),
            str((it or {}).get("id") or "") if isinstance(it, dict) else "",
        ),
    )
