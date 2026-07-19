# Graph Report - backend  (2026-07-15)

## Corpus Check
- 53 files · ~31,961 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 516 nodes · 1245 edges · 18 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `90c3a4c4`
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

## God Nodes (most connected - your core abstractions)
1. `_get_pool()` - 87 edges
2. `require_user()` - 40 edges
3. `is_admin()` - 23 edges
4. `delete_flat()` - 23 edges
5. `list_flat()` - 20 edges
6. `upsert_flat()` - 20 edges
7. `upsert_request()` - 16 edges
8. `create_post()` - 15 edges
9. `_ensure_special_migration()` - 14 edges
10. `upsert_account()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `setup()` --calls--> `hash_password()`  [EXTRACTED]
  migrations/008_write_authz_test.py → security.py
- `logout()` --calls--> `_get_pool()`  [EXTRACTED]
  routers/auth.py → utils.py
- `get_user_by_username()` --calls--> `_get_pool()`  [EXTRACTED]
  auth_db.py → utils.py
- `get_user_by_id()` --calls--> `_get_pool()`  [EXTRACTED]
  auth_db.py → utils.py
- `get_password_hash()` --calls--> `_get_pool()`  [EXTRACTED]
  auth_db.py → utils.py

## Import Cycles
- None detected.

## Communities (18 total, 0 thin omitted)

### Community 0 - "feed.py"
Cohesion: 0.09
Nodes (45): require_user(), set_current_user(), add_comment(), _broadcast_feed(), _clean_attachments(), _clean_meta(), CommentCreate, create_post() (+37 more)

### Community 1 - "data_access.py"
Cohesion: 0.07
Nodes (60): _as_date(), _as_datetime(), _as_decimal(), _as_int(), _assert_write_access(), _broadcast_change(), _cascade_account_rename_to_requests(), _child_typed() (+52 more)

### Community 2 - "_get_pool"
Cohesion: 0.10
Nodes (52): revoke_all_sessions_for_user(), ConnectionPool, on_startup(), Idempotent index migration for list-endpoint performance.  Adds composite indexe, _account_name_sort_key(), _collection_key(), _connect(), delete_account_row() (+44 more)

### Community 3 - "auth_db.py"
Cohesion: 0.06
Nodes (59): authenticate(), bump_session_version_and_revoke(), can_access_property(), change_password(), create_session(), get_password_hash(), get_user_by_id(), get_user_by_username() (+51 more)

### Community 4 - "delete_flat"
Cohesion: 0.09
Nodes (35): _delete_doc(), delete_flat(), list_flat(), Insert/update a row carrying a `payload jsonb` + typed scalar columns.      `typ, _upsert_doc(), upsert_flat(), upsert_payload_only(), delete_contract_template() (+27 more)

### Community 5 - "test_api_full.py"
Cohesion: 0.06
Nodes (13): _database_host(), Full API smoke + CRUD coverage using FastAPI TestClient (no tunnel, no live serv, Assigning property must not invalidate sessions (no password POST / no session b, test_admin(), test_patch_user_property_id_preserves_session_version(), _any_property_id(), flat_authz_fixtures(), Flat list tenant isolation (plan 005): non-admins must not read other properties (+5 more)

### Community 6 - "main.py"
Cohesion: 0.07
Nodes (31): build_cors_settings(), _expand_www_variants(), _normalize_origin(), ProductionCORSMiddleware, CORS middleware with Render-friendly origin fallbacks., Browser Origin headers never include a path or trailing slash., Allow both apex and www for real custom domains only.      IP addresses (e.g., Accept configured origins/regex plus any https://*.onrender.com host. (+23 more)

### Community 7 - "001_normalized_schema.sql"
Cohesion: 0.15
Nodes (24): account_activities, account_contacts, accounts, contract_templates, crm_state, cxl_reasons, financials, promotions (+16 more)

### Community 8 - "ConnectionManager"
Cohesion: 0.13
Nodes (14): ConnectionManager, Any, WebSocket, User ids with at least one live WebSocket subscribed to this property., Tell property subscribers who is online right now (active browser sessions)., Broadcast a change event to all subscribed clients.                  Args:, Send a message to specific users (all their open tabs/devices)., Schedule a per-user broadcast from sync / threadpool code. (+6 more)

### Community 9 - "crm_state.py"
Cohesion: 0.20
Nodes (20): account_activities_to_sales_calls(), crm_item_count(), merge_recovery_block(), period_month_from_request(), Any, Rebuild CRM pipeline (and partial salesCalls) from requests + legacy snapshots., Convert legacy crm accountActivities map entries to salesCalls rows., One monthly pipeline card per account + period from operational request dates. (+12 more)

### Community 10 - "auth.py"
Cohesion: 0.18
Nodes (15): auth_me(), change_password(), ChangePasswordRequest, _check_rate_limit(), login(), LoginRequest, logout(), _public_user() (+7 more)

### Community 11 - "uploads.py"
Cohesion: 0.26
Nodes (14): Path, delete_local_file(), _ext_of(), get_local_file(), _guess_media_type(), UploadFile, Upload endpoints: local disk storage on the Docker volume (as-uploads-data)., Serve a previously uploaded file (auth required; cookie sent by <img>/<a>). (+6 more)

### Community 12 - "002_migrate.py"
Cohesion: 0.23
Nodes (11): conn(), d(), migrate(), Guarantee an 'id' field exists on a child object; deterministic per (anchor,inde, Map empty string / None -> None for DATE columns., Map empty string / None -> None for TIMESTAMP columns., Idempotent re-run safety: clear only the NEW relational tables (legacy untouched, reset() (+3 more)

### Community 13 - "business_card_scan.py"
Cohesion: 0.40
Nodes (9): UploadFile, scan_extract_business_card(), _enrich_company_from_web(), _extract_text_from_responses_payload(), _extract_with_openai(), _normalize_openai_contact(), parse_business_card_image(), Any (+1 more)

### Community 17 - "set_current_user"
Cohesion: 0.19
Nodes (25): add_participants(), _assert_participant(), _broadcast_chat(), _can_message(), create_group(), create_or_get_dm(), _default_property_id(), DmCreate (+17 more)

## Knowledge Gaps
- **3 isolated node(s):** `contract_templates`, `cxl_reasons`, `crm_state`
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `_get_pool()` connect `_get_pool` to `feed.py`, `data_access.py`, `auth_db.py`, `delete_flat`, `test_api_full.py`, `main.py`, `crm_state.py`, `auth.py`, `set_current_user`?**
  _High betweenness centrality (0.172) - this node is a cross-community bridge._
- **Why does `ConnectionManager` connect `ConnectionManager` to `auth_db.py`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `require_user()` connect `feed.py` to `uploads.py`, `set_current_user`, `auth_db.py`, `main.py`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **What connects `contract_templates`, `cxl_reasons`, `crm_state` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `feed.py` be split into smaller, more focused modules?**
  _Cohesion score 0.08953900709219859 - nodes in this community are weakly interconnected._
- **Should `data_access.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06874717322478517 - nodes in this community are weakly interconnected._
- **Should `_get_pool` be split into smaller, more focused modules?**
  _Cohesion score 0.10062893081761007 - nodes in this community are weakly interconnected._