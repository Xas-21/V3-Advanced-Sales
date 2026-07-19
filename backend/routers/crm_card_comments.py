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
