# CRM Kanban Card Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add up to 5 inline comments on CRM kanban cards (request view → request targets; account view → account targets), persisted in Postgres, with collapse to the two most recent comments.

**Architecture:** New `crm_card_comments` table created on startup (and via migration script). Thin FastAPI router under `/api/crm/card-comments`. Small React `CrmCardComments` block rendered at the bottom of each kanban card in `CRM.tsx` — never as a separate board card. Pure collapse helpers live in `crmCardComments.ts` for a focused vitest.

**Tech Stack:** React 18 + TypeScript + Vite, FastAPI, PostgreSQL/psycopg, pytest, vitest, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-07-19-crm-kanban-card-comments-design.md`

## Global Constraints

- Comments are **inline inside** the existing request/account kanban card (below footer), never new kanban cards.
- Request view uses `targetType=request` + request id only; account view uses `targetType=account` + account id only — **not shared** across views.
- Max **5** comments per `(propertyId, targetType, targetId)`.
- Default UI shows **2 most recent**; **View all** / **Show less** toggles the rest.
- Any authenticated user may delete any comment.
- Body: trim, reject empty, max **500** chars; show author name + timestamp.
- Prefer fewest new files; match existing CRM card styling (`colors.*`).
- Before exploring code: run `graphify query` / `explain` from project root. After code changes: `graphify update .`.
- Do not commit unless the user explicitly asks (user git preference overrides plan commit steps — leave commit steps as optional checkpoints).

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/migrations/012_crm_card_comments.py` | Idempotent DDL for `crm_card_comments` |
| `backend/utils.py` | `_ensure_crm_card_comments_table()` + call from `init_database()` |
| `backend/routers/crm_card_comments.py` | GET/POST/DELETE API |
| `backend/main.py` | Register router (auth required) |
| `backend/tests/test_crm_card_comments.py` | API tests: cap 5, scope, delete |
| `crmCardComments.ts` | Types + `visibleCardComments()` collapse helper |
| `crmCardComments.test.ts` | Vitest for collapse helper |
| `CrmCardComments.tsx` | Inline UI: +, OK, trash, view all |
| `CRM.tsx` | Mount component on request-view and account-view cards |

---

### Task 1: Schema ensure + migration script

**Files:**
- Create: `backend/migrations/012_crm_card_comments.py`
- Modify: `backend/utils.py` (add `_ensure_crm_card_comments_table`, call from `init_database`)
- Test: verified by Task 2 pytest (table must exist)

**Interfaces:**
- Consumes: `_get_pool()`, `init_database()`, `storage_mode()`
- Produces: table `crm_card_comments` with columns matching the spec

- [x] **Step 1: Add ensure helper in `backend/utils.py`**

Near `_ensure_feed_tables` / before `init_database`, add:

```python
def _ensure_crm_card_comments_table():
    """CRM kanban card sticky comments (request vs account targets, max 5 enforced in API)."""
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
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
                );
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_crm_card_comments_target
                ON crm_card_comments (property_id, target_type, target_id, created_at DESC);
                """
            )
            conn.commit()
```

In `init_database()`, after `_ensure_feed_tables()` (or nearby), add:

```python
        _ensure_crm_card_comments_table()
```

- [x] **Step 2: Add migration script `backend/migrations/012_crm_card_comments.py`**

Mirror `011_account_rates.py` style:

```python
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
```

- [x] **Step 3: Apply schema locally**

Run (host or container, match how you usually hit Postgres):

```bash
cd backend
python migrations/012_crm_card_comments.py
```

Expected: `CRM_CARD_COMMENTS: 2 applied/verified, 0 skipped` (or OK lines).

- [x] **Step 4: Optional commit checkpoint**

```bash
git add backend/utils.py backend/migrations/012_crm_card_comments.py
git commit -m "feat(crm): add crm_card_comments table ensure and migration"
```

---

### Task 2: Backend CRUD API (TDD)

**Files:**
- Create: `backend/routers/crm_card_comments.py`
- Create: `backend/tests/test_crm_card_comments.py`
- Modify: `backend/main.py` (import + `include_router`)

**Interfaces:**
- Consumes: `require_user`, `can_access_property` from `auth_db` / `dependencies`, `_get_pool`
- Produces:
  - `GET /api/crm/card-comments?propertyId=&targetType=&targetId=` → `list[{id,targetType,targetId,body,authorUserId,authorName,createdAt}]` newest first
  - `POST /api/crm/card-comments` JSON `{propertyId,targetType,targetId,body}` → created item; 400 if empty/over 500/at cap 5
  - `DELETE /api/crm/card-comments/{id}?propertyId=` → `{ok:true}`; any auth user with property access

