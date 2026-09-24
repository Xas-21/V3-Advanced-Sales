#!/usr/bin/env python3
"""
AS Phase 2 — Lossless migration: legacy JSON collections -> normalized tables.
READ-ONLY source: never deletes/updates legacy tables.
Idempotent: re-run safe (uses ON CONFLICT DO NOTHING / upsert by id).
"""
import json
import os
import sys
import uuid

import bcrypt
import psycopg
from psycopg.rows import dict_row

# Allow `python migrations/002_migrate.py` and `RUN_MIGRATE=1` from backend/
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from child_ids import ensure_scoped_child_id

DSN = os.environ.get("DATABASE_URL") or "postgresql://as_owner:***@as-postgres:5432/as-postgres"


def empty_to_none(v):
    if v is None or v == "" or v == "null":
        return None
    return v


def ensure_bcrypt(password: str | None) -> str:
    p = password or ""
    if isinstance(p, str) and p.startswith("$2") and len(p) >= 50:
        return p  # already bcrypt
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def short_id(row_id: str | None, payload_id: str | None) -> str | None:
    """app_collection_rows.row_id may be PROPERTY::SHORT."""
    if payload_id:
        return str(payload_id)
    if not row_id:
        return None
    return row_id.split("::", 1)[-1]


def property_scoped_id(property_id: str | None, original_id: str | None) -> str | None:
    """Property-scoped PK for flat collections; payload keeps original frontend id."""
    if property_id and original_id:
        return f"{property_id}::{original_id}"
    return original_id or property_id


def collection_pk(
    row_id: str | None,
    property_id: str | None,
    payload_id: str | None,
    used_pks: set[str],
    *,
    skip_duplicates: bool = False,
) -> str | None:
    """Assign stable PK; prefer property-scoped id, fall back to unique blob row_id on collision.

    skip_duplicates=True (taxes): keep one row per property-scoped type — do not invent #N ids
    for historical duplicate rates in the same property blob.
    """
    pk = property_scoped_id(property_id, payload_id)
    if not pk:
        pk = row_id
    if pk and pk not in used_pks:
        used_pks.add(pk)
        return pk
    if skip_duplicates:
        return None
    for fallback in (row_id, f"{pk}#{len(used_pks)}" if pk else None):
        if fallback and fallback not in used_pks:
            used_pks.add(fallback)
            return fallback
    return pk


def with_id(x, anchor):
    """Guarantee an 'id' field exists on a child object; deterministic per (anchor,index).

    Deprecated for migrate paths that need cross-parent uniqueness — prefer
    ensure_scoped_child_id(parent_id, kind, idx, x) from child_ids.
    """
    if not x.get("id"):
        seed = str(x.get("accountId") or x.get("id") or anchor)
        h = uuid.uuid5(uuid.NAMESPACE_DNS, f"{anchor}:{seed}")
        x["id"] = "M" + h.hex[:11]
    return x


def d(v):
    """Map empty string / None -> None for DATE columns."""
    return empty_to_none(v)


def ts(v):
    """Map empty string / None -> None for TIMESTAMP columns."""
    return empty_to_none(v)


def jget(d, *keys, default=None):
    cur = d
    for k in keys:
        if isinstance(cur, dict):
            cur = cur.get(k, default)
        else:
            return default
    return cur


def conn():
    return psycopg.connect(DSN, row_factory=dict_row, autocommit=False)


def upsert(cur, table, cols, rows):
    if not rows:
        return 0
    clean_rows = []
    for r in rows:
        clean = {}
        for k, v in r.items():
            if isinstance(v, (dict, list)):
                v = json.dumps(v)
            elif v == "":
                v = None
            clean[k] = v
        clean_rows.append(clean)
    cols_sql = ", ".join(cols)
    placeholders = ", ".join(f"%({c})s" for c in cols)
    conflict = cols[0]
    updates = ", ".join(f"{c}=EXCLUDED.{c}" for c in cols[1:])
    sql = f"INSERT INTO {table} ({cols_sql}) VALUES ({placeholders}) ON CONFLICT ({conflict}) DO UPDATE SET {updates}"
    cur.executemany(sql, clean_rows)
    return len(rows)


