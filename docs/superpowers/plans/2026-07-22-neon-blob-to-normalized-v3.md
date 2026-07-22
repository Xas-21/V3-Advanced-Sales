# Neon Blob → Normalized `as-postgres-v3` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Neon live JSON-blob clone in `as-postgres-v3` into the same relational schema as `as-postgres-V2` with zero loss of live business data, point the local Docker app at V3, keep V2 running untouched, and produce a compare report proving table/FK/row parity before production upload.

**Architecture:** Approach 1 — backup V3 blobs → additive schema-clone from V2 → upgrade lossless migrator so every DAL-read path gets typed columns **and** `payload`/`idx` where V2 expects them → migrate → retarget `DATABASE_URL`/compose to V3 → verify. Never delete legacy `*_rows` / `app_collection_*`. Never truncate or recreate V2.

**Tech Stack:** Docker Postgres 18, `pg_dump`/`psql`, Python `psycopg` + `bcrypt` (`backend/migrations/002_migrate.py`, `003_verify.py`), FastAPI app already on `data_access.py` / `auth_db.py`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-neon-blob-to-normalized-v3-design.md`
- Zero loss of V3 Neon clone data (411 accounts, 393 requests, 83 collection rows, 10 collections, 8 maps)
- Never `DROP`/`TRUNCATE` legacy blob tables on V3
- Never delete/recreate `as-postgres-V2` or volume `as-postgres-v2-data`
- Target schema = **live V2** (41 tables / 46 FKs as of 2026-07-22), not the older 29-table notes
- DAL reads request/account **children via `payload` + `ORDER BY idx`** — migrator must write those or the UI will show empty contacts/rooms
- Passwords: preserve bcrypt (`$2…`); hash plaintext only; never mass-reset
- Empty feature tables OK (chat/feed/ledger/rates/comments) if FKs match V2
- Do not mutate Neon cloud in this phase
- Pre-checked: merge `fc51b4f` (account profile tabs) is frontend-only — **no schema conflict**

## File map

| File | Responsibility |
|------|----------------|
| `backups/as-postgres-v3-pre-normalize-*.dump` | Pre-migration safety dump (host) |
| `scripts/schema_clone_v2_to_v3.py` (new) or one-shot shell | Additive schema apply V2→V3 |
| `backend/migrations/002_migrate.py` | Lossless blob→normalized (upgrade for payload/idx/bcrypt/GIS cols) |
| `backend/migrations/003_verify.py` | Row + FK reconciliation vs blobs |
| `scripts/compare_v2_v3_schema.py` (new) | Table/FK/index parity report V2 vs V3 |
| `docker-compose.yml` + `.env` | Point app at V3; keep V2 running |
| `docs/superpowers/reports/2026-07-22-v2-v3-compare.md` | Final compare artifact |

## Preconditions (already done)

- `as-postgres-v3` on `127.0.0.1:5434`, volume `as-postgres-v3-data`, user/db `neondb_owner`/`neondb`, password `as_v3_local_clone`
- Blob counts verified: accounts_rows=411, requests_rows=393
- `as-postgres-V2` on `127.0.0.1:5433`, 46 FKs, left running

---

### Task 1: Pre-flight backup + freeze DSN targets

**Files:**
- Create: `backups/` (gitignored if not already)
- Create: `backups/README.md` note (optional one-liner: local dumps only)

**Interfaces:**
- Produces: host file `backups/as-postgres-v3-pre-normalize-YYYYMMDD_HHMM.dump`
- Consumes: container `as-postgres-v3`

- [ ] **Step 1: Confirm blob counts unchanged**

```powershell
docker exec as-postgres-v3 psql -U neondb_owner -d neondb -c "SELECT 'accounts_rows' t, count(*) FROM accounts_rows UNION ALL SELECT 'requests_rows', count(*) FROM requests_rows UNION ALL SELECT 'app_collection_rows', count(*) FROM app_collection_rows;"
```

Expected: 411 / 393 / 83

- [ ] **Step 2: Custom-format dump to host**

```powershell
New-Item -ItemType Directory -Force -Path backups | Out-Null
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
docker exec as-postgres-v3 pg_dump -U neondb_owner -d neondb -Fc -f "/tmp/v3_pre_$ts.dump"
docker cp "as-postgres-v3:/tmp/v3_pre_$ts.dump" "backups/as-postgres-v3-pre-normalize-$ts.dump"
docker exec as-postgres-v3 rm "/tmp/v3_pre_$ts.dump"
Get-Item "backups/as-postgres-v3-pre-normalize-$ts.dump"
```

Expected: file size multi‑MB (not empty).

- [ ] **Step 3: Write DSN constants for this work (do not point app yet)**

Document in the compare report draft (or shell env for later tasks only):

```text
V2_DSN  = postgresql://neondb_owner:<V2_PASSWORD>@127.0.0.1:5433/neondb
V3_DSN  = postgresql://neondb_owner:as_v3_local_clone@127.0.0.1:5434/neondb
```

Resolve V2 password from existing `.env` / volume (do **not** print secrets into the plan commit). All migrate/verify commands in later tasks must use **V3_DSN only**.

- [ ] **Step 4: Commit backup path hygiene only if adding `.gitignore` entry**

If `backups/` is not ignored:

```gitignore
backups/*.dump
```

```powershell
git add .gitignore
git commit -m "chore: ignore local postgres dump backups"
```

Do **not** commit dump files.

---

### Task 2: Additive schema clone V2 → V3

**Files:**
- Create: `scripts/schema_clone_v2_to_v3.py`
- Touch: V3 database only (DDL)

**Interfaces:**
- Produces: all V2 public tables/FKs/indexes that V3 lacks; **no** drops of blob tables
- Consumes: live V2 schema via `pg_dump --schema-only` or information_schema

- [ ] **Step 1: Dump schema-only from V2 inside Docker**

```powershell
docker exec as-postgres-V2 pg_dump -U neondb_owner -d neondb --schema-only --no-owner --no-acl -f /tmp/v2_schema.sql
docker cp as-postgres-V2:/tmp/v2_schema.sql backups/v2_schema_only.sql
```

- [ ] **Step 2: Strip destructive statements**

Create `scripts/schema_clone_v2_to_v3.py` that:

1. Reads `backups/v2_schema_only.sql`
2. Removes / skips any `DROP` statements
3. Rewrites `CREATE TABLE` → safe apply: either keep `IF NOT EXISTS` or catch duplicate_table
4. Applies via `psycopg` to `V3_DSN` in dependency order (tables without FKs first, then FKs)
5. Prints counts: tables created, FKs created, indexes created, skipped-already-exist

Minimal core of the apply loop:

```python
#!/usr/bin/env python3
"""Apply V2 schema-only dump to V3 without dropping legacy blob tables."""
import os, re, sys
import psycopg

V3 = os.environ["V3_DSN"]
src = sys.argv[1] if len(sys.argv) > 1 else "backups/v2_schema_only.sql"
sql = open(src, encoding="utf-8").read()
# Remove DROP statements entirely
sql = re.sub(r"(?is)^\s*DROP\s+[^;]+;", "", sql)
# Prefer IF NOT EXISTS on CREATE TABLE
sql = re.sub(r"(?i)CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)", "CREATE TABLE IF NOT EXISTS ", sql)
sql = re.sub(r"(?i)CREATE\s+UNIQUE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)", "CREATE UNIQUE INDEX IF NOT EXISTS ", sql)
sql = re.sub(r"(?i)CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)", "CREATE INDEX IF NOT EXISTS ", sql)

with psycopg.connect(V3, autocommit=True) as conn:
    with conn.cursor() as cur:
        for stmt in [s.strip() for s in sql.split(";") if s.strip()]:
            if stmt.upper().startswith("DROP"):
                continue
            try:
                cur.execute(stmt)
            except Exception as e:
                # duplicate_object / already exists → OK; others re-raise
                msg = str(e).lower()
                if "already exists" in msg:
                    print("SKIP", stmt[:80].replace("\n", " "))
                else:
                    raise
print("schema clone apply finished")
```

- [ ] **Step 3: Run clone against V3**

```powershell
$env:V3_DSN = "postgresql://neondb_owner:as_v3_local_clone@127.0.0.1:5434/neondb"
python scripts/schema_clone_v2_to_v3.py backups/v2_schema_only.sql
```

- [ ] **Step 4: Confirm blobs still intact + FKs exist**

```powershell
docker exec as-postgres-v3 psql -U neondb_owner -d neondb -c "SELECT count(*) FROM accounts_rows;" -c "SELECT count(*) AS fk_count FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND table_schema='public';" -c "\dt"
```

Expected: `accounts_rows` still 411; FK count approaching 46 (may be 0→46 after constraints apply); blob tables still listed.

- [ ] **Step 5: Commit script only**

```powershell
git add scripts/schema_clone_v2_to_v3.py
git commit -m "chore: add additive V2→V3 schema clone helper"
```

---

### Task 3: Upgrade migrator for current DAL (payload/idx/bcrypt/GIS)

**Files:**
- Modify: `backend/migrations/002_migrate.py`
- Modify: `backend/migrations/003_verify.py` (extend checks)
- Test: run migrator against V3 in Task 4; unit-style asserts via a small self-check in Step 4

**Interfaces:**
- Consumes: V3 blob tables (read-only)
- Produces: upserts into normalized tables matching V2 column sets
- Must write `payload` jsonb + `idx` int for: `account_contacts`, `account_activities`, all `request_*` child tables, and `payload` for `users`, `properties`, `rooms`, `venues`, `taxes`, `financials`, `tasks`, `promotions`, `crm_state`
- Must NOT truncate blob tables; `reset()` may truncate **new** tables only (already listed in `NEW_TABLES`) — extend list for chat/feed/ledger/rates/comments empty tables if present so re-runs stay clean

- [ ] **Step 1: Add helpers at top of `002_migrate.py`**

```python
import bcrypt

def empty_to_none(v):
    if v is None or v == "" or v == "null":
        return None
    return v

def ensure_bcrypt(password: str | None) -> str:
    p = password or ""
    if isinstance(p, str) and p.startswith("$2") and len(p) >= 50:
        return p  # already bcrypt
    # plaintext or unknown → hash
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

def short_id(row_id: str | None, payload_id: str | None) -> str | None:
    """app_collection_rows.row_id may be PROPERTY::SHORT."""
    if payload_id:
        return str(payload_id)
    if not row_id:
        return None
    return row_id.split("::", 1)[-1]
```

- [ ] **Step 2: Fix users upsert**

When building user rows:

```python
        uname = u.get("username")
        display = u.get("name") or uname or "?"
        rows.append({
            "id": u.get("id"),
            "username": uname,
            "password": ensure_bcrypt(u.get("password")),
            "name": display,
            "email": u.get("email"),
            "role": u.get("role", "Sales Executive"),
            "status": (u.get("status") or "active"),
            "property_id": empty_to_none(u.get("propertyId")),
            "permission_grants": json.dumps(u.get("permissionGrants", [])),
            "permission_revokes": json.dumps(u.get("permissionRevokes", [])),
            "stats": json.dumps(u.get("stats", {})),
            "session_version": int(u.get("sessionVersion", 0) or 0),
            "avatar": u.get("avatar"),
            "phone": u.get("phone"),
            "assigned_property_ids": json.dumps(u.get("property_ids") or u.get("assignedPropertyIds") or []),
            "payload": json.dumps(u),
        })
```

Upsert column list must include `phone`, `assigned_property_ids`, `payload`.

- [ ] **Step 3: Properties + flat collections — store full `payload`**

For properties and each flat collection row, set `"payload": json.dumps(p)` (or `Json` via psycopg) and include `payload` in the upsert cols. Keep typed columns as today.

- [ ] **Step 4: Accounts — nullify bad user FKs; children need payload+idx**

Before upserting accounts:

```python
            "owner_user_id": empty_to_none(p.get("ownerUserId")),
            "created_by_user_id": empty_to_none(p.get("createdByUserId")),
            "property_id": empty_to_none(p.get("propertyId")),
```

After users exist, `filter_fk` owner/created_by against `valid_user_ids` (SET NULL / orphan log — do not drop account).

For each contact/activity:

```python
            crows.append({
                "id": ct.get("id"),
                "account_id": p.get("id"),
                # ... typed fields ...
                "payload": json.dumps(ct),
                "idx": i,
            })
```

Same for activities with `idx`.

- [ ] **Step 5: Requests — GIS/paidAmount columns + children payload/idx**

Add to parent request row:

```python
            "paid_amount": p.get("paidAmount"),
            "beo_notes": p.get("beoNotes"),
            "gis_billing_instructions": p.get("gisBillingInstructions"),
            "gis_expected_arrival_time": p.get("gisExpectedArrivalTime"),
            "gis_operational_notes": p.get("gisOperationalNotes"),
```

Remove nonexistent `updated_at_ts` from upsert cols (V2 has `updated_at` only).

For each child array element `x` at index `i`:

```python
            rm.append({
                "id": x.get("id"),
                "request_id": rid,
                # typed fields as today...
                "payload": json.dumps(x),
                "idx": i,
            })
```

For invoices, keep typed inv columns **and**:

```python
            rinv.append({
                "request_id": rid,
                "agreement": json.dumps(inv.get("agreement")),
                "inv1": json.dumps(inv.get("inv1")),
                "inv2": json.dumps(inv.get("inv2")),
                "inv3": json.dumps(inv.get("inv3")),
                "payload": json.dumps(inv),
                "idx": 0,
            })
```

For feedback, store full feedback object in `payload` (DAL reads `request_feedback.payload`).

- [ ] **Step 6: CRM state — full payload**

```python
        full = r["payload"] or {}
        crmrows.append({
            "property_id": r["map_key"],
            "leads": json.dumps(full.get("leads", [])),
            "payload": json.dumps(full),
        })
```

`filter_fk` crm `property_id` against `valid_property_ids` → orphans table if map_key has no property (Neon had extra map keys).

- [ ] **Step 7: Self-check function (runnable without pytest)**

Append to `002_migrate.py`:

```python
def _self_check_password_helper():
    assert ensure_bcrypt("$2b$12$" + "a" * 53).startswith("$2")
    h = ensure_bcrypt("plaintext-demo")
    assert h.startswith("$2") and len(h) >= 50
    assert short_id("P1::RTabc", None) == "RTabc"
    assert empty_to_none("") is None

if __name__ == "__main__":
    _self_check_password_helper()
    res = migrate()
    ...
```

Run:

```powershell
$env:DATABASE_URL = "postgresql://neondb_owner:as_v3_local_clone@127.0.0.1:5434/neondb"
python -c "from backend.migrations import migrate_mod"  # or run file directly
```

Prefer:

```powershell
cd backend
$env:DATABASE_URL = "postgresql://neondb_owner:as_v3_local_clone@127.0.0.1:5434/neondb"
python migrations/002_migrate.py
```

(Do full migrate in Task 4; here first run helpers only if you split — otherwise fold helper check into Task 4 Step 1.)

- [ ] **Step 8: Commit migrator upgrade before full data run**

```powershell
git add backend/migrations/002_migrate.py backend/migrations/003_verify.py
git commit -m "fix: migrator writes payload/idx and preserves bcrypt for V3 clone"
```

---

### Task 4: Run lossless migration on V3 + verify vs blobs

**Files:**
- Run: `backend/migrations/002_migrate.py`, `backend/migrations/003_verify.py`
- Create: `docs/superpowers/reports/2026-07-22-v3-migration-counts.md` (paste counts)

- [ ] **Step 1: Re-confirm backup exists; run migrate against V3 only**

```powershell
$env:DATABASE_URL = "postgresql://neondb_owner:as_v3_local_clone@127.0.0.1:5434/neondb"
python backend/migrations/002_migrate.py
```

Expected: printed counts; `accounts`≈411, `requests`≈393, `users`=7, `properties`=3; `migration_orphans` may be >0 (document).

- [ ] **Step 2: Blob tables untouched**

```powershell
docker exec as-postgres-v3 psql -U neondb_owner -d neondb -c "SELECT count(*) FROM accounts_rows; SELECT count(*) FROM requests_rows;"
```

Expected: still 411 / 393

- [ ] **Step 3: Run `003_verify.py`**

```powershell
$env:DATABASE_URL = "postgresql://neondb_owner:as_v3_local_clone@127.0.0.1:5434/neondb"
python backend/migrations/003_verify.py
```

Expected: parent counts `OK` (or DIFF only with documented orphans); FK integrity all `broken=0`.

- [ ] **Step 4: DAL smoke via SQL (payload present)**

```sql
SELECT count(*) FROM account_contacts WHERE payload IS NULL OR payload = '{}'::jsonb;
SELECT count(*) FROM request_rooms WHERE payload IS NULL OR payload = '{}'::jsonb;
SELECT count(*) FROM users WHERE password LIKE '$2%';
SELECT count(*) FROM users WHERE password NOT LIKE '$2%';
```

Expected: near-zero empty payloads on contacts/rooms that had nested data; all users bcrypt; second count 0.

- [ ] **Step 5: Write counts into report markdown + commit report**

```powershell
git add docs/superpowers/reports/2026-07-22-v3-migration-counts.md
git commit -m "docs: record V3 blob→normalized migration counts"
```

---

### Task 5: Retarget Docker app to V3; keep V2 running

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env` (local only — never commit secrets)

**Interfaces:**
- Produces: backend connects to `as-postgres-v3` via network alias `as-postgres` (or explicit host)
- V2 remains on `:5433` with volume intact

- [ ] **Step 1: Add V3 as compose service; demote V2 to reference-only**

In `docker-compose.yml`:

1. Rename current `as-postgres` service key to `as-postgres-v2-ref` (or keep container_name `as-postgres-V2`) — **remove** network alias `as-postgres` from V2.
2. Add:

```yaml
  as-postgres:
    image: postgres:18-alpine
    container_name: as-postgres-v3
    environment:
      - POSTGRES_USER=neondb_owner
      - POSTGRES_PASSWORD=${V3_DB_PASSWORD:-as_v3_local_clone}
      - POSTGRES_DB=neondb
    ports:
      - 127.0.0.1:5434:5432
    volumes:
      - as-postgres-v3-data:/var/lib/postgresql
    networks:
      default:
        aliases:
          - as-postgres
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U neondb_owner -d neondb"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  as-postgres-v2-ref:
    image: postgres:18-alpine
    container_name: as-postgres-V2
    # keep existing env/volume/port 5433 — NO alias as-postgres
    ports:
      - 127.0.0.1:5433:5432
    volumes:
      - as-postgres-v2-data:/var/lib/postgresql
    restart: unless-stopped
```

3. Volumes section: ensure both `as-postgres-v2-data` and `as-postgres-v3-data` exist.

**Important:** Because V2/V3 containers already exist, prefer `docker compose up -d` without recreating volumes. If compose fights existing containers, stop/start carefully — **never** `docker compose down -v`.

- [ ] **Step 2: Point `.env` DATABASE_URL at V3 credentials**

```env
DATABASE_URL=postgresql://neondb_owner:as_v3_local_clone@as-postgres:5432/neondb
```

- [ ] **Step 3: Restart backend only; confirm health**

```powershell
docker compose up -d as-backend
docker compose logs --tail 50 as-backend
curl http://127.0.0.1:8000/api/health
```

Expected: `ready` true against V3.

- [ ] **Step 4: Confirm V2 still up**

```powershell
docker ps --format "table {{.Names}}\t{{.Ports}}" | Select-String postgres
docker exec as-postgres-V2 pg_isready -U neondb_owner -d neondb
```

- [ ] **Step 5: Commit compose (not `.env`)**

```powershell
git add docker-compose.yml .env.example
git commit -m "chore: point compose app DB at as-postgres-v3; keep V2 as reference"
```

Update `.env.example` comments to document V2 ref port 5433 vs app V3.

---

### Task 6: Schema compare V2 vs V3 + functional smoke

**Files:**
- Create: `scripts/compare_v2_v3_schema.py`
- Create: `docs/superpowers/reports/2026-07-22-v2-v3-compare.md`

- [ ] **Step 1: Write compare script**

```python
#!/usr/bin/env python3
"""Compare public tables + FK definitions between V2 and V3."""
import os, json
import psycopg
from psycopg.rows import dict_row

V2 = os.environ["V2_DSN"]
V3 = os.environ["V3_DSN"]

Q_TABLES = """
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1
"""
Q_FKS = """
SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name=tc.constraint_name
WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
ORDER BY 1,2,3
"""

def load(dsn):
    with psycopg.connect(dsn, row_factory=dict_row) as c:
        with c.cursor() as cur:
            cur.execute(Q_TABLES); tables = {r["table_name"] for r in cur.fetchall()}
            cur.execute(Q_FKS)
            fks = {(r["table_name"], r["column_name"], r["foreign_table"], r["delete_rule"]) for r in cur.fetchall()}
    return tables, fks

t2, f2 = load(V2)
t3, f3 = load(V3)
# V3 may keep legacy blob tables — required set is V2 tables ⊆ V3
missing_tables = sorted(t2 - t3)
extra_ok = sorted(t3 - t2)  # e.g. still has same blobs
missing_fks = sorted(f2 - f3)
extra_fks = sorted(f3 - f2)
print("V2 tables", len(t2), "V3 tables", len(t3))
print("MISSING TABLES ON V3", missing_tables)
print("V3-only tables", extra_ok)
print("V2 FKs", len(f2), "V3 FKs", len(f3))
print("MISSING FKS ON V3", missing_fks)
print("EXTRA FKS ON V3", extra_fks)
assert not missing_tables, missing_tables
assert not missing_fks, missing_fks
print("SCHEMA COMPARE OK")
```

- [ ] **Step 2: Run compare**

```powershell
$env:V2_DSN = "postgresql://neondb_owner:<V2_PASSWORD>@127.0.0.1:5433/neondb"
$env:V3_DSN = "postgresql://neondb_owner:as_v3_local_clone@127.0.0.1:5434/neondb"
python scripts/compare_v2_v3_schema.py
```

Expected: `SCHEMA COMPARE OK` (V3 may list extra legacy blob tables — allowed).

- [ ] **Step 3: API smoke (login + lists)**

Using a known bcrypt user from Neon (`Abdullah` or `Sultan.jan`):

```powershell
# login
curl -c cookies.txt -X POST http://127.0.0.1:8000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"Abdullah\",\"password\":\"<real>\"}"
# lists (cookie auth)
curl -b cookies.txt http://127.0.0.1:8000/api/accounts
curl -b cookies.txt http://127.0.0.1:8000/api/requests
```

Expected: login 200; accounts length ≈411 (tenant filter may reduce for non-admin); requests ≈393 for admin/global.

Plaintext-migrated users (`Abdelraheem`, `Alsaif`, `Hishma`, `Test`) must login with their **original plaintext** (now stored as bcrypt).

- [ ] **Step 4: Spot-check 3 accounts + 3 requests**

For three random ids from `accounts_rows` / `requests_rows`, compare nested contact/room counts:

```sql
-- example
SELECT id, jsonb_array_length(payload->'contacts') FROM accounts_rows WHERE id = '...';
SELECT count(*) FROM account_contacts WHERE account_id = '...';
```

Expected: equal (unless orphan-logged).

- [ ] **Step 5: Write final compare report**

`docs/superpowers/reports/2026-07-22-v2-v3-compare.md` must include:

- Table counts V2 vs V3
- FK counts + any diffs
- Blob vs normalized row reconciliation
- Orphan summary
- Login smoke result
- Explicit: V2 still running on `:5433`

- [ ] **Step 6: Commit scripts + report**

```powershell
git add scripts/compare_v2_v3_schema.py docs/superpowers/reports/2026-07-22-v2-v3-compare.md
git commit -m "docs: V2 vs V3 schema/data compare after Neon normalize"
```

---

### Task 7: Production handoff package (no cloud mutate)

**Files:**
- Create: `backups/as-postgres-v3-normalized-YYYYMMDD.dump` (local)
- Create: `docs/superpowers/reports/2026-07-22-production-cutover-checklist.md`

- [ ] **Step 1: Dump converted V3**

```powershell
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
docker exec as-postgres-v3 pg_dump -U neondb_owner -d neondb -Fc -f "/tmp/v3_norm_$ts.dump"
docker cp "as-postgres-v3:/tmp/v3_norm_$ts.dump" "backups/as-postgres-v3-normalized-$ts.dump"
```

- [ ] **Step 2: Cutover checklist markdown**

Include:

1. Take production backup
2. Deploy new app build (includes merge-tabs + normalized DAL)
3. Restore `as-postgres-v3-normalized-*.dump` to live Postgres
4. Point live `DATABASE_URL` at restored DB
5. Smoke login + account/request counts vs pre-cutover Neon blob counts
6. Rotate Neon credentials that were shared in chat
7. Keep local V2 as rollback reference until sign-off

- [ ] **Step 3: Commit checklist only (not dump)**

```powershell
git add docs/superpowers/reports/2026-07-22-production-cutover-checklist.md
git commit -m "docs: production cutover checklist for normalized V3 DB"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Backup first | Task 1 |
| Additive schema from V2 | Task 2 |
| Lossless blob migrate + orphans | Tasks 3–4 |
| payload/idx for DAL | Task 3 |
| bcrypt preserve / plaintext hash | Task 3 |
| Point app at V3; keep V2 | Task 5 |
| Compare tables/FKs/rows | Task 6 |
| Production upload later | Task 7 |
| No Neon cloud mutate this phase | All tasks |
| Merge-agent conflict | None (frontend only at `fc51b4f`) |

No TBD steps. Execution must not start until operator confirms; dumps stay local/gitignored.
