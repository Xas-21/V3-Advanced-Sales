import { describe, expect, it } from 'vitest';
import { visibleCardComments, type CrmCardComment } from './crmCardComments';

function c(id: string, body: string): CrmCardComment {
    return {
        id,
        targetType: 'request',
        targetId: 'R1',
        body,
        authorUserId: 'U1',
        authorName: 'Ada',
        createdAt: `2026-07-19T0${id}:00:00Z`,
    };
}

describe('visibleCardComments', () => {
    const five = [c('5', 'n5'), c('4', 'n4'), c('3', 'n3'), c('2', 'n2'), c('1', 'n1')];

    it('returns all when 2 or fewer', () => {
        expect(visibleCardComments(five.slice(0, 2), false).map((x) => x.id)).toEqual(['5', '4']);
    });

    it('shows only two most recent when collapsed', () => {
        expect(visibleCardComments(five, false).map((x) => x.id)).toEqual(['5', '4']);
    });

    it('shows all when expanded', () => {
        expect(visibleCardComments(five, true).map((x) => x.id)).toEqual(['5', '4', '3', '2', '1']);
    });
});