- [x] **Step 1: Write failing tests**

Create `backend/tests/test_crm_card_comments.py` (pattern from `test_account_rates.py`):

```python
"""CRM kanban card comments API: cap 5, target scope, any-user delete."""
import json
import secrets
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from main import app
from security import hash_password
from utils import get_database_url

client = TestClient(app, base_url="https://testserver")


def _any_property_id() -> str:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM properties ORDER BY id ASC LIMIT 1;")
            row = cur.fetchone()
    if not row:
        pytest.skip("no properties in database")
    return str(row["id"])


def _table_ready() -> bool:
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.crm_card_comments') AS t;")
            row = cur.fetchone()
    return bool(row and row.get("t"))


@pytest.fixture
def comments_fixtures():
    if not _table_ready():
        pytest.skip("crm_card_comments table missing — run migrations/012_crm_card_comments.py")

    home_pid = _any_property_id()
    uid = f"U-cc-{uuid.uuid4().hex[:10]}"
    uid2 = f"U-cc2-{uuid.uuid4().hex[:10]}"
    username = f"cc_user_{secrets.token_hex(4)}"
    username2 = f"cc_user2_{secrets.token_hex(4)}"
    password = f"Cc@{secrets.token_hex(6)}"
    password2 = f"Cc2@{secrets.token_hex(6)}"
    req_id = f"R-cc-{uuid.uuid4().hex[:8]}"
    acc_id = f"A-cc-{uuid.uuid4().hex[:8]}"

    conn = psycopg.connect(get_database_url())
    try:
        with conn.cursor() as cur:
            for u, uname, pwd, name in (
                (uid, username, password, "Commenter One"),
                (uid2, username2, password2, "Commenter Two"),
            ):
                cur.execute(
                    """
                    INSERT INTO users (id, username, password, name, role, status, property_id,
                                       assigned_property_ids, session_version)
                    VALUES (%s, %s, %s, %s, 'Sales Manager', 'active', %s, %s::jsonb, 0)
                    """,
                    (u, uname, hash_password(pwd), name, home_pid, json.dumps([home_pid])),
                )
        conn.commit()
    finally:
        conn.close()

    try:
        yield {
            "home_pid": home_pid,
            "username": username,
            "password": password,
            "username2": username2,
            "password2": password2,
            "req_id": req_id,
            "acc_id": acc_id,
        }
    finally:
        conn = psycopg.connect(get_database_url())
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM crm_card_comments WHERE property_id = %s AND target_id IN (%s, %s);",
                    (home_pid, req_id, acc_id),
                )
                cur.execute("DELETE FROM users WHERE id IN (%s, %s);", (uid, uid2))
            conn.commit()
        finally:
            conn.close()


def _session_cookie(username: str, password: str) -> str:
    r = client.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    raw = r.headers.get("set-cookie") or ""
    return raw.split(";")[0]


def test_create_list_cap_and_scope(comments_fixtures):
    fx = comments_fixtures
    cookie = _session_cookie(fx["username"], fx["password"])
    pid = fx["home_pid"]
    headers = {"Cookie": cookie}

    created_ids = []
    for i in range(5):
        r = client.post(
            "/api/crm/card-comments",
            headers=headers,
            json={
                "propertyId": pid,
                "targetType": "request",
                "targetId": fx["req_id"],
                "body": f"note {i}",
            },
        )
        assert r.status_code == 200, r.text
        created_ids.append(r.json()["id"])

    r6 = client.post(
        "/api/crm/card-comments",
        headers=headers,
        json={
            "propertyId": pid,
            "targetType": "request",
            "targetId": fx["req_id"],
            "body": "overflow",
        },
    )
    assert r6.status_code == 400

    # Account target is an independent bucket
    r_acc = client.post(
        "/api/crm/card-comments",
        headers=headers,
        json={
            "propertyId": pid,
            "targetType": "account",
            "targetId": fx["acc_id"],
            "body": "account note",
        },
    )
    assert r_acc.status_code == 200, r_acc.text

    r_list_req = client.get(
        "/api/crm/card-comments",
        headers=headers,
        params={"propertyId": pid, "targetType": "request", "targetId": fx["req_id"]},
    )
    assert r_list_req.status_code == 200
    req_items = r_list_req.json()
    assert len(req_items) == 5
    assert all(x["targetType"] == "request" for x in req_items)
    # newest first
    assert req_items[0]["body"] == "note 4"

    r_list_acc = client.get(
        "/api/crm/card-comments",
        headers=headers,
        params={"propertyId": pid, "targetType": "account", "targetId": fx["acc_id"]},
    )
    assert len(r_list_acc.json()) == 1
    assert r_list_acc.json()[0]["body"] == "account note"


def test_any_user_can_delete(comments_fixtures):
    fx = comments_fixtures
    cookie1 = _session_cookie(fx["username"], fx["password"])
    cookie2 = _session_cookie(fx["username2"], fx["password2"])
    pid = fx["home_pid"]

    r = client.post(
        "/api/crm/card-comments",
        headers={"Cookie": cookie1},
        json={
            "propertyId": pid,
            "targetType": "request",
            "targetId": fx["req_id"],
            "body": "delete me",
        },
    )
    assert r.status_code == 200
    cid = r.json()["id"]

    d = client.delete(
        f"/api/crm/card-comments/{cid}",
        headers={"Cookie": cookie2},
        params={"propertyId": pid},
    )
    assert d.status_code == 200, d.text

    listed = client.get(
        "/api/crm/card-comments",
        headers={"Cookie": cookie1},
        params={"propertyId": pid, "targetType": "request", "targetId": fx["req_id"]},
    ).json()
    assert all(x["id"] != cid for x in listed)


def test_reject_empty_and_too_long(comments_fixtures):
    fx = comments_fixtures
    cookie = _session_cookie(fx["username"], fx["password"])
    headers = {"Cookie": cookie}
    pid = fx["home_pid"]
    base = {
        "propertyId": pid,
        "targetType": "request",
        "targetId": fx["req_id"],
    }
    assert client.post("/api/crm/card-comments", headers=headers, json={**base, "body": "   "}).status_code == 400
    assert client.post(
        "/api/crm/card-comments", headers=headers, json={**base, "body": "x" * 501}
    ).status_code == 400
```

