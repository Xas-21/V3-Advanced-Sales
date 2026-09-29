import { describe, expect, it } from 'vitest';
import { applyLookedRoomRate, lookupAccountRoomRate, overlapsRateWindow, type AccountRatePeriod } from './accountRates';

const base: AccountRatePeriod = {
    id: 'AR1',
    propertyId: 'P1',
    accountId: 'A1',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    segments: ['Corporate'],
    rows: [{ id: 'r1', roomType: 'Standard', occupancy: 'Single', mealPlan: '', rate: 400 }],
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
            rows: [{ id: 'rw', roomType: 'Standard', occupancy: 'Single', mealPlan: '', rate: 100 }],
            updatedAt: '2026-06-01T00:00:00Z',
        };
        const narrow: AccountRatePeriod = {
            ...base,
            id: 'AR-narrow',
            startDate: '2026-06-01',
            endDate: '2026-06-15',
            rows: [{ id: 'rn', roomType: 'Standard', occupancy: 'Single', mealPlan: '', rate: 550 }],
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

    it('matches the meal plan and prefers it over a blank legacy row', () => {
        const withMeals: AccountRatePeriod = {
            ...base,
            rows: [
                { id: 'any', roomType: 'Standard', occupancy: 'Single', mealPlan: '', rate: 100 },
                { id: 'bb', roomType: 'Standard', occupancy: 'Single', mealPlan: 'BB', rate: 450 },
                { id: 'hb', roomType: 'Standard', occupancy: 'Single', mealPlan: 'HB', rate: 600 },
            ],
        };
        const args = {
            periods: [withMeals],
            accountId: 'A1',
            segment: 'Corporate',
            stayStart: '2026-06-10',
            stayEnd: '2026-06-12',
            roomType: 'Standard',
            occupancy: 'Single',
        };
        expect(lookupAccountRoomRate({ ...args, mealPlan: 'bb' })).toBe(450);
        expect(lookupAccountRoomRate({ ...args, mealPlan: 'HB' })).toBe(600);
        expect(lookupAccountRoomRate({ ...args, mealPlan: 'FB' })).toBe(100);
        expect(lookupAccountRoomRate({ ...args, mealPlan: 'BB' })).toBe(450);
    });

    it('does not apply a different meal plan when no blank rate exists', () => {
        expect(
            lookupAccountRoomRate({
                periods: [
                    {
                        ...base,
                        rows: [{ id: 'bb', roomType: 'Standard', occupancy: 'Single', mealPlan: 'BB', rate: 450 }],
                    },
                ],
                accountId: 'A1',
                segment: 'Corporate',
                stayStart: '2026-06-10',
                stayEnd: '2026-06-12',
                roomType: 'Standard',
                occupancy: 'Single',
                mealPlan: 'HB',
            })
        ).toBeNull();
    });

    it('keeps a typed rate when the account has no matching rate', () => {
        expect(applyLookedRoomRate(350, null)).toBe(350);
        expect(applyLookedRoomRate(350, 400)).toBe(400);
        expect(applyLookedRoomRate(350, 0)).toBe(0);
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
