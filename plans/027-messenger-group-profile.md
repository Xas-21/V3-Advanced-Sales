# Plan 027: Messenger group profile (name, avatar, description)

> **Executor instructions**: Follow step by step. Requires schema + PATCH API. Depends on `026` for the info panel to edit from. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat HEAD -- backend/utils.py backend/routers/chat.py messenger/`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `026-messenger-group-info-panel.md`
- **Category**: direction
- **Planned at**: 2026-07-15
- **Completed**: 2026-07-15

## Why this matters

Industry baseline (WhatsApp / Signal / Teams): groups have **name**, **icon/photo**, and **description**, editable from Group info. Today we only store `name` on `chat_conversations` — no avatar, no description, no PATCH endpoint, no UI edit.

## Current state

```sql
-- backend/utils.py ~278
chat_conversations (id, type, name, property_id, created_by, created_at)
-- missing: avatar_url / description / updated_at
```

Create group sets `name` only at creation time.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Manual | Edit group name + description + photo; others see update | works |
| Graphify | `graphify update .` | exit 0 |

## Scope

**In scope**: migration/ALTER in `utils.py` (or migrations/), `chat.py` PATCH, serialize in list/get, Group info edit UI + upload via existing `uploadFileLocal`  
**Out of scope**: admin permission matrix (`028`); invite links; announcement-only mode

## Steps

### Step 1: Schema

Add nullable `description TEXT`, `avatar TEXT` (or `avatar_url`) on `chat_conversations`. Keep `name`. Idempotent `ALTER TABLE ... IF NOT EXISTS` / additive migration matching repo style.

**Verify**: Existing groups still load; new columns null OK.

### Step 2: PATCH API

`PATCH /api/chat/conversations/{id}` body `{ name?, description?, avatar? }`.
- Groups only.
- Until `028`: allow **creator** (and app admin) only — same as add-members today.
- Broadcast `updated` with conversation summary to participants.

**Verify**: Unauthorized member gets 403; creator updates propagate.

### Step 3: UI in Group info (`026` panel)

Edit name, description textarea, avatar upload/preview. Show avatar in thread header and conversation list.

**Verify**: Luxury/Light themes readable; list shows new avatar/name.

## Done criteria

- [ ] Columns + PATCH exist
- [ ] Group info can edit name / description / picture
- [ ] List + header reflect changes
- [ ] `npm run test:frontend` exit 0
- [ ] `plans/README.md` → DONE

## STOP conditions

- Migration breaks existing DBs → STOP; fix additive migration.
- Trying to invent invite links / QR in this plan → STOP; out of scope.
