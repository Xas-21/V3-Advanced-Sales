# Proforma PO and invoice number — Design

**Date:** 2026-09-29  
**Status:** Approved in conversation 2026-09-29

## Goal

Before a proforma PDF downloads, the user can enter a PO or skip. The first download for a request mints one invoice number and keeps it forever. Later clicks open a small page for another copy, a re-issue, or a PO edit. The PDF prints the invoice number always, and the PO only when one is stored.

## OPTS

**Proforma invoice** stays on every request type (rooms, event, event + rooms, series), including read-only users. It does not change rooms, rates, or on-screen totals.

## First issue

The request has no `proforma.invoiceNumber` yet.

1. OPTS opens a small page: PO Number field, **Continue**, **Skip**, and close.
2. Close without Continue or Skip issues nothing and downloads nothing.
3. Continue saves the typed PO (trimmed). Skip saves an empty PO.
4. The client calls the issue API. If that request already has a number (another user won the race), the API returns the existing number and does not mint a second one.
5. Otherwise the API mints one letter `A–Z` plus seven digits (example `K4829103`), checks other requests on **this property**, retries on a clash, then writes the proforma block and returns it.
6. The PDF downloads immediately.

Uniqueness is per property. Another property may reuse the same number. One request has one number for life.

## Later clicks

Any user, including a different user than the first issuer.

OPTS opens a small page showing:

- Invoice number
- PO number, or that none was added
- Date currently stored as `issuedOn`
- Who first issued it (`issuedBy`)
- A short note when the current billable figures match the stored fingerprint

Buttons:

- **Download** — PDF now. Same invoice number. Date is the stored `issuedOn` (not updated). Current PO. Current request lines, taxes, and bill-to.
- **Re-issue** — always clickable. Same invoice number. Sets `issuedOn` to today, refreshes the fingerprint, then downloads. Current PO and current request figures. After this, later Downloads use the new `issuedOn`.
- **Edit PO** — add, change, or clear. Save only. No download. Clearing means the next PDF has no PO line. Does not change invoice number or `issuedOn`.

## PDF

Same builder and `jspdf` download as today. Additions only:

- Under **Date**: `Invoice No: K4829103`
- Under **To**, only when PO is non-empty: `PO Number: …`
- Skip or cleared PO: no PO label and no empty PO row

Tax rows, bill-to from the account (never the booker), empty legal fields, and filename `Proforma-{confirmationOrRequestId}.pdf` stay as they are. Date printed is `issuedOn` as defined above.

## Storage

No new table. A `proforma` object on the request payload, same `upsert_flat` merge as other request fields:

| Field | Rule |
|---|---|
| `invoiceNumber` | Set once on first successful issue. Never replaced. |
| `poNumber` | String. Empty means no PO on the PDF. |
| `issuedOn` | First issue sets today. Re-issue overwrites with today. Download does not change it. |
| `issuedBy` | User id and display name of the first issuer. Later users do not overwrite it. |
| `fingerprint` | Hash of billable PDF content (lines, tax rows, bill-to, hotel legal block). Not including PO. Set on first issue and on re-issue. Used only for the “figures have not changed” note. |

First issue uses a dedicated API so two simultaneous clicks cannot mint two numbers. Edit PO saves by posting the request with `upsert_flat` merge and only changing `proforma.poNumber` (and keeping the rest of `proforma`). It does not call the issue API.

## Errors

If the issue API fails, show a short error and do not download. Do not leave a half-written invoice number on the request. If mint retries are exhausted, fail the request; do not fall back to a duplicate.

## Tests

- Number shape: one `A–Z` letter plus exactly seven digits.
- Same property: two requests never share a number.
- Two properties may share a number.
- Skip / empty PO: model and PDF have no PO field.
- Filled PO: model includes PO; PDF has the To line.
- Re-issue keeps `invoiceNumber`, updates `issuedOn`.
- Fingerprint note when billable lines match the stored fingerprint. No note when they differ.
- Second click does not mint a new number.

## Out of scope

- Email send, storing the PDF file, or a history of old PDF versions
- A second invoice number after re-issue
- Changing event package prices, meeting rental, Rate Structure, or account rates
- New npm packages
- Showing Proforma invoice on surfaces that do not already have it (Events OPTS, CRM) unless they already share this same Requests OPTS action
