# Proforma invoice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download a client proforma PDF from any request OPTS menu, using property legal/bank/logo data, account bill-to data, and request lines taxed with the property tax config.

**Architecture:** A pure `buildProformaInvoice` function produces lines and tax totals. Hotel Information is a new first Manage Property tab stored on the property payload. OPTS calls that function and draws a one-page PDF with `jspdf`.

**Tech Stack:** React, TypeScript, existing `jspdf`, property POST merge, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-27-proforma-invoice-design.md`
- No new npm dependency
- No new database table
- Do not change request on-screen totals
- Proforma date is the download day
- Empty legal fields still download
- One PDF row per applicable tax; never one blended percent
- Bill-to name, VAT, and address come from the account only. Blank account VAT still prints the client VAT row empty
- Every request type, including read-only OPTS

## File map

| File | Responsibility |
|---|---|
| `proformaInvoice.ts` | Build lines, taxes, totals |
| `proformaInvoice.test.ts` | Room line, event line, scoped taxes, zero-rate omitted |
| `proformaPdf.ts` | Draw the PDF and return a blob |
| `Settings.tsx` | Hotel Information tab, first in Manage Property |
| `RequestsManager.tsx` | OPTS item + download |
| `backend/data_access.py` | Persist new property fields if they are typed columns; otherwise payload-only is enough |

---

### Task 1: Proforma model

**Files:** `proformaInvoice.ts`, `proformaInvoice.test.ts`

- [ ] Write a failing test: two room groups produce quantity = count × nights and amount = quantity × rate
- [ ] Write a failing test: accommodation tax applies to room lines only; event tax applies to agenda lines only; rate 0 is omitted; each remaining tax is its own row
- [ ] Write a failing test: account with no `clientTaxId` still returns a blank client VAT field, and bill-to never reads the booker
- [ ] Implement `buildProformaInvoice({ property, account, request, taxes, currency, issuedOn })`
- [ ] Run `npx vitest run proformaInvoice.test.ts`

Hotel fields read from the property: `legalName`, `vatNumber`, `legalAddress`, `bankAccountName`, `bankName`, `bankAccountNumber`, `iban`, `bankAddress`, `financeDepartmentLabel`, `logoUrl`.

Bill-to: account `name`, `clientTaxId`, and street/city/country.

---

### Task 2: Hotel Information tab

**Files:** `Settings.tsx`

- [ ] Insert `{ id: 'hotel_info', label: 'Hotel Information' }` as the first item of `propertyTabsList`, before Room Types
- [ ] Form fields listed in the spec, prefilled from `managingProperty`
- [ ] Save with the existing property POST (full property object plus the new fields) so `upsert_flat` merge keeps the rest
- [ ] Default finance label to `Finance Department` when blank

---

### Task 3: PDF download from OPTS

**Files:** `proformaPdf.ts`, `RequestsManager.tsx`

- [ ] Draw one A4 page matching the sample order: logo, title, date, from, to, table, net, tax rows, total, bank, footer
- [ ] OPTS button **Proforma invoice** for every request, including `readOnlyOperational`
- [ ] File name `Proforma-{confirmationNo or id}.pdf`
- [ ] If the property has no legal name, still download

---

### Task 4: Verify

- [ ] `npx vitest run proformaInvoice.test.ts`
- [ ] Open Manage Property and confirm Hotel Information is the first tab and a save survives refresh
- [ ] OPTS on a rooms request and an event request each download a PDF whose net matches the request lines