- [x] **Step 2: Run tests — expect FAIL**

```bash
cd backend
python -m pytest tests/test_crm_card_comments.py -v
```

Expected: FAIL (router missing / 404).

- [x] **Step 3: Implement router `backend/routers/crm_card_comments.py`**

```python
"""CRM kanban card sticky comments (request vs account targets)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Cookie, HTTPException, Query
from pydantic import BaseModel, Field

from auth_db import can_access_property
from dependencies import require_user
from security import SESSION_COOKIE_NAME
from utils import _get_pool

router = APIRouter(prefix="/api/crm/card-comments", tags=["CRM Card Comments"])

TARGET_TYPES = {"request", "account"}
MAX_BODY = 500
MAX_PER_TARGET = 5


class CommentCreate(BaseModel):
    propertyId: str
    targetType: Literal["request", "account"]
    targetId: str
    body: str = Field(default="")


def _iso(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, datetime):
        if val.tzinfo is None:
            val = val.replace(tzinfo=timezone.utc)
        return val.isoformat()
    return str(val)


def _row_to_item(row: dict) -> dict:
    return {
        "id": row["id"],
        "targetType": row["target_type"],
        "targetId": row["target_id"],
        "body": row["body"],
        "authorUserId": row["author_user_id"],
        "authorName": row["author_name"],
        "createdAt": _iso(row.get("created_at")),
    }


def _require_property(user: dict, property_id: str) -> str:
    pid = str(property_id or "").strip()
    if not pid:
        raise HTTPException(status_code=400, detail="propertyId is required")
    if not can_access_property(user, pid):
        raise HTTPException(status_code=403, detail="Access denied to this property")
    return pid


@router.get("")
def list_card_comments(
    propertyId: str = Query(...),
    targetType: str = Query(...),
    targetId: str = Query(...),
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pid = _require_property(user, propertyId)
    ttype = str(targetType or "").strip().lower()
    tid = str(targetId or "").strip()
    if ttype not in TARGET_TYPES or not tid:
        raise HTTPException(status_code=400, detail="Invalid targetType or targetId")
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, target_type, target_id, body, author_user_id, author_name, created_at
                FROM crm_card_comments
                WHERE property_id = %s AND target_type = %s AND target_id = %s
                ORDER BY created_at DESC, id DESC;
                """,
                (pid, ttype, tid),
            )
            rows = cur.fetchall() or []
    return [_row_to_item(r) for r in rows]


@router.post("")
def create_card_comment(
    payload: CommentCreate,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pid = _require_property(user, payload.propertyId)
    ttype = str(payload.targetType or "").strip().lower()
    tid = str(payload.targetId or "").strip()
    body = str(payload.body or "").strip()
    if ttype not in TARGET_TYPES or not tid:
        raise HTTPException(status_code=400, detail="Invalid targetType or targetId")
    if not body:
        raise HTTPException(status_code=400, detail="Comment cannot be empty.")
    if len(body) > MAX_BODY:
        raise HTTPException(status_code=400, detail=f"Comment too long (max {MAX_BODY} chars).")

    author_name = str(user.get("name") or user.get("username") or "User").strip() or "User"
    author_id = str(user["id"])
    comment_id = f"CCC-{uuid.uuid4().hex[:12]}"

    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS c FROM crm_card_comments
                WHERE property_id = %s AND target_type = %s AND target_id = %s;
                """,
                (pid, ttype, tid),
            )
            count = int((cur.fetchone() or {}).get("c") or 0)
            if count >= MAX_PER_TARGET:
                raise HTTPException(status_code=400, detail="Maximum of 5 comments reached for this card.")
            cur.execute(
                """
                INSERT INTO crm_card_comments
                    (id, property_id, target_type, target_id, body, author_user_id, author_name)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, target_type, target_id, body, author_user_id, author_name, created_at;
                """,
                (comment_id, pid, ttype, tid, body, author_id, author_name),
            )
            row = cur.fetchone()
            conn.commit()
    return _row_to_item(row)


@router.delete("/{comment_id}")
def delete_card_comment(
    comment_id: str,
    propertyId: str = Query(...),
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pid = _require_property(user, propertyId)
    cid = str(comment_id or "").strip()
    if not cid:
        raise HTTPException(status_code=400, detail="comment id required")
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM crm_card_comments
                WHERE id = %s AND property_id = %s
                RETURNING id;
                """,
                (cid, pid),
            )
            row = cur.fetchone()
            conn.commit()
    if not row:
        raise HTTPException(status_code=404, detail="Comment not found.")
    return {"ok": True}
```

