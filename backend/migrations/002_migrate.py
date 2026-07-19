#!/usr/bin/env python3
"""
AS Phase 2 — Lossless migration: legacy JSON collections -> normalized tables.
READ-ONLY source: never deletes/updates legacy tables.
Idempotent: re-run safe (uses ON CONFLICT DO NOTHING / upsert by id).
"""
import json
import os
import uuid
import psycopg
from psycopg.rows import dict_row

DSN = os.environ.get("DATABASE_URL") or "postgresql://as_owner:***@as-postgres:5432/as-postgres"


def with_id(x, anchor):
    """Guarantee an 'id' field exists on a child object; deterministic per (anchor,index)."""
    if not x.get("id"):
        seed = str(x.get("accountId") or x.get("id") or anchor)
        h = uuid.uuid5(uuid.NAMESPACE_DNS, f"{anchor}:{seed}")
        x["id"] = "M" + h.hex[:11]
    return x


def d(v):
    """Map empty string / None -> None for DATE columns."""
    if v is None or v == "":
        return None
    return v


def ts(v):
    """Map empty string / None -> None for TIMESTAMP columns."""
    if v is None or v == "":
        return None
    return v


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
    # Defensively JSON-encode any nested dict/list (never store raw JSON objects in scalar columns)
    clean_rows = []
    for r in rows:
        clean = {}
        for k, v in r.items():
            if isinstance(v, (dict, list)):
                v = json.dumps(v)
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
    "users","properties","accounts","account_contacts","account_activities",
    "requests","request_rooms","request_payments","request_agenda","request_invoices",
    "request_logs","request_alerts","request_transportation","request_feedback",
    "rooms","venues","taxes","financials","tasks","promotions",
    "contract_templates","cxl_reasons","crm_state","sessions","migration_orphans",
]


def reset(cur):
    """Idempotent re-run safety: clear only the NEW relational tables (legacy untouched)."""
    cur.execute("TRUNCATE %s RESTART IDENTITY CASCADE" % ", ".join(NEW_TABLES))


