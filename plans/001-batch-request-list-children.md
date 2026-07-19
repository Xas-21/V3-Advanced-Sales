# Plan 001: Batch request-list child loads (kill 1+8N)

> **Executor instructions**: Follow step by step. Run every verification. If a STOP condition hits, stop and report — do not improvise. Update `plans/README.md` status when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- backend/data_access.py backend/routers/reqs.py backend/tests`
> On mismatch with excerpts below, STOP and report.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `90c3a4c`, 2026-07-14
- **Completed**: 2026-07-15 That is the main reason dashboard figures and refresh feel slow after login on the local Docker Postgres. Batching children into a few queries keeps the same JSON shape clients already expect.

## Current state

- `backend/data_access.py` — `list_requests` (~431–448) maps every row through `_row_to_request_dict`.
- `_row_to_request_dict` (~776–825) runs per-request queries for `request_rooms`, `request_agenda`, `request_logs`, `request_payments`, `request_alerts`, `request_transportation`, `request_invoices`, `request_feedback`.
- `backend/routers/reqs.py` exposes the list unchanged.
- Conventions: use `psycopg` pool via `_get_pool()`; return legacy camelCase payloads; tenant filter with `_filter_by_tenant`.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Backend tests | `npm run test:backend` | exit 0 |
| Optional timing | Hit `GET /api/requests?propertyId=…` with cookie before/after | fewer DB queries / faster TTFB |

## Scope

**In scope**
- `backend/data_access.py` (`list_requests`, helpers for batched children; keep `get_request` correct)
- Tests under `backend/tests/` (extend or add list shape assertion)

**Out of scope**
- Frontend KPI rewrite
- Full pagination of requests
- Changing public field names of request objects

## Steps

### Step 1: Prefetch children for an id list

Inside the same connection used by `list_requests`, after fetching parent rows:

1. Collect `ids = [r["id"] for r in parents]`.
2. For each child table, one query: `WHERE request_id = ANY(%s) ORDER BY request_id, idx`.
3. Build `dict[request_id, list|object]` maps.
4. Assemble each request dict from maps (same keys as `_row_to_request_dict` today).

Keep `get_request` either calling the batched path for one id or the existing single-row helper.

**Verify**: `npm run test:backend` → pass. Manually compare one request JSON before/after for rooms/agenda/logs keys.

### Step 2: Optional summary mode (if Step 1 alone is insufficient)

Add `fields=summary` query param on `GET /api/requests` that omits logs, invoices, feedback (and optionally agenda) for dashboard hydrate only. Default remains full payload.

**Verify**: default list still includes `logs` when present; `?fields=summary` omits heavy keys.

## Test plan

- Existing request tests still pass.
- New test: insert parent + 2 room payloads + 1 log; `list_requests(pid)` returns both children without raising; assert lengths.

## STOP conditions

- Child payload shape differs from current clients (BEO/OPTS break) → STOP.
- Cannot batch without holding a cursor across many queries incorrectly → STOP and report connection pattern.

## Done criteria

- `list_requests` does O(1) child queries per table, not O(N) per request.
- `npm run test:backend` exit 0.
