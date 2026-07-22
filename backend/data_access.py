"""Relational data-access layer (Option B).

Every router now reads/writes the NORMALIZED tables with real FK-enforced writes.
Flat entities store their full document in a `payload jsonb` column (so the
frontend receives the exact same nested shape it always got) PLUS typed columns
for relational querying. Requests/Accounts additionally persist nested children
into dedicated child tables keyed by FK, which is the actual relational guarantee.

Design rules (per owner directive):
- No JSON-file fallback. Postgres is mandatory.
- Tenant scoping is applied on every read (property_id in allowed set).
- Writes enforce referential integrity via FK columns.
- The full incoming document is preserved verbatim in `payload` to avoid any
  field loss during the migration.
- Real-time broadcasts: mutations trigger WebSocket events to connected clients.
"""
from child_ids import resolve_child_pk, scoped_child_id
from datetime import datetime, timezone
from typing import Any, Optional

import logging
import uuid
from psycopg import sql
from psycopg.types.json import Json

from utils import (
    RequestIdCollisionError,
    _get_pool,
    _is_admin_scope,
    _is_explicit_request_update,
    _tenant_scope,
    _filter_by_tenant,
)

# Import the WebSocket manager for broadcasting
try:
    from websocket_manager import manager as ws_manager
except ImportError:
    ws_manager = None  # Graceful degradation if WebSocket not available

_NOW = lambda: datetime.now(timezone.utc)


def _assert_write_access(property_id: Optional[str]) -> None:
    """Enforce tenant isolation on writes/deletes, symmetric with read scoping.

    Uses the same request-scoped user + `_tenant_scope()` that filters reads, so
    any user who can SEE a property's data may write it — and no one else:
      - ADMIN_SCOPE -> admin full access -> allowed.
      - property_id empty/None -> global/unscoped row (e.g. contract templates) ->
                          allowed for authenticated users; no auth context -> deny.
      - property_id set but not in scope (incl. empty set) -> PermissionError.

    Public paths must use dedicated helpers (e.g. get_public_feedback_by_token),
    not rely on missing auth context.
    """
    scope = _tenant_scope()
    if _is_admin_scope(scope):
        return
    pid = str(property_id or "").strip()
    if not pid:
        # Global/unscoped rows: still require an auth context (fail closed).
        try:
            from dependencies import get_current_user_ctx
            if get_current_user_ctx():
                return
        except Exception:
            pass
        raise PermissionError("Access denied to this property.")
    if pid not in scope:
        raise PermissionError("Access denied to this property.")


def _assert_upsert_write_access(
    existing_property_id: Optional[str],
    incoming_property_id: Optional[str],
    *,
    row_exists: bool,
) -> None:
    """Block IDOR overwrite: require access to the existing row AND the incoming property.

    Matching delete_flat: ownership is taken from the stored row, not only the body.
    """
    if row_exists:
        _assert_write_access(existing_property_id)
    _assert_write_access(incoming_property_id)


# Tables that carry a property_id column (tenant-scoped on read).
_FLAT_WITH_PID = {
    "rooms",
    "venues",
    "taxes",
    "financials",
    "tasks",
    "promotions",
    "account_rates",
    "account_ledger",
}
# Tables keyed only by id (no property_id column). `properties` is itself the
# tenant root; `contract_templates`/`cxl_reasons` are id-keyed payload-only.
_FLAT_BY_ID = {
    "properties",
    "contract_templates",
    "cxl_reasons",
}
# Id-keyed payload-only tables without created_at/updated_at columns.
_NO_TS = {
    "contract_templates",
    "cxl_reasons",
}


