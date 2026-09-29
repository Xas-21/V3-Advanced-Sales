import { describe, expect, it } from 'vitest';
import {
    coverageStats,
    lookupRatePlanPrice,
    mergeRatePlanLines,
    planUseStats,
    priceChartRows,
    ratePlanGapNote,
    ratePlanTouch,
    type RatePlan,
} from './ratePlans';

const plan: RatePlan = {
    id: 'RP1',
    propertyId: 'P1',
    code: 'TO',
    name: 'Tour Operator',
    periods: [
        {
            id: 'wide',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            updatedAt: '2026-01-02T00:00:00Z',
            lines: [
                {
                    id: 'a',
                    roomType: 'Deluxe',
                    mealPlan: 'BB',
                    rates: { Single: 100, Double: 0, Triple: null },
                },
            ],
        },
        {
            id: 'short',
            startDate: '2026-06-01',
            endDate: '2026-06-10',
            updatedAt: '2026-01-01T00:00:00Z',
            lines: [
                {
                    id: 'b',
                    roomType: 'Deluxe',
                    mealPlan: 'BB',
                    rates: { Single: 450 },
                },
            ],
        },
        {
            id: 'short-newer',
            startDate: '2026-06-01',
            endDate: '2026-06-10',
            updatedAt: '2026-03-01T00:00:00Z',
            lines: [
                {
                    id: 'c',
                    roomType: 'Deluxe',
                    mealPlan: 'BB',
                    rates: { Single: 480 },
                },
            ],
        },
    ],
};

describe('lookupRatePlanPrice', () => {
    it('uses the shorter period, then the latest save, and keeps a typed 0', () => {
        expect(
            lookupRatePlanPrice({
                plan,
                stayStart: '2026-06-02',
                stayEnd: '2026-06-05',
                roomType: 'Deluxe',
                occupancy: 'Single',
                mealPlan: 'BB',
            })
        ).toBe(480);
        expect(
            lookupRatePlanPrice({
                plan,
                stayStart: '2026-03-02',
                stayEnd: '2026-03-05',
                roomType: 'Deluxe',
                occupancy: 'Double',
                mealPlan: 'BB',
            })
        ).toBe(0);
        expect(
            lookupRatePlanPrice({
                plan,
                stayStart: '2026-06-02',
                stayEnd: '2026-06-05',
                roomType: 'Deluxe',
                occupancy: 'Double',
                mealPlan: 'BB',
            })
        ).toBeNull();
    });

    it('returns null when the combo or the dates have no price', () => {
        expect(
            lookupRatePlanPrice({
                plan,
                stayStart: '2026-06-02',
                stayEnd: '2026-06-05',
                roomType: 'Deluxe',
                occupancy: 'Triple',
                mealPlan: 'BB',
            })
        ).toBeNull();
        expect(
            lookupRatePlanPrice({
                plan,
                stayStart: '2026-06-02',
                stayEnd: '2026-06-05',
                roomType: 'Deluxe',
                occupancy: 'Single',
                mealPlan: 'HB',
            })
        ).toBeNull();
        expect(
            lookupRatePlanPrice({
                plan,
                stayStart: '2027-01-01',
                stayEnd: '2027-01-03',
                roomType: 'Deluxe',
                occupancy: 'Single',
                mealPlan: 'BB',
            })
        ).toBeNull();
    });
});

describe('mergeRatePlanLines', () => {
    it('keeps the later line for the same room type and meal plan', () => {
        const lines = mergeRatePlanLines([
            { id: '1', roomType: 'Deluxe', mealPlan: 'BB', rates: { Single: 100 } },
            { id: '2', roomType: 'deluxe', mealPlan: 'bb', rates: { Single: 200 } },
            { id: '3', roomType: 'Deluxe', mealPlan: 'HB', rates: { Single: 300 } },
        ]);
        expect(lines).toHaveLength(2);
        expect(lines[0].rates.Single).toBe(200);
        expect(lines[1].mealPlan).toBe('HB');
    });
});

describe('ratePlanTouch', () => {
    const base = {
        planId: 'RP1',
        stayStart: '2026-06-01',
        stayEnd: '2026-06-05',
        rooms: [
            { id: '1', type: 'Deluxe', occupancy: 'Single', mealPlan: 'BB' },
            { id: '2', type: 'Standard', occupancy: 'Double', mealPlan: 'RO' },
        ],
    };

    it('reprices every room when the plan or the dates change', () => {
        expect(ratePlanTouch(base, { ...base, planId: 'RP2' }).all).toBe(true);
        expect(ratePlanTouch(base, { ...base, stayEnd: '2026-06-08' }).ids).toEqual(['1', '2']);
    });

    it('reprices only the room whose type, occupancy, or meal plan changed', () => {
        const next = {
            ...base,
            rooms: [
                { id: '1', type: 'Deluxe', occupancy: 'Double', mealPlan: 'BB' },
                base.rooms[1],
            ],
        };
        const touch = ratePlanTouch(base, next);
        expect(touch.all).toBe(false);
        expect(touch.ids).toEqual(['1']);
    });
});

describe('charts', () => {
    it('leaves a gap for a missing price and lists that combo', () => {
        const period = plan.periods[0];
        const rows = priceChartRows(period, 'BB', ['Single', 'Double', 'Triple']);
        expect(rows[0].Single).toBe(100);
        expect(rows[0].Double).toBe(0);
        expect(rows[0].Triple).toBeNull();
        const cover = coverageStats(period, 'BB', ['Single', 'Double', 'Triple']);
        expect(cover.filled).toBe(2);
        expect(cover.total).toBe(3);
        expect(cover.missing).toEqual(['Deluxe · Triple · BB']);
    });

    it('counts requests on the plan and skips cancelled stays and stays with no plan', () => {
        const stats = planUseStats(
            [plan],
            [
                {
                    ratePlanId: 'RP1',
                    status: 'Definite',
                    checkIn: '2026-06-02',
                    checkOut: '2026-06-04',
                    nights: 2,
                    rooms: [{ rate: 100, count: 3 }],
                },
                {
                    ratePlanId: 'RP1',
                    status: 'Cancelled',
                    checkIn: '2026-06-02',
                    checkOut: '2026-06-04',
                    nights: 2,
                    rooms: [{ rate: 999, count: 1 }],
                },
                {
                    status: 'Definite',
                    checkIn: '2026-06-02',
                    checkOut: '2026-06-04',
                    nights: 2,
                    rooms: [{ rate: 50, count: 1 }],
                },
            ],
            '2026-06-01',
            '2026-06-30'
        );
        expect(stats).toHaveLength(1);
        expect(stats[0].requestCount).toBe(1);
        expect(stats[0].roomRevenue).toBe(600);
        expect(ratePlanGapNote(false, true, true)).toBe('No price on this plan for this room');
        expect(ratePlanGapNote(false, false, true)).toBeNull();
    });
});
