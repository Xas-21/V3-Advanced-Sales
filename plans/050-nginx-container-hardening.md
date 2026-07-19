# Plan 050: Harden nginx (headers/gzip/caching) and containers

> **Executor instructions**: Follow step by step. Run every verification. Honor "STOP conditions". Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- nginx.conf Dockerfile.backend Dockerfile.frontend.prod docker-compose.prod.yml`

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW–MED (a too-strict CSP can break inline styles — test the app after)
- **Depends on**: none
- **Category**: prod / security
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

The document the browser actually loads (HTML + JS bundle) is served by nginx with **no** security headers, **no** gzip, and **no** asset caching (PROD-04). The FastAPI CSP/HSTS/XFO headers only apply to `/api/*`, not the page — so the app shell has no clickjacking/MIME/CSP protection, ships uncompressed (recharts/gsap/etc.), and repeat visitors re-download immutable hashed assets. Separately, containers run as root and the frontend has no healthcheck (PROD-08).

## Current state

- `nginx.conf` — full file is 33 lines. `location /` (`:30-32`) is just `try_files $uri $uri/ /index.html;` with **no** `add_header`, no `gzip`, no `expires`; `server_tokens` not set; `client_max_body_size 32m` (`:7`) is present. `/api/` and `/ws` proxy blocks set forwarding headers correctly.
- `Dockerfile.backend` — 15 lines, no `USER` (runs as root), `CMD ["uvicorn", ...]`.
- `Dockerfile.frontend.prod` — nginx image (audit: no `USER`).
- `docker-compose.prod.yml` — `as-postgres` and `as-backend` have healthchecks; `as-frontend` (audit cites `:58-70`) has **none**.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Validate nginx | `docker run --rm -v ${PWD}/nginx.conf:/etc/nginx/conf.d/default.conf nginx:alpine nginx -t` | syntax ok |
| Build prod stack | `docker compose -f docker-compose.prod.yml build` | exit 0 |
| Check headers (after up) | `curl -I http://localhost/` | security headers + gzip present |

## Scope

**In scope**: `nginx.conf`, `Dockerfile.backend`, `Dockerfile.frontend.prod`, `docker-compose.prod.yml`.
**Out of scope**: the `/api/` and `/ws` proxy blocks (correct — leave); the FastAPI header middleware (keep for API responses).

## Steps

### Step 1: Add security headers, gzip, and caching to nginx

In `nginx.conf`:
- Add `server_tokens off;` and `gzip on;` (+ `gzip_types text/css application/javascript application/json image/svg+xml; gzip_min_length 1024;`).
- On `location /` add response headers: `X-Frame-Options "SAMEORIGIN"`, `X-Content-Type-Options "nosniff"`, `Referrer-Policy "strict-origin-when-cross-origin"`, and a `Content-Security-Policy` matching what the FastAPI middleware sets for the API (read `backend/main.py:47-55` for the existing CSP directives so the page policy is consistent). Add HSTS **only** if TLS terminates here (see STOP).
- Add a hashed-asset cache block:

```nginx
location ~* \.(js|css|woff2?|png|jpg|jpeg|gif|svg|ico)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
}
```

**Verify**: `nginx -t` passes; after `docker compose -f docker-compose.prod.yml up -d`, `curl -I http://localhost/` shows the headers and `curl -I -H "Accept-Encoding: gzip" http://localhost/assets/<some>.js` shows `Content-Encoding: gzip` and the immutable Cache-Control. Load the app in all three themes (Luxury/Light/Desert) — no CSP console violations, styles intact.

### Step 2: Run backend container as non-root

In `Dockerfile.backend`, add a non-root user and switch to it before `CMD`:

```dockerfile
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser
```

Ensure the uploads dir (`UPLOADS_DIR`, a mounted volume) is writable by `appuser` — set ownership or the volume's user in `docker-compose.prod.yml` if needed.

**Verify**: `docker compose -f docker-compose.prod.yml build` exits 0; after up, `docker compose -f docker-compose.prod.yml exec as-backend whoami` → `appuser`; uploads still work (POST a file, confirm 200).

### Step 3: Add a frontend healthcheck

In `docker-compose.prod.yml` under `as-frontend`, add a healthcheck hitting nginx, e.g. `test: ["CMD", "wget", "-qO-", "http://localhost/"]` (or `curl` if present in the image) with sensible interval/retries.

**Verify**: after up, `docker compose -f docker-compose.prod.yml ps` shows `as-frontend` as `healthy`.

## Done criteria

- [ ] `curl -I http://localhost/` shows XFO, nosniff, Referrer-Policy, CSP; `server_tokens off`.
- [ ] Static JS/CSS served gzipped with `Cache-Control: public, immutable`.
- [ ] Backend container runs as non-root (`whoami` = appuser) and uploads still work.
- [ ] `as-frontend` reports `healthy`.
- [ ] App works in all three themes with no CSP violations.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- TLS is terminated by an upstream load balancer, not this nginx — then set HSTS there, not here (adding HSTS at the wrong layer over HTTP can lock users out); note it and skip HSTS.
- CSP breaks the app's inline styles/GSAP — relax to include the needed `style-src`/`script-src` sources the app legitimately uses (mirror the API CSP), don't just drop CSP.
- Non-root user can't write the uploads volume — fix volume ownership; don't revert to root.

## Maintenance notes

- Keep the page CSP and the API CSP (`backend/main.py`) in sync when either changes.
- Reviewer: verify HSTS decision matches the actual TLS termination point.
