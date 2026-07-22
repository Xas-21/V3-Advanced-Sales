# Batch O — Production go-live re-audit (2026-07-22)

> Read-only audit. No code changed. Stamped at commit `7d43062`.
> Method: `/improve` (5 parallel read-only subagents: security/auth/tenant, DB schema,
> WebSocket, features/correctness, perf/prod) + first-hand verification of every headline
> finding by the lead. Superpowers + Ponytail lens. Scope: whole-codebase go/no-go for a
> Docker VPS deploy that reuses the existing `as-postgres-v3` database.

This re-audits at a later commit than Batch I/J (2026-07-19). Several Batch I/J items are
confirmed still fixed; a few gaps remain or were never in scope. Verified findings only —
each was opened in the actual file, not taken from a subagent report on trust.

---

## Verdict

**Conditional GO.** The core system is genuinely production-grade: bcrypt-12 passwords,
HMAC-signed server-side revocable sessions, fail-closed multi-tenant scoping on reads AND
writes, a properly **normalized relational schema with real foreign keys and ON DELETE
rules**, parameterized SQL everywhere, a correct nginx `/ws` upgrade config, and a WebSocket
layer that is tenant-isolated. TypeScript compiles with **0 errors**; working tree clean.

It is **not** "everything perfect / zero latency." Ship only after the **P0** list below.
The rest are real but safe to schedule after launch.

---

## Answers to the owner's explicit questions

| Question | Answer |
|---|---|
| Any errors/warnings in the codebase? | `tsc --noEmit` = **0 errors**. ESLint runs under a warn-ratchet of **2319** tolerated warnings (brownfield debt, not failures). Build is sound. |
| Is it fast / no latency on refresh? | **Mostly, today.** But list endpoints return **whole tables with no pagination**, accounts list is **N+1**, and a property switch fires **~8 full-list fetches**. Fine at current data size; degrades as data grows (PERF-01/02/03). |
| Property scope — no cross-property leak on refresh? | **Yes for data reads/writes** (requests, accounts, CRM, tasks, taxes, rooms, venues, financials) — enforced server-side, fail-closed. Two gaps: **any logged-in user can create/edit/delete _properties_ and global templates** (SEC-01/02), and multi-property users can merge foreign rows into memory before the display filter (WS-05). |
| All features/pages/reports/exports work? | **Core booking + ledger + rates: yes.** Gaps: **public guest-feedback page 404s** (no backend route), **contract history is browser-only** (localStorage, no DB), **"PDF" exports are print-to-PDF / raw text** not real PDFs, CRM stage mapping is inconsistent across recovery vs live. |
| Security / other users / password reset logs them out? | **Admin resetting a user's password DOES force that user to re-login** (session_version bump + revoke, tested). **Self** change-password logs out other devices but keeps the current tab logged in (by design). |
| Payments / alerts / CRM / accounts / reports / export / contracts / sessions / auth? | Auth/sessions **solid**. Payments/financials **math lives on the frontend in floats** with no characterization tests (cent-drift risk). Alerts/feed broadcast errors are **swallowed silently**. |
| WebSocket connected on all pages? | **One shared socket** in `AS.tsx` stays connected across all authenticated pages and auto-derives `wss://` in production. **Contracts** and **Settings taxonomy** don't live-refresh for other users; open sockets aren't re-checked after logout/revoke (WS-01/02/04). |
| Relational data, no orphans, all FKs, normalized, no JSON blobs? | **Mostly relational with real FKs.** Honest caveats: **CRM pipeline is still one JSON blob per property**; contract templates + cxl reasons are payload-only; every entity also keeps a duplicate `payload` JSON copy; a few links (users→properties, crm_card_comments, promotion_id) have **no FK** → orphan risk. |
| Remove any "run dev" for production? | **Already correct.** `docker-compose.prod.yml` + `Dockerfile.frontend.prod` build static assets and serve via nginx; backend runs uvicorn **without** `--reload`. The `npm run dev` / `--reload` only live in the **dev** `docker-compose.yml` (expected). |

---

## Findings (verified, by leverage)

Confidence = HIGH unless noted. "Verified" = lead opened the cited code this session.

### P0 — fix before/at go-live

