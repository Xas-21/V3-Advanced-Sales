# Plan 057: Stop CRM WebSocket echo loop (Calls KPI 329↔0 forever)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 72e3b70..HEAD -- AS.tsx backend/data_access.py crmStateModel.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `72e3b70`, 2026-07-21

## Why this matters

On the main dashboard, the Calls mini-stat oscillates forever (~329 → 0 → 329). Backend logs show a ~3s cycle: `POST /api/crm-state` → `GET /api/crm-state` → `GET /api/accounts`. Root cause: CRM persist broadcasts over WebSocket; the client reloads CRM on that signal, **clears** state (Calls → 0), then re-applies payload (Calls → ~329) and **re-POSTs** because the HTTP persist effect never honors the hydrate skip flag (accounts/tasks already do). This burns API capacity and makes the KPI look broken.

## Current state

### Relevant files

- `AS.tsx` — dashboard shell; owns `crmState`, WS live bumps, CRM load + persist
- `backend/data_access.py` — `upsert_crm_state` broadcasts `crm_state` after every successful write
- `crmStateModel.ts` — `defaultCrmState()`, filters, `crmStateToLegacyLeads`
- Accounts live pattern (exemplar to copy): `AS.tsx` ~1337–1355 + sync skip ~1323–1326

### Comment claims loop-safety that CRM POST does not have

```906:909:AS.tsx
    // Per-entity live signals: any WebSocket broadcast for an entity bumps its
    // counter, and the owning loader effect refetches. This mirrors the
    // dashboard/requests pattern and is loop-safe (the loader sets the
    // sync-skip guard so the refetch never re-POSTs and re-broadcasts).
```

Accounts honor that claim; CRM does not.

### Working accounts pattern (copy this shape)

```1337:1355:AS.tsx
    // Live refetch for accounts on WebSocket signal. Does NOT clear the list
    // first (no flicker) and sets skipNextAccountsSync so the incoming data is
    // not re-POSTed back to the server (prevents cross-client sync ping-pong).
    useEffect(() => {
        if (accountsLiveVersion === 0) return;
        ...
            skipNextAccountsSync.current = true;
            ...
            setAccounts(list);
```

Accounts **property** load clears; **live** refetch does not. Sync effect checks `skipNextAccountsSync` before PUT.

### Broken CRM combined load (property + live)

```1685:1759:AS.tsx
    useEffect(() => {
        let cancelled = false;
        const pid = activeProperty?.id;
        crmHydratedForPropertyId.current = null;
        crmPersistEnabledRef.current = false;
        setCrmState(defaultCrmState());   // ← Calls KPI → 0 on EVERY crmLiveVersion bump
        ...
        skipNextCrmPersist.current = true;  // set once at start
        ...
            setCrmState(scoped);            // hydrate apply
            window.setTimeout(() => {
                crmPersistEnabledRef.current = true;
            }, 0);
        ...
    }, [activeProperty?.id, fetchAccountsForProperty, crmLiveVersion]);
```

### Skip consumed only by localStorage — not by POST

```1761:1808:AS.tsx
    useEffect(() => {
        ...
        if (skipNextCrmPersist.current) {
            skipNextCrmPersist.current = false;
            return;   // ← only skips localStorage write
        }
        ...
    }, [crmState, activeProperty?.id]);

    useEffect(() => {
        ...
        if (!crmPersistEnabledRef.current) return;
        ...
        // NO skipNextCrmPersist check here
        const t = setTimeout(() => {
            fetch(apiUrl('/api/crm-state'), { method: 'POST', ... });
        }, 1200);
        ...
    }, [crmState, activeProperty?.id]);
```

**Extra trap:** `skipNextCrmPersist = true` at load start is consumed by the **clear** `setCrmState(defaultCrmState())` via the localStorage effect. By the time hydrate `setCrmState(scoped)` runs, the skip flag is already `false`.

### Calls KPI derivation (symptom, not separate bug)

```2159:2162:AS.tsx
        const callsCount = flattenCrmLeads(crmLeads).filter((lead: any) => {
            const dt = parseYmd(lead?.lastContact || lead?.date);
            return dt ? isIsoInRange(dt, range) : false;
        }).length;
```

Rendered as `dashboardStats.status.calls` (~4316). Empty CRM → `"0"`; hydrated → `"~329"`.

### Conventions

