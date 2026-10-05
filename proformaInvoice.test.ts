import { describe, expect, it } from 'vitest';
import { buildProformaInvoice, roomTypeLabel } from './proformaInvoice';

describe('buildProformaInvoice', () => {
    it('builds one room line per group with quantity = count × nights', () => {
        const invoice = buildProformaInvoice({
            property: { legalName: 'Shaden Resort Al Ula' },
            account: { name: 'Kensington', clientTaxId: '100501961500003' },
            request: {
                id: 'R1',
                confirmationNo: 'C-9',
                requestType: 'accommodation',
                checkIn: '2026-11-01',
                checkOut: '2026-11-06',
                bookerName: 'Not The Client',
                rooms: [
                    { type: 'Superior', count: 4, rate: 580, arrival: '2026-01-01', departure: '2026-01-03' },
                    { type: 'Deluxe', count: 2, rate: 100 },
                    { type: 'Comp', count: 3, rate: 0 },
                ],
            },
            taxes: [],
            currency: 'SAR',
            issuedOn: '2026-09-27',
        });

        expect(invoice.lines).toEqual([
            {
                date: '2026-11-01 – 2026-11-06',
                description: 'Superior',
                quantity: 20,
                price: 580,
                amount: 11600,
                kind: 'room',
            },
            {
                date: '2026-11-01 – 2026-11-06',
                description: 'Deluxe',
                quantity: 10,
                price: 100,
                amount: 1000,
                kind: 'room',
            },
        ]);
        expect(invoice.net).toBe(12600);
        expect(invoice.fileStem).toBe('C-9');
        expect(invoice.issuedOn).toBe('2026-09-27');
        expect(invoice.invoiceNumber).toBe('');
        expect(invoice.poNumber).toBe('');
    });

    it('uses each room stay for series and keeps one row per tax', () => {
        const invoice = buildProformaInvoice({
            property: {},
            account: { name: 'Acme' },
            request: {
                id: 'R2',
                requestType: 'event_rooms',
                checkIn: '2026-11-01',
                checkOut: '2026-11-11',
                rooms: [
                    { type: 'Superior', count: 2, rate: 100, arrival: '2026-11-01', departure: '2026-11-03' },
                ],
                agenda: [
                    {
                        startDate: '2026-11-01',
                        endDate: '2026-11-05',
                        package: 'Meeting',
                        venue: 'Ballroom',
                        rate: 50,
                        pax: 10,
                        rental: 0,
                    },
                    { package: 'Empty', rate: 0, pax: 4, rental: 0 },
                ],
            },
            taxes: [
                { label: 'VAT', rate: 15, scope: { accommodation: true, events: true } },
                { label: 'Municipality', rate: 5, scope: { accommodation: true } },
                { label: 'Service', rate: 0, scope: { accommodation: true, events: true } },
                { label: 'Event fee', rate: 10, scope: { events: true } },
            ],
            currency: 'SAR',
            issuedOn: '2026-09-27',
        });

        expect(invoice.lines.map((line) => ({ description: line.description, quantity: line.quantity, amount: line.amount, kind: line.kind }))).toEqual([
            { description: 'Superior', quantity: 4, amount: 400, kind: 'room' },
            { description: 'Meeting (10 pax)', quantity: 50, amount: 2500, kind: 'event' },
        ]);
        expect(invoice.taxes).toEqual([
            { label: 'VAT', rate: 15, amount: 435 },
            { label: 'Municipality', rate: 5, amount: 20 },
            { label: 'Event fee', rate: 10, amount: 250 },
        ]);
        expect(invoice.net).toBe(2900);
        expect(invoice.total).toBe(3605);
    });

    it('bills the account and keeps a blank client VAT when the account has none', () => {
        const invoice = buildProformaInvoice({
            property: { financeDepartmentLabel: '  ' },
            account: { name: 'Acme', clientTaxId: '', street: '1 Road', city: 'AlUla', country: 'KSA' },
            request: {
                id: 'R3',
                bookerName: 'Booker Person',
                bookerContactId: 'contact-1',
                rooms: [],
            },
            taxes: [{ label: 'VAT', rate: 15, scope: { accommodation: true } }],
            currency: 'SAR',
            issuedOn: '2026-09-27',
        });

        expect(invoice.toName).toBe('Acme');
        expect(invoice.clientVat).toBe('');
        expect(invoice.clientAddress).toBe('1 Road, AlUla, KSA');
        expect(invoice.financeDepartmentLabel).toBe('Finance Department');
        expect(invoice.lines).toEqual([]);
        expect(invoice.taxes).toEqual([]);
        expect(invoice.total).toBe(0);
        expect(JSON.stringify(invoice)).not.toContain('Booker Person');
    });

    it('uses the property room type when the saved room row has a blank type', () => {
        expect(roomTypeLabel({ type: '', occupancy: 'Double' }, ['Deluxe', 'Superior'])).toBe('Deluxe');
        const invoice = buildProformaInvoice({
            property: {},
            account: { name: 'Tetrapylon' },
            request: {
                id: 'REQ-1',
                requestType: 'accommodation',
                checkIn: '2027-09-14',
                checkOut: '2027-09-16',
                rooms: [{ type: '', occupancy: 'Double', count: 1, rate: 1575 }],
            },
            taxes: [],
            currency: 'SAR',
            issuedOn: '2026-09-27',
            roomTypeNames: ['Deluxe', 'Superior'],
        });
        expect(invoice.lines[0].description).toBe('Deluxe');
        expect(invoice.lines[0].amount).toBe(3150);
    });

    it('puts event package and meeting rental on separate rows', () => {
        const invoice = buildProformaInvoice({
            property: {},
            account: { name: 'EMERITUS' },
            request: {
                id: 'E1',
                requestType: 'event',
                agenda: [{
                    startDate: '2026-11-01',
                    endDate: '2026-11-05',
                    package: '2 Coffee Breaks with Lunch',
                    venue: 'AL JADIDA',
                    rate: 350,
                    pax: 30,
                    rental: 2000,
                }],
            },
            taxes: [{ label: 'VAT', rate: 15, scope: { events: true } }],
            currency: 'SAR',
            issuedOn: '2026-09-27',
        });
        expect(invoice.lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            price: line.price,
            amount: line.amount,
        }))).toEqual([
            {
                description: '2 Coffee Breaks with Lunch (30 pax)',
                quantity: 150,
                price: 350,
                amount: 52500,
            },
            {
                description: 'AL JADIDA rental',
                quantity: 5,
                price: 2000,
                amount: 10000,
            },
        ]);
        expect(invoice.net).toBe(62500);
        expect(invoice.taxes[0].amount).toBe(9375);
    });

    it('keeps invoice number and a filled PO, and leaves PO blank when skipped', () => {
        const withPo = buildProformaInvoice({
            account: { name: 'Acme' },
            request: { id: 'R3', requestType: 'accommodation', checkIn: '2026-11-01', checkOut: '2026-11-02', rooms: [{ type: 'Deluxe', count: 1, rate: 10 }] },
            invoiceNumber: 'k4829103',
            poNumber: '  PO-77821  ',
            issuedOn: '2026-09-29',
        });
        expect(withPo.invoiceNumber).toBe('K4829103');
        expect(withPo.poNumber).toBe('PO-77821');
        const skipped = buildProformaInvoice({
            request: { id: 'R4', requestType: 'accommodation', checkIn: '2026-11-01', checkOut: '2026-11-02', rooms: [{ type: 'Deluxe', count: 1, rate: 10 }] },
            invoiceNumber: 'A0000001',
            poNumber: '   ',
            issuedOn: '2026-09-29',
        });
        expect(skipped.poNumber).toBe('');
    });

    it('adds a transfer line with vehicle type, cost, and notes, and taxes it on the transport scope', () => {
        const invoice = buildProformaInvoice({
            account: { name: 'Acme' },
            request: {
                id: 'R5',
                requestType: 'accommodation',
                checkIn: '2026-11-01',
                checkOut: '2026-11-03',
                rooms: [{ type: 'Deluxe', count: 1, rate: 100 }],
                transportation: [
                    { type: 'Sedan', costPerWay: 250, notes: 'Airport pickup', timing: '14:00' },
                    { type: 'SUV', count: 7, costPerWay: 100, notes: 'Same type' },
                    { type: 'Coach', costPerWay: 0, notes: 'Complimentary' },
                ],
            },
            taxes: [
                { label: 'VAT', rate: 15, scope: { accommodation: true, transport: true } },
                { label: 'Municipality', rate: 5, scope: { accommodation: true } },
            ],
            issuedOn: '2026-09-29',
        });
        expect(invoice.lines.filter((line) => line.kind === 'transport')).toEqual([
            {
                date: '14:00',
                description: 'Transfer · Sedan — Airport pickup',
                quantity: 1,
                price: 250,
                amount: 250,
                kind: 'transport',
            },
            {
                date: '',
                description: 'Transfer · SUV — Same type',
                quantity: 7,
                price: 100,
                amount: 700,
                kind: 'transport',
            },
        ]);
        expect(invoice.lines.some((line) => line.description.includes('Complimentary'))).toBe(false);
        expect(invoice.net).toBe(1150);
        expect(invoice.taxes).toEqual([
            { label: 'VAT', rate: 15, amount: 172.5 },
            { label: 'Municipality', rate: 5, amount: 10 },
        ]);
    });

    it('uses transfer from/to dates on the invoice, not the request stay', () => {
        const invoice = buildProformaInvoice({
            request: {
                id: 'R7',
                requestType: 'accommodation',
                checkIn: '2026-11-01',
                checkOut: '2026-11-10',
                rooms: [{ type: 'Deluxe', count: 1, rate: 100 }],
                transportation: [
                    { type: 'Sedan', costPerWay: 50, startDate: '2026-11-03' },
                    { type: 'SUV', costPerWay: 80, startDate: '2026-11-04', endDate: '2026-11-06' },
                    { type: 'Coach', costPerWay: 90, startDate: '2026-11-07', endDate: '2026-11-07' },
                ],
            },
        });
        expect(invoice.lines.filter((line) => line.kind === 'transport').map((line) => line.date)).toEqual([
            '2026-11-03',
            '2026-11-04 – 2026-11-06',
            '2026-11-07 – 2026-11-07',
        ]);
    });

    it('prints the custom other vehicle name, not Other', () => {
        const invoice = buildProformaInvoice({
            request: {
                id: 'R8',
                requestType: 'accommodation',
                checkIn: '2026-11-01',
                checkOut: '2026-11-03',
                rooms: [{ type: 'Deluxe', count: 1, rate: 100 }],
                transportation: [{ type: 'Other', otherType: 'Sprinter van', costPerWay: 200 }],
            },
        });
        expect(invoice.lines.find((line) => line.kind === 'transport')?.description).toBe('Transfer · Sprinter van');
        expect(invoice.lines.some((line) => /other/i.test(line.description))).toBe(false);
    });

    it('adds extra invoice-only lines and VAT grouped by the item rate, not hotel tax scopes', () => {
        const invoice = buildProformaInvoice({
            request: {
                id: 'R6',
                requestType: 'accommodation',
                checkIn: '2026-11-01',
                checkOut: '2026-11-03',
                rooms: [{ type: 'Deluxe', count: 1, rate: 100 }],
            },
            extraItems: [
                { description: 'Late checkout', quantity: 2, price: 50, vatPercent: 15 },
                { description: 'Parking', quantity: 1, price: 40, vatPercent: 5 },
                { description: '  ', quantity: 1, price: 99, vatPercent: 15 },
                { description: 'Zero', quantity: 1, price: 0, vatPercent: 15 },
            ],
            taxes: [{ label: 'VAT', rate: 15, scope: { accommodation: true } }],
            issuedOn: '2026-09-29',
        });
        expect(invoice.lines.filter((line) => line.kind === 'extra')).toEqual([
            {
                date: '2026-11-01 – 2026-11-03',
                description: 'Late checkout',
                quantity: 2,
                price: 50,
                amount: 100,
                kind: 'extra',
                vatPercent: 15,
            },
            {
                date: '2026-11-01 – 2026-11-03',
                description: 'Parking',
                quantity: 1,
                price: 40,
                amount: 40,
                kind: 'extra',
                vatPercent: 5,
            },
        ]);
        expect(invoice.net).toBe(340);
        expect(invoice.taxes).toEqual([
            { label: 'VAT', rate: 15, amount: 30 },
            { label: 'Added items VAT', rate: 5, amount: 2 },
            { label: 'Added items VAT', rate: 15, amount: 15 },
        ]);
        expect(invoice.total).toBe(387);
    });
});
