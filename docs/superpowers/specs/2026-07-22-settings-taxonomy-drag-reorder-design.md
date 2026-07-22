# Settings taxonomy drag-and-drop reorder

**Date:** 2026-07-22  
**Status:** Approved — implemented  
**Scope:** Manage Property → Room Types, Occupancy types, Venues, Segments, Account types

## Problem

Request forms (and related selects) show room types, venues, segments, account types, and occupancy types in the order returned from Manage Property settings. Today:

- **Segments, account types, occupancy types** are string arrays — order is already meaningful when saved, but the Settings UI has no drag reorder.
- **Room types and venues** are flat collection rows listed by `updated_at DESC, id ASC`, so there is no stable user-controlled order. Editing a row can change its position.

Users need to drag rows to set display order. Order must auto-save on drop. Existing requests must keep the same selected values (by name/id), not remap by list index.

## Goals

1. Drag-and-drop reorder on these Manage Property lists:
   - Room Types table
   - Occupancy types list (same Room Types tab)
   - Venues table
   - Segments list
   - Account types list
2. Persist new order automatically on drop (no separate Save Order button).
3. Reorder only affects **option order** in selects / UI lists.
4. Existing request (and account) data that stores labels by **name** (e.g. `room.type = "Superior"`) must be unchanged when order changes.

## Non-goals

- Renaming / merging room types or taxonomy labels (separate flows).
- Remapping or migrating existing request rooms, venues, segments, or occupancy fields.
- Adding a new DnD library (`@dnd-kit`, etc.).
- Reordering unrelated Settings lists (taxes, meals, packages, form sections).

## Identity vs position (invariant)

| Entity | Stored on request / consumer | Reorder means |
|--------|------------------------------|---------------|
| Room type | `room.type` string (name) | Options reorder; `"Superior"` stays `"Superior"` |
| Occupancy | occupancy label string | Same |
| Venue | venue id / name on agenda | Same |
| Segment | segment label string | Same |
| Account type | account type label string | Same |

**Forbidden:** any code path that rewrites existing request/account rows when settings order changes.  
**Allowed:** new drafts may default to the new first option (already uses `propertyRoomNames[0]` etc.).

## Approach (approved)

Native HTML5 drag-and-drop (same family as CRM kanban), no new dependency. Persist `sortOrder` on room/venue payloads; reorder string arrays for taxonomy lists.

## Data model

### Rooms and venues

- Add optional numeric `sortOrder` inside the existing JSON **payload** (no DB migration required; payload is already the document).
- On list (`GET /api/rooms`, `GET /api/venues`): return rows sorted by `sortOrder` ascending; missing/`null` sorts as `Number.MAX_SAFE_INTEGER` (legacy rows after explicitly ordered ones); ties broken by `id ASC`.
- On reorder drop: update in-memory list, assign `sortOrder = 0..n-1`, then sequentially `POST` each row via existing `/api/rooms` or `/api/venues` save endpoints. Auto-save; no request mutation.

Implementation note: apply this sort in the rooms/venues list path (router after `list_flat`, or shared helper) so Settings, RequestsManager, and Hub all see the same order.

### Segments, account types, occupancy types

- Already ordered arrays on the property (`segments`, `accountTypes`, `occupancyTypes`) with existing savers:
  - `saveSegmentsForProperty`
  - `saveAccountTypesForProperty`
  - `saveOccupancyTypesForProperty`
- On drop: rearrange array → call the existing saver (already patches property + localStorage + change event).

## UI

**Location:** `Settings.tsx` Manage Property tabs (Room Types, Venues, Segments & account types).

**Interaction:**

- Grip handle (or whole row where safe) is `draggable`.
- Disable drag while a row is in inline edit mode (segments / account types / occupancy).
- On `dragover` / `drop`: reorder local state; on successful drop persist immediately.
- Visual: cursor + subtle drop indicator; match existing Luxury/Light/Desert theme tokens (no new design system).
- Short helper text once per list: e.g. “Drag to set order used in request forms.”

**Room Types table / Venues table:** drag handle column; keep Edit/Delete as today (click targets must not start a drag accidentally — use handle-only drag).

## Backend / API

- Reuse existing POST upsert for rooms/venues; include `sortOrder` in body.
- Optional: dedicated `POST /api/rooms/reorder` — **not** required if sequential upserts are acceptable (preferred for minimal surface).
- List sort by `sortOrder` as above.
- No changes to request write paths.

## Frontend consumers

- `RequestsManager` already builds `propertyRoomNames` from `/api/rooms` array order — once list is sorted by `sortOrder`, selects follow Settings order without remapping existing `room.type` values.
- Venue options likewise follow `/api/venues` order.
- Segment / account type / occupancy selects already use array order from property helpers.

## Error handling

- If a persist call fails mid-reorder: keep UI at the attempted order but surface a brief error (toast/alert consistent with Settings); optionally refetch to resync.
- ponytail: sequential POSTs for N rooms — fine for typical property sizes (< ~50); if that becomes slow, add a bulk reorder endpoint later.

## Testing

- Small unit/self-check: sort helper places `sortOrder` correctly and treats missing values as last.
- Manual: reorder Superior from last → first; open an existing request that had Superior selected — value still Superior; new request dropdown shows Superior first.
- Manual: reorder occupancy / segment / account type / venue; existing labels unchanged; new selects reflect order.

## Implementation sketch (files)

| Area | Touch |
|------|--------|
| List sort | `backend/data_access.py` and/or `rooms.py` / `venues.py` |
| UI + drag | `Settings.tsx` (Room Types, Occupancy, Venues, Segments, Account types) |
| Taxonomy persist | reuse `propertyTaxonomy.ts`, `propertyOccupancyTypes.ts` |
| Room/venue persist | existing save handlers in Settings + `sortOrder` field |
| Check | small sort helper test or assert demo |

## Success criteria

1. All five lists support drag reorder with auto-save on drop.
2. Request/select option order matches Settings top→bottom order.
3. Existing requests keep the same room type / occupancy / venue / segment / account type labels after reorder.
4. No new npm dependency; no request data migration.
