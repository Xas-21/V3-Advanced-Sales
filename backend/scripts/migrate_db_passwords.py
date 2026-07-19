"""Hash any leftover plaintext passwords in the relational `users` table.

Idempotent: rows whose password already looks like bcrypt are skipped.
Safe to re-run. Does not print password values.

Usage (from backend/, with DATABASE_URL set — e.g. Docker as-postgres):

    python scripts/migrate_db_passwords.py
    python scripts/migrate_db_passwords.py --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys

# Allow `python scripts/migrate_db_passwords.py` from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from security import hash_password  # noqa: E402
from utils import get_database_url  # noqa: E402


def looks_like_bcrypt(value: str) -> bool:
    s = (value or "").strip()
    return s.startswith(("$2a$", "$2b$", "$2y$")) and len(s) >= 55


def migrate(*, dry_run: bool = False) -> int:
    import psycopg
    from psycopg.rows import dict_row

    url = get_database_url()
    if not url:
        raise SystemExit("DATABASE_URL is not set")

    updated = 0
    skipped = 0
    with psycopg.connect(url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, username, password FROM users;")
            rows = cur.fetchall()
            for row in rows:
                pw = str(row.get("password") or "")
                if not pw or looks_like_bcrypt(pw):
                    skipped += 1
                    continue
                new_hash = hash_password(pw)
                if dry_run:
                    print(f"[dry-run] would hash password for user id={row['id']} username={row.get('username')}")
                else:
                    cur.execute(
                        "UPDATE users SET password = %s WHERE id = %s;",
                        (new_hash, row["id"]),
                    )
                    print(f"hashed password for user id={row['id']} username={row.get('username')}")
                updated += 1
        if not dry_run:
            conn.commit()
    print(f"done: updated={updated} skipped_already_hashed_or_empty={skipped} dry_run={dry_run}")
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(description="Hash plaintext user passwords (idempotent).")
    parser.add_argument("--dry-run", action="store_true", help="Report what would change; no writes.")
    args = parser.parse_args()
    migrate(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
