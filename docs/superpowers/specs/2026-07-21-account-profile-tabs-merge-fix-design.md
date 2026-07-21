# Account Profile Tabs + Durable Account Merge

**Date:** 2026-07-21  
**Status:** Approved design — awaiting implementation plan  
**Author:** Brainstormed with user via superpowers:brainstorming

## 1. Problem / Goal

Two related account-profile problems:

1. **Merge does not stick** — Operators merge duplicate accounts (sometimes multiple times). After a while the **duplicate account row reappears** in the Accounts list (symptom A). Related data linked to the wrong duplicate (requests, sales calls) must also end up on the surviving account.
2. **Profile layout stretches** — Many contact persons on the profile expand the page and pull the performance chart layout with them. Contacts, Contracts, and Activity Timeline should move off the main overview into pill tabs matching the Accounts page (`Accounts` / `Contacts`).

### Goals

- Merge once → refresh / live sync → source account **does not** reappear.
- All linked **requests**, **sales calls**, **CRM pipeline leads**, **contracts**, **contacts**, **activities**, and **account rates** from the source attach to the destination.
- Account profile uses four pill tabs: **Overview · Contacts · Contracts · Activity Timeline**.
- Contacts tab shows a **table** with the same add / edit / delete / scan-upload actions as today.
- Overview no longer contains Contact Information, Contracts, or Activity Timeline sections; chart height stays independent of contact count.

### Out of scope

- New backend `POST /api/accounts/merge` endpoint (harden the existing client + util path instead).
- Redesigning Contracts or Activity Timeline visuals beyond moving them.
- Changing the Accounts **list** tabs (`Accounts` / `Contacts`).
- Duplicate-detector UX redesign (only ensure real merges stay deleted so the detector stops flagging resurrected rows).

## 2. Decisions (locked with user)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Merge failure symptom | **A** — duplicate account **reappears in the Accounts list** |
| 2 | Related data on merge | Verify/fix: requests + calls + any linked records must land on the surviving account |
| 3 | Tab chrome | Same pill buttons as Accounts list tabs (left-aligned under header) |
| 4 | Tab set | **A** — four pills: `OVERVIEW` (default) · `CONTACTS` · `CONTRACTS` · `ACTIVITY TIMELINE` |
| 5 | Approach | **1** — Harden merge durability + related-data coverage, then tab the profile in `CRMProfileView` |

## 3. Architecture

### 3.1 Merge — current path (keep, extend)

Shared helpers live in `accountMergeUtils.ts`. Call sites:

- `AccountsPage.tsx` → `handleMergeAccountIntoCurrent`
- `CRM.tsx` → `handleCrmMergeAccountIntoCurrent`

Today’s sequence (keep):

1. `applyAccountMergeInMemory` — merge account records; drop source; repoint requests + CRM leads.
2. `persistAccountMergeToBackend` — POST changed requests → POST CRM leads → POST merged account → reassign account rates → DELETE source.
3. Update React state only after persist succeeds; alert and abort on failure.
4. `repointContractRecordsForAccountMerge` (local contracts store).

### 3.2 Merge — gaps to close

| Gap | Effect | Fix |
|-----|--------|-----|
| Sales calls not repointed | Calls keep source `accountId` / company; after source delete they may not show under dest | Add `repointSalesCallsForAccountMerge` (id or company-name match → dest id + dest name). Include `salesCalls` in CRM persist payload (today POST often only sends `leads`, leaving prior `salesCalls` untouched). Update in-memory CRM sales-call state in both call sites. |
| Accounts live sync / `PUT /api/accounts/sync` | Stale client or race can **re-PUT** the deleted source and resurrect it after live refetch | After successful merge: tombstone source id for the property until next clean hydrate; filter tombstoned ids out of sync payloads and inbound live lists; never apply local state until persist succeeded (already true — keep). |
| Contracts only local | Acceptable for this scope | Keep `repointContractRecordsForAccountMerge`; document that contracts store is client-side. |
| Requests / leads / rates / contacts / activities | Mostly working | Keep and add focused tests so regressions are caught. |

### 3.3 Merge — target behavior

When merging source **S** into destination **D** (same property):

