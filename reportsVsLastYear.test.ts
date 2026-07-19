import { describe, expect, it } from 'vitest';
import { buildVsLyMatrix } from './reportsVsLastYear';

describe('buildVsLyMatrix', () => {
    const accounts = [{ id: 'a1', name: 'Acme', accountType: 'Corporate' }];

    /** CY Corporate+NewSeg revenue, LY Leisure only — includes a zero-LY segment (NewSeg). */
    const requests = [
        {
            id: 'cy1',
            requestType: 'accommodation',
            status: 'definite',
            segment: 'Corporate',
            accountId: 'a1',
            accountType: 'Corporate',
            checkIn: '2026-03-10',
            checkOut: '2026-03-12',
            rooms: [{ count: 2, rate: 500 }],
        },
        {
            id: 'ly1',
            requestType: 'accommodation',
            status: 'definite',
            segment: 'Leisure',
            accountId: 'a1',
            accountType: 'Leisure',
            checkIn: '2025-03-10',
            checkOut: '2025-03-12',
            rooms: [{ count: 1, rate: 400 }],
        },
        {
            id: 'cy-zero-ly',
            requestType: 'accommodation',
            status: 'definite',
            segment: 'NewSeg',
            accountId: 'a1',
            accountType: 'Corporate',
            checkIn: '2026-06-01',
            checkOut: '2026-06-03',
            rooms: [{ count: 1, rate: 1000 }],
        },
    ];

    const opts = {
        propertyRequestSegments: ['Corporate', 'Leisure', 'NewSeg'],
        propertyAccountTypes: ['Corporate', 'Leisure'],
        includeRequestSegments: true,
        includeAccountTypes: true,
        allowedMonthsCy: [3, 6],
        allowedMonthsLy: [3, 6],
    };

    it('returns yearLy = selectedYear - 1', () => {
        const { yearLy } = buildVsLyMatrix('rooms', requests, accounts, 2026, 'SAR', opts);
        expect(yearLy).toBe(2025);
    });

    it('builds segment revenue rows with CY/LY money and pct', () => {
        const { rows } = buildVsLyMatrix('rooms', requests, accounts, 2026, 'SAR', opts);

        const corporateReq = rows.find((r) => r.id === 'r-rev-0-Corporate');
        expect(corporateReq?.ytd).toEqual({
            cy: 'SAR 2,000',
            ly: 'SAR 0',
            pct: '-',
            otb: 'SAR 0',
            cyOtbVsLyPct: '-',
        });
        expect(corporateReq?.months[2]).toMatchObject({
            month: 3,
            cy: 'SAR 2,000',
            ly: 'SAR 0',
            pct: '-',
        });

        const leisureReq = rows.find((r) => r.id === 'r-rev-1-Leisure');
        expect(leisureReq?.ytd).toEqual({
            cy: 'SAR 0',
            ly: 'SAR 800',
            pct: '-100%',
            otb: 'SAR 0',
            cyOtbVsLyPct: '-100%',
        });
    });

    it('pins divide-by-zero / zero-LY percent behavior', () => {
        const { rows } = buildVsLyMatrix('rooms', requests, accounts, 2026, 'SAR', opts);

        // CY > 0, LY = 0 → '-' (not +100%)
        const newSeg = rows.find((r) => r.id === 'r-rev-2-NewSeg');
        expect(newSeg?.months[5]).toMatchObject({
            month: 6,
            cy: 'SAR 2,000',
            ly: 'SAR 0',
            pct: '-',
        });
        expect(newSeg?.ytd.pct).toBe('-');

        // CY = 0, LY = 0 → '0%'
        expect(newSeg?.months[2]).toMatchObject({
            month: 3,
            cy: 'SAR 0',
            ly: 'SAR 0',
            pct: '0%',
        });
    });

    it('characterizes total rooms revenue YTD and March cell', () => {
        const { rows } = buildVsLyMatrix('rooms', requests, accounts, 2026, 'SAR', opts);
        const total = rows.find((r) => r.id === 'roomsRev');
        expect(total?.rowKind).toBe('totalRevenue');
        expect(total?.ytd).toEqual({
            cy: 'SAR 4,000',
            ly: 'SAR 800',
            pct: '+400%',
            otb: 'SAR 0',
            cyOtbVsLyPct: '+400%',
        });
        expect(total?.months[2]).toMatchObject({
            cy: 'SAR 2,000',
            ly: 'SAR 800',
            pct: '+150%',
        });
    });

    it('includes core ADR / nights rows', () => {
        const { rows } = buildVsLyMatrix('rooms', requests, accounts, 2026, 'SAR', opts);
        expect(rows.find((r) => r.id === 'adr')?.months[2]).toMatchObject({
            cy: 'SAR 500',
            ly: 'SAR 400',
            pct: '+25%',
        });
        expect(rows.find((r) => r.id === 'nights')?.ytd).toEqual({
            cy: '6',
            ly: '2',
            pct: '+200%',
            otb: '0',
            cyOtbVsLyPct: '+200%',
        });
    });
});
