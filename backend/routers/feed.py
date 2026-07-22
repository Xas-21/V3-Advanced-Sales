"""Social Feed: staff posts, comments, reactions, polls, tasks and events.

Relational, FK-enforced tables (feed_posts / feed_comments / feed_reactions /
feed_poll_votes / feed_event_rsvps). Posts are scoped to the author's property so
staff across properties don't cross-contaminate the feed.

Post types (self-contained, not linked to other modules):
  - message : rich text + attachments
  - task    : title/assignee/due + a done checkbox (meta.task)
  - poll    : question + options with live single-choice voting (feed_poll_votes)
  - event   : title/location/date with going/maybe/no RSVPs (feed_event_rsvps)

Rich text (body_html) is sanitized server-side (bleach) and again client-side
(DOMPurify) before render. @mentions and #hashtags are extracted for filtering.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Cookie, HTTPException
from pydantic import BaseModel

from utils import _get_pool
from auth_db import is_admin
from dependencies import require_user
from security import SESSION_COOKIE_NAME
from data_access import _broadcast_change
from services.rich_text import (
    sanitize_html,
    html_to_text,
    extract_hashtags,
    normalize_mentions,
)

router = APIRouter(prefix="/api/feed", tags=["Feed"])

REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👏", "💡", "✅"]
POST_TYPES = {"message", "task", "poll", "event"}
RSVP_STATUSES = {"going", "maybe", "no"}
ATTACH_TYPES = {"image", "video", "file", "raw"}
MAX_ATTACHMENTS = 12


def _broadcast_feed(property_id, post_id: str, reason: str) -> None:
    """Notify feed viewers of this property to refetch (posts/comments/etc.).

    A lightweight refresh signal keeps every connected staff member's feed live
    without streaming full payloads. Scoped to the post's property so feeds don't
    cross-contaminate; posts with no property (NULL) broadcast globally.
    """
    try:
        _broadcast_change("refresh", "feed", {"postId": post_id, "reason": reason}, property_id or None)
    except Exception as e:
        logging.getLogger(__name__).warning("feed broadcast failed: %s", e)


def _user_property_ids(user: dict) -> list[str]:
    """All property ids a user can access (camelCase-normalized session shape)."""
    ids = user.get("property_ids")
    if isinstance(ids, list) and ids:
        return [str(x) for x in ids if x]
    pid = user.get("propertyId")
    return [str(pid)] if pid else []


def _default_property_id(user: dict) -> Optional[str]:
    pid = user.get("propertyId")
    if pid:
        return str(pid)
    ids = _user_property_ids(user)
    return ids[0] if ids else None


# ---------------------------------------------------------------------------
# Payload cleaning
# ---------------------------------------------------------------------------

def _clean_attachments(items) -> list[dict]:
    """Keep only the whitelisted fields from each attachment descriptor."""
    if not isinstance(items, list):
        return []
    out: list[dict] = []
    for it in items[:MAX_ATTACHMENTS]:
        if not isinstance(it, dict):
            continue
        url = str(it.get("url") or "").strip()
        if not url:
            continue
        a_type = str(it.get("type") or "file").lower()
        if a_type not in ATTACH_TYPES:
            a_type = "file"
        att = {
            "url": url[:1000],
            "publicId": str(it.get("publicId") or "")[:400] or None,
            "type": a_type,
            "name": str(it.get("name") or "")[:200] or None,
        }
        try:
            if it.get("bytes") is not None:
                att["bytes"] = int(it.get("bytes"))
        except (TypeError, ValueError):
            pass
        out.append(att)
    return out


def _clean_meta(post_type: str, meta) -> dict:
    """Validate/normalize the type-specific meta payload.

    Accepts both shapes the UI may send:
      - nested: { poll: { question, options } } / { task: {...} } / { event: {...} }
      - flat:   { question, options } / { title, ... }
    Always returns the nested storage shape used by the feed serializer.
    """
    meta = meta if isinstance(meta, dict) else {}

    def _src(key: str) -> dict:
        nested = meta.get(key)
        return nested if isinstance(nested, dict) else meta

    if post_type == "poll":
        src = _src("poll")
        raw_opts = src.get("options") or meta.get("options") or []
        options = [str(o).strip()[:140] for o in raw_opts if str(o).strip()][:10]
        if len(options) < 2:
            raise HTTPException(status_code=400, detail="A poll needs at least 2 options.")
        question = str(src.get("question") or meta.get("question") or "").strip()[:280]
        return {
            "poll": {
                "question": question,
                "options": options,
                "allowMultiple": False,
            }
        }
    if post_type == "task":
        src = _src("task")
        return {
            "task": {
                "title": str(src.get("title") or meta.get("title") or "").strip()[:280],
                "assigneeUserId": str(src.get("assigneeUserId") or meta.get("assigneeUserId") or "").strip() or None,
                "assigneeName": str(src.get("assigneeName") or meta.get("assigneeName") or "").strip()[:160] or None,
                "dueDate": str(src.get("dueDate") or meta.get("dueDate") or "").strip()[:40] or None,
                "priority": (str(src.get("priority") or meta.get("priority") or "normal").strip().lower()[:20]) or "normal",
                "done": bool(src.get("done") if "done" in src else meta.get("done")),
            }
        }
    if post_type == "event":
        src = _src("event")
        title = str(src.get("title") or meta.get("title") or "").strip()[:280]
        if not title:
            raise HTTPException(status_code=400, detail="An event needs a title.")
        return {
            "event": {
                "title": title,
                "location": str(src.get("location") or meta.get("location") or "").strip()[:280] or None,
                "startAt": str(src.get("startAt") or meta.get("startAt") or "").strip()[:40] or None,
                "endAt": str(src.get("endAt") or meta.get("endAt") or "").strip()[:40] or None,
            }
        }
    return {}


def _filter_valid_mentions(cur, ids: list[str]) -> list[str]:
    """Drop mention ids that don't correspond to a real user."""
    ids = normalize_mentions(ids)
    if not ids:
        return []
    cur.execute("SELECT id FROM users WHERE id = ANY(%s);", (ids,))
    existing = {r["id"] for r in cur.fetchall()}
    return [i for i in ids if i in existing]


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class PostCreate(BaseModel):
    body: str = ""
    bodyHtml: Optional[str] = None
    imageUrl: Optional[str] = None
    propertyId: Optional[str] = None
    postType: str = "message"
    attachments: list = []
    mentions: list = []
    hashtags: list = []
    meta: dict = {}


