# Neon Live Blob → Normalized `as-postgres-v3` Design

**Date:** 2026-07-22  
**Status:** Approved for planning (Approach 1)  
**Goal:** Convert the Neon live JSON-blob clone (`as-postgres-v3`) into the same relational schema as local `as-postgres-V2`, with **zero loss of live business data**, retarget the local app to V3, keep V2 untouched for rollback/compare, then ship the converted DB + new code to production so users see the same accounts/requests plus new features and better DB performance.

---

## 1. Context (verified 2026-07-22)

### 1.1 Local reference — `as-postgres-V2` (port `127.0.0.1:5433`)

- Container: `as-postgres-V2`, volume `as-postgres-v2-data`, role/db historically `neondb_owner` / `neondb`
- **41 public tables**, **46 foreign keys**
- Auth: relational `users` + `sessions` (bcrypt, httpOnly cookie `as_session`) via `backend/auth_db.py`
- DAL: `backend/data_access.py` (typed columns + `payload` jsonb, tenant scope, nested reassembly)
- Newer feature tables (beyond early 29-table notes): `chat_*`, `feed_*` (incl. poll votes / event RSVPs), `account_ledger`, `account_rates`, `crm_card_comments`
- Legacy blob tables still present but largely stale (`accounts_rows`≈1, `requests_rows`≈12)

### 1.2 Neon live source — project `AS-V3` (`divine-pond-24750200`)

- Branch with data: `import-2026-07-21…` (`br-odd-math-augpvrjy`) — pooler host matches user connection string
- Default `production` branch currently empty of app tables
- **5 tables, 0 FKs:**

| Table | Rows |
|---|---|
| `accounts_rows` | 411 |
| `requests_rows` | 393 |
| `app_collection_rows` | 83 |
| `app_collections` | 10 |
| `app_collection_maps` | 8 |

- `app_collection_rows` collections: users(7), properties(3), room_types(14), venues(17), taxes(27), financials(2), tasks(9), promotions(4)
- Users: 3 bcrypt hashes (len 60) + **4 plaintext** passwords — migration must preserve bcrypt and hash plaintext only
- No `sessions` table on Neon (auth will be relational after migrate; sessions created on next login)

### 1.3 Local Neon clone — `as-postgres-v3` (port `127.0.0.1:5434`)

- Container: `as-postgres-v3`, volume `as-postgres-v3-data`
- Already loaded from Neon via `pg_dump | psql` (counts match Neon exactly)
- Credentials (local only): user `neondb_owner`, db `neondb`, password `as_v3_local_clone`
- **Must not lose any of this data during conversion**

### 1.4 App wiring today

- `docker-compose.yml` service `as-postgres` → container `as-postgres-V2`, network alias `as-postgres`
- Backend `DATABASE_URL` points at that alias / host

---

## 2. Goals & non-goals

### Goals

1. Convert V3 in place to V2-equivalent **normalized schema** (tables, FKs, delete rules, indexes).
2. Migrate every live blob row into typed tables + child tables without deleting legacy blobs.
3. Retarget local Docker app to V3; **leave V2 running** as frozen reference/rollback.
4. Produce a verification report: table/FK/index parity vs V2 + row reconciliation vs Neon blobs.
5. Enable production cutover later: upload new code + converted V3 dump so users see no missing accounts/requests.

### Non-goals

- Do not delete, recreate, or truncate `as-postgres-V2` / its volume.
- Do not drop Neon or V3 legacy `*_rows` / `app_collection_*` during conversion.
- Do not require chat/feed/ledger/rates **row** parity with V2 (those features had no Neon data; empty tables with correct FKs are success).
- Do not mutate Neon cloud in this phase (local V3 only; production upload is a later operator step).

---

## 3. Architecture

