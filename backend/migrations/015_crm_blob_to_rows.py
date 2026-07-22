#!/usr/bin/env python3
"""Plan 060: zero-loss crm_state blob → crm_sales_calls / crm_pipeline_cards.

Idempotent (ON CONFLICT DO UPDATE). Never deletes crm_state rows.
Invalid account_id / linked_request_id / owner_user_id are nullified and logged
to migration_orphans. Rows whose property_id is missing from properties are
skipped and logged (FK cannot be satisfied).

Run inside the backend container:
    python /app/migrations/015_crm_blob_to_rows.py
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

sys.path.insert(0, "/app")
from dotenv import load_dotenv

load_dotenv("/app/.env", override=True)

from psycopg.types.json import Json

from utils import _get_pool

PIPELINE_KEYS = ["waiting", "qualified", "proposal", "negotiation", "won", "notInterested"]


def _empty_to_none(v):
    if v is None or v == "" or v == "null":
        return None
    return v


def _as_date(v):
    v = _empty_to_none(v)
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        try:
            return date.fromisoformat(s[:10])
        except ValueError:
            return None
    return None


def _as_numeric(v):
    v = _empty_to_none(v)
    if v is None:
        return None
    try:
        return Decimal(str(v).replace(",", ""))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _as_bool(v, default=False):
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in ("1", "true", "yes", "y"):
        return True
    if s in ("0", "false", "no", "n", ""):
        return False
    return default


def _crm_block_score(block):
    if not isinstance(block, dict):
        return -1
    sc = block.get("salesCalls")
    n = len(sc) if isinstance(sc, list) else 0
    pipe = block.get("pipeline") if isinstance(block.get("pipeline"), dict) else {}
    for v in pipe.values():
        if isinstance(v, list):
            n += len(v)
    leads = block.get("leads") if isinstance(block.get("leads"), dict) else {}
    if isinstance(leads.get("new"), list):
        n += len(leads["new"])
    return n


def _normalize_block(block):
    """Same shape as routers.crm_state._migrate_block (keep in sync)."""
    if not isinstance(block, dict):
        block = {}
    sales_calls = block.get("salesCalls") if isinstance(block.get("salesCalls"), list) else []
    pipeline = {k: [] for k in PIPELINE_KEYS}
    raw_pipe = block.get("pipeline") if isinstance(block.get("pipeline"), dict) else {}
    for k in PIPELINE_KEYS:
        v = raw_pipe.get(k)
        if isinstance(v, list):
            pipeline[k] = v
    legacy = block.get("leads")
    if isinstance(legacy, dict):
        if not sales_calls and isinstance(legacy.get("new"), list):
            sales_calls = legacy["new"]
        for k in PIPELINE_KEYS:
            if not pipeline.get(k) and isinstance(legacy.get(k), list):
                pipeline[k] = legacy[k]
    return {
        "salesCalls": sales_calls,
        "pipeline": pipeline,
        "accountActivities": block.get("accountActivities")
        if isinstance(block.get("accountActivities"), dict)
        else {},
    }


def _log_orphan(cur, target_table, parent_key, parent_id, payload):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS migration_orphans (
            id serial PRIMARY KEY,
            target_table text NOT NULL,
            parent_key text,
            parent_id text,
            payload jsonb NOT NULL,
            created_at timestamptz DEFAULT now()
        )
        """
    )
    cur.execute(
        """
        INSERT INTO migration_orphans (target_table, parent_key, parent_id, payload)
        VALUES (%s, %s, %s, %s)
        """,
        (target_table, parent_key, parent_id, Json(payload if isinstance(payload, dict) else {"value": payload})),
    )


def _ensure_tables(cur):
    # Apply DDL statements if operator skipped 014 — IF NOT EXISTS only.
    ddl_path = os.path.join(os.path.dirname(__file__), "014_crm_normalize.sql")
    if os.path.isfile(ddl_path):
        with open(ddl_path, encoding="utf-8") as f:
            cur.execute(f.read())


def _pick_blob(row):
    leads = row.get("leads") if isinstance(row.get("leads"), dict) else None
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else None
    if _crm_block_score(payload) >= _crm_block_score(leads):
        return payload or leads or {}
    return leads or payload or {}