def migrate():
    c = conn()
    cur = c.cursor()
    counts = {}

    reset(cur)

    # ---- ORPHAN CAPTURE TABLE (lossless: never drop data with dangling FK) ----
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

    # ---- USERS (from app_collection_rows collection='users') ----
    cur.execute("SELECT payload FROM app_collection_rows WHERE collection_name='users'")
    users = [r["payload"] for r in cur.fetchall()]
    rows = []
    for u in users:
        rows.append({
            "id": u.get("id"),
            "username": u.get("username"),
            "password": u.get("password"),
            "name": u.get("name"),
            "email": u.get("email"),
            "role": u.get("role", "Sales Executive"),
            "status": u.get("status", "active"),
            "property_id": (u.get("propertyId") or None),
            "permission_grants": json.dumps(u.get("permissionGrants", [])),
            "permission_revokes": json.dumps(u.get("permissionRevokes", [])),
            "stats": json.dumps(u.get("stats", {})),
            "session_version": int(u.get("sessionVersion", 0) or 0),
            "avatar": u.get("avatar"),
        })
    counts["users"] = upsert(cur, "users",
        ["id","username","password","name","email","role","status","property_id","permission_grants","permission_revokes","stats","session_version","avatar"],
        rows)

    # ---- PROPERTIES ----
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
        })
    counts["properties"] = upsert(cur, "properties",
        ["id","name","city","country","email","phone","logo_url","total_rooms","account_types","segments","occupancy_types","payment_methods","event_packages","form_configurations","alert_settings","call_settings","assigned_user_ids"],
        rows)
    # collect valid property ids for FK filtering
    cur.execute("SELECT id FROM properties")
    valid_property_ids = {r["id"] for r in cur.fetchall()}

    # ---- ACCOUNTS ----
    cur.execute("SELECT id, property_id, created_by_user_id, payload FROM accounts_rows")
    acc = cur.fetchall()
    arows, crows, actrows = [], [], []
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
            "owner_user_id": p.get("ownerUserId"),
            "owner_username": p.get("ownerUsername"),
            "created_by_user_id": p.get("createdByUserId"),
            "created_by_username": p.get("createdByUsername"),
            "property_id": p.get("propertyId"),
            "tags": json.dumps(p.get("tags", [])),
            "total_requests": p.get("totalRequests"),
            "win_rate": p.get("winRate"),
            "total_spend": p.get("totalSpend"),
            "profile_audit_log": json.dumps(p.get("profileAuditLog", [])),
            "created_at": r.get("created_at"),
            "updated_at": r.get("updated_at"),
        })
        for i, ct in enumerate(p.get("contacts") or []):
            ct = with_id(ct, f"{p.get('id')}:contact:{i}")
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
            })
        for i, ac in enumerate(p.get("activities") or []):
            ac = with_id(ac, f"{p.get('id')}:activity:{i}")
            actrows.append({
                "id": ac.get("id"),
                "account_id": p.get("id"),
                "title": ac.get("title"),
                "body": ac.get("body"),
                "activity_user": ac.get("user"),
                "at": ac.get("at"),
                "crm_lead_id": ac.get("crmLeadId"),
            })
    arows = filter_fk(arows, "property_id", valid_property_ids, "accounts")
    counts["accounts"] = upsert(cur, "accounts",
        ["id","name","type","city","street","country","website","notes","client_tax_id","account_owner_name","owner_user_id","owner_username","created_by_user_id","created_by_username","property_id","tags","total_requests","win_rate","total_spend","profile_audit_log","created_at","updated_at"],
        arows)
    crows = filter_fk(crows, "account_id", {a["id"] for a in arows}, "account_contacts")
    counts["account_contacts"] = upsert(cur, "account_contacts",
        ["id","account_id","first_name","last_name","name","position","email","phone","city","country"], crows)
    actrows = filter_fk(actrows, "account_id", {a["id"] for a in arows}, "account_activities")
    counts["account_activities"] = upsert(cur, "account_activities",
        ["id","account_id","title","body","activity_user","at","crm_lead_id"], actrows)

    # ---- REQUESTS ----
    cur.execute("SELECT id, property_id, created_by_user_id, payload FROM requests_rows")
    req = cur.fetchall()
    rrows, rm, rp, ra, rl, ral, rtr, rinv = [], [], [], [], [], [], [], []
    for r in req:
        p = r["payload"]
        rrows.append({
            "id": p.get("id"),
            "account_id": p.get("accountId"),
            "account_name": p.get("accountName"),
            "property_id": p.get("propertyId"),
            "created_by_user_id": p.get("createdByUserId"),
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
            "booker_contact_id": p.get("bookerContactId"),
            "promotion_id": p.get("promotionId"),
            "confirmation_no": p.get("confirmationNo"),
            "note": p.get("note"),
            "cancel_reason": p.get("cancelReason"),
            "cancel_note": p.get("cancelNote"),
            "updated_at": ts(p.get("updatedAt")),
            "created_at": r.get("created_at"),
            "updated_at_ts": r.get("updated_at"),
        })
        rid = p.get("id")
        for i, x in enumerate(p.get("rooms") or []):
            x = with_id(x, f"{rid}:room:{i}")
            rm.append({"id": x.get("id"), "request_id": rid, "type": x.get("type"), "count": x.get("count"), "nights": x.get("nights"), "occupancy": x.get("occupancy"), "rate": x.get("rate"), "meal_plan": x.get("mealPlan"), "arrival": x.get("arrival"), "departure": x.get("departure")})
        for i, x in enumerate(p.get("payments") or []):
            x = with_id(x, f"{rid}:payment:{i}")
            rp.append({"id": x.get("id"), "request_id": rid, "amount": x.get("amount"), "date": d(x.get("date")), "method": x.get("method"), "note": x.get("note")})
        for i, x in enumerate(p.get("agenda") or []):
            x = with_id(x, f"{rid}:agenda:{i}")
            ra.append({"id": x.get("id"), "request_id": rid, "venue": x.get("venue"), "shape": x.get("shape"), "pax": x.get("pax"), "package": x.get("package"), "start_date": x.get("startDate"), "end_date": x.get("endDate"), "start_time": x.get("startTime"), "end_time": x.get("endTime"), "lunch_time": x.get("lunchTime"), "dinner_time": x.get("dinnerTime"), "coffee1": x.get("coffee1"), "coffee2": x.get("coffee2"), "rental": x.get("rental"), "notes": x.get("notes"), "combined": x.get("combined"), "combined_venue_names": x.get("combinedVenueNames")})
        for i, x in enumerate(p.get("logs") or []):
            x = with_id(x, f"{rid}:log:{i}")
            rl.append({"id": x.get("id"), "request_id": rid, "date": x.get("date"), "action": x.get("action"), "log_user": x.get("user"), "details": x.get("details")})
        for i, x in enumerate(p.get("alerts") or []):
            x = with_id(x, f"{rid}:alert:{i}")
            ral.append({"id": x.get("id"), "request_id": rid, "title": x.get("title"), "message": x.get("message"), "created_by": x.get("createdBy"), "created_at": x.get("createdAt")})
        for i, x in enumerate(p.get("transportation") or []):
            x = with_id(x, f"{rid}:transport:{i}")
            rtr.append({"id": x.get("id"), "request_id": rid, "type": x.get("type"), "pax": x.get("pax"), "timing": x.get("timing"), "cost_per_way": x.get("costPerWay"), "notes": x.get("notes")})
        inv = p.get("invoices") or {}
        if inv:
            rinv.append({"request_id": p.get("id"), "agreement": json.dumps(inv.get("agreement")), "inv1": json.dumps(inv.get("inv1")), "inv2": json.dumps(inv.get("inv2")), "inv3": json.dumps(inv.get("inv3"))})
    rrows = filter_fk(rrows, "property_id", valid_property_ids, "requests")
    counts["requests"] = upsert(cur, "requests",
        ["id","account_id","account_name","property_id","created_by_user_id","request_name","request_type","segment","status","payment_status","check_in","check_out","event_start","event_end","nights","total_rooms","adr","total_cost","grand_total_no_tax","received_date","offer_deadline","deposit_deadline","payment_deadline","meal_plan","booker_name","booker_contact_id","promotion_id","confirmation_no","note","cancel_reason","cancel_note","updated_at","created_at","updated_at_ts"],
        rrows)
    req_ids = {r["id"] for r in rrows}
    rm = filter_fk(rm, "request_id", req_ids, "request_rooms")
    counts["request_rooms"] = upsert(cur, "request_rooms", ["id","request_id","type","count","nights","occupancy","rate","meal_plan","arrival","departure"], rm)
    rp = filter_fk(rp, "request_id", req_ids, "request_payments")
    counts["request_payments"] = upsert(cur, "request_payments", ["id","request_id","amount","date","method","note"], rp)
    ra = filter_fk(ra, "request_id", req_ids, "request_agenda")
    counts["request_agenda"] = upsert(cur, "request_agenda", ["id","request_id","venue","shape","pax","package","start_date","end_date","start_time","end_time","lunch_time","dinner_time","coffee1","coffee2","rental","notes","combined","combined_venue_names"], ra)
    rl = filter_fk(rl, "request_id", req_ids, "request_logs")
    counts["request_logs"] = upsert(cur, "request_logs", ["id","request_id","date","action","log_user","details"], rl)
    ral = filter_fk(ral, "request_id", req_ids, "request_alerts")
    counts["request_alerts"] = upsert(cur, "request_alerts", ["id","request_id","title","message","created_by","created_at"], ral)
    rtr = filter_fk(rtr, "request_id", req_ids, "request_transportation")
    counts["request_transportation"] = upsert(cur, "request_transportation", ["id","request_id","type","pax","timing","cost_per_way","notes"], rtr)
    rinv = filter_fk(rinv, "request_id", req_ids, "request_invoices")
    counts["request_invoices"] = upsert(cur, "request_invoices", ["request_id","agreement","inv1","inv2","inv3"], rinv)
    # feedback (object, nullable)
    frows = []
    cur.execute("SELECT payload FROM requests_rows WHERE payload ? 'feedback'")
    for r in cur.fetchall():
        f = r["payload"].get("feedback") or {}
        if not f:
            continue
        frows.append({"request_id": r["payload"].get("id"), "template": f.get("template"), "source": f.get("source"), "public_token": f.get("publicToken"), "answers": json.dumps(f.get("answers", {})), "submitted_at": ts(f.get("submittedAt")), "updated_at": ts(f.get("updatedAt"))})
    counts["request_feedback"] = upsert(cur, "request_feedback", ["request_id","template","source","public_token","answers","submitted_at","updated_at"], frows)

    # ---- PROPERTY COLLECTIONS ----
    for coll, table, cols, keyp in [
        ("room_types", "rooms", ["id","property_id","name","count","size","base_rate","capacity"], None),
        ("venues", "venues", ["id","property_id","name","is_combined","shapes","width","length","height","area","capacity"], None),
        ("taxes", "taxes", ["id","property_id","label","rate","scope"], None),
        ("financials", "financials", ["id","property_id","year","months"], None),
        ("tasks", "tasks", ["id","property_id","task","client","priority","completed","date","star","category","description","assigned_to","assignees"], None),
        ("promotions", "promotions", ["id","property_id","name","status","start_date","end_date","terms","segments","linked_accounts","include_rooms_revenue","include_events_revenue"], None),
    ]:
        cur.execute("SELECT payload FROM app_collection_rows WHERE collection_name=%s", (coll,))
        rows = []
        for r in cur.fetchall():
            p = r["payload"]
            row = {"id": p.get("id")}
            # map camelCase -> snake_case per table
            if table == "rooms":
                row.update({"property_id": p.get("propertyId"), "name": p.get("name"), "count": p.get("count"), "size": p.get("size"), "base_rate": p.get("baseRate"), "capacity": p.get("capacity")})
            elif table == "venues":
                row.update({"property_id": p.get("propertyId"), "name": p.get("name"), "is_combined": p.get("isCombined"), "shapes": json.dumps(p.get("shapes", [])), "width": p.get("width"), "length": p.get("length"), "height": p.get("height"), "area": p.get("area"), "capacity": p.get("capacity")})
            elif table == "taxes":
                row.update({"property_id": p.get("propertyId"), "label": p.get("label"), "rate": p.get("rate"), "scope": p.get("scope")})
            elif table == "financials":
                row.update({"property_id": p.get("propertyId"), "year": p.get("year"), "months": json.dumps(p.get("months", []))})
            elif table == "tasks":
                row.update({"property_id": p.get("propertyId"), "task": p.get("task"), "client": p.get("client"), "priority": p.get("priority"), "completed": p.get("completed"), "date": d(p.get("date")), "star": p.get("star"), "category": p.get("category"), "description": p.get("description"), "assigned_to": p.get("assignedTo"), "assignees": json.dumps(p.get("assignees", []))})
            elif table == "promotions":
                row.update({"property_id": p.get("propertyId"), "name": p.get("name"), "status": p.get("status"), "start_date": d(p.get("startDate")), "end_date": d(p.get("endDate")), "terms": p.get("terms"), "segments": json.dumps(p.get("segments", [])), "linked_accounts": json.dumps(p.get("linkedAccounts", [])), "include_rooms_revenue": p.get("includeRoomsRevenue"), "include_events_revenue": p.get("includeEventsRevenue")})
            rows.append(row)
        rows = filter_fk(rows, "property_id", valid_property_ids, table)
        counts[table] = upsert(cur, table, cols, rows)

    # ---- CONTRACT TEMPLATES & CXL REASONS (from app_collections payload arrays) ----
    cur.execute("SELECT name, payload FROM app_collections WHERE name IN ('contract_templates','cxl_reasons')")
    for r in cur.fetchall():
        name, payload = r["name"], r["payload"]
        table = "contract_templates" if name == "contract_templates" else "cxl_reasons"
        arr = payload if isinstance(payload, list) else []
        rows = [{"id": x.get("id", str(i)), "payload": json.dumps(x)} for i, x in enumerate(arr)]
        counts[table] = upsert(cur, table, ["id","payload"], rows)

    # ---- CRM STATE ----
    cur.execute("SELECT collection_name, map_key, payload FROM app_collection_maps WHERE collection_name='crm_state'")
    crmrows = []
    for r in cur.fetchall():
        crmrows.append({"property_id": r["map_key"], "leads": json.dumps((r["payload"] or {}).get("leads", []))})
    counts["crm_state"] = upsert(cur, "crm_state", ["property_id","leads"], crmrows)

    c.commit()
    cur.close()
    c.close()
    return counts


if __name__ == "__main__":
    res = migrate()
    print("MIGRATION COUNTS:")
    for k, v in res.items():
        print(f"  {k:25s} {v}")