- [x] **Step 4: Register router in `backend/main.py`**

Update import line (~73) to include `crm_card_comments`:

```python
from routers import auth, users, properties, rooms, venues, taxes, financials, reqs, crm_state, contact, accounts, tasks, uploads, contracts, cxl_reasons, promotions, account_rates, feed, chat, presence, crm_card_comments
```

Near other auth-required routers (~204):

```python
app.include_router(crm_card_comments.router, dependencies=_auth_required)
```

- [x] **Step 5: Run tests — expect PASS**

```bash
cd backend
python -m pytest tests/test_crm_card_comments.py -v
```

Expected: all tests PASS.

- [x] **Step 6: Optional commit checkpoint**

```bash
git add backend/routers/crm_card_comments.py backend/main.py backend/tests/test_crm_card_comments.py
git commit -m "feat(crm): add card-comments API with 5-comment cap"
```

---

### Task 3: Collapse helper + vitest

**Files:**
- Create: `crmCardComments.ts`
- Create: `crmCardComments.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `export type CrmCardCommentTargetType = 'request' | 'account'`
  - `export type CrmCardComment = { id: string; targetType: CrmCardCommentTargetType; targetId: string; body: string; authorUserId: string; authorName: string; createdAt: string }`
  - `export function visibleCardComments(commentsNewestFirst: CrmCardComment[], expanded: boolean, recentLimit = 2): CrmCardComment[]`

- [x] **Step 1: Write failing test `crmCardComments.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { visibleCardComments, type CrmCardComment } from './crmCardComments';

function c(id: string, body: string): CrmCardComment {
    return {
        id,
        targetType: 'request',
        targetId: 'R1',
        body,
        authorUserId: 'U1',
        authorName: 'Ada',
        createdAt: `2026-07-19T0${id}:00:00Z`,
    };
}

