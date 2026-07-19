"""Create account_rates flat collection (plan 037).

Matches live promotions/tasks shape: typed cols + payload jsonb + timestamps.
Safe to run repeatedly (IF NOT EXISTS).

Run inside the backend container:
    python /app/migrations/011_account_rates.py
"""
import sys

sys.path.insert(0, "/app")
from dotenv import load_dotenv

load_dotenv("/app/.env", override=True)
from utils import _get_pool

STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS account_rates (
        id          TEXT PRIMARY KEY,
        property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
        account_id  TEXT REFERENCES accounts(id) ON DELETE CASCADE,
        start_date  DATE,
        end_date    DATE,
        segments    JSONB DEFAULT '[]'::jsonb,
        payload     JSONB,
        created_at  TIMESTAMPTZ DEFAULT now(),
        updated_at  TIMESTAMPTZ DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_account_rates_account ON account_rates (account_id)",
    "CREATE INDEX IF NOT EXISTS ix_account_rates_property_updated ON account_rates (property_id, updated_at DESC, id)",
]

pool = _get_pool()
applied, skipped = 0, 0
with pool.connection() as c:
    with c.cursor() as cur:
        for stmt in STATEMENTS:
            try:
                cur.execute(stmt)
                applied += 1
                print("OK  ", " ".join(stmt.split())[:100])
            except Exception as e:
                skipped += 1
                print("SKIP", " ".join(stmt.split())[:80], "->", str(e).splitlines()[0])
                c.rollback()
        c.commit()
print(f"\nACCOUNT_RATES: {applied} applied/verified, {skipped} skipped")
