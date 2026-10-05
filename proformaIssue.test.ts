import { describe, expect, it } from 'vitest';
import { buildProformaInvoice } from './proformaInvoice';
import {
    figuresUnchanged,
    INVOICE_NUMBER_RE,
    isInvoiceNumber,
    mintInvoiceNumber,
    normalizeProforma,
    proformaFingerprint,
} from './proformaIssue';

function sampleModel(extra?: { rate?: number; poNumber?: string; invoiceNumber?: string }) {
    return buildProformaInvoice({
        property: { legalName: 'Hotel', vatNumber: '1', legalAddress: 'A' },
        account: { name: 'Acme', clientTaxId: '9', street: 'St', city: 'City', country: 'SA' },
        request: {
            id: 'R1',
            confirmationNo: 'C-1',
            requestType: 'accommodation',
            checkIn: '2026-11-01',
            checkOut: '2026-11-03',
            rooms: [{ type: 'Deluxe', count: 1, rate: extra?.rate ?? 100 }],
        },
        taxes: [{ label: 'VAT', rate: 15, scope: { accommodation: true } }],
        currency: 'SAR',
        issuedOn: '2026-09-29',
        invoiceNumber: extra?.invoiceNumber,
        poNumber: extra?.poNumber,
    });
}

describe('proformaIssue', () => {
    it('mints one letter plus seven digits and skips taken values', () => {
        const seq = [
            { letter: 'A', digits: '0000001' },
            { letter: 'A', digits: '0000001' },
            { letter: 'K', digits: '4829103' },
        ];
        const n = mintInvoiceNumber(new Set(['A0000001']), () => seq.shift() || { letter: 'Z', digits: '9999999' });
        expect(n).toBe('K4829103');
        expect(isInvoiceNumber(n)).toBe(true);
        expect(INVOICE_NUMBER_RE.test(n)).toBe(true);
    });

    it('fingerprint ignores PO and invoice number', () => {
        const a = proformaFingerprint(sampleModel({ poNumber: 'PO-1', invoiceNumber: 'A0000001' }));
        const b = proformaFingerprint(sampleModel({ poNumber: '', invoiceNumber: 'B0000002' }));
        expect(a).toBe(b);
        expect(figuresUnchanged(a, b)).toBe(true);
    });

    it('fingerprint changes when extra invoice items change', () => {
        const a = proformaFingerprint(sampleModel());
        const b = proformaFingerprint(
            buildProformaInvoice({
                property: { legalName: 'Hotel', vatNumber: '1', legalAddress: 'A' },
                account: { name: 'Acme', clientTaxId: '9', street: 'St', city: 'City', country: 'SA' },
                request: {
                    id: 'R1',
                    confirmationNo: 'C-1',
                    requestType: 'accommodation',
                    checkIn: '2026-11-01',
                    checkOut: '2026-11-03',
                    rooms: [{ type: 'Deluxe', count: 1, rate: 100 }],
                },
                extraItems: [{ description: 'Parking', quantity: 1, price: 40, vatPercent: 15 }],
                taxes: [{ label: 'VAT', rate: 15, scope: { accommodation: true } }],
                issuedOn: '2026-09-29',
            })
        );
        expect(a).not.toBe(b);
    });

    it('fingerprint changes when a room rate changes', () => {
        const a = proformaFingerprint(sampleModel({ rate: 100 }));
        const b = proformaFingerprint(sampleModel({ rate: 200 }));
        expect(a).not.toBe(b);
        expect(figuresUnchanged(a, b)).toBe(false);
    });

    it('normalizeProforma trims PO and keeps a valid number', () => {
        const doc = normalizeProforma({
            invoiceNumber: 'k4829103',
            poNumber: '  PO-9  ',
            issuedOn: '2026-09-29T12:00:00',
            issuedById: 'U1',
            issuedByName: 'Sam',
            fingerprint: 'abc',
        });
        expect(doc?.invoiceNumber).toBe('K4829103');
        expect(doc?.poNumber).toBe('PO-9');
        expect(doc?.issuedOn).toBe('2026-09-29');
        expect(doc?.extraItems).toEqual([]);
        expect(
            normalizeProforma({
                invoiceNumber: 'A0000001',
                extraItems: [{ description: ' Parking ', quantity: 2, price: 40, vatPercent: 15 }],
            })?.extraItems
        ).toEqual([{ id: 'xi-0', description: 'Parking', quantity: 2, price: 40, vatPercent: 15, taxId: '', taxLabel: '', startDate: '', endDate: '' }]);
        expect(normalizeProforma({ invoiceNumber: 'nope' })).toBeNull();
        expect(normalizeProforma(null)).toBeNull();
    });
});
