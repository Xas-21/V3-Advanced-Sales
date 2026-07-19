"""Self-contained end-to-end test for write-path tenant isolation (IDOR),
CRM/account read isolation, and secured uploads. Creates its own fixtures
(a temp property + a scoped non-admin user) and tears them down.

Run inside the backend container:
    python /app/migrations/008_write_authz_test.py
"""
import sys
sys.path.insert(0, "/app")
from dotenv import load_dotenv
load_dotenv("/app/.env", override=True)

from fastapi.testclient import TestClient
import main
from security import hash_password
from utils import _get_pool

HOME_PID = "Ps8b83kgbm"        # property the test user is assigned to
OTHER_PID = "PZ_AUTHZ_TEST"    # property the test user must NOT touch
TEST_UID = "U-AUTHZTEST"
ADMIN = {"username": "Abdullah", "password": "Abdullah@@2026"}

pool = _get_pool()


def setup():
    with pool.connection() as c:
        with c.cursor() as cur:
            # temp foreign property
            cur.execute(
                "INSERT INTO properties (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING;",
                (OTHER_PID, "AUTHZ Foreign Property"),
            )
            # temp scoped non-admin user (Sales Manager) assigned ONLY to HOME_PID
            cur.execute(
                """
                INSERT INTO users (id, username, name, email, role, status, property_id,
                                   assigned_property_ids, session_version, password)
                VALUES (%s,%s,%s,%s,%s,'active',%s,%s,0,%s)
                ON CONFLICT (id) DO UPDATE SET password=EXCLUDED.password, status='active',
                    role=EXCLUDED.role, property_id=EXCLUDED.property_id,
                    assigned_property_ids=EXCLUDED.assigned_property_ids, session_version=0;
                """,
                (TEST_UID, "authztest", "Authz Test", "authz@test.local", "Sales Manager",
                 HOME_PID, '["%s"]' % HOME_PID, hash_password("TempPass123!")),
            )
            # foreign-property account to probe read-IDOR
            cur.execute(
                "INSERT INTO accounts (id, name, property_id) VALUES (%s,%s,%s) ON CONFLICT (id) DO NOTHING;",
                ("A-AUTHZFOREIGN", "Foreign Acct", OTHER_PID),
            )
            c.commit()


def teardown():
    with pool.connection() as c:
        with c.cursor() as cur:
            cur.execute("DELETE FROM requests WHERE request_name LIKE 'AUTHZ %%';")
            cur.execute("DELETE FROM tasks WHERE id = %s;", ("TK-AUTHZFOREIGN",))
            cur.execute("DELETE FROM accounts WHERE id = %s OR name LIKE 'AUTHZ %%';", ("A-AUTHZFOREIGN",))
            cur.execute("DELETE FROM users WHERE id = %s;", (TEST_UID,))
            cur.execute("DELETE FROM crm_state WHERE property_id = %s;", (OTHER_PID,))
            cur.execute("DELETE FROM properties WHERE id = %s;", (OTHER_PID,))
            c.commit()


def _ck(h):
    return h.split(";")[0] if h else None


def h(cookie):
    return {"Cookie": cookie} if cookie else {}


_passed = _failed = 0


def check(name, cond):
    global _passed, _failed
    if cond:
        _passed += 1
    else:
        _failed += 1
    print(("PASS" if cond else "FAIL"), "-", name)


