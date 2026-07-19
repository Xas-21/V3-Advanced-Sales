# Plan 053: Lazy-load export libraries; batch the tax save

> **Executor instructions**: Follow step by step. Run every verification. Honor "STOP conditions". Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- CRM.tsx contractsStore.ts Settings.tsx`

## Status

- **Priority**: P2 (PERF-02) / P3 (PERF-03)
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

- **PERF-02**: `jspdf` and `docxtemplater` are statically imported, so they download with the CRM/Contracts route chunk even for users who never click export/generate. The repo already lazy-loads `mammoth` correctly — the same pattern applies here.
- **PERF-03**: the Settings tax save issues one POST per tax row (a small N+1 write). Low blast radius (few tax types) but trivially batchable.

## Current state

- `CRM.tsx:72` — `import jsPDF from 'jspdf'` (static).
- `contractsStore.ts:2-3` — static `import Docxtemplater` + `import { jsPDF }`; **but** `contractsStore.ts:381` already does `await import('mammoth')` — the working lazy pattern to copy.
- `Settings.tsx:663-669` — `await Promise.all(taxes.map(tax => fetch('/api/taxes', {POST ...})))` — one request per tax.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `npx tsc --noEmit` | no new errors |
| Build | `npm run build` | exit 0 (smaller CRM/Contracts chunk) |
| Tests | `npm run test:frontend` | all pass |

## Scope

**In scope**: `CRM.tsx`, `contractsStore.ts` (dynamic imports in the export/generate handlers), `Settings.tsx` (+ a bulk tax endpoint if you add one).
**Out of scope**: replacing jsPDF/docxtemplater; changing generated document output.

## Steps

### Step 1 (PERF-02): Dynamic-import the export libs

Move `jspdf` (CRM.tsx:72) and `jspdf`/`docxtemplater` (contractsStore.ts:2-3) to `await import(...)` **inside the handlers that actually export/generate**, mirroring the existing `await import('mammoth')` at `contractsStore.ts:381`. Keep the generated output identical.

**Verify**: `npx tsc --noEmit` clean; `npm run build` exits 0 and the CRM/Contracts chunk no longer statically contains jspdf/docxtemplater (spot-check build output sizes or `grep` the chunk); export a PDF and a DOCX in the app — output unchanged. `npm run test:frontend` passes.

### Step 2 (PERF-03): Batch the tax save (optional / low priority)

Either add a bulk `POST /api/taxes` accepting an array and call it once from `Settings.tsx:663-669`, or leave as-is given the small N. If the backend change is disproportionate, STOP-note it and skip — this is P3.

**Verify**: if changed — saving multiple taxes issues one request (Network tab / test); backend test for the bulk endpoint passes. If skipped — note the decision in the report.

## Done criteria

- [ ] `jspdf` and `docxtemplater` load only when export/generate runs (dynamic import), matching the `mammoth` pattern.
- [ ] PDF/DOCX output unchanged; `npm run build` exits 0; `npm run test:frontend` passes.
- [ ] Tax save either batched or explicitly deferred with a one-line reason.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Dynamic import changes generated document output or breaks a type — revert that import and report.
- Adding a bulk tax endpoint is more than S effort — skip PERF-03 and note it.

## Maintenance notes

- Reviewer: confirm the export handlers `await` the dynamic import before use (no race).
- Confirm with a bundle analyzer that the chunk actually shrank (the audit's size claim was MED confidence).
