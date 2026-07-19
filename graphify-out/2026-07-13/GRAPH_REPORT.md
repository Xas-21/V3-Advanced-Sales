# Graph Report - V3-Advanced-Sales  (2026-07-13)

## Corpus Check
- 223 files · ~285,348 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2099 nodes · 5265 edges · 156 communities (144 shown, 12 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 215 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `90c3a4c4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- CRM.tsx / AccountsPage.tsx
- AS.tsx / parseYmd()
- crmCallReportUtils.ts / crmActivitiesUtils.ts
- contractsStore.ts / Contracts.tsx
- Settings.tsx / userProfileMetrics.ts
- operationalSegmentRevenue.ts / accountProfileChartData.ts
- _get_pool() / utils.py
- auth_db.py / security.py
- requestAlertEngine.ts / propertyAlertSettings.ts
- data_access.py / upsert_request()
- userPermissions.ts / can()
- scripts / devDependencies
- list_flat() / upsert_flat()
- RequestsManager.tsx / RequestsManager()
- formConfigurations.ts / AddAccountModal.tsx
- reportsVsLastYear.ts
- crmStateModel.ts / PIPELINE_STAGE_KEYS
- beoShared.ts / EventsView()
- feed.py / dependencies.py
- test_api_full.py / hash_password()
- propertyMealsPackages.ts / resolveMealPlansForProperty()
- propertyOccupancyTypes.ts / calculateNights()
- CRMProfileView.tsx / accountProfileData.ts
- Reports.tsx / Reports()
- requestFeedbackConfig.ts / RequestFeedbackPublicPage.tsx
- resolveCurrencyCode() / formatCurrencyAmount()
- apiUrl() / backendApi.ts
- 001_normalized_schema.sql / requests
- 001_normalized_schema.sql / requests
- compilerOptions / lib
- AdvancedSalesDashboard() / alertDismissals.ts
- crm_recovery.py / crm_state.py
- Settings
- DashboardHubRequestsPage.tsx / DashboardHubRequestsPage()
- DashboardHubSalesPerformancePage.tsx / DashboardHubSalesPerformancePa...
- auth.py / login()
- buildGrandHotelCombinedRevenueRow() / parseYmd()
- CRMProfileView.tsx
- DashboardHubRoomsPage.tsx / DashboardHubRoomsPage()
- chartVsYearCompare.ts / chartTabSupportsVs()
- DashboardHubAccountsPage.tsx / DashboardHubAccountsPage()
- DashboardHubPromotionsPage.tsx / DashboardHubPromotionsPage()
- DashboardHubRevenueMixPage.tsx / DashboardHubRevenueMixPage()
- accountProfileData.ts
- 002_migrate.py / migrate()
- ConnectionManager / ._send_safe()
- DashboardHubShell.tsx / dashboardHubTabs.ts
- 002_migrate.py / migrate()
- cors_middleware.py / _normalize_origin()
- DashboardHubActivitiesPage.tsx / DashboardHubActivitiesPage()
- DashboardHubMicePage.tsx / DashboardHubMicePage()
- main.py / auth_context_and_security_headers()
- business_card_scan.py / _extract_with_openai()
- uploads.py / _resolve_cloudinary_config()
- PromotionsPage.tsx / PromotionsPage()
- PromotionsPage.tsx
- compilerOptions / tsconfig.node.json
- RootErrorBoundary / main.tsx
- requestDetailLayout.ts / includesEventAgendaSection()
- SubscribePayload / subscribe()
- RequestIdCollisionError / Exception
- DashboardHubComingSoon.tsx / DashboardHubComingSoonProps
- websocket-client.ts / WebSocketMessage
- GroupContractModal.tsx / GroupContractModalProps
- MICEContractModal.tsx / MICEContractModalProps
- 004_tenant_columns.sql / users
- TC007_GET_apiproperties_returns_array.py / login_get_session()
- vite-env.d.ts / ImportMetaEnv
- YearlyContractModal.tsx / YearlyContractModalProps
- 005_sessions_reconcile.sql / sessions
- dependencies.py
- propertyPaymentMethods.ts
- propertyAlertSettings.ts
- Advanced Sales & Tour Management System (V3)
- accounts.py
- can_access_property
- PROJECT_MAP — Advanced Sales (AS) System, V3
- CurrencyCode
- 6) Functional Requirements
- 6) Functional Requirements
- package.json
- Product Specification Document (PSD)
- Product Specification Document (PSD)
- Dashboard Hub Page Component Contract (for subagents)
- Advanced Sales Dashboard — Agent Guide
- 10) Non-Functional Requirements
- testsprite-mcp-backend-test-report.md
- 10) Non-Functional Requirements
- mammoth
- 3) Product Goals and Success Metrics
- 8) Integrations and External Dependencies
- 9) User Workflows
- 3) Product Goals and Success Metrics
- 8) Integrations and External Dependencies
- 9) User Workflows
- 12) Assumptions and Constraints
- 4) Product Scope
- 5) Users and Personas
- 7) Data and Domain Model (High-Level)
- 12) Assumptions and Constraints
- 4) Product Scope
- 5) Users and Personas
- 7) Data and Domain Model (High-Level)

## God Nodes (most connected - your core abstractions)
1. `AdvancedSalesDashboard()` - 98 edges
2. `_get_pool()` - 75 edges
3. `RequestsManager()` - 65 edges
4. `apiUrl()` - 65 edges
5. `CRM()` - 60 edges
6. `AccountsPage()` - 45 edges
7. `Settings()` - 38 edges
8. `Reports()` - 37 edges
9. `EventsView()` - 35 edges
10. `can()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `EventsView()` --indirect_call--> `avg()`  [INFERRED]
  AS.tsx → dashboardHub/analyticsKit.tsx
- `EventsView()` --indirect_call--> `statusColor()`  [INFERRED]
  AS.tsx → PromotionsPage.tsx
- `AdvancedSalesDashboard()` --indirect_call--> `defaultChartVsYear()`  [INFERRED]
  AS.tsx → chartVsYearCompare.ts
- `AdvancedSalesDashboard()` --indirect_call--> `clearPipelineLinkForDeletedRequest()`  [INFERRED]
  AS.tsx → crmStateModel.ts
- `AdvancedSalesDashboard()` --indirect_call--> `syncAllPipelineCardsFromRequests()`  [INFERRED]
  AS.tsx → crmStateModel.ts

## Import Cycles
- None detected.

## Communities (156 total, 12 thin omitted)

### Community 0 - "CRM.tsx / AccountsPage.tsx"
Cohesion: 0.09
Nodes (39): calculateEventAgendaDays(), calculateNights(), ConfirmDialog(), ConfirmDialogProps, CRM(), CRM_QUARTER_MONTH_BLOCKS, crmLeadHasScheduledFollowUp(), CrmNavigateMeta (+31 more)

### Community 1 - "AS.tsx / parseYmd()"
Cohesion: 0.05
Nodes (50): dismissStorageKey(), isDismissedForDate(), loadDismissMap(), localDateKey(), saveDismissMap(), accountPerformanceData, AlertsBell, AlertsBellProps (+42 more)

### Community 2 - "crmCallReportUtils.ts / crmActivitiesUtils.ts"
Cohesion: 0.08
Nodes (62): flattenCrmLeads(), CallDetailsModal(), CallDetailsModalProps, kindLabel(), accountHasCallHistory(), buildAccountCallTimeline(), CallTimelineEntry, CRM_QUARTER_MONTH_BLOCKS (+54 more)

### Community 3 - "contractsStore.ts / Contracts.tsx"
Cohesion: 0.14
Nodes (41): Contracts(), ContractsProps, isCompanyNameVariable(), isDateLikeVariable(), isEndDateVariable(), isStartDateVariable(), isTodayVariable(), normalizeVarKey() (+33 more)

### Community 4 - "Settings.tsx / userProfileMetrics.ts"
Cohesion: 0.09
Nodes (40): ALERT_TYPE_REGISTRY, AlertKindRowSettings, DEADLINE_ACCENT_OPTIONS, DEADLINE_ALERT_KINDS, DEADLINE_OFFSET_OPTIONS, DeadlineAlertAccent, DeadlineAlertKind, DeadlineAlertRuleSettings (+32 more)

### Community 5 - "operationalSegmentRevenue.ts / accountProfileChartData.ts"
Cohesion: 0.10
Nodes (55): buildAccountProfileChartData(), buildDashboardAxis(), DashboardAxisGranularity, DashboardAxisPoint, getDashboardAxisKey(), getMonthKey(), isDashboardExcludedRequest(), isEventsCateringEligibleRequest() (+47 more)

### Community 6 - "_get_pool() / utils.py"
Cohesion: 0.12
Nodes (37): on_startup(), Idempotent index migration for list-endpoint performance.  Adds composite inde, _collection_key(), _connect(), delete_account_with_links(), delete_collection_row(), delete_promotion_row(), delete_property_collection_row() (+29 more)

### Community 7 - "auth_db.py / security.py"
Cohesion: 0.09
Nodes (11): End-to-end auth + tenant isolation test using FastAPI TestClient (no network)., check_password_policy(), create_session_token(), get_session_secret(), parse_session_token(), AS security core: password hashing, policy, signed server-side sessions.  No t, Minimum bar for a production multi-tenant system., Returns (user_id, session_version, issued_at) or None if invalid signature. (+3 more)

### Community 8 - "requestAlertEngine.ts / propertyAlertSettings.ts"
Cohesion: 0.15
Nodes (32): getEventDateWindow(), normalizeRequestTypeKey(), getDeadlineAlertRule(), isAlertKindActive(), SystemAlertKind, applyMessageTokens(), collectBeoStartDates(), collectCheckoutOrEndDates() (+24 more)

### Community 9 - "data_access.py / upsert_request()"
Cohesion: 0.12
Nodes (36): _as_date(), _as_datetime(), _as_decimal(), _as_int(), _assert_write_access(), _broadcast_change(), _cascade_account_rename_to_requests(), _child_typed() (+28 more)

### Community 10 - "userPermissions.ts / can()"
Cohesion: 0.09
Nodes (45): AdvancedSalesDashboard(), crmLocalStorageKey(), getActivePropertyStorageKey(), KPI_STATUS_ORDER, monthNameToIndex(), ALL_PERMISSION_IDS, can(), canAccessAccountsNav() (+37 more)

### Community 11 - "scripts / devDependencies"
Cohesion: 0.09
Nodes (23): autoprefixer, devDependencies, autoprefixer, postcss, tailwindcss, @types/node, @types/react, @types/react-dom (+15 more)

### Community 12 - "list_flat() / upsert_flat()"
Cohesion: 0.07
Nodes (32): _delete_doc(), delete_flat(), list_flat(), upsert_flat(), delete_contract_template(), list_contract_templates(), upsert_contract_template(), delete_cxl_reason() (+24 more)

### Community 13 - "RequestsManager.tsx / RequestsManager()"
Cohesion: 0.09
Nodes (38): requestMatchesAccount(), addCalendarDaysIso(), deriveRequestMealLabelFromRooms(), deleteFileFromCloudinary(), defaultEventPackageName(), normalizeAgendaRowTimes(), normalizeRequestAlerts(), RequestAlert (+30 more)

### Community 14 - "formConfigurations.ts / AddAccountModal.tsx"
Cohesion: 0.11
Nodes (37): accountToFormState(), AddAccountModal(), AddAccountModalProps, defaultFormState(), emptyContactRow(), AddSalesCallModal(), AddSalesCallModalProps, applyFormOverrideToSchema() (+29 more)

### Community 15 - "reportsVsLastYear.ts"
Cohesion: 0.16
Nodes (21): convertCurrencyToSar(), inDateRangeYMD(), requestOperationalDatesOverlapRange(), csvEscape(), defaultMonthRange(), formatSar(), initialSavedReports, isEventOrEventRoomsType() (+13 more)

### Community 16 - "crmStateModel.ts / PIPELINE_STAGE_KEYS"
Cohesion: 0.14
Nodes (35): buildMirrorSalesCallFromPipelineCard(), cardPeriodMonth(), clearPipelineLinkForDeletedRequest(), clonePipeline(), CrmStatePayload, defaultCrmState(), defaultPipelineBuckets(), filterPipelineForProperty() (+27 more)

### Community 17 - "beoShared.ts / EventsView()"
Cohesion: 0.14
Nodes (29): DEFAULT_MEAL_PLANS, dispatchChanged(), EVENT_PACKAGE_TIMING_OPTIONS, EventPackageEntry, eventPackagesFromArray(), eventPackagesKey(), EventPackageTimingId, getAgendaTimingSlotsForPackageName() (+21 more)

### Community 18 - "feed.py / dependencies.py"
Cohesion: 0.10
Nodes (38): require_user(), add_comment(), _broadcast_feed(), _clean_attachments(), _clean_meta(), CommentCreate, create_post(), _default_property_id() (+30 more)

### Community 19 - "test_api_full.py / hash_password()"
Cohesion: 0.08
Nodes (3): Full API smoke + CRUD coverage using FastAPI TestClient (no tunnel, no live serv, Assigning property must not invalidate sessions (no password POST / no session b, test_patch_user_property_id_preserves_session_version()

### Community 20 - "propertyMealsPackages.ts / resolveMealPlansForProperty()"
Cohesion: 0.14
Nodes (27): get_account(), get_crm_state(), get_request(), list_accounts(), _list_doc(), list_requests(), _load_users_cache(), _row_to_account_dict() (+19 more)

### Community 21 - "propertyOccupancyTypes.ts / calculateNights()"
Cohesion: 0.13
Nodes (21): AccommodationRequestModal(), AccommodationRequestModalProps, mockLeads, requestSectionAddButtonStyle(), EventRequestModal(), EventRequestModalProps, mockLeads, mockVenues (+13 more)

### Community 22 - "CRMProfileView.tsx / accountProfileData.ts"
Cohesion: 0.19
Nodes (25): add_participants(), _assert_participant(), _broadcast_chat(), _can_message(), create_group(), create_or_get_dm(), _default_property_id(), DmCreate (+17 more)

### Community 23 - "Reports.tsx / Reports()"
Cohesion: 0.16
Nodes (17): AccountProfileChartRow, ACCOUNT_PROFILE_CHART_TABS, AccountProfileChartTab, LY_COLORS, Props, rechartsTooltipThemeProps(), ChartVsCompareControls(), Props (+9 more)

### Community 24 - "requestFeedbackConfig.ts / RequestFeedbackPublicPage.tsx"
Cohesion: 0.13
Nodes (24): ACCOMMODATION_TEMPLATE, buildDefaultFeedbackTemplateStore(), buildInitialFeedbackAnswers(), cloneTemplate(), defaultTemplateForType(), EVENT_TEMPLATE, EVENT_WITH_ROOMS_TEMPLATE, FEEDBACK_QUESTION_TYPE_OPTIONS (+16 more)

### Community 25 - "resolveCurrencyCode() / formatCurrencyAmount()"
Cohesion: 0.18
Nodes (21): accountToLead(), contactDisplayName(), leadToAccount(), mergeAccountIntoCrmLead(), resolveAccountOwnerName(), withContactName(), AccountMergeApplyInput, applyAccountMergeInMemory() (+13 more)

### Community 26 - "apiUrl() / backendApi.ts"
Cohesion: 0.14
Nodes (47): requestTouchesOperationalDateRange(), isPerfChartTab(), PERF_TAB_TO_ACCOUNT, UserPerformanceChartTabKey, UserPerformanceDashboard(), UserPerformanceDashboardProps, accountAttributedToUser(), accountUsernameFieldsMatch() (+39 more)

### Community 27 - "001_normalized_schema.sql / requests"
Cohesion: 0.15
Nodes (24): account_activities, account_contacts, accounts, contract_templates, crm_state, cxl_reasons, financials, promotions (+16 more)

### Community 28 - "001_normalized_schema.sql / requests"
Cohesion: 0.15
Nodes (24): account_activities, account_contacts, accounts, contract_templates, crm_state, cxl_reasons, financials, promotions (+16 more)

### Community 29 - "compilerOptions / lib"
Cohesion: 0.08
Nodes (24): DOM, DOM.Iterable, ES2020, src, **/*.ts, **/*.tsx, compilerOptions, allowImportingTsExtensions (+16 more)

### Community 30 - "AdvancedSalesDashboard() / alertDismissals.ts"
Cohesion: 0.07
Nodes (80): ACCOUNT_TYPE_LABEL_SYNONYMS, accountTypesKey(), DEFAULT_PROPERTY_ACCOUNT_TYPES, DEFAULT_PROPERTY_SEGMENTS, loadAccountTypesForProperty(), loadSegmentsForProperty(), matchRawToPropertyLabel(), normalizeTaxonomyStringList() (+72 more)

### Community 31 - "crm_recovery.py / crm_state.py"
Cohesion: 0.20
Nodes (19): account_activities_to_sales_calls(), crm_item_count(), merge_recovery_block(), period_month_from_request(), Any, Rebuild CRM pipeline (and partial salesCalls) from requests + legacy snapshots., Convert legacy crm accountActivities map entries to salesCalls rows., One monthly pipeline card per account + period from operational request dates. (+11 more)

### Community 32 - "Settings"
Cohesion: 0.67
Nodes (4): getCurrencyUserKey(), getPersistedUserCurrency(), readUserCurrencyPrefs(), writeUserCurrencyPref()

### Community 33 - "DashboardHubRequestsPage.tsx / DashboardHubRequestsPage()"
Cohesion: 0.09
Nodes (23): clsx, docxtemplater, jspdf, jspdf-autotable, lucide-react, dependencies, clsx, docxtemplater (+15 more)

### Community 34 - "DashboardHubSalesPerformancePage.tsx / DashboardHubSalesPerformancePa..."
Cohesion: 0.12
Nodes (21): buildDashboardAxis(), calendarColorForRequest(), CalendarView(), expandRequestCalendarEntries(), expandSalesCallCalendarEntries(), fmtMd(), formatPeriodLabel(), getDashboardAxisKey() (+13 more)

### Community 35 - "auth.py / login()"
Cohesion: 0.18
Nodes (15): auth_me(), change_password(), ChangePasswordRequest, _check_rate_limit(), login(), LoginRequest, logout(), _public_user() (+7 more)

### Community 36 - "buildGrandHotelCombinedRevenueRow() / parseYmd()"
Cohesion: 0.07
Nodes (26): 10. Operations & quality, 11. Diagram: request lifecycle (simplified), 12. Glossary, 13. Disclaimer, 1. Executive summary, 2. System context (high level), 3.1 Frontend, 3.2 Backend (+18 more)

### Community 37 - "CRMProfileView.tsx"
Cohesion: 0.23
Nodes (15): getDefaultAccountPerformanceRange(), formatRequestStatusLabel(), mergeChartRowsWithLyComparison(), isRequestDeadlineAutoCall(), CRMProfileView(), timelineIcon(), emptyForm(), LogCallFormData (+7 more)

### Community 38 - "DashboardHubRoomsPage.tsx / DashboardHubRoomsPage()"
Cohesion: 0.19
Nodes (10): _default_property_id(), get_presence(), Real-time presence: who has an active WebSocket connection right now., Return users currently connected via WebSocket for this property., _user_property_ids(), WebSocket, WebSocket endpoint for real-time live updates., WebSocket endpoint for real-time live updates.          Clients connect after (+2 more)

### Community 39 - "chartVsYearCompare.ts / chartTabSupportsVs()"
Cohesion: 0.27
Nodes (8): check(), _ck(), h(), Self-contained end-to-end test for write-path tenant isolation (IDOR), CRM/acco, run(), setup(), hash_password(), test_admin()

### Community 40 - "DashboardHubAccountsPage.tsx / DashboardHubAccountsPage()"
Cohesion: 0.15
Nodes (18): authenticate(), bump_session_version_and_revoke(), change_password(), create_session(), get_password_hash(), get_user_by_id(), get_user_by_username(), AS authentication + authorization + tenant isolation against the relational DB. (+10 more)

### Community 41 - "DashboardHubPromotionsPage.tsx / DashboardHubPromotionsPage()"
Cohesion: 0.26
Nodes (14): AccountProfilePerformanceChart(), MainChart(), convertSarToCurrency(), CURRENCY_OPTIONS, formatCurrencyAmount(), resolveCurrencyCode(), SAR_PER_CURRENCY, coerceMoneyNumber() (+6 more)

### Community 42 - "DashboardHubRevenueMixPage.tsx / DashboardHubRevenueMixPage()"
Cohesion: 0.16
Nodes (18): can_access_property(), is_admin(), Tenant isolation: a non-admin may only access assigned properties., get_current_user(), get_current_user_ctx(), Any, Server-side auth dependencies: session resolution, permission + tenant enforceme, Validate the requested property belongs to the user's tenant scope.      Retur (+10 more)

### Community 43 - "accountProfileData.ts"
Cohesion: 0.18
Nodes (15): AccountLinkedRequestsModal(), AccountLinkedRequestsModalProps, buildAccountTimeline(), computeAccountMetrics(), filterInquiryToTentativeRequests(), filterOpenBookingRequests(), filterOpenOpportunityLeads(), filterRequestsForAccount() (+7 more)

### Community 44 - "002_migrate.py / migrate()"
Cohesion: 0.23
Nodes (11): conn(), d(), migrate(), Guarantee an 'id' field exists on a child object; deterministic per (anchor,inde, Map empty string / None -> None for DATE columns., Map empty string / None -> None for TIMESTAMP columns., Idempotent re-run safety: clear only the NEW relational tables (legacy untouched, reset() (+3 more)

### Community 45 - "ConnectionManager / ._send_safe()"
Cohesion: 0.13
Nodes (14): ConnectionManager, Any, WebSocket, User ids with at least one live WebSocket subscribed to this property., Tell property subscribers who is online right now (active browser sessions)., Broadcast a change event to all subscribed clients.                  Args:, Send a message to specific users (all their open tabs/devices)., Schedule a per-user broadcast from sync / threadpool code. (+6 more)

### Community 46 - "DashboardHubShell.tsx / dashboardHubTabs.ts"
Cohesion: 0.12
Nodes (66): Card(), delta, EmptyState(), FilterChips(), fmtCompact(), fmtInt(), fmtMoney(), fmtPct() (+58 more)

### Community 47 - "002_migrate.py / migrate()"
Cohesion: 0.23
Nodes (11): conn(), d(), migrate(), Guarantee an 'id' field exists on a child object; deterministic per (anchor,inde, Map empty string / None -> None for DATE columns., Map empty string / None -> None for TIMESTAMP columns., Idempotent re-run safety: clear only the NEW relational tables (legacy untouched, reset() (+3 more)

### Community 48 - "cors_middleware.py / _normalize_origin()"
Cohesion: 0.26
Nodes (10): build_cors_settings(), _expand_www_variants(), _normalize_origin(), ProductionCORSMiddleware, CORS middleware with Render-friendly origin fallbacks., Browser Origin headers never include a path or trailing slash., Allow both apex and www for real custom domains only.      IP addresses (e.g., Accept configured origins/regex plus any https://*.onrender.com host. (+2 more)

### Community 49 - "DashboardHubActivitiesPage.tsx / DashboardHubActivitiesPage()"
Cohesion: 0.43
Nodes (6): CloudinaryDeleteRequest, CloudinarySignResponse, CloudinaryUploadResult, getCloudinarySignature(), parseErrorText(), uploadFileToCloudinary()

### Community 50 - "DashboardHubMicePage.tsx / DashboardHubMicePage()"
Cohesion: 0.15
Nodes (13): scripts, build, db:import:postgres, dev, dev:api, dev:api:win, lint, preview (+5 more)

### Community 51 - "main.py / auth_context_and_security_headers()"
Cohesion: 0.16
Nodes (12): set_current_user(), auth_context_and_security_headers(), _database_host(), global_exception_handler(), health(), on_shutdown(), permission_error_handler(), Exception (+4 more)

### Community 53 - "uploads.py / _resolve_cloudinary_config()"
Cohesion: 0.16
Nodes (23): _cloudinary_from_url(), _cloudinary_signature(), CloudinaryDeleteRequest, CloudinarySignRequest, delete_cloudinary_asset(), delete_local_file(), _ext_of(), _first_env() (+15 more)

### Community 54 - "PromotionsPage.tsx / PromotionsPage()"
Cohesion: 0.40
Nodes (6): DistributionChart(), normalizeTaskAssignees(), rechartsTooltipThemeProps(), taskAssigneeNamesList(), taskAssigneesAvatarLetters(), ToDoView()

### Community 56 - "PromotionsPage.tsx"
Cohesion: 0.33
Nodes (9): getRequestDateWindow(), LinkedAccountRow, newPromotionDraft(), normalize(), overlaps(), PromotionRow, PromotionsPage(), requestRevenue() (+1 more)

### Community 57 - "compilerOptions / tsconfig.node.json"
Cohesion: 0.22
Nodes (8): vite.config.js, compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 59 - "requestDetailLayout.ts / includesEventAgendaSection()"
Cohesion: 0.40
Nodes (9): UploadFile, scan_extract_business_card(), _enrich_company_from_web(), _extract_text_from_responses_payload(), _extract_with_openai(), _normalize_openai_contact(), parse_business_card_image(), Any (+1 more)

### Community 60 - "SubscribePayload / subscribe()"
Cohesion: 0.50
Nodes (4): BaseModel, Sends subscription inquiry email when SMTP_* env vars are set.     Otherwise re, subscribe(), SubscribePayload

### Community 61 - "RequestIdCollisionError / Exception"
Cohesion: 0.50
Nodes (3): Exception, Raised when a create would overwrite an existing request row., RequestIdCollisionError

### Community 63 - "websocket-client.ts / WebSocketMessage"
Cohesion: 0.13
Nodes (32): EventsView(), statusToColumnId(), calculateAccFinancialsForRequest(), deriveBeoPaymentView(), escapeHtml(), expandAgendaRowVenueOccupancies(), findFirstAgendaVenueConflict(), formatAgendaPackageSummary() (+24 more)

### Community 124 - "dependencies.py"
Cohesion: 0.06
Nodes (52): AttachmentGallery(), attachmentKind(), Avatar(), DashboardHubFeedPage(), FeedAttachment, FeedCard(), FeedComment, FeedFilter (+44 more)

### Community 125 - "propertyPaymentMethods.ts"
Cohesion: 0.42
Nodes (8): DEFAULT_PAYMENT_METHODS, defaultPaymentMethodForProperty(), dispatchChanged(), normalizePaymentMethods(), postPropertyPatch(), resolvePaymentMethodsForProperty(), savePaymentMethodsForProperty(), storageKey()

### Community 126 - "propertyAlertSettings.ts"
Cohesion: 0.11
Nodes (35): accountNameSortKey(), compareAccountNames(), findPotentialDuplicateAccounts(), isScanDuplicateQueueItemStale(), isScannedContactOnAccount(), normalizeAccountNameKey(), samePropertyAccount(), getAccountProfileGaps() (+27 more)

### Community 127 - "Advanced Sales & Tour Management System (V3)"
Cohesion: 0.12
Nodes (15): 1. Dump from VPS (SSH into VPS), 2. Restore locally, 3. Verify, Advanced Sales & Tour Management System (V3), Architecture, Development, Environment variables (`.env`), Frontend app structure (+7 more)

### Community 128 - "accounts.py"
Cohesion: 0.29
Nodes (6): delete_account(), delete_account_endpoint(), get_account_endpoint(), list_accounts_endpoint(), sync_accounts(), upsert_account_endpoint()

### Community 130 - "PROJECT_MAP — Advanced Sales (AS) System, V3"
Cohesion: 0.15
Nodes (12): [ARCHITECTURE], Backend structure, Data access pattern, [DATA INVENTORY] (2026-07-12 live), Frontend structure (top-level), Key DB design decisions, [ORPHANS & PENDING], PROJECT_MAP — Advanced Sales (AS) System, V3 (+4 more)

### Community 131 - "CurrencyCode"
Cohesion: 0.40
Nodes (5): AccountsPageProps, CurrencyCode, ReportsProps, RequestsManagerProps, SettingsProps

### Community 132 - "6) Functional Requirements"
Cohesion: 0.17
Nodes (12): 6.10 Theme and UX Personalization, 6.11 Role and Permissions, 6.1 Authentication and Session, 6.2 Landing Experience, 6.3 Dashboard, 6.4 CRM, 6.5 Requests Management, 6.6 Events and Catering (+4 more)

### Community 133 - "6) Functional Requirements"
Cohesion: 0.17
Nodes (12): 6.10 Theme and UX Personalization, 6.11 Role and Permissions, 6.1 Authentication and Session, 6.2 Landing Experience, 6.3 Dashboard, 6.4 CRM, 6.5 Requests Management, 6.6 Events and Catering (+4 more)

### Community 135 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 136 - "Product Specification Document (PSD)"
Cohesion: 0.18
Nodes (10): 11) Reporting and Analytics Requirements, 13) Risks and Mitigations, 14) Acceptance Criteria (System-Level), 15) Release Readiness Checklist, 16) Future Enhancements (Post V2.0), 17) Appendix: Permission Catalog (Current), 1) Product Overview, 2) Problem Statement (+2 more)