def _broadcast_change(event_type: str, entity_type: str, data: dict, property_id: str | None = None):
    """Broadcast a data mutation event to WebSocket clients.
    
    Args:
        event_type: "created", "updated", "deleted"
        entity_type: "request", "account", "property", "task", etc.
        data: The entity payload (or just {"id": ...} for deletes)
        property_id: Scope to this property (None = global broadcast)
    """
    if ws_manager is None:
        return  # WebSocket not available, skip broadcast
    
    message = {
        "type": event_type,
        "entity": entity_type,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Sync routes run in a threadpool, so schedule the broadcast onto the
    # uvicorn event loop that owns the websockets (avoids the "attached to a
    # different loop" failure of spawning a fresh loop via asyncio.run).
    try:
        ws_manager.broadcast_threadsafe(message, property_id)
    except Exception as e:
        logging.warning(f"WebSocket broadcast failed: {e}")


# --------------------------------------------------------------------------- #
# Low-level helpers
# --------------------------------------------------------------------------- #
def _gen_id(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


def _upsert_doc(
    table: str,
    row_id: str,
    property_id: Optional[str],
    payload: dict,
    typed_cols: dict,
) -> dict:
    """Insert/update a row carrying a `payload jsonb` + typed scalar columns.

    `typed_cols` maps column name -> value (already extracted from payload).
    `property_id` is only written for tables that actually have that column.
    """
    pool = _get_pool()
    now = _NOW()
    cols: dict = {
        "id": row_id,
        "payload": Json(payload),
        **typed_cols,
    }
    if table in _FLAT_WITH_PID:
        cols["property_id"] = property_id
    if table not in _NO_TS:
        cols["updated_at"] = now
        if "created_at" not in cols:
            cols["created_at"] = now

    col_names = list(cols.keys())
    with pool.connection() as conn:
        with conn.cursor() as cur:
            insert = sql.SQL("INSERT INTO {tbl} ({cols}) VALUES ({ph})").format(
                tbl=sql.Identifier(table),
                cols=sql.SQL(", ").join(map(sql.Identifier, col_names)),
                ph=sql.SQL(", ").join(sql.Placeholder(n) for n in col_names),
            )
            update_sets = sql.SQL(", ").join(
                sql.SQL("{c} = EXCLUDED.{c}").format(c=sql.Identifier(c))
                for c in col_names
                if c not in ("id", "created_at")
            )
            if table in _NO_TS:
                conflict = sql.SQL(
                    " ON CONFLICT (id) DO UPDATE SET {sets}"
                ).format(sets=update_sets)
            else:
                conflict = sql.SQL(
                    " ON CONFLICT (id) DO UPDATE SET {sets}, created_at = COALESCE({tbl}.created_at, EXCLUDED.created_at)"
                ).format(sets=update_sets, tbl=sql.Identifier(table))
            cur.execute(insert + conflict, cols)
            conn.commit()
    return payload


def _doc_with_row_id(payload: dict, row_id: str) -> dict:
    """Return a copy of payload whose `id` matches the DB primary key.

    Migrated rows often keep a short id inside payload (e.g. \"muni\") while the
    table PK is property-scoped (\"Ps8…::muni\"). Returning the short id makes
    POST /api/taxes create a second row on Save Configuration.
    """
    out = dict(payload)
    out["id"] = str(row_id)
    return out


def _list_doc(table: str, property_id: Optional[str]) -> list:
    pool = _get_pool()
    order = "id ASC" if table in _NO_TS else "updated_at DESC, id ASC"
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if table in _FLAT_WITH_PID:
                if property_id:
                    pid = str(property_id)
                    cur.execute(
                        sql.SQL(
                            "SELECT id, payload FROM {tbl} WHERE property_id = %s OR property_id IS NULL ORDER BY " + order
                        ).format(tbl=sql.Identifier(table)),
                        (pid,),
                    )
                else:
                    cur.execute(
                        sql.SQL("SELECT id, payload FROM {tbl} ORDER BY " + order).format(
                            tbl=sql.Identifier(table)
                        )
                    )
            elif table == "properties":
                # properties is the tenant root; list all, tenant-scope on payload.
                cur.execute(
                    sql.SQL("SELECT id, payload FROM {tbl} ORDER BY " + order).format(
                        tbl=sql.Identifier(table)
                    )
                )
            else:
                cur.execute(
                    sql.SQL("SELECT id, payload FROM {tbl} ORDER BY " + order).format(
                        tbl=sql.Identifier(table)
                    )
                )
            rows = cur.fetchall()
    out = [
        _doc_with_row_id(r["payload"], r["id"])
        for r in rows
        if isinstance(r.get("payload"), dict) and r.get("id") is not None
    ]
    scope = _tenant_scope()
    if table == "properties":
        # Property documents are tenant roots: their own `id` is the property key
        # (unlike child entities that carry payload.propertyId).
        if not _is_admin_scope(scope):
            out = [p for p in out if str(p.get("id") or "") in scope]
    elif table in _FLAT_WITH_PID:
        # Match accounts/requests: never return another tenant's rows.
        # Cross-property query with a foreign propertyId → empty list (not 403),
        # consistent with list_accounts / list_requests.
        if property_id and not _is_admin_scope(scope) and str(property_id) not in scope:
            return []
        out = _filter_by_tenant(out, scope)
    elif table in _FLAT_BY_ID:
        out = _filter_by_tenant(out, scope)  # scope on payload.propertyId
    return out


def _get_doc(table: str, row_id: str) -> Optional[dict]:
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("SELECT id, payload FROM {tbl} WHERE id = %s").format(tbl=sql.Identifier(table)),
                (str(row_id),),
            )
            row = cur.fetchone()
    if not row or not isinstance(row.get("payload"), dict):
        return None
    return _doc_with_row_id(row["payload"], row["id"])


def _delete_doc(table: str, row_id: str, property_id: Optional[str] = None):
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if property_id and table in _FLAT_WITH_PID:
                cur.execute(
                    sql.SQL("DELETE FROM {tbl} WHERE id = %s AND property_id = %s").format(
                        tbl=sql.Identifier(table)
                    ),
                    (str(row_id), str(property_id)),
                )
            else:
                cur.execute(
                    sql.SQL("DELETE FROM {tbl} WHERE id = %s").format(tbl=sql.Identifier(table)),
                    (str(row_id),),
                )
            conn.commit()


# --------------------------------------------------------------------------- #
# Flat entity adapters (extract typed columns from the full document)
# --------------------------------------------------------------------------- #
def _extract_properties(p: dict) -> dict:
    assigned = p.get("assignedUserIds")
    return {
        "name": p.get("name"),
        "city": p.get("city"),
        "country": p.get("country"),
        "email": p.get("email"),
        "phone": p.get("phone"),
        "logo_url": p.get("logoUrl"),
        "total_rooms": _as_int(p.get("totalRooms")),
        "assigned_user_ids": Json(assigned) if isinstance(assigned, list) else assigned,
    }


def _extract_rooms(p: dict) -> dict:
    return {
        "name": p.get("name"),
        "count": _as_int(p.get("count")),
        "size": p.get("size"),
        "base_rate": _as_decimal(p.get("baseRate")),
        "capacity": _as_int(p.get("capacity")),
    }


def _extract_venues(p: dict) -> dict:
    return {
        "name": p.get("name"),
        "is_combined": bool(p.get("isCombined", False)),
        "width": _as_decimal(p.get("width")),
        "length": _as_decimal(p.get("length")),
        "height": _as_decimal(p.get("height")),
        "area": _as_decimal(p.get("area")),
        "capacity": _as_int(p.get("capacity")),
    }


def _extract_taxes(p: dict) -> dict:
    return {
        "label": p.get("label"),
        "rate": _as_decimal(p.get("rate")),
        "scope": Json(p.get("scope")) if isinstance(p.get("scope"), (dict, list)) else p.get("scope"),
    }


def _extract_financials(p: dict) -> dict:
    return {"year": _as_int(p.get("year"))}


def _extract_tasks(p: dict) -> dict:
    return {
        "task": p.get("task"),
        "client": p.get("client"),
        "priority": p.get("priority"),
        "completed": bool(p.get("completed", False)),
        "date": _as_date(p.get("date")),
        "star": bool(p.get("star", False)),
        "category": p.get("category"),
        "description": p.get("description"),
        "assigned_to": p.get("assignedTo"),
    }


def _extract_promotions(p: dict) -> dict:
    return {
        "name": p.get("name"),
        "status": p.get("status"),
        "start_date": _as_date(p.get("startDate")),
        "end_date": _as_date(p.get("endDate")),
        "terms": p.get("terms"),
        "include_rooms_revenue": bool(p.get("includeRoomsRevenue", False)),
        "include_events_revenue": bool(p.get("includeEventsRevenue", False)),
    }


def _extract_account_rates(p: dict) -> dict:
    segs = p.get("segments")
    return {
        "account_id": str(p.get("accountId") or "").strip() or None,
        "start_date": _as_date(p.get("startDate")),
        "end_date": _as_date(p.get("endDate")),
        "segments": Json(segs) if isinstance(segs, list) else segs,
    }


_LEDGER_POSITIVE = {"deposit", "collection"}
_LEDGER_NEGATIVE = {"allocation", "cl_charge", "refund"}


def _signed_ledger_amount(entry_type: str, amount) -> float:
    v = float(_as_decimal(amount) or 0)
    t = str(entry_type or "").strip()
    if t in _LEDGER_POSITIVE:
        return abs(v)
    if t in _LEDGER_NEGATIVE:
        return -abs(v)
    return v  # adjustment: as-is


def _extract_account_ledger(p: dict) -> dict:
    return {
        "account_id": str(p.get("accountId") or "").strip() or None,
        "request_id": str(p.get("requestId") or "").strip() or None,
        "entry_type": str(p.get("type") or "").strip() or None,
        "amount": _signed_ledger_amount(p.get("type"), p.get("amount")),
    }


_EXTRACTORS = {
    "properties": _extract_properties,
    "rooms": _extract_rooms,
    "venues": _extract_venues,
    "taxes": _extract_taxes,
    "financials": _extract_financials,
    "tasks": _extract_tasks,
    "promotions": _extract_promotions,
    "account_rates": _extract_account_rates,
    "account_ledger": _extract_account_ledger,
}


# Public flat CRUD used by routers ------------------------------------------- #
def list_flat(table: str, property_id: Optional[str] = None) -> list:
    return _list_doc(table, property_id)


def get_flat(table: str, row_id: str) -> Optional[dict]:
    return _get_doc(table, row_id)


def upsert_flat(table: str, data: dict, id_prefix: str = "X") -> dict:
    item = {**(data if isinstance(data, dict) else {})}
    row_id = str(item.get("id") or _gen_id(id_prefix))
    property_id = str(item.get("propertyId") or "").strip() or None
    # Taxes / rooms / venues / etc. may arrive with a short blob id like "muni".
    # Persist under "{propertyId}::{id}" so Save does not fork a second row.
    if table in {"taxes", "rooms", "venues", "tasks", "promotions", "financials"} and property_id and "::" not in row_id:
        row_id = f"{property_id}::{row_id}"
    item["id"] = row_id
    existing = _get_doc(table, row_id)
    if table in _FLAT_WITH_PID:
        existing_pid = None
        if existing:
            existing_pid = str(existing.get("propertyId") or "").strip() or None
        _assert_upsert_write_access(existing_pid, property_id, row_exists=bool(existing))
    else:
        _assert_write_access(property_id)
    # Partial POSTs (e.g. paymentMethods-only) must not wipe the rest of the document.
    if isinstance(existing, dict) and existing:
        item = {**existing, **item, "id": row_id}
        if property_id is None:
            property_id = str(item.get("propertyId") or "").strip() or None
    typed = _EXTRACTORS.get(table, lambda _: {})(item)
    _upsert_doc(table, row_id, property_id, item, typed)
    _broadcast_change("updated", table, item, property_id)
    return item


def delete_flat(table: str, row_id: str, property_id: Optional[str] = None):
    # If the caller didn't pass a property, resolve the row's own property so the
    # tenant check can't be bypassed by deleting-by-id.
    effective_pid = str(property_id or "").strip() or None
    if effective_pid is None and table in _FLAT_WITH_PID:
        existing = _get_doc(table, row_id)
        if existing:
            effective_pid = str(existing.get("propertyId") or "").strip() or None
    _assert_write_access(effective_pid)
    _delete_doc(table, row_id, property_id)
    _broadcast_change("deleted", table, {"id": row_id}, effective_pid)


def save_ledger_entry(data: dict) -> dict:
    item = {**(data if isinstance(data, dict) else {})}
    item["amount"] = _signed_ledger_amount(item.get("type"), item.get("amount"))
    return upsert_flat("account_ledger", item, id_prefix="LE")


def transfer_allocation(entry_id: str, to_request_id: str) -> dict:
    existing = get_flat("account_ledger", str(entry_id))
    if not existing:
        raise KeyError("ledger entry not found")
    existing["requestId"] = str(to_request_id or "").strip() or None
    return save_ledger_entry(existing)


# contract_templates / cxl_reasons: id-keyed, payload-only -------------------- #
def upsert_payload_only(table: str, data: dict, id_prefix: str = "T") -> dict:
    item = {**(data if isinstance(data, dict) else {})}
    row_id = str(item.get("id") or _gen_id(id_prefix))
    item["id"] = row_id
    _upsert_doc(table, row_id, None, item, {})
    _broadcast_change("updated", table, item, None)
    return item


# crm_state: keyed by property_id -------------------------------------------- #
def _crm_block_score(block: Optional[dict]) -> int:
    """Prefer the richer CRM blob (salesCalls + pipeline cards)."""
    if not isinstance(block, dict):
        return -1
    sc = block.get("salesCalls")
    n = len(sc) if isinstance(sc, list) else 0
    pipe = block.get("pipeline") if isinstance(block.get("pipeline"), dict) else {}
    for v in pipe.values():
        if isinstance(v, list):
            n += len(v)
    # Legacy shape: leads.new held sales calls
    leads = block.get("leads") if isinstance(block.get("leads"), dict) else {}
    if isinstance(leads.get("new"), list):
        n += len(leads["new"])
    return n


def get_crm_state(property_id: str) -> Optional[dict]:
    pid = str(property_id or "global").strip() or "global"
    # Tenant isolation: a scoped user may only read their properties' pipeline.
    scope = _tenant_scope()
    if not _is_admin_scope(scope) and pid != "global" and pid not in scope:
        return None
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT leads, payload FROM crm_state WHERE property_id = %s;",
                (pid,),
            )
            row = cur.fetchone()
    if not row:
        return None
    leads = row.get("leads") if isinstance(row.get("leads"), dict) else None
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else None
    # Migrator stores the full CRM map in payload; older writes only touched leads.
    # Prefer whichever block actually has salesCalls/pipeline data.
    if _crm_block_score(payload) >= _crm_block_score(leads):
        return payload or leads
    return leads or payload