- Match accounts/tasks: separate live refetch effect; set skip **immediately before** applying server data; honor skip in the **HTTP** sync/persist effect.
- Use existing `beginPropertyLoad` / `isPropertyLoadCurrent` from `propertyScopedLoad.ts`.
- Minimal diff; do not refactor unrelated CRM UI.

## Commands you will need

| Purpose   | Command                         | Expected on success        |
|-----------|---------------------------------|----------------------------|
| Typecheck | `npm run typecheck`             | exit 0                     |
| Frontend tests | `npm run test:frontend`    | exit 0                     |
| Lint      | `npm run lint`                  | exit 0 (warnings ≤ max)    |
| Manual loop check | Docker logs while dashboard open | no repeating POST/GET crm-state every ~3s |

## Suggested executor toolkit

- `superpowers:systematic-debugging` if the loop persists after the intended change — re-trace before adding more guards.
- Do **not** change backend broadcast behavior in this plan (out of scope); fix the client echo.

## Scope

**In scope** (the only files you should modify):

- `AS.tsx` — CRM load / live refetch / persist effects only
- `plans/README.md` — status row for 057
- Optional (only if needed for a tiny pure regression test): one new small helper file next to existing kits (e.g. `crmPersistSkip.ts` + `crmPersistSkip.test.ts`) — prefer **no** new file if the accounts pattern can be inlined cleanly

**Out of scope** (do NOT touch):

- `backend/data_access.py` / `backend/routers/crm_state.py` — keep broadcast + empty-overwrite guards
- `CRM.tsx` deadline auto-calls
- `crmStateModel.ts` filter semantics (unless a one-line comment is required)
- Hub redesign, accounts sync, tasks sync (except copying their pattern)
- Property-scoped count races hardening beyond what is required to stop the echo (defer to a follow-up if still needed)

## Git workflow

- Branch: `fix/057-crm-state-websocket-echo-loop` (or `advisor/057-crm-state-websocket-echo-loop`)
- Commit style (from recent log): imperative sentence, e.g. `Stop CRM WebSocket self-echo from clearing Calls KPI.`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Drift-check and confirm skip is missing on POST

Run:

```bash
git diff --stat 72e3b70..HEAD -- AS.tsx
```

Confirm these still hold by reading live code:

1. CRM load effect deps include `crmLiveVersion` and call `setCrmState(defaultCrmState())` at the start.
2. `skipNextCrmPersist` is checked only in the localStorage effect, not the POST effect.

**Verify**: Grep shows POST effect lacks skip:

```bash
# PowerShell from repo root
Select-String -Path AS.tsx -Pattern "skipNextCrmPersist" -Context 2,2
```

Expect: matches around ref declaration, load effect set-true, localStorage consume — **not** inside the `/api/crm-state` POST `useEffect` body (today). After the fix, POST effect must also consume it.

### Step 2: Split CRM property load from CRM live refetch

Mirror accounts.

**A. Property-change loader** (deps: `[activeProperty?.id, fetchAccountsForProperty]` only — **remove** `crmLiveVersion`):

- Keep clear-to-empty + hydrate-disable on **property change** (legitimate reset).
- Keep GET `/api/crm-state` + `fetchAccountsForProperty` + `applyCrmPayload`.
- In `applyCrmPayload`, **immediately before** `setCrmState(scoped)`, set:

```ts
skipNextCrmPersist.current = true;
```

  (Do not rely solely on skip set at effect start — the clear `setCrmState` consumes it via localStorage.)

**B. New live refetch effect** (deps: `[crmLiveVersion, activeProperty?.id, fetchAccountsForProperty]`):

- Early return if `crmLiveVersion === 0`.
- **Do not** call `setCrmState(defaultCrmState())`.
- **Do not** null out hydrate / disable persist for the whole UI (avoid KPI flash). Optional: keep a local `cancelled` flag only.
- GET crm-state + accounts (same fetch path as property load; reuse `applyCrmPayload` via shared inner function or duplicate the fetch/apply carefully with gates).
- Before applying: `skipNextCrmPersist.current = true`.
- Use `beginPropertyLoad` / `isPropertyLoadCurrent` with `crmLoadGate` so a late live response cannot overwrite a newer property switch.

**Verify**:

```bash
Select-String -Path AS.tsx -Pattern "crmLiveVersion"
```

Expect: WS bump still sets it; property load effect deps **no longer** include it; a dedicated live effect **does**.

### Step 3: Honor `skipNextCrmPersist` in the HTTP POST persist effect

In the POST `useEffect` (`/api/crm-state`), add the same guard accounts use, **before** scheduling the timeout:

```ts
if (skipNextCrmPersist.current) {
    skipNextCrmPersist.current = false;
    return;
}
```

**Ordering note:** Both localStorage and POST effects react to `crmState`. After hydrate, **one** skip flag cannot satisfy two consumers if both run. Fix by either:

1. **Preferred (match accounts):** live/property apply sets skip once; **only the POST effect** consumes `skipNextCrmPersist`. LocalStorage may always write the hydrated payload (cheap, local) — OR use a second ref `skipNextCrmLocalPersist` if you must skip both. Simplest correct approach: **POST consumes the skip**; leave localStorage as-is writing hydrated data (harmless). Remove the skip check from localStorage **or** set the skip flag twice / use a counter — do **not** leave a single boolean consumed by localStorage first.

2. If you keep skip on localStorage, change to a counter:

```ts
// when applying server payload:
skipNextCrmPersist.current += 1; // or set to 2
// each consumer:
if (skipNextCrmPersist.current > 0) {
  skipNextCrmPersist.current -= 1;
  return;
}
```

Pick (1) unless localStorage writes cause a known bug.

Also update the misleading comment at ~906–909 if it still claims all entity loaders are loop-safe — CRM now must match that claim.

**Verify**:

```bash
Select-String -Path AS.tsx -Pattern "api/crm-state" -Context 15,5
```

POST effect must show the skip guard. LocalStorage must not steal the only skip before POST runs (counter or POST-only consume).

### Step 4: Keep empty-overwrite bailout

Do **not** remove:

```ts
if (clientTotal === 0 && serverTotal > 0) return;
```

That is a separate safety net. The echo loop is non-empty re-POST; this guard does not stop it.

**Verify**: that line still exists in `AS.tsx`.

### Step 5: Typecheck + frontend tests

```bash
npm run typecheck
npm run test:frontend
```

Expected: exit 0 both.

### Step 6: Manual confirmation (required for this bug)

With Docker stack up, open main dashboard on a property with many calls:

1. Watch backend logs for 30–60s.
2. Calls card must stabilize (not flicker 329↔0).
3. After initial load settle, you must **not** see a repeating `POST /api/crm-state` → `GET /api/crm-state` → `GET /api/accounts` every ~3s while idle.

Optional positive check: edit a CRM call elsewhere / second tab — live update may still arrive, but should **not** clear Calls to 0 and should **not** start an idle echo loop.

## Test plan

AS.tsx is not unit-tested today. Prefer:

- **Primary:** manual loop check in Step 6 (this is the regression that matters).
- **Optional small pure test** only if you introduce a skip-counter helper — model after `propertyScopedLoad.test.ts` (vitest, `describe`/`it`/`expect`).
- Do **not** add Playwright/Testsprite for this unless already required by the operator.

Verification: `npm run test:frontend` still exits 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run test:frontend` exits 0
- [ ] Property CRM load effect deps do **not** include `crmLiveVersion`
- [ ] A separate live CRM refetch effect exists and does **not** call `setCrmState(defaultCrmState())`
- [ ] POST `/api/crm-state` effect consumes a hydrate skip (boolean or counter) so apply-from-server does not schedule a POST
- [ ] Empty-overwrite bailout (`clientTotal === 0 && serverTotal > 0`) still present
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] Idle dashboard: no perpetual POST/GET crm-state/accounts loop in backend logs; Calls KPI does not oscillate
- [ ] `plans/README.md` status row for 057 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- Drift check shows `AS.tsx` CRM persist section no longer matches the excerpts (major refactor landed).
- Fixing the loop appears to require changing backend broadcast semantics or disabling WS `crm_state` entirely.
- After Step 3, idle loop continues — do not add random debounces; re-trace who still POSTs (e.g. `syncAllPipelineCardsFromRequests` at ~1546) and report before expanding scope.
- You need to touch `CRM.tsx` auto-call writers to stop the idle dashboard loop (that would mean the hypothesis is incomplete).

## Maintenance notes

- Any new entity with “persist + WS broadcast + live refetch” must copy **accounts**: separate live effect (no clear), skip before apply, skip consumed by **HTTP** sync.
- Reviewers: watch that property switch still clears CRM once; live path must not clear.
- Follow-up (not this plan): property-scoped `crmServerCountsRef` / filtered vs raw count mismatch (`CORRECTNESS-04` from audit) if empty-save edge cases appear after this fix.
- Deferred: ignore self-echo by correlation id on WS — nicer, not required once skip-on-hydrate works.
