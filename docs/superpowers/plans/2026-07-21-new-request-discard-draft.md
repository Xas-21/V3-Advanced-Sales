# New Request Discard Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Discard button on the New Request form that confirms via `window.confirm`, clears the session draft, and returns to the requests list so the next New Request shows the type picker — without changing Back/resume behavior.

**Architecture:** Extract a tiny pure confirm+clear helper next to existing draft storage, unit-test it with an injectable confirm fn, then wire one Discard button through `renderFormLayout` and a single handler in `RequestsManager` that clears and navigates to `list` the same way a successful save does.

**Tech Stack:** React/TypeScript, Vitest, existing `requestDraftStorage.ts` / `RequestsManager.tsx`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-21-new-request-discard-draft-design.md`
- Confirm copy exactly: `Discard this draft?`
- Use browser `window.confirm` (injectable in tests) — no custom modal
- Keep Back / draft write / remount-resume behavior unchanged
- Discard only on true new-request create forms (not edit, duplicate, embedded, type picker)
- Footer order: Discard · Back · Save Request
- Minimal diff; do not refactor the wizard or rewrite enter/leave draft effects
- Planned from design commit: `0ad3468`

## File map

| File | Responsibility |
|------|----------------|
| `requestDraftStorage.ts` | Existing read/write/clear; add `confirmDiscardNewRequestDraft` |
| `requestDraftStorage.test.ts` | Vitest coverage for confirm cancel vs clear |
| `RequestsManager.tsx` | Discard button in `renderFormLayout` + handler → clear + navigate list |

---

### Task 1: Confirm-and-clear helper (TDD)

**Files:**
- Create: `requestDraftStorage.test.ts`
- Modify: `requestDraftStorage.ts`

**Interfaces:**
- Consumes: existing `clearNewRequestDraft()`, `writeNewRequestDraft()`, `readNewRequestDraft(propertyId: string)`
- Produces: `confirmDiscardNewRequestDraft(confirmFn?: (message: string) => boolean): boolean`

- [ ] **Step 1: Write the failing tests**

Create `requestDraftStorage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  writeNewRequestDraft,
  readNewRequestDraft,
  clearNewRequestDraft,
  confirmDiscardNewRequestDraft,
} from './requestDraftStorage';

const PID = 'P-TEST';

function seedDraft() {
  writeNewRequestDraft({
    propertyId: PID,
    step: 2,
    requestType: 'accommodation',
    accForm: { accountName: 'Acme' },
    evtForm: {},
    updatedAt: Date.now(),
  });
}