def upsert_crm_state(property_id: str, leads: dict) -> dict:
    pid = str(property_id or "global").strip() or "global"
    _assert_write_access(pid if pid != "global" else None)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO crm_state (property_id, leads, payload, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (property_id) DO UPDATE SET
                    leads = EXCLUDED.leads,
                    payload = EXCLUDED.payload,
                    updated_at = NOW();
                """,
                (pid, Json(leads), Json(leads)),
            )
            conn.commit()
    _broadcast_change("updated", "crm_state", {"propertyId": pid}, pid if pid != "global" else None)
    return leads


# --------------------------------------------------------------------------- #
# REQUESTS (nested children with FK enforcement)
# --------------------------------------------------------------------------- #
_CHILD_DEFS = {
    "request_rooms": ("rooms", _gen_id("RM")),
    "request_payments": ("payments", _gen_id("PY")),
    "request_agenda": ("agenda", _gen_id("AG")),
    "request_logs": ("logs", _gen_id("LG")),
    "request_alerts": ("alerts", _gen_id("AL")),
    "request_transportation": ("transportation", _gen_id("TR")),
    "request_invoices": ("invoices", None),  # single object, one row
    "request_feedback": ("feedback", None),  # single object keyed by request_id
}


def list_requests(property_id: Optional[str] = None) -> list:
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if property_id:
                pid = str(property_id)
                cur.execute(
                    """
                    SELECT * FROM requests
                    WHERE property_id = %s OR property_id IS NULL
                    ORDER BY updated_at DESC, id ASC;
                    """,
                    (pid,),
                )
            else:
                cur.execute("SELECT * FROM requests ORDER BY updated_at DESC, id ASC;")
            parents = cur.fetchall()
            children = _load_request_children_maps(cur, [r["id"] for r in parents])
            out = [_request_dict_from_row(r, children) for r in parents]
    return _filter_by_tenant(out, _tenant_scope())


def get_request(req_id: str) -> Optional[dict]:
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM requests WHERE id = %s;", (str(req_id),))
            r = cur.fetchone()
            if not r:
                return None
            children = _load_request_children_maps(cur, [r["id"]])
            return _request_dict_from_row(r, children)


def get_public_feedback_by_token(token: str) -> Optional[dict]:
    """Explicit public opt-in: load feedback form by publicToken without auth.

    Does not call `_tenant_scope()` — intentional unauthenticated access for
    RequestFeedbackPublicPage. Routers must call this helper (not list/get
    under fail-open).
    """
    tok = str(token or "").strip()
    if not tok:
        return None
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT request_id, payload
                FROM request_feedback
                WHERE payload->>'publicToken' = %s
                LIMIT 1;
                """,
                (tok,),
            )
            fb = cur.fetchone()
            if not fb:
                return None
            rid = str(fb["request_id"])
            feedback = fb["payload"] if isinstance(fb.get("payload"), dict) else {}
            cur.execute("SELECT * FROM requests WHERE id = %s;", (rid,))
            r = cur.fetchone()
            if not r:
                return None
            prop_name = ""
            prop_logo = None
            prop_templates = None
            pid = r.get("property_id")
            if pid:
                cur.execute("SELECT payload, name FROM properties WHERE id = %s;", (str(pid),))
                prow = cur.fetchone()
                if prow:
                    prop_name = str(prow.get("name") or "")
                    pp = prow.get("payload") if isinstance(prow.get("payload"), dict) else {}
                    if not prop_name:
                        prop_name = str(pp.get("name") or "")
                    prop_logo = pp.get("logoUrl") or pp.get("logo")
                    prop_templates = pp.get("feedbackTemplates")
            return {
                "requestId": rid,
                "requestType": r.get("request_type") or "",
                "propertyName": prop_name,
                "propertyLogoUrl": prop_logo,
                "requestName": r.get("request_name"),
                "accountName": r.get("account_name"),
                "confirmationNo": r.get("confirmation_no"),
                "propertyFeedbackTemplates": prop_templates,
                "feedback": {k: v for k, v in feedback.items() if k != "request_id"},
            }


