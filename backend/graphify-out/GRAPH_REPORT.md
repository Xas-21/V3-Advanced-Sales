# Graph Report - backend  (2026-07-22)

## Corpus Check
- 62 files · ~41,816 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 735 nodes · 1818 edges · 24 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3829cf7f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- feed.py
- data_access.py
- _get_pool
- auth_db.py
- delete_flat
- test_api_full.py
- main.py
- 001_normalized_schema.sql
- ConnectionManager
- crm_state.py
- auth.py
- uploads.py
- 002_migrate.py
- business_card_scan.py
- set_current_user
- _tenant_scope
- accounts.py
- set_current_user
- upsert_request
- reqs.py
- _load_request_children_maps

## God Nodes (most connected - your core abstractions)
1. `_get_pool()` - 110 edges
2. `require_user()` - 55 edges
3. `get_database_url()` - 45 edges
4. `delete_flat()` - 27 edges
5. `hash_password()` - 26 edges
6. `upsert_flat()` - 25 edges
7. `is_admin()` - 24 edges
8. `list_flat()` - 24 edges
9. `upsert_request()` - 24 edges
10. `set_current_user()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `_auth_override()` --indirect_call--> `require_user()`  [INFERRED]
  tests/test_upload_svg.py → dependencies.py
- `revoke_all_sessions_for_user()` --calls--> `_get_pool()`  [EXTRACTED]
  auth_db.py → utils.py
- `remove_request()` --calls--> `delete_request()`  [EXTRACTED]
  routers/reqs.py → data_access.py
- `test_migrate_db_passwords_dry_run_and_idempotent()` --calls--> `migrate()`  [INFERRED]
  tests/test_admin_password_reset.py → migrations/002_migrate.py
- `account_delete_impact()` --calls--> `_get_pool()`  [EXTRACTED]
  routers/accounts.py → utils.py

## Import Cycles
- None detected.

## Communities (24 total, 0 thin omitted)

### Community 0 - "feed.py"
Cohesion: 0.06
Nodes (90): is_admin(), _broadcast_change(), Broadcast a data mutation event to WebSocket clients.          Args:, require_user(), add_participants(), _admin_count(), _assert_participant(), _broadcast_chat() (+82 more)

### Community 1 - "data_access.py"
Cohesion: 0.19
Nodes (21): _as_date(), _as_datetime(), _as_decimal(), _as_int(), _child_typed(), _extract_account_ledger(), _extract_account_rates(), _extract_financials() (+13 more)

### Community 2 - "_get_pool"
Cohesion: 0.07
Nodes (64): ConnectionPool, health(), on_startup(), Idempotent index migration for list-endpoint performance.  Adds composite inde, Create account_rates flat collection (plan 037).  Matches live promotions/task, Create account_ledger flat collection (account balance / billing).  Matches ac, Create crm_card_comments (CRM kanban card comments).  Safe to run repeatedly (, Messenger group management + prefs smoke tests (Batch E/F). (+56 more)

### Community 3 - "auth_db.py"
Cohesion: 0.05
Nodes (58): authenticate(), bump_session_version_and_revoke(), change_password(), create_session(), get_password_hash(), get_user_by_id(), get_user_by_username(), has_permission() (+50 more)

### Community 4 - "delete_flat"
Cohesion: 0.07
Nodes (45): _delete_doc(), delete_flat(), _gen_id(), list_flat(), Insert/update a row carrying a `payload jsonb` + typed scalar columns.      `t, save_ledger_entry(), transfer_allocation(), _upsert_doc() (+37 more)

