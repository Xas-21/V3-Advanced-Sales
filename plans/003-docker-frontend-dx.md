# Plan 003: Docker frontend DX (compose + Vite polling)

> **Executor instructions**: Smallest diff. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- docker-compose.yml vite.config.js Dockerfile.frontend`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `90c3a4c`, 2026-07-14
- **Completed**: 2026-07-15

## Why this matters

`as-frontend` runs `npm install` on every container start despite a named `node_modules` volume and image `npm ci`. Vite always enables 300ms polling even for host `npm run dev`. Backend may start before Postgres is healthy.

## Current state

- `docker-compose.yml:51-56` — `command: sh -c "npm install … && npm run dev …"`
- `docker-compose.yml:49-50` — backend `depends_on: as-postgres-v2` without health condition
- `vite.config.js:26-32` — `usePolling: true`, `interval: 300` always
- Volumes OK: `as-postgres-v2-data`, `as-frontend-node-modules`, `as-uploads-data`

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Recreate frontend | `docker compose up -d --force-recreate as-frontend` | starts without full npm install spam |
| Host vitest | `npm run test:frontend` | exit 0 |

## Scope

**In scope**: `docker-compose.yml`, `vite.config.js`
**Out of scope**: Changing DB credentials, rewriting Dockerfiles unless install-on-empty is needed

## Steps

### Step 1: Frontend command

Set `as-frontend` command to `npm run dev -- --host 0.0.0.0` (or image CMD). Document in a one-line comment: reinstall with `docker compose run --rm as-frontend npm ci` when lockfile changes.

### Step 2: Healthy postgres dependency

```yaml
depends_on:
  as-postgres-v2:
    condition: service_healthy
```

for `as-backend`.

### Step 3: Gate polling

In `vite.config.js`, `usePolling: process.env.CHOKIDAR_USEPOLLING === 'true'` (or `VITE_USE_POLLING`). Set that env only on `as-frontend` in compose. Raise interval to `1000` when polling is on.

**Verify**: Host `npm run dev` does not enable polling unless env set. Compose frontend still picks up file edits on Windows bind mount.

## STOP conditions

- HMR completely dead inside Docker after change → restore polling via env, do not hardcode off forever.

## Done criteria

- Compose frontend start logs show no full dependency download on routine restart.
- Backend waits for healthy Postgres.