def submit_public_feedback(token: str, answers: dict) -> dict:
    """Explicit public opt-in: submit feedback answers by publicToken without auth."""
    tok = str(token or "").strip()
    if not tok:
        raise PermissionError("Invalid feedback token.")
    if not isinstance(answers, dict):
        raise PermissionError("Invalid feedback answers.")
    submitted_at = _NOW().isoformat()
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT request_id, payload
                FROM request_feedback
                WHERE payload->>'publicToken' = %s
                LIMIT 1;
                """,
                (tok,),
            )
            fb = cur.fetchone()
            if not fb:
                raise PermissionError("Feedback link not found.")
            payload = dict(fb["payload"]) if isinstance(fb.get("payload"), dict) else {}
            payload["publicToken"] = tok
            payload["answers"] = answers
            payload["submittedAt"] = submitted_at
            cur.execute(
                """
                UPDATE request_feedback
                   SET payload = %s
                 WHERE request_id = %s;
                """,
                (Json(payload), fb["request_id"]),
            )
            conn.commit()
    return {"submittedAt": submitted_at, "requestId": str(fb["request_id"])}


_REQUEST_ARRAY_CHILD_TABLES = (
    ("rooms", "request_rooms"),
    ("agenda", "request_agenda"),
    ("logs", "request_logs"),
    ("payments", "request_payments"),
    ("alerts", "request_alerts"),
    ("transportation", "request_transportation"),
)

_REQUEST_ARRAY_EMPTY_AS_LIST = frozenset({"rooms", "agenda", "logs", "payments", "transportation"})


def _load_request_children_maps(cur, request_ids: list) -> dict:
    """Prefetch all request children in O(tables) queries. Returns maps keyed by request_id."""
    empty = {
        "rooms": {},
        "agenda": {},
        "logs": {},
        "payments": {},
        "alerts": {},
        "transportation": {},
        "invoices": {},
        "feedback": {},
    }
    if not request_ids:
        return empty

    ids = [str(x) for x in request_ids]
    out = {k: {} for k in empty}

    for key, table in _REQUEST_ARRAY_CHILD_TABLES:
        cur.execute(
            sql.SQL(
                "SELECT request_id, id, payload FROM {} WHERE request_id = ANY(%s) ORDER BY request_id, idx"
            ).format(sql.Identifier(table)),
            (ids,),
        )
        bucket = out[key]
        for row in cur.fetchall():
            rid = row["request_id"]
            payload = row["payload"]
            if isinstance(payload, dict):
                payload = _doc_with_row_id(payload, row["id"])
            bucket.setdefault(rid, []).append(payload)

    cur.execute(
        "SELECT request_id, payload FROM request_invoices WHERE request_id = ANY(%s) ORDER BY request_id, idx",
        (ids,),
    )
    for row in cur.fetchall():
        rid = row["request_id"]
        if rid in out["invoices"]:
            continue
        payload = row["payload"]
        if payload is not None:
            out["invoices"][rid] = {k: v for k, v in payload.items() if k != "request_id"}

    cur.execute(
        "SELECT request_id, payload FROM request_feedback WHERE request_id = ANY(%s) ORDER BY request_id, idx",
        (ids,),
    )
    for row in cur.fetchall():
        rid = row["request_id"]
        if rid in out["feedback"]:
            continue
        payload = row["payload"]
        if payload is not None:
            out["feedback"][rid] = {k: v for k, v in payload.items() if k != "request_id"}

    return out


def _request_dict_from_row(r, children: dict) -> dict:
    def iso(ts):
        return ts.isoformat() if ts is not None else None

    def norm(v):
        return None if (v == "" or v == []) else v

    rid = r["id"]

    def child_arr(key: str):
        rows = children.get(key, {}).get(rid)
        if not rows:
            return [] if key in _REQUEST_ARRAY_EMPTY_AS_LIST else None
        return rows

    return {
        "id": rid, "accountId": norm(r["account_id"]), "accountName": norm(r["account_name"]),
        "account": norm(r["account_name"]), "propertyId": r["property_id"], "createdByUserId": norm(r["created_by_user_id"]),
        "requestName": norm(r["request_name"]), "requestType": norm(r["request_type"]), "segment": norm(r["segment"]),
        "status": norm(r["status"]), "paymentStatus": norm(r["payment_status"]),
        "checkIn": iso(r["check_in"]) if r["check_in"] else None, "checkOut": iso(r["check_out"]) if r["check_out"] else None,
        "eventStart": iso(r["event_start"]), "eventEnd": iso(r["event_end"]),
        "nights": r["nights"], "totalRooms": r["total_rooms"],
        "adr": float(r["adr"]) if r["adr"] is not None else None,
        "totalCost": str(r["total_cost"]) if r["total_cost"] is not None else None,
        "grandTotalNoTax": float(r["grand_total_no_tax"]) if r["grand_total_no_tax"] is not None else None,
        "receivedDate": str(r["received_date"]) if r["received_date"] else None,
        "offerDeadline": norm(str(r["offer_deadline"])) if r["offer_deadline"] else None,
        "depositDeadline": norm(str(r["deposit_deadline"])) if r["deposit_deadline"] else None,
        "paymentDeadline": norm(str(r["payment_deadline"])) if r["payment_deadline"] else None,
        "mealPlan": norm(r["meal_plan"]), "bookerName": norm(r["booker_name"]),
        "bookerContactId": norm(r["booker_contact_id"]), "promotionId": norm(r["promotion_id"]),
        "confirmationNo": norm(r["confirmation_no"]), "note": norm(r["note"]),
        "cancelReason": norm(r["cancel_reason"]), "cancelNote": norm(r["cancel_note"]),
        "createdAt": iso(r["created_at"]), "updatedAt": iso(r["updated_at"]),
        "paidAmount": str(r["paid_amount"]) if r["paid_amount"] is not None else None,
        "beoNotes": norm(r["beo_notes"]), "gisBillingInstructions": norm(r["gis_billing_instructions"]),
        "gisExpectedArrivalTime": norm(r["gis_expected_arrival_time"]), "gisOperationalNotes": norm(r["gis_operational_notes"]),
        "rooms": child_arr("rooms"), "agenda": child_arr("agenda"),
        "logs": child_arr("logs"), "payments": child_arr("payments"),
        "alerts": child_arr("alerts"), "transportation": child_arr("transportation"),
        "invoices": children.get("invoices", {}).get(rid),
        "feedback": children.get("feedback", {}).get(rid),
    }


def _row_to_request_dict(r, cur):
    """Single-row hydrate (kept for any callers); uses the same batched child loader."""
    children = _load_request_children_maps(cur, [r["id"]])
    return _request_dict_from_row(r, children)

def upsert_request(data: dict) -> dict:
    item = {**(data if isinstance(data, dict) else {})}
    is_update_flag = item.pop("_update", None) is True
    req_id = str(item.get("id") or _gen_id("R"))
    item["id"] = req_id
    property_id = str(item.get("propertyId") or "").strip() or None
    account_id = str(item.get("accountId") or "").strip() or None

    # Collision guard: explicit id that already exists must be an explicit
    # update, otherwise it's a duplicate-create -> 409 (mirrors legacy behavior).
    # Also load existing property_id so write authz cannot be bypassed by
    # sending a body with an allowed propertyId (same IDOR class as upsert_flat).
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, property_id, created_at, created_by_user_id FROM requests WHERE id = %s;",
                (req_id,),
            )
            row = cur.fetchone()
            if row and row.get("id"):
                existing_pid = str(row.get("property_id") or "").strip() or None
                _assert_upsert_write_access(existing_pid, property_id, row_exists=True)
                prev = {
                    "id": row["id"],
                    "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
                    "createdByUserId": row["created_by_user_id"],
                }
                if not (is_update_flag or _is_explicit_request_update(prev, item)):
                    raise RequestIdCollisionError(req_id, prev)
                if prev.get("createdAt"):
                    item["createdAt"] = prev["createdAt"]
                if item.get("createdByUserId") is None and prev.get("createdByUserId") is not None:
                    item["createdByUserId"] = prev["createdByUserId"]
            else:
                _assert_write_access(property_id)

    typed = {
        "account_id": account_id,
        "account_name": item.get("accountName"),
        "request_name": item.get("requestName"),
        "request_type": item.get("requestType"),
        "segment": item.get("segment"),
        "status": item.get("status"),
        "payment_status": item.get("paymentStatus"),
        "check_in": _as_date(item.get("checkIn")),
        "check_out": _as_date(item.get("checkOut")),
        "event_start": _as_datetime(item.get("eventStart")),
        "event_end": _as_datetime(item.get("eventEnd")),
        "nights": _as_int(item.get("nights")),
        "total_rooms": _as_int(item.get("totalRooms")),
        "adr": _as_decimal(item.get("adr")),
        "total_cost": _as_decimal(item.get("totalCost")),
        "grand_total_no_tax": _as_decimal(item.get("grandTotalNoTax")),
        "received_date": _as_date(item.get("receivedDate")),
        "offer_deadline": _as_date(item.get("offerDeadline")),
        "deposit_deadline": _as_date(item.get("depositDeadline")),
        "payment_deadline": _as_date(item.get("paymentDeadline")),
        "meal_plan": item.get("mealPlan"),
        "booker_name": item.get("bookerName"),
        "booker_contact_id": str(item.get("bookerContactId") or "").strip() or None,
        "promotion_id": str(item.get("promotionId") or "").strip() or None,
        "confirmation_no": item.get("confirmationNo"),
        "note": item.get("note"),
        "cancel_reason": item.get("cancelReason"),
        "cancel_note": item.get("cancelNote"),
    }
    # created_at preserved across updates
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # upsert parent
            cur.execute(
                """
                INSERT INTO requests (
                    id, account_id, account_name, property_id, created_by_user_id,
                    request_name, request_type, segment, status, payment_status,
                    check_in, check_out, event_start, event_end, nights, total_rooms,
                    adr, total_cost, grand_total_no_tax, received_date, offer_deadline,
                    deposit_deadline, payment_deadline, meal_plan, booker_name,
                    booker_contact_id, promotion_id, confirmation_no, note, cancel_reason,
                    cancel_note, created_at, updated_at
                ) VALUES (
                    %(id)s, %(account_id)s, %(account_name)s, %(property_id)s, %(created_by)s,
                    %(request_name)s, %(request_type)s, %(segment)s, %(status)s, %(payment_status)s,
                    %(check_in)s, %(check_out)s, %(event_start)s, %(event_end)s, %(nights)s, %(total_rooms)s,
                    %(adr)s, %(total_cost)s, %(grand_total_no_tax)s, %(received_date)s, %(offer_deadline)s,
                    %(deposit_deadline)s, %(payment_deadline)s, %(meal_plan)s, %(booker_name)s,
                    %(booker_contact_id)s, %(promotion_id)s, %(confirmation_no)s, %(note)s, %(cancel_reason)s,
                    %(cancel_note)s, %(created_at)s, NOW()
                )
                ON CONFLICT (id) DO UPDATE SET
                    account_id = EXCLUDED.account_id,
                    account_name = EXCLUDED.account_name,
                    property_id = EXCLUDED.property_id,
                    request_name = EXCLUDED.request_name,
                    request_type = EXCLUDED.request_type,
                    segment = EXCLUDED.segment,
                    status = EXCLUDED.status,
                    payment_status = EXCLUDED.payment_status,
                    check_in = EXCLUDED.check_in,
                    check_out = EXCLUDED.check_out,
                    event_start = EXCLUDED.event_start,
                    event_end = EXCLUDED.event_end,
                    nights = EXCLUDED.nights,
                    total_rooms = EXCLUDED.total_rooms,
                    adr = EXCLUDED.adr,
                    total_cost = EXCLUDED.total_cost,
                    grand_total_no_tax = EXCLUDED.grand_total_no_tax,
                    received_date = EXCLUDED.received_date,
                    offer_deadline = EXCLUDED.offer_deadline,
                    deposit_deadline = EXCLUDED.deposit_deadline,
                    payment_deadline = EXCLUDED.payment_deadline,
                    meal_plan = EXCLUDED.meal_plan,
                    booker_name = EXCLUDED.booker_name,
                    booker_contact_id = EXCLUDED.booker_contact_id,
                    promotion_id = EXCLUDED.promotion_id,
                    confirmation_no = EXCLUDED.confirmation_no,
                    note = EXCLUDED.note,
                    cancel_reason = EXCLUDED.cancel_reason,
                    cancel_note = EXCLUDED.cancel_note,
                    created_at = requests.created_at,
                    updated_at = NOW();
                """,
                {
                    "id": req_id,
                    "account_id": account_id,
                    "account_name": typed["account_name"],
                    "property_id": property_id,
                    "created_by": str(item.get("createdByUserId") or "").strip() or None,
                    "created_at": _as_datetime(item.get("createdAt")) or _NOW(),
                    **typed,
                },
            )
            # nested children: delete-then-insert (FK enforced)
            for child_table, (key, idgen) in _CHILD_DEFS.items():
                cur.execute(
                    sql.SQL("DELETE FROM {tbl} WHERE request_id = %s").format(
                        tbl=sql.Identifier(child_table)
                    ),
                    (req_id,),
                )
                if idgen is None:
                    # single object (invoices / feedback)
                    obj = item.get(key)
                    if isinstance(obj, dict) and obj:
                        _insert_child(cur, child_table, req_id, None, obj)
                else:
                    arr = item.get(key)
                    if isinstance(arr, list):
                        for idx, c in enumerate(arr):
                            if isinstance(c, dict):
                                _insert_child(cur, child_table, req_id, idgen, c, idx=idx)
            conn.commit()
    item["updatedAt"] = _NOW().isoformat()
    
    # Broadcast real-time change event
    event_type = "updated" if row else "created"
    _broadcast_change(event_type, "request", item, property_id)
    
    return item


def _insert_child(cur, table: str, request_id: str, idgen, child: dict, idx: int = 0):
    kind = {
        "request_rooms": "room",
        "request_payments": "payment",
        "request_agenda": "agenda",
        "request_logs": "log",
        "request_alerts": "alert",
        "request_transportation": "transport",
    }.get(table, "child")
    # Always rebuild PK from current idx — never reuse a full scoped id as-is
    # (prepended logs would collide on parent:log:0).
    cid = resolve_child_pk(request_id, kind, idx, child.get("id"))
    child_full = {**child, "id": cid, "request_id": request_id}
    if table in ("request_invoices", "request_feedback"):
        # keyed by request_id (PK), no separate id column
        child_full = {**child, "request_id": request_id}
        cur.execute(
            sql.SQL("INSERT INTO {tbl} (request_id, payload) VALUES (%s, %s)").format(
                tbl=sql.Identifier(table)
            ),
            (request_id, Json(child_full)),
        )
        return
    cols = ["id", "request_id", "payload"]
    vals = {"id": cid, "request_id": request_id, "payload": Json(child_full)}
    # typed extras per table
    extras = _child_typed(table, child, request_id)
    cols.extend(extras.keys())
    vals.update(extras)
    ph = sql.SQL(", ").join(sql.Placeholder(n) for n in cols)
    colsql = sql.SQL(", ").join(map(sql.Identifier, cols))
    cur.execute(
        sql.SQL("INSERT INTO {tbl} ({cols}) VALUES ({ph})").format(
            tbl=sql.Identifier(table), cols=colsql, ph=ph
        ),
        vals,
    )


def _child_typed(table: str, c: dict, request_id: str) -> dict:
    if table == "request_rooms":
        return {
            "type": c.get("type"),
            "count": _as_int(c.get("count")),
            "nights": _as_int(c.get("nights")),
            "occupancy": c.get("occupancy"),
            "rate": _as_decimal(c.get("rate")),
            "meal_plan": c.get("mealPlan"),
            "arrival": _as_date(c.get("arrival")),
            "departure": _as_date(c.get("departure")),
        }
    if table == "request_payments":
        return {
            "amount": _as_decimal(c.get("amount")),
            "date": _as_date(c.get("date")),
            "method": c.get("method"),
            "note": c.get("note"),
        }
    if table == "request_agenda":
        return {
            "venue": c.get("venue"),
            "shape": c.get("shape"),
            "pax": _as_int(c.get("pax")),
            "package": c.get("package"),
            "start_date": _as_date(c.get("startDate")),
            "end_date": _as_date(c.get("endDate")),
            "start_time": c.get("startTime"),
            "end_time": c.get("endTime"),
            "lunch_time": c.get("lunchTime"),
            "dinner_time": c.get("dinnerTime"),
            "coffee1": c.get("coffee1"),
            "coffee2": c.get("coffee2"),
            "rental": _as_decimal(c.get("rental")),
            "notes": c.get("notes"),
            "combined": bool(c.get("combined", False)),
            "combined_venue_names": c.get("combinedVenueNames"),
        }
    if table == "request_logs":
        return {
            "date": _as_datetime(c.get("date")),
            "action": c.get("action"),
            "log_user": c.get("logUser"),
            "details": c.get("details"),
        }
    if table == "request_alerts":
        return {
            "title": c.get("title"),
            "message": c.get("message"),
            "created_by": c.get("createdBy"),
            "created_at": _as_datetime(c.get("createdAt")),
        }
    if table == "request_transportation":
        return {
            "type": c.get("type"),
            "pax": _as_int(c.get("pax")),
            "timing": c.get("timing"),
            "cost_per_way": _as_decimal(c.get("costPerWay")),
            "notes": c.get("notes"),
        }
    # invoices / feedback: no extra typed cols
    return {}


def delete_request(req_id: str):
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # Get property_id before deleting for broadcast scoping
            cur.execute("SELECT property_id FROM requests WHERE id = %s;", (str(req_id),))
            row = cur.fetchone()
            property_id = row["property_id"] if row else None
            _assert_write_access(property_id)
            
            for child in _CHILD_DEFS:
                cur.execute(
                    sql.SQL("DELETE FROM {tbl} WHERE request_id = %s").format(
                        tbl=sql.Identifier(child)
                    ),
                    (str(req_id),),
                )
            cur.execute("DELETE FROM requests WHERE id = %s;", (str(req_id),))
            conn.commit()
    
    # Broadcast deletion event
    _broadcast_change("deleted", "request", {"id": req_id}, property_id)


# --------------------------------------------------------------------------- #
# ACCOUNTS (nested children with FK enforcement)
# --------------------------------------------------------------------------- #
# --- Normalized read layer (replaces legacy JSONB payload reads) ---
_USER_CACHE = {}

def _load_users_cache():
    global _USER_CACHE
    if _USER_CACHE:
        return _USER_CACHE
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, username, name FROM users")
            _USER_CACHE = {r["id"]: (r["name"] or r["username"]) for r in cur.fetchall()}
    return _USER_CACHE

def _row_to_account_dict(a, cur):
    USERS = _load_users_cache()
    tags = a["tags"]
    if tags is None or (isinstance(tags, list) and len(tags) == 0):
        tags = None
    pal = a["profile_audit_log"]
    if pal is None or (isinstance(pal, list) and len(pal) == 0):
        pal = None
    ou = a["owner_user_id"]
    owner_user = {"id": ou, "username": a["owner_username"], "name": USERS.get(ou, a["owner_username"])} if ou else None
    cur.execute("SELECT id, payload FROM account_contacts WHERE account_id=%s ORDER BY idx", (a["id"],))
    contacts = [
        _doc_with_row_id(r["payload"], r["id"]) if isinstance(r.get("payload"), dict) else r.get("payload")
        for r in cur.fetchall()
    ]
    cur.execute("SELECT id, payload FROM account_activities WHERE account_id=%s ORDER BY idx", (a["id"],))
    activities = [
        _doc_with_row_id(r["payload"], r["id"]) if isinstance(r.get("payload"), dict) else r.get("payload")
        for r in cur.fetchall()
    ]
    return {
        "id": a["id"], "name": a["name"], "type": a["type"], "city": a["city"],
        "street": a["street"], "country": a["country"], "website": a["website"],
        "notes": a["notes"], "clientTaxId": a["client_tax_id"], "accountOwnerName": a["account_owner_name"],
        "ownerUserId": a["owner_user_id"], "ownerUsername": a["owner_username"],
        "createdByUserId": a["created_by_user_id"], "createdByUsername": a["created_by_username"],
        "propertyId": a["property_id"], "tags": tags, "totalRequests": a["total_requests"],
        "winRate": float(a["win_rate"]) if a["win_rate"] is not None else None,
        "totalSpend": float(a["total_spend"]) if a["total_spend"] is not None else None,
        "profileAuditLog": pal, "ownerUser": owner_user,
        "contacts": contacts, "activities": activities,
    }

def list_accounts(property_id: Optional[str] = None) -> list:
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if property_id:
                pid = str(property_id)
                cur.execute(
                    """
                    SELECT * FROM accounts
                    WHERE property_id = %s OR property_id IS NULL
                    ORDER BY updated_at DESC, id ASC;
                    """,
                    (pid,),
                )
            else:
                cur.execute("SELECT * FROM accounts ORDER BY updated_at DESC, id ASC;")
            out = [_row_to_account_dict(r, cur) for r in cur.fetchall()]
    return _filter_by_tenant(out, _tenant_scope())


def get_account(account_id: str) -> Optional[dict]:
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM accounts WHERE id = %s;", (str(account_id),))
            r = cur.fetchone()
            if not r:
                return None
            acc = _row_to_account_dict(r, cur)
    # Tenant isolation: hide accounts outside the caller's property scope (IDOR).
    scope = _tenant_scope()
    if not _is_admin_scope(scope):
        pid = str(acc.get("propertyId") or "").strip()
        if pid and pid not in scope:
            return None
    return acc


def _cascade_account_rename_to_requests(cur, acc_id: str, new_name) -> int:
    """When an account is renamed, propagate the new name onto the denormalized
    `account_name` column of every linked request. Returns the number of affected
    requests so the caller can emit a single live-refresh signal. Runs inside the
    caller's transaction/cursor; a no-op (0 rows) when the name is unchanged."""
    cur.execute(
        """
        UPDATE requests
           SET account_name = %s, updated_at = NOW()
         WHERE account_id = %s
           AND account_name IS DISTINCT FROM %s
        RETURNING id;
        """,
        (new_name, acc_id, new_name),
    )
    return len(cur.fetchall())