### Community 137 - "Product Specification Document (PSD)"
Cohesion: 0.18
Nodes (10): 11) Reporting and Analytics Requirements, 13) Risks and Mitigations, 14) Acceptance Criteria (System-Level), 15) Release Readiness Checklist, 16) Future Enhancements (Post V2.0), 17) Appendix: Permission Catalog (Current), 1) Product Overview, 2) Problem Statement (+2 more)

### Community 138 - "Dashboard Hub Page Component Contract (for subagents)"
Cohesion: 0.25
Nodes (7): Dashboard Hub Page Component Contract (for subagents), Endpoints & real field shapes (tenant-scoped server-side; call WITHOUT propertyId), Goal, Hard contract (MUST follow exactly), Pages to build (one file each, exact filenames), Verification, What each page must contain (deep analytics — not a placeholder)

### Community 139 - "Advanced Sales Dashboard — Agent Guide"
Cohesion: 0.29
Nodes (6): Advanced Sales Dashboard — Agent Guide, Conventions, Dev commands, Layout, Password migration (run when deploying to a fresh Neon DB), Stack

### Community 143 - "10) Non-Functional Requirements"
Cohesion: 0.33
Nodes (6): 10.1 Performance, 10.2 Reliability, 10.3 Security, 10.4 Maintainability, 10.5 Accessibility and Usability, 10) Non-Functional Requirements

