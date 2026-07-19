"""Idempotent index migration for list-endpoint performance.

Adds composite indexes matching the hot query patterns
(`WHERE property_id = ... ORDER BY updated_at DESC, id`) plus child-table
(parent_id, idx) ordering. Safe to run repeatedly (IF NOT EXISTS).

Run inside the backend container:
    python /app/migrations/010_add_indexes.py
"""
import sys
sys.path.insert(0, "/app")
from dotenv import load_dotenv
load_dotenv("/app/.env", override=True)
from utils import _get_pool

STATEMENTS = [
    "CREATE INDEX IF NOT EXISTS ix_requests_property_updated ON requests (property_id, updated_at DESC, id);",
    "CREATE INDEX IF NOT EXISTS ix_accounts_property_updated ON accounts (property_id, updated_at DESC, id);",
    "CREATE INDEX IF NOT EXISTS ix_users_property ON users (property_id);",
    "CREATE INDEX IF NOT EXISTS ix_account_contacts_account_idx ON account_contacts (account_id, idx);",
    "CREATE INDEX IF NOT EXISTS ix_account_activities_account_idx ON account_activities (account_id, idx);",
    "CREATE INDEX IF NOT EXISTS ix_request_rooms_req_idx ON request_rooms (request_id, idx);",
    "CREATE INDEX IF NOT EXISTS ix_request_payments_req_idx ON request_payments (request_id, idx);",
    "CREATE INDEX IF NOT EXISTS ix_request_agenda_req_idx ON request_agenda (request_id, idx);",
    "CREATE INDEX IF NOT EXISTS ix_request_logs_req_idx ON request_logs (request_id, idx);",
    "CREATE INDEX IF NOT EXISTS ix_request_alerts_req_idx ON request_alerts (request_id, idx);",
    "CREATE INDEX IF NOT EXISTS ix_request_transportation_req_idx ON request_transportation (request_id, idx);",
]

pool = _get_pool()
applied, skipped = 0, 0
with pool.connection() as c:
    with c.cursor() as cur:
        for stmt in STATEMENTS:
            try:
                cur.execute(stmt)
                applied += 1
                print("OK  ", stmt)
            except Exception as e:  # e.g. column/table not present in this schema
                skipped += 1
                print("SKIP", stmt, "->", str(e).splitlines()[0])
                c.rollback()
        c.commit()
print(f"\nINDEXES: {applied} applied/verified, {skipped} skipped")
