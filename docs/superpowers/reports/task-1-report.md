# Task 1 Report: Backend `account_ledger` collection + API

**Status:** DONE  
**Branch:** `feat/account-balance-billing`  
**Commit:** `cfd1aba` (`34ce491..cfd1aba`)  
**Message:** `feat(backend): account_ledger collection + API`

## Files changed

| Path | Action |
|------|--------|
| `backend/migrations/012_account_ledger.py` | Created |
| `backend/data_access.py` | Modified — `_FLAT_WITH_PID`, `_signed_ledger_amount` / `_extract_account_ledger`, `_EXTRACTORS`, `save_ledger_entry`, `transfer_allocation` |
| `backend/routers/account_ledger.py` | Created |
| `backend/main.py` | Modified — import + `include_router` |
| `backend/tests/test_account_ledger.py` | Created |

## Interfaces delivered

- `GET /api/account-ledger?accountId=&propertyId=` → list of entries
- `POST /api/account-ledger` → sign-normalized entry via `save_ledger_entry`
- `POST /api/account-ledger/{id}/transfer` body `{toRequestId}`
- `DELETE /api/account-ledger/{id}?propertyId=`
- `data_access.save_ledger_entry(data)` / `data_access.transfer_allocation(entry_id, to_request_id)`

Sign rules: deposit/collection → `+abs`; allocation/cl_charge/refund → `−abs`; adjustment → as-is.

## Commands run + output

### Migration

```text
docker compose exec as-backend python /app/migrations/012_account_ledger.py
```

```text
OK   CREATE TABLE IF NOT EXISTS account_ledger ( id TEXT PRIMARY KEY, property_id TEXT REFERENCES propert
OK   CREATE INDEX IF NOT EXISTS ix_account_ledger_account ON account_ledger (account_id)
OK   CREATE INDEX IF NOT EXISTS ix_account_ledger_property_updated ON account_ledger (property_id, update

ACCOUNT_LEDGER: 3 applied/verified, 0 skipped
```

(Pool shutdown thread warnings after exit are harmless / pre-existing migration noise.)

### Tests

Host `npm run test:backend` / local pytest were not usable (no project venv; host `python` is hermes without pytest). Ran inside Docker:

```text
docker compose exec as-backend python -m pytest tests/test_account_ledger.py -v
```

```text
tests/test_account_ledger.py::test_sign_normalization_and_filter PASSED
tests/test_account_ledger.py::test_transfer_repoints_request PASSED
======================== 2 passed, 13 warnings in 4.27s ========================
```

### Graphify

```text
graphify update .
```

Completed successfully (AST re-extract). Graph artifacts left unstaged (not part of Task 1 commit).

## Deviations

1. **Test fixture seeds stub requests** `R-x`, `R-old`, `R-new` before the plan’s verbatim test bodies run. Required because `account_ledger.request_id` FKs to `requests(id)`; without stubs, POSTs with those `requestId`s would fail. Fixture still mirrors `test_account_rates.py` (property + user + account + login); cookies are yielded as `ctx["cookies"]` to match the plan’s TestClient calls.
2. **Tests run via Docker** rather than host `npm run test:backend` (no local pytest/venv).

## Concerns

- Hardcoded stub request IDs in the test fixture are cleaned up after each run; collision risk with real data named `R-x` / `R-old` / `R-new` is low but non-zero.
- Running `as-backend` may need a process restart if the compose mount does not hot-reload router registration for live API traffic (pytest/TestClient imports fresh code and already passed).
- No frontend work (per scope).
