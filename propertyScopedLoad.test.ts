import { describe, it, expect } from 'vitest';
import { beginPropertyLoad, isPropertyLoadCurrent, type PropertyLoadGate } from './propertyScopedLoad';

function gate(current = ''): PropertyLoadGate {
  return { current };
}

describe('propertyScopedLoad', () => {
  it('beginPropertyLoad returns false and clears gate when propertyId is empty', () => {
    const g = gate('old');
    expect(beginPropertyLoad(g, '')).toBe(false);
    expect(g.current).toBe('');
    expect(beginPropertyLoad(g, null)).toBe(false);
    expect(beginPropertyLoad(g, undefined)).toBe(false);
    expect(beginPropertyLoad(g, '   ')).toBe(false);
  });

  it('beginPropertyLoad sets gate and returns true for a real propertyId', () => {
    const g = gate();
    expect(beginPropertyLoad(g, 'P1')).toBe(true);
    expect(g.current).toBe('P1');
    expect(beginPropertyLoad(g, '  P2  ')).toBe(true);
    expect(g.current).toBe('P2');
  });

  it('isPropertyLoadCurrent is false when empty or switched mid-flight', () => {
    const g = gate();
    expect(isPropertyLoadCurrent(g, 'P1')).toBe(false);

    beginPropertyLoad(g, 'P1');
    expect(isPropertyLoadCurrent(g, 'P1')).toBe(true);
    expect(isPropertyLoadCurrent(g, 'P2')).toBe(false);
    expect(isPropertyLoadCurrent(g, '')).toBe(false);
    expect(isPropertyLoadCurrent(g, null)).toBe(false);

    beginPropertyLoad(g, 'P2');
    expect(isPropertyLoadCurrent(g, 'P1')).toBe(false);
    expect(isPropertyLoadCurrent(g, 'P2')).toBe(true);

    beginPropertyLoad(g, '');
    expect(isPropertyLoadCurrent(g, 'P2')).toBe(false);
  });
});
