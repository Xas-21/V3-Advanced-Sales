import { describe, expect, it, vi } from 'vitest';
import {
    PROFILE_ACTIVITY_LOG_CAP,
    PROFILE_ACTIVITY_MODAL_CAP,
    PROFILE_ACTIVITY_PREVIEW_CAP,
    buildProfileActivityLog,
    countOpenPipeline,
    countOpenPipelineAttributed,
    countOpenPipelineInYmdRange,
    countOpenPipelineInYmdRangeAttributed,
    countRequestsInYmdRange,
    countRequestsInYmdRangeAttributed,
    sumRevenueInYmdRange,
    sumRevenueInYmdRangeAttributed,
} from './userProfileMetrics';

vi.mock('./operationalSegmentRevenue', () => ({
    eachInclusiveAgendaDayYmd: () => [],
    eachOccupiedNightYmd: () => [],
    parseYmdAgenda: (v: any) => String(v || '').slice(0, 10),
    requestTouchesOperationalDateRange: (req: any, start: string, end: string) => {
        const d = String(req?.opDate || '');
        return Boolean(d) && d >= start && d <= end;
    },
    sumRequestProratedRevenueExTaxInRange: (req: any) => Number(req?.mockRev ?? 0),
}));

describe('attributed KPI helpers match full-scan wrappers', () => {
    const user = { id: 'u1', name: 'Alice', username: 'alice' };
    const propertyId = 'p1';
    const start = '2026-03-01';
    const end = '2026-03-31';

    const requests = [
        { id: '1', propertyId: 'p1', createdByUserId: 'u1', status: 'definite', mockRev: 100, opDate: '2026-03-15' },
        { id: '2', propertyId: 'p1', createdByUserId: 'u1', status: 'inquiry', mockRev: 50, opDate: '2026-03-20' },
        { id: '3', propertyId: 'p2', createdByUserId: 'u1', status: 'definite', mockRev: 999, opDate: '2026-03-15' },
        { id: '4', propertyId: 'p1', createdByUserId: 'u2', status: 'definite', mockRev: 888, opDate: '2026-03-15' },
        { id: '5', propertyId: 'p1', createdByUserId: 'u1', status: 'cancelled', mockRev: 70, opDate: '2026-03-15' },
        { id: '6', propertyId: 'p1', createdByUserId: 'u1', status: 'tentative', mockRev: 40, opDate: '2026-04-01' },
    ];

    const attributed = requests.filter(
        (r) => r.propertyId === propertyId && String(r.createdByUserId) === String(user.id)
    );

    it('revenue totals match', () => {
        expect(sumRevenueInYmdRangeAttributed(attributed, start, end)).toBe(
            sumRevenueInYmdRange(requests, propertyId, user, start, end)
        );
        // Mock returns full mockRev regardless of range; cancelled excluded → 100+50+40
        expect(sumRevenueInYmdRangeAttributed(attributed, start, end)).toBe(190);
    });

    it('request counts match', () => {
        expect(countRequestsInYmdRangeAttributed(attributed, start, end)).toBe(
            countRequestsInYmdRange(requests, propertyId, user, start, end)
        );
        expect(countRequestsInYmdRangeAttributed(attributed, start, end)).toBe(2);
    });

    it('open pipeline counts match', () => {
        expect(countOpenPipelineAttributed(attributed)).toBe(countOpenPipeline(requests, propertyId, user));
        expect(countOpenPipelineAttributed(attributed)).toBe(2);
        expect(countOpenPipelineInYmdRangeAttributed(attributed, start, end)).toBe(
            countOpenPipelineInYmdRange(requests, propertyId, user, start, end)
        );
        expect(countOpenPipelineInYmdRangeAttributed(attributed, start, end)).toBe(1);
    });
});

describe('buildProfileActivityLog', () => {
    const user = { id: 'u1', name: 'Alice', username: 'alice' };

    function manyLogs(n: number) {
        const now = Date.now();
        return [
            {
                id: 'r1',
                propertyId: 'p1',
                logs: Array.from({ length: n }, (_, i) => ({
                    user: 'Alice',
                    action: i % 2 === 0 ? `Booking ${i}` : `Call note ${i}`,
                    date: new Date(now - i * 1000).toISOString(),
                    details: i % 3 === 0 ? 'VIP group' : 'standard',
                })),
            },
        ];
    }

    it(`defaults to modal cap (${PROFILE_ACTIVITY_MODAL_CAP})`, () => {
        const rows = buildProfileActivityLog(manyLogs(PROFILE_ACTIVITY_LOG_CAP + 40), [], [], user, 'p1', 60 * 86400000);
        expect(rows.length).toBe(PROFILE_ACTIVITY_MODAL_CAP);
        expect(rows[0].atMs).toBeGreaterThanOrEqual(rows[rows.length - 1].atMs);
    });

    it(`respects preview cap (${PROFILE_ACTIVITY_PREVIEW_CAP})`, () => {
        const rows = buildProfileActivityLog(
            manyLogs(80),
            [],
            [],
            user,
            'p1',
            60 * 86400000,
            PROFILE_ACTIVITY_PREVIEW_CAP
        );
        expect(rows.length).toBe(PROFILE_ACTIVITY_PREVIEW_CAP);
    });

    it('search keeps matching rows up to maxRows', () => {
        const rows = buildProfileActivityLog(
            manyLogs(80),
            [],
            [],
            user,
            'p1',
            60 * 86400000,
            PROFILE_ACTIVITY_MODAL_CAP,
            'VIP'
        );
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => /vip/i.test(r.title + r.desc))).toBe(true);
        expect(rows.length).toBeLessThanOrEqual(PROFILE_ACTIVITY_MODAL_CAP);
    });
});
