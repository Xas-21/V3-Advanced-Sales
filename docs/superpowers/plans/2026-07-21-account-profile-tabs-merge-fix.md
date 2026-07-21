# Account Profile Tabs + Durable Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make account merges durable (no resurrected duplicates; sales calls/requests/leads stay on the survivor) and retab the account profile into Overview / Contacts / Contracts / Activity Timeline pills matching the Accounts list.

**Architecture:** Extend `accountMergeUtils` so CRM persist after merge writes `salesCalls` + `pipeline` (today only `leads` is POSTed, so the API keeps unrepointed `salesCalls`). Add property-scoped merge tombstones filtered out of accounts sync PUT and live refetch. In `CRMProfileView`, add Accounts-style pill tabs and move Contacts (as a table), Contracts, and Activity Timeline off Overview.

**Tech Stack:** React/TypeScript, Vitest (`npm run test:frontend`), existing `accountMergeUtils` / `crmStateModel` / `CRMProfileView` / `AS.tsx` accounts sync.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-21-account-profile-tabs-merge-fix-design.md`
- No new `POST /api/accounts/merge` endpoint
- Tab chrome must match Accounts list pills (`AccountsPage.tsx` ~1267–1288)
- Four tabs only: `overview` | `contacts` | `contracts` | `timeline`
- Contacts table keeps existing add/edit/delete/scan handlers — presentation move only
- Keep lint ≤ `--max-warnings 2319`; prefer no new `any` beyond existing patterns
- After code changes: `graphify update .`
- Do **not** merge or commit onto local `main` until the human explicitly approves

## File map

| File | Responsibility |
|------|----------------|
| `accountMergeUtils.ts` | Sales-call-aware CRM persist payload; merge tombstones + filter helpers |
| `accountMergeUtils.test.ts` | New Vitest coverage for persist payload + tombstones + lead/`new` repoint |
| `AS.tsx` | Filter tombstones on sync PUT + live accounts refetch; clear on property hydrate |
| `AccountsPage.tsx` / `CRM.tsx` | Register tombstone after successful merge (if not done inside persist helper) |
| `CRMProfileView.tsx` | Pill tabs; Contacts table; move Contracts + Timeline |

---

### Task 1: Fix merge CRM persist so sales calls stick

**Files:**
- Create: `accountMergeUtils.test.ts`
- Modify: `accountMergeUtils.ts`
- Modify: import `migrateLegacyLeads` from `crmStateModel.ts` inside `accountMergeUtils.ts`

**Interfaces:**
- Consumes: `migrateLegacyLeads(raw: Record<string, any[]>): { salesCalls: any[]; pipeline: ... }`
- Produces: `persistAccountMergeToBackend` POSTs `/api/crm-state` with `{ propertyId, salesCalls, pipeline }` derived from `nextCrmLeads` (not `{ leads }` alone)
- Produces: `applyAccountMergeInMemory` still returns `nextCrmLeads` with `new` (sales calls) and pipeline stages repointed via existing `repointCrmLeadsForAccountMerge`

**Why:** Backend `POST /api/crm-state` keeps previous `salesCalls` when the body omits `salesCalls` as a list. Merge currently sends only `leads`, so unrepointed calls survive on the server even though in-memory `crmLeads.new` was updated.

- [ ] **Step 1: Write failing tests**

Create `accountMergeUtils.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    applyAccountMergeInMemory,
    persistAccountMergeToBackend,
    repointCrmLeadsForAccountMerge,
} from './accountMergeUtils';

