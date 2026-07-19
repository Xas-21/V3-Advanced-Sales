# Plan 031: Messenger group invite links

> **Executor instructions**: Follow step by step. Depends on group admins (`028`). Ponytail — property-scoped invite tokens, not public internet join. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat HEAD -- backend/routers/chat.py backend/utils.py messenger/`

## Status

- **Priority**: P2
- **Effort**: M–L
- **Risk**: MED–HIGH (authz)
- **Depends on**: `028-messenger-group-admins.md` (who can create/revoke links)
- **Category**: direction
- **Planned at**: 2026-07-15
- **Completed**: 2026-07-15

## Why this matters

WhatsApp / Teams allow sharing an **invite link** so members join without the admin hunting each user in a picker. Useful for hotel sales teams onboarding temps — but must stay **inside the product** (logged-in users with property access), not anonymous open joins.

## Current state

- Add members only via `POST .../participants` with explicit user IDs (admin/creator).
- No invite token table; no join-by-link flow.

## Target rules (security-first)

| Rule | Detail |
|------|--------|
| Who creates | Group admins only |
| Who joins | Authenticated users who can message / share the conversation’s `property_id` |
| Token | Opaque random string; optional expiry + max uses |
| Revoke | Admins can revoke / rotate anytime |
| UX | Copy link (in-app path e.g. `/app?joinChat=TOKEN` or Messenger deep link); paste opens Join confirm |

**Not in scope:** QR codes (nice-to-have after link works); public unauthenticated join.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Backend tests | `npm run test:backend` | authz cases pass |
| Frontend tests | `npm run test:frontend` | exit 0 |
| Manual | Admin creates link → eligible user joins; outsider / revoked → 403 | works |
| Graphify | `graphify update .` | exit 0 |

## Scope

**In scope**: `chat_invite_links` table, create/list/revoke/join APIs, Group info UI, deep-link join confirm in Messenger  
**Out of scope**: mute/pin (`029`); media gallery (`032`); VoIP; email invite blasts

## Steps

### Step 1: Schema

```sql
chat_invite_links (
  id, conversation_id, token UNIQUE, created_by,
  expires_at NULL, max_uses NULL, use_count DEFAULT 0,
  revoked_at NULL, created_at
)
```

### Step 2: APIs

- `POST .../conversations/{id}/invite-links` — admin only
- `GET .../invite-links` — admin only (active links)
- `DELETE .../invite-links/{id}` — revoke
- `POST /api/chat/join/{token}` — add caller as member if eligible

Enforce `_can_message` / property access; reject DMs; reject revoked/expired/maxed.

### Step 3: UI

Group info → “Invite link” → Copy / Revoke. On app open with token → confirm modal → join → open thread.

## Done criteria

- [ ] Create / copy / revoke / join work under admin + property rules
- [ ] Authz tests for outsider and revoked token
- [ ] README → DONE

## STOP conditions

- Anyone-with-link can join across properties → STOP (must gate property).
- Building email/SMS outbound invites in same PR → STOP.
