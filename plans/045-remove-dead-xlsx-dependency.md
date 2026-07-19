# Plan 045: Remove the dead, CVE-carrying `xlsx` dependency

> **Executor instructions**: Follow step by step. Run every verification and confirm before moving on. Honor "STOP conditions". Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 90c3a4c..HEAD -- package.json package-lock.json`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (verify truly unused first)
- **Depends on**: none
- **Category**: security / dependencies
- **Planned at**: commit `90c3a4c`, 2026-07-19

## Why this matters

`xlsx@0.18.5` (SheetJS) carries Prototype Pollution (CVE-2023-30533) and ReDoS (CVE-2024-22363) advisories with **no fixed version on npm** (the fix ships only from the SheetJS CDN). It is also a **dead dependency**: a repo-wide search finds zero imports (the only reference is a file-input `accept=".xlsx"` string). So it adds supply-chain risk and audit noise for zero runtime benefit — the cleanest fix is to remove it.

## Current state

- `package.json:42` — `"xlsx": "^0.18.5"` in dependencies.
- Verified during audit: `Select-String -Path *.ts,*.tsx -Pattern "from ['\"]xlsx|require\(['\"]xlsx"` → **0 matches**. The only hit is `accept=".xlsx"` at `dashboardHub/pages/DashboardHubFeedPage.tsx:1147` (a file-input filter string, not an import).
- Note: docs mention xlsx (`AS-Tech-Details.md`, `Product_Specification_Document_V2.0.md`) but no code imports it.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Confirm no imports | `grep -rn "from ['\"]xlsx\|require(['\"]xlsx\|import(['\"]xlsx" --include=*.ts --include=*.tsx .` | no output |
| Install after removal | `npm install` | exit 0 |
| Build | `npm run build` | exit 0 |
| Tests | `npm run test:frontend` | all pass |
| Audit | `npm audit` | xlsx advisories gone |

## Scope

**In scope**: `package.json`, `package-lock.json`.
**Out of scope**: the `accept=".xlsx"` string (leave — harmless UI hint); adding a replacement library (only if a real spreadsheet feature is later needed — not now, YAGNI).

## Steps

### Step 1: Confirm zero imports (do not skip)

Run the grep. If there is **any** dynamic import or usage, STOP — this becomes a migration to the SheetJS CDN build instead of a removal.

**Verify**: grep returns no output.

### Step 2: Remove the dependency

```bash
npm uninstall xlsx
```

(Removes it from `package.json` and `package-lock.json`.)

**Verify**: `grep -n '"xlsx"' package.json` → no output.

### Step 3: Confirm nothing broke

**Verify**: `npm install` → exit 0; `npm run build` → exit 0; `npm run test:frontend` → all pass; `npm audit` → the three xlsx advisories no longer listed.

## Done criteria

- [ ] `xlsx` absent from `package.json` and `package-lock.json`.
- [ ] `npm run build` exits 0 and `npm run test:frontend` passes.
- [ ] `npm audit` no longer reports the xlsx prototype-pollution/ReDoS advisories.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Any real `xlsx` import/dynamic-import exists → switch to a migration plan (CDN build or `exceljs`), don't just delete.
- `npm run build` fails after removal → something did import it transitively via app code; report.

## Maintenance notes

- If spreadsheet export/import is added later, use a maintained lib behind a dynamic import so it's not in the main bundle.
- Reviewer: confirm the `accept=".xlsx"` file input (if it feeds a parser) isn't silently broken — it currently has no parser wired, so removing xlsx changes nothing.
