# Rate Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a property Rate Structure catalog (plans, periods, room/meal/occupancy prices) under Promotions, let a request pick one plan, and show prices, coverage, and plan-use charts.

**Architecture:** Plans are their own `rate_plans` rows (payload JSON for periods and lines), same flat CRUD as promotions. A pure `ratePlans.ts` module owns lookup, reprice targeting, and chart math. The request form applies that module only when a plan is selected; account rates stay as they are when the dropdown is on “Choose your rate plan”.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, Recharts, Vitest, FastAPI, Postgres JSON payload, pytest.

**Global Constraints:**
- Chosen plan wins. Account rates apply only when no plan is selected, and only on new drafts (existing rule). A missing account rate must not set a typed rate to 0.
- After a plan is selected, changing the plan or the stay dates reprices every room. Changing one room’s type, occupancy, or meal plan reprices that room only. A hand-typed number is replaced only by those changes.
- Opening or hydrating a saved request does not change stored rates. A removed plan does not reprice; the dropdown shows the saved code and name as no longer available.
- No matching plan price leaves the rate in place and shows “No price on this plan for this room”. Never write 0 for a blank price. A typed 0 is a real price.
- Overlapping periods: shorter window wins; equal length, most recently saved wins.
- A period cannot keep two lines with the same room type and meal plan; saving again updates that line.
- Occupancy columns and meal plans come from the property. Menu and create/edit/delete use the same permissions as Promotions. Anyone who can edit a request can pick a plan.
- Charts are in this version: prices, coverage, plan use. Cancelled requests are excluded from plan use. Room revenue is saved rate × count × nights, before tax.
- Do not change event package prices, meeting rental, on-screen tax totals, or account-rate storage except the “only when no plan is selected” guard.

---

### Task 1: Pure lookup, reprice target, and chart math

**Files:**
- Create: `ratePlans.ts`
- Create: `ratePlans.test.ts`

- [x] Implement normalize, lookup (shorter period, then latest `updatedAt`, blank vs 0), `ratePlanTouch`, coverage, price rows, and plan-use stats.
- [x] Tests cover shorter-period win, equal-length latest win, 0 vs blank, missing combo, touch-all vs one room, coverage holes, cancelled requests excluded.

### Task 2: Backend records

**Files:**
- Create: `backend/migrations/020_rate_plans.sql`
- Create: `backend/routers/rate_plans.py`
- Create: `backend/tests/test_rate_plans.py`
- Modify: `backend/data_access.py`
- Modify: `backend/main.py`

- [x] Table `rate_plans` (`id`, `property_id`, `code`, `name`, `payload`, timestamps).
- [x] GET/POST/DELETE `/api/rate-plans`, property scoped, same auth as promotions. Periods stay in the payload.

### Task 3: Rate Structure page and menu

**Files:**
- Create: `RateStructurePage.tsx`
- Modify: `AS.tsx`
- Modify: `userPermissions.ts`

- [x] Menu item directly under Promotions, same visibility as Promotions. View id `rate_structure`.
- [x] List plans, add plan (code + name), add period, rates grid (room type, meal plan, one price per occupancy), three charts.

### Task 4: Request dropdown and reprice

**Files:**
- Modify: `RequestsManager.tsx`

- [x] Section 1 dropdown, default “Choose your rate plan”. Store `ratePlanId`, `ratePlanCode`, `ratePlanName`.
- [x] Snapshot on hydrate so opening a request does not reprice. Apply the touch rules after that. Skip account-rate autofill while a plan id is set. Show the missing-price note. Do not reprice when the plan is gone.

### Task 5: Review

- [x] Run `ratePlans` unit tests. Confirm account-rate tests still pass. Read the request effect and confirm event package/rental code was not edited.
