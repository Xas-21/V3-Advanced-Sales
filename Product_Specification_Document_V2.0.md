# Product Specification Document (PSD)

## Document Control
- Product: Advanced Sales & Tour Management System
- Version: 2.0 (Updated Full Detail Edition)
- Date: 2026-04-11
- Document Owner: Product and Engineering
- Audience: Product, Engineering, QA, Operations, Stakeholders
- Status: Active baseline for V2.0 implementation and stabilization

## 1) Product Overview
Advanced Sales & Tour Management System is a web-based hospitality commercial platform for hotels and multi-property operations. It unifies dashboard analytics, CRM pipeline, requests handling, events and catering workflows, contracts, reporting, and configuration in one application.

The system targets commercial and operations teams that need to move from fragmented tools (spreadsheets, email threads, disconnected trackers) to one shared workflow with clear ownership, measurable pipeline, and faster execution.

Core business outcomes:
- Improve conversion from inquiries to confirmed/actual business
- Increase visibility of commercial and MICE performance
- Standardize request-to-execution lifecycle
- Reduce manual follow-up and handoff errors across teams

## 2) Problem Statement
Hotel commercial teams currently face:
- Fragmented lead, request, and event data across multiple tools
- Limited visibility into real-time status and pipeline quality
- Inconsistent event execution process and BEO preparation
- Manual reporting overhead and delayed decision making
- Role ambiguity and uneven controls across users

This product solves the above by centralizing operational and commercial activities with role-aware access, shared data views, and structured workflows.

## 3) Product Goals and Success Metrics
### 3.1 Business Goals
- Centralize commercial operations in one platform for each property
- Enable leadership-level decision support with live dashboards and reports
- Improve cross-team collaboration between Sales, Revenue, Reservations, and Management

### 3.2 Product Goals
- Provide complete lifecycle handling for accounts, leads, requests, and events
- Offer usable analytics for period-based and trend-based review
- Ensure role-based boundaries for sensitive actions (delete, settings, reports, etc.)

### 3.3 Success Metrics (KPIs)
- Adoption: % of active commercial users logging in weekly
- Process completion: % requests progressing from inquiry to actual
- Data quality: % requests with complete required fields
- Time to action: average time from request creation to first follow-up
- Reporting throughput: time to generate periodic business report

## 4) Product Scope
### 4.1 In Scope (V2.0)
- Landing page and login access flow
- Dashboard with KPI cards and chart visualizations
- CRM with pipeline, list, profiles, and sales activity management
- Requests manager with multi-step forms and request lifecycle controls
- Events and Catering support including pipeline, calendar, and BEO processing
- Contracts and contract lifecycle tracking
- Reports page with export and analytics view
- Settings for properties, venues, room types, taxes, financial targets, and users
- Role-based permission model
- Property-aware data segmentation

### 4.2 Out of Scope (Current Baseline)
- Full enterprise SSO/identity provider integration
- Advanced workflow automation engine (rules/trigger builder UI)
- External PMS/CRS bidirectional sync
- Native mobile applications
- Multi-region compliance pack beyond current deployment assumptions

## 5) Users and Personas
### 5.1 Primary Users
- Admin: full system administration and global control
- General Manager: leadership access with selective control
- Head of Sales: commercial owner with broad operational permissions
- Sales Manager: day-to-day sales operation execution
- Sales Executive: lead and request follow-up execution
- Sales Coordinator: request entry and operational support

### 5.2 User Needs by Persona
- Leadership users need high-level KPIs, trends, and account performance
- Sales users need fast input, follow-up, and stage progression tools
- Coordinators need structured forms, data consistency, and status tracking
- Admin users need configuration governance, taxonomy setup, and access control

## 6) Functional Requirements
### 6.1 Authentication and Session
- User can access login form and authenticate by username/password
- System validates credentials against backend user store
- Successful login returns user profile without password fields
- Session state controls protected views and available actions

### 6.2 Landing Experience
- Public-facing landing page presents value proposition and product modules
- Includes visual modules, chart demo, event kanban demo, theme switching demo
- Includes contact/subscription form with email draft handoff
- "Login" and "Subscribe" call-to-action buttons must be accessible above the fold