NEW_TABLES = [
    "users", "properties", "accounts", "account_contacts", "account_activities",
    "requests", "request_rooms", "request_payments", "request_agenda", "request_invoices",
    "request_logs", "request_alerts", "request_transportation", "request_feedback",
    "rooms", "venues", "taxes", "financials", "tasks", "promotions",
    "contract_templates", "cxl_reasons", "crm_state", "sessions", "migration_orphans",
    # empty feature tables (V2 schema) — truncate on re-run only
    "account_ledger", "account_rates", "crm_card_comments",
    "chat_messages", "chat_participants", "chat_invite_links", "chat_conversations",
    "feed_reactions", "feed_poll_votes", "feed_event_rsvps", "feed_comments", "feed_posts",
]


def reset(cur):
    """Idempotent re-run safety: clear only the NEW relational tables (legacy untouched)."""
    cur.execute("TRUNCATE %s RESTART IDENTITY CASCADE" % ", ".join(NEW_TABLES))


def migrate():
    c = conn()
    cur = c.cursor()
    counts = {}

    cur.execute("""
        CREATE TABLE IF NOT EXISTS migration_orphans (
            id serial PRIMARY KEY,
            target_table text NOT NULL,
            parent_key text,
            parent_id text,
            payload jsonb NOT NULL,
            created_at timestamptz DEFAULT now()
        )
    """)

    reset(cur)

    def filter_fk(rows, fk_field, valid_ids, table_name):
        """Split rows into those with valid FK target (keep) and orphans (log)."""
        kept, orphans = [], []
        for r in rows:
            pid = r.get(fk_field)
            if pid is None or pid in valid_ids:
                kept.append(r)
            else:
                orphans.append(r)
        if orphans:
            cur.executemany(
                "INSERT INTO migration_orphans (target_table, parent_key, parent_id, payload) VALUES (%s,%s,%s,%s)",
                [(table_name, fk_field, o.get(fk_field), json.dumps(o)) for o in orphans],
            )
        return kept

    def nullify_invalid_fk(rows, fk_field, valid_ids, table_name, id_field="id"):
        """Nullify dangling user FKs on parent rows; log orphan FK value (keep parent row)."""
        for r in rows:
            pid = r.get(fk_field)
            if pid is not None and pid not in valid_ids:
                cur.execute(
                    "INSERT INTO migration_orphans (target_table, parent_key, parent_id, payload) VALUES (%s,%s,%s,%s)",
                    (table_name, fk_field, r.get(id_field), json.dumps({fk_field: pid, "row_id": r.get(id_field)})),
                )
                r[fk_field] = None
        return rows

    # ---- PROPERTIES (before users — users.property_id FK) ----
    cur.execute("SELECT payload FROM app_collection_rows WHERE collection_name='properties'")
    props = [r["payload"] for r in cur.fetchall()]
    rows = []
    for p in props:
        rows.append({
            "id": p.get("id"),
            "name": p.get("name"),
            "city": p.get("city"),
            "country": p.get("country"),
            "email": p.get("email"),
            "phone": p.get("phone"),
            "logo_url": p.get("logoUrl"),
            "total_rooms": p.get("totalRooms"),
            "account_types": json.dumps(p.get("accountTypes", [])),
            "segments": json.dumps(p.get("segments", [])),
            "occupancy_types": json.dumps(p.get("occupancyTypes", [])),
            "payment_methods": json.dumps(p.get("paymentMethods", [])),
            "event_packages": json.dumps(p.get("eventPackages", [])),
            "form_configurations": json.dumps(p.get("formConfigurations", {})),
            "alert_settings": json.dumps(p.get("alertSettings", {})),
            "call_settings": json.dumps(p.get("callSettings", {})),
            "assigned_user_ids": json.dumps(p.get("assignedUserIds", [])),
            "payload": json.dumps(p),
        })
    counts["properties"] = upsert(
        cur,
        "properties",
        [
            "id", "name", "city", "country", "email", "phone", "logo_url", "total_rooms",
            "account_types", "segments", "occupancy_types", "payment_methods", "event_packages",
            "form_configurations", "alert_settings", "call_settings", "assigned_user_ids", "payload",
        ],
        rows,
    )
    cur.execute("SELECT id FROM properties")
    valid_property_ids = {r["id"] for r in cur.fetchall()}

    # Stub any property id referenced by blobs so child rows are not dropped.
    cur.execute("""
        SELECT DISTINCT pid FROM (
            SELECT NULLIF(btrim(payload->>'propertyId'), '') AS pid FROM accounts_rows
            UNION
            SELECT NULLIF(btrim(property_id), '') FROM accounts_rows
            UNION
            SELECT NULLIF(btrim(payload->>'propertyId'), '') FROM requests_rows
            UNION
            SELECT NULLIF(btrim(property_id), '') FROM requests_rows
            UNION
            SELECT NULLIF(btrim(payload->>'propertyId'), '') FROM app_collection_rows
            UNION
            SELECT NULLIF(btrim(property_id), '') FROM app_collection_rows
            UNION
            SELECT NULLIF(btrim(map_key), '') FROM app_collection_maps WHERE collection_name = 'crm_state'
        ) s
        WHERE pid IS NOT NULL
    """)
    stub_props = []
    for r in cur.fetchall():
        pid = empty_to_none(r.get("pid"))
        if not pid or pid in valid_property_ids:
            continue
        stub_props.append({
            "id": pid,
            "name": f"Recovered property {pid}",
            "city": None,
            "country": None,
            "email": None,
            "phone": None,
            "logo_url": None,
            "total_rooms": None,
            "account_types": "[]",
            "segments": "[]",
            "occupancy_types": "[]",
            "payment_methods": "[]",
            "event_packages": "[]",
            "form_configurations": "{}",
            "alert_settings": "{}",
            "call_settings": "{}",
            "assigned_user_ids": "[]",
            "payload": json.dumps({"id": pid, "name": f"Recovered property {pid}", "_recoveredStub": True}),
        })
        valid_property_ids.add(pid)
    if stub_props:
        counts["properties_stubs"] = upsert(
            cur,
            "properties",
            [
                "id", "name", "city", "country", "email", "phone", "logo_url", "total_rooms",
                "account_types", "segments", "occupancy_types", "payment_methods", "event_packages",
                "form_configurations", "alert_settings", "call_settings", "assigned_user_ids", "payload",
            ],
            stub_props,
        )

    # ---- USERS (from app_collection_rows collection='users') ----
    cur.execute("SELECT payload FROM app_collection_rows WHERE collection_name='users'")
    users = [r["payload"] for r in cur.fetchall()]
    rows = []
    for u in users:
        uname = u.get("username")
        display = u.get("name") or uname or "?"
        rows.append({
            "id": u.get("id"),
            "username": uname,
            "password": ensure_bcrypt(u.get("password")),
            "name": display,
            "email": u.get("email"),
            "role": u.get("role", "Sales Executive"),
            "status": (u.get("status") or "active"),
            "property_id": empty_to_none(u.get("propertyId")),
            "permission_grants": json.dumps(u.get("permissionGrants", [])),
            "permission_revokes": json.dumps(u.get("permissionRevokes", [])),
            "stats": json.dumps(u.get("stats", {})),
            "session_version": int(u.get("sessionVersion", 0) or 0),
            "avatar": u.get("avatar"),
            "phone": u.get("phone"),
            "assigned_property_ids": json.dumps(u.get("property_ids") or u.get("assignedPropertyIds") or []),
            "payload": json.dumps(u),
        })
    rows = nullify_invalid_fk(rows, "property_id", valid_property_ids, "users")
    counts["users"] = upsert(
        cur,
        "users",
        [
            "id", "username", "password", "name", "email", "role", "status", "property_id",
            "permission_grants", "permission_revokes", "stats", "session_version", "avatar",
            "phone", "assigned_property_ids", "payload",
        ],
        rows,
    )
    cur.execute("SELECT id FROM users")
    valid_user_ids = {r["id"] for r in cur.fetchall()}

    # ---- ACCOUNTS ----
    cur.execute("SELECT id, property_id, created_by_user_id, payload FROM accounts_rows")
    acc = cur.fetchall()
    arows, crows, actrows = [], [], []
    # (account_id, original contact id) -> scoped account_contacts.id
    raw_to_scoped: dict[tuple[str, str], str] = {}
    for r in acc:
        p = r["payload"]
        arows.append({
            "id": p.get("id"),
            "name": p.get("name"),
            "type": p.get("type"),
            "city": p.get("city"),
            "street": p.get("street"),
            "country": p.get("country"),
            "website": p.get("website"),
            "notes": p.get("notes"),
            "client_tax_id": p.get("clientTaxId"),
            "account_owner_name": p.get("accountOwnerName"),
            "owner_user_id": empty_to_none(p.get("ownerUserId")),
            "owner_username": p.get("ownerUsername"),
            "created_by_user_id": empty_to_none(p.get("createdByUserId")),
            "created_by_username": p.get("createdByUsername"),
            "property_id": empty_to_none(p.get("propertyId")),
            "tags": json.dumps(p.get("tags", [])),
            "total_requests": p.get("totalRequests"),
            "win_rate": p.get("winRate"),
            "total_spend": p.get("totalSpend"),
            "profile_audit_log": json.dumps(p.get("profileAuditLog", [])),
            "created_at": r.get("created_at"),
            "updated_at": r.get("updated_at"),
        })
        for i, ct in enumerate(p.get("contacts") or []):
            raw_cid = empty_to_none(ct.get("id"))
            ct = ensure_scoped_child_id(p.get("id"), "contact", i, ct)
            if raw_cid is not None:
                raw_to_scoped[(str(p.get("id") or ""), str(raw_cid))] = ct.get("id")
            crows.append({
                "id": ct.get("id"),
                "account_id": p.get("id"),
                "first_name": ct.get("firstName"),
                "last_name": ct.get("lastName"),
                "name": ct.get("name"),
                "position": ct.get("position"),
                "email": ct.get("email"),
                "phone": ct.get("phone"),
                "city": ct.get("city"),
                "country": ct.get("country"),
                "payload": json.dumps(ct),
                "idx": i,
            })
        for i, ac in enumerate(p.get("activities") or []):
            ac = ensure_scoped_child_id(p.get("id"), "activity", i, ac)
            actrows.append({
                "id": ac.get("id"),
                "account_id": p.get("id"),
                "title": ac.get("title"),
                "body": ac.get("body"),
                "activity_user": ac.get("user"),
                "at": ac.get("at"),
                "crm_lead_id": ac.get("crmLeadId"),
                "payload": json.dumps(ac),
                "idx": i,
            })
    arows = nullify_invalid_fk(arows, "owner_user_id", valid_user_ids, "accounts")
    arows = nullify_invalid_fk(arows, "created_by_user_id", valid_user_ids, "accounts")
    arows = filter_fk(arows, "property_id", valid_property_ids, "accounts")
    counts["accounts"] = upsert(
        cur,
        "accounts",
        [
            "id", "name", "type", "city", "street", "country", "website", "notes", "client_tax_id",
            "account_owner_name", "owner_user_id", "owner_username", "created_by_user_id",
            "created_by_username", "property_id", "tags", "total_requests", "win_rate", "total_spend",
            "profile_audit_log", "created_at", "updated_at",
        ],
        arows,
    )
    account_ids = {a["id"] for a in arows}
    # Replace children fully — scoped PKs change on remigrate; leave no stale colliding ids.
    cur.execute("DELETE FROM account_contacts")
    cur.execute("DELETE FROM account_activities")
    crows = filter_fk(crows, "account_id", account_ids, "account_contacts")
    counts["account_contacts"] = upsert(
        cur,
        "account_contacts",
        ["id", "account_id", "first_name", "last_name", "name", "position", "email", "phone", "city", "country", "payload", "idx"],
        crows,
    )
    actrows = filter_fk(actrows, "account_id", account_ids, "account_activities")
    counts["account_activities"] = upsert(
        cur,
        "account_activities",
        ["id", "account_id", "title", "body", "activity_user", "at", "crm_lead_id", "payload", "idx"],
        actrows,
    )

    # ---- PROPERTY COLLECTIONS (promotions must exist before request.promotion_id FK) ----
    for coll, table, cols in [
        ("room_types", "rooms", ["id", "property_id", "name", "count", "size", "base_rate", "capacity", "payload"]),
        ("venues", "venues", ["id", "property_id", "name", "is_combined", "shapes", "width", "length", "height", "area", "capacity", "payload"]),
        ("taxes", "taxes", ["id", "property_id", "label", "rate", "scope", "payload"]),
        ("financials", "financials", ["id", "property_id", "year", "months", "payload"]),
        ("tasks", "tasks", ["id", "property_id", "task", "client", "priority", "completed", "date", "star", "category", "description", "assigned_to", "assignees", "payload"]),
        ("promotions", "promotions", ["id", "property_id", "name", "status", "start_date", "end_date", "terms", "segments", "linked_accounts", "include_rooms_revenue", "include_events_revenue", "payload"]),
    ]:
        cur.execute(
            "SELECT row_id, payload, updated_at FROM app_collection_rows WHERE collection_name=%s ORDER BY updated_at NULLS FIRST, row_id",
            (coll,),
        )
        rows = []
        used_pks: set[str] = set()
        tax_by_id: dict[str, dict] = {}
        for r in cur.fetchall():
            p = r["payload"]
            prop_id = empty_to_none(p.get("propertyId"))
            pk = collection_pk(
                r.get("row_id"),
                prop_id,
                p.get("id"),
                used_pks,
                skip_duplicates=(table == "taxes"),
            )
            if not pk:
                if table != "taxes":
                    continue
                # Within-property tax type collision: last row wins (keeps latest rates).
                pk = property_scoped_id(prop_id, p.get("id")) or r.get("row_id")
                if not pk:
                    continue
            row = {
                "id": pk,
                "payload": json.dumps(p),
            }
            if table == "rooms":
                row.update({"property_id": prop_id, "name": p.get("name"), "count": p.get("count"), "size": p.get("size"), "base_rate": p.get("baseRate"), "capacity": p.get("capacity")})
            elif table == "venues":
                row.update({"property_id": prop_id, "name": p.get("name"), "is_combined": p.get("isCombined"), "shapes": json.dumps(p.get("shapes", [])), "width": p.get("width"), "length": p.get("length"), "height": p.get("height"), "area": p.get("area"), "capacity": p.get("capacity")})
            elif table == "taxes":
                row["_src_updated_at"] = r.get("updated_at")
                row.update({"property_id": prop_id, "label": p.get("label"), "rate": p.get("rate"), "scope": p.get("scope")})
            elif table == "financials":
                row.update({"property_id": prop_id, "year": p.get("year"), "months": json.dumps(p.get("months", []))})
            elif table == "tasks":
                row.update({"property_id": prop_id, "task": p.get("task"), "client": p.get("client"), "priority": p.get("priority"), "completed": p.get("completed"), "date": d(p.get("date")), "star": p.get("star"), "category": p.get("category"), "description": p.get("description"), "assigned_to": p.get("assignedTo"), "assignees": json.dumps(p.get("assignees", []))})
            elif table == "promotions":
                row.update({"property_id": prop_id, "name": p.get("name"), "status": p.get("status"), "start_date": d(p.get("startDate")), "end_date": d(p.get("endDate")), "terms": p.get("terms"), "segments": json.dumps(p.get("segments", [])), "linked_accounts": json.dumps(p.get("linkedAccounts", [])), "include_rooms_revenue": p.get("includeRoomsRevenue"), "include_events_revenue": p.get("includeEventsRevenue")})
            if table == "taxes":
                prev = tax_by_id.get(pk)
                prev_ts = prev.get("_src_updated_at") if prev else None
                new_ts = row.get("_src_updated_at")
                if prev is None or prev_ts is None or (new_ts is not None and new_ts >= prev_ts):
                    tax_by_id[pk] = row
            else:
                rows.append(row)
        if table == "taxes":
            rows = list(tax_by_id.values())
            for row in rows:
                row.pop("_src_updated_at", None)
            # Drop historical #N / bare-id leftovers from earlier migrate passes.
            cur.execute("DELETE FROM taxes")
        rows = filter_fk(rows, "property_id", valid_property_ids, table)
        counts[table] = upsert(cur, table, cols, rows)

    cur.execute("SELECT id FROM promotions")
    promo_ids = {r["id"] for r in cur.fetchall()}
    stored_contact_ids = {c["id"] for c in crows}

    def resolve_booker(account_id, raw_booker, request_id):
        raw = empty_to_none(raw_booker)
        if raw is None:
            return None
        raw_s = str(raw)
        mapped = raw_to_scoped.get((str(account_id or ""), raw_s))
        if mapped:
            return mapped
        if raw_s in stored_contact_ids:
            return raw_s
        cur.execute(
            "INSERT INTO migration_orphans (target_table, parent_key, parent_id, payload) VALUES (%s,%s,%s,%s)",
            ("requests", "booker_contact_id", request_id, json.dumps({"booker_contact_id": raw_s, "account_id": account_id})),
        )
        return None

    def resolve_promotion(property_id, raw_promo, request_id):
        raw = empty_to_none(raw_promo)
        if raw is None:
            return None
        raw_s = str(raw)
        scoped = property_scoped_id(empty_to_none(property_id), raw_s)
        if scoped and scoped in promo_ids:
            return scoped
        if raw_s in promo_ids:
            return raw_s
        cur.execute(
            "INSERT INTO migration_orphans (target_table, parent_key, parent_id, payload) VALUES (%s,%s,%s,%s)",
            ("requests", "promotion_id", request_id, json.dumps({"promotion_id": raw_s, "property_id": property_id})),
        )
        return None

    # ---- REQUESTS ----
    cur.execute(
        "SELECT id, property_id, created_by_user_id, payload, created_at, updated_at FROM requests_rows"
    )
    req = cur.fetchall()
    rrows, rm, rp, ra, rl, ral, rtr, rinv = [], [], [], [], [], [], [], []
    for r in req:
        p = r["payload"]
        rid = p.get("id")
        rrows.append({
            "id": rid,
            "account_id": empty_to_none(p.get("accountId")),
            "account_name": p.get("accountName"),
            "property_id": empty_to_none(p.get("propertyId")),
            "created_by_user_id": empty_to_none(p.get("createdByUserId")),
            "request_name": p.get("requestName"),
            "request_type": p.get("requestType"),
            "segment": p.get("segment"),
            "status": p.get("status"),
            "payment_status": p.get("paymentStatus"),
            "check_in": d(p.get("checkIn")),
            "check_out": d(p.get("checkOut")),
            "event_start": ts(p.get("eventStart")),
            "event_end": ts(p.get("eventEnd")),
            "nights": p.get("nights"),
            "total_rooms": p.get("totalRooms"),
            "adr": p.get("adr"),
            "total_cost": p.get("totalCost"),
            "grand_total_no_tax": p.get("grandTotalNoTax"),
            "received_date": d(p.get("receivedDate")),
            "offer_deadline": d(p.get("offerDeadline")),
            "deposit_deadline": d(p.get("depositDeadline")),
            "payment_deadline": d(p.get("paymentDeadline")),
            "meal_plan": p.get("mealPlan"),
            "booker_name": p.get("bookerName"),
            "booker_contact_id": resolve_booker(p.get("accountId"), p.get("bookerContactId"), rid),
            "promotion_id": resolve_promotion(p.get("propertyId"), p.get("promotionId"), rid),
            "confirmation_no": p.get("confirmationNo"),
            "note": p.get("note"),
            "cancel_reason": p.get("cancelReason"),
            "cancel_note": p.get("cancelNote"),
            "updated_at": ts(p.get("updatedAt")) or ts(r.get("updated_at")),
            "created_at": ts(p.get("createdAt")) or ts(r.get("created_at")),
            "paid_amount": p.get("paidAmount"),
            "beo_notes": p.get("beoNotes"),
            "gis_billing_instructions": p.get("gisBillingInstructions"),
            "gis_expected_arrival_time": p.get("gisExpectedArrivalTime"),
            "gis_operational_notes": p.get("gisOperationalNotes"),
        })
        for i, x in enumerate(p.get("rooms") or []):
            x = ensure_scoped_child_id(rid, "room", i, x)
            rm.append({
                "id": x.get("id"), "request_id": rid, "type": x.get("type"), "count": x.get("count"),
                "nights": x.get("nights"), "occupancy": x.get("occupancy"), "rate": x.get("rate"),
                "meal_plan": x.get("mealPlan"), "arrival": x.get("arrival"), "departure": x.get("departure"),
                "payload": json.dumps(x), "idx": i,
            })
        for i, x in enumerate(p.get("payments") or []):
            x = ensure_scoped_child_id(rid, "payment", i, x)
            rp.append({
                "id": x.get("id"), "request_id": rid, "amount": x.get("amount"), "date": d(x.get("date")),
                "method": x.get("method"), "note": x.get("note"), "payload": json.dumps(x), "idx": i,
            })
        for i, x in enumerate(p.get("agenda") or []):
            x = ensure_scoped_child_id(rid, "agenda", i, x)
            ra.append({
                "id": x.get("id"), "request_id": rid, "venue": x.get("venue"), "shape": x.get("shape"),
                "pax": x.get("pax"), "package": x.get("package"), "start_date": x.get("startDate"),
                "end_date": x.get("endDate"), "start_time": x.get("startTime"), "end_time": x.get("endTime"),
                "lunch_time": x.get("lunchTime"), "dinner_time": x.get("dinnerTime"), "coffee1": x.get("coffee1"),
                "coffee2": x.get("coffee2"), "rental": x.get("rental"), "notes": x.get("notes"),
                "combined": x.get("combined"), "combined_venue_names": x.get("combinedVenueNames"),
                "payload": json.dumps(x), "idx": i,
            })
        for i, x in enumerate(p.get("logs") or []):
            x = ensure_scoped_child_id(rid, "log", i, x)
            rl.append({
                "id": x.get("id"), "request_id": rid, "date": x.get("date"), "action": x.get("action"),
                "log_user": x.get("user"), "details": x.get("details"), "payload": json.dumps(x), "idx": i,
            })
        for i, x in enumerate(p.get("alerts") or []):
            x = ensure_scoped_child_id(rid, "alert", i, x)
            ral.append({
                "id": x.get("id"), "request_id": rid, "title": x.get("title"), "message": x.get("message"),
                "created_by": x.get("createdBy"), "created_at": x.get("createdAt"),
                "payload": json.dumps(x), "idx": i,
            })
        for i, x in enumerate(p.get("transportation") or []):
            x = ensure_scoped_child_id(rid, "transport", i, x)
            rtr.append({
                "id": x.get("id"), "request_id": rid, "type": x.get("type"), "pax": x.get("pax"),
                "timing": x.get("timing"), "cost_per_way": x.get("costPerWay"), "notes": x.get("notes"),
                "payload": json.dumps(x), "idx": i,
            })
        inv = p.get("invoices") or {}
        if inv:
            rinv.append({
                "request_id": rid,
                "agreement": json.dumps(inv.get("agreement")),
                "inv1": json.dumps(inv.get("inv1")),
                "inv2": json.dumps(inv.get("inv2")),
                "inv3": json.dumps(inv.get("inv3")),
                "payload": json.dumps(inv),
                "idx": 0,
            })
    rrows = nullify_invalid_fk(rrows, "created_by_user_id", valid_user_ids, "requests")
    rrows = nullify_invalid_fk(rrows, "account_id", account_ids, "requests")
    rrows = nullify_invalid_fk(rrows, "property_id", valid_property_ids, "requests")
    counts["requests"] = upsert(
        cur,
        "requests",
        [
            "id", "account_id", "account_name", "property_id", "created_by_user_id", "request_name",
            "request_type", "segment", "status", "payment_status", "check_in", "check_out", "event_start",
            "event_end", "nights", "total_rooms", "adr", "total_cost", "grand_total_no_tax", "received_date",
            "offer_deadline", "deposit_deadline", "payment_deadline", "meal_plan", "booker_name",
            "booker_contact_id", "promotion_id", "confirmation_no", "note", "cancel_reason", "cancel_note",
            "updated_at", "created_at", "paid_amount", "beo_notes", "gis_billing_instructions",
            "gis_expected_arrival_time", "gis_operational_notes",
        ],
        rrows,
    )
    req_ids = {r["id"] for r in rrows}
    cur.execute("DELETE FROM request_rooms")
    cur.execute("DELETE FROM request_payments")
    cur.execute("DELETE FROM request_agenda")
    cur.execute("DELETE FROM request_logs")
    cur.execute("DELETE FROM request_alerts")
    cur.execute("DELETE FROM request_transportation")
    cur.execute("DELETE FROM request_invoices")
    cur.execute("DELETE FROM request_feedback")
    rm = filter_fk(rm, "request_id", req_ids, "request_rooms")
    counts["request_rooms"] = upsert(
        cur, "request_rooms",
        ["id", "request_id", "type", "count", "nights", "occupancy", "rate", "meal_plan", "arrival", "departure", "payload", "idx"],
        rm,
    )
    rp = filter_fk(rp, "request_id", req_ids, "request_payments")
    counts["request_payments"] = upsert(
        cur, "request_payments",
        ["id", "request_id", "amount", "date", "method", "note", "payload", "idx"],
        rp,
    )
    ra = filter_fk(ra, "request_id", req_ids, "request_agenda")
    counts["request_agenda"] = upsert(
        cur, "request_agenda",
        [
            "id", "request_id", "venue", "shape", "pax", "package", "start_date", "end_date", "start_time",
            "end_time", "lunch_time", "dinner_time", "coffee1", "coffee2", "rental", "notes", "combined",
            "combined_venue_names", "payload", "idx",
        ],
        ra,
    )
    rl = filter_fk(rl, "request_id", req_ids, "request_logs")
    counts["request_logs"] = upsert(
        cur, "request_logs",
        ["id", "request_id", "date", "action", "log_user", "details", "payload", "idx"],
        rl,
    )
    ral = filter_fk(ral, "request_id", req_ids, "request_alerts")
    counts["request_alerts"] = upsert(
        cur, "request_alerts",
        ["id", "request_id", "title", "message", "created_by", "created_at", "payload", "idx"],
        ral,
    )
    rtr = filter_fk(rtr, "request_id", req_ids, "request_transportation")
    counts["request_transportation"] = upsert(
        cur, "request_transportation",
        ["id", "request_id", "type", "pax", "timing", "cost_per_way", "notes", "payload", "idx"],
        rtr,
    )
    rinv = filter_fk(rinv, "request_id", req_ids, "request_invoices")
    counts["request_invoices"] = upsert(
        cur, "request_invoices",
        ["request_id", "agreement", "inv1", "inv2", "inv3", "payload", "idx"],
        rinv,
    )
    frows = []
    cur.execute("SELECT payload FROM requests_rows WHERE payload ? 'feedback'")
    for r in cur.fetchall():
        f = r["payload"].get("feedback") or {}
        if not f:
            continue
        frows.append({
            "request_id": r["payload"].get("id"),
            "template": f.get("template"),
            "source": f.get("source"),
            "public_token": f.get("publicToken"),
            "answers": json.dumps(f.get("answers", {})),
            "submitted_at": ts(f.get("submittedAt")),
            "updated_at": ts(f.get("updatedAt")),
            "payload": json.dumps(f),
            "idx": 0,
        })
    frows = filter_fk(frows, "request_id", req_ids, "request_feedback")
    counts["request_feedback"] = upsert(
        cur, "request_feedback",
        ["request_id", "template", "source", "public_token", "answers", "submitted_at", "updated_at", "payload", "idx"],
        frows,
    )

    # ---- CONTRACT TEMPLATES & CXL REASONS (from app_collections payload arrays) ----
    cur.execute("SELECT name, payload FROM app_collections WHERE name IN ('contract_templates','cxl_reasons')")
    for r in cur.fetchall():
        name, payload = r["name"], r["payload"]
        table = "contract_templates" if name == "contract_templates" else "cxl_reasons"
        arr = payload if isinstance(payload, list) else []
        rows = [{"id": x.get("id", str(i)), "payload": json.dumps(x)} for i, x in enumerate(arr)]
        counts[table] = upsert(cur, table, ["id", "payload"], rows)

    # ---- CRM STATE ----
    # Store the full CRM map in BOTH leads and payload. The API/DAL historically
    # reads `leads`; migrator used to put only legacy leads[] there, which dropped
    # salesCalls until the client overwrote with a different shape.
    cur.execute("SELECT collection_name, map_key, payload FROM app_collection_maps WHERE collection_name='crm_state'")
    crmrows = []
    for r in cur.fetchall():
        full = r["payload"] or {}
        if not isinstance(full, dict):
            full = {}
        crmrows.append({
            "property_id": r["map_key"],
            "leads": json.dumps(full),
            "payload": json.dumps(full),
        })
    crmrows = filter_fk(crmrows, "property_id", valid_property_ids, "crm_state")
    counts["crm_state"] = upsert(cur, "crm_state", ["property_id", "leads", "payload"], crmrows)

    # Audit log of intentional FK nullifies — clear after a clean remigrate.
    cur.execute("DELETE FROM migration_orphans")
    counts["migration_orphans_cleared"] = True

    c.commit()
    cur.close()
    c.close()
    return counts


