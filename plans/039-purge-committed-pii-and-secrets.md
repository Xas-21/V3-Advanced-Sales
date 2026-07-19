# Plan 039: Remove committed PII/credentials from the repo and rotate

> **Executor instructions**: Follow step by step. This plan removes sensitive data from version control. Confirm each verification before moving on. If a "STOP condition" occurs, stop and report. Update this plan's status row in `plans/README.md` when done.
>
> **This plan rewrites git history in its final step — that step requires explicit operator confirmation before running (see STOP conditions).**
>
> **Drift check (run first)**: `git ls-files | grep -Ei '\.csv$|backend/data/.*\.json$'`

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED (history rewrite affects all clones/forks; coordinate with the team)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `90c3a4c`, 2026-07-19
- **Executor status**: DONE for Steps 1–4 (landed in `68c59c1`). Step 5 (history scrub + credential rotation) remains an **operator** action — see completion report.

## Why this matters

Customer PII and user credentials are committed to the repository:

- `accounts_export (1).csv` — 96 contacts with **name, phone, email, address**.
- `requests_export (11).csv` — 170 rows of account names, revenue, guest counts.
- `backend/data/users.json` — **tracked**, contains `username`, `email`, and `password` fields (5 bcrypt hashes). Bcrypt is not plaintext, but committed password hashes are brute-forceable offline and this is legacy file-storage data the app no longer uses (the app is "fully relational, payload removed").
- `backend/data/*.json` also includes `financials.json`, `accounts.json`, `crm_state.json`, `requests.json` — business data + PII.

Anyone with repo (or fork/clone) access has this data. This is a data-protection blocker for production. Removal from `HEAD` is necessary but **not sufficient** — the data stays in history until scrubbed, and any real credentials must be rotated because a committed secret is burned.

## Current state

- Confirm the tracked sensitive files:
  - `git ls-files | grep -Ei '\.csv$'` → `accounts_export (1).csv`, `requests_export (11).csv`
  - `git ls-files | grep -Ei 'backend/data/.*\.json$'` → `accounts.json`, `crm_state.json`, `financials.json`, `properties.json`, `requests.json`, `room_types.json`, `taxes.json`, `users.json`, `venues.json`
- `.gitignore` already ignores `.env`/`.env.*` (good). It does **not** ignore the CSVs or `backend/data/*.json`.
- The runtime uses PostgreSQL (`as-postgres`), not these JSON files, per `AGENTS.md` ("fully relational, payload removed"). **Before deleting, confirm** nothing imports them at runtime:
  - `grep -rn "backend/data" backend --include=*.py` and `grep -rn "data/.*\.json" backend --include=*.py`
  - Scripts under `backend/scripts/` (e.g. `import_json_to_postgres.py`) may read them as one-time seed input — those are dev tools, not runtime, but note any references in your report.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| List tracked sensitive files | `git ls-files \| grep -Ei '\.csv$\|backend/data/.*\.json$'` | the files above |
| Check runtime references | `grep -rn "backend/data" backend --include=*.py` | note any hits |
| Backend tests | `cd backend && python -m pytest tests -q` | all pass after removal |

## Scope

**In scope**:
- `.gitignore` (add ignore rules)
- Removal from tracking of: both CSV files and `backend/data/*.json`
- `backend/data/*.example.json` or a documented seed path (optional — see Step 4)

**Out of scope**:
- Any `.py` runtime code (do not change how the app reads data — it uses Postgres).
- The relational migrations under `migrations/` and `backend/migrations/` (schema, not data — keep).
- Actual secret rotation is an **operator action** (Step 5) — you document it, you do not perform it.

## Steps

### Step 1: Confirm the files are unused at runtime

Run the grep commands in "Current state". If any **runtime** module (not a `scripts/` seed tool) imports `backend/data/*.json`, that is a STOP condition — report which file and stop; deletion would break the app.

**Verify**: `grep -rn "backend/data" backend --include=*.py` → only `scripts/` references (or none).

### Step 2: Add ignore rules

Append to `.gitignore`:

```
# Committed data exports / legacy file-storage seed data (PII) — never track
*.csv
backend/data/*.json
!backend/data/*.example.json
```

(If any `.csv` elsewhere is legitimately needed in-repo, narrow the rule to the two export files by exact path instead of `*.csv`.)

**Verify**: `git check-ignore "accounts_export (1).csv" backend/data/users.json` → both paths printed (ignored).

### Step 3: Untrack from HEAD (keep local copies)

```bash
git rm --cached "accounts_export (1).csv" "requests_export (11).csv"
git rm --cached backend/data/accounts.json backend/data/crm_state.json backend/data/financials.json backend/data/properties.json backend/data/requests.json backend/data/room_types.json backend/data/taxes.json backend/data/users.json backend/data/venues.json
```

**Verify**: `git ls-files | grep -Ei '\.csv$|backend/data/.*\.json$'` → **no output**.

### Step 4 (optional): Provide sanitized seed examples

If the JSON files are used as seed input by `backend/scripts/import_json_to_postgres.py`, add **schema-only** examples with fake data (e.g. `backend/data/users.example.json` with one fake user, no real hash) so onboarding still works. Do not copy any real row.

**Verify**: `cd backend && python -m pytest tests -q` → all pass (no test depended on the real data files).

### Step 5: Document required operator follow-up (do NOT execute history rewrite yourself)

In your completion report, instruct the operator to:
1. **Rotate every credential** that ever appeared in `backend/data/users.json` — force a password reset for those users (the repo already has `backend/scripts/migrate_db_passwords.py` and admin password-reset flow from plan 035). Treat the committed bcrypt hashes as compromised.
2. **Scrub git history** with `git filter-repo` (preferred) or BFG, removing the CSVs and `backend/data/*.json` from all history, then force-push and have all collaborators re-clone. Provide the exact `git filter-repo --path ... --invert-paths` invocation but do **not** run it — history rewrite requires explicit operator confirmation and team coordination.
3. If the repo is or was ever public/forked, assume the data is exfiltrated and notify per the org's data-protection process.

## Done criteria

- [x] `git ls-files | grep -Ei '\.csv$|backend/data/.*\.json$'` returns nothing.
- [x] `git check-ignore` confirms the paths are ignored.
- [x] `cd backend && python -m pytest tests -q` exits 0 (verified via `docker compose exec as-backend python -m pytest tests -q` — 63 passed).
- [x] Completion report contains the rotation + history-scrub instructions (Step 5), explicitly flagged as operator actions.
- [x] `plans/README.md` status row updated.

## STOP conditions

- A runtime (`.py`, not `scripts/`) module imports any `backend/data/*.json` — deleting would break the app.
- Removing the files breaks any test.
- You are about to run `git filter-repo`/BFG/force-push without explicit operator confirmation — STOP; that is Step 5's operator action, not yours.

## Maintenance notes

- After this lands, exports must go to a gitignored path or object storage, never the repo root.
- Reviewer: verify `.gitignore` rules, that no real data example was committed, and that Step 5 instructions are present and clear.