def run():
    client = TestClient(main.app)

    acookie = _ck(client.post("/api/login", json=ADMIN).headers.get("set-cookie"))
    check("admin login", bool(acookie))

    r = client.post("/api/login", json={"username": "authztest", "password": "TempPass123!"})
    tcookie = _ck(r.headers.get("set-cookie"))
    check("scoped user login", r.status_code == 200 and bool(tcookie))

    # LEGIT: scoped user creates a request in their OWN property
    r = client.post("/api/requests", headers=h(tcookie),
                    json={"propertyId": HOME_PID, "requestName": "AUTHZ SELF", "status": "New Lead"})
    check("scoped user create in OWN property -> 200 (legit flow works)", r.status_code == 200)
    self_id = r.json().get("id") if r.status_code == 200 else None

    # LEGIT: scoped user updates their own request
    if self_id:
        r = client.post("/api/requests", headers=h(tcookie),
                        json={"id": self_id, "propertyId": HOME_PID, "requestName": "AUTHZ SELF EDIT",
                              "status": "New Lead", "_update": True})
        check("scoped user update OWN request -> 200", r.status_code == 200)

    # IDOR: scoped user creates a request in FOREIGN property
    r = client.post("/api/requests", headers=h(tcookie),
                    json={"propertyId": OTHER_PID, "requestName": "AUTHZ CROSS", "status": "New Lead"})
    check("scoped user create in FOREIGN property -> 403", r.status_code == 403)

    # IDOR: scoped user creates an account in FOREIGN property
    r = client.post("/api/accounts", headers=h(tcookie),
                    json={"propertyId": OTHER_PID, "name": "AUTHZ CROSS ACCT"})
    check("scoped user create account in FOREIGN property -> 403", r.status_code == 403)

    # IDOR: scoped user reads a FOREIGN account by id
    r = client.get("/api/accounts/A-AUTHZFOREIGN", headers=h(tcookie))
    check("scoped user read FOREIGN account -> 404", r.status_code == 404)

    # Admin can read it fine
    r = client.get("/api/accounts/A-AUTHZFOREIGN", headers=h(acookie))
    check("admin read FOREIGN account -> 200", r.status_code == 200)

    # IDOR: scoped user reads FOREIGN crm-state -> empty
    r = client.get(f"/api/crm-state?propertyId={OTHER_PID}", headers=h(tcookie))
    body = r.json()
    scount = len(body.get("salesCalls") or [])
    pcount = sum(len(v or []) for v in (body.get("pipeline") or {}).values())
    check("scoped user read FOREIGN crm-state -> empty", r.status_code == 200 and scount == 0 and pcount == 0)

    # IDOR (plan 005): scoped user must not list flat entities for a FOREIGN property
    with pool.connection() as c:
        with c.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tasks (id, property_id, payload, updated_at)
                VALUES (
                    'TK-AUTHZFOREIGN', %s,
                    %s::jsonb,
                    NOW()
                )
                ON CONFLICT (id) DO UPDATE SET property_id = EXCLUDED.property_id, payload = EXCLUDED.payload;
                """,
                (
                    OTHER_PID,
                    '{"id":"TK-AUTHZFOREIGN","propertyId":"%s","title":"FOREIGN","status":"open"}'
                    % OTHER_PID,
                ),
            )
        c.commit()
    r = client.get(f"/api/tasks?propertyId={OTHER_PID}", headers=h(tcookie))
    tbody = r.json() if r.status_code == 200 else []
    check(
        "scoped user list FOREIGN property tasks -> empty",
        r.status_code == 200
        and isinstance(tbody, list)
        and not any(str(t.get("id") or "") == "TK-AUTHZFOREIGN" for t in tbody),
    )

    # Admin CAN create in the foreign property
    r = client.post("/api/requests", headers=h(acookie),
                    json={"propertyId": OTHER_PID, "requestName": "AUTHZ ADMIN", "status": "New Lead"})
    check("admin create in any property -> 200", r.status_code == 200)

    # Uploads now require auth
    r = client.post("/api/uploads/local")
    check("unauthenticated local upload -> 401", r.status_code == 401)
    r = client.post("/api/uploads/local", headers=h(tcookie))
    check("authenticated local upload without file -> not 401", r.status_code != 401)


try:
    setup()
    run()
finally:
    teardown()

print(f"\nWRITE-AUTHZ E2E: {_passed} passed, {_failed} failed")
sys.exit(1 if _failed else 0)
