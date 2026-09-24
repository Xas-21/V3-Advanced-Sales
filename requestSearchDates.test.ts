import { describe, expect, it } from 'vitest';
import {
    getRequestChartBucketAnchorDate,
    getRequestSearchDepartureDate,
    requestMatchesSearchDateRanges,
} from './operationalSegmentRevenue';

describe('request search dates', () => {
    const multiRoom = {
        requestType: 'accommodation',
        checkIn: '2026-01-20',
        checkOut: '2026-01-25',
        rooms: [
            { arrival: '2026-01-14', departure: '2026-01-18' },
            { arrival: '2026-01-12', departure: '2026-01-16' },
        ],
    };

    it('uses the earliest room arrival and that stay’s departure', () => {
        expect(getRequestChartBucketAnchorDate(multiRoom)).toBe('2026-01-12');
        expect(getRequestSearchDepartureDate(multiRoom)).toBe('2026-01-16');
    });

    it('keeps only bookings whose earliest arrival is inside the arrival range', () => {
        expect(requestMatchesSearchDateRanges(multiRoom, '2026-01-12', '2026-01-14', '', '')).toBe(true);
        expect(requestMatchesSearchDateRanges(multiRoom, '2026-01-13', '2026-01-14', '', '')).toBe(false);
    });

    it('does not match a later arrival just because the stay overlaps the old window', () => {
        const september = {
            requestType: 'accommodation',
            rooms: [{ arrival: '2026-09-02', departure: '2026-09-06' }],
        };
        expect(requestMatchesSearchDateRanges(september, '2026-08-01', '2026-08-31', '', '')).toBe(false);
        expect(requestMatchesSearchDateRanges(september, '2026-08-01', '', '', '2026-08-31')).toBe(false);
    });

    it('uses the earliest agenda start and that row’s end for events', () => {
        const event = {
            requestType: 'event',
            agenda: [
                { startDate: '2026-03-10', endDate: '2026-03-12' },
                { startDate: '2026-03-04', endDate: '2026-03-05' },
            ],
        };
        expect(getRequestChartBucketAnchorDate(event)).toBe('2026-03-04');
        expect(getRequestSearchDepartureDate(event)).toBe('2026-03-05');
        expect(requestMatchesSearchDateRanges(event, '', '', '2026-03-05', '2026-03-06')).toBe(true);
        expect(requestMatchesSearchDateRanges(event, '', '', '2026-03-10', '2026-03-12')).toBe(false);
    });
});