def _self_check_password_helper():
    assert ensure_bcrypt("$2b$12$" + "a" * 53).startswith("$2")
    h = ensure_bcrypt("plaintext-demo")
    assert h.startswith("$2") and len(h) >= 50
    assert short_id("P1::RTabc", None) == "RTabc"
    assert empty_to_none("") is None
    assert property_scoped_id("P1", "vat") == "P1::vat"
    used: set[str] = set()
    assert collection_pk("P1::vat", "P1", "vat", used) == "P1::vat"
    assert collection_pk("vat", "P2", "vat", used) == "P2::vat"
    assert collection_pk("Ps8b83kgbm::muni", "Ps8b83kgbm", "muni", used) == "Ps8b83kgbm::muni"
    assert collection_pk("muni", "Ps8b83kgbm", "muni", used) == "muni"
    tax_used: set[str] = set()
    assert collection_pk("Ps8b83kgbm::vat", "Ps8b83kgbm", "vat", tax_used, skip_duplicates=True) == "Ps8b83kgbm::vat"
    assert collection_pk("vat-dup", "Ps8b83kgbm", "vat", tax_used, skip_duplicates=True) is None
    assert ensure_scoped_child_id("REQ-A", "room", 0, {"id": 1})["id"] == "REQ-A:room:0:1"
    assert ensure_scoped_child_id("REQ-B", "room", 0, {"id": 1})["id"] == "REQ-B:room:0:1"


if __name__ == "__main__":
    _self_check_password_helper()
    print("Self-check OK (helpers: ensure_bcrypt, short_id, empty_to_none)")
    if os.environ.get("RUN_MIGRATE") == "1":
        res = migrate()
        print("MIGRATION COUNTS:")
        for k, v in res.items():
            print(f"  {k:25s} {v}")
