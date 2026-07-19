"""Create crm_card_comments (CRM kanban card comments).

Safe to run repeatedly (IF NOT EXISTS).

Run inside the backend container:
    python /app/migrations/012_crm_card_comments.py
"""
import sys

sys.path.insert(0, "/app")
from dotenv import load_dotenv

load_dotenv("/app/.env", override=True)
from utils import _get_pool

STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS crm_card_comments (
        id              TEXT PRIMARY KEY,
        property_id     TEXT NOT NULL,
        target_type     TEXT NOT NULL,
        target_id       TEXT NOT NULL,
        body            TEXT NOT NULL,
        author_user_id  TEXT NOT NULL,
        author_name     TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT crm_card_comments_target_type_chk
            CHECK (target_type IN ('request', 'account'))
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_crm_card_comments_target
    ON crm_card_comments (property_id, target_type, target_id, created_at DESC)
    """,
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
print(f"\nCRM_CARD_COMMENTS: {applied} applied/verified, {skipped} skipped")
