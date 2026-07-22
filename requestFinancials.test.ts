import { describe, it, expect } from 'vitest';
import {
  calculateAccFinancialsForRequest,
  calculateEvtFinancials,
} from './requestFinancials';

/**
 * Characterization net — pins today's calculator outputs.
 * Do not "fix" goldens when changing money math; update deliberately.
 */
describe('requestFinancials characterization', () => {
  it('(a) rooms-only accommodation pins grand total with room tax only', () => {
    const form = {
      requestType: 'accommodation',
      checkIn: '2026-03-01',
      checkOut: '2026-03-04',
      rooms: [{ rate: 150, count: 2, type: 'Deluxe' }],
      transportation: [],
      agenda: [],
      payments: [],
    };
    const taxes = [
      { rate: 10, scope: { accommodation: true } },
      { rate: 5, scope: { events: true } }, // must not apply to rooms-only
    ];

    const fin = calculateAccFinancialsForRequest(form, taxes, 'accommodation');

    // 150 * 2 rooms * 3 nights = 900; +10% room tax → 900 * 1.1
    // FLOAT NOTE: 900 * 1.1 === 990.0000000000001 in IEEE-754 (not rounded today).
    expect(fin.nights).toBe(3);
    expect(fin.roomsCostNoTax).toBe(900);
    expect(fin.roomsCostWithTax).toBe(990.0000000000001);
    expect(fin.eventCostNoTax).toBe(0);
    expect(fin.transCostNoTax).toBe(0);
    expect(fin.grandTotalNoTax).toBe(900);
    expect(fin.grandTotalWithTax).toBe(990.0000000000001);
    expect(fin.totalCostWithTax).toBe(990.0000000000001);
    expect(fin.totalRooms).toBe(2);
    expect(fin.totalRoomNights).toBe(6);
    expect(fin.adr).toBe(150);
    expect(fin.paidAmount).toBe(0);
    expect(fin.paymentStatus).toBe('Unpaid');
  });

  it('(b) MICE/event-only with stacked taxes pins float-rounding total', () => {
    const form = {
      agenda: [
        {
          startDate: '2026-04-10',
          endDate: '2026-04-11',
          rate: 45.5,
          pax: 37,
          rental: 120.75,
        },
      ],
      payments: [{ amount: 500 }],
    };
    // Stacked awkward rates + F&B scope (evt calculator includes foodAndBeverage)
    const taxes = [
      { rate: 8.5, scope: { events: true } },
      { rate: 7.25, scope: { foodAndBeverage: true } },
      { rate: 2.333, scope: { events: true } },
    ];

    const fin = calculateEvtFinancials(form, taxes);

    // ((45.5*37)+120.75)*2 days = 3608.5
    // tax mult = 0.085+0.0725+0.02333 = 0.18083
    // 3608.5 * 1.18083 = 4261.025055
    expect(fin.eventCostNoTax).toBe(3608.5);
    expect(fin.eventCostWithTax).toBe(4261.025055);
    expect(fin.totalCostWithTax).toBe(4261.025055);
    expect(fin.grandTotalWithTax).toBe(4261.025055);
    expect(fin.grandTotalNoTax).toBe(3608.5);
    expect(fin.revenue).toBe(3608.5);
    expect(fin.totalPax).toBe(37);
    expect(fin.totalEventAttendeeDays).toBe(74);
    expect(fin.totalEventDays).toBe(2);
    expect(fin.paidAmount).toBe(500);
    expect(fin.paymentStatus).toBe('Deposit');
    expect(fin.nights).toBe(0);
    expect(fin.totalRooms).toBe(0);
    expect(fin.adr).toBe(0);
  });

  it('(c) event+rooms with promotionId pins combined totals (promo is metadata only today)', () => {
    const form = {
      requestType: 'event_rooms',
      checkIn: '2026-05-01',
      checkOut: '2026-05-03',
      promotionId: 'PROMO-SPRING-10',
      rooms: [
        {
          arrival: '2026-05-01',
          departure: '2026-05-03',
          rate: 200,
          count: 5,
        },
      ],
      agenda: [
        {
          startDate: '2026-05-01',
          endDate: '2026-05-02',
          rate: 80,
          pax: 50,
          rental: 500,
        },
      ],
      transportation: [{ costPerWay: 100 }],
      payments: [{ amount: 1000 }, { amount: 500 }],
    };
    const taxes = [
      { rate: 12, scope: { accommodation: true } },
      { rate: 10, scope: { events: true } },
      { rate: 5, scope: { transport: true } },
    ];

    const fin = calculateAccFinancialsForRequest(form, taxes, 'event_rooms');

    // rooms: 200*5*2 = 2000 → 2240 w/ 12%
    // event: ((80*50)+500)*2 = 9000 → 9900 w/ 10%
    // trans: 100 → 105 w/ 5%
    // grand: 11100 / 12245
    // NOTE: promotionId is present but does not change calculator output today.
    expect(fin.nights).toBe(2);
    expect(fin.roomsCostNoTax).toBe(2000);
    expect(fin.roomsCostWithTax).toBe(2240);
    expect(fin.eventCostNoTax).toBe(9000);
    expect(fin.eventCostWithTax).toBe(9900);
    expect(fin.transCostNoTax).toBe(100);
    expect(fin.transCostWithTax).toBe(105);
    expect(fin.grandTotalNoTax).toBe(11100);
    expect(fin.grandTotalWithTax).toBe(12245);
    expect(fin.totalCostWithTax).toBe(12245);
    expect(fin.totalRooms).toBe(5);
    expect(fin.totalRoomNights).toBe(10);
    expect(fin.adr).toBe(200);
    expect(fin.ddr).toBe(180);
    expect(fin.totalEventPax).toBe(50);
    expect(fin.totalEventAttendeeDays).toBe(100);
    expect(fin.totalEventDays).toBe(2);
    expect(fin.paidAmount).toBe(1500);
    expect(fin.paymentStatus).toBe('Deposit');
  });
});
