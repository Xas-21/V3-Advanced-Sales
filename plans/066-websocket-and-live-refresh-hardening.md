# Plan 066: WebSocket session re-validation + Contracts/Settings live refresh + stop silent broadcast failures

> **Executor instructions**: Follow step by step; verify each step; obey STOP conditions.
> A reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7d43062..HEAD -- backend/routers/ws.py backend/routers/feed.py AS.tsx websocket-client.ts backend/routers/contracts.py`

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED (must not drop healthy sockets on transient DB errors)
- **Depends on**: 062 (contracts broadcast) — optional; the WS-04 + feed parts are independent
- **Category**: correctness / security
- **Planned at**: commit `7d43062`, 2026-07-22

## Why this matters
Three live-update gaps: (1) an open WebSocket is only authenticated at connect, so a
logged-out/revoked user's tab keeps receiving events until it drops; (2) Contracts and Settings
taxonomy edits don't refresh for other users; (3) feed broadcast errors are swallowed silently,
so a "stale feed" has no server log. None are launch blockers but the owner asked not to skip
the risks.

## Current state (verified)
- `backend/routers/ws.py:53-60` — receive loop only echoes `ping`→`pong`; no re-check of the session.
- `auth_db.resolve_session` (`auth_db.py:152-187`) — rejects revoked/expired/version-mismatch tokens; safe to call again.
- `AS.tsx:1503-1504` — `handleLiveUpdate` switch has `default: break`, so entity `rooms`/`venues`/`properties`/contracts are ignored.
- `backend/routers/contracts.py` — no `_broadcast_change` on template/record mutation.
- `backend/routers/feed.py:53-56` — `_broadcast_feed` swallows all exceptions (`except Exception: pass`).
- WS close codes `4401` (auth) / `4403` don't reconnect (`websocket-client.ts:27-29`).

## Scope
**In scope:** `backend/routers/ws.py`, `backend/routers/feed.py`, `AS.tsx` (handler cases + optional refetch), `backend/routers/contract_records.py`/`contracts.py` (broadcast on mutate), `websocket-client.ts` (only if needed for onopen resync).
**Out of scope:** the WS URL/split-host issue (separate; same-origin prod is fine) unless trivial.

## Steps

### Step 1: Re-validate session on each ping
In `ws.py`, capture the `session_id` cookie (already a param). On each received `ping`, call `resolve_session(session_id)`; if it now returns None (revoked/expired/version bumped), `await websocket.close(code=4401)` and return. Guard against transient DB errors: only close on a definitive None, not on an exception (on exception, keep the socket and log a warning).
**Verify**: manual — log out in one tab; the other tab's socket closes with 4401 within one ping interval (~30s). Do not close on a DB hiccup.

### Step 2: Broadcast contract mutations
In the contract record routes (plan 062) and template routes, call `_broadcast_change("updated"/"deleted", "contracts", {...}, property_id)` after commit (mirror `data_access._broadcast_change` usage).
**Verify**: editing a contract in one browser triggers a `contracts` WS event.

### Step 3: Client handles contracts + settings entities
In `AS.tsx` `handleLiveUpdate`, add cases for `contracts` (bump a `contractsLiveVersion` → refetch `/api/contracts`) and for `rooms`/`venues`/`properties` (debounced refetch of the property catalog / active property config used by Settings). Keep it a lightweight refetch, not a merge, to avoid echo loops (see plan 057's echo fix pattern).
**Verify**: two admins — one edits a room type / a contract; the other sees it without manual refresh.

### Step 4: Stop silent feed broadcast failures
In `feed.py:_broadcast_feed`, replace `except Exception: pass` with `except Exception as e: logging.getLogger(__name__).warning("feed broadcast failed: %s", e)` (mirror `data_access.py:138-139`).
**Verify**: broadcast failure now logs a warning; happy path unchanged.

### Step 5: (Optional) resync on reconnect
If quick: in `websocket-client.ts` `socket.onopen`, invoke the message handler with a synthetic `{type:'refresh', entity:'all'}` OR have `AS.tsx` refetch active-property data on reconnect, so events missed during an outage are recovered. Keep it debounced.
**Verify**: kill+restart backend; client reconnects and data re-syncs without a manual refresh.

## Done criteria
- [ ] Revoked session's open socket closes (4401) on next ping; healthy sockets unaffected by transient errors
- [ ] Contract + settings edits propagate live to other users
- [ ] `feed.py` broadcast failures are logged, not swallowed
- [ ] `npx tsc --noEmit` exit 0; `pytest` pass; only in-scope files changed

## STOP conditions
- Session re-check would close sockets on transient DB errors (must distinguish None from exception).
- Adding settings refetch reintroduces the CRM-style echo loop (plan 057) — if so, gate on `msg.data.propertyId === active` and debounce.

## Maintenance notes
- Reviewer: confirm no broadcast loop; watch CPU/socket churn after the settings cases land.
- WS split-host (`VITE_API_BASE_URL`) is a separate, non-blocking item — note only.