### Community 144 - "testsprite-mcp-backend-test-report.md"
Cohesion: 0.33
Nodes (5): 1️⃣ Document Metadata, 2️⃣ Requirement Validation Summary, 3️⃣ Coverage & Matching Metrics, 4️⃣ Key Gaps / Risks, Requirement A: Login endpoint authentication

### Community 145 - "10) Non-Functional Requirements"
Cohesion: 0.33
Nodes (6): 10.1 Performance, 10.2 Reliability, 10.3 Security, 10.4 Maintainability, 10.5 Accessibility and Usability, 10) Non-Functional Requirements

### Community 148 - "3) Product Goals and Success Metrics"
Cohesion: 0.50
Nodes (4): 3.1 Business Goals, 3.2 Product Goals, 3.3 Success Metrics (KPIs), 3) Product Goals and Success Metrics

### Community 149 - "8) Integrations and External Dependencies"
Cohesion: 0.50
Nodes (4): 8.1 Frontend Stack, 8.2 Backend Stack, 8.3 API Highlights, 8) Integrations and External Dependencies

### Community 150 - "9) User Workflows"
Cohesion: 0.50
Nodes (4): 9.1 Lead to Request to Event Flow, 9.2 Daily Operations Flow, 9.3 Admin Setup Flow, 9) User Workflows

