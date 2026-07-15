import { describe, it, expect } from 'vitest';
import { spectrumDistance, applyRizz, rollSeat, billPasses,
         vetoOverridePasses, amendmentPasses } from '../votes.js';
import { makeRNG } from '../rng.js';

const TRIALS = 10_000;

describe('spectrumDistance', () => {
  it('same party = 0', () => {
    expect(spectrumDistance('Progressive', 'Progressive')).toBe(0);
    expect(spectrumDistance('Conservative', 'Conservative')).toBe(0);
  });

  it('adjacent parties = 1', () => {
    expect(spectrumDistance('Progressive', 'Unionist')).toBe(1);
    expect(spectrumDistance('Unionist', 'Progressive')).toBe(1);
    expect(spectrumDistance('Whig', 'Conservative')).toBe(1);
  });

  it('two steps = 2', () => {
    expect(spectrumDistance('Progressive', 'Whig')).toBe(2);
    expect(spectrumDistance('Unionist', 'Conservative')).toBe(2);
  });

  it('opposite ends = 3', () => {
    expect(spectrumDistance('Progressive', 'Conservative')).toBe(3);
    expect(spectrumDistance('Conservative', 'Progressive')).toBe(3);
  });
});

describe('applyRizz', () => {
  it('bumps 0.10 → 0.30', () => expect(applyRizz(0.10)).toBe(0.30));
  it('bumps 0.30 → 0.50', () => expect(applyRizz(0.30)).toBe(0.50));
  it('bumps 0.50 → 0.70', () => expect(applyRizz(0.50)).toBe(0.70));
  it('bumps 0.70 → 0.90', () => expect(applyRizz(0.70)).toBe(0.90));
  it('caps at 0.90 (already max)', () => expect(applyRizz(0.90)).toBe(0.90));
});

describe('rollSeat', () => {
  it('is reproducible for the same seed', () => {
    const r1 = rollSeat('Whig', 'Whig', false, makeRNG(10));
    const r2 = rollSeat('Whig', 'Whig', false, makeRNG(10));
    expect(r1).toBe(r2);
  });

  it('distance-0 empirical YEA rate is ~90%', () => {
    const rng = makeRNG(20);
    let yeas = 0;
    for (let i = 0; i < TRIALS; i++)
      if (rollSeat('Whig', 'Whig', false, rng) === 'YEA') yeas++;
    expect(yeas / TRIALS).toBeCloseTo(0.90, 1);
  });

  it('distance-3 empirical YEA rate is ~10%', () => {
    const rng = makeRNG(21);
    let yeas = 0;
    for (let i = 0; i < TRIALS; i++)
      if (rollSeat('Progressive', 'Conservative', false, rng) === 'YEA') yeas++;
    expect(yeas / TRIALS).toBeCloseTo(0.10, 1);
  });

  it('Rizz bump raises distance-3 rate to ~30%', () => {
    const rng = makeRNG(22);
    let yeas = 0;
    for (let i = 0; i < TRIALS; i++)
      if (rollSeat('Progressive', 'Conservative', true, rng) === 'YEA') yeas++;
    expect(yeas / TRIALS).toBeCloseTo(0.30, 1);
  });
});

describe('billPasses', () => {
  it('passes when yeas > nays',  () => expect(billPasses(10, 8)).toBe(true));
  it('fails on exact tie',        () => expect(billPasses(9,  9)).toBe(false));
  it('fails when yeas < nays',   () => expect(billPasses(7, 11)).toBe(false));
});

describe('vetoOverridePasses', () => {
  it('fails at exactly 2/3 (strict >)', () => expect(vetoOverridePasses(12, 6)).toBe(false));
  it('passes just above 2/3',           () => expect(vetoOverridePasses(13, 6)).toBe(true));
  it('fails below 2/3',                 () => expect(vetoOverridePasses(10, 8)).toBe(false));
});

describe('amendmentPasses', () => {
  const fourQualify = [
    { yeas: 2, nays: 1 }, { yeas: 2, nays: 1 },
    { yeas: 2, nays: 1 }, { yeas: 2, nays: 1 },
    { yeas: 1, nays: 2 }, { yeas: 1, nays: 2 },
  ];
  const threeQualify = [
    { yeas: 2, nays: 1 }, { yeas: 2, nays: 1 }, { yeas: 2, nays: 1 },
    { yeas: 1, nays: 2 }, { yeas: 1, nays: 2 }, { yeas: 1, nays: 2 },
  ];

  it('passes with >75% overall and 4 qualifying regions', () => {
    expect(amendmentPasses(16, 2, fourQualify)).toBe(true);
  });

  it('fails at exactly 75% overall (strict >)', () => {
    // 3 yeas / 4 total = exactly 0.75 → fails
    expect(amendmentPasses(3, 1, fourQualify)).toBe(false);
  });

  it('fails with insufficient overall fraction', () => {
    expect(amendmentPasses(12, 6, fourQualify)).toBe(false);
  });

  it('fails with only 3 qualifying regions', () => {
    expect(amendmentPasses(16, 2, threeQualify)).toBe(false);
  });
});
