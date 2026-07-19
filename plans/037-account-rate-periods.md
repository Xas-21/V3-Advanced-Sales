# Plan 037: Account rate periods (configure + apply on new requests only)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 90c3a4c..HEAD -- CRMProfileView.tsx RequestsManager.tsx AccommodationRequestModal.tsx EventWithRoomsRequestModal.tsx SeriesGroupRequestModal.tsx propertyOccupancyTypes.ts propertyTaxonomy.ts backend/data_access.py backend/main.py backend/routers/promotions.py backend/migrations/001_normalized_schema.sql AS.tsx AccountsPage.tsx CRM.tsx`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Status**: DONE (2026-07-18)
- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (independent of Batch G open items)
- **Category**: direction
- **Planned at**: commit `90c3a4c`, 2026-07-18
- **Notion**: `[037] Account rate periods`

## Why this matters

**Plain language:** Sales already opens an account profile and hits **Rates**, but it only says “Coming Soon.” They need to store contracted room rates by date period, room type, and occupancy (Single/Double/…), tied to one or more **request segments**. When they create a **new** request for that account, matching dates + room type + occupancy + segment should fill the rate automatically; the user can still edit it. Old requests must keep whatever rates they already saved.

**Technical:** There is no account-rate store today. Request room rows already hold a snapshot `rate` number (`RequestsManager` draft `rooms[].rate`). Promotions already encode the matching pattern (account + segment + date window). Reuse that matching idea for rates; persist rates as a new property-scoped flat collection; apply lookup only on **new/draft** room rows — never rewrite rates on existing request documents.

## Current state

Facts the executor needs (inline):

### 1. Rates button is a stub

`CRMProfileView.tsx` — account profile header has a **Rates** button that opens a “Coming Soon” modal:

```641:651:CRMProfileView.tsx
                    <button
                        type="button"
                        onClick={() => setShowRatesComingSoon(true)}
                        className="px-4 py-2 rounded border font-bold flex items-center gap-2 hover:opacity-90 transition-opacity"
                        ...
                    >
                        Rates
                    </button>
```

```1664:1711:CRMProfileView.tsx
            {showRatesComingSoon && (
                ...
                            Account Rates
                        ...
                            Rate management for this account is under development. Check back later.
```

Profile is used from `AccountsPage.tsx` and `CRM.tsx`.

### 2. Request room rates are already a snapshot field

`RequestsManager.tsx` default accommodation draft:

```287:312:RequestsManager.tsx
    accountId: '',
    ...
    rooms: [{ id: Date.now(), type: '', occupancy: 'Single', count: 1, rate: 0, mealPlan: 'RO' }],
    ...
    segment: '',
```

Room rate is editable in the create form (`updateRoom(..., 'rate', ...)` ~L3328). Financials use `rooms[].rate × count × nights`. **Once saved on the request, that number is the source of truth** — do not re-link to live account rates on edit/load.

### 3. Occupancy + room types already exist

- Occupancy labels: `propertyOccupancyTypes.ts` → `resolveOccupancyTypesForProperty` (defaults `Single`, `Double`, `Triple`, `Quad`).
- Request segments: `propertyTaxonomy.ts` → `resolveSegmentsForProperty`.
- Property room type names: loaded in `RequestsManager` via `GET /api/rooms?propertyId=…` into `propertyRoomNames` (~L1435, L528).

### 4. Segment + date matching exemplar (promotions)

```435:448:RequestsManager.tsx
    const matchingPromotionsForDraft = useCallback((formData: any, typeKeyRaw: string) => {
        const segmentKey = String(formData?.segment || '').trim().toLowerCase();
        const accountId = String(formData?.accountId || '').trim();
        const w = reqWindowForPromotion(formData, typeKeyRaw);
        return effectivePromotionOptions.filter((promo: any) => {
            if (!segmentKey || !accountId) return false;
            const segmentOk = (promo?.segments || []).some((s: string) => String(s || '').trim().toLowerCase() === segmentKey);
            ...
            return overlapsPromoWindow(w.start, w.end, pStart, pEnd);
        });
    }, ...);
```

**Reuse this overlap + segment matching for rates.** Do not invent a second date algorithm.

