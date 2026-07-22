# Settings taxonomy drag-and-drop reorder — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Drag-reorder Room Types, Occupancy types, Venues, Segments, and Account types in Manage Property; auto-save on drop; existing request labels unchanged.

**Architecture:** Native HTML5 DnD in `Settings.tsx`. Rooms/venues store `sortOrder` in payload; list endpoints sort by it. String taxonomies reorder via existing property savers.

**Tech Stack:** React/TS Settings UI, FastAPI rooms/venues list, existing property taxonomy helpers. No new npm deps.

## Global Constraints

- Auto-save on drop; no request data remapping (identity by name/id).
- No `@dnd-kit` / new DnD library.
- Handle-only drag on tables; disable drag while inline-editing string rows.

---

### Task 1: Sort helper + list API

**Files:**
- Create: `sortOrder.ts` (frontend helper used by Settings + test)
- Create: `sortOrder.test.ts`
- Modify: `backend/routers/rooms.py`, `backend/routers/venues.py` (or shared util in `backend/`)

- [ ] Add `sortBySortOrder(items)` — missing `sortOrder` → last; tie-break `id`
- [ ] Apply same sort on GET rooms/venues
- [ ] Test helper

### Task 2: Settings drag UI + persist

**Files:**
- Modify: `Settings.tsx`

- [ ] Shared list reorder helpers (move index, drag state)
- [ ] Room types table + occupancy list
- [ ] Venues table
- [ ] Segments + account types
- [ ] Persist: rooms/venues POST with `sortOrder`; strings via existing savers

### Task 3: Verify

- [ ] Run sortOrder test
- [ ] `graphify update .`
