# Plan 015: Messenger typing indicator + message avatars

> **Executor instructions**: Ponytail — ephemeral typing via existing chat broadcast; no VoIP. Update `plans/README.md` when done.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: 013/014 Messenger polish
- **Category**: direction
- **Planned at**: 2026-07-15
- **DONE**: 2026-07-15 — `POST .../typing` + WS `typing` event; avatars on bubbles; typing row + GSAP dots

## Why

Users asked for “Typing…” with profile picture in DM and group chats, plus avatars on messages. No call feature in this plan.

## Approach (Ponytail)

1. `POST /api/chat/conversations/{id}/typing` — assert participant, broadcast to others (`type: typing`), no DB.
2. Client debounce (~1.4s) while composer has text; clear when a message arrives from that user.
3. UI: `ChatAvatar` on messages (both sides); typing row with up to 3 avatars + label; GSAP bounce on dots / fade-in row; respect `prefers-reduced-motion`.

## Scope

- `backend/routers/chat.py`
- `messenger/MessengerContext.tsx`
- `messenger/MessengerWidget.tsx`

## Done criteria

- [x] Typing visible to other participant(s) in DM and group
- [x] Avatars (or initials) on messages + typing row
- [x] Light GSAP; reduced-motion safe
- [x] No call / WebRTC
- [x] `plans/README.md` → DONE