| # | Finding | Evidence | Impact | Effort |
|---|---------|----------|--------|--------|
| SEC-01 | **Any authenticated user can create/edit/delete _properties_.** `properties.py` POST/DELETE gated only by `require_user`; `properties` isn't in `_FLAT_WITH_PID`, so `_assert_write_access(None)` passes for anyone logged in. Prior IDOR plan 034 covered tenant rows, not the property root. | `routers/properties.py:14-22`, `data_access.py:61-69,450-451` | A sales user can delete another hotel — breaks tenancy at the root | S |
| SEC-02 | **Global config (contract templates, cxl reasons) writable/deletable by any user.** `upsert_payload_only` has no write check; delete resolves `pid=None` → passes. | `data_access.py:490-497`, `routers/contracts.py:23-33`, `routers/cxl_reasons.py:15-25` | Cross-tenant tamper of shared templates | S |
| PROD-03 | **Prod compose creates a fresh empty `as-postgres-data` volume.** Owner wants to reuse existing `as-postgres-v3` data (different volume name, user `neondb_owner`, db `neondb`). Naive `up` = empty app. | `docker-compose.prod.yml:8-24,82-84` vs `docker-compose.yml:4-26` | Empty DB / apparent data loss on first boot | S |
| PROD-06 / deploy | **Session cookie is `Secure`-only; prod compose serves plain HTTP on :80.** Over `http://VPS_IP` the browser drops the cookie → login "succeeds" but never sticks; WSS also needs TLS. Must terminate TLS (Traefik/Caddy/nginx + cert). | `routers/auth.py:138-141`, `docker-compose.prod.yml:66-67`, `nginx.conf:2` | No one can stay logged in without HTTPS | S (ops) |
| PROD-02 | **Migrations 010–013 (+011/012 billing tables) are not auto-applied.** `init_database()` only creates feed/chat/crm_comments. Existing DB is probably fine; a fresh/partial DB breaks ledger/rates at runtime. | `utils.py:853-864`, `migrations/011_*,012_*` | Billing/ledger 500s if not applied | S |

### P1 — soon after launch

| # | Finding | Evidence | Impact | Effort |
|---|---------|----------|--------|--------|
| BUG-01 | **Public guest-feedback page 404s** — frontend calls `/api/requests/feedback/{token}` + `/submit`; no backend route exists (helpers in `data_access.py` are unwired). | `RequestFeedbackPublicPage.tsx:73,188`; no match in `routers/*`; `data_access.py:614-708` | Guest feedback links are dead | S |
| SEC-03 | Upload GET/DELETE lack ownership/tenant check (IDOR on `folder/uuid.ext`). | `routers/uploads.py:136-193` | Cross-tenant file read/delete | M |
| SEC-04 | `GET /api/accounts/{id}/delete-impact` not tenant-scoped — leaks foreign counts. | `routers/accounts.py:99-118` | IDOR info leak | S |
| PERF-01 | Accounts list is N+1 (2 child queries per account). | `data_access.py:1151-1159,1190` | Latency grows with account count | M |
| PERF-02 | Core lists return full tables, no pagination (requests/accounts/flat). | `data_access.py:580-596,1180-1189,213-243` | Refresh cost scales linearly | L |
| DB-10 | No index on `sessions.token`, queried on **every** authenticated request. | `auth_db.py:166`, `001_normalized_schema.sql:375-376` | Seq-scan per request at scale | S |
| WS-04 | Open WebSocket never re-validates the session after logout/revoke. | `routers/ws.py:53-60` | Revoked tab keeps receiving events until it drops | M |
| FEAT-02 | CRM stage mapping disagrees across recovery vs live sync vs kanban. | `crm_recovery.py:10-18`, `crmStateModel.ts:338-344`, `CRM.tsx:506-514` | Cards land in different columns for different users | M |
| FEAT-06 | Money math is float end-to-end with **no** characterization tests. | `data_access.py:394-401,1427-1431`, `accountBalance.ts:17-23` | Cent-level drift on big totals/taxes | M |

### P2 — quality / correctness / DX (schedule later)

