# Plan 043: Auth/session/config hardening (token leak, rate limiter, hardcoded contacts)

> **Executor instructions**: Follow step by step. Run every verification and confirm before moving on. Honor "STOP conditions". Update this plan's status row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- backend/routers/auth.py backend/routers/contact.py`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED (rate-limiter keying change needs correct proxy handling)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

Three residual auth/config weaknesses (SEC-07/09/10). None is a rebuild — the auth core is strong — but each widens attack surface for a production multi-tenant login:
1. **Session token echoed in the JSON response body** (`auth.py`) while also set as an httpOnly cookie. The frontend doesn't use the body token, so it's a dead field that leaks a live credential into any log/error capture — undermining httpOnly.
2. **Login rate limiter is in-memory, per-process, keyed on `client.host`** — behind the nginx proxy the key is likely the proxy IP (throttles everyone together or nobody), resets on restart, isn't shared across workers, and grows unbounded.
3. **Hardcoded personal email** as the contact fallback recipient, and a static `password123` across test files (verify no seeded/demo account actually uses it).

## Current state

- `backend/routers/auth.py:27-40` — module-level `_login_attempts: dict` keyed by IP, `_check_rate_limit(ip)` / `_record_attempt(ip)`, 10/min. Login returns `{"user":..., "token": token}` in the body **and** sets the cookie (audit cites `auth.py:90-101`); same in `change_password` (audit cites `:134`). `_public_user` (`auth.py:53-64`) is the safe projection (no hash).
- `backend/routers/contact.py:10` — `DEFAULT_NOTIFY_EMAIL = "<personal email>"` (a real personal address). `:28` reads `os.getenv("CONTACT_TO_EMAIL", DEFAULT_NOTIFY_EMAIL)`.
- `nginx.conf:14` sets `X-Forwarded-For` and `X-Real-IP` — so the real client IP is available to the backend via those headers.
- `testsprite_tests/TC0*.py` — `PASSWORD = "password123"` (audit).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Backend tests | `cd backend && python -m pytest tests -q` | all pass |
| Find token consumers | `grep -rn "\.token" backendApi.ts` and `grep -rn "token" Login.tsx` | confirm client doesn't read body token |

## Scope

**In scope**: `backend/routers/auth.py`, `backend/routers/contact.py`, `backend/tests/`.
**Out of scope**: `security.py` (session signing is correct — don't touch), cookie attributes (already correct), the test files' password constant unless a real seeded account is found (Step 3).

## Steps

### Step 1 (SEC-07): Remove the token from response bodies

Confirm the client doesn't read it (`grep` above). If unused, remove `"token": token` from the login and `change_password` response dicts in `auth.py`; keep setting the httpOnly cookie. Leave `_public_user` as the body.

**Verify**: `cd backend && python -m pytest tests -q` → pass (login tests rely on the cookie, not the body token). If a test asserts `token` in the body, update it to assert the cookie is set instead.

### Step 2 (SEC-09): Fix rate-limiter keying and add pruning

- Derive the client IP from the trusted `X-Forwarded-For` (first hop) / `X-Real-IP` header when present, falling back to `client.host`. Add a small helper `_client_ip(request)`.
- Also key on `username` (lower-cased) in addition to IP so one proxy IP can't mask per-account brute force, or throttle per (ip, username).
- Add periodic pruning of empty/old buckets to bound memory (e.g. drop keys whose list is empty after the window filter).

Keep it in-memory for v1 (single backend replica per `docker-compose.prod.yml`). Mark the shared-store upgrade as a `ponytail:` follow-up comment — a distributed limiter is only needed when you run multiple backend replicas.

**Verify**: add `backend/tests/test_login_rate_limit.py` asserting: (a) 10 failed attempts from the same forwarded IP → 429; (b) a different forwarded IP is not throttled. `python -m pytest tests/test_login_rate_limit.py -q` → PASS.

### Step 3 (SEC-10): Move the contact email to config; verify no live weak account

- Change `contact.py:10` default to a non-personal placeholder (e.g. `""`) and require `CONTACT_TO_EMAIL` env; if unset, keep the existing `sent=false` mailto-fallback behavior. Add `CONTACT_TO_EMAIL` to `.env.example`.
- Verify no real account uses `password123`: check seed data and `backend/scripts/`. If a seeded/demo account exists with it, report it as an operator action to force-rotate (do not change production data yourself).

**Verify**: `cd backend && python -m pytest tests -q` → pass. `grep -rn "hotmail\|gmail\|outlook" backend/routers` → no personal address in source.

### Step 4: Full regression

**Verify**: `cd backend && python -m pytest tests -q` → all pass.

## Done criteria

- [ ] No `token` field in login/change-password response bodies; cookie still set.
- [ ] Rate limiter keys on the real client IP (via forwarded header) and prunes; new test passes.
- [ ] No personal email hardcoded in `backend/routers`; `CONTACT_TO_EMAIL` documented in `.env.example`.
- [ ] Report states whether any seeded account uses `password123` (operator rotation if so).
- [ ] `cd backend && python -m pytest tests -q` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- The client actually reads the body `token` (Step 1) — keep it, document why, and note as accepted risk instead.
- Cited lines don't match (drift).
- `X-Forwarded-For` is not set in the deployed proxy chain (would break IP keying) — verify against `nginx.conf:14` before trusting it.

## Maintenance notes

- Reviewer: confirm forwarded-IP parsing can't be spoofed to bypass limits (trust only the first hop from your known proxy).
- Follow-up: shared-store rate limiter when scaling to multiple backend replicas.
