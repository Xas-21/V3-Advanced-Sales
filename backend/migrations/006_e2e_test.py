"""End-to-end auth + tenant isolation test using FastAPI TestClient (no network)."""
import sys
sys.path.insert(0, "/app")
import os
from dotenv import load_dotenv

load_dotenv("/app/.env", override=True)

from fastapi.testclient import TestClient
import main
from security import hash_password
from utils import _get_pool

# Ensure the temp tenant user has a known password for this test
pool = _get_pool()
with pool.connection() as c:
    with c.cursor() as cur:
        cur.execute("UPDATE users SET password=%s, status=%s WHERE id=%s;",
                    (hash_password("TempPass123!"), "active", "U-TESTTEN"))
        c.commit()

client = TestClient(main.app)


def h(cookie):
    return {"Cookie": cookie} if cookie else {}


def _ck(set_cookie_header):
    if not set_cookie_header:
        return None
    return set_cookie_header.split(";")[0]


def check(name, cond):
    print(("PASS" if cond else "FAIL"), "-", name)


# 1) ADMIN (Abdullah) login
r = client.post("/api/login", json={"username": "Abdullah", "password": "Abdullah@@2026"})
check("admin login 200", r.status_code == 200)
acookie = _ck(r.headers.get("set-cookie"))
ud = r.json().get("user", {})
check("admin is admin", ud.get("isAdmin") is True)
check("admin session cookie set", bool(acookie))

# 2) Admin sees ALL properties
r = client.get("/api/requests", headers=h(acookie))
areqs = r.json()
aprops = sorted(set(str(x.get("propertyId")) for x in areqs))
check("admin sees multiple properties", len(aprops) > 1)

# 3) Tenant login
r = client.post("/api/login", json={"username": "testtenant", "password": "TempPass123!"})
check("tenant login 200", r.status_code == 200)
cookie = _ck(r.headers.get("set-cookie"))
tud = r.json().get("user", {})
check("tenant not admin", tud.get("isAdmin") is False)
check("tenant has property", tud.get("property_ids") == ["Ps8b83kgbm"])

# 4) Tenant sees ONLY assigned property
r = client.get("/api/requests", headers=h(cookie))
treqs = r.json()
tprops = sorted(set(str(x.get("propertyId")) for x in treqs))
check("tenant sees only assigned property", treqs and all(p == "Ps8b83kgbm" for p in tprops))

# 5) auth/me
r = client.get("/api/auth/me", headers=h(cookie))
check("tenant auth/me 200", r.status_code == 200 and r.json().get("username") == "testtenant")

# 6) Forged cookie rejected
r = client.get("/api/auth/me", headers={"Cookie": "as_session=forged.invalid.token"})
check("forged cookie rejected (401)", r.status_code == 401)

# 7) No cookie rejected
r = client.get("/api/auth/me")
check("no cookie rejected (401)", r.status_code == 401)

# 8) Wrong password rejected
r = client.post("/api/login", json={"username": "testtenant", "password": "wrong"})
check("wrong password rejected (401)", r.status_code == 401)

# 9) Change password requires current + invalidates old
r = client.post("/api/auth/change-password",
                json={"current_password": "TempPass123!", "new_password": "NewPass123!"},
                headers=h(cookie))
check("change password 200", r.status_code == 200)
r = client.post("/api/login", json={"username": "testtenant", "password": "TempPass123!"})
check("old password invalidated", r.status_code == 401)
r = client.post("/api/login", json={"username": "testtenant", "password": "NewPass123!"})
check("new password works", r.status_code == 200)
# restore tenant password for repeatability
with pool.connection() as c:
    with c.cursor() as cur:
        cur.execute("UPDATE users SET password=%s WHERE id=%s;", (hash_password("TempPass123!"), "U-TESTTEN"))
        c.commit()

# 10) CORS locked
r = client.get("/api/auth/me", headers={"Origin": "https://evil.example.com"})
check("CORS rejects foreign origin", r.headers.get("access-control-allow-origin") != "https://evil.example.com")
r = client.get("/api/auth/me", headers={"Origin": "https://app.as-saas.com"})
check("CORS allows app.as-saas.com", r.headers.get("access-control-allow-origin") == "https://app.as-saas.com")

print("\nE2E COMPLETE")
