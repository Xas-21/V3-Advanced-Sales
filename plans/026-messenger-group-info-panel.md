# Plan 026: Messenger group info panel (member list + wire add/remove)

> **Executor instructions**: Follow step by step. Ponytail — UI first using APIs that already exist. No VoIP. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat HEAD -- messenger/ backend/routers/chat.py`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: none (Batch C polish helpful)
- **Category**: direction
- **Planned at**: 2026-07-15
- **Completed**: 2026-07-15

## Why this matters

Users only see “N members” with no way to open a roster. Backend already has `POST .../participants` and `DELETE .../participants/{id}` (`chat.py`) but the UI never calls them. WhatsApp/Signal/Teams all open **Group info** from the header to show members and manage membership.

## Current state

- UI: member count badge only (`MessengerWidget.tsx` thread header).
- API: add members (creator/app-admin only), remove member or leave (`chat.py` ~492–552).
- Schema: `chat_participants` has no `role` yet (admin roles = plan `028`).

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Manual | Open group → click name/count → see member list; add/remove per creator rules | works |
| Graphify | `graphify update .` | exit 0 |

## Scope

**In scope**: `messenger/MessengerWidget.tsx`, `messenger/MessengerContext.tsx` (wire add/remove), optionally thin GET if needed  
**Out of scope**: rename/avatar/description (`027`); multi-admin roles (`028`); calls; Hub plans

## Steps

### Step 1: Group info sheet

Clicking group title or “N members” opens a side panel/modal: avatar initials, name, searchable member list (photo/initials + name). Same theme tokens as Messenger.

**Verify**: Roster visible for DM (other user) and group (all participants).

### Step 2: Wire existing APIs

- **Add members**: reuse messageable users not already in group; call `POST /api/chat/conversations/{id}/participants`.
- **Remove / Leave**: call `DELETE .../participants/{userId}`; creator can remove others; anyone can leave themselves.
- Refresh conversations + close panel after leave if needed.
- Handle WS `updated` with `added`/`removed` to refresh roster live.

**Verify**: Creator adds/removes; non-creator can leave; non-creator cannot remove others (403).

### Step 3: Empty / permission copy

Show clear disabled states (“Only the group creator can add members”) matching current backend rules until `028`.

## Done criteria

- [ ] Clickable group info with full member list
- [ ] Add/remove/leave wired to existing endpoints
- [ ] Live update on WS participant changes
- [ ] `npm run test:frontend` exit 0
- [ ] `plans/README.md` → DONE

## STOP conditions

- Backend add/remove semantics change unexpectedly → STOP and report.
- Scope creeps into avatar/admin schema → hand off to `027`/`028`.
