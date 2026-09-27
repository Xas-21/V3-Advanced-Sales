# Proforma invoice — Design

**Date:** 2026-09-27  
**Status:** Approved (tax rows and bill-to source confirmed 2026-09-27)  
**Samples:** `Proforma invoice.pdf`, `Manual pro-forma.xlsm` (layout only; numbers are an example)

## Goal

From any request OPTS menu, download a one-page PDF proforma the hotel can send to the client. Figures come from that request. Hotel legal name, VAT number, address, bank details, and logo come from the property. Tax rates come from the property tax config, not a hardcoded 20.75%.

## Hotel Information

New first tab under Manage Property, before Room Types: **Hotel Information**.

Saved on the property record (same partial POST merge as other property settings):

| Field | Shown on the PDF as |
|---|---|
| Legal name | From |
| VAT number | Vat No (hotel) |
| Legal address | Address (hotel) |
| Bank account name | Account Name |
| Bank name | Bank Name |
| Account number | Account Number |
| IBAN | IBAN |
| Bank address | Address under bank details |
| Finance department label | Footer (default `Finance Department`) |

The property logo already stored on the property is printed at the top. Display name, city, and phone on the property card stay as they are. Empty legal fields still allow download; those lines print blank.

## OPTS

**Proforma invoice** is on every request type (rooms, event, event + rooms, series), including read-only users. It only downloads a file. It does not change the request.

## PDF contents

- Title: `Pro-Forma Invoice`
- Date: the day the user downloads it
- From / hotel VAT / hotel address
- To: account name. Never the booker contact. The booker does not hold the company VAT.
- Client VAT: account `clientTaxId`. If the account has no VAT number, the row still prints and the value is blank.
- Client address: account street, city, country. If those are empty, the address line is blank.
- Table columns: Date, Description, Quantity, Price, Amount
- Currency label from the app currency (sample is SAR)
- Net amount
- One row per applicable property tax (label + rate), then total including taxes
- Bank block and finance footer
- Filename: `Proforma-{confirmationOrRequestId}.pdf`

### Lines

Built from the request, not typed by hand:

- Room rows: one line per room group. Date is arrival–departure. Quantity is room count × nights. Price is the room rate. Amount is quantity × price.
- Event rows: one line per agenda row with a rental or package amount. Quantity is pax or days already used by the request financials. Price is the rate used there.
- Series: one line per included room group, same rule as rooms.

Lines with a zero amount are omitted. If the request has no billable lines, the PDF still downloads with an empty table and zero totals.

### Taxes

Print one row per applicable property tax (VAT, municipality, service, and any other configured tax). Do not collapse them into one combined percent. The sample’s single `Taxes 20.75%` line is only a layout example.

Room lines use taxes scoped to accommodation. Event lines use taxes scoped to events. A tax with rate 0 is omitted. A missing account VAT number does not remove the client VAT row.

## Approach

1. Pure builder: property + account + request + taxes → proforma model (lines, tax rows, totals). Unit-test this. No PDF library in the test.
2. Hotel Information tab writes those fields onto the property.
3. OPTS action renders the model to PDF with the existing `jspdf` dependency and triggers download. No new server table and no new npm package.

## Out of scope

- Saving each issued proforma, numbering sequences, email send, or editing the PDF after generation
- Changing how the request itself calculates totals on screen
- Using the Excel file at runtime
