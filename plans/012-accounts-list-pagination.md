# Plan 012: Paginate Accounts (and Contacts) list like Requests

> **Executor instructions**: Match Requests list UX patterns in `RequestsManager.tsx`. Ponytail — client-side slice only; no new backend API. Update `plans/README.md` when done.
>
> **Drift check**: `git diff --stat 90c3a4c..HEAD -- AccountsPage.tsx RequestsManager.tsx`

## Status

- **Status**: DONE (2026-07-15)
- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none (pairs well after `009`/`010` CPU prep; DOM win even alone)
- **Category**: perf
- **Planned at**: commit `90c3a4c`, 2026-07-15

## Why this matters

Requests **All list** only mounts one page of rows (`listPagedRequests` slice) with page size 20/50/100 and numbered pager controls. Accounts renders **every** filtered row in the DOM (`sortedFiltered.map` / `sortedContactRows.map`) — a long page that feels laggy even after stats/duplicate CPU fixes.

## Current state — Requests (exemplar)

- `RequestsManager.tsx:920-921` — `listPageSize` (`20 | 50 | 100`), `listCurrentPage`
- `:927-935` — `listTotalPages`, clamp page, `listPagedRequests = slice(...)`
- Table block footer ~7654–7679 — Prev / numbered pages / Next
- Header “Per page” select `:7501-7516`
- Only **paged** rows are passed into the table body (`listPagedRequests` at `:8391`)

## Current state — Accounts

- `AccountsPage.tsx:1242` — `{sortedFiltered.map(...)}` full list
- `:1293` — `{sortedContactRows.map(...)}` full contacts list
- Count text ~1042–1047 shows totals; **no** page / per-page controls

## Commands

| Purpose | Command | Expected |
|---------|---------|----------|
| Frontend tests | `npm run test:frontend` | exit 0 |
| Manual | Accounts with >30 rows | only one page of rows in DOM; pager 1,2,3…; per-page 30/60/100 |

## Scope

**In scope**: `AccountsPage.tsx` (Accounts tab + Contacts tab pagination UI + slice)  
**Out of scope**: Server-side account pagination API; virtualization libraries; changing profile/duplicate side panels; RequestsManager changes

## Page-size choices (product)

Use **30 | 60 | 100** (user request). Default **30**.  
(Do **not** copy Requests’ 20/50/100 unless product later asks to unify.)

## Steps

### Step 1: State + derived page slice

Add:

```ts
const [listPageSize, setListPageSize] = useState<30 | 60 | 100>(30);
const [listCurrentPage, setListCurrentPage] = useState(1);
```

For **accounts** tab data source `sortedFiltered`:

- `totalPages = max(1, ceil(length / pageSize))`
- `useEffect` clamp `listCurrentPage` when length/pageSize shrinks (copy Requests `:927-931` pattern)
- `pagedAccounts = sortedFiltered.slice((page-1)*size, page*size)`

For **contacts** tab: same pattern on `sortedContactRows` → `pagedContacts`.

Reset to page **1** when: search/filter/sort/`listTab`/pageSize changes (same idea as Requests `setPageSize` resetting page).

**Verify**: With 100+ accounts, `pagedAccounts.length <= listPageSize`.

### Step 2: Per-page control + “Showing X–Y”

Near existing search/filter header on the list view, add a **Per page** `<select>` (options 30/60/100) styled like Requests (`colors.border`, compact label).

Show subtitle hint: `Showing {from}–{to}` of total (from/to math like Requests `:7415-7421`).

**Verify**: Changing to 60 shows up to 60 rows; page resets to 1.

### Step 3: Bottom pager

Below the table (accounts and contacts), render Prev / page number buttons / Next:

- Disable Prev on page 1; Next on last page
- Number buttons: if many pages, follow Requests behavior (read live `RequestsManager` pager ~7640–7685 — window of page numbers if it truncates; if it shows all pages, match that for consistency unless list is huge — Ponytail: show all page buttons if `totalPages <= 12`, else show a simple window around current page)

**Verify**: Click page 2 → different rows; click account still opens profile.

### Step 4: Wire map to paged arrays only

Replace `sortedFiltered.map` with `pagedAccounts.map` and `sortedContactRows.map` with `pagedContacts.map`. Keep empty states on **full** filtered length === 0.

**Verify**: Inspect DOM row count ≈ page size, not full book.

## STOP conditions

- Profile / merge / incomplete drawers break → STOP; only change main list tables.
- Tempted to fetch pages from API → STOP; out of scope.

## Done criteria

- [ ] Accounts and Contacts lists paginated with 30/60/100 and page numbers
- [ ] Only current page rows mounted in the table body
- [ ] Filters/search still apply to full set; pager reflects filtered totals
- [ ] `npm run test:frontend` exit 0
- [ ] `plans/README.md` → DONE

## Maintenance

CPU prep plans `008`–`010` still run on the full filtered book (needed for sort/stats/duplicates). Pagination fixes **paint/DOM** cost. Keep both.
