# Plan 029: Messenger mute, pin, and search

> **Executor instructions**: Follow step by step. Ponytail — per-user prefs + client/server search; do not invent Slack channels. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat HEAD -- messenger/ backend/routers/chat.py backend/utils.py`

## Status

- **Priority**: P2
- **Effort**: M–L
- **Risk**: MED
- **Depends on**: Batch E (`026`+) preferred so Group info can host mute; works on DMs too
- **Category**: direction
- **Planned at**: 2026-07-15
- **Completed**: 2026-07-15

## Why this matters

WhatsApp / Signal / Teams all support: **mute** (no badges/noise), **pin** (keep important chats at top), and **search** (find messages or people). Our list is chronological only with no mute/pin and no in-thread or global message search.

## Current state

- Conversation list: sort by latest activity; unread badge only.
- `chat_participants` has `last_read_at` — no `muted_until` / `pinned_at`.
- No message search endpoint; UI has no search field in the thread or inbox.

## Target (industry-aligned, team-chat scoped)

| Feature | Behavior |
|---------|----------|
| Mute | Per user; hide unread badge + optional suppress desktop toast; duration: forever or 8h/1d/1w (pick forever + “unmute” for v1 if durations are heavy) |
| Pin | Per user; pinned chats sort above unpinned; max ~5–10 pins |
| Search | (1) Filter inbox by name; (2) Search messages in open thread; (3) Optional later: global “messages across chats” |

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Backend tests | `npm run test:backend` | exit 0 (if API tests added) |
| Manual | Mute → no badge; pin → top of list; search finds message in thread | works |
| Graphify | `graphify update .` | exit 0 |

## Scope

**In scope**: schema on `chat_participants` (`muted_until` nullable timestamptz, `pinned_at` nullable), PATCH prefs API, list sort + mute/pin UI, thread message search (+ inbox name filter)  
**Out of scope**: read receipts (`030`); invite links (`031`); media gallery (`032`); VoIP

## Steps

### Step 1: Schema + prefs API

Add `muted_until`, `pinned_at` on `chat_participants`.  
`PATCH /api/chat/conversations/{id}/prefs` body `{ mutedUntil?: string|null, pinned?: boolean }`.

**Verify**: Prefs persist per user; other participant unaffected.

### Step 2: List ordering + mute UX

`list_conversations`: return `muted` / `pinned`; sort pinned first then `last_message_at`. Mute clears or hides unread badge for muted chats. Context menu or Group/DM info: Mute / Unmute / Pin / Unpin.

**Verify**: Pin moves chat up; mute stops badge increment while still receiving messages.

### Step 3: Search

- Inbox: filter by conversation title / peer name (client-side OK if list is small).
- Thread: `GET .../messages?q=` ILIKE on sanitized text (limit + pagination); jump-to-message highlight in UI.

**Verify**: Query returns matching messages; empty state when none.

## Done criteria

- [ ] Mute and pin persist per user and affect list/badges
- [ ] Inbox name filter + in-thread message search
- [ ] Tests green; README → DONE

## STOP conditions

- Building Slack-style channels or announcement-only mode → STOP.
- Full-text Postgres `tsvector` without need → prefer ILIKE first; escalate only if perf fails.
