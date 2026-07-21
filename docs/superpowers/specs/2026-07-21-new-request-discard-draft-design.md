# New Request — Discard Draft — Design Spec

**Date:** 2026-07-21  
**Status:** Approved for planning  
**Author:** Brainstormed with user via superpowers:brainstorming

## 1. Problem / Goal

On the Requests page, **New Request** already resumes an in-progress draft after
the user navigates away and comes back (via `sessionStorage` in
`requestDraftStorage.ts`). That resume behavior must stay.

Users also need an explicit **Discard** action that throws the draft away so
the next **New Request** opens the request-type picker again, instead of the
last form they were filling.

## 2. Decisions (locked with user)

| # | Decision | Choice |
|---|----------|--------|
| 1 | After Discard | Clear draft, close wizard, return to requests **list** |
| 2 | Confirmation | Browser native `window.confirm(...)` (system alert), not a custom modal |
| 3 | Back behavior | Unchanged — keep draft; New Request may resume last form |
| 4 | Button placement | Form footer, left of **Back**, shared via `renderFormLayout` |
| 5 | Where it appears | Only on the filled form (step ≥ 2), not on the type picker |
| 6 | Scope | Standalone Requests new-request wizard only; no change to edit/duplicate/embedded/headless flows |

## 3. Architecture

Chosen approach: **one Discard handler in `RequestsManager.tsx`**, wired through
existing `renderFormLayout`, calling the existing `clearNewRequestDraft()`.

Rejected:

- Changing leave/navigate so drafts never resume — breaks the keep-resume
  behavior the user wants.
- Custom confirm modal — user asked for the browser system alert.
- Header-only Discard — less discoverable next to Back/Save.

### 3.1 Existing pieces to reuse (do not reinvent)

| Piece | Role |
|-------|------|
| `clearNewRequestDraft()` | Removes `visatour_new_request_draft_v1` from `sessionStorage` |
| `writeNewRequestDraft()` / `readNewRequestDraft()` | Unchanged; Back + leave-page remount continue to resume |
| `renderFormLayout` | Single footer for all request-type create forms |
| `setSearchParams` / `subView: 'list'` | Existing navigation pattern to leave the wizard |

### 3.2 Discard handler (behavior)

1. `window.confirm('Discard this draft?')` (or equivalent short copy).
2. If user cancels → no-op; stay on form; draft unchanged.
3. If user confirms:
   - Call `clearNewRequestDraft()`.
   - Reset wizard UI state (`requestType` → `null`, `step` → `1`, forms to
     empty defaults / same reset used for a fresh new request).
   - Navigate to requests **list** (`subView: 'list'`), clearing any
     edit/duplicate params the same way other exits do.
4. Next **New Request** must show the type picker (step 1), not a restored form.

### 3.3 Back vs Discard

| Action | Draft in `sessionStorage` | Next New Request |
|--------|---------------------------|------------------|
| **Back** (then leave page) | Kept (current behavior) | Resumes last form |
| **Discard** (confirm) | Cleared | Type picker |
| **Save** success | Already cleared today | Type picker / list (unchanged) |

## 4. UI

Footer button order: **Discard** · **Back** · **Save Request**

- Discard: muted or danger-leaning text/border so it does not compete with Save.
- Match existing footer button sizing (`px-6 py-3`, uppercase tracking) for
  consistency.
- No new modal components.

## 5. Out of scope

- Changing when drafts are written or how remount/resume works.
- Discard on type-selection step.
- Embedded Events/Catering wizard or CRM-driven prefilled new request unless
  they already share the same `renderFormLayout` footer (if they do, Discard
  should still only clear when it is a true new-request draft path, not edit).
- Backend/API changes.
- Custom themed confirm dialog.

## 6. Testing

- After confirm Discard: `readNewRequestDraft(propertyId)` is `null`.
- After Discard then New Request: UI is step 1 (type selection), `requestType`
  is null.
- After Back (without Discard) then leave and New Request: still resumes draft
  (regression check).
- Cancel on `confirm`: form and draft unchanged.

Prefer the smallest runnable check that fails if clear/resume semantics break
(unit on storage + a thin handler test if practical; otherwise the manual
checklist above).

## 7. Implementation notes (for the plan)

- Touch primarily `RequestsManager.tsx`; reuse `requestDraftStorage.ts` as-is
  unless a tiny helper for “discard and reset” keeps the component thinner.
- Avoid rewriting the enter-`new_request` reset effect or the leave-clear
  effect; Discard should call clear + navigate explicitly.
- Keep the diff minimal; do not refactor the wizard.