### 6.3 Dashboard
- Shows KPI cards including requests, revenue, average value, and account activity
- Supports period calculations (MTD/QTD/YTD/custom/current-year style logic)
- Displays request distribution, account mix, and trend visualizations
- Includes pipeline health and operational feed summary

### 6.4 CRM
- Supports lead stages: new, qualified, proposal, negotiation, won, notInterested
- Supports kanban and list interactions for stage progression
- Supports account and contact profile linking
- Supports sales calls and activity timeline tracking
- Stores CRM state by property to prevent cross-property contamination

### 6.5 Requests Management
- Supports request types: accommodation, event, and extended/series patterns
- Provides wizard-like multi-step data capture with request details, dates, status, and financial fields
- Supports logs, payments, and status transitions
- Supports request list, search/filter, and selected-request details
- Supports role-aware request deletion and payment-line deletion controls

### 6.6 Events and Catering
- Supports event pipeline and calendar-oriented execution
- Supports event agenda rows with venue, timings, package, and notes
- Supports meal/coffee/lunch/dinner schedule attributes
- Supports BEO-oriented computed summaries and printing flow
- Supports event availability and operational readiness view

### 6.7 Contracts
- Supports contract generation and storage lifecycle
- Supports template usage and linked account/request context
- Supports status and historical tracking for signed/active flows
- Supports permission-aware deletion controls

### 6.8 Reports
- Provides analytical and operational report views
- Supports leadership reporting workflows
- Access gated by role/permission (`reports.access`)

### 6.9 Settings and Configuration
- Supports property management (multi-property setup)
- Supports venue management and room type configuration
- Supports taxes and financial settings
- Supports global/local staff configuration subject to permissions
- Supports taxonomy maintenance (segments, account types, meals/packages)

### 6.10 Theme and UX Personalization
- Provides theme presets (Luxury Dark, Blue Sky, AlUla Desert, Cyber Pop)
- Theme choice persists in local storage
- UI color tokens consistently propagate to charts/cards/forms

### 6.11 Role and Permissions
- Role defaults exist for all key personas
- Permission grants/revokes can override role defaults
- Critical permissions include:
  - reports access
  - request delete
  - payment-line delete
  - contracts delete
  - settings admin/global staff
  - operational mutation

## 7) Data and Domain Model (High-Level)
### 7.1 Core Entities
- User: identity, role, grants/revokes, profile metadata
- Property: property identity and local configuration container
- Account: organization/client profile
- CRM Lead: stage-based opportunity record
- Request: accommodation/event/series booking request
- Event Agenda Row: date/time/venue/package/session components
- Contract: legal/commercial artifact linked to account/request
- Task: operational action item
- Tax/Room/Venue: property-level configuration entities

### 7.2 Data Characteristics
- Frontend uses local state with localStorage persistence for selected modules
- Backend uses JSON-file storage for current baseline APIs
- Property scoping is enforced for selected data sets (requests, CRM, accounts)
- APIs currently allow broad CORS for development flexibility

## 8) Integrations and External Dependencies
### 8.1 Frontend Stack
- React 18 + TypeScript + Vite
- Tailwind CSS
- Lucide React icons
- Recharts visualization
- Export/document libraries: jsPDF, jsPDF AutoTable, docxtemplater, mammoth, pizzip, xlsx

### 8.2 Backend Stack
- FastAPI backend (`/api/*`)
- JSON file persistence
- Router modules for auth, users, properties, rooms, venues, taxes, financials, requests, crm-state

### 8.3 API Highlights
- `POST /api/login`
- `GET /api/requests`
- `POST /api/requests`
- `DELETE /api/requests/{req_id}`
- `GET /api/health`

## 9) User Workflows
### 9.1 Lead to Request to Event Flow
1. User captures or updates lead in CRM
2. User creates request from account context
3. Request progresses through statuses (Inquiry -> Accepted/Tentative -> Definite -> Actual)
4. Event details, agenda, and BEO are prepared
5. Contract and payments are managed to completion

