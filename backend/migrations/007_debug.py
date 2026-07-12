import sys
sys.path.insert(0, "/app")
import os
from dotenv import load_dotenv
load_dotenv("/app/.env", override=True)
from fastapi.testclient import TestClient
import main
from security import hash_password
from utils import _get_pool

pool = _get_pool()
with pool.connection() as c:
    with c.cursor() as cur:
        cur.execute("UPDATE users SET password=%s, status=%s WHERE id=%s;",
                    (hash_password("TempPass123!"), "active", "U-TESTTEN"))
        c.commit()

client = TestClient(main.app)


def cookie_val(set_cookie_header):
    if not set_cookie_header:
        return None
    return set_cookie_header.split(";")[0]  # as_session=token


def h(ck):
    return {"Cookie": ck} if ck else {}


r = client.post("/api/login", json={"username": "testtenant", "password": "TempPass123!"})
ck = cookie_val(r.headers.get("set-cookie"))
print("tenant login:", r.status_code, "cookie:", bool(ck))

r = client.get("/api/auth/me", headers=h(ck))
print("tenant auth/me:", r.status_code, r.text[:150])

r = client.post("/api/auth/change-password",
                json={"current_password": "TempPass123!", "new_password": "NewPass123!"},
                headers=h(ck))
print("change pw:", r.status_code, r.text[:150])

r = client.post("/api/login", json={"username": "testtenant", "password": "TempPass123!"})
print("old pw after change:", r.status_code)
r = client.post("/api/login", json={"username": "testtenant", "password": "NewPass123!"})
print("new pw login:", r.status_code)