describe('account merge CRM + requests', () => {
    it('repoints sales calls in legacy new bucket and requests by accountId', () => {
        const accounts = [
            { id: 'dest', name: 'Acme', propertyId: 'p1', contacts: [{ email: 'a@x.com', firstName: 'A' }] },
            {
                id: 'src',
                name: 'Acme Dup',
                propertyId: 'p1',
                contacts: [{ email: 'b@x.com', firstName: 'B' }],
            },
        ];
        const sharedRequests = [
            { id: 'r1', accountId: 'src', account: 'Acme Dup', accountName: 'Acme Dup' },
            { id: 'r2', accountId: 'dest', account: 'Acme', accountName: 'Acme' },
        ];
        const crmLeads = {
            new: [{ id: 'c1', accountId: 'src', company: 'Acme Dup', subject: 'Call' }],
            waiting: [{ id: 'l1', accountId: 'src', company: 'Acme Dup' }],
            qualified: [],
            proposal: [],
            negotiation: [],
            won: [],
            notInterested: [],
        };

        const applied = applyAccountMergeInMemory({
            accounts,
            sharedRequests,
            crmLeads,
            destAccountId: 'dest',
            sourceAccountId: 'src',
        });
        expect(applied).not.toBeNull();
        expect(applied!.nextAccounts.map((a) => a.id)).toEqual(['dest']);
        expect(applied!.nextAccounts[0].contacts.length).toBe(2);
        expect(applied!.nextRequests.find((r) => r.id === 'r1')).toMatchObject({
            accountId: 'dest',
            account: 'Acme',
            accountName: 'Acme',
        });
        expect(applied!.nextCrmLeads.new[0]).toMatchObject({
            accountId: 'dest',
            company: 'Acme',
        });
        expect(applied!.nextCrmLeads.waiting[0]).toMatchObject({
            accountId: 'dest',
            company: 'Acme',
        });
    });

    it('persistAccountMergeToBackend POSTs salesCalls + pipeline from nextCrmLeads', async () => {
        const posts: { url: string; body: any }[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init?: RequestInit) => {
                const u = String(url);
                if (init?.method === 'POST' || init?.method === 'PUT') {
                    posts.push({ url: u, body: JSON.parse(String(init.body || '{}')) });
                }
                if (u.includes('/api/account-rates')) {
                    return { ok: true, status: 200, json: async () => [], text: async () => '' };
                }
                return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
            })
        );

        const nextCrmLeads = repointCrmLeadsForAccountMerge(
            {
                new: [{ id: 'c1', accountId: 'src', company: 'Old' }],
                waiting: [{ id: 'l1', accountId: 'src', company: 'Old' }],
                qualified: [],
                proposal: [],
                negotiation: [],
                won: [],
                notInterested: [],
            },
            'src',
            'Old',
            'dest',
            'New'
        );

        await persistAccountMergeToBackend({
            mergedAccount: { id: 'dest', name: 'New', propertyId: 'p1' },
            sourceAccountId: 'src',
            sourceAccountName: 'Old',
            nextRequests: [{ id: 'r1', accountId: 'dest', account: 'New', accountName: 'New' }],
            previousRequests: [{ id: 'r1', accountId: 'src', account: 'Old', accountName: 'Old' }],
            nextCrmLeads,
            propertyId: 'p1',
        });

        const crmPost = posts.find((p) => p.url.includes('/api/crm-state'));
        expect(crmPost).toBeTruthy();
        expect(crmPost!.body.leads).toBeUndefined();
        expect(Array.isArray(crmPost!.body.salesCalls)).toBe(true);
        expect(crmPost!.body.salesCalls[0]).toMatchObject({ accountId: 'dest', company: 'New' });
        expect(crmPost!.body.pipeline.waiting[0]).toMatchObject({ accountId: 'dest', company: 'New' });
    });
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npx vitest run accountMergeUtils.test.ts`

Expected: FAIL (missing test file and/or persist still sends `leads` without `salesCalls`).

- [ ] **Step 3: Implement persist fix**

In `accountMergeUtils.ts`:

1. Add: `import { migrateLegacyLeads } from './crmStateModel';`
2. Replace the CRM persist block inside `persistAccountMergeToBackend` (the fetch to `/api/crm-state`) with:

```ts
    const migratedCrm = migrateLegacyLeads(nextCrmLeads);
    const crmRes = await fetch(apiUrl('/api/crm-state'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            propertyId: pid,
            salesCalls: migratedCrm.salesCalls,
            pipeline: migratedCrm.pipeline,
        }),
    });
    if (!crmRes.ok) {
        const t = await crmRes.text().catch(() => '');
        throw new Error(`Failed to persist CRM state: ${crmRes.status} ${t}`);
    }