def upsert_account(data: dict) -> dict:
    item = {**(data if isinstance(data, dict) else {})}
    acc_id = str(item.get("id") or _gen_id("A"))
    item["id"] = acc_id
    property_id = str(item.get("propertyId") or "").strip() or None
    typed = {
        "name": item.get("name"),
        "type": item.get("type"),
        "city": item.get("city"),
        "street": item.get("street"),
        "country": item.get("country"),
        "website": item.get("website"),
        "notes": item.get("notes"),
        "client_tax_id": item.get("clientTaxId"),
        "account_owner_name": item.get("accountOwnerName"),
        "owner_user_id": str(item.get("ownerUserId") or "").strip() or None,
        "owner_username": item.get("ownerUsername"),
        "created_by_user_id": str(item.get("createdByUserId") or "").strip() or None,
        "created_by_username": item.get("createdByUsername"),
        "total_requests": _as_int(item.get("totalRequests")),
        "win_rate": _as_decimal(item.get("winRate")),
        "total_spend": _as_decimal(item.get("totalSpend")),
    }
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT property_id FROM accounts WHERE id = %s;", (acc_id,))
            existing = cur.fetchone()
            if existing:
                existing_pid = str(existing.get("property_id") or "").strip() or None
                _assert_upsert_write_access(existing_pid, property_id, row_exists=True)
            else:
                _assert_write_access(property_id)
            cur.execute(
                """
                INSERT INTO accounts (
                    id, name, type, city, street, country, website, notes, client_tax_id,
                    account_owner_name, owner_user_id, owner_username, created_by_user_id,
                    created_by_username, property_id, tags, total_requests, win_rate, total_spend,
                    profile_audit_log, created_at, updated_at
                ) VALUES (
                    %(id)s, %(name)s, %(type)s, %(city)s, %(street)s, %(country)s, %(website)s, %(notes)s, %(client_tax_id)s,
                    %(account_owner_name)s, %(owner_user_id)s, %(owner_username)s, %(created_by_user_id)s,
                    %(created_by_username)s, %(property_id)s, %(tags)s, %(total_requests)s, %(win_rate)s, %(total_spend)s,
                    %(profile_audit_log)s, NOW(), NOW()
                )
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name, type = EXCLUDED.type, city = EXCLUDED.city,
                    street = EXCLUDED.street, country = EXCLUDED.country, website = EXCLUDED.website,
                    notes = EXCLUDED.notes, client_tax_id = EXCLUDED.client_tax_id,
                    account_owner_name = EXCLUDED.account_owner_name,
                    owner_user_id = EXCLUDED.owner_user_id, owner_username = EXCLUDED.owner_username,
                    created_by_user_id = COALESCE(EXCLUDED.created_by_user_id, accounts.created_by_user_id),
                    created_by_username = EXCLUDED.created_by_username,
                    property_id = EXCLUDED.property_id, tags = EXCLUDED.tags,
                    total_requests = EXCLUDED.total_requests, win_rate = EXCLUDED.win_rate,
                    total_spend = EXCLUDED.total_spend,
                    profile_audit_log = EXCLUDED.profile_audit_log,
                    updated_at = NOW();
                """,
                {
                    "id": acc_id,
                    **typed,
                    "property_id": property_id,
                    "tags": Json(item.get("tags") or []),
                    "profile_audit_log": Json(item.get("profileAuditLog") or []),
                },
            )
            # nested children
            cur.execute("DELETE FROM account_contacts WHERE account_id = %s;", (acc_id,))
            for idx, c in enumerate(item.get("contacts") or []):
                if isinstance(c, dict):
                    _insert_account_contact(cur, acc_id, c, idx=idx)
            cur.execute("DELETE FROM account_activities WHERE account_id = %s;", (acc_id,))
            for idx, a in enumerate(item.get("activities") or []):
                if isinstance(a, dict):
                    _insert_account_activity(cur, acc_id, a, idx=idx)
            # Keep the denormalized account_name on linked requests in sync so the
            # requests list / reports reflect a rename without re-editing each request.
            renamed_count = _cascade_account_rename_to_requests(cur, acc_id, item.get("name"))
            conn.commit()
    item["updatedAt"] = _NOW().isoformat()
    
    # Broadcast real-time change event
    _broadcast_change("updated", "account", item, property_id)
    # If a rename touched linked requests, emit ONE lightweight refresh signal so
    # every open list (requests, dashboard, CRM) refetches — instead of one event
    # per request, which would flood the socket for large accounts.
    if renamed_count:
        _broadcast_change("refresh", "request", {"reason": "account_rename", "accountId": acc_id}, property_id)
    
    return item


