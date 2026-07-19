# CRM Kanban Card Comments — Design Spec

**Date:** 2026-07-19  
**Status:** Approved (design), pending implementation plan  
**Author:** Brainstormed with user via superpowers:brainstorming

## 1. Problem / Goal

On the CRM page kanban (request view and account view), users need short sticky
notes on each card so any logged-in user can leave, see, and remove comments
without leaving the board.

Comments must appear **inline at the bottom of the existing request/account
card** — never as separate cards in the kanban columns.

## 2. Decisions (locked with user)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Delete permission | **Any logged-in user** can trash any comment |
| 2 | Persistence | **Backend / Postgres** (shared across users and devices) |
| 3 | Attribution | Show **author name + timestamp** on each comment |
| 4 | Cap | **Max 5 comments** per card target |
| 5 | Collapse | Default show **2 most recent**; **View all** / **Show less** for the rest |
| 6 | UI placement | Inline footer on the card (`+` → input + OK → trash; another `+` under last until 5) |
| 7 | Scope by view | Request-view cards load **request** comments only; account-view cards load **account** comments only — **not shared** across views |
| 8 | Architecture | Dedicated table + thin CRUD API (not JSON on entity, not feed comments) |

## 3. Architecture

Chosen approach: **dedicated `crm_card_comments` table + FastAPI CRUD**, with a
small React block rendered inside CRM kanban cards.

Rejected:

- Embedding `comments[]` on request/account payloads — concurrent write races,
  hard max-5 enforcement.
- Reusing social feed comments — wrong domain (posts/reactions/pins).

### 3.1 Data model — `crm_card_comments`

```sql
CREATE TABLE IF NOT EXISTS crm_card_comments (
    id              TEXT PRIMARY KEY,
    property_id     TEXT NOT NULL,
    target_type     TEXT NOT NULL,  -- 'request' | 'account'
    target_id       TEXT NOT NULL,
    body            TEXT NOT NULL,
    author_user_id  TEXT NOT NULL,
    author_name     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT crm_card_comments_target_type_chk
        CHECK (target_type IN ('request', 'account'))
);

CREATE INDEX IF NOT EXISTS idx_crm_card_comments_target
    ON crm_card_comments (property_id, target_type, target_id, created_at DESC);
```

**Max 5 enforcement:** checked in the create API (count existing rows for the
same `(property_id, target_type, target_id)` before insert; reject with 400 if
already 5). Optional DB trigger later if needed; app-level guard is enough for v1.

### 3.2 API

Auth required on all routes. Tenant-scoped by the caller's property context
(same pattern as other CRM/property APIs).

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/api/crm/card-comments?target_type=&target_id=` | List comments for that target, newest first |
| `POST` | `/api/crm/card-comments` | Body: `{ target_type, target_id, body }`; set author from session; reject empty/whitespace body; trim and cap body at **500** chars; reject if count ≥ 5 |
| `DELETE` | `/api/crm/card-comments/{id}` | Any authenticated user in the property may delete |

Response item shape:

```json
{
  "id": "...",
  "targetType": "request",
  "targetId": "...",
  "body": "...",
  "authorUserId": "...",
  "authorName": "...",
  "createdAt": "2026-07-19T12:00:00Z"
}
```

### 3.3 Frontend

- New component: `CrmCardComments` (or equivalent name next to CRM helpers).
- Wired into `CRM.tsx` kanban card render:
  - Request view → `targetType="request"`, `targetId=<request id>`
  - Account view → `targetType="account"`, `targetId=<account id>`
- Placement: below the existing “Created by” footer row, still inside the card.
- Local UI state only for: composing input open/closed, expanded vs collapsed
  (View all / Show less).
- Hide add `+` when `comments.length >= 5`.
- Match existing CRM card typography/spacing; Lucide `Plus` / `Trash2` icons.

### 3.4 Data flow

1. Card mounts → `GET` comments for its target.
2. User clicks `+` → input + OK → `POST` → append into local list (or refetch).
3. User clicks trash → `DELETE` → remove from local list (or refetch).
4. Collapse: if more than 2, show latest 2 until View all.

### 3.5 Errors

- Empty body on OK → do not call API.
- Cap reached → API 400; client also hides `+`.
- Network/API failure → short inline error under the comments block; keep last good list.

## 4. Testing

**Backend (pytest):**

- Create comments up to 5 for a request target; 6th returns 400.
- Account target is independent (separate 5-cap).
- List returns only matching `target_type` + `target_id`.
- Delete removes the row; any authenticated user can delete.

**Frontend:**

- Small assert/self-check or unit test for “show latest 2 when collapsed;
  show all when expanded” (ponytail: one focused check, no heavy fixtures).

## 5. Out of scope

- Editing comments after save
- Mentions, attachments, reactions
- Real-time websocket sync (refresh on action is enough)
- Comments on other CRM surfaces (funnel/pipeline cards outside request/account views)
- Permissions finer than “any authenticated user”

## 6. Implementation notes

- Follow existing migration / router / `data_access` patterns in `backend/`.
- Prefer fewest new files: one migration (or extend current migration style),
  one router (or add to an existing CRM router if one exists), one small React
  component, minimal `CRM.tsx` wiring.
- After code changes: `graphify update .`