```

Do not send a bare `leads` payload for merge.

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run accountMergeUtils.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add accountMergeUtils.ts accountMergeUtils.test.ts
git commit -m "fix: persist repointed salesCalls on account merge"
```

Commit only on branch `feat/account-profile-tabs-merge-fix`. Do not merge to `main`.

---

### Task 2: Merge tombstones (anti-resurrection)

**Files:**
- Modify: `accountMergeUtils.ts`
- Modify: `accountMergeUtils.test.ts`

**Interfaces:**
- Produces:
  - `rememberMergedAccountTombstone(propertyId: string, accountId: string): void`
  - `clearMergedAccountTombstones(propertyId: string): void`
  - `filterAccountsExcludingMergeTombstones(accounts: any[], propertyId: string): any[]`
- After successful DELETE in `persistAccountMergeToBackend`, call `rememberMergedAccountTombstone(pid, sid)`

**Why:** `AS.tsx` `PUT /api/accounts/sync` and live refetch can reintroduce a deleted source from a stale list or race.

- [ ] **Step 1: Write failing tombstone tests**

Append to `accountMergeUtils.test.ts`:

```ts
import {
    rememberMergedAccountTombstone,
    clearMergedAccountTombstones,
    filterAccountsExcludingMergeTombstones,
} from './accountMergeUtils';

describe('merge tombstones', () => {
    beforeEach(() => {
        clearMergedAccountTombstones('p1');
    });

    it('filters tombstoned account ids for a property', () => {
        rememberMergedAccountTombstone('p1', 'src');
        const list = [
            { id: 'dest', name: 'Acme' },
            { id: 'src', name: 'Acme Dup' },
        ];
        expect(filterAccountsExcludingMergeTombstones(list, 'p1').map((a) => a.id)).toEqual(['dest']);
        expect(filterAccountsExcludingMergeTombstones(list, 'p2').map((a) => a.id)).toEqual(['dest', 'src']);
    });

    it('clearMergedAccountTombstones restores visibility', () => {
        rememberMergedAccountTombstone('p1', 'src');
        clearMergedAccountTombstones('p1');
        expect(
            filterAccountsExcludingMergeTombstones([{ id: 'src' }], 'p1').map((a) => a.id)
        ).toEqual(['src']);
    });
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npx vitest run accountMergeUtils.test.ts`

Expected: FAIL (exports missing).

- [ ] **Step 3: Implement tombstone helpers + register on persist success**

Add near top of `accountMergeUtils.ts` (module scope):

```ts
/** propertyId -> deleted account ids that must not be re-synced until hydrate clears. */
const mergeTombstonesByProperty = new Map<string, Set<string>>();

export function rememberMergedAccountTombstone(propertyId: string, accountId: string): void {
    const pid = String(propertyId || '').trim();
    const aid = String(accountId || '').trim();
    if (!pid || !aid) return;
    let set = mergeTombstonesByProperty.get(pid);
    if (!set) {
        set = new Set();
        mergeTombstonesByProperty.set(pid, set);
    }
    set.add(aid);
}

export function clearMergedAccountTombstones(propertyId: string): void {
    const pid = String(propertyId || '').trim();
    if (!pid) return;
    mergeTombstonesByProperty.delete(pid);
}

export function filterAccountsExcludingMergeTombstones(accounts: any[], propertyId: string): any[] {
    const pid = String(propertyId || '').trim();
    const blocked = mergeTombstonesByProperty.get(pid);
    if (!blocked || blocked.size === 0) return accounts || [];
    return (accounts || []).filter((a) => !blocked.has(String(a?.id || '').trim()));
}
```

At the end of `persistAccountMergeToBackend`, after successful DELETE (including treating 404 as success):

