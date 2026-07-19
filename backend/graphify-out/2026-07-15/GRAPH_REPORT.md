# Graph Report - backend  (2026-07-15)

## Corpus Check
- 52 files · ~31,399 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 508 nodes · 1227 edges · 19 communities
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
- contact.py

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
- `revoke_all_sessions_for_user()` --calls--> `_get_pool()`  [EXTRACTED]
  auth_db.py → utils.py
- `_database_host()` --calls--> `get_database_url()`  [EXTRACTED]
  main.py → utils.py
- `logout()` --calls--> `_get_pool()`  [EXTRACTED]
  routers/auth.py → utils.py
- `get_user_by_username()` --calls--> `_get_pool()`  [EXTRACTED]
  auth_db.py → utils.py
- `get_user_by_id()` --calls--> `_get_pool()`  [EXTRACTED]
  auth_db.py → utils.py

## Import Cycles
- None detected.

## Communities (19 total, 0 thin omitted)

### Community 0 - "feed.py"
Cohesion: 0.07
Nodes (65): require_user(), add_participants(), _assert_participant(), _broadcast_chat(), _can_message(), create_group(), create_or_get_dm(), _default_property_id() (+57 more)

### Community 1 - "data_access.py"
Cohesion: 0.07
Nodes (55): _as_date(), _as_datetime(), _as_decimal(), _as_int(), _assert_write_access(), _broadcast_change(), _cascade_account_rename_to_requests(), _child_typed() (+47 more)

### Community 2 - "_get_pool"
Cohesion: 0.09
Nodes (58): ConnectionPool, get_crm_state(), _list_doc(), get_current_user_ctx(), on_startup(), Idempotent index migration for list-endpoint performance.  Adds composite indexe, _account_name_sort_key(), _collection_key() (+50 more)

### Community 3 - "auth_db.py"
Cohesion: 0.06
Nodes (40): authenticate(), bump_session_version_and_revoke(), change_password(), create_session(), get_password_hash(), get_user_by_id(), get_user_by_username(), AS authentication + authorization + tenant isolation against the relational DB. (+32 more)

### Community 4 - "delete_flat"
Cohesion: 0.08
Nodes (40): _delete_doc(), delete_flat(), list_flat(), Insert/update a row carrying a `payload jsonb` + typed scalar columns.      `typ, _upsert_doc(), upsert_flat(), upsert_payload_only(), _database_host() (+32 more)

### Community 5 - "test_api_full.py"
Cohesion: 0.08
Nodes (3): Full API smoke + CRUD coverage using FastAPI TestClient (no tunnel, no live serv, Assigning property must not invalidate sessions (no password POST / no session b, test_patch_user_property_id_preserves_session_version()

### Community 6 - "main.py"
Cohesion: 0.26
Nodes (10): build_cors_settings(), _expand_www_variants(), _normalize_origin(), ProductionCORSMiddleware, CORS middleware with Render-friendly origin fallbacks., Browser Origin headers never include a path or trailing slash., Allow both apex and www for real custom domains only.      IP addresses (e.g., Accept configured origins/regex plus any https://*.onrender.com host. (+2 more)

### Community 7 - "001_normalized_schema.sql"
Cohesion: 0.15
Nodes (24): account_activities, account_contacts, accounts, contract_templates, crm_state, cxl_reasons, financials, promotions (+16 more)

### Community 8 - "ConnectionManager"
Cohesion: 0.12
Nodes (15): ConnectionManager, Any, WebSocket, WebSocket connection manager for real-time live updates across users.  Broadcast, User ids with at least one live WebSocket subscribed to this property., Tell property subscribers who is online right now (active browser sessions)., Broadcast a change event to all subscribed clients.                  Args:, Send a message to specific users (all their open tabs/devices). (+7 more)

### Community 9 - "crm_state.py"
Cohesion: 0.20
Nodes (20): account_activities_to_sales_calls(), crm_item_count(), merge_recovery_block(), period_month_from_request(), Any, Rebuild CRM pipeline (and partial salesCalls) from requests + legacy snapshots., Convert legacy crm accountActivities map entries to salesCalls rows., One monthly pipeline card per account + period from operational request dates. (+12 more)

### Community 10 - "auth.py"
Cohesion: 0.08
Nodes (41): can_access_property(), has_permission(), is_admin(), Tenant isolation: a non-admin may only access assigned properties., get_current_user(), Any, Server-side auth dependencies: session resolution, permission + tenant enforceme, Prefer middleware-set context; fall back to resolve_session for rare paths witho (+33 more)

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
Cohesion: 0.21
Nodes (11): set_current_user(), auth_context_and_security_headers(), global_exception_handler(), permission_error_handler(), Exception, Request, PermissionError, Session resolve-once + last_seen throttle (plan 002). (+3 more)

### Community 18 - "contact.py"
Cohesion: 0.50
Nodes (4): BaseModel, Sends subscription inquiry email when SMTP_* env vars are set.     Otherwise re, subscribe(), SubscribePayload

## Knowledge Gaps
- **3 isolated node(s):** `contract_templates`, `cxl_reasons`, `crm_state`
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `_get_pool()` connect `_get_pool` to `feed.py`, `data_access.py`, `auth_db.py`, `delete_flat`, `crm_state.py`, `auth.py`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Why does `require_user()` connect `feed.py` to `set_current_user`, `auth.py`, `uploads.py`, `delete_flat`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **What connects `contract_templates`, `cxl_reasons`, `crm_state` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `feed.py` be split into smaller, more focused modules?**
  _Cohesion score 0.07374890254609306 - nodes in this community are weakly interconnected._
- **Should `data_access.py` be split into smaller, more focused modules?**
  _Cohesion score 0.074034902168165 - nodes in this community are weakly interconnected._
- **Should `_get_pool` be split into smaller, more focused modules?**
  _Cohesion score 0.09152542372881356 - nodes in this community are weakly interconnected._
- **Should `auth_db.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06485671191553545 - nodes in this community are weakly interconnected._