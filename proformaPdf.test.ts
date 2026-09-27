import { describe, expect, it } from 'vitest';
import { buildProformaInvoice } from './proformaInvoice';
import { proformaFileName, renderProformaPdf } from './proformaPdf';

describe('proforma pdf', () => {
    it('draws a PDF and names the file from the confirmation number', async () => {
        const model = buildProformaInvoice({
            property: {
                legalName: 'Shaden Hospitality Company',
                vatNumber: '311047876800003',
                legalAddress: '18936 Hail Road - AlUla - KSA',
                bankAccountName: 'Shaden Hospitality Company',
                bankName: 'ANB',
                bankAccountNumber: '0108095409490010',
                iban: 'SA0730400108095409490010',
                bankAddress: 'Hail Road - AlUla - KSA',
            },
            account: { name: 'Kensington', clientTaxId: '', street: 'Twofour54', city: 'Abu Dhabi', country: 'UAE' },
            request: {
                id: 'R9',
                confirmationNo: 'C/9',
                requestType: 'accommodation',
                checkIn: '2026-11-01',
                checkOut: '2026-11-06',
                rooms: [{ type: 'Superior', count: 2, rate: 580 }],
            },
            taxes: [{ label: 'VAT', rate: 15, scope: { accommodation: true } }],
            currency: 'SAR',
            issuedOn: '2026-09-27',
        });
        expect(proformaFileName(model)).toBe('Proforma-C-9.pdf');
        expect(model.clientVat).toBe('');
        const blob = await renderProformaPdf(model);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const header = String.fromCharCode(...bytes.slice(0, 5));
        expect(header).toBe('%PDF-');
        expect(bytes.length).toBeGreaterThan(500);
    });
});
