# Plan 032: Messenger media gallery (shared photos & files)

> **Executor instructions**: Follow step by step. Reuse existing message attachments + uploads; Ponytail — gallery view, not a new CDN. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat HEAD -- messenger/ backend/routers/chat.py localUpload.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: `026` helpful (entry from Group/DM info); attachments already sendable
- **Category**: direction
- **Planned at**: 2026-07-15
- **Completed**: 2026-07-15

## Why this matters

WhatsApp / Signal / Teams Group info includes **Media / Docs / Links** so users can browse shared files without scrolling the whole thread. We already attach files in messages (`uploads` + message attachment JSON) but there is no aggregated gallery.

## Current state

- Messages can include attachments; UI renders them inline in the thread.
- Feed has `AttachmentGallery` patterns we can mirror visually — do **not** couple Feed APIs.
- No `GET .../conversations/{id}/media` endpoint.

## Target

| Tab | Content |
|-----|---------|
| Media | Images / video thumbs (grid); click → lightbox + jump to message |
| Docs | Non-image files list (name, size, date, sender) |
| Links | Optional: URLs extracted from message text (v1 can skip if costly) |

Entry: Group info / DM info → “Shared media”.

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Manual | Open gallery → see past attachments; open item → preview / download | works |
| Graphify | `graphify update .` | exit 0 |

## Scope

**In scope**: API that pages attachment rows for a conversation; gallery UI in Messenger; lightbox reuse theme tokens  
**Out of scope**: re-encoding video; OCR; invite links (`031`); deleting media separately from messages (delete message = remove from gallery)

## Steps

### Step 1: API

`GET /api/chat/conversations/{id}/media?kind=image|file|all&limit=&before=`  
Scan messages where attachments non-empty; return `{ messageId, createdAt, senderId, attachment }[]`. Participant-only.

**Verify**: Empty conversation → `[]`; only participant can call.

### Step 2: Gallery UI

Grid for images; list for docs. Click opens preview (`mediaUrl`) and optional “Go to message” scroll.

### Step 3: Wire from info panel

Link from Group/DM info (after `026`). If `026` not done, entry from thread header overflow menu.

## Done criteria

- [ ] Paginated media API
- [ ] Gallery + preview from info panel
- [ ] Jump to message works for recent history
- [ ] Tests + README → DONE

## STOP conditions

- Building a separate media storage product / CDN → STOP; use existing uploads.
- Scope into Feed redesign → STOP.
