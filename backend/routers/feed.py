"""Social Feed: staff posts, comments, and emoji reactions.

Relational, FK-enforced tables (feed_posts / feed_comments / feed_reactions).
Any authenticated user can post; posts are scoped to the author's property so
staff across properties don't cross-contaminate the feed. Reactions use a
(post_id, user_id, emoji) PK so a user can react once per emoji (toggle).
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Cookie, HTTPException
from pydantic import BaseModel

from utils import _get_pool
from auth_db import resolve_session, is_admin
from dependencies import require_user
from security import SESSION_COOKIE_NAME

router = APIRouter(prefix="/api/feed", tags=["Feed"])

REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👏", "💡", "✅"]


class PostCreate(BaseModel):
    body: str = ""
    imageUrl: Optional[str] = None


class CommentCreate(BaseModel):
    body: str


def _row_to_post(row: dict, current_user_id: Optional[str] = None) -> dict:
    reactions = row.get("reactions") or []
    # reactions may already be a list of {emoji,count,reacted_by_me} (from list) or
    # a list of emoji strings (from create). Normalize both.
    counts: dict[str, int] = {}
    my_emojis: list[str] = []
    if reactions and isinstance(reactions[0], dict):
        for r in reactions:
            em = r.get("emoji")
            counts[em] = int(r.get("cnt") or r.get("count") or 0)
            if current_user_id and r.get("reacted_by_me"):
                my_emojis.append(em)
    elif reactions and isinstance(reactions[0], str):
        for em in reactions:
            counts[em] = counts.get(em, 0) + 1
            if em not in my_emojis:
                my_emojis.append(em)
    return {
        "id": row["id"],
        "authorUserId": row["author_user_id"],
        "authorName": row.get("author_name") or row.get("username") or "Unknown",
        "authorRole": row.get("author_role"),
        "propertyId": row.get("property_id"),
        "body": row.get("body") or "",
        "imageUrl": row.get("image_url"),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
        "comments": row.get("comments") or [],
        "reactionCounts": counts,
        "myReactions": my_emojis,
    }


@router.get("")
def list_feed(
    property_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    scope_pid = property_id
    if not scope_pid and user.get("property_id"):
        scope_pid = user.get("property_id")
    if not scope_pid and user.get("property_ids"):
        scope_pid = user["property_ids"][0] if isinstance(user["property_ids"], list) else None

    limit = max(1, min(int(limit), 100))
    offset = max(0, int(offset))

    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if scope_pid:
                cur.execute(
                    """SELECT p.*, u.name AS author_name, u.role AS author_role, u.username
                       FROM feed_posts p LEFT JOIN users u ON u.id = p.author_user_id
                       WHERE p.property_id = %s OR p.property_id IS NULL
                       ORDER BY p.created_at DESC LIMIT %s OFFSET %s;""",
                    (scope_pid, limit, offset),
                )
            else:
                cur.execute(
                    """SELECT p.*, u.name AS author_name, u.role AS author_role, u.username
                       FROM feed_posts p LEFT JOIN users u ON u.id = p.author_user_id
                       ORDER BY p.created_at DESC LIMIT %s OFFSET %s;""",
                    (limit, offset),
                )
            posts = cur.fetchall()

            result = []
            for p in posts:
                pid = p["id"]
                # comments
                cur.execute(
                    """SELECT c.id, c.body, c.author_user_id, cu.name AS author_name, c.created_at
                       FROM feed_comments c LEFT JOIN users cu ON cu.id = c.author_user_id
                       WHERE c.post_id = %s ORDER BY c.created_at ASC;""",
                    (pid,),
                )
                comments = [
                    {
                        "id": c["id"],
                        "body": c["body"],
                        "authorUserId": c["author_user_id"],
                        "authorName": c.get("author_name") or "Unknown",
                        "createdAt": c["created_at"],
                    }
                    for c in cur.fetchall()
                ]
                # reactions aggregated
                cur.execute(
                    """SELECT emoji, COUNT(*) AS cnt, BOOL_OR(user_id = %s) AS reacted_by_me
                       FROM feed_reactions WHERE post_id = %s GROUP BY emoji;""",
                    (user["id"], pid),
                )
                reaction_rows = cur.fetchall()
                p["comments"] = comments
                p["reactions"] = reaction_rows
                result.append(_row_to_post(p, user["id"]))
    return result


@router.post("")
def create_post(
    payload: PostCreate,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    body = (payload.body or "").strip()
    if not body and not payload.imageUrl:
        raise HTTPException(status_code=400, detail="Post must have text or an image.")
    if len(body) > 5000:
        raise HTTPException(status_code=400, detail="Post body too long (max 5000 chars).")
    post_id = f"FP-{uuid.uuid4().hex[:12]}"
    pid = user.get("property_id")
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO feed_posts (id, author_user_id, property_id, body, image_url) VALUES (%s, %s, %s, %s, %s) RETURNING *;", (post_id, user["id"], pid, body, payload.imageUrl))
            row = cur.fetchone()
            conn.commit()
    row["author_name"] = user.get("name") or user.get("username")
    row["author_role"] = user.get("role")
    row["username"] = user.get("username")
    row["comments"] = []
    row["reactions"] = []
    return _row_to_post(row, user["id"])


@router.delete("/{post_id}")
def delete_post(
    post_id: str,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT author_user_id FROM feed_posts WHERE id=%s;", (post_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Post not found.")
            if row["author_user_id"] != user["id"] and not is_admin(user):
                raise HTTPException(status_code=403, detail="You can only delete your own posts.")
            cur.execute("DELETE FROM feed_posts WHERE id=%s;", (post_id,))
            conn.commit()
    return {"ok": True}


@router.post("/{post_id}/comments")
def add_comment(
    post_id: str,
    payload: CommentCreate,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comment cannot be empty.")
    if len(body) > 2000:
        raise HTTPException(status_code=400, detail="Comment too long (max 2000 chars).")
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM feed_posts WHERE id=%s;", (post_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Post not found.")
            comment_id = f"FC-{uuid.uuid4().hex[:12]}"
            cur.execute(
                """INSERT INTO feed_comments (id, post_id, author_user_id, body)
                   VALUES (%s, %s, %s, %s) RETURNING *;""",
                (comment_id, post_id, user["id"], body),
            )
            conn.commit()
    return {
        "id": comment_id,
        "postId": post_id,
        "authorUserId": user["id"],
        "authorName": user.get("name") or user.get("username"),
        "body": body,
        "createdAt": None,
    }


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: str,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT author_user_id FROM feed_comments WHERE id=%s;", (comment_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Comment not found.")
            if row["author_user_id"] != user["id"] and not is_admin(user):
                raise HTTPException(status_code=403, detail="You can only delete your own comments.")
            cur.execute("DELETE FROM feed_comments WHERE id=%s;", (comment_id,))
            conn.commit()
    return {"ok": True}


@router.post("/{post_id}/reactions")
def toggle_reaction(
    post_id: str,
    payload: dict,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    emoji = (payload.get("emoji") or "").strip()
    if emoji not in REACTION_EMOJIS:
        raise HTTPException(status_code=400, detail="Unsupported reaction.")
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM feed_posts WHERE id=%s;", (post_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Post not found.")
            # Toggle: delete if exists, else insert.
            cur.execute(
                "SELECT 1 FROM feed_reactions WHERE post_id=%s AND user_id=%s AND emoji=%s;",
                (post_id, user["id"], emoji),
            )
            if cur.fetchone():
                cur.execute(
                    "DELETE FROM feed_reactions WHERE post_id=%s AND user_id=%s AND emoji=%s;",
                    (post_id, user["id"], emoji),
                )
                reacted = False
            else:
                cur.execute(
                    "INSERT INTO feed_reactions (post_id, user_id, emoji) VALUES (%s, %s, %s);",
                    (post_id, user["id"], emoji),
                )
                reacted = True
            conn.commit()
    return {"ok": True, "reacted": reacted, "emoji": emoji}