```
┌────────────────────────────┐     keep forever (rollback)
│ as-postgres-V2 :5433       │◄──── schema/FK reference
│ normalized + sample/dev    │
└────────────────────────────┘

┌────────────────────────────┐
│ as-postgres-v3 :5434       │
│ 1) Neon blobs (source)     │
│ 2) + schema from V2        │
│ 3) + migrated typed rows   │
│ APP POINTS HERE ───────────┼──► as-backend / as-frontend
└────────────────────────────┘
```

**Cutover local:** change `DATABASE_URL` (and compose if needed) so backend resolves to `as-postgres-v3` / `:5434`, not V2.  
**Cutover live (later):** dump converted V3, restore on production host, deploy new frontend/backend build.

---

## 4. Conversion approach (Approach 1)

### Phase A — Backup

1. `pg_dump -Fc` of `as-postgres-v3` **before** any DDL/migration.
2. Store dump on host (e.g. `backups/as-postgres-v3-pre-normalize-YYYYMMDD.dump`).
3. Optional second dump after schema apply, before data migrate.

### Phase B — Schema parity from V2 (additive)

1. `pg_dump --schema-only` from V2 (public schema).
2. Apply to V3 with care:
   - Prefer creating missing tables/constraints/indexes only.
   - Never `DROP TABLE` legacy blob tables.
   - If dump includes drops, strip them or use a filtered apply script.
3. Ensure runtime tables that V2 gained via `utils._ensure_*` exist on V3 with identical FK semantics:
   - feed: posts, comments, reactions, poll_votes, event_rsvps
   - chat: conversations, participants, messages, invite_links
   - `crm_card_comments`, `account_ledger`, `account_rates`, `sessions`, `migration_orphans`
4. Confirm FK count/list matches V2 **before** loading business data into typed tables (empty normalized tables OK).

### Phase C — Data migration (lossless)

1. Use/extend `backend/migrations/002_migrate.py` (and follow-on migrations as needed) against `DATABASE_URL` → V3 only.
2. Rules:
   - **Read-only** on legacy tables.
   - Upsert into normalized tables; idempotent re-runs allowed.
   - `TRUNCATE` of **new** tables only is allowed for re-runs — **never** legacy.
   - Empty string → `NULL` for dates/timestamps/FK text fields.
   - Ghost FK refs → `migration_orphans` + skip/nullify per FK policy (do not delete source JSON).
   - Child IDs: deterministic when missing (`with_id` / uuid5 pattern already in migrator).
   - Composite `app_collection_rows.row_id` (`PROPERTY::SHORT`) → short id for PK where V2 expects short id.
   - Taxes: preserve per-property rates (PK must not collapse 27→6); match V2’s actual PK/unique definition.
   - Passwords: `bcrypt` identify/preserve; hash plaintext only; never mass-reset to `ChangeMe123!`.
   - `users.name` / `username`: name = display name; username = login handle (never swap).
   - Keep full document in `payload` jsonb on parent rows so DAL/frontend shape is unchanged.
3. Collections mapping (minimum):

| Source | Destination |
|---|---|
| `accounts_rows` + `contacts[]`/`activities[]` | `accounts`, `account_contacts`, `account_activities` |
| `requests_rows` + nested arrays/objects | `requests` + rooms/payments/agenda/logs/alerts/feedback/transportation/invoices |
| `app_collection_rows` users/properties/room_types→rooms/venues/taxes/financials/tasks/promotions | matching flat tables |
| `app_collections` contract_templates / cxl_reasons / … | typed or payload tables per V2 |
| `app_collection_maps` crm_state | `crm_state` |

4. Do **not** invent fake chat/feed history. Those tables stay empty with correct schema.

### Phase D — Point app at V3; keep V2

1. Update local env/compose so backend uses V3 (`host`/`port`/`alias`), e.g. second compose service `as-postgres-v3` + alias swap, **or** retarget `DATABASE_URL` to `127.0.0.1:5434` / container name on shared network.
2. Leave `as-postgres-V2` running and its volume intact.
3. Restart backend; smoke-test login + list endpoints.

### Phase E — Compare & gate

Must pass before any production upload:

1. **Schema:** table names present on V2 ⊆ V3 (V3 may still have legacy blobs).
2. **FKs:** same constraint set (table, column, foreign table, delete rule) as V2.
3. **Indexes:** critical unique/PK indexes present (sessions.token unique, usernames unique, etc.).
4. **Row reconciliation (live data):**

| Check | Expected |
|---|---|
| `accounts` vs `accounts_rows` | equal (minus documented orphans only) |
| `requests` vs `requests_rows` | equal (minus documented orphans only) |
| users / properties / rooms / venues / taxes / … | ≥ blob source; no silent drops |
| child tables | sum matches nested array walks (± orphans logged) |
| FK integrity queries | 0 dangling FKs |

5. **Functional smoke:** login (bcrypt users), account detail, request detail, CRM state load; DAL reassembled payload matches blob sample for ≥3 accounts and ≥3 requests.
6. Write a short compare report artifact under `docs/superpowers/` or `backups/`.

### Phase F — Production handoff (operator)

1. Dump converted V3 (`pg_dump -Fc`).
2. Deploy new app build + restore dump on live Postgres.
3. Users should see same request/account inventory; new features available; auth via `users`/`sessions`.
4. Rotate Neon credentials that were shared in chat after cutover.

---

## 5. Auth after conversion

- **Local V2 already has** full DB auth (`users` + `sessions`).
- **V3 after migrate:** users loaded from blob; `sessions` empty until login.
- Login path unchanged: `backend/routers/auth.py` → `auth_db.authenticate` / `create_session`.
- Plaintext Neon passwords must be hashed during migrate so login works with current `verify_password` (bcrypt-only).
- Cookie name remains `as_session` (`SESSION_COOKIE_NAME`); Cookie() params must keep `alias=`.

---

## 6. Known pitfalls (must handle)

| Pitfall | Mitigation |
|---|---|
| bcrypt wipe via `len < 20` heuristic | Use bcrypt identify / `$2` prefix; preserve 60-char hashes |
| username vs display name swap | Map `username`←handle, `name`←display |
| `users.name` NULL → SPA crash | Backfill name from username if missing; frontend already should guard |
| tax PK collapse | Match V2 PK (property-scoped) |
| composite `row_id` | Split `::` when needed |
| orphan property on accounts | Capture in `migration_orphans` (Neon had ≥1 orphan property ref) |
| migrator outdated vs V2 columns | Schema-clone first; extend migrator for `payload`, `assigned_property_ids`, etc. |
| FK add before orphan cleanup | Nullify/scrub then add/validate FKs |
| Accidental V2 wipe | Never target V2 DSN for migrate/truncate |

---

## 7. Success criteria

1. V3 still contains original blob tables with original row counts (411/393/83/10/8).
2. Normalized business tables hold a complete projection of that live data (reconciled).
3. FK list matches V2 (46 FKs or exact V2 list at compare time).
4. Local app runs against V3; V2 still up on `:5433`.
5. Sample UI paths show no missing accounts/requests vs pre-migrate blob counts.
6. Compare report signed off before production upload.

---

## 8. Risks & rollback

| Risk | Rollback |
|---|---|
| Bad migration on V3 | Restore `as-postgres-v3-pre-normalize-*.dump`; blobs untouched if additive path held |
| App misconfigured | Point `DATABASE_URL` back to V2 (`:5433`) |
| Production issue after upload | Restore production from pre-upload dump; keep V2 as semantic reference for schema |

---

## 9. Out of scope for implementation agents

- Redesigning DAL or frontend document shapes
- Deleting legacy blob tables
- Changing Neon cloud schema in this phase
- Inventing historical chat/feed data

---

## 10. Next step

Invoke **writing-plans** to produce `docs/superpowers/plans/2026-07-22-neon-blob-to-normalized-v3.md` with bite-sized tasks: backup, schema clone, migrator fixes, migrate, retarget compose, compare report, smoke tests.