class CommentCreate(BaseModel):
    body: str = ""
    bodyHtml: Optional[str] = None
    mentions: list = []


class PollVote(BaseModel):
    optionIndex: int


class EventRsvp(BaseModel):
    status: str


class TaskToggle(BaseModel):
    done: Optional[bool] = None


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

def _row_to_post(row: dict, current_user_id: Optional[str] = None) -> dict:
    reactions = row.get("reactions") or []
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

    meta = row.get("meta") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}

    post = {
        "id": row["id"],
        "authorUserId": row["author_user_id"],
        "authorName": row.get("author_name") or row.get("username") or "Unknown",
        "authorRole": row.get("author_role"),
        "authorAvatar": row.get("author_avatar"),
        "propertyId": row.get("property_id"),
        "postType": row.get("post_type") or "message",
        "body": row.get("body") or "",
        "bodyHtml": row.get("body_html") or None,
        "imageUrl": row.get("image_url"),
        "attachments": row.get("attachments") or [],
        "mentions": row.get("mentions") or [],
        "hashtags": row.get("hashtags") or [],
        "meta": meta,
        "pinned": bool(row.get("is_pinned")),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
        "comments": row.get("comments") or [],
        "reactionCounts": counts,
        "myReactions": my_emojis,
    }

    # Poll results
    if post["postType"] == "poll":
        options = (meta.get("poll") or {}).get("options") or []
        tallies = [0] * len(options)
        voters_by_option: list[list[dict]] = [[] for _ in options]
        my_vote = None
        for v in (row.get("poll_votes") or []):
            idx = v.get("option_index")
            if not isinstance(idx, int) or not (0 <= idx < len(tallies)):
                continue
            # Aggregated count rows (legacy path) vs per-voter rows
            if "user_id" in v or "user_name" in v:
                tallies[idx] += 1
                voters_by_option[idx].append({
                    "userId": v.get("user_id"),
                    "name": v.get("user_name") or "User",
                    "avatar": v.get("user_avatar"),
                })
                if v.get("mine"):
                    my_vote = idx
            else:
                tallies[idx] = int(v.get("cnt") or 0)
                if v.get("mine"):
                    my_vote = idx
        # Prefer explicit voter lists for totals when present
        if any(voters_by_option):
            tallies = [len(vs) for vs in voters_by_option]
        post["pollResults"] = {
            "tallies": tallies,
            "total": sum(tallies),
            "myVote": my_vote,
            "voters": voters_by_option,
        }

    # Event RSVP tallies
    if post["postType"] == "event":
        rsvp_counts = {"going": 0, "maybe": 0, "no": 0}
        my_rsvp = None
        for r in (row.get("event_rsvps") or []):
            st = r.get("status")
            if st in rsvp_counts:
                rsvp_counts[st] = int(r.get("cnt") or 0)
                if r.get("mine"):
                    my_rsvp = st
        post["eventRsvps"] = {"counts": rsvp_counts, "myRsvp": my_rsvp}

    return post