```ts
    rememberMergedAccountTombstone(pid, sid);
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run accountMergeUtils.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add accountMergeUtils.ts accountMergeUtils.test.ts
git commit -m "fix: tombstone merged-away accounts against sync resurrection"
```

---

### Task 3: Wire tombstones into AS accounts sync + live refetch

**Files:**
- Modify: `AS.tsx`

**Interfaces:**
- Consumes: `filterAccountsExcludingMergeTombstones`, `clearMergedAccountTombstones` from `./accountMergeUtils`
- On property hydrate success (initial fetch for a property): `clearMergedAccountTombstones(pidStr)` then `setAccounts(list)` (clean slate for that property)
- On sync PUT body: send filtered accounts
- On live `accountsLiveVersion` refetch: `setAccounts(filterAccountsExcludingMergeTombstones(list, pidStr))`

- [ ] **Step 1: Import helpers in AS.tsx**

Near other account imports, add:

```ts
import {
    clearMergedAccountTombstones,
    filterAccountsExcludingMergeTombstones,
} from './accountMergeUtils';
```

- [ ] **Step 2: Clear tombstones on clean property hydrate**

In the `useEffect` that depends on `[activeProperty?.id, fetchAccountsForProperty]` and calls `fetchAccountsForProperty(pidStr).then((list) => { ... setAccounts(list); })`, inside the success callback before `setAccounts`:

```ts
            clearMergedAccountTombstones(pidStr);
            setAccounts(list);
```

Do **not** clear tombstones on the live-refetch effect (that would defeat anti-resurrection).

- [ ] **Step 3: Filter sync PUT payload**

In the accounts sync effect (`PUT /api/accounts/sync`), change the body to:

```ts
            body: JSON.stringify({
                propertyId: String(pid),
                accounts: filterAccountsExcludingMergeTombstones(accounts, String(pid)),
            }),
```

- [ ] **Step 4: Filter live refetch apply**

In the `accountsLiveVersion` effect success callback:

```ts
            skipNextAccountsSync.current = true;
            accountsHydratedForPropertyId.current = pidStr;
            setAccounts(filterAccountsExcludingMergeTombstones(list, pidStr));
```

- [ ] **Step 5: Manual sanity (optional quick check)**

If Docker/API available: merge two accounts, bump live sync / refresh list — source id must stay gone. If not running full stack, rely on unit tests + code review of the three call sites.

- [ ] **Step 6: Commit**

```bash
git add AS.tsx
git commit -m "fix: filter merge tombstones from accounts sync and live refetch"
```

---

### Task 4: Profile pill tab shell in CRMProfileView

**Files:**
- Modify: `CRMProfileView.tsx`

**Interfaces:**
- Produces: local state `profileTab: 'overview' | 'contacts' | 'contracts' | 'timeline'`
- Reset `profileTab` to `'overview'` inside the existing `useEffect` on `leadIdentityKey`

- [ ] **Step 1: Add tab state + reset**

Near other `useState` declarations:

```ts
    type ProfileTab = 'overview' | 'contacts' | 'contracts' | 'timeline';
    const [profileTab, setProfileTab] = useState<ProfileTab>('overview');
```

In the `useEffect` that runs on `[leadIdentityKey, isShellPerformanceRange]`, add:

```ts
        setProfileTab('overview');
```

- [ ] **Step 2: Render pill row under header**

Place this **above** the `flex-1 overflow-y-auto` body (same visual language as Accounts list tabs). Match:

```tsx
                <div className="shrink-0 flex items-center gap-1 px-6 pt-4 pb-2">
                    {(
                        [
                            ['overview', 'Overview'],
                            ['contacts', 'Contacts'],
                            ['contracts', 'Contracts'],
                            ['timeline', 'Activity Timeline'],
                        ] as const
                    ).map(([id, label]) => {
                        const active = profileTab === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setProfileTab(id)}
                                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                                style={{
                                    backgroundColor: active ? colors.primary : 'transparent',
                                    color: active ? '#000' : colors.textMain,
                                    border: `1px solid ${active ? colors.primary : colors.border}`,
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
```

