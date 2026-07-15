import { describe, it, expect } from 'vitest';
import { makeRNG } from '../rng.js';

describe('makeRNG', () => {
  it('produces the same sequence for the same seed', () => {
    const rng1 = makeRNG(42);
    const rng2 = makeRNG(42);
    for (let i = 0; i < 20; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('produces different first values for different seeds', () => {
    expect(makeRNG(1)()).not.toBe(makeRNG(2)());
  });

  it('output is always in [0, 1)', () => {
    const rng = makeRNG(0);
    for (let i = 0; i < 1_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('single-bit seed differences produce different outputs (splitmix32 avalanche)', () => {
    expect(makeRNG(0b0001)()).not.toBe(makeRNG(0b0010)());
    expect(makeRNG(0b0010)()).not.toBe(makeRNG(0b0100)());
    expect(makeRNG(0b0100)()).not.toBe(makeRNG(0b1000)());
  });

  it('seed 0 does not produce the all-zero state', () => {
    // If the state were all-zero the generator would be stuck; any output != 0
    expect(makeRNG(0)()).not.toBe(0);
  });
});