### 5. Flat CRUD pattern to copy

- Router exemplar: `backend/routers/promotions.py` (GET/POST/DELETE + `list_flat` / `upsert_flat` / `delete_flat`).
- Register in `backend/main.py` like promotions.
- Add table name to `_FLAT_WITH_PID` + `_EXTRACTORS` in `backend/data_access.py`.
- Schema: add `CREATE TABLE` via a new migration under `backend/migrations/` (next number after `010_…`) **and** append to `backend/migrations/001_normalized_schema.sql` for fresh installs. **Before writing SQL**, inspect the live shape of `promotions`/`tasks` (`\d promotions` in `as-postgres`, or `information_schema.columns`) and match columns (`payload` jsonb + typed cols + `created_at`/`updated_at` if present). If flats no longer use `payload`, STOP (see STOP conditions).

### 6. Accounts have no rate fields

`_row_to_account_dict` / `upsert_account` only handle typed account columns + contacts/activities — **not** rates. Do **not** stuff rates into the account row (avoids wipe on partial account saves). Use a separate collection keyed by `accountId` + `propertyId`.

## Product rules (locked — do not reinterpret)

| Rule | Behavior |
|------|----------|
| Period | `startDate` / `endDate` (YYYY-MM-DD inclusive) on one account |
| Row | `roomType` (string = property room `name`) + `occupancy` (property occupancy label) + `rate` (number ≥ 0) |
| Segments | Each period has `segments: string[]` (1+ request segments). Empty segments → period never matches |
| Lookup | Match `accountId` + request `segment` ∈ period.segments (case-insensitive trim) + stay window overlaps period + exact roomType + occupancy |
| No match | Auto rate = leave `0` / do not fill (user types manually) |
| Multi match | Prefer **narrowest** period (shortest `end−start`), then latest `updatedAt` / id |
| New requests only | Apply lookup when creating/editing a **draft that is not an existing persisted request**. On hydrate-for-edit / open existing request: **never** overwrite `rooms[].rate` from catalog |
| Manual override | User can edit rate in the request form after autofill. Changing room type / occupancy / dates / segment on a **new** draft re-runs lookup for that row (unless you keep a per-row `rateTouched` flag — preferred: re-lookup only when type/occupancy/dates/segment change, not when user is typing rate) |
| Duplicate request | Keep hydrated rates from source request; do **not** re-apply catalog |
| Existing requests | Catalog create/update/delete must not mutate any stored request |

Occupancy is **not** hardcoded to Single/Double only — use the property occupancy list (includes Single/Double by default).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Frontend unit | `npm run test:frontend` | exit 0; new `accountRates.test.ts` cases pass |
| Backend | `npm run test:backend` | exit 0; new account-rates tests pass |
| Full | `npm test` | exit 0 |
| Type/build | `npm run build` | exit 0 |
| Manual API smoke | With API up: `GET /api/account-rates?propertyId=…&accountId=…` | JSON array |

## Suggested executor toolkit

- Match existing modal styling in `CRMProfileView` (theme `colors`, fixed overlay, `z-[70]` / nested higher).
- Reuse promotion segment multi-select UX from `PromotionsPage.tsx` (~L547–556) for period segments.
- Pure lookup helper must be unit-tested like `accountProfileData.test.ts` (vitest).

## Scope

**In scope** (only these — create as needed):

- `backend/migrations/011_account_rates.sql` (or `.py` matching repo migration style) + update `backend/migrations/001_normalized_schema.sql`
- `backend/data_access.py` — register `account_rates` in `_FLAT_WITH_PID` + extractor
- `backend/routers/account_rates.py` (new) — clone promotions router; optional `accountId` query filter on GET
- `backend/main.py` — include router
- `backend/tests/test_account_rates.py` (new) — CRUD + tenant scoping smoke
- `accountRates.ts` (new) — types + `lookupAccountRoomRate(...)` + normalize helpers
- `accountRates.test.ts` (new)
- `AccountRatesModal.tsx` (new) — periods list → period detail matrix → nested add/edit row modal
- `CRMProfileView.tsx` — replace Coming Soon with real modal; pass accountId / propertyId / options
- `AccountsPage.tsx` / `CRM.tsx` — pass `activeProperty`, `segmentOptions`, room-type names (or let modal fetch `/api/rooms` + `/api/account-rates`)
- `AS.tsx` — load/live-refresh `accountRates` **or** let modal fetch on open (Ponytail: **fetch on modal open** to avoid AS shell bloat; RequestsManager needs rates for the active draft account — fetch when `accountId` set on new draft, cache in component state)
- `RequestsManager.tsx` — wire autofill for new accommodation / series / event_rooms drafts only
- `plans/README.md` — status update when executing