def _insert_account_contact(cur, account_id: str, c: dict, idx: int = 0):
    raw = c.get("id")
    if raw is not None and str(raw).strip() != "":
        sraw = str(raw).strip()
        cid = sraw if sraw.startswith(f"{account_id}:") else scoped_child_id(account_id, "contact", idx, sraw)
    else:
        cid = scoped_child_id(account_id, "contact", idx, None)
    c_full = {**c, "id": cid, "account_id": account_id}
    cur.execute(
        """
        INSERT INTO account_contacts (
            id, account_id, first_name, last_name, name, position, email, phone, city, country, payload, idx
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            account_id = EXCLUDED.account_id, first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name, name = EXCLUDED.name, position = EXCLUDED.position,
            email = EXCLUDED.email, phone = EXCLUDED.phone, city = EXCLUDED.city,
            country = EXCLUDED.country, payload = EXCLUDED.payload, idx = EXCLUDED.idx;
        """,
        (
            cid,
            account_id,
            c.get("firstName"),
            c.get("lastName"),
            c.get("name"),
            c.get("position"),
            c.get("email"),
            c.get("phone"),
            c.get("city"),
            c.get("country"),
            Json(c_full),
            idx,
        ),
    )


def _insert_account_activity(cur, account_id: str, a: dict, idx: int = 0):
    raw = a.get("id")
    if raw is not None and str(raw).strip() != "":
        sraw = str(raw).strip()
        aid = sraw if sraw.startswith(f"{account_id}:") else scoped_child_id(account_id, "activity", idx, sraw)
    else:
        aid = scoped_child_id(account_id, "activity", idx, None)
    a_full = {**a, "id": aid, "account_id": account_id}
    cur.execute(
        """
        INSERT INTO account_activities (
            id, account_id, title, body, activity_user, at, crm_lead_id, payload, idx
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            account_id = EXCLUDED.account_id, title = EXCLUDED.title, body = EXCLUDED.body,
            activity_user = EXCLUDED.activity_user, at = EXCLUDED.at,
            crm_lead_id = EXCLUDED.crm_lead_id, payload = EXCLUDED.payload, idx = EXCLUDED.idx;
        """,
        (
            aid,
            account_id,
            a.get("title"),
            a.get("body"),
            a.get("activityUser") or a.get("user"),
            _as_datetime(a.get("at")),
            a.get("crmLeadId"),
            Json(a_full),
            idx,
        ),
    )