describe('visibleCardComments', () => {
    const five = [c('5', 'n5'), c('4', 'n4'), c('3', 'n3'), c('2', 'n2'), c('1', 'n1')];

    it('returns all when 2 or fewer', () => {
        expect(visibleCardComments(five.slice(0, 2), false).map((x) => x.id)).toEqual(['5', '4']);
    });

    it('shows only two most recent when collapsed', () => {
        expect(visibleCardComments(five, false).map((x) => x.id)).toEqual(['5', '4']);
    });

    it('shows all when expanded', () => {
        expect(visibleCardComments(five, true).map((x) => x.id)).toEqual(['5', '4', '3', '2', '1']);
    });
});
```

- [x] **Step 2: Run test — expect FAIL**

```bash
npx vitest run crmCardComments.test.ts
```

Expected: FAIL (module missing).

- [x] **Step 3: Implement `crmCardComments.ts`**

```typescript
export type CrmCardCommentTargetType = 'request' | 'account';

export type CrmCardComment = {
    id: string;
    targetType: CrmCardCommentTargetType;
    targetId: string;
    body: string;
    authorUserId: string;
    authorName: string;
    createdAt: string;
};

/** `commentsNewestFirst` must already be newest-first from the API. */
export function visibleCardComments(
    commentsNewestFirst: CrmCardComment[],
    expanded: boolean,
    recentLimit = 2
): CrmCardComment[] {
    const list = Array.isArray(commentsNewestFirst) ? commentsNewestFirst : [];
    if (expanded || list.length <= recentLimit) return list;
    return list.slice(0, recentLimit);
}

export const CRM_CARD_COMMENT_MAX = 5;
export const CRM_CARD_COMMENT_BODY_MAX = 500;
```

- [x] **Step 4: Run test — expect PASS**

```bash
npx vitest run crmCardComments.test.ts
```

Expected: PASS.

- [x] **Step 5: Optional commit checkpoint**

```bash
git add crmCardComments.ts crmCardComments.test.ts
git commit -m "feat(crm): add card comment collapse helper"
```

---

### Task 4: `CrmCardComments` React component

**Files:**
- Create: `CrmCardComments.tsx`

**Interfaces:**
- Consumes: `apiUrl` from `backendApi.ts`, helpers/constants from `crmCardComments.ts`, Lucide `Plus`/`Trash2`, theme `colors` object (same shape CRM already passes via `theme.colors`)
- Produces: `<CrmCardComments propertyId targetType targetId colors />`

- [x] **Step 1: Implement `CrmCardComments.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { apiUrl } from './backendApi';
import {
    CRM_CARD_COMMENT_BODY_MAX,
    CRM_CARD_COMMENT_MAX,
    visibleCardComments,
    type CrmCardComment,
    type CrmCardCommentTargetType,
} from './crmCardComments';

type Colors = {
    textMain: string;
    textMuted: string;
    border: string;
    primary: string;
    bg?: string;
    card?: string;
};

type Props = {
    propertyId: string;
    targetType: CrmCardCommentTargetType;
    targetId: string;
    colors: Colors;
    /** When true, hide add/delete controls. */
    readOnly?: boolean;
};