### Community 151 - "3) Product Goals and Success Metrics"
Cohesion: 0.50
Nodes (4): 3.1 Business Goals, 3.2 Product Goals, 3.3 Success Metrics (KPIs), 3) Product Goals and Success Metrics

### Community 152 - "8) Integrations and External Dependencies"
Cohesion: 0.50
Nodes (4): 8.1 Frontend Stack, 8.2 Backend Stack, 8.3 API Highlights, 8) Integrations and External Dependencies

### Community 153 - "9) User Workflows"
Cohesion: 0.50
Nodes (4): 9.1 Lead to Request to Event Flow, 9.2 Daily Operations Flow, 9.3 Admin Setup Flow, 9) User Workflows

### Community 154 - "12) Assumptions and Constraints"
Cohesion: 0.67
Nodes (3): 12.1 Assumptions, 12.2 Constraints, 12) Assumptions and Constraints

### Community 155 - "4) Product Scope"
Cohesion: 0.67
Nodes (3): 4.1 In Scope (V2.0), 4.2 Out of Scope (Current Baseline), 4) Product Scope

### Community 156 - "5) Users and Personas"
Cohesion: 0.67
Nodes (3): 5.1 Primary Users, 5.2 User Needs by Persona, 5) Users and Personas

### Community 157 - "7) Data and Domain Model (High-Level)"
Cohesion: 0.67
Nodes (3): 7.1 Core Entities, 7.2 Data Characteristics, 7) Data and Domain Model (High-Level)