# ---------------------------------------------------------------------------
# Feed listing
# ---------------------------------------------------------------------------

@router.get("")
def list_feed(
    property_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    filter: str = "all",
    q: Optional[str] = None,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    scope_pid = property_id or _default_property_id(user)
    uid = user["id"]

    limit = max(1, min(int(limit), 100))
    offset = max(0, int(offset))
    flt = (filter or "all").lower()
    search = (q or "").strip()

    where: list[str] = []
    params: list = []
    if scope_pid:
        where.append("(p.property_id = %s OR p.property_id IS NULL)")
        params.append(scope_pid)
    if flt == "mine":
        where.append("p.author_user_id = %s")
        params.append(uid)
    elif flt == "attachments":
        where.append("(jsonb_array_length(p.attachments) > 0 OR p.image_url IS NOT NULL)")
    elif flt == "mentioned":
        where.append("p.mentions @> %s::jsonb")
        params.append(json.dumps([uid]))
    if search:
        where.append("(p.body ILIKE %s OR u.name ILIKE %s)")
        params.extend([f"%{search}%", f"%{search}%"])

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT p.*, u.name AS author_name, u.role AS author_role,
                           u.username, u.avatar AS author_avatar
                    FROM feed_posts p LEFT JOIN users u ON u.id = p.author_user_id
                    {where_sql}
                    ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT %s OFFSET %s;""",
                (*params, limit, offset),
            )
            posts = cur.fetchall()

            result = []
            for p in posts:
                pid = p["id"]
                cur.execute(
                    """SELECT c.id, c.body, c.body_html, c.mentions, c.author_user_id,
                              cu.name AS author_name, cu.avatar AS author_avatar, c.created_at
                       FROM feed_comments c LEFT JOIN users cu ON cu.id = c.author_user_id
                       WHERE c.post_id = %s ORDER BY c.created_at ASC;""",
                    (pid,),
                )
                comments = [
                    {
                        "id": c["id"],
                        "body": c["body"],
                        "bodyHtml": c.get("body_html"),
                        "mentions": c.get("mentions") or [],
                        "authorUserId": c["author_user_id"],
                        "authorName": c.get("author_name") or "Unknown",
                        "authorAvatar": c.get("author_avatar"),
                        "createdAt": c["created_at"],
                    }
                    for c in cur.fetchall()
                ]
                cur.execute(
                    """SELECT emoji, COUNT(*) AS cnt, BOOL_OR(user_id = %s) AS reacted_by_me
                       FROM feed_reactions WHERE post_id = %s GROUP BY emoji;""",
                    (uid, pid),
                )
                p["comments"] = comments
                p["reactions"] = cur.fetchall()

                if (p.get("post_type") or "message") == "poll":
                    cur.execute(
                        """SELECT v.option_index, v.user_id,
                                  u.name AS user_name, u.avatar AS user_avatar,
                                  (v.user_id = %s) AS mine
                           FROM feed_poll_votes v
                           LEFT JOIN users u ON u.id = v.user_id
                           WHERE v.post_id = %s
                           ORDER BY v.option_index ASC, v.created_at ASC;""",
                        (uid, pid),
                    )
                    p["poll_votes"] = cur.fetchall()
                elif (p.get("post_type") or "message") == "event":
                    cur.execute(
                        """SELECT status, COUNT(*) AS cnt, BOOL_OR(user_id = %s) AS mine
                           FROM feed_event_rsvps WHERE post_id = %s GROUP BY status;""",
                        (uid, pid),
                    )
                    p["event_rsvps"] = cur.fetchall()

                result.append(_row_to_post(p, uid))

    # Trending is an engagement sort over the returned page (reactions + comments).
    # Pinned posts still stay first.
    if flt == "trending":
        def _score(post: dict) -> int:
            return sum(post.get("reactionCounts", {}).values()) + len(post.get("comments", []))
        result.sort(key=lambda p: (1 if p.get("pinned") else 0, _score(p)), reverse=True)

    return result


# ---------------------------------------------------------------------------
# Post CRUD
# ---------------------------------------------------------------------------

@router.post("")
def create_post(
    payload: PostCreate,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    post_type = (payload.postType or "message").lower()
    if post_type not in POST_TYPES:
        raise HTTPException(status_code=400, detail="Unknown post type.")

    body = (payload.body or "").strip()
    body_html = sanitize_html(payload.bodyHtml)
    plain = html_to_text(body_html) or body
    if body_html and not body:
        body = plain[:5000]

    attachments = _clean_attachments(payload.attachments)
    meta = _clean_meta(post_type, payload.meta)

    # Seed a plain-text body from type-specific fields when the composer body is empty
    # (polls/tasks/events often only fill the structured fields).
    if not body:
        if post_type == "poll":
            body = str((meta.get("poll") or {}).get("question") or "Poll")[:5000]
        elif post_type == "task":
            body = str((meta.get("task") or {}).get("title") or "Task")[:5000]
        elif post_type == "event":
            body = str((meta.get("event") or {}).get("title") or "Event")[:5000]

    has_content = bool(body) or bool(payload.imageUrl) or bool(attachments) or post_type != "message"
    if not has_content:
        raise HTTPException(status_code=400, detail="Post must have text, media, or content.")
    if len(body) > 5000:
        raise HTTPException(status_code=400, detail="Post body too long (max 5000 chars).")

    hashtags = extract_hashtags(f"{plain} {' '.join('#' + h for h in (payload.hashtags or []) if isinstance(h, str))}")

    post_id = f"FP-{uuid.uuid4().hex[:12]}"
    requested_pid = (payload.propertyId or "").strip() or None
    if requested_pid and not is_admin(user) and requested_pid not in _user_property_ids(user):
        raise HTTPException(status_code=403, detail="Cannot post to a property you are not assigned to.")
    pid = requested_pid or _default_property_id(user)

    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            mentions = _filter_valid_mentions(cur, payload.mentions)
            cur.execute(
                """INSERT INTO feed_posts
                       (id, author_user_id, property_id, post_type, body, body_html,
                        image_url, attachments, mentions, hashtags, meta)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb)
                   RETURNING *;""",
                (
                    post_id, user["id"], pid, post_type, body, body_html or None,
                    payload.imageUrl, json.dumps(attachments), json.dumps(mentions),
                    json.dumps(hashtags), json.dumps(meta),
                ),
            )
            row = cur.fetchone()
            conn.commit()
    row["author_name"] = user.get("name") or user.get("username")
    row["author_role"] = user.get("role")
    row["author_avatar"] = user.get("avatar")
    row["username"] = user.get("username")
    row["comments"] = []
    row["reactions"] = []
    _broadcast_feed(pid, post_id, "created")
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
            cur.execute("SELECT author_user_id, property_id FROM feed_posts WHERE id=%s;", (post_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Post not found.")
            if row["author_user_id"] != user["id"] and not is_admin(user):
                raise HTTPException(status_code=403, detail="You can only delete your own posts.")
            cur.execute("DELETE FROM feed_posts WHERE id=%s;", (post_id,))
            conn.commit()
    _broadcast_feed(row.get("property_id"), post_id, "deleted")
    return {"ok": True}


@router.post("/{post_id}/pin")
def toggle_pin(
    post_id: str,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    """Pin / unpin a post (author or admin). Pinned posts stay at the top of the feed."""
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT author_user_id, property_id, is_pinned FROM feed_posts WHERE id=%s;",
                (post_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Post not found.")
            if row["author_user_id"] != user["id"] and not is_admin(user):
                raise HTTPException(status_code=403, detail="You can only pin your own posts.")
            new_val = not bool(row.get("is_pinned"))
            cur.execute(
                "UPDATE feed_posts SET is_pinned = %s, updated_at = NOW() WHERE id=%s;",
                (new_val, post_id),
            )
            conn.commit()
    _broadcast_feed(row.get("property_id"), post_id, "pin")
    return {"ok": True, "pinned": new_val}


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

@router.post("/{post_id}/comments")
def add_comment(
    post_id: str,
    payload: CommentCreate,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    body = (payload.body or "").strip()
    body_html = sanitize_html(payload.bodyHtml)
    if body_html and not body:
        body = html_to_text(body_html)[:2000]
    if not body and not body_html:
        raise HTTPException(status_code=400, detail="Comment cannot be empty.")
    if len(body) > 2000:
        raise HTTPException(status_code=400, detail="Comment too long (max 2000 chars).")
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT property_id FROM feed_posts WHERE id=%s;", (post_id,))
            post_row = cur.fetchone()
            if not post_row:
                raise HTTPException(status_code=404, detail="Post not found.")
            mentions = _filter_valid_mentions(cur, payload.mentions)
            comment_id = f"FC-{uuid.uuid4().hex[:12]}"
            cur.execute(
                """INSERT INTO feed_comments (id, post_id, author_user_id, body, body_html, mentions)
                   VALUES (%s, %s, %s, %s, %s, %s::jsonb) RETURNING created_at;""",
                (comment_id, post_id, user["id"], body, body_html or None, json.dumps(mentions)),
            )
            created = cur.fetchone()
            conn.commit()
    _broadcast_feed(post_row.get("property_id"), post_id, "comment")
    return {
        "id": comment_id,
        "postId": post_id,
        "authorUserId": user["id"],
        "authorName": user.get("name") or user.get("username"),
        "authorAvatar": user.get("avatar"),
        "body": body,
        "bodyHtml": body_html or None,
        "mentions": mentions,
        "createdAt": created["created_at"] if created else None,
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
            cur.execute(
                """SELECT c.author_user_id, c.post_id, p.property_id
                   FROM feed_comments c JOIN feed_posts p ON p.id = c.post_id
                   WHERE c.id=%s;""",
                (comment_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Comment not found.")
            if row["author_user_id"] != user["id"] and not is_admin(user):
                raise HTTPException(status_code=403, detail="You can only delete your own comments.")
            cur.execute("DELETE FROM feed_comments WHERE id=%s;", (comment_id,))
            conn.commit()
    _broadcast_feed(row.get("property_id"), row.get("post_id"), "comment")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Reactions
# ---------------------------------------------------------------------------

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
            cur.execute("SELECT property_id FROM feed_posts WHERE id=%s;", (post_id,))
            post_row = cur.fetchone()
            if not post_row:
                raise HTTPException(status_code=404, detail="Post not found.")
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
    _broadcast_feed(post_row.get("property_id"), post_id, "reaction")
    return {"ok": True, "reacted": reacted, "emoji": emoji}


# ---------------------------------------------------------------------------
# Poll voting
# ---------------------------------------------------------------------------

@router.post("/{post_id}/poll/vote")
def vote_poll(
    post_id: str,
    payload: PollVote,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT property_id, post_type, meta FROM feed_posts WHERE id=%s;", (post_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Post not found.")
            if (row.get("post_type") or "") != "poll":
                raise HTTPException(status_code=400, detail="This post is not a poll.")
            meta = row.get("meta") or {}
            if isinstance(meta, str):
                meta = json.loads(meta)
            options = (meta.get("poll") or {}).get("options") or []
            if not (0 <= payload.optionIndex < len(options)):
                raise HTTPException(status_code=400, detail="Invalid poll option.")
            # Re-voting the same option clears the vote (toggle); otherwise switch.
            cur.execute(
                "SELECT option_index FROM feed_poll_votes WHERE post_id=%s AND user_id=%s;",
                (post_id, user["id"]),
            )
            existing = cur.fetchone()
            if existing and existing["option_index"] == payload.optionIndex:
                cur.execute(
                    "DELETE FROM feed_poll_votes WHERE post_id=%s AND user_id=%s;",
                    (post_id, user["id"]),
                )
            else:
                cur.execute(
                    """INSERT INTO feed_poll_votes (post_id, user_id, option_index)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (post_id, user_id)
                       DO UPDATE SET option_index = EXCLUDED.option_index, created_at = NOW();""",
                    (post_id, user["id"], payload.optionIndex),
                )
            conn.commit()
    _broadcast_feed(row.get("property_id"), post_id, "poll")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Event RSVP
# ---------------------------------------------------------------------------

@router.post("/{post_id}/event/rsvp")
def rsvp_event(
    post_id: str,
    payload: EventRsvp,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    status = (payload.status or "").lower().strip()
    if status not in RSVP_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid RSVP status.")
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT property_id, post_type FROM feed_posts WHERE id=%s;", (post_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Post not found.")
            if (row.get("post_type") or "") != "event":
                raise HTTPException(status_code=400, detail="This post is not an event.")
            cur.execute(
                "SELECT status FROM feed_event_rsvps WHERE post_id=%s AND user_id=%s;",
                (post_id, user["id"]),
            )
            existing = cur.fetchone()
            if existing and existing["status"] == status:
                cur.execute(
                    "DELETE FROM feed_event_rsvps WHERE post_id=%s AND user_id=%s;",
                    (post_id, user["id"]),
                )
            else:
                cur.execute(
                    """INSERT INTO feed_event_rsvps (post_id, user_id, status)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (post_id, user_id)
                       DO UPDATE SET status = EXCLUDED.status, created_at = NOW();""",
                    (post_id, user["id"], status),
                )
            conn.commit()
    _broadcast_feed(row.get("property_id"), post_id, "event")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Task done toggle
# ---------------------------------------------------------------------------

@router.post("/{post_id}/task/toggle")
def toggle_task(
    post_id: str,
    payload: TaskToggle,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT author_user_id, property_id, post_type, meta FROM feed_posts WHERE id=%s;",
                (post_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Post not found.")
            if (row.get("post_type") or "") != "task":
                raise HTTPException(status_code=400, detail="This post is not a task.")
            meta = row.get("meta") or {}
            if isinstance(meta, str):
                meta = json.loads(meta)
            task = meta.get("task") or {}
            assignee = task.get("assigneeUserId")
            # Author, assignee, or admin can flip the done state.
            if user["id"] not in (row["author_user_id"], assignee) and not is_admin(user):
                raise HTTPException(status_code=403, detail="Only the author or assignee can update this task.")
            new_done = (not bool(task.get("done"))) if payload.done is None else bool(payload.done)
            task["done"] = new_done
            meta["task"] = task
            cur.execute(
                "UPDATE feed_posts SET meta = %s::jsonb, updated_at = NOW() WHERE id=%s;",
                (json.dumps(meta), post_id),
            )
            conn.commit()
    _broadcast_feed(row.get("property_id"), post_id, "task")
    return {"ok": True, "done": new_done}
