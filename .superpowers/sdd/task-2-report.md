# Task 2 Report: Wire Discard button and list navigation

## Status

**DONE**

## Commits

| SHA | Subject |
|-----|---------|
| e5e7ec6 | Add Discard button to clear new-request draft and return to list. |

(Depends on Task 1: cc7fd4b — `confirmDiscardNewRequestDraft` helper.)

## Implementation summary

### Step 1 — Import

Extended `./requestDraftStorage` import with `confirmDiscardNewRequestDraft`.

### Step 2 — Handler

Added `handleDiscardNewRequestDraft` immediately after the draft write `useEffect` (before `prevSubViewRef`). Matches brief verbatim: guards embedded/headless/edit paths, calls `confirmDiscardNewRequestDraft()`, resets `requestType`/`step`, navigates to `subView: 'list'` via `getSearchOnlyParams`. Does not call `clearNewRequestDraft()` directly.

### Step 3 — Gate

Added `showDiscardNewRequestDraft` with the exact conditions from the brief.

### Step 4 — `renderFormLayout` footer

- Signature accepts optional `onDiscard`.
- Footer renders red **Discard** button left of **Back** when `onDiscard` is a function.
- **Back** and **Save Request** markup unchanged aside from Discard insertion.

### Step 5 — Form call sites

Passed `onDiscard: showDiscardNewRequestDraft ? handleDiscardNewRequestDraft : undefined` at:

1. `renderAccommodationForm` → `renderFormLayout({...})`
2. `renderEventForm` → `renderFormLayout({...})`
3. `renderCombinedForm` → `renderFormLayout({...})`

**Not changed:** enter-`new_request` reset effect, leave-`new_request` clear effect, or any `onBack` handlers.

## Tests

```bash
npm run test:frontend -- requestDraftStorage.test.ts
```

**Result:** PASS — 2 tests, 1 file, 835ms.

## Manual smoke (brief Step 7)

| Step | Result |
|------|--------|
| New Request → fill field → leave app → return → resume | **Not run** — no browser in agent session |
| Discard → Cancel → stay on form | **Not run** |
| Discard → OK → requests list | **Not run** |
| New Request again → type picker (step 1) | **Not run** |
| Edit existing → Discard hidden | **Not run** (code review: gate excludes `isEditing` / `editRequestId` / `duplicateFromRequestId`) |
| Back without Discard unchanged | **Not run** (code review: `onBack` handlers untouched) |

Recommend human verification in Docker or `npm run dev` before merge.

## Self-review

- **Spec fidelity:** Handler, gate, footer JSX, and three call sites match task brief verbatim.
- **Reuse:** Uses Task 1 `confirmDiscardNewRequestDraft`; no duplicate clear/confirm logic.
- **Scope:** Single-file diff (`RequestsManager.tsx`, +32/−1). No draft lifecycle effect changes.
- **Edge cases:** Discard hidden for embedded, headless, edit, and duplicate flows. Leave-`new_request` effect may call `clearNewRequestDraft()` again after discard navigation — idempotent, acceptable.
- **Lint:** No new linter issues on `RequestsManager.tsx`.
- **Graphify:** `graphify update .` run post-edit.

## Concerns

None blocking. Manual smoke steps 1–7 not executed in this environment; gate logic reviewed statically.

## Final review fix

**Finding:** Important 1 — Discard appeared on duplicate-create after hydration cleared `duplicateFromRequestId`.

**Change:** Gate `showDiscardNewRequestDraft` and `handleDiscardNewRequestDraft` on `isDuplicateCreateFlow` (`searchParams?.duplicateFromRequestId || hydratedForDuplicateIdRef.current`). Stop clearing `hydratedForDuplicateIdRef` when the param is absent (post-hydration); clear it when leaving `new_request`.

### Tests

```bash
npm run test:frontend -- requestDraftStorage.test.ts
```

**Result:** PASS — 2 tests, 1 file, 837ms.

### Manual smoke (human)

1. Open an existing request → **Duplicate** → confirm **Discard** is hidden on the pre-filled form (after hydration).
2. **New Request** (non-duplicate) → pick type → fill a field → confirm **Discard** is visible.
3. **Discard** → Cancel → stay on form; **Discard** → OK → land on requests list.
4. Edit existing request → confirm **Discard** remains hidden.
5. **Back** on a normal new request still returns to type picker (unchanged).

**Not run in agent session** — verify in Docker or `npm run dev`.