1. **Account record** — `mergeAccountRecords(D, S)`: contacts (deduped), activities, tags, fill-empty scalars; keep D id and name.
2. **Requests** — any request with S’s `accountId` or matching account name → D’s id + name (existing `repointRequestsForAccountMerge`).
3. **CRM pipeline leads** — same id/name rules (existing `repointCrmLeadsForAccountMerge`).
4. **Sales calls** — same id/company rules → D (new); persist with CRM state.
5. **Contracts** — remapped to D (existing local).
6. **Account rate periods** — reassigned to D before S delete (existing).
7. **Delete S** on server; remove from local `accounts` only after success.
8. **Anti-resurrection** — tombstone S; filter from sync PUT and live GET until hydrate clears tombstones for that property.

Both Accounts and CRM handlers must pass sales calls into the shared apply/persist path (extend types rather than duplicating logic).

### 3.4 Profile tabs — `CRMProfileView`

**Chrome:** Reuse Accounts list tab styling (`AccountsPage.tsx` ~1267–1288):

- `px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider`
- Active: `backgroundColor: colors.primary`, text `#000`, border primary
- Inactive: transparent bg, `colors.textMain`, border `colors.border`
- Left-aligned row under the profile header (above the scroll body)

**State:** `profileTab: 'overview' | 'contacts' | 'contracts' | 'timeline'`, default `'overview'`. Reset to overview when `leadIdentityKey` changes (same effect that already resets chart/merge UI).

**Content:**

| Tab | Shows | Does not show |
|-----|--------|----------------|
| Overview | Header actions, KPIs, performance chart, opportunities / inquiry–tentative, other non-moved summary blocks | Contact person list, Contracts card, Activity Timeline |
| Contacts | Contact-person **table** + toolbar | Accordion list |
| Contracts | Existing Contracts section moved as-is | — |
| Activity Timeline | Existing timeline moved as-is | — |

Only the active tab’s body mounts in the scroll area so contact count cannot stretch the Overview chart.

### 3.5 Contacts tab table

- Toolbar (when `!readOnly`): **Scan / Upload** (existing `onScanContactCard` flow), **+** add (existing modal).
- Table columns: Name · Position · Phone · Email · City · Actions.
- Row actions: **Edit** · **Delete** (existing modal + delete confirm).
- Empty: “No contact persons yet” (+ add/scan when allowed).
- Data path unchanged: `lead.contacts` via `onLeadChange` / existing save paths.

### 3.6 Overview layout after move

Remove the old layout coupling where Contact Information sat in a column that grew beside/above the chart. Overview becomes a single scroll of summary + chart + opportunities (and remaining non-moved blocks). No new Overview-only widgets.

## 4. Files (expected)

| File | Change |
|------|--------|
| `accountMergeUtils.ts` | Sales-call repoint; extend apply/persist inputs; optional tombstone helper export |
| `accountMergeUtils` tests (new or extend existing) | Merge contacts/requests/calls; persist payload includes salesCalls; tombstone filter |
| `AccountsPage.tsx` | Pass sales calls into merge; apply tombstone / filter after merge |
| `CRM.tsx` | Same merge wiring for sales calls |
| `AS.tsx` (minimal) | Honor tombstones in accounts sync PUT and/or live refetch apply if tombstones live at shell level |
| `CRMProfileView.tsx` | Pill tabs; move Contacts/Contracts/Timeline; Contacts table |
| `contractsStore.ts` | No API change expected (already has `repointContractRecordsForAccountMerge`) |

Exact tombstone storage location (module-level Set vs React ref in `AS.tsx`) is an implementation detail; behavior must match §3.3 step 8.

## 5. Error handling

- Persist failure: alert existing message; **do not** update local accounts/requests/CRM/salesCalls; no tombstone.
- Sales-call persist failure: same abort as request/CRM failure today.
- Missing `propertyId`: keep existing alert; no merge.

## 6. Testing / acceptance

1. Merge duplicate A→B → hard refresh → A absent from Accounts list; B has merged contacts.
2. Wait for live accounts sync / second client idle → A still absent.
3. Request linked only to A appears under B after merge.
4. Sales call linked only to A (by `accountId` or company name) appears under B’s timeline / sales filter after merge.
5. Profile: Overview has no Contact Information / Contracts / Timeline sections; chart stable with many contacts.
6. Contacts tab: table + add/edit/delete/scan work; read-only hides mutations.
7. Contracts and Activity Timeline tabs show previous content unchanged.
8. Switching accounts resets tab to Overview.

## 7. Non-goals reminder

No atomic server merge endpoint in this iteration. No Accounts list tab redesign. No visual redesign of Contracts/Timeline beyond relocation.