def delete_account(account_id: str):
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # Get property_id before deleting for broadcast scoping
            cur.execute("SELECT property_id FROM accounts WHERE id = %s;", (str(account_id),))
            row = cur.fetchone()
            property_id = row["property_id"] if row else None
            _assert_write_access(property_id)
            
            cur.execute("DELETE FROM account_contacts WHERE account_id = %s;", (str(account_id),))
            cur.execute("DELETE FROM account_activities WHERE account_id = %s;", (str(account_id),))
            # Rates cascade via FK when present; explicit delete covers DBs before 011 migration.
            cur.execute("SELECT to_regclass('public.account_rates') AS t;")
            if cur.fetchone().get("t"):
                cur.execute("DELETE FROM account_rates WHERE account_id = %s;", (str(account_id),))
            cur.execute("DELETE FROM accounts WHERE id = %s;", (str(account_id),))
            conn.commit()
    
    # Broadcast deletion event
    _broadcast_change("deleted", "account", {"id": account_id}, property_id)


# --------------------------------------------------------------------------- #
# Type coercion helpers
# --------------------------------------------------------------------------- #
def _as_int(v: Any) -> Optional[int]:
    try:
        if v is None or v == "":
            return None
        return int(v)
    except (TypeError, ValueError):
        return None


def _as_decimal(v: Any) -> Optional[float]:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _as_date(v: Any) -> Optional[str]:
    if v in (None, ""):
        return None
    if isinstance(v, str):
        return v[:10] if len(v) >= 10 else v
    return str(v)


def _as_datetime(v: Any) -> Optional[str]:
    if v in (None, ""):
        return None
    if isinstance(v, str):
        return v
    return str(v)