| # | Finding | Evidence |
|---|---------|----------|
| DB-01/PROD-09 | `001_normalized_schema.sql` drifts from runtime (`payload`/`idx` columns exist in runtime + `010` indexes but not in base DDL); two migration dirs; CI notes drift. Existing DB OK; from-scratch rebuild breaks. | `010_add_indexes.py:20-27`, `001_*.sql` (no `payload`/`idx` on child tables) |
| DB-06/08 | Missing FKs: `users.property_id`, `accounts.property_id`, `requests.promotion_id`, `requests.booker_contact_id` → orphan risk. | `001_normalized_schema.sql:21,71,133-134` |
| DB-07 | `crm_card_comments` has no FKs → orphan comments after card delete. | `013_crm_card_comments.py:18-29` |
| DB-02 | CRM pipeline is a JSON blob (`crm_state.leads/payload`), not normalized. | `001_*.sql:333-337`, `data_access.py:518-561` |
| DB-05 | Dual storage: typed columns **and** `payload` JSON on same rows → drift risk. | `data_access.py:997-1033` |
| WS-01/02 | Contracts + Settings taxonomy don't live-refresh for other users. | `routers/contracts.py` (no broadcast); `AS.tsx:1503-1504` `default: break` |
| WS-03/05 | WS URL ignores `VITE_API_BASE_URL` (split-host breaks WS); multi-property merge before display filter. | `websocket-client.ts:86-88`, `AS.tsx:1446-1455` |
| FEAT-01/04/05 | Contract history localStorage-only; "PDF" = raw text / print dialog; dashboard signed-count hardcoded `0`. | `contractsStore.ts:51-52,377-405`, `Reports.tsx:1552-1585`, `AS.tsx:2283-2284` |
| FEAT-03/08 | CRM persist + feed broadcast failures swallowed silently. | `AS.tsx:1856`, `feed.py:53-56` |
| SEC-05/07 | Login limiter is single-process; public contact form unthrottled + leaks SMTP error text. | `routers/auth.py:27-31`, `routers/contact.py:22-66` |
| SEC-09 | feed/chat/users routers rely on per-handler auth, not a router-level dependency (defense-in-depth). | `main.py:191-194` |
| DEBT | ~800 lines of legacy blob code in `utils.py` are dead unless `AS_KEEP_LEGACY_BLOBS=1`; `slowapi` dep unused. | `utils.py:100-534`, `requirements.txt` |

---

## What is genuinely solid (reviewed, no action)

- Passwords bcrypt-12; sessions HMAC-SHA256 with `compare_digest`; **no default `SESSION_SECRET`** (fails loud).
- Cookies `HttpOnly` + `Secure` + `SameSite=lax`, 7-day TTL; session revoke on password/role/permission change (tested).
- Tenant reads AND writes fail-closed via request-scoped user + `_tenant_scope()`/`_assert_write_access`.
- Normalized schema with FKs + correct `ON DELETE CASCADE`/`SET NULL`; request/account children batched (no N+1).
- Connection pool (min 2 / max 20). Security headers + CSP set. Rich text server-side sanitized. Upload cap 20 MB, extension allowlist, SVG blocked, path-traversal guarded.
- nginx `/ws` Upgrade + 24h read timeout; WS auto `wss://`, exponential-backoff reconnect, clean unmount; WS broadcasts tenant-scoped.
- Prod stack has **no** dev server / `--reload`.

---

## Recommended order

```
P0:  SEC-01 ─┐
     SEC-02 ─┤ (both ~S, same write-authz area)
     PROD-03 (map existing volume)  ─ deploy config
     PROD-06 (TLS at edge)          ─ deploy config
     PROD-02 (confirm 010–013 ran)  ─ one-time check
P1:  BUG-01 → SEC-03 → SEC-04 → DB-10 → PERF-01 → WS-04 → FEAT-02 → FEAT-06
P2:  everything above under "P2"
```

## Considered and rejected (Ponytail)

| Idea | Why |
|---|---|
| Rewrite auth/session | Already production-grade — no. |
| Normalize CRM blob before launch | Business-critical + large; plan as its own epic, not a blocker. |
| Full pagination refactor before launch | High blast radius; fine at current data size — schedule post-launch. |
| Drop legacy blob code now | Harmless (disabled by default); do it with a backup, not under launch pressure. |
| Add FK on every implicit id immediately | Needs orphan cleanup first; batch as DB-hardening. |

## Not audited / needs a live check

- `pip-audit` / `npm audit` (no network in audit env) — run on the deploy host.
- Whether the **existing** `as-postgres-v3` DB already has migrations 010–013 applied (very likely yes; confirm with a quick `\d account_ledger`).
