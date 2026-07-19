# Plan 013: Fix Messenger message text contrast on dark themes

> **Executor instructions**: Follow step by step. Preserve every Messenger control and API behavior. Ponytail — smallest contrast fix first; do not redesign layout in this plan (that is `014`). Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- messenger/MessengerWidget.tsx dashboardHub/richText.tsx index.css`

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `90c3a4c`, 2026-07-15
- **DONE**: 2026-07-15 — bubble `color` + `card` bg; `RichContent` `variant="chat"` + `--rt-fg`; CSS inherit override for baked-in colors

## Why this matters

On Luxury / other dark themes, incoming (and often outgoing) chat bubbles use a near-black background while message body text stays black or inherits black. Mentions and gold labels remain visible; plain words like “hi” / “Marhaba” disappear. Users think chat is broken.

Root cause (current code):

1. Bubbles set `background` but **not** `color` (`MessengerWidget.tsx` ~309–318).
2. `RichContent` sets only `--rt-accent`, not `color: colors.textMain` (`richText.tsx` ~56–72).
3. Stored `bodyHtml` may include inline `color:#000` / `rgb(0,0,0)` from the editor color picker — those win over inheritance.

## Current state

```tsx
// messenger/MessengerWidget.tsx ~309-318
style={{
  background: isMine ? colors.primaryDim : colors.bg,
  border: `1px solid ${colors.border}`,
}}
{m.bodyHtml ? <RichContent html={m.bodyHtml} colors={colors} /> : (
  <div style={{ color: colors.textMain }}>{m.body}</div>
)}
```

```tsx
// dashboardHub/richText.tsx ~67-71
<div
  className={`rt-content ${className || ''}`}
  style={{ ['--rt-accent' as any]: colors?.primary || '#3b82f6' }}
  dangerouslySetInnerHTML={{ __html: safe }}
/>
```

Themes: Luxury / Light / Desert via `colors` prop from app shell — match existing tokens (`textMain`, `textMuted`, `bg`, `card`, `primary`, `primaryDim`, `border`).

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Manual | Open Messenger on Luxury theme; send/receive plain + rich messages | body text readable (light on dark) |
| Manual | Light / Desert themes | still readable; no washed-out gold-on-cream regressions |

## Suggested executor toolkit

- Ponytail (`.cursor/rules/PonyTail.mdc`) — no redesign in this plan
- After edits: `graphify update .`

## Scope

**In scope**:
- `messenger/MessengerWidget.tsx` (bubble / thread text color only)
- `dashboardHub/richText.tsx` (`RichContent` default text color + optional CSS var)
- `index.css` (small `.rt-content` inherit / override rules if needed)

**Out of scope**:
- Layout redesign, GSAP, new buttons (plan `014`)
- Changing chat API / WebSocket / `MessengerContext` behavior
- Rewriting sanitize pipeline beyond neutralizing unreadable forced black/white when theme requires it

## Steps

### Step 1: Theme color on bubbles + RichContent

1. On each message bubble container, set `color: colors.textMain` (and keep backgrounds as today, or slightly lift incoming bubble off pure `colors.bg` if still low-contrast — e.g. `colors.card` or a dimmed card — only if step 1 alone is insufficient).
2. On `RichContent` root, set `color: colors?.textMain` and `--rt-fg: colors.textMain` (or equivalent).
3. Plain `m.body` path already sets `textMain` — leave it.

**Verify**: New messages without inline color styles are readable on Luxury.

### Step 2: Neutralize forced near-black (and near-white on light) inline styles in HTML

Ponytail options (pick **one**):

- **A (CSS)**: `.rt-content, .rt-content *:not(.rt-mention):not(.rt-mention-chip):not(.rt-hashtag):not(a) { color: inherit !important; }` scoped so mentions/links keep accent — **or** only strip `color` on elements when value is near-black.
- **B (sanitize)**: In `sanitizeRichHtml` / `RichContent` preprocess, remove `color` from inline styles when luminance is near black (dark theme) or near white (light theme). Prefer theme-aware via a `data-theme` or by passing a `forceReadable` flag from Messenger only.

Do not destroy intentional accent colors on mentions/hashtags.

**Verify**: Old messages that were typed with black text become readable on Luxury; mentions still gold/primary.

### Step 3: Composer parity

Confirm `RichTextEditor` compact composer already uses `color: colors.textMain` (it does ~314). If placeholder or toolbar icons fail contrast on Luxury, fix with tokens only — no layout change.

**Verify**: Typing area text visible on Luxury.

## Test plan

- Manual checklist above (Luxury + Light).
- Optional: tiny vitest that a helper stripping near-black inline colors leaves mention spans intact — only if you add a pure helper; skip if CSS-only.

## STOP conditions

- Fix requires redesigning the whole Messenger chrome → STOP; hand off to `014`.
- Changing sanitize breaks Feed rich posts → STOP; scope Messenger-only CSS or a `RichContent` prop `variant="chat"`.
- KPI/profile files touched → STOP; out of scope.

## Done criteria

- [x] Incoming + outgoing message bodies readable on Luxury (dark) theme
- [x] Light / Desert still readable
- [x] Mentions / links still accent-colored
- [x] No feature removed
- [x] `npm run test:frontend` exit 0
- [x] `plans/README.md` → DONE
- [x] `graphify update .` run after edits

## Maintenance notes

- Plan `014` may restyle bubbles; keep `color: colors.textMain` / RichContent fg contract.
- If Feed needs different defaults, use a prop rather than global CSS that breaks Feed.
