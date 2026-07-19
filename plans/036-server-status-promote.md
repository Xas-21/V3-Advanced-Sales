# Plan 036: Server status / health promote (ops)

> **Executor instructions**: Ponytail — extend existing `/api/health`; don’t add a new monitoring stack. Update README + Notion `[036]` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- backend/main.py docker-compose.yml`

## Status

- **Status**: DONE (2026-07-18)
- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `90c3a4c`, 2026-07-16
- **Notion**: `[036] Server status promote (ops/health)`

## Why this matters

**Plain language:** Docker and operators need a clear “is the API up and can it talk to the database?” signal — not just a blank OK.

**Technical:** `GET /api/health` in `main.py` ~132–138 returns `status` + `database_connected`. Compose already healthchecks the backend. Promote clarity: optional `ready` vs `live`, app version/git sha if cheap, consistent HTTP codes (503 when DB down if desired).

## Current state

```python
@app.get("/api/health")
def health():
    db_ok = check_database_health() if storage_mode() == "postgres" else None
    return {
        "status": "ok" if db_ok is not False else "degraded",
        "database_connected": db_ok,
    }
```

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Manual | `curl -s http://localhost:8000/api/health` | JSON with clear fields |
| Compose | `docker ps` shows healthy | healthy |

## Scope

**In scope**: `backend/main.py` health payload (+ optional status code); document in AGENTS.md; adjust compose healthcheck only if needed  
**Out of scope**: Prometheus/Grafana; auth on health (keep public for probes)

## Steps

### Step 1: Enrich payload

Return at least: `status` (`ok`|`degraded`|`error`), `database_connected`, `storage_mode`, optional `version` from env.

### Step 2: HTTP semantics (Ponytail pick one)

Either keep 200 always with `status` field (current), **or** return 503 when DB required and down. Document choice; update compose if using 503.

### Step 3: Smoke test

Assert `/api/health` keys in `test_api_full.py` (already hits health — extend asserts).

## Checklist

- [x] Health JSON documents live/ready (or ok/degraded) clearly
- [x] DB connectivity reflected accurately
- [x] Docker healthcheck still green when API healthy
- [x] Test asserts key fields
- [x] AGENTS.md one-liner for operators
- [x] README + Notion → Done (after human confirm)

## HTTP semantics (chosen)

Return **503** when not ready (Postgres required and unreachable, or `storage_mode` is `unavailable`). Keep **200** when ready. Compose healthcheck unchanged (`urlopen` already fails on non-2xx).

## STOP conditions

- Adding full APM/metrics platform → STOP.
