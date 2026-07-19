# Plan 040: Establish a verification gate — typecheck, working lint, and CI

> **Executor instructions**: Follow step by step. Run every verification command and confirm the expected result before moving on. Honor "STOP conditions". Update this plan's status row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- package.json tsconfig.json`

## Status

- **Priority**: P0 (prerequisite for safely shipping any other fix)
- **Effort**: S–M
- **Risk**: LOW (additive tooling; may surface existing latent errors — that is the point)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

There is no automated verification gate:
- `build` is `vite build` (esbuild transform) which **does not typecheck** — `tsc --noEmit` currently reports ~50 type errors, all shipping to production. One (`AS.tsx:2780` `selectedCurrency`) is a real undefined-identifier crash, currently latent only because it lives in dead code (`RequestsView`, never rendered).
- `npm run lint` is **broken**: `eslint` is not installed, there is no eslint config, and the script's `--ext js,jsx` would exclude every `.ts`/`.tsx` file anyway.
- There is **no CI** (`.github/workflows` does not exist), so nothing runs tests/typecheck/build on push or PR.

Without this gate, every other fix in these plans can be silently regressed. This is the highest-leverage production-readiness item.

## Current state

- `package.json:6-19` scripts:

```json
"build": "vite build",
"lint": "eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0",
"test:frontend": "vitest run",
"test": "npm run test:frontend && npm run test:request-detail-layout && npm run test:backend",
```

- `tsconfig.json` already has `"strict": true` and `"noEmit": true` — a `tsc --noEmit` gate is ready to use; it is simply never invoked.
- `eslint` is absent from `devDependencies` (`package.json:44-56`); `node_modules/.bin/eslint` does not exist; no `.eslintrc*` / `eslint.config.*` in repo.
- `test:backend` (`package.json:15`) hardcodes `.\venv\Scripts\pytest.exe` (Windows-only) — CI runs on Linux, so the CI job must invoke pytest directly (see Step 4). Cross-platform script fixes are tracked separately (do not rewrite all `:win` scripts here).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit` | (currently errors — see Step 1) |
| Frontend tests | `npm run test:frontend` | 38+ pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `package.json` (add `typecheck` script, fix `lint` script + devDeps)
- `eslint.config.js` (create — flat config)
- `.github/workflows/ci.yml` (create)
- Minimal fixes **only** to whatever `tsc --noEmit` errors you choose to gate on (see Step 1 decision)

**Out of scope**:
- A sweeping refactor to fix all ~50 type errors in one go (that risks the whole app). Use the staged approach in Step 1.
- Rewriting the Windows `:win` scripts (separate DX plan).
- Deleting dead code like `RequestsView` (separate cleanup plan; here you only ensure it's gated or excluded).

## Steps

### Step 1: Add a `typecheck` script and decide the gate baseline

Add to `package.json` scripts:

```json
"typecheck": "tsc --noEmit",
```

Run `npx tsc --noEmit`. Because there are ~50 pre-existing errors, do **not** block the whole build on a clean pass immediately. Choose the least-risky baseline that still creates a gate:

- **Preferred**: fix the small, safe errors (implicit-any params, the non-exported `WebSocketMessage` type import at `AS.tsx:82`, missing `key` typing) and remove/guard the dead `RequestsView` `selectedCurrency` crash, then aim for zero errors and gate on `tsc --noEmit` == 0.
- **If zero-error is too large for one pass** (STOP-and-report if the remaining errors are >~15 after safe fixes): keep `typecheck` reporting-only in `build`, but make CI (Step 4) run `tsc --noEmit` as a **required, non-blocking-annotated** step and record the current error count as a ratchet in this plan's report so it can only go down. State clearly which mode you chose.

**Verify**: `npm run typecheck` runs and prints the current error count.

### Step 2: Install and configure eslint for TS/TSX

Add devDeps (use versions compatible with the installed `typescript@5.9` and `eslint@9` flat config): `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`.

Create `eslint.config.js` (flat config) targeting `**/*.{ts,tsx}`, extending `@eslint/js` recommended + `typescript-eslint` recommended + react-hooks recommended, ignoring `dist`, `node_modules`, `backend`, `graphify-out`.

Update the `lint` script:

```json
"lint": "eslint . --report-unused-disable-directives --max-warnings 0",
```

(Flat config picks file extensions from the config, so drop `--ext`.)

**Verify**: `npm run lint` runs to completion (it may report warnings/errors — that's fine; it must not crash with "command not found" or "no config"). If the error count is large, set the rule severities that produce the most noise to `warn` and record them for later tightening — do not fix hundreds of lint errors here.

### Step 3: Confirm build + tests still pass

**Verify**: `npm run build` → exit 0. `npm run test:frontend` → all pass.

### Step 4: Add CI workflow

Create `.github/workflows/ci.yml` with two jobs:

**frontend** (ubuntu, node 20):
- `npm ci`
- `npm run typecheck` (blocking or annotated per Step 1 decision)
- `npm run lint`
- `npm run test:frontend`
- `npm run build`

**backend** (ubuntu, python 3.x matching `backend/runtime.txt`, with a `postgres` service container):
- `pip install -r backend/requirements.txt`
- `cd backend && python -m pytest tests -q` (invoke pytest via `python -m pytest`, NOT the Windows `test:backend` script)
- Provide the DB env the tests need (`DATABASE_URL`/`SESSION_SECRET`) via the workflow `env`, using throwaway CI values (never real secrets).

Trigger on `pull_request` and `push` to `main`. Recommend marking the workflow required in branch protection (operator action — note it in your report).

**Verify**: `git add -A && git status` shows the new workflow; YAML parses (`npx --yes yaml-lint .github/workflows/ci.yml` or equivalent, if available). Actual CI run happens on push (operator).

## Test plan

- No new unit tests; this plan adds the gate that runs existing tests. TEST-01 (plan 041) adds the missing coverage that this gate will then enforce.
- Verification: `npm run typecheck`, `npm run lint`, `npm run test:frontend`, `npm run build` all runnable locally.

## Done criteria

- [ ] `npm run typecheck` exists and runs; the chosen gate mode (zero-error or ratchet) is documented in the completion report.
- [ ] `npm run lint` runs without crashing and lints `.ts`/`.tsx`.
- [ ] `npm run build` exits 0; `npm run test:frontend` passes.
- [ ] `.github/workflows/ci.yml` exists with frontend + backend jobs.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- After safe fixes, `tsc --noEmit` still reports >~15 errors that need real logic changes — STOP, report the list, and ship the ratchet mode rather than risky mass edits.
- `npm ci` fails due to a lockfile/dep conflict introduced by the new eslint deps — report the conflict, don't force-resolve blindly.
- Adding eslint surfaces an error that indicates a real bug (e.g. `react-hooks/exhaustive-deps` on a data-fetch effect) — note it as a follow-up finding; do not attempt to fix all app logic here.

## Maintenance notes

- Once the ratchet reaches zero, flip `typecheck` to blocking in both `build` and CI.
- Reviewer: confirm CI runs on PRs and that the backend job actually connects to its Postgres service.
- Follow-ups this enables: cross-platform test scripts (DX), dead-code removal (`RequestsView`), and pinning backend deps so CI is reproducible.