def migrate():
    pool = _get_pool()
    blob_calls = 0
    blob_cards = 0
    upserted_calls = 0
    upserted_cards = 0
    skipped_property = 0
    orphans = 0

    with pool.connection() as conn:
        with conn.cursor() as cur:
            _ensure_tables(cur)
            cur.execute("SELECT id FROM properties")
            valid_props = {r["id"] for r in cur.fetchall()}
            cur.execute("SELECT id FROM accounts")
            valid_accounts = {r["id"] for r in cur.fetchall()}
            cur.execute("SELECT id FROM requests")
            valid_requests = {r["id"] for r in cur.fetchall()}
            cur.execute("SELECT id FROM users")
            valid_users = {r["id"] for r in cur.fetchall()}

            cur.execute("SELECT property_id, leads, payload FROM crm_state")
            rows = cur.fetchall()

            for row in rows:
                pid = str(row["property_id"] or "").strip()
                block = _normalize_block(_pick_blob(row))
                calls = [c for c in block["salesCalls"] if isinstance(c, dict)]
                cards = []
                for stage in PIPELINE_KEYS:
                    for c in block["pipeline"].get(stage) or []:
                        if isinstance(c, dict):
                            cards.append((stage, c))

                blob_calls += len(calls)
                blob_cards += len(cards)

                if pid not in valid_props:
                    for c in calls:
                        _log_orphan(cur, "crm_sales_calls", "property_id", pid, c)
                        orphans += 1
                        skipped_property += 1
                    for stage, c in cards:
                        _log_orphan(cur, "crm_pipeline_cards", "property_id", pid, {**c, "stage": stage})
                        orphans += 1
                        skipped_property += 1
                    continue

                for idx, c in enumerate(calls):
                    cid = str(c.get("id") or "").strip() or f"SC-migr-{uuid.uuid4().hex[:12]}"
                    payload = {**c, "id": cid}
                    account_id = _empty_to_none(str(c.get("accountId") or "").strip() or None)
                    if account_id and account_id not in valid_accounts:
                        _log_orphan(cur, "crm_sales_calls", "account_id", account_id, {"id": cid})
                        orphans += 1
                        account_id = None
                    owner_user_id = _empty_to_none(str(c.get("ownerUserId") or "").strip() or None)
                    if owner_user_id and owner_user_id not in valid_users:
                        _log_orphan(cur, "crm_sales_calls", "owner_user_id", owner_user_id, {"id": cid})
                        orphans += 1
                        owner_user_id = None
                    cur.execute(
                        """
                        INSERT INTO crm_sales_calls (
                            id, property_id, account_id, subject, description, due_date,
                            last_contact, owner_user_id, activity_completed, follow_up_required,
                            follow_up_date, idx, payload, updated_at
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            property_id = EXCLUDED.property_id,
                            account_id = EXCLUDED.account_id,
                            subject = EXCLUDED.subject,
                            description = EXCLUDED.description,
                            due_date = EXCLUDED.due_date,
                            last_contact = EXCLUDED.last_contact,
                            owner_user_id = EXCLUDED.owner_user_id,
                            activity_completed = EXCLUDED.activity_completed,
                            follow_up_required = EXCLUDED.follow_up_required,
                            follow_up_date = EXCLUDED.follow_up_date,
                            idx = EXCLUDED.idx,
                            payload = EXCLUDED.payload,
                            updated_at = NOW()
                        """,
                        (
                            cid,
                            pid,
                            account_id,
                            _empty_to_none(c.get("subject")),
                            _empty_to_none(c.get("description")),
                            _as_date(c.get("dueDate") or c.get("due_date")),
                            _as_date(c.get("lastContact") or c.get("last_contact")),
                            owner_user_id,
                            _as_bool(c.get("activityCompleted"), False),
                            _as_bool(c.get("followUpRequired"), False),
                            _as_date(c.get("followUpDate") or c.get("follow_up_date")),
                            idx,
                            Json(payload),
                        ),
                    )
                    upserted_calls += 1

                for idx, (stage, c) in enumerate(cards):
                    cid = str(c.get("id") or "").strip() or f"PC-migr-{uuid.uuid4().hex[:12]}"
                    card_stage = str(c.get("stage") or stage or "qualified").strip()
                    if card_stage not in PIPELINE_KEYS:
                        card_stage = stage if stage in PIPELINE_KEYS else "qualified"
                    payload = {**c, "id": cid, "stage": card_stage}
                    account_id = _empty_to_none(str(c.get("accountId") or "").strip() or None)
                    if account_id and account_id not in valid_accounts:
                        _log_orphan(cur, "crm_pipeline_cards", "account_id", account_id, {"id": cid})
                        orphans += 1
                        account_id = None
                    linked = _empty_to_none(str(c.get("linkedRequestId") or "").strip() or None)
                    if linked and linked not in valid_requests:
                        _log_orphan(cur, "crm_pipeline_cards", "linked_request_id", linked, {"id": cid})
                        orphans += 1
                        linked = None
                    # per-stage index within bucket (blob order)
                    stage_idx = sum(
                        1
                        for s, prev in cards[:idx]
                        if s == stage
                    )
                    cur.execute(
                        """
                        INSERT INTO crm_pipeline_cards (
                            id, property_id, account_id, stage, period_month, linked_request_id,
                            value, probability, last_contact, entered_funnel_at, idx, payload, updated_at
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            property_id = EXCLUDED.property_id,
                            account_id = EXCLUDED.account_id,
                            stage = EXCLUDED.stage,
                            period_month = EXCLUDED.period_month,
                            linked_request_id = EXCLUDED.linked_request_id,
                            value = EXCLUDED.value,
                            probability = EXCLUDED.probability,
                            last_contact = EXCLUDED.last_contact,
                            entered_funnel_at = EXCLUDED.entered_funnel_at,
                            idx = EXCLUDED.idx,
                            payload = EXCLUDED.payload,
                            updated_at = NOW()
                        """,
                        (
                            cid,
                            pid,
                            account_id,
                            card_stage,
                            _empty_to_none(c.get("periodMonth") or c.get("period_month")),
                            linked,
                            _as_numeric(c.get("value")),
                            _as_numeric(c.get("probability")),
                            _as_date(c.get("lastContact") or c.get("last_contact")),
                            _as_date(c.get("enteredFunnelAt") or c.get("entered_funnel_at")),
                            stage_idx,
                            Json(payload),
                        ),
                    )
                    upserted_cards += 1

            conn.commit()

            cur.execute("SELECT count(*) AS n FROM crm_sales_calls")
            db_calls = int((cur.fetchone() or {}).get("n") or 0)
            cur.execute("SELECT count(*) AS n FROM crm_pipeline_cards")
            db_cards = int((cur.fetchone() or {}).get("n") or 0)
            cur.execute("SELECT count(*) AS n FROM crm_state")
            crm_state_n = int((cur.fetchone() or {}).get("n") or 0)

    print("CRM_BLOB_TO_ROWS")
    print(f"  blob_sales_calls={blob_calls} blob_pipeline_cards={blob_cards}")
    print(f"  upserted_calls={upserted_calls} upserted_cards={upserted_cards}")
    print(f"  orphans_logged={orphans} skipped_invalid_property_items={skipped_property}")
    print(f"  table_crm_sales_calls={db_calls} table_crm_pipeline_cards={db_cards}")
    print(f"  crm_state_rows_unchanged_count={crm_state_n}")

    expected_min = blob_calls + blob_cards - skipped_property
    got = upserted_calls + upserted_cards
    if got != expected_min:
        raise SystemExit(
            f"STOP: row counts do not reconcile: upserted={got} "
            f"expected={expected_min} (blob total minus invalid-property skips)"
        )

    # Self-check: synthetic block round-trip via DAL (after tables exist).
    _self_check_roundtrip()
    print("  self_check_roundtrip=OK")