describe('confirmDiscardNewRequestDraft', () => {
  beforeEach(() => {
    clearNewRequestDraft();
  });

  it('returns false and keeps draft when confirm is cancelled', () => {
    seedDraft();
    const ok = confirmDiscardNewRequestDraft(() => false);
    expect(ok).toBe(false);
    expect(readNewRequestDraft(PID)?.requestType).toBe('accommodation');
  });

  it('clears draft and returns true when confirm is accepted', () => {
    seedDraft();
    const messages: string[] = [];
    const ok = confirmDiscardNewRequestDraft((msg) => {
      messages.push(msg);
      return true;
    });
    expect(ok).toBe(true);
    expect(messages).toEqual(['Discard this draft?']);
    expect(readNewRequestDraft(PID)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:frontend -- requestDraftStorage.test.ts
```

Expected: FAIL (e.g. `confirmDiscardNewRequestDraft` is not exported / not a function).

- [ ] **Step 3: Implement the helper**

In `requestDraftStorage.ts`, add after `clearNewRequestDraft`:

```ts
export function confirmDiscardNewRequestDraft(
  confirmFn: (message: string) => boolean = (message) => window.confirm(message),
): boolean {
  if (!confirmFn('Discard this draft?')) return false;
  clearNewRequestDraft();
  return true;
}
```

Do not change `readNewRequestDraft`, `writeNewRequestDraft`, or `clearNewRequestDraft`.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm run test:frontend -- requestDraftStorage.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add requestDraftStorage.ts requestDraftStorage.test.ts
git commit -m "Add confirmDiscardNewRequestDraft helper with tests."
```

---

### Task 2: Wire Discard button and list navigation

**Files:**
- Modify: `RequestsManager.tsx` (import, handler, `renderFormLayout` footer, form call sites)

**Interfaces:**
- Consumes: `confirmDiscardNewRequestDraft()` from `./requestDraftStorage`
- Produces: optional `onDiscard` on `renderFormLayout`; `handleDiscardNewRequestDraft` in `RequestsManager`

- [ ] **Step 1: Import the helper**

In `RequestsManager.tsx`, extend the existing `requestDraftStorage` import (near `clearNewRequestDraft` / `readNewRequestDraft` / `writeNewRequestDraft`) to include:

```ts
confirmDiscardNewRequestDraft,
```

- [ ] **Step 2: Add the Discard handler**

Place near other new-request draft logic (after the draft write `useEffect` around the `writeNewRequestDraft` block is fine). Exact handler:

```ts
const handleDiscardNewRequestDraft = () => {
    if (embedded || optsHeadless || detailHeadless) return;
    if (isEditing || searchParams?.editRequestId || searchParams?.duplicateFromRequestId) return;
    if (!confirmDiscardNewRequestDraft()) return;
    setRequestType(null);
    setStep(1);
    setSearchParams({ ...getSearchOnlyParams(searchParams), subView: 'list' });
};
```

Notes for the implementer:

- Do **not** call `clearNewRequestDraft()` again here — the helper already cleared.
- Navigating to `list` remounts via AS `key={requests-${requestsSubView}-...}`; clearing storage is what prevents resume.
- Do **not** change the enter-`new_request` reset effect or the leave-`new_request` clear effect.

- [ ] **Step 3: Gate when Discard is offered**

Near the handler (or just above `renderFormLayout`), define:

```ts
const showDiscardNewRequestDraft =
    !embedded &&
    !optsHeadless &&
    !detailHeadless &&
    !isEditing &&
    !searchParams?.editRequestId &&
    !searchParams?.duplicateFromRequestId;
```

- [ ] **Step 4: Update `renderFormLayout` footer**

Change the `renderFormLayout` signature destructuring to accept optional `onDiscard`:

```ts
const renderFormLayout = ({ title, icon: Icon, children, onBack, onSave, onDiscard, maxWidthClass }: any) => (
```

Replace the footer button row with:

```tsx
<div className="flex items-center justify-end gap-3 pt-8 mt-8 border-t" style={{ borderColor: colors.border }}>
    {typeof onDiscard === 'function' && (
        <button
            type="button"
            onClick={onDiscard}
            className="px-6 py-3 rounded-xl border font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
            style={{ borderColor: colors.border, color: '#ef4444' }}
        >
            Discard
        </button>
    )}
    <button type="button" onClick={onBack} className="px-6 py-3 rounded-xl border font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
        style={{ borderColor: colors.border, color: colors.textMain }}>Back</button>
    {!readOnlyOperational && (
        <button type="button" onClick={onSave} className="px-10 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-2 hover:brightness-110 hover:-translate-y-0.5 transition-all active:scale-95"
            style={{ backgroundColor: colors.primary, color: '#000' }}>
            <Save size={16} /> Save Request
        </button>
    )}
</div>
```

Keep Back and Save markup/behavior identical aside from inserting Discard to their left.

- [ ] **Step 5: Pass `onDiscard` from form call sites**

Every `renderFormLayout({...})` used for create forms must pass Discard when gated. There are three call sites today:

1. Inside `renderAccommodationForm` — the `return renderFormLayout({...})` that already has `onBack` / `onSave`
2. Inside `renderEventForm` — same
3. Inside `renderCombinedForm` — same

At each site, add:

```ts
onDiscard: showDiscardNewRequestDraft ? handleDiscardNewRequestDraft : undefined,
```

Do **not** change any `onBack` handlers (they must keep `setStep(1)` / `setRequestType(null)` only — draft stays).

- [ ] **Step 6: Run unit tests again**

Run:

```bash
npm run test:frontend -- requestDraftStorage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Manual smoke (required)**

In the running app (Docker or `npm run dev`):

1. Requests → New Request → pick a type → fill at least one field.
2. Navigate to another page (e.g. CRM), return → New Request → **still resumes** the form (regression).
3. Click **Discard** → browser confirm → Cancel → stay on form; draft still resumes if you leave and come back.
4. Click **Discard** → OK → land on requests **list**.
5. New Request again → **type picker** (step 1), not the old form.
6. Edit an existing request (if that path uses the same layout): Discard must **not** appear.
7. Back (without Discard) must still work as before.

- [ ] **Step 8: Commit**

```bash
git add RequestsManager.tsx
git commit -m "Add Discard button to clear new-request draft and return to list."
```

---

### Task 3: Graphify update + final verify

**Files:**
- Touch via tool only: `graphify-out/` (AST update after code changes)

**Interfaces:**
- None

- [ ] **Step 1: Update knowledge graph**

From repo root:

```bash
graphify update .
```

Expected: completes without error (AST-only).

- [ ] **Step 2: Re-run focused tests**

```bash
npm run test:frontend -- requestDraftStorage.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit graphify artifacts only if they changed and are normally committed in this repo**

If `git status` shows intentional tracked updates under `graphify-out/` that match prior project practice:

```bash
git add graphify-out/GRAPH_REPORT.md graphify-out/graph.json graphify-out/manifest.json graphify-out/.graphify_labels.json
git commit -m "Update graphify after new-request discard draft."
```

If graphify output is dirty noise / untracked cache only, skip the commit.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Discard clears draft | Task 1 + Task 2 handler |
| Browser `confirm` with discard copy | Task 1 |
| Return to list after confirm | Task 2 handler `subView: 'list'` |
| Next New Request → type picker | Task 2 clear + Task 2 manual step 5 |
| Back / resume unchanged | Task 2 does not touch `onBack` or write/read effects; manual step 2 |
| Footer Discard · Back · Save | Task 2 `renderFormLayout` |
| Not on type picker | Discard only via `renderFormLayout` (step ≥ 2 forms) |
| Not on edit/duplicate/embedded | `showDiscardNewRequestDraft` gate |
| No custom modal / no backend | All tasks |

## Self-review notes

- No placeholders left in steps.
- Helper name `confirmDiscardNewRequestDraft` is consistent across Task 1 and Task 2.
- Confirm message string is identical in helper and tests: `Discard this draft?`