function formatWhen(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || '—';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CrmCardComments({
    propertyId,
    targetType,
    targetId,
    colors,
    readOnly = false,
}: Props) {
    const pid = String(propertyId || '').trim();
    const tid = String(targetId || '').trim();
    const [comments, setComments] = useState<CrmCardComment[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [composing, setComposing] = useState(false);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!pid || !tid) return;
        let cancelled = false;
        setError('');
        const qs = new URLSearchParams({
            propertyId: pid,
            targetType,
            targetId: tid,
        });
        fetch(apiUrl(`/api/crm/card-comments?${qs}`), { credentials: 'include' })
            .then(async (res) => {
                if (!res.ok) throw new Error('Failed to load comments');
                return res.json();
            })
            .then((data) => {
                if (!cancelled) setComments(Array.isArray(data) ? data : []);
            })
            .catch(() => {
                if (!cancelled) setError('Could not load comments');
            });
        return () => {
            cancelled = true;
        };
    }, [pid, targetType, tid]);

    if (!pid || !tid) return null;

    const visible = visibleCardComments(comments, expanded);
    const canAdd = !readOnly && comments.length < CRM_CARD_COMMENT_MAX;
    const showViewAll = comments.length > 2;

    async function saveComment() {
        const body = draft.trim();
        if (!body || busy) return;
        if (body.length > CRM_CARD_COMMENT_BODY_MAX) {
            setError(`Max ${CRM_CARD_COMMENT_BODY_MAX} characters`);
            return;
        }
        setBusy(true);
        setError('');
        try {
            const res = await fetch(apiUrl('/api/crm/card-comments'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: pid, targetType, targetId: tid, body }),
            });
            if (!res.ok) {
                const detail = await res.json().catch(() => ({}));
                throw new Error(detail?.detail || 'Save failed');
            }
            const created = (await res.json()) as CrmCardComment;
            setComments((prev) => [created, ...prev]);
            setDraft('');
            setComposing(false);
        } catch (e: any) {
            setError(String(e?.message || 'Save failed'));
        } finally {
            setBusy(false);
        }
    }

    async function removeComment(id: string) {
        if (readOnly || busy) return;
        setBusy(true);
        setError('');
        try {
            const qs = new URLSearchParams({ propertyId: pid });
            const res = await fetch(apiUrl(`/api/crm/card-comments/${encodeURIComponent(id)}?${qs}`), {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Delete failed');
            setComments((prev) => prev.filter((c) => c.id !== id));
        } catch {
            setError('Delete failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div
            className="mt-2 pt-2 border-t space-y-1.5"
            style={{ borderColor: colors.border }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {visible.map((c) => (
                <div key={c.id} className="flex items-start gap-1.5 text-[10px]">
                    <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap break-words" style={{ color: colors.textMain }}>
                            {c.body}
                        </p>
                        <p className="opacity-80 truncate" style={{ color: colors.textMuted }}>
                            {c.authorName || '—'} · {formatWhen(c.createdAt)}
                        </p>
                    </div>
                    {!readOnly ? (
                        <button
                            type="button"
                            title="Delete comment"
                            className="shrink-0 p-0.5 rounded opacity-60 hover:opacity-100"
                            style={{ color: colors.textMuted }}
                            disabled={busy}
                            onClick={() => void removeComment(c.id)}
                        >
                            <Trash2 size={12} />
                        </button>
                    ) : null}
                </div>
            ))}

            {showViewAll ? (
                <button
                    type="button"
                    className="text-[10px] font-medium underline-offset-2 hover:underline"
                    style={{ color: colors.primary }}
                    onClick={() => setExpanded((v) => !v)}
                >
                    {expanded ? 'Show less' : 'View all'}
                </button>
            ) : null}

            {composing ? (
                <div className="flex items-center gap-1">
                    <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value.slice(0, CRM_CARD_COMMENT_BODY_MAX))}
                        maxLength={CRM_CARD_COMMENT_BODY_MAX}
                        placeholder="Add comment…"
                        className="flex-1 min-w-0 px-1.5 py-1 rounded border text-[10px] outline-none"
                        style={{
                            backgroundColor: colors.bg || 'transparent',
                            borderColor: colors.border,
                            color: colors.textMain,
                        }}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void saveComment();
                            }
                        }}
                    />
                    <button
                        type="button"
                        className="px-1.5 py-1 rounded text-[10px] font-bold border"
                        style={{ borderColor: colors.border, color: colors.primary }}
                        disabled={busy || !draft.trim()}
                        onClick={() => void saveComment()}
                    >
                        OK
                    </button>
                </div>
            ) : canAdd ? (
                <button
                    type="button"
                    title="Add comment"
                    className="inline-flex items-center justify-center p-0.5 rounded opacity-70 hover:opacity-100"
                    style={{ color: colors.textMuted }}
                    onClick={() => {
                        setComposing(true);
                        setError('');
                    }}
                >
                    <Plus size={14} />
                </button>
            ) : null}

            {error ? (
                <p className="text-[10px]" style={{ color: colors.primary }}>
                    {error}
                </p>
            ) : null}
        </div>
    );
}
```

- [x] **Step 2: Smoke-check TypeScript**

```bash
npx tsc --noEmit --pretty false 2>&1 | Select-String -Pattern "CrmCardComments|crmCardComments" | Select-Object -First 20
```

Expected: no errors mentioning these files (project may have unrelated tsc noise).

- [x] **Step 3: Optional commit checkpoint**

```bash
git add CrmCardComments.tsx
git commit -m "feat(crm): add CrmCardComments inline UI component"
```

---

### Task 5: Wire into CRM kanban cards

**Files:**
- Modify: `CRM.tsx`

**Interfaces:**
- Consumes: `CrmCardComments`, `activeProperty?.id`, `crmReadOnly`, `req.id` (request view), `lead.accountId` (account view)
- Produces: comments block under request-card “Created by” row (~3337) and under account-view card footer (~3475)

- [x] **Step 1: Import component**

Near other imports at top of `CRM.tsx`:

```tsx
import CrmCardComments from './CrmCardComments';
```

- [x] **Step 2: Request-view card — after the “Created by” block (inside the bordered footer `div` that ends ~3338), before closing `</div>` of that footer**

Insert:

```tsx
                                                        <CrmCardComments
                                                            propertyId={String(activeProperty?.id || req?.propertyId || '')}
                                                            targetType="request"
                                                            targetId={String(req.id)}
                                                            colors={colors}
                                                            readOnly={crmReadOnly}
                                                        />
