import { describe, expect, it } from 'vitest';
import { lookupAccountRoomRate, overlapsRateWindow, type AccountRatePeriod } from './accountRates';

const base: AccountRatePeriod = {
    id: 'AR1',
    propertyId: 'P1',
    accountId: 'A1',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    segments: ['Corporate'],
    rows: [{ id: 'r1', roomType: 'Standard', occupancy: 'Single', rate: 400 }],
    updatedAt: '2026-01-01T00:00:00Z',
};

describe('overlapsRateWindow', () => {
    it('detects overlap and non-overlap', () => {
        expect(overlapsRateWindow('2026-06-10', '2026-06-12', '2026-06-01', '2026-06-30')).toBe(true);
        expect(overlapsRateWindow('2026-07-01', '2026-07-02', '2026-06-01', '2026-06-30')).toBe(false);
    });
});

describe('lookupAccountRoomRate', () => {
    it('returns matching rate', () => {
        const rate = lookupAccountRoomRate({
            periods: [base],
            accountId: 'A1',
            segment: 'corporate',
            stayStart: '2026-06-10',
            stayEnd: '2026-06-12',
            roomType: 'standard',
            occupancy: 'single',
        });
        expect(rate).toBe(400);
    });

    it('returns null on segment mismatch', () => {
        expect(
            lookupAccountRoomRate({
                periods: [base],
                accountId: 'A1',
                segment: 'Leisure',
                stayStart: '2026-06-10',
                stayEnd: '2026-06-12',
                roomType: 'Standard',
                occupancy: 'Single',
            })
        ).toBeNull();
    });

    it('returns null when dates do not overlap', () => {
        expect(
            lookupAccountRoomRate({
                periods: [base],
                accountId: 'A1',
                segment: 'Corporate',
                stayStart: '2026-07-10',
                stayEnd: '2026-07-12',
                roomType: 'Standard',
                occupancy: 'Single',
            })
        ).toBeNull();
    });

    it('returns null on occupancy mismatch', () => {
        expect(
            lookupAccountRoomRate({
                periods: [base],
                accountId: 'A1',
                segment: 'Corporate',
                stayStart: '2026-06-10',
                stayEnd: '2026-06-12',
                roomType: 'Standard',
                occupancy: 'Double',
            })
        ).toBeNull();
    });

    it('prefers the narrowest matching period', () => {
        const wide: AccountRatePeriod = {
            ...base,
            id: 'AR-wide',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            rows: [{ id: 'rw', roomType: 'Standard', occupancy: 'Single', rate: 100 }],
            updatedAt: '2026-06-01T00:00:00Z',
        };
        const narrow: AccountRatePeriod = {
            ...base,
            id: 'AR-narrow',
            startDate: '2026-06-01',
            endDate: '2026-06-15',
            rows: [{ id: 'rn', roomType: 'Standard', occupancy: 'Single', rate: 550 }],
            updatedAt: '2026-01-01T00:00:00Z',
        };
        expect(
            lookupAccountRoomRate({
                periods: [wide, narrow],
                accountId: 'A1',
                segment: 'Corporate',
                stayStart: '2026-06-10',
                stayEnd: '2026-06-12',
                roomType: 'Standard',
                occupancy: 'Single',
            })
        ).toBe(550);
    });

    it('returns null when period has empty segments', () => {
        expect(
            lookupAccountRoomRate({
                periods: [{ ...base, segments: [] }],
                accountId: 'A1',
                segment: 'Corporate',
                stayStart: '2026-06-10',
                stayEnd: '2026-06-12',
                roomType: 'Standard',
                occupancy: 'Single',
            })
        ).toBeNull();
    });
});