### Community 158 - "12) Assumptions and Constraints"
Cohesion: 0.67
Nodes (3): 12.1 Assumptions, 12.2 Constraints, 12) Assumptions and Constraints

### Community 159 - "4) Product Scope"
Cohesion: 0.67
Nodes (3): 4.1 In Scope (V2.0), 4.2 Out of Scope (Current Baseline), 4) Product Scope

### Community 160 - "5) Users and Personas"
Cohesion: 0.67
Nodes (3): 5.1 Primary Users, 5.2 User Needs by Persona, 5) Users and Personas

### Community 161 - "7) Data and Domain Model (High-Level)"
Cohesion: 0.67
Nodes (3): 7.1 Core Entities, 7.2 Data Characteristics, 7) Data and Domain Model (High-Level)

## Knowledge Gaps
- **392 isolated node(s):** `THEMES`, `DASHBOARD_PERIOD_MODES`, `DashboardPeriodMode`, `MONTH_SHORT`, `DashboardAxisGranularity` (+387 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `apiUrl()` connect `propertyAlertSettings.ts` to `CRM.tsx / AccountsPage.tsx`, `AS.tsx / parseYmd()`, `contractsStore.ts / Contracts.tsx`, `Settings.tsx / userProfileMetrics.ts`, `userPermissions.ts / can()`, `RequestsManager.tsx / RequestsManager()`, `formConfigurations.ts / AddAccountModal.tsx`, `reportsVsLastYear.ts`, `beoShared.ts / EventsView()`, `propertyOccupancyTypes.ts / calculateNights()`, `requestFeedbackConfig.ts / RequestFeedbackPublicPage.tsx`, `resolveCurrencyCode() / formatCurrencyAmount()`, `AdvancedSalesDashboard() / alertDismissals.ts`, `DashboardHubShell.tsx / dashboardHubTabs.ts`, `DashboardHubActivitiesPage.tsx / DashboardHubActivitiesPage()`, `PromotionsPage.tsx`, `websocket-client.ts / WebSocketMessage`, `dependencies.py`, `propertyPaymentMethods.ts`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `CRM()` connect `CRM.tsx / AccountsPage.tsx` to `DashboardHubRequestsPage.tsx / DashboardHubRequestsPage()`, `crmCallReportUtils.ts / crmActivitiesUtils.ts`, `contractsStore.ts / Contracts.tsx`, `Settings.tsx / userProfileMetrics.ts`, `CRMProfileView.tsx`, `operationalSegmentRevenue.ts / accountProfileChartData.ts`, `requestAlertEngine.ts / propertyAlertSettings.ts`, `DashboardHubPromotionsPage.tsx / DashboardHubPromotionsPage()`, `userPermissions.ts / can()`, `accountProfileData.ts`, `formConfigurations.ts / AddAccountModal.tsx`, `crmStateModel.ts / PIPELINE_STAGE_KEYS`, `resolveCurrencyCode() / formatCurrencyAmount()`, `apiUrl() / backendApi.ts`, `propertyAlertSettings.ts`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `dependencies` connect `DashboardHubRequestsPage.tsx / DashboardHubRequestsPage()` to `can_access_property`, `mammoth`, `package.json`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `AdvancedSalesDashboard()` (e.g. with `defaultChartVsYear()` and `clearPipelineLinkForDeletedRequest()`) actually correct?**
  _`AdvancedSalesDashboard()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 48 inferred relationships involving `_get_pool()` (e.g. with `bump_session_version_and_revoke()` and `change_password()`) actually correct?**
  _`_get_pool()` has 48 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `RequestsManager()` (e.g. with `num()` and `requestTypeLabel()`) actually correct?**
  _`RequestsManager()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `THEMES`, `DASHBOARD_PERIOD_MODES`, `DashboardPeriodMode` to the rest of the system?**
  _392 weakly-connected nodes found - possible documentation gaps or missing edges._