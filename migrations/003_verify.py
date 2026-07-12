#!/usr/bin/env python3
"""Verification: reconcile normalized tables vs legacy JSON. Lossless check."""
import os, json
import psycopg
from psycopg.rows import dict_row

DSN = os.environ.get("DATABASE_URL")

c = psycopg.connect(DSN, row_factory=dict_row)
cur = c.cursor()

print("=== ORPHANS CAPTURED (should be 0 lost data; orphans = dangling FK only) ===")
cur.execute("SELECT target_table, parent_key, count(*) FROM migration_orphans GROUP BY 1,2 ORDER BY 1,2")
for r in cur.fetchall():
    print("  ", r["target_table"], r["parent_key"], "->", r["count"])

print("\n=== ROW COUNTS (new vs legacy) ===")
checks = [
    ("properties", "SELECT count(*) n FROM properties", "SELECT count(*) n FROM app_collection_rows WHERE collection_name='properties'"),
    ("users", "SELECT count(*) n FROM users", "SELECT count(*) n FROM app_collection_rows WHERE collection_name='users'"),
    ("accounts", "SELECT count(*) n FROM accounts", "SELECT count(*) n FROM accounts_rows"),
    ("requests", "SELECT count(*) n FROM requests", "SELECT count(*) n FROM requests_rows"),
    ("rooms", "SELECT count(*) n FROM rooms", "SELECT count(*) n FROM app_collection_rows WHERE collection_name='room_types'"),
    ("venues", "SELECT count(*) n FROM venues", "SELECT count(*) n FROM app_collection_rows WHERE collection_name='venues'"),
    ("taxes", "SELECT count(*) n FROM taxes", "SELECT count(*) n FROM app_collection_rows WHERE collection_name='taxes'"),
    ("promotions", "SELECT count(*) n FROM promotions", "SELECT count(*) n FROM app_collection_rows WHERE collection_name='promotions'"),
    ("tasks", "SELECT count(*) n FROM tasks", "SELECT count(*) n FROM app_collection_rows WHERE collection_name='tasks'"),
    ("financials", "SELECT count(*) n FROM financials", "SELECT count(*) n FROM app_collection_rows WHERE collection_name='financials'"),
]
for name, new_q, old_q in checks:
    cur.execute(new_q); new = cur.fetchone()["n"]
    cur.execute(old_q); old = cur.fetchone()["n"]
    flag = "OK" if new == old else "DIFF"
    print(f"  {name:14s} new={new:5d} legacy={old:5d}  {flag}")

print("\n=== NESTED ARRAY RECONCILIATION (spot-check requests) ===")
cur.execute("SELECT payload FROM requests_rows LIMIT 1")
sample = cur.fetchone()["payload"]
rid = sample["id"]
cur.execute("""SELECT
  (SELECT count(*) FROM request_rooms WHERE request_id=%s) AS rooms,
  (SELECT count(*) FROM request_payments WHERE request_id=%s) AS payments,
  (SELECT count(*) FROM request_logs WHERE request_id=%s) AS logs,
  (SELECT count(*) FROM request_agenda WHERE request_id=%s) AS agenda,
  (SELECT count(*) FROM request_alerts WHERE request_id=%s) AS alerts,
  (SELECT count(*) FROM request_transportation WHERE request_id=%s) AS transport
""", (rid, rid, rid, rid, rid, rid))
got = cur.fetchone()
print(f"  request {rid}:")
print(f"    rooms   legacy={len(sample.get('rooms',[]))}  new={got['rooms']}")
print(f"    payments legacy={len(sample.get('payments',[]))}  new={got['payments']}")
print(f"    logs    legacy={len(sample.get('logs',[]))}  new={got['logs']}")
print(f"    agenda  legacy={len(sample.get('agenda',[]))}  new={got['agenda']}")
print(f"    alerts  legacy={len(sample.get('alerts',[]))}  new={got['alerts']}")
print(f"    transport legacy={len(sample.get('transportation',[]))}  new={got['transport']}")

print("\n=== FK INTEGRITY (must all be 0) ===")
fk_checks = [
    ("requests.property_id", "SELECT count(*) n FROM requests r LEFT JOIN properties p ON r.property_id=p.id WHERE r.property_id IS NOT NULL AND p.id IS NULL"),
    ("accounts.property_id", "SELECT count(*) n FROM accounts a LEFT JOIN properties p ON a.property_id=p.id WHERE a.property_id IS NOT NULL AND p.id IS NULL"),
    ("account_contacts.account_id", "SELECT count(*) n FROM account_contacts c LEFT JOIN accounts a ON c.account_id=a.id WHERE c.account_id IS NOT NULL AND a.id IS NULL"),
    ("request_rooms.request_id", "SELECT count(*) n FROM request_rooms x LEFT JOIN requests r ON x.request_id=r.id WHERE x.request_id IS NOT NULL AND r.id IS NULL"),
    ("users.property_id", "SELECT count(*) n FROM users u LEFT JOIN properties p ON u.property_id=p.id WHERE u.property_id IS NOT NULL AND p.id IS NULL"),
]
for name, q in fk_checks:
    cur.execute(q); n = cur.fetchone()["n"]
    print(f"  {name:32s} broken={n}  {'OK' if n==0 else 'BROKEN'}")

c.close()