### 9.2 Daily Operations Flow
1. User opens dashboard and reviews KPI exceptions
2. User checks task/load and pending events/requests
3. User updates statuses, notes, and calls
4. Leadership reviews report snapshots and period progress

### 9.3 Admin Setup Flow
1. Admin configures property-level data (venues, rooms, taxes)
2. Admin manages users and role/permission assignments
3. Admin aligns taxonomy options for segment/account type/package structures

## 10) Non-Functional Requirements
### 10.1 Performance
- Initial dashboard route should load within acceptable UX thresholds under typical dataset size
- Interactive UI actions (kanban drag, filter changes, chart toggles) should remain responsive

### 10.2 Reliability
- Core CRUD actions must provide deterministic feedback (success/error)
- Local fallback behavior should avoid data loss in transient backend issues where possible

### 10.3 Security
- Passwords must never be returned in API responses
- Role and permission checks must gate destructive/sensitive operations
- Sensitive production-grade controls (token security, hashing policy, CORS hardening) are required before broad release

### 10.4 Maintainability
- Modular architecture by business domain (CRM, Requests, Contracts, Reports, Settings)
- Shared utility functions for financial and BEO calculations
- TypeScript typing for safer refactoring

### 10.5 Accessibility and Usability
- Visual hierarchy for quick operational scanning
- Consistent status color semantics across modules
- Form controls and CTA actions should be keyboard reachable and clearly labeled

## 11) Reporting and Analytics Requirements
- KPI panel must include volume, value, and conversion-relevant indicators
- Time-period filtering must support strategic and tactical review modes
- Request distribution and account mix should be visible in chart form
- Event-centric metrics should include attendance, average event value, and pipeline value

## 12) Assumptions and Constraints
### 12.1 Assumptions
- Teams operate within property-specific ownership contexts
- Internet access available for cloud-hosted visual assets currently used by landing page
- Users understand hospitality commercial terminology (MICE, BEO, pipeline statuses)

### 12.2 Constraints
- Current backend persistence is file-based (not yet full relational production architecture)
- Some modules use mock/seed logic and require API hardening for production
- Permission model depends on correct user role/grant configuration

## 13) Risks and Mitigations
- Risk: Data consistency across localStorage and backend writes
  - Mitigation: Add sync reconciliation strategy and conflict policy
- Risk: Security posture not production-hard by default
  - Mitigation: implement password hashing, strict auth tokens, restricted CORS, audit logs
- Risk: Monolithic frontend file complexity can slow delivery
  - Mitigation: continue modular extraction by domain and shared hooks
- Risk: Operational misuse by incorrect role grants
  - Mitigation: permission review checklist and admin governance workflow

## 14) Acceptance Criteria (System-Level)
- User can authenticate and access only allowed features per role
- User can create, update, and track requests through lifecycle states
- User can manage CRM leads and sales activities per property
- User can view dashboard KPIs and switch period modes without UI breakage
- User can generate/report outputs and access controls are enforced
- Admin can configure core property data and staff permissions
- Core API health endpoint is reachable and key CRUD routes operate correctly

## 15) Release Readiness Checklist
- Functional regression checks complete for all major modules
- Role-based access checks passed for each persona
- Data migration/backfill checks complete for property-scoped records
- Error handling and user messages validated for top failure paths
- Build pipeline passes (`npm run build`) and app starts (`npm run dev`)
- Backend API health check returns expected status

## 16) Future Enhancements (Post V2.0)
- Production-grade authentication and session management
- Relational database migration with audit/versioning support
- Deep integrations (PMS/CRS/Channel Manager/Email automation)
- Workflow automation rules and SLA tracking
- AI-assisted forecasting and lead scoring
- Native mobile companion for field sales and managers

## 17) Appendix: Permission Catalog (Current)
- `reports.access`
- `tasks.deleteAny`
- `accounts.delete`
- `contracts.delete`
- `requests.delete`
- `requests.deletePayments`
- `crm.deleteCalls`
- `accounts.timelineManual`
- `mutate.operational`
- `settings.admin`
- `settings.globalStaff`

---
This document is the updated full-detail product specification baseline for the current V2.0 codebase and should be revised after any major workflow, permission, or architecture change.
