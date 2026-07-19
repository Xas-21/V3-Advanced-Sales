"""Property-scoped messenger: DMs, group chats, real-time delivery via WebSocket."""
from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Cookie, HTTPException
from pydantic import BaseModel

from utils import _get_pool
from auth_db import is_admin
from dependencies import require_user
from security import SESSION_COOKIE_NAME
from websocket_manager import manager as ws_manager
from services.rich_text import sanitize_html, html_to_text, normalize_mentions

router = APIRouter(prefix="/api/chat", tags=["Chat"])


def _user_property_ids(user: dict) -> list[str]:
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


def _shared_property(a: dict, b: dict) -> Optional[str]:
    """Return a property id both users share, or None."""
    a_ids = set(_user_property_ids(a))
    b_ids = set(_user_property_ids(b))
    if a.get("propertyId"):
        a_ids.add(str(a["propertyId"]))
    if b.get("propertyId"):
        b_ids.add(str(b["propertyId"]))
    overlap = a_ids & b_ids
    return next(iter(overlap), None)


def _can_message(user: dict, target: dict) -> bool:
    if is_admin(user):
        return True
    return _shared_property(user, target) is not None


def _can_access_property(user: dict, property_id: Optional[str]) -> bool:
    if not property_id:
        return True
    if is_admin(user):
        return True
    return str(property_id) in set(_user_property_ids(user)) | (
        {str(user["propertyId"])} if user.get("propertyId") else set()
    )


def _get_user(cur, user_id: str) -> Optional[dict]:
    cur.execute(
        "SELECT id, name, username, role, avatar, property_id, assigned_property_ids FROM users WHERE id=%s;",
        (user_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    pids = row.get("assigned_property_ids")
    if isinstance(pids, str):
        try:
            pids = json.loads(pids)
        except Exception:
            pids = []
    return {
        "id": row["id"],
        "name": row.get("name"),
        "username": row.get("username"),
        "role": row.get("role"),
        "avatar": row.get("avatar"),
        "propertyId": row.get("property_id"),
        "property_ids": pids if isinstance(pids, list) else [],
    }


def _participant_ids(cur, conversation_id: str) -> list[str]:
    cur.execute(
        "SELECT user_id FROM chat_participants WHERE conversation_id=%s;",
        (conversation_id,),
    )
    return [str(r["user_id"]) for r in cur.fetchall()]


def _assert_participant(cur, conversation_id: str, user_id: str) -> dict:
    cur.execute(
        """SELECT c.* FROM chat_conversations c
           JOIN chat_participants p ON p.conversation_id = c.id
           WHERE c.id=%s AND p.user_id=%s;""",
        (conversation_id, user_id),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=403, detail="Not a participant of this conversation.")
    return row


def _participant_role(cur, conversation_id: str, user_id: str) -> Optional[str]:
    cur.execute(
        "SELECT role FROM chat_participants WHERE conversation_id=%s AND user_id=%s;",
        (conversation_id, user_id),
    )
    row = cur.fetchone()
    return (row or {}).get("role") if row else None


def _is_group_admin(cur, conv: dict, user: dict) -> bool:
    if is_admin(user):
        return True
    if conv.get("type") != "group":
        return False
    role = _participant_role(cur, conv["id"], user["id"])
    if role == "admin":
        return True
    # Legacy: creator without role backfill yet
    return str(conv.get("created_by") or "") == str(user["id"])


def _admin_count(cur, conversation_id: str) -> int:
    cur.execute(
        "SELECT COUNT(*) AS n FROM chat_participants WHERE conversation_id=%s AND role='admin';",
        (conversation_id,),
    )
    return int((cur.fetchone() or {}).get("n") or 0)


def _iso(val: Any) -> Optional[str]:
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _is_muted(muted_until: Any) -> bool:
    if muted_until is None:
        return False
    if isinstance(muted_until, datetime):
        mu = muted_until if muted_until.tzinfo else muted_until.replace(tzinfo=timezone.utc)
        return mu > datetime.now(timezone.utc)
    # sentinel far-future / "forever" treated as muted when column set without expiry semantics:
    # we use muted_until IS NOT NULL for forever when set to year 9999, or simply any future/past:
    # Convention: muted_until in the past = unmuted leftover; NULL = unmuted;
    # far future or any non-null past-or-future: treat non-null as muted forever if > now OR
    # if we set muted_until to 'infinity' — use: non-null means muted until that time; if in past, not muted.
    try:
        if isinstance(muted_until, str):
            mu = datetime.fromisoformat(muted_until.replace("Z", "+00:00"))
            return mu > datetime.now(timezone.utc)
    except Exception:
        return bool(muted_until)
    return False


def _broadcast_chat(user_ids: list[str], event_type: str, data: dict) -> None:
    try:
        ws_manager.broadcast_to_users_threadsafe(user_ids, {
            "type": event_type,
            "entity": "chat",
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Chat broadcast failed: {e}")


class MessageCreate(BaseModel):
    body: str = ""
    bodyHtml: Optional[str] = None
    attachments: list = []
    mentions: list = []


class GroupCreate(BaseModel):
    name: str
    participantIds: list[str]
    propertyId: Optional[str] = None


class DmCreate(BaseModel):
    userId: str


class ParticipantsAdd(BaseModel):
    userIds: list[str]


class ConversationPatch(BaseModel):
    name: Optional[str] = None
    avatarUrl: Optional[str] = None
    description: Optional[str] = None


class PrefsPatch(BaseModel):
    muted: Optional[bool] = None
    pinned: Optional[bool] = None


class RolePatch(BaseModel):
    role: str  # admin | member


class InviteLinkCreate(BaseModel):
    expiresInHours: Optional[int] = None
    maxUses: Optional[int] = None


def _serialize_message(row: dict, sender: Optional[dict] = None) -> dict:
    created = row.get("created_at")
    if hasattr(created, "isoformat"):
        created = created.isoformat()
    attachments = row.get("attachments") or []
    mentions = row.get("mentions") or []
    if isinstance(attachments, str):
        try:
            attachments = json.loads(attachments)
        except Exception:
            attachments = []
    if isinstance(mentions, str):
        try:
            mentions = json.loads(mentions)
        except Exception:
            mentions = []
    return {
        "id": row["id"],
        "conversationId": row["conversation_id"],
        "senderUserId": row["sender_user_id"],
        "senderName": (sender or {}).get("name") or (sender or {}).get("username") or "Unknown",
        "senderAvatar": (sender or {}).get("avatar"),
        "body": row.get("body") or "",
        "bodyHtml": row.get("body_html"),
        "attachments": attachments,
        "mentions": mentions,
        "createdAt": created,
    }


def _load_participants(cur, conversation_id: str) -> list[dict]:
    cur.execute(
        """SELECT u.id, u.name, u.username, u.avatar, p.role, p.last_read_at
           FROM chat_participants p
           JOIN users u ON u.id = p.user_id
           WHERE p.conversation_id = %s
           ORDER BY CASE WHEN p.role = 'admin' THEN 0 ELSE 1 END, u.name;""",
        (conversation_id,),
    )
    return [
        {
            "id": r["id"],
            "name": r.get("name") or r.get("username"),
            "username": r.get("username"),
            "avatar": r.get("avatar"),
            "role": r.get("role") or "member",
            "lastReadAt": _iso(r.get("last_read_at")),
        }
        for r in cur.fetchall()
    ]


@router.get("/users")
def list_messageable_users(
    property_id: Optional[str] = None,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    scope = property_id or _default_property_id(user)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if is_admin(user) and not scope:
                cur.execute(
                    "SELECT id, name, username, role, avatar, property_id FROM users WHERE status='active' AND id != %s ORDER BY name;",
                    (user["id"],),
                )
            elif scope:
                cur.execute(
                    """SELECT id, name, username, role, avatar, property_id FROM users
                       WHERE status='active' AND id != %s
                       AND (property_id = %s OR assigned_property_ids @> %s::jsonb)
                       ORDER BY name;""",
                    (user["id"], scope, json.dumps([scope])),
                )
            else:
                return []
            return [
                {
                    "id": r["id"],
                    "name": r.get("name") or r.get("username"),
                    "username": r.get("username"),
                    "role": r.get("role"),
                    "avatar": r.get("avatar"),
                    "propertyId": r.get("property_id"),
                }
                for r in cur.fetchall()
            ]


@router.get("/conversations")
def list_conversations(
    property_id: Optional[str] = None,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    uid = user["id"]
    scope = property_id or _default_property_id(user)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if scope:
                cur.execute(
                    """SELECT c.*, p.last_read_at, p.role AS my_role, p.muted_until, p.pinned_at,
                              (SELECT COUNT(*) FROM chat_messages m
                               WHERE m.conversation_id = c.id
                               AND m.created_at > COALESCE(p.last_read_at, '1970-01-01')
                               AND m.sender_user_id != %s) AS unread_count,
                              (SELECT MAX(m2.created_at) FROM chat_messages m2
                               WHERE m2.conversation_id = c.id) AS last_message_at
                       FROM chat_conversations c
                       JOIN chat_participants p ON p.conversation_id = c.id AND p.user_id = %s
                       WHERE c.property_id = %s OR c.property_id IS NULL
                       ORDER BY p.pinned_at DESC NULLS LAST,
                                COALESCE(
                                  (SELECT MAX(m2.created_at) FROM chat_messages m2 WHERE m2.conversation_id = c.id),
                                  c.created_at
                                ) DESC;""",
                    (uid, uid, scope),
                )
            else:
                cur.execute(
                    """SELECT c.*, p.last_read_at, p.role AS my_role, p.muted_until, p.pinned_at,
                              (SELECT COUNT(*) FROM chat_messages m
                               WHERE m.conversation_id = c.id
                               AND m.created_at > COALESCE(p.last_read_at, '1970-01-01')
                               AND m.sender_user_id != %s) AS unread_count,
                              (SELECT MAX(m2.created_at) FROM chat_messages m2
                               WHERE m2.conversation_id = c.id) AS last_message_at
                       FROM chat_conversations c
                       JOIN chat_participants p ON p.conversation_id = c.id AND p.user_id = %s
                       ORDER BY p.pinned_at DESC NULLS LAST,
                                COALESCE(
                                  (SELECT MAX(m2.created_at) FROM chat_messages m2 WHERE m2.conversation_id = c.id),
                                  c.created_at
                                ) DESC;""",
                    (uid, uid),
                )
            convs = cur.fetchall()
            result = []
            for c in convs:
                cid = c["id"]
                muted = False
                mu = c.get("muted_until")
                if mu is not None:
                    if isinstance(mu, datetime):
                        muted = True if mu.year >= 9000 else (mu > datetime.now(timezone.utc))
                    else:
                        muted = _is_muted(mu)

                unread = int(c.get("unread_count") or 0)
                if muted:
                    unread = 0

                cur.execute(
                    """SELECT m.*, u.name AS sender_name, u.username, u.avatar AS sender_avatar
                       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_user_id
                       WHERE m.conversation_id = %s ORDER BY m.created_at DESC LIMIT 1;""",
                    (cid,),
                )
                last = cur.fetchone()
                participants = _load_participants(cur, cid)
                result.append({
                    "id": cid,
                    "type": c["type"],
                    "name": c.get("name"),
                    "avatarUrl": c.get("avatar_url"),
                    "description": c.get("description"),
                    "propertyId": c.get("property_id"),
                    "createdBy": c.get("created_by"),
                    "createdAt": _iso(c.get("created_at")),
                    "myRole": c.get("my_role") or "member",
                    "muted": muted,
                    "pinned": c.get("pinned_at") is not None,
                    "unreadCount": unread,
                    "participants": participants,
                    "lastMessage": _serialize_message(last, {
                        "name": last.get("sender_name"),
                        "username": last.get("username"),
                        "avatar": last.get("sender_avatar"),
                    }) if last else None,
                })
            return result


@router.post("/conversations/dm")
def create_or_get_dm(
    payload: DmCreate,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    target_id = (payload.userId or "").strip()
    if not target_id or target_id == user["id"]:
        raise HTTPException(status_code=400, detail="Invalid target user.")
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            target = _get_user(cur, target_id)
            if not target:
                raise HTTPException(status_code=404, detail="User not found.")
            if not _can_message(user, target):
                raise HTTPException(status_code=403, detail="Cannot message this user.")
            pid = _shared_property(user, target) or _default_property_id(user)
            cur.execute(
                """SELECT c.id FROM chat_conversations c
                   JOIN chat_participants p1 ON p1.conversation_id = c.id AND p1.user_id = %s
                   JOIN chat_participants p2 ON p2.conversation_id = c.id AND p2.user_id = %s
                   WHERE c.type = 'dm' LIMIT 1;""",
                (user["id"], target_id),
            )
            existing = cur.fetchone()
            if existing:
                return {"id": existing["id"], "existing": True}
            conv_id = f"CH-{uuid.uuid4().hex[:12]}"
            display_name = target.get("name") or target.get("username") or "Chat"
            cur.execute(
                "INSERT INTO chat_conversations (id, type, name, property_id, created_by) VALUES (%s, 'dm', %s, %s, %s);",
                (conv_id, display_name, pid, user["id"]),
            )
            for uid in (user["id"], target_id):
                cur.execute(
                    "INSERT INTO chat_participants (conversation_id, user_id, role) VALUES (%s, %s, 'member');",
                    (conv_id, uid),
                )
            conn.commit()
    return {"id": conv_id, "existing": False}


@router.post("/conversations/group")
def create_group(
    payload: GroupCreate,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name required.")
    participant_ids = list({str(x).strip() for x in (payload.participantIds or []) if str(x).strip()})
    participant_ids = [uid for uid in participant_ids if uid != user["id"]]
    if not participant_ids:
        raise HTTPException(status_code=400, detail="Add at least one other participant.")
    pid = (payload.propertyId or "").strip() or _default_property_id(user)
    if pid and not is_admin(user) and pid not in _user_property_ids(user):
        raise HTTPException(status_code=403, detail="Cannot create group in this property.")
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            for tid in participant_ids:
                target = _get_user(cur, tid)
                if not target:
                    raise HTTPException(status_code=404, detail=f"User {tid} not found.")
                if not _can_message(user, target):
                    raise HTTPException(status_code=403, detail=f"Cannot add user {tid} to group.")
            conv_id = f"CH-{uuid.uuid4().hex[:12]}"
            cur.execute(
                "INSERT INTO chat_conversations (id, type, name, property_id, created_by) VALUES (%s, 'group', %s, %s, %s);",
                (conv_id, name[:120], pid, user["id"]),
            )
            all_ids = [user["id"], *participant_ids]
            for uid in all_ids:
                role = "admin" if uid == user["id"] else "member"
                cur.execute(
                    "INSERT INTO chat_participants (conversation_id, user_id, role) VALUES (%s, %s, %s);",
                    (conv_id, uid, role),
                )
            conn.commit()
    _broadcast_chat(all_ids, "updated", {"conversationId": conv_id, "created": True})
    return {"id": conv_id}


@router.patch("/conversations/{conversation_id}")
def patch_conversation(
    conversation_id: str,
    payload: ConversationPatch,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            conv = _assert_participant(cur, conversation_id, user["id"])
            if conv["type"] != "group":
                raise HTTPException(status_code=400, detail="Only group chats can be edited.")
            if not _is_group_admin(cur, conv, user):
                raise HTTPException(status_code=403, detail="Only group admins can edit group info.")
            sets = []
            args: list[Any] = []
            if payload.name is not None:
                name = payload.name.strip()
                if not name:
                    raise HTTPException(status_code=400, detail="Group name required.")
                sets.append("name = %s")
                args.append(name[:120])
            if payload.avatarUrl is not None:
                sets.append("avatar_url = %s")
                args.append((payload.avatarUrl or "").strip() or None)
            if payload.description is not None:
                sets.append("description = %s")
                args.append((payload.description or "").strip()[:2000] or None)
            if not sets:
                raise HTTPException(status_code=400, detail="Nothing to update.")
            args.append(conversation_id)
            cur.execute(f"UPDATE chat_conversations SET {', '.join(sets)} WHERE id = %s;", args)
            conn.commit()
            participant_ids = _participant_ids(cur, conversation_id)
    _broadcast_chat(participant_ids, "updated", {"conversationId": conversation_id, "profile": True})
    return {"ok": True}


@router.patch("/conversations/{conversation_id}/prefs")
def patch_prefs(
    conversation_id: str,
    payload: PrefsPatch,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            _assert_participant(cur, conversation_id, user["id"])
            if payload.muted is True:
                cur.execute(
                    """UPDATE chat_participants SET muted_until = '9999-12-31T00:00:00+00'
                       WHERE conversation_id=%s AND user_id=%s;""",
                    (conversation_id, user["id"]),
                )
            elif payload.muted is False:
                cur.execute(
                    "UPDATE chat_participants SET muted_until = NULL WHERE conversation_id=%s AND user_id=%s;",
                    (conversation_id, user["id"]),
                )
            if payload.pinned is True:
                cur.execute(
                    "UPDATE chat_participants SET pinned_at = NOW() WHERE conversation_id=%s AND user_id=%s;",
                    (conversation_id, user["id"]),
                )
            elif payload.pinned is False:
                cur.execute(
                    "UPDATE chat_participants SET pinned_at = NULL WHERE conversation_id=%s AND user_id=%s;",
                    (conversation_id, user["id"]),
                )
            conn.commit()
    return {"ok": True}


@router.get("/conversations/{conversation_id}/messages")
def list_messages(
    conversation_id: str,
    limit: int = 50,
    before: Optional[str] = None,
    q: Optional[str] = None,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    limit = max(1, min(int(limit), 100))
    query = (q or "").strip()
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            _assert_participant(cur, conversation_id, user["id"])
            if query:
                like = f"%{query}%"
                cur.execute(
                    """SELECT m.*, u.name AS sender_name, u.username, u.avatar AS sender_avatar
                       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_user_id
                       WHERE m.conversation_id = %s AND (m.body ILIKE %s OR COALESCE(m.body_html, '') ILIKE %s)
                       ORDER BY m.created_at DESC LIMIT %s;""",
                    (conversation_id, like, like, limit),
                )
            elif before:
                cur.execute(
                    """SELECT m.*, u.name AS sender_name, u.username, u.avatar AS sender_avatar
                       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_user_id
                       WHERE m.conversation_id = %s AND m.created_at < %s
                       ORDER BY m.created_at DESC LIMIT %s;""",
                    (conversation_id, before, limit),
                )
            else:
                cur.execute(
                    """SELECT m.*, u.name AS sender_name, u.username, u.avatar AS sender_avatar
                       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_user_id
                       WHERE m.conversation_id = %s
                       ORDER BY m.created_at DESC LIMIT %s;""",
                    (conversation_id, limit),
                )
            rows = list(reversed(cur.fetchall())) if not query else list(reversed(cur.fetchall()))
            messages = [
                _serialize_message(r, {
                    "name": r.get("sender_name"),
                    "username": r.get("username"),
                    "avatar": r.get("sender_avatar"),
                })
                for r in rows
            ]
            # Read cursors for receipts
            cur.execute(
                """SELECT user_id, last_read_at FROM chat_participants WHERE conversation_id=%s;""",
                (conversation_id,),
            )
            read_cursors = {
                str(r["user_id"]): _iso(r.get("last_read_at"))
                for r in cur.fetchall()
            }
            return {"messages": messages, "readCursors": read_cursors}


@router.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: str,
    payload: MessageCreate,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    body = (payload.body or "").strip()
    body_html = sanitize_html(payload.bodyHtml)
    if body_html and not body:
        body = html_to_text(body_html)[:4000]
    if not body and not body_html and not payload.attachments:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            conv = _assert_participant(cur, conversation_id, user["id"])
            mentions = normalize_mentions(payload.mentions)
            if mentions:
                cur.execute("SELECT id FROM users WHERE id = ANY(%s);", (mentions,))
                valid = {r["id"] for r in cur.fetchall()}
                mentions = [m for m in mentions if m in valid]
            attachments = payload.attachments if isinstance(payload.attachments, list) else []
            msg_id = f"CM-{uuid.uuid4().hex[:12]}"
            cur.execute(
                """INSERT INTO chat_messages
                       (id, conversation_id, sender_user_id, body, body_html, attachments, mentions)
                   VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb) RETURNING *;""",
                (
                    msg_id, conversation_id, user["id"], body, body_html or None,
                    json.dumps(attachments[:12]), json.dumps(mentions),
                ),
            )
            row = cur.fetchone()
            cur.execute(
                "UPDATE chat_participants SET last_read_at = NOW() WHERE conversation_id=%s AND user_id=%s;",
                (conversation_id, user["id"]),
            )
            conn.commit()
            participant_ids = _participant_ids(cur, conversation_id)
    msg = _serialize_message(row, user)
    _broadcast_chat(participant_ids, "created", {
        "conversationId": conversation_id,
        "message": msg,
        "propertyId": conv.get("property_id"),
    })
    return msg


@router.post("/conversations/{conversation_id}/read")
def mark_read(
    conversation_id: str,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pool = _get_pool()
    last_read_at = None
    with pool.connection() as conn:
        with conn.cursor() as cur:
            _assert_participant(cur, conversation_id, user["id"])
            cur.execute(
                """UPDATE chat_participants SET last_read_at = NOW()
                   WHERE conversation_id=%s AND user_id=%s
                   RETURNING last_read_at;""",
                (conversation_id, user["id"]),
            )
            row = cur.fetchone()
            last_read_at = _iso((row or {}).get("last_read_at"))
            conn.commit()
            participant_ids = _participant_ids(cur, conversation_id)
    others = [uid for uid in participant_ids if str(uid) != str(user["id"])]
    if others:
        _broadcast_chat(others, "read", {
            "conversationId": conversation_id,
            "userId": str(user["id"]),
            "lastReadAt": last_read_at,
        })
    return {"ok": True, "lastReadAt": last_read_at}


@router.post("/conversations/{conversation_id}/typing")
def signal_typing(
    conversation_id: str,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    """Ephemeral typing signal — no DB write; broadcast to other participants only."""
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            _assert_participant(cur, conversation_id, user["id"])
            participant_ids = _participant_ids(cur, conversation_id)
    others = [uid for uid in participant_ids if str(uid) != str(user["id"])]
    if others:
        _broadcast_chat(others, "typing", {
            "conversationId": conversation_id,
            "userId": str(user["id"]),
            "name": user.get("name") or user.get("username") or "Someone",
            "avatar": user.get("avatar"),
            "typing": True,
        })
    return {"ok": True}


@router.post("/conversations/{conversation_id}/participants")
def add_participants(
    conversation_id: str,
    payload: ParticipantsAdd,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            conv = _assert_participant(cur, conversation_id, user["id"])
            if conv["type"] != "group":
                raise HTTPException(status_code=400, detail="Can only add participants to group chats.")
            if not _is_group_admin(cur, conv, user):
                raise HTTPException(status_code=403, detail="Only group admins can add members.")
            added = []
            for tid in payload.userIds or []:
                tid = str(tid).strip()
                if not tid:
                    continue
                target = _get_user(cur, tid)
                if not target or not _can_message(user, target):
                    continue
                cur.execute(
                    """INSERT INTO chat_participants (conversation_id, user_id, role)
                       VALUES (%s, %s, 'member') ON CONFLICT DO NOTHING;""",
                    (conversation_id, tid),
                )
                added.append(tid)
            conn.commit()
            participant_ids = _participant_ids(cur, conversation_id)
    if added:
        _broadcast_chat(participant_ids, "updated", {"conversationId": conversation_id, "added": added})
    return {"ok": True, "added": added}


@router.delete("/conversations/{conversation_id}/participants/{target_user_id}")
def remove_participant(
    conversation_id: str,
    target_user_id: str,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            conv = _assert_participant(cur, conversation_id, user["id"])
            if conv["type"] == "dm":
                raise HTTPException(status_code=400, detail="Cannot leave a DM this way.")
            leaving_self = str(target_user_id) == str(user["id"])
            if not leaving_self and not _is_group_admin(cur, conv, user):
                raise HTTPException(status_code=403, detail="Cannot remove this participant.")
            target_role = _participant_role(cur, conversation_id, target_user_id)
            if target_role == "admin" and _admin_count(cur, conversation_id) <= 1:
                if leaving_self:
                    raise HTTPException(
                        status_code=400,
                        detail="Promote another admin before leaving as the last admin.",
                    )
                raise HTTPException(status_code=400, detail="Cannot remove the last admin.")
            cur.execute(
                "DELETE FROM chat_participants WHERE conversation_id=%s AND user_id=%s;",
                (conversation_id, target_user_id),
            )
            conn.commit()
            participant_ids = _participant_ids(cur, conversation_id)
    _broadcast_chat(participant_ids + [target_user_id], "updated", {
        "conversationId": conversation_id, "removed": target_user_id,
    })
    return {"ok": True}


@router.post("/conversations/{conversation_id}/participants/{target_user_id}/role")
def set_participant_role(
    conversation_id: str,
    target_user_id: str,
    payload: RolePatch,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    role = (payload.role or "").strip().lower()
    if role not in ("admin", "member"):
        raise HTTPException(status_code=400, detail="role must be admin or member.")
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            conv = _assert_participant(cur, conversation_id, user["id"])
            if conv["type"] != "group":
                raise HTTPException(status_code=400, detail="Roles only apply to groups.")
            if not _is_group_admin(cur, conv, user):
                raise HTTPException(status_code=403, detail="Only admins can change roles.")
            if _participant_role(cur, conversation_id, target_user_id) is None:
                raise HTTPException(status_code=404, detail="User is not in this group.")
            if role == "member":
                cur_role = _participant_role(cur, conversation_id, target_user_id)
                if cur_role == "admin" and _admin_count(cur, conversation_id) <= 1:
                    raise HTTPException(status_code=400, detail="Cannot demote the last admin.")
            cur.execute(
                "UPDATE chat_participants SET role=%s WHERE conversation_id=%s AND user_id=%s;",
                (role, conversation_id, target_user_id),
            )
            conn.commit()
            participant_ids = _participant_ids(cur, conversation_id)
    _broadcast_chat(participant_ids, "updated", {
        "conversationId": conversation_id, "roleChange": {"userId": target_user_id, "role": role},
    })
    return {"ok": True, "role": role}


@router.get("/conversations/{conversation_id}/media")
def list_media(
    conversation_id: str,
    kind: str = "all",
    limit: int = 40,
    before: Optional[str] = None,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    limit = max(1, min(int(limit), 100))
    kind = (kind or "all").lower()
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            _assert_participant(cur, conversation_id, user["id"])
            if before:
                cur.execute(
                    """SELECT m.id, m.created_at, m.sender_user_id, m.attachments, u.name AS sender_name
                       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_user_id
                       WHERE m.conversation_id = %s
                         AND jsonb_array_length(COALESCE(m.attachments, '[]'::jsonb)) > 0
                         AND m.created_at < %s
                       ORDER BY m.created_at DESC LIMIT %s;""",
                    (conversation_id, before, limit * 3),
                )
            else:
                cur.execute(
                    """SELECT m.id, m.created_at, m.sender_user_id, m.attachments, u.name AS sender_name
                       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_user_id
                       WHERE m.conversation_id = %s
                         AND jsonb_array_length(COALESCE(m.attachments, '[]'::jsonb)) > 0
                       ORDER BY m.created_at DESC LIMIT %s;""",
                    (conversation_id, limit * 3),
                )
            items = []
            for r in cur.fetchall():
                atts = r.get("attachments") or []
                if isinstance(atts, str):
                    try:
                        atts = json.loads(atts)
                    except Exception:
                        atts = []
                for a in atts:
                    if not isinstance(a, dict):
                        continue
                    a_type = str(a.get("type") or "file")
                    if kind == "image" and a_type not in ("image", "video"):
                        continue
                    if kind == "file" and a_type in ("image", "video"):
                        continue
                    items.append({
                        "messageId": r["id"],
                        "createdAt": _iso(r.get("created_at")),
                        "senderId": r.get("sender_user_id"),
                        "senderName": r.get("sender_name"),
                        "attachment": a,
                    })
                    if len(items) >= limit:
                        break
                if len(items) >= limit:
                    break
            return items


@router.post("/conversations/{conversation_id}/invite-links")
def create_invite_link(
    conversation_id: str,
    payload: InviteLinkCreate,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            conv = _assert_participant(cur, conversation_id, user["id"])
            if conv["type"] != "group":
                raise HTTPException(status_code=400, detail="Invite links are for groups only.")
            if not _is_group_admin(cur, conv, user):
                raise HTTPException(status_code=403, detail="Only admins can create invite links.")
            link_id = f"IL-{uuid.uuid4().hex[:12]}"
            token = secrets.token_urlsafe(16)
            expires_at = None
            if payload.expiresInHours and payload.expiresInHours > 0:
                cur.execute("SELECT NOW() + (%s || ' hours')::interval AS e;", (int(payload.expiresInHours),))
                expires_at = (cur.fetchone() or {}).get("e")
            max_uses = payload.maxUses if payload.maxUses and payload.maxUses > 0 else None
            cur.execute(
                """INSERT INTO chat_invite_links
                       (id, conversation_id, token, created_by, expires_at, max_uses)
                   VALUES (%s, %s, %s, %s, %s, %s) RETURNING *;""",
                (link_id, conversation_id, token, user["id"], expires_at, max_uses),
            )
            row = cur.fetchone()
            conn.commit()
    return {
        "id": row["id"],
        "token": row["token"],
        "expiresAt": _iso(row.get("expires_at")),
        "maxUses": row.get("max_uses"),
        "useCount": row.get("use_count") or 0,
        "createdAt": _iso(row.get("created_at")),
    }


@router.get("/conversations/{conversation_id}/invite-links")
def list_invite_links(
    conversation_id: str,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            conv = _assert_participant(cur, conversation_id, user["id"])
            if not _is_group_admin(cur, conv, user):
                raise HTTPException(status_code=403, detail="Only admins can view invite links.")
            cur.execute(
                """SELECT * FROM chat_invite_links
                   WHERE conversation_id=%s AND revoked_at IS NULL
                   ORDER BY created_at DESC;""",
                (conversation_id,),
            )
            return [
                {
                    "id": r["id"],
                    "token": r["token"],
                    "expiresAt": _iso(r.get("expires_at")),
                    "maxUses": r.get("max_uses"),
                    "useCount": r.get("use_count") or 0,
                    "createdAt": _iso(r.get("created_at")),
                }
                for r in cur.fetchall()
            ]


@router.delete("/conversations/{conversation_id}/invite-links/{link_id}")
def revoke_invite_link(
    conversation_id: str,
    link_id: str,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            conv = _assert_participant(cur, conversation_id, user["id"])
            if not _is_group_admin(cur, conv, user):
                raise HTTPException(status_code=403, detail="Only admins can revoke invite links.")
            cur.execute(
                """UPDATE chat_invite_links SET revoked_at = NOW()
                   WHERE id=%s AND conversation_id=%s;""",
                (link_id, conversation_id),
            )
            conn.commit()
    return {"ok": True}


@router.post("/join/{token}")
def join_via_invite(
    token: str,
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = require_user(session_id)
    tok = (token or "").strip()
    if not tok:
        raise HTTPException(status_code=400, detail="Invalid token.")
    pool = _get_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT l.*, c.type, c.property_id, c.name
                   FROM chat_invite_links l
                   JOIN chat_conversations c ON c.id = l.conversation_id
                   WHERE l.token = %s;""",
                (tok,),
            )
            link = cur.fetchone()
            if not link or link.get("revoked_at"):
                raise HTTPException(status_code=404, detail="Invite link not found or revoked.")
            if link.get("type") != "group":
                raise HTTPException(status_code=400, detail="Invalid invite.")
            if link.get("expires_at") and link["expires_at"] < datetime.now(timezone.utc):
                raise HTTPException(status_code=410, detail="Invite link expired.")
            max_uses = link.get("max_uses")
            if max_uses is not None and int(link.get("use_count") or 0) >= int(max_uses):
                raise HTTPException(status_code=410, detail="Invite link has no remaining uses.")
            prop = link.get("property_id")
            if not _can_access_property(user, prop):
                raise HTTPException(status_code=403, detail="You cannot join this property's group.")
            cid = link["conversation_id"]
            cur.execute(
                "SELECT 1 FROM chat_participants WHERE conversation_id=%s AND user_id=%s;",
                (cid, user["id"]),
            )
            if cur.fetchone():
                return {"ok": True, "conversationId": cid, "alreadyMember": True}
            cur.execute(
                """INSERT INTO chat_participants (conversation_id, user_id, role)
                   VALUES (%s, %s, 'member') ON CONFLICT DO NOTHING;""",
                (cid, user["id"]),
            )
            cur.execute(
                "UPDATE chat_invite_links SET use_count = use_count + 1 WHERE id = %s;",
                (link["id"],),
            )
            conn.commit()
            participant_ids = _participant_ids(cur, cid)
    _broadcast_chat(participant_ids, "updated", {"conversationId": cid, "added": [user["id"]]})
    return {"ok": True, "conversationId": cid, "alreadyMember": False}
