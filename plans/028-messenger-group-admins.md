# Plan 028: Messenger group admin roles (promote / demote / permissions)

> **Executor instructions**: Follow step by step. Builds on `026` + `027`. Ponytail — one `role` column + clear rules; no Slack-style channels. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat HEAD -- backend/utils.py backend/routers/chat.py messenger/`

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: MED
- **Depends on**: `026`, preferably `027`
- **Category**: direction
- **Planned at**: 2026-07-15
- **Completed**: 2026-07-15

## Why this matters

Users asked to assign admins who can invite/remove others. WhatsApp/Signal model: creator is admin; admins can promote others, add/remove members, and (optionally) restrict who edits group info. Today only `created_by` acts as a single implicit owner.

## Current state

- `chat_participants`: `(conversation_id, user_id, last_read_at, joined_at)` — **no role**.
- Add members: creator or app `is_admin` only.
- Remove: self-leave OR creator/app-admin removes others.

## Target rules (Ponytail)

| Action | Who |
|--------|-----|
| View members | Any participant |
| Edit name/avatar/description | Admins (after `027`) |
| Add / remove members | Admins |
| Promote / demote admin | Admins (cannot demote last admin) |
| Leave group | Any member (if last admin leaves → promote oldest remaining or block leave — pick one and document) |

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Manual | Promote member → they can add/remove; demote works; last admin protected | works |
| Graphify | `graphify update .` | exit 0 |

## Scope

**In scope**: `role` on `chat_participants` (`member` \| `admin`), backfill creator as admin, update add/remove/PATCH authz, Group info UI badges + promote/demote  
**Out of scope**: “only admins can send messages”; invite links (`031`); mute/pin/search (`029`)

## Steps

### Step 1: Schema + backfill

`ALTER` add `role TEXT NOT NULL DEFAULT 'member'`. Backfill: set `admin` where `user_id = chat_conversations.created_by`.

**Verify**: Old groups have exactly one admin (creator) when creator still a participant.

### Step 2: Authz helpers

Replace `created_by` checks with `_is_group_admin(cur, conv_id, user_id)`. Keep app `is_admin()` override if already used.

**Verify**: Member cannot add; admin can.

### Step 3: Promote / demote API

`POST .../participants/{id}/role` body `{ role: 'admin' | 'member' }`. Block demoting the last admin.

### Step 4: UI

In Group info member rows: Admin badge; admin actions menu (Make admin / Dismiss admin / Remove).

## Done criteria

- [ ] Roles persisted + backfilled
- [ ] Add/remove/edit gated by admin
- [ ] Promote/demote + last-admin guard
- [ ] UI shows badges and actions
- [ ] `npm run test:frontend` exit 0
- [ ] `plans/README.md` → DONE

## STOP conditions

- Last-admin edge case unclear in product → STOP and ask (leave vs auto-promote).
- Building announcement-only / invite-link in same PR → STOP.
