"""Stable parent-scoped IDs for nested rows (rooms, contacts, activities, …)."""


def scoped_child_id(parent_id: str, kind: str, idx: int, existing_id=None) -> str:
    """Build a PK unique per parent even when Neon reused numeric child ids across rows.

    Examples:
      scoped_child_id("REQ-1", "room", 0, 1784464314019)
        -> "REQ-1:room:0:1784464314019"
      scoped_child_id("A1", "activity", 2, None)
        -> "A1:activity:2"
    """
    pid = str(parent_id or "").strip() or "_"
    k = str(kind or "child").strip() or "child"
    raw = "" if existing_id is None else str(existing_id).strip()
    base = f"{pid}:{k}:{int(idx)}"
    return f"{base}:{raw}" if raw else base


def child_id_token(parent_id: str, kind: str, existing_id=None) -> str | None:
    """Extract a stable token from a client/DB child id, never a full scoped PK.

    Reusing `REQ:log:0` as-is breaks delete-then-insert when the client prepends
    a new row (new idx-0 collides with the old row that still carries `:log:0`).
    """
    if existing_id is None:
        return None
    sraw = str(existing_id).strip()
    if not sraw:
        return None
    pid = str(parent_id or "").strip() or "_"
    k = str(kind or "child").strip() or "child"
    scoped_prefix = f"{pid}:{k}:"
    if sraw.startswith(scoped_prefix):
        rest = sraw[len(scoped_prefix) :]
        parts = rest.split(":", 1)
        # "0" → no token; "0:1784" / "0:abc" → keep trailing token
        if len(parts) == 2 and parts[1].strip():
            return parts[1].strip()
        return None
    return sraw


def resolve_child_pk(parent_id: str, kind: str, idx: int, existing_id=None) -> str:
    """Unique PK for this parent+kind+idx slot (safe across log prepend / reorder)."""
    return scoped_child_id(parent_id, kind, idx, child_id_token(parent_id, kind, existing_id))


def ensure_scoped_child_id(parent_id: str, kind: str, idx: int, child: dict) -> dict:
    """Return a shallow copy of child with `id` set to a parent-scoped PK."""
    out = dict(child or {})
    out["id"] = resolve_child_pk(parent_id, kind, idx, out.get("id"))
    return out