```

Place it **after** the Created-by row, still inside the card (either inside the `pt-2 border-t` footer or immediately after it). Prefer immediately after that footer `</div>` so the component’s own top border separates cleanly — if double borders look wrong, nest inside the footer and remove `CrmCardComments`’s outer `border-t` for this call site only (keep component border; nest inside footer without an extra wrapper border).

Recommended placement: **inside** the existing footer `div` that starts at the `pt-2 border-t` line (~3321), after the Created-by row (~3337), before that footer’s closing `</div>` (~3338). Then change `CrmCardComments` root to **not** use `border-t` when nested — simplest path: keep component `border-t` and place it **after** the footer `</div>` / before the card’s closing `</div>` (~3339).

Exact target: after line with `{details?.creatorName || '—'}` block closes, after footer `</div>`, before card `</div>`:

```tsx
                                                    </div>
                                                    <CrmCardComments
                                                        propertyId={String(activeProperty?.id || req?.propertyId || '')}
                                                        targetType="request"
                                                        targetId={String(req.id)}
                                                        colors={colors}
                                                        readOnly={crmReadOnly}
                                                    />
                                                </div>
```

- [x] **Step 3: Account-view card — after the Date / accountManager footer (~3468–3475), before card closing `</div>` (~3476)**

```tsx
                                                <CrmCardComments
                                                    propertyId={String(activeProperty?.id || lead?.propertyId || '')}
                                                    targetType="account"
                                                    targetId={String(lead.accountId || '')}
                                                    colors={colors}
                                                    readOnly={crmReadOnly}
                                                />
```

If `lead.accountId` is empty, component returns `null` (no UI).

- [x] **Step 4: Manual verification**

1. `docker compose up -d` (or local API + `npm run dev`).
2. CRM → **Request** view → open a card → `+` → type → OK → see author + time + trash.
3. Add until 5; `+` disappears; 6th attempt blocked.
4. With 3+ comments, only 2 show; **View all** expands; **Show less** collapses.
5. Switch to **Account** view → comments on an account card are independent (do not show request comments).
6. Second user (or same) can trash another user’s comment.

- [x] **Step 5: Optional commit checkpoint**

```bash
git add CRM.tsx
git commit -m "feat(crm): show inline card comments on request and account kanban cards"
```

---

### Task 6: Graphify refresh

**Files:** graph artifacts under `graphify-out/` (generated)

- [x] **Step 1: Update knowledge graph**

```bash
graphify update .
```

Expected: completes without error.

- [x] **Step 2: Optional commit** — only if the user wants graphify-out committed (often gitignored or noisy; skip unless asked).

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| Dedicated table + API | 1, 2 |
| Max 5 / empty / 500 chars | 2 |
| Any user delete | 2 |
| Author + timestamp | 2, 4 |
| Inline on card, not separate kanban card | 4, 5 |
| Request vs account targets not shared | 2, 5 |
| Show 2 recent + View all | 3, 4 |
| `+` / OK / trash / another `+` | 4 |
| Hide `+` at 5 | 4 |
| Backend pytest | 2 |
| Frontend collapse check | 3 |
| Out of scope (edit, WS, feed reuse) | not implemented |

## Placeholder scan

No TBD/TODO placeholders. Exact paths, commands, and code included.

## Type consistency

- API camelCase: `propertyId`, `targetType`, `targetId`, `authorUserId`, `authorName`, `createdAt`
- DB snake_case mapped in router
- `CrmCardComment` matches API JSON
- `visibleCardComments(commentsNewestFirst, expanded, recentLimit=2)` used by component
)