**Out of scope** (do NOT touch):

- Backfilling or rewriting rates on existing requests
- Event-only agenda rates / F&B package pricing
- Changing promotions logic
- Hub analytics / Reports rate dashboards
- Hardcoding only Single+Double columns (use occupancy list; UI may show one rate column per occupancy present in the period’s rows)
- New npm dependencies
- Marketing / landing redesign skills

## Git workflow

- Branch: `advisor/037-account-rate-periods`
- Commits: focused conventional-style messages matching recent history (e.g. `Add account rate periods and apply on new requests.`)
- Do NOT push or open a PR unless the operator asks.

## Steps

### Step 1: Schema + API for `account_rates`

Document shape (frontend camelCase; store full doc in `payload` if that is the flat pattern):

```ts
type AccountRatePeriod = {
  id: string;              // e.g. AR…
  propertyId: string;
  accountId: string;
  startDate: string;       // YYYY-MM-DD
  endDate: string;
  segments: string[];      // request segments this period applies to
  rows: Array<{
    id: string;
    roomType: string;
    occupancy: string;
    rate: number;
  }>;
  updatedAt?: string;
};
```

1. Inspect live `promotions`/`tasks` columns; create `account_rates` the same way.
2. Typed columns at minimum: `property_id`, `account_id`, `start_date`, `end_date`, `segments` (jsonb), plus `payload` if required by `_upsert_doc`.
3. Router `GET/POST/DELETE /api/account-rates` with `propertyId` (+ filter `accountId` on GET).
4. Authz: existing `_assert_upsert_write_access` / tenant filter via `_FLAT_WITH_PID`.

**Verify**: `npm run test:backend` with a new test that creates a period for property A, lists it filtered by accountId, denies cross-tenant write (mirror `test_flat_list_tenant.py` patterns).

### Step 2: Pure lookup helper + tests

Create `accountRates.ts`:

```ts
lookupAccountRoomRate(args: {
  periods: AccountRatePeriod[];
  accountId: string;
  segment: string;
  stayStart: string;  // check-in
  stayEnd: string;    // check-out (or check-in if empty)
  roomType: string;
  occupancy: string;
}): number | null
```

Rules: segment required; overlap like promotions; case-insensitive string match for roomType/occupancy/segment; return `null` when no match.

**Verify**: `npx vitest run accountRates.test.ts` → all cases green (match, segment miss, date miss, occupancy miss, multi-period narrowest wins).

### Step 3: Account Rates UI (replace Coming Soon)

Replace `showRatesComingSoon` UI with `AccountRatesModal`:

1. **Level 1 — Periods list** (small popup): list periods for this `accountId` (`from → to`, segment chips). Buttons: Add period, Close.
2. **Add/Edit period**: date from/to + multi-select segments (property segment options). Save via `POST /api/account-rates`.
3. **Level 2 — Period detail** (click period): table/list of rows — room type | occupancy | rate. Button **Add room rates**.
4. **Level 3 — Nested smaller popup**: room type `<select>` (from `/api/rooms` names), occupancy `<select>` (`resolveOccupancyTypesForProperty`), rate number. Save appends/updates `rows` on the period document then POST.
5. Delete period / delete row with confirm. Honor `readOnly` on profile (hide mutate controls).

Match existing overlay/theme patterns in `CRMProfileView`; nested modal `z-index` above parent.

**Verify**: Manual — open account → Rates → add period + row → reload profile → data still there. `npm run build` exits 0.

### Step 4: Autofill on new requests only (`RequestsManager`)