### Community 5 - "test_api_full.py"
Cohesion: 0.06
Nodes (8): ensure_test_property(), Full API smoke + CRUD coverage using FastAPI TestClient (no tunnel, no live serv, Assigning property must not invalidate sessions (no password POST / no session b, Permission overrides must bump session_version so clients re-auth., Guarantee the PROP_ID property row exists so FK-dependent inserts (users,     r, test_admin(), test_patch_user_permission_grants_bumps_session_version(), test_patch_user_property_id_preserves_session_version()

### Community 6 - "main.py"
Cohesion: 0.06
Nodes (32): build_cors_settings(), _expand_www_variants(), _normalize_origin(), ProductionCORSMiddleware, CORS middleware with Render-friendly origin fallbacks., Browser Origin headers never include a path or trailing slash., Allow both apex and www for real custom domains only.      IP addresses (e.g., Accept configured origins/regex plus any https://*.onrender.com host. (+24 more)

### Community 7 - "001_normalized_schema.sql"
Cohesion: 0.15
Nodes (25): account_activities, account_contacts, account_rates, accounts, contract_templates, crm_state, cxl_reasons, financials (+17 more)

### Community 8 - "ConnectionManager"
Cohesion: 0.13
Nodes (14): ConnectionManager, Any, WebSocket, User ids with at least one live WebSocket subscribed to this property., Tell property subscribers who is online right now (active browser sessions)., Broadcast a change event to all subscribed clients.                  Args:, Send a message to specific users (all their open tabs/devices)., Schedule a per-user broadcast from sync / threadpool code. (+6 more)

### Community 9 - "crm_state.py"
Cohesion: 0.20
Nodes (20): account_activities_to_sales_calls(), crm_item_count(), merge_recovery_block(), period_month_from_request(), Any, Rebuild CRM pipeline (and partial salesCalls) from requests + legacy snapshots., Convert legacy crm accountActivities map entries to salesCalls rows., One monthly pipeline card per account + period from operational request dates. (+12 more)

### Community 10 - "auth.py"
Cohesion: 0.07
Nodes (40): can_access_property(), Tenant isolation: a non-admin may only access assigned properties., datetime, Validate the requested property belongs to the user's tenant scope.      Retur, require_property_access(), auth_me(), change_password(), ChangePasswordRequest (+32 more)

### Community 11 - "uploads.py"
Cohesion: 0.12
Nodes (17): Path, delete_local_file(), _ext_of(), get_local_file(), _guess_media_type(), UploadFile, Upload endpoints: local disk storage on the Docker volume (as-uploads-data)., Serve a previously uploaded file (auth required; cookie sent by <img>/<a>). (+9 more)

### Community 12 - "002_migrate.py"
Cohesion: 0.09
Nodes (37): child_id_token(), ensure_scoped_child_id(), Stable parent-scoped IDs for nested rows (rooms, contacts, activities, …)., Extract a stable token from a client/DB child id, never a full scoped PK., Unique PK for this parent+kind+idx slot (safe across log prepend / reorder)., Build a PK unique per parent even when Neon reused numeric child ids across rows, Return a shallow copy of child with `id` set to a parent-scoped PK., resolve_child_pk() (+29 more)

### Community 13 - "business_card_scan.py"
Cohesion: 0.40
Nodes (9): UploadFile, scan_extract_business_card(), _enrich_company_from_web(), _extract_text_from_responses_payload(), _extract_with_openai(), _normalize_openai_contact(), parse_business_card_image(), Any (+1 more)

### Community 17 - "set_current_user"
Cohesion: 0.06
Nodes (52): _database_host(), _any_property_id(), ledger_fixtures(), account_ledger API: sign normalization, accountId filter, transfer, tenant guard, _session_cookie(), _table_ready(), _any_property_id(), rates_fixtures() (+44 more)

### Community 18 - "_tenant_scope"
Cohesion: 0.15
Nodes (19): _assert_write_access(), _crm_block_score(), _doc_with_row_id(), get_account(), get_crm_state(), _list_doc(), _load_users_cache(), Return a copy of payload whose `id` matches the DB primary key.      Migrated (+11 more)

### Community 19 - "accounts.py"
Cohesion: 0.17
Nodes (17): _assert_upsert_write_access(), _cascade_account_rename_to_requests(), delete_account(), list_accounts(), When an account is renamed, propagate the new name onto the denormalized     `a, Block IDOR overwrite: require access to the existing row AND the incoming proper, upsert_account(), account_delete_impact() (+9 more)

### Community 20 - "set_current_user"
Cohesion: 0.18
Nodes (15): get_request(), set_current_user(), _any_property_id(), batch_req_id(), list_requests batches child loads (plan 001)., test_list_requests_includes_batched_rooms_and_logs(), _any_property_id(), Regression: re-saving a request after prepending logs must not UniqueViolation. (+7 more)

### Community 21 - "upsert_request"
Cohesion: 0.28
Nodes (15): delete_request(), get_public_feedback_by_token(), list_requests(), Explicit public opt-in: load feedback form by publicToken without auth.      D, Explicit public opt-in: submit feedback answers by publicToken without auth., submit_public_feedback(), upsert_request(), _any_property_id() (+7 more)

### Community 22 - "reqs.py"
Cohesion: 0.22
Nodes (8): create_request(), BaseModel, Minimal identity + list/bool fields; extras kept for payload jsonb., remove_request(), RequestCreateBody, Exception, Raised when a create would overwrite an existing request row., RequestIdCollisionError

### Community 23 - "_load_request_children_maps"
Cohesion: 0.40
Nodes (5): _load_request_children_maps(), Prefetch all request children in O(tables) queries. Returns maps keyed by reques, Single-row hydrate (kept for any callers); uses the same batched child loader., _request_dict_from_row(), _row_to_request_dict()

## Knowledge Gaps
- **3 isolated node(s):** `contract_templates`, `cxl_reasons`, `crm_state`
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `_get_pool()` connect `_get_pool` to `feed.py`, `data_access.py`, `auth_db.py`, `delete_flat`, `crm_state.py`, `auth.py`, `set_current_user`, `_tenant_scope`, `accounts.py`, `set_current_user`, `upsert_request`?**
  _High betweenness centrality (0.189) - this node is a cross-community bridge._
- **Why does `get_database_url()` connect `set_current_user` to `_get_pool`, `test_api_full.py`, `main.py`, `set_current_user`, `upsert_request`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `ConnectionManager` connect `ConnectionManager` to `auth.py`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `contract_templates`, `cxl_reasons`, `crm_state` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `feed.py` be split into smaller, more focused modules?**
  _Cohesion score 0.061711079943899017 - nodes in this community are weakly interconnected._
- **Should `_get_pool` be split into smaller, more focused modules?**
  _Cohesion score 0.07203219315895372 - nodes in this community are weakly interconnected._
- **Should `auth_db.py` be split into smaller, more focused modules?**
  _Cohesion score 0.05203442879499218 - nodes in this community are weakly interconnected._