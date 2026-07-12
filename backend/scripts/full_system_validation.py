import os
import random
import string
from typing import Any, Dict, List

import httpx
from dotenv import load_dotenv
from psycopg import connect


BASE_URL = "http://127.0.0.1:8000"


def rid(prefix: str) -> str:
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{prefix}_{suffix}"


def assert_true(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def get_json(client: httpx.Client, path: str):
    response = client.get(f"{BASE_URL}{path}")
    response.raise_for_status()
    return response.json()


def post_json(client: httpx.Client, path: str, payload: Dict[str, Any]):
    response = client.post(f"{BASE_URL}{path}", json=payload)
    response.raise_for_status()
    return response.json()


def put_json(client: httpx.Client, path: str, payload: Dict[str, Any]):
    response = client.put(f"{BASE_URL}{path}", json=payload)
    response.raise_for_status()
    return response.json()


def delete_path(client: httpx.Client, path: str):
    response = client.delete(f"{BASE_URL}{path}")
    response.raise_for_status()
    return response.json()


def login(username: str, password: str) -> httpx.Client:
    client = httpx.Client(timeout=30.0)
    response = client.post(
        f"{BASE_URL}/api/login",
        json={"username": username, "password": password},
    )
    response.raise_for_status()
    return client


def ensure_property_user_assignment(client: httpx.Client, prop: Dict[str, Any], user_ids: List[str]):
    assigned = list(dict.fromkeys([*(prop.get("assignedUserIds") or []), *user_ids]))
    payload = {**prop, "assignedUserIds": assigned}
    post_json(client, "/api/properties", payload)
    return assigned


def main():
    print("== Full system validation started ==")
    anon = httpx.Client(timeout=30.0)

    health = get_json(anon, "/api/health")
    print("health:", health)
    assert_true(health.get("storage") == "postgres", "Backend is not using postgres mode.")

    users = get_json(anon, "/api/users")
    properties = get_json(anon, "/api/properties")
    assert_true(isinstance(users, list) and len(users) >= 2, "Need at least 2 users.")
    assert_true(isinstance(properties, list) and len(properties) >= 1, "Need at least 1 property.")

    abdullah = next((u for u in users if str(u.get("username")) == "Abdullah"), None)
    sultan = next((u for u in users if str(u.get("username")) == "Sultan.jan"), None)
    assert_true(abdullah is not None, "Abdullah user not found.")
    assert_true(sultan is not None, "Sultan.jan user not found.")

    shaden = next((p for p in properties if "Shaden" in str(p.get("name", ""))), None)
    assert_true(shaden is not None, "Shaden property not found.")
    shaden_id = str(shaden["id"])

    assigned = ensure_property_user_assignment(anon, shaden, [abdullah["id"], sultan["id"]])
    print("shaden assignedUserIds:", assigned)

    # Shared-property test data (Shaden)
    test_accounts = [
        {
            "id": "A_test_1",
            "name": "Test Account 1",
            "type": "Corporate",
            "city": "Riyadh",
            "country": "Saudi Arabia",
            "propertyId": shaden_id,
            "createdByUserId": abdullah["id"],
            "ownerUserId": abdullah["id"],
            "contacts": [],
        },
        {
            "id": "A_test_2",
            "name": "Test Account 2",
            "type": "Travel Agency",
            "city": "Jeddah",
            "country": "Saudi Arabia",
            "propertyId": shaden_id,
            "createdByUserId": abdullah["id"],
            "ownerUserId": abdullah["id"],
            "contacts": [],
        },
        {
            "id": "A_test_3",
            "name": "Test Account 3",
            "type": "DMC",
            "city": "Dammam",
            "country": "Saudi Arabia",
            "propertyId": shaden_id,
            "createdByUserId": abdullah["id"],
            "ownerUserId": abdullah["id"],
            "contacts": [],
        },
        {
            "id": "A_test_4",
            "name": "Test Account 4",
            "type": "MICE",
            "city": "AlUla",
            "country": "Saudi Arabia",
            "propertyId": shaden_id,
            "createdByUserId": abdullah["id"],
            "ownerUserId": abdullah["id"],
            "contacts": [],
        },
    ]
    put_json(
        anon,
        "/api/accounts/sync",
        {"propertyId": shaden_id, "accounts": test_accounts, "allowClear": True},
    )

    # Clear existing requests on Shaden first
    existing_requests = get_json(anon, f"/api/requests?propertyId={shaden_id}")
    for req in existing_requests:
        delete_path(anon, f"/api/requests/{req['id']}")

    req_abd = {
        "id": rid("REQABD"),
        "requestName": "Abdullah Corporate Group",
        "requestType": "Accommodation",
        "status": "Tentative",
        "propertyId": shaden_id,
        "createdByUserId": abdullah["id"],
        "accountId": "A_test_1",
        "accountName": "Test Account 1",
        "segment": "Corporate",
        "receivedDate": "2026-04-11",
        "checkIn": "2026-05-02",
        "checkOut": "2026-05-05",
        "nights": 3,
        "rooms": [{"id": rid("RM"), "type": "Deluxe", "occupancy": "Double", "count": 5, "rate": 850}],
        "payments": [{"id": rid("PAY"), "method": "Bank Transfer", "amount": 5000, "date": "2026-04-11"}],
        "logs": [{"date": "2026-04-11T20:20:00Z", "user": "Abdullah", "action": "Request Created"}],
        "totalCost": "12750.00",
        "paidAmount": "5000.00",
    }
    req_sultan = {
        "id": rid("REQSUL"),
        "requestName": "Sultan Event Lead",
        "requestType": "Event",
        "status": "Inquiry",
        "propertyId": shaden_id,
        "createdByUserId": sultan["id"],
        "accountId": "A_test_2",
        "accountName": "Test Account 2",
        "segment": "Event",
        "receivedDate": "2026-04-11",
        "checkIn": "2026-05-10",
        "checkOut": "2026-05-10",
        "nights": 0,
        "rooms": [],
        "agenda": [
            {
                "id": rid("AG"),
                "startDate": "2026-05-10",
                "endDate": "2026-05-10",
                "venue": "Main Ballroom",
                "shape": "Theater",
                "pax": 80,
            }
        ],
        "payments": [{"id": rid("PAY"), "method": "Cash", "amount": 2000, "date": "2026-04-11"}],
        "logs": [{"date": "2026-04-11T20:21:00Z", "user": "Sultan.jan", "action": "Request Created"}],
        "totalCost": "6000.00",
        "paidAmount": "2000.00",
    }
    post_json(anon, "/api/requests", req_abd)
    post_json(anon, "/api/requests", req_sultan)

    # Sales calls / CRM activity + leads for calendar/charts paths
    crm_payload = {
        "propertyId": shaden_id,
        "leads": {
            "new": [
                {
                    "id": rid("LEAD"),
                    "accountId": "A_test_1",
                    "company": "Test Account 1",
                    "value": 18000,
                    "stage": "new",
                    "ownerUserId": abdullah["id"],
                    "propertyId": shaden_id,
                    "nextActionDate": "2026-05-01",
                }
            ],
            "qualified": [],
            "proposal": [],
            "negotiation": [],
            "won": [],
            "notInterested": [],
        },
        "accountActivities": {
            "A_test_1": [
                {
                    "id": rid("CALL"),
                    "type": "sales_call",
                    "date": "2026-04-11",
                    "user": "Abdullah",
                    "notes": "Initial sales call",
                }
            ],
            "A_test_2": [
                {
                    "id": rid("CALL"),
                    "type": "sales_call",
                    "date": "2026-04-11",
                    "user": "Sultan.jan",
                    "notes": "Event follow-up call",
                }
            ],
        },
    }
    post_json(anon, "/api/crm-state", crm_payload)

    # Settings-style datasets (rooms, venues, taxes, financials)
    post_json(
        anon,
        "/api/rooms",
        {"id": rid("ROOM"), "propertyId": shaden_id, "name": "Executive Suite", "capacity": 2, "baseRate": 1200},
    )
    post_json(
        anon,
        "/api/venues",
        {"id": rid("VEN"), "propertyId": shaden_id, "name": "Conference Hall A", "capacity": 120, "rental": 4500},
    )
    post_json(
        anon,
        "/api/financials",
        {"id": rid("FIN"), "propertyId": shaden_id, "year": 2026, "month": 4, "forecastRevenue": 950000, "budget": 780000},
    )
    post_json(
        anon,
        "/api/taxes",
        {
            "id": rid("TAX"),
            "propertyId": shaden_id,
            "label": "Tourism Levy QA",
            "rate": 5,
            "scope": {"accommodation": True, "transport": False, "foodAndBeverage": False, "events": True},
        },
    )

    # Validate shared visibility for Abdullah + Sultan on Shaden
    abd_client = login("Abdullah", os.environ.get("TEST_ADMIN_PASS", ""))
    sultan_client = login("Sultan.jan", os.environ.get("TEST_SULTAN_PASS", ""))

    abd_accounts = get_json(abd_client, f"/api/accounts?propertyId={shaden_id}")
    sul_accounts = get_json(sultan_client, f"/api/accounts?propertyId={shaden_id}")
    abd_requests = get_json(abd_client, f"/api/requests?propertyId={shaden_id}")
    sul_requests = get_json(sultan_client, f"/api/requests?propertyId={shaden_id}")
    abd_crm = get_json(abd_client, f"/api/crm-state?propertyId={shaden_id}")
    sul_crm = get_json(sultan_client, f"/api/crm-state?propertyId={shaden_id}")

    assert_true(
        sorted([a.get("id") for a in abd_accounts]) == sorted([a.get("id") for a in sul_accounts]),
        "Abdullah/Sultan account lists differ for same property.",
    )
    assert_true(
        sorted([r.get("id") for r in abd_requests]) == sorted([r.get("id") for r in sul_requests]),
        "Abdullah/Sultan request lists differ for same property.",
    )
    assert_true(
        abd_crm.get("leads") == sul_crm.get("leads"),
        "Abdullah/Sultan CRM leads differ for same property.",
    )

    # Add another property + user and verify separation
    qa_prop_id = rid("PQA")
    qa_prop_name = f"QA Isolated Property {rid('N')}"
    qa_property = {
        "id": qa_prop_id,
        "name": qa_prop_name,
        "city": "Tabuk",
        "country": "Saudi Arabia",
        "assignedUserIds": [],
    }
    post_json(anon, "/api/properties", qa_property)

    qa_user = {
        "id": rid("UQA"),
        "name": "QA Isolated User",
        "username": rid("qa.user"),
        "email": f"{rid('qa')}@example.com",
        "role": "Sales",
        "propertyId": qa_prop_id,
        "password": "password123",
    }
    post_json(anon, "/api/users", qa_user)

    # Assign QA user to QA property explicitly
    qa_property["assignedUserIds"] = [qa_user["id"]]
    post_json(anon, "/api/properties", qa_property)

    # Add isolated QA data
    put_json(
        anon,
        "/api/accounts/sync",
        {
            "propertyId": qa_prop_id,
            "allowClear": True,
            "accounts": [
                {
                    "id": rid("AQ"),
                    "name": "QA Isolated Account",
                    "propertyId": qa_prop_id,
                    "createdByUserId": qa_user["id"],
                    "ownerUserId": qa_user["id"],
                    "contacts": [],
                }
            ],
        },
    )
    post_json(
        anon,
        "/api/requests",
        {
            "id": rid("RQA"),
            "requestName": "QA Isolated Request",
            "requestType": "Accommodation",
            "status": "Inquiry",
            "propertyId": qa_prop_id,
            "createdByUserId": qa_user["id"],
            "accountName": "QA Isolated Account",
            "payments": [],
        },
    )

    shaden_accounts_after = get_json(anon, f"/api/accounts?propertyId={shaden_id}")
    shaden_requests_after = get_json(anon, f"/api/requests?propertyId={shaden_id}")
    qa_accounts = get_json(anon, f"/api/accounts?propertyId={qa_prop_id}")
    qa_requests = get_json(anon, f"/api/requests?propertyId={qa_prop_id}")

    assert_true(len(qa_accounts) >= 1, "QA property accounts missing.")
    assert_true(len(qa_requests) >= 1, "QA property requests missing.")
    assert_true(
        all(str(a.get("propertyId")) == qa_prop_id for a in qa_accounts),
        "QA accounts contain wrong property IDs.",
    )
    assert_true(
        all(str(r.get("propertyId")) == qa_prop_id for r in qa_requests),
        "QA requests contain wrong property IDs.",
    )
    assert_true(
        all(str(a.get("propertyId")) == shaden_id for a in shaden_accounts_after),
        "Shaden accounts include non-Shaden data.",
    )
    assert_true(
        all(str(r.get("propertyId")) == shaden_id for r in shaden_requests_after),
        "Shaden requests include non-Shaden data.",
    )

    # DB schema and collection integrity
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    db_url = os.getenv("DATABASE_URL", "").strip()
    assert_true(bool(db_url), "DATABASE_URL is missing for schema check.")
    with connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.app_collections');")
            table_name = cur.fetchone()[0]
            assert_true(table_name is not None, "app_collections table missing.")
            cur.execute(
                """
                SELECT name,
                       jsonb_typeof(payload) AS payload_type,
                       CASE WHEN jsonb_typeof(payload) = 'array'
                            THEN jsonb_array_length(payload)
                            ELSE NULL
                       END AS payload_count
                FROM app_collections
                ORDER BY name;
                """
            )
            collections = cur.fetchall()

    print("== Validation Summary ==")
    print(f"Shaden accounts visible to both users: {len(abd_accounts)}")
    print(f"Shaden requests visible to both users: {len(abd_requests)}")
    print(f"CRM lead buckets keys: {list((abd_crm.get('leads') or {}).keys())}")
    print(f"QA property id: {qa_prop_id}, accounts: {len(qa_accounts)}, requests: {len(qa_requests)}")
    print("DB collections:", collections)
    print("RESULT: PASS")


if __name__ == "__main__":
    main()
