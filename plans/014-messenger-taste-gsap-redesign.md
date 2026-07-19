# Plan 014: Messenger taste redesign + GSAP (keep all features)

> **Executor instructions**: Follow step by step. **Do not remove or hide any existing control or flow.** Ponytail: redesign chrome/motion; do not rewrite chat backend. Run plan `013` first (contrast). Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- messenger/ dashboardHub/richText.tsx`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `013-messenger-dark-contrast.md` (must be DONE or contrast included in Step 0)
- **Category**: direction / dx (product UI)
- **Planned at**: commit `90c3a4c`, 2026-07-15
- **DONE**: 2026-07-15 — taste polish + GSAP open/message/FAB; timestamps + Escape close; skipped add-members / presence (Ponytail)

## Why this matters

Messenger works but looks flat and has a critical dark-theme readability bug (013). User asked for a tasteful redesign + GSAP motion while **keeping every current button/feature**, optionally adding improvements found by `/improve`-style review.

## Design read (taste)

Reading this as: **in-app floating Messenger for hotel sales teams**, Luxury/Light/Desert tokens already in the shell — not a marketing landing page. Lean **redesign-existing** (polish hierarchy, spacing, bubble chrome, motion) — do **not** invent a purple SaaS template or replace the theme system.

Skills to read before coding:

- `.agents/skills/design-taste-frontend/SKILL.md` (anti-slop; Section 11 redesign) **or** `.cursor/skills/design-taste-frontend/SKILL.md`
- Prefer **redesign-existing** guidance if that skill file exists under `.cursor/skills/` / `.agents/skills/`
- GSAP: already installed (`gsap`, `@gsap/react` in `package.json`) — reuse patterns from `landingPreviews/` or Hub if present; keep motion subtle (open/close, message enter, FAB)
- Ponytail: `.cursor/rules/PonyTail.mdc`

## Current feature inventory (MUST preserve)

All live in `messenger/MessengerWidget.tsx` + `MessengerContext.tsx` unless noted:

| Feature | Where |
|---------|--------|
| FAB open/close + unread badge | Widget FAB |
| Draggable + resizable floating window | `useFloatingPanel` / `useDraggableFab` |
| Title bar: New group (`Users`), New chat (`Plus`), Close (`X`) | Header |
| Search conversations / users | Left rail |
| Conversation list + unread chips | `view === 'chats'` |
| Start DM from user list | `view === 'users'` + `startDm` |
| Create group (name + multi-select members) | `view === 'new-group'` + `createGroup` |
| Thread header + member count for groups | Right panel |
| Messages: rich HTML (`RichContent`) or plain body | Thread |
| Attachments open in new tab | Per message |
| Composer: `RichTextEditor` (mentions, Enter-to-send) | Footer |
| Emoji picker portal | Smile button |
| File attach / multi-upload | Paperclip + `uploadFileLocal` |
| Send button + sending spinner | Footer |
| Empty state + “Start a chat” CTA | No active conversation |
| Mobile back to list (`ChevronLeft`) | Thread header |
| WS live updates, mark read, sounds | `MessengerContext`, `chatWsBridge`, `chatNotify` |

Backend already has `add_participants` / `remove_participant` (`backend/routers/chat.py`) — **not wired in UI today**. Optional enhancement only (see Step 4).

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Dev | Docker `as-frontend` or `npm run dev` | Messenger opens |
| Manual regression | Walk inventory table above on Luxury + Light | every control still works |
| Graphify | `graphify update .` | exits 0 after edits |

## Suggested executor toolkit

- taste / redesign-existing skills (paths above)
- GSAP via existing deps only — **no new animation libraries**
- improve findings below — implement only listed optionals, don’t expand into CRM

## Scope

**In scope**:
- `messenger/MessengerWidget.tsx`
- `messenger/MessengerContext.tsx` (only if wiring optional add-member; prefer UI-only if API already exists)
- `messenger/useFloatingPanel.ts` / `chatNotify.ts` only if needed for motion hooks
- Small shared styles in `index.css` for messenger/chat bubbles if cleaner than inline
- `dashboardHub/richText.tsx` only for chat-safe contrast props already introduced in `013`

**Out of scope**:
- Feed page redesign
- New chat backend protocols
- Replacing WebSocket with polling
- Removing drag/resize, emoji, attach, groups, or mentions

## Steps

### Step 0: Confirm contrast (013)

If `013` not merged, apply its contrast contract first (bubble `color`, `RichContent` fg, neutralize forced black HTML).

**Verify**: Luxury messages readable.

### Step 1: Visual redesign (taste, same features)

Polish within theme tokens:

- Clearer hierarchy: title bar / list / thread / composer
- Selected conversation state, unread badge, empty states
- Message bubbles: distinct mine vs theirs; timestamps if easy (`createdAt` already on `ChatMessage`)
- Keep all header buttons; improve hit targets / tooltips only

**Verify**: Side-by-side with inventory — nothing missing.

### Step 2: GSAP motion (subtle)

Using `gsap` / `@gsap/react`:

- Panel open/close (opacity + slight y or scale) — respect `prefers-reduced-motion` (skip or instant)
- New message appear (stagger short) — only for newly appended ids, not full re-list flash
- Optional: FAB pulse on unread (subtle; cancel when open)

Do **not** animate every keystroke or continuous loops.

**Verify**: Open/close feels smooth; reduced-motion users get no jank; send still works.

### Step 3: Regression pass

Click through inventory table. Fix any broken wiring from className churn.

**Verify**: Manual checklist complete.

### Step 4 (optional, Ponytail-friendly enhancements)

Only if Steps 0–3 are solid — pick **at most two**:

1. **Message timestamps** under bubbles (`createdAt`)
2. **Add members to existing group** — wire existing `POST` add-participants API (discover exact path in `backend/routers/chat.py`) behind a header button that does not replace New group / New chat / Close
3. **Escape closes** messenger when focus is in the panel (don’t break composer Escape if editor uses it)
4. **Presence dots** if `presenceBridge` already exposes data cheaply — skip if non-trivial

Mark skipped optionals in the plan status notes; do not invent a third chat product.

**Verify**: Each optional has a one-line manual check.

## Improve findings (advisor snapshot — 2026-07-15)

| ID | Severity | Finding | Plan step |
|----|----------|---------|-----------|
| M1 | P0 | Dark theme body text invisible in bubbles / RichContent | 013 + Step 0 |
| M2 | P2 | No visible timestamps though `createdAt` exists | Step 4.1 |
| M3 | P2 | API supports add/remove participants; UI only create-group | Step 4.2 |
| M4 | P3 | Flat visual hierarchy; weak empty/selected states | Step 1 |
| M5 | P3 | No enter/leave motion; FAB static | Step 2 |

## Test plan

- Manual inventory regression (required).
- No need for full Playwright unless already present.
- If adding a pure date-format helper, one vitest; else skip.

## STOP conditions

- Redesign drops any inventory feature → STOP and restore.
- GSAP causes scroll jump / lost composer focus on send → STOP, remove that tween.
- Scope creeps into Feed redesign or new npm animation deps → STOP.
- Contrast still broken on Luxury after Step 0 → STOP; finish 013 properly.

## Done criteria

- [x] 013 contrast contract in place
- [x] All inventory features still present and working
- [x] Taste polish applied within Luxury/Light/Desert tokens
- [x] GSAP open/close (+ message enter) with reduced-motion safe path
- [x] At most two Step-4 optionals, or none with note — **timestamps + Escape**; skipped add-members & presence
- [x] `npm run test:frontend` exit 0
- [x] `plans/README.md` → DONE
- [x] `graphify update .` after edits

## Maintenance notes

- Keep Messenger theme-driven via `colors` prop; avoid hard-coded white/black except as last-resort contrast fallbacks keyed to theme.
- Future: virtualize long threads only if message counts get large — out of scope here.