1. When draft is **new** (not hydrate-for-edit of existing id): if `accountId`, `segment`, stay dates, and a room’s `type`+`occupancy` are set, call `lookupAccountRoomRate` and set `rate` when lookup returns a number.
2. Triggers: change of account, segment, check-in/out, room type, occupancy (and when adding a room row).
3. **Do not run** inside `hydrateFormsFromRequest` for edit. For duplicate, keep copied rates.
4. User can still edit the rate input manually after fill.
5. Fetch periods: `GET /api/account-rates?propertyId=&accountId=` when account selected on a new draft; keep in local state (Ponytail — no global AS store required).

Optional thin wire in `AccommodationRequestModal` / series / event_rooms **only if** those modals are still used as create entry points; primary path is `RequestsManager` drafts. If unused for create, skip.

**Verify**:

- Create new request: matching catalog → rate autofills; change occupancy to unmatched → rate clears to 0 or stays editable without wrong rate.
- Open existing request that had rate 500 while catalog now says 900 → still shows 500.
- `npm run test:frontend` + `npm run build` exit 0.

### Step 5: Account merge + delete hygiene (minimal)

- On account **delete**, DB should CASCADE or executor deletes `account_rates` rows for that `accountId` (if no FK, delete in `delete_account` path).
- On account **merge** (`accountMergeUtils` / merge handler): reassign source periods’ `accountId` to destination (or copy then delete source). Do not leave orphan rates on deleted source id.

**Verify**: backend test or manual merge/delete leaves no orphan rows for deleted account id.

### Step 6: Index + graphify

- Update `plans/README.md` status to DONE when implementation is complete (executor).
- Run `graphify update .` after code changes.

## Test plan

| Case | Where |
|------|--------|
| Lookup happy path | `accountRates.test.ts` |
| Segment mismatch → null | `accountRates.test.ts` |
| Date no overlap → null | `accountRates.test.ts` |
| Narrowest period wins | `accountRates.test.ts` |
| API create/list/delete + tenant | `backend/tests/test_account_rates.py` |
| Existing request rate unchanged | Manual / optional frontend test with hydrate path stub |

Pattern: model vitest file after `accountProfileData.test.ts`; backend after `test_flat_list_tenant.py`.

## Done criteria

Machine-checkable. ALL must hold:

- [x] `npm run test:frontend` exits 0 with `accountRates.test.ts` covering match / miss / multi-period
- [x] `npm run test:backend` exits 0 with account-rates CRUD/tenant coverage
- [x] `npm run build` exits 0
- [x] Rates button opens real period UI (not “Coming Soon” copy)
- [x] New request autofill works for account+segment+dates+room+occupancy; manual edit still possible
- [x] Editing an existing request does not pull new catalog rates into saved room rows
- [x] No files outside Scope modified (`git status`)
- [x] `plans/README.md` status row updated

## Checklist

- [x] DB table + migration for `account_rates`
- [x] API router registered (`/api/account-rates`)
- [x] `lookupAccountRoomRate` helper + unit tests
- [x] Account Rates modal: periods list → detail → add room rate nested form
- [x] Segment multi-link on each period
- [x] Autofill on new RequestsManager drafts only
- [x] Existing requests untouched (snapshot stays)
- [x] Merge/delete hygiene for rate rows
- [x] Backend + frontend tests green; build green

## STOP conditions

Stop and report back (do not improvise) if:

- Drift check shows in-scope files diverged from excerpts above.
- Live `promotions`/`tasks` table shape cannot support a new flat collection the same way (e.g. `payload` missing and typed-only path unclear).
- Autofill appears to require rewriting `upsert_request` / request child room tables beyond setting draft `rooms[].rate` in the UI.
- Product owner requires **retroactive** rate updates on existing requests (contradicts this plan — escalate).
- A step’s verification fails twice after a reasonable fix attempt.
- Fix appears to require large Hub/Reports redesign or new pricing engines for events/F&B.

## Maintenance notes

- Reviewers: confirm **no request payload mutation** when catalog rates change; confirm segment empty ⇒ no match.
- Future: bulk import rates, currency per rate, weekday vs weekend — out of v1.
- If account rates lists get large, add server-side `accountId` index (`ix_account_rates_account`).
- Account merge must keep knowing about `account_rates` the same way it knows contacts.