- [ ] **Step 3: Gate Overview body**

Wrap Overview content in `{profileTab === 'overview' && ( ... )}`. Intermediate OK to leave Contacts/Contracts/Timeline still inside Overview until Tasks 5–6; prefer already hiding them if easy.

- [ ] **Step 4: Smoke in UI**

Open an account profile from Accounts → pills appear under header → clicking tabs changes `profileTab`.

- [ ] **Step 5: Commit**

```bash
git add CRMProfileView.tsx
git commit -m "feat: add Overview/Contacts/Contracts/Timeline pills on account profile"
```

---

### Task 5: Contacts tab table + remove Contact Information from Overview

**Files:**
- Modify: `CRMProfileView.tsx`

**Interfaces:**
- Reuses existing: contact modal, delete confirm, scan handlers, `contactList`, `onLeadChange`
- Contacts tab only when `profileTab === 'contacts'`

- [ ] **Step 1: Remove Contact Information block from Overview**

Delete (or cut) the Overview card that starts with heading `Contact Information` (accordion list). Ensure Overview grid no longer reserves a growing contacts column beside the chart.

- [ ] **Step 2: Add Contacts tab body**

When `profileTab === 'contacts'`, render a card with toolbar (Scan / Upload + Plus) and a table:

Columns: Name · Position · Phone · Email · City · Actions (Edit · Delete).

Wire Edit/Delete handlers exactly as in the old accordion. Keep contact modal + delete confirm mounted at profile root (outside tab conditionals).

Empty state: “No contact persons yet.”

- [ ] **Step 3: Verify layout**

With many contacts, Overview chart must not grow. Contacts tab shows the full table with actions.

- [ ] **Step 4: Commit**

```bash
git add CRMProfileView.tsx
git commit -m "feat: move account contacts into profile Contacts table tab"
```

---

### Task 6: Move Contracts + Activity Timeline into tabs

**Files:**
- Modify: `CRMProfileView.tsx`

**Interfaces:**
- No prop changes; same handlers (`onUpdateContractStatus`, timeline manual edit, etc.)

- [ ] **Step 1: Cut Contracts card from Overview**

Move the block headed `Contracts` into `{profileTab === 'contracts' && ( ... )}`.

- [ ] **Step 2: Cut Activity Timeline from Overview**

Move the block headed `Activity Timeline` into `{profileTab === 'timeline' && ( ... )}`.

- [ ] **Step 3: Overview cleanup**

Confirm Overview only has: header actions (above tabs), KPIs/metrics, performance chart, opportunities / inquiry–tentative, and any other non-moved summary. No Contact Information, Contracts, or Activity Timeline on Overview.

- [ ] **Step 4: Manual acceptance checklist**

1. Merge A→B → refresh → A gone; B has contacts from both.
2. Request + sales call that belonged only to A appear under B.
3. Live sync / wait → A still gone.
4. Profile tabs match Accounts pill style.
5. Contacts table: add / edit / delete / scan work; read-only hides mutations.
6. Many contacts do not stretch Overview chart.
7. Switching accounts resets to Overview.

- [ ] **Step 5: graphify + frontend tests**

```bash
graphify update .
npx vitest run accountMergeUtils.test.ts
```

Expected: graph updates; tests PASS.

- [ ] **Step 6: Commit**

```bash
git add CRMProfileView.tsx graphify-out
git commit -m "feat: move contracts and activity timeline into account profile tabs"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Sales calls merge to dest + persist | Task 1 |
| Requests / CRM leads / contacts / rates / contracts | Task 1 verifies requests+leads; rates/contracts unchanged paths |
| Duplicate does not reappear after sync | Tasks 2–3 |
| Four pills matching Accounts | Task 4 |
| Contacts table with same actions; remove from main | Task 5 |
| Contracts + Activity Timeline moved | Task 6 |
| Chart not stretched by contacts | Tasks 5–6 |

No TBD/placeholder steps. Tombstone clear only on property hydrate (not live refetch) — intentional.
