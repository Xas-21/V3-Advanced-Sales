# Plan 068: Bring frontend lint warnings back under the ratchet

> **Executor instructions**: Follow step by step; verify each step; obey STOP conditions.
> A reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7d43062..HEAD -- package.json eslint.config.js`

## Status
- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW (must not change runtime behavior while fixing lint)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `7d43062`, 2026-07-22

## Why this matters
CI enforces `eslint . --max-warnings 2319` (`package.json:14`). The owner reports the count is now
**above** that limit, so lint (and CI) fails. The project's convention (see `plans/056`) is to fix
the **delta** that pushed it over — not to chase all 2319 legacy warnings. This restores a green
lint gate without a risky mass edit.

## Current state
- `package.json:14` — `"lint": "eslint . --report-unused-disable-directives --max-warnings 2319"`.
- `plans/056-lint-ratchet-plan055-delta.md` — prior precedent: fix only the newly-introduced warnings, keep the ratchet number.

## Commands
| Purpose | Command | Expected |
|---|---|---|
| Count warnings | `npx eslint . --format=json > lint.json` then count, OR `npx eslint .` and read the summary line | prints total warnings |
| Lint gate | `npm run lint` | exit 0 when ≤ ratchet |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope
**In scope:** the specific source files whose warnings exceed the ratchet; `package.json` lint number ONLY if the reviewer approves re-ratcheting downward. New source files that introduced warnings.
**Out of scope:** blanket `eslint-disable` across the repo; changing lint rules to hide warnings; any runtime behavior change.

## Steps

### Step 1: Measure the current count and the delta
Run `npx eslint .` and record the total warning count. Compute `over = total - 2319`.
**Verify**: you have an exact number and a list of the files/rules contributing the newest warnings (sort by count).

### Step 2: Fix the delta at the source
Address the `over` warnings by fixing the actual code (unused vars, missing deps, etc.) in the files that introduced them since the ratchet was last green. Prefer real fixes; use a narrowly-scoped `// eslint-disable-next-line <rule> -- <reason>` ONLY where a fix would change behavior, with a reason comment. Do NOT bulk-disable.
**Verify**: `npm run lint` exits 0.

### Step 3: Confirm no behavior change
**Verify**: `npx tsc --noEmit` exit 0; `npx vitest run` still passes (no test broke from the edits).

### Step 4: (Optional, reviewer-approved) ratchet down
If the fixes brought the count well below 2319, lower `--max-warnings` to the new count so it can't silently grow back. Only with reviewer approval.

## Done criteria
- [ ] `npm run lint` exits 0
- [ ] `npx tsc --noEmit` exit 0; `npx vitest run` passes
- [ ] No blanket disables; any disable has a reason comment
- [ ] Only in-scope files changed

## STOP conditions
- Fixing a warning would change runtime behavior (use a scoped disable with reason instead, or report).
- The count is over by a large amount concentrated in generated/vendored files (report; may need an ignore entry, reviewer decision).

## Maintenance notes
- Reviewer: prefer re-ratcheting down (Step 4) so warnings can't regrow to the cap.
