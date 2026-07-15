import { describe, it, expect } from 'vitest';
import { calculateStatDelta, clampStat } from '../stats.js';
import type { StatDeltaRecord } from '@lmh/types';

function rec(
  stat: StatDeltaRecord['stat'],
  sizeCat?: StatDeltaRecord['sizeCat'],
): StatDeltaRecord {
  return { stat, target: 'test', delta: 0, reason: 'test', sizeCat };
}

describe('calculateStatDelta', () => {
  describe('Approval', () => {
    it('Small +  = +0.5', () => expect(calculateStatDelta(rec('Approval', 'Small'),  1)).toBe(0.5));
    it('Small -  = -0.5', () => expect(calculateStatDelta(rec('Approval', 'Small'), -1)).toBe(-0.5));
    it('Medium + = +1',   () => expect(calculateStatDelta(rec('Approval', 'Medium'), 1)).toBe(1));
    it('Medium - = -1',   () => expect(calculateStatDelta(rec('Approval', 'Medium'),-1)).toBe(-1));
    it('Large +  = +2',   () => expect(calculateStatDelta(rec('Approval', 'Large'),  1)).toBe(2));
    it('Large -  = -2',   () => expect(calculateStatDelta(rec('Approval', 'Large'), -1)).toBe(-2));
  });

  describe('Recognition', () => {
    it('Small  = ±5',  () => {
      expect(calculateStatDelta(rec('Recognition', 'Small'),   1)).toBe(5);
      expect(calculateStatDelta(rec('Recognition', 'Small'),  -1)).toBe(-5);
    });
    it('Medium = ±10', () => {
      expect(calculateStatDelta(rec('Recognition', 'Medium'),  1)).toBe(10);
      expect(calculateStatDelta(rec('Recognition', 'Medium'), -1)).toBe(-10);
    });
    it('Large  = ±15', () => {
      expect(calculateStatDelta(rec('Recognition', 'Large'),   1)).toBe(15);
      expect(calculateStatDelta(rec('Recognition', 'Large'),  -1)).toBe(-15);
    });
  });

  describe('Rizz (gain-only)', () => {
    it('always returns +1 regardless of direction', () => {
      expect(calculateStatDelta(rec('Rizz', 'Small'),  1)).toBe(1);
      expect(calculateStatDelta(rec('Rizz', 'Small'), -1)).toBe(1);
      expect(calculateStatDelta(rec('Rizz', 'Large'), -1)).toBe(1);
    });
  });

  describe('Party', () => {
    it('Small = ±0.5', () => {
      expect(calculateStatDelta(rec('Party', 'Small'),  1)).toBe(0.5);
      expect(calculateStatDelta(rec('Party', 'Small'), -1)).toBe(-0.5);
    });
  });

  describe('Region', () => {
    it('Medium = ±0.1', () => {
      expect(calculateStatDelta(rec('Region', 'Medium'),  1)).toBeCloseTo(0.1);
      expect(calculateStatDelta(rec('Region', 'Medium'), -1)).toBeCloseTo(-0.1);
    });
    it('Large  = ±0.2', () => {
      expect(calculateStatDelta(rec('Region', 'Large'),   1)).toBeCloseTo(0.2);
      expect(calculateStatDelta(rec('Region', 'Large'),  -1)).toBeCloseTo(-0.2);
    });
  });

  it('returns 0 when sizeCat is undefined', () => {
    expect(calculateStatDelta(rec('Approval'), 1)).toBe(0);
  });
});

describe('clampStat', () => {
  it('Approval clamps at floor 25', () => {
    expect(clampStat('Approval', 26, -5)).toBe(25);
    expect(clampStat('Approval', 25,  0)).toBe(25);
  });

  it('Approval clamps at ceiling 70', () => {
    expect(clampStat('Approval', 69, 5)).toBe(70);
    expect(clampStat('Approval', 70, 1)).toBe(70);
  });

  it('Approval passes through within bounds', () => {
    expect(clampStat('Approval', 50,  1)).toBe(51);
    expect(clampStat('Approval', 50, -1)).toBe(49);
  });

  it('Recognition floor is 0', () => {
    expect(clampStat('Recognition', 3, -10)).toBe(0);
  });

  it('Recognition ceiling is 100', () => {
    expect(clampStat('Recognition', 98, 10)).toBe(100);
  });

  it('Rizz has no ceiling', () => {
    expect(clampStat('Rizz', 100, 50)).toBe(150);
  });

  it('Region has no ceiling', () => {
    expect(clampStat('Region', 5.0, 10.0)).toBeCloseTo(15.0);
  });

  it('Rizz floor is 0', () => {
    // Rizz is gain-only, but clampStat itself enforces the floor
    expect(clampStat('Rizz', 0, -1)).toBe(0);
  });
});
