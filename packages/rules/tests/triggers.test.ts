import { describe, it, expect } from 'vitest';
import { makeRNG } from '../rng.js';
import { rollTrigger, rollSize, rollDirection, TRIGGER_CHANCE } from '../triggers.js';

const TRIALS = 10_000;

describe('TRIGGER_CHANCE', () => {
  it('has the correct probability for each source type', () => {
    expect(TRIGGER_CHANCE.EVENT).toBe(0.30);
    expect(TRIGGER_CHANCE.COURT).toBe(0.20);
    expect(TRIGGER_CHANCE.NPC_BILL).toBe(0.30);
    expect(TRIGGER_CHANCE.PLAYER_ACTION).toBe(1.00);
  });
});

describe('rollTrigger', () => {
  it('is reproducible for the same seed', () => {
    expect(rollTrigger('EVENT', makeRNG(7))).toBe(rollTrigger('EVENT', makeRNG(7)));
  });

  it('PLAYER_ACTION always returns true', () => {
    const rng = makeRNG(99);
    for (let i = 0; i < 100; i++) {
      expect(rollTrigger('PLAYER_ACTION', rng)).toBe(true);
    }
  });

  it('empirical EVENT rate is ~30%', () => {
    const rng = makeRNG(0);
    let hits = 0;
    for (let i = 0; i < TRIALS; i++) if (rollTrigger('EVENT', rng)) hits++;
    expect(hits / TRIALS).toBeCloseTo(0.30, 1);
  });

  it('empirical COURT rate is ~20%', () => {
    const rng = makeRNG(1);
    let hits = 0;
    for (let i = 0; i < TRIALS; i++) if (rollTrigger('COURT', rng)) hits++;
    expect(hits / TRIALS).toBeCloseTo(0.20, 1);
  });
});

describe('rollSize', () => {
  it('is reproducible for the same seed', () => {
    expect(rollSize(makeRNG(3))).toBe(rollSize(makeRNG(3)));
  });

  it('distribution is ~60% Small / 30% Medium / 10% Large', () => {
    const rng = makeRNG(2);
    const counts = { Small: 0, Medium: 0, Large: 0 };
    for (let i = 0; i < TRIALS; i++) counts[rollSize(rng)]++;
    expect(counts.Small  / TRIALS).toBeCloseTo(0.60, 1);
    expect(counts.Medium / TRIALS).toBeCloseTo(0.30, 1);
    expect(counts.Large  / TRIALS).toBeCloseTo(0.10, 1);
  });
});

describe('rollDirection', () => {
  it('only returns 1 or -1', () => {
    const rng = makeRNG(5);
    for (let i = 0; i < 200; i++) {
      const d = rollDirection(rng);
      expect(d === 1 || d === -1).toBe(true);
    }
  });

  it('empirical split is ~50/50', () => {
    const rng = makeRNG(4);
    let pos = 0;
    for (let i = 0; i < TRIALS; i++) if (rollDirection(rng) === 1) pos++;
    expect(pos / TRIALS).toBeCloseTo(0.50, 1);
  });
});
