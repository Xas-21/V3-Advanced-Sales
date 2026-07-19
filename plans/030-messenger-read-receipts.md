# Plan 030: Messenger read receipts (and delivery cues)

> **Executor instructions**: Follow step by step. Builds on existing `mark_read` + `last_read_at`. Ponytail — DM double-tick first; group “Seen by” optional. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat HEAD -- messenger/ backend/routers/chat.py`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (privacy + WS chatter)
- **Depends on**: none strictly; nicer after Batch C polish
- **Category**: direction
- **Planned at**: 2026-07-15
- **Completed**: 2026-07-15

## Why this matters

Users expect WhatsApp-style feedback: sent → delivered → **read**. We already store `last_read_at` on `chat_participants` and expose `mark_read()` — but the UI does not show per-message ticks or “Seen by”.

## Current state

- `POST .../conversations/{id}/read` updates `last_read_at` for the current user.
- Unread counts use that cursor.
- No per-message `delivered_at`; no UI ticks; no WS event when peer marks read.

## Target (Ponytail)

| Surface | Behavior |
|---------|----------|
| DM | Own messages: single check = sent (server ack); double check = peer `last_read_at` ≥ message `created_at` |
| Group | Optional “Seen by N” under latest own message, or only in Group info — **do not** show ticks on every bubble (noisy) |
| Privacy | Team app: always-on receipts OK (no WhatsApp “read receipts off” toggle in v1) |

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Manual | Open DM as B → A’s ticks turn double; group shows Seen by for admins/self | works |
| Graphify | `graphify update .` | exit 0 |

## Scope

**In scope**: expose peer/group read cursors on message list or conversation payload; WS `type: read` broadcast; DM tick UI; optional group “Seen by” sheet  
**Out of scope**: true per-device delivery receipts; last-seen presence beyond existing presence API; mute (`029`)

## Steps

### Step 1: API payload

When listing messages / conversation detail, include enough to compute ticks:
- DM: other participant’s `last_read_at`
- Group: map of `{ userId, lastReadAt }` (or only for recent viewers of last message)

**Verify**: Client can derive read state without N+1 calls.

### Step 2: WS broadcast on mark_read

`mark_read` already updates DB — also `_broadcast_chat` with `{ type: 'read', conversationId, userId, lastReadAt }` so open threads update ticks live.

**Verify**: Peer UI updates without refresh.

### Step 3: UI

- DM: subtle ticks on own bubbles (theme colors, not WhatsApp green clone).
- Group: “Seen by” on long-press or under last own message only.

## Done criteria

- [ ] DM read ticks work from `last_read_at`
- [ ] Live update via WS
- [ ] Group seen UX without per-bubble spam
- [ ] Tests + README → DONE

## STOP conditions

- Adding per-message delivery table without proven need → STOP (use conversation cursor).
- Building “hide my read receipts” privacy product → defer / ask.