def _self_check_roundtrip():
    """Insert/read/delete synthetic rows only — never wipe a real property via upsert."""
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM properties ORDER BY id ASC LIMIT 1")
            row = cur.fetchone()
            if not row:
                print("  self_check_roundtrip=SKIP (no properties)")
                return
            pid = str(row["id"])
            marker = f"unusualField_{uuid.uuid4().hex[:8]}"
            call_id = f"SC-self-{uuid.uuid4().hex[:10]}"
            card_id = f"PC-self-{uuid.uuid4().hex[:10]}"
            call_payload = {"id": call_id, "subject": "selfcheck", marker: True}
            card_payload = {
                "id": card_id,
                "stage": "qualified",
                "company": "SelfCheck Co",
                marker: {"nested": 1},
            }
            cur.execute(
                """
                INSERT INTO crm_sales_calls (id, property_id, idx, payload)
                VALUES (%s, %s, 0, %s)
                ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
                """,
                (call_id, pid, Json(call_payload)),
            )
            cur.execute(
                """
                INSERT INTO crm_pipeline_cards (id, property_id, stage, idx, payload)
                VALUES (%s, %s, 'qualified', 0, %s)
                ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
                """,
                (card_id, pid, Json(card_payload)),
            )
            cur.execute("SELECT payload FROM crm_sales_calls WHERE id = %s", (call_id,))
            got_call = (cur.fetchone() or {}).get("payload") or {}
            cur.execute("SELECT payload FROM crm_pipeline_cards WHERE id = %s", (card_id,))
            got_card = (cur.fetchone() or {}).get("payload") or {}
            assert got_call.get(marker) is True, got_call
            assert got_card.get(marker) == {"nested": 1}, got_card
            cur.execute("DELETE FROM crm_sales_calls WHERE id = %s", (call_id,))
            cur.execute("DELETE FROM crm_pipeline_cards WHERE id = %s", (card_id,))
            conn.commit()


if __name__ == "__main__":
    migrate()
