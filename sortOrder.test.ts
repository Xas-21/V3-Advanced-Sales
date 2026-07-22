import { describe, expect, it } from 'vitest';
import { moveItem, nextSortOrder, sortBySortOrder, withReassignedSortOrder } from './sortOrder';

describe('sortBySortOrder', () => {
    it('orders by sortOrder ascending; missing last; ties by id', () => {
        const rows = [
            { id: 'b', sortOrder: 2, name: 'B' },
            { id: 'a', name: 'A' },
            { id: 'c', sortOrder: 0, name: 'C' },
            { id: 'd', sortOrder: 2, name: 'D' },
        ];
        expect(sortBySortOrder(rows).map((r) => r.id)).toEqual(['c', 'b', 'd', 'a']);
    });
});

describe('moveItem / withReassignedSortOrder', () => {
    it('moves last to first and reassigns 0..n-1', () => {
        const rows = [
            { id: 'a', sortOrder: 0 },
            { id: 'b', sortOrder: 1 },
            { id: 'c', sortOrder: 2 },
        ];
        const moved = moveItem(rows, 2, 0);
        expect(moved.map((r) => r.id)).toEqual(['c', 'a', 'b']);
        expect(withReassignedSortOrder(moved).map((r) => r.sortOrder)).toEqual([0, 1, 2]);
    });
});

describe('nextSortOrder', () => {
    it('returns max+1 and 0 for empty', () => {
        expect(nextSortOrder([])).toBe(0);
        expect(nextSortOrder([{ sortOrder: 0 }, { sortOrder: 4 }])).toBe(5);
        expect(nextSortOrder([{}])).toBe(0);
    });
});
