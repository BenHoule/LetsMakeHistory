import { describe, it, expect } from 'vitest';
import { resolveSenateClass, resolvePresidentialElection } from '../elections.js';
import type { Party } from '@lmh/types';

// Progressive WA=48, Unionist WA=35, Whig WA=24, Conservative WA=15
const baseRegion = [
  { party: 'Progressive'  as Party, partyApproval: 40, regionalModifier: 1.2 },
  { party: 'Unionist'     as Party, partyApproval: 35, regionalModifier: 1.0 },
  { party: 'Whig'         as Party, partyApproval: 30, regionalModifier: 0.8 },
  { party: 'Conservative' as Party, partyApproval: 25, regionalModifier: 0.6 },
];

describe('resolveSenateClass', () => {
  it('returns the highest weighted-approval party with no player', () => {
    expect(resolveSenateClass(baseRegion)).toBe('Progressive');
  });

  it('underdog player holds seat when buffer > gap', () => {
    // Leader Progressive WA=48, Unionist WA=35  →  gap = 13
    // approval=64  →  buffer = 5 + (64-50) = 19  >  13  →  holds
    expect(resolveSenateClass(baseRegion, { party: 'Unionist', approval: 64 }))
      .toBe('Unionist');
  });

  it('underdog player loses when buffer < gap', () => {
    // approval=50  →  buffer = 5 + 0 = 5  <  13  →  loses
    expect(resolveSenateClass(baseRegion, { party: 'Unionist', approval: 50 }))
      .toBe('Progressive');
  });

  it('underdog player loses when buffer = gap exactly (strict greater-than)', () => {
    // approval=58  →  buffer = 5 + 8 = 13 = gap  →  loses (not strictly greater)
    expect(resolveSenateClass(baseRegion, { party: 'Unionist', approval: 58 }))
      .toBe('Progressive');
  });

  it('does not apply exception when player is the leader', () => {
    // Player IS Progressive (the leader) — exception should not fire
    expect(resolveSenateClass(baseRegion, { party: 'Progressive', approval: 25 }))
      .toBe('Progressive');
  });
});

describe('resolvePresidentialElection', () => {
  function nominee(party: Party, approvals: number[]) {
    return {
      party,
      regions: approvals.map(a => ({ partyApproval: a, regionalModifier: 1 })),
    };
  }

  it('4-2 split: A wins with 4 electors', () => {
    const r = resolvePresidentialElection(
      nominee('Progressive',  [60, 60, 60, 60, 40, 40]),
      nominee('Conservative', [40, 40, 40, 40, 60, 60]),
    );
    expect(r.winner).toBe('Progressive');
    expect(r.electoralVote).toEqual([4, 2]);
    expect(r.isTieBreak).toBe(false);
  });

  it('2-4 split: B wins with 4 electors', () => {
    const r = resolvePresidentialElection(
      nominee('Whig',     [40, 40, 60, 60, 40, 40]),
      nominee('Unionist', [60, 60, 40, 40, 60, 60]),
    );
    expect(r.winner).toBe('Unionist');
    expect(r.electoralVote).toEqual([2, 4]);
    expect(r.isTieBreak).toBe(false);
  });

  it('3-3 tie: winner is the nominee with higher total weighted approval', () => {
    // A wins 3 regions with slim margins; B wins 3 with large margins
    // A sum = 60*3 + 10*3 = 210;  B sum = 10*3 + 80*3 = 270  →  B wins
    const r = resolvePresidentialElection(
      nominee('Progressive',  [60, 60, 60, 10, 10, 10]),
      nominee('Conservative', [10, 10, 10, 80, 80, 80]),
    );
    expect(r.electoralVote).toEqual([3, 3]);
    expect(r.isTieBreak).toBe(true);
    expect(r.winner).toBe('Conservative');
  });

  it('3-3 tie: A wins when A total > B total', () => {
    // A sum = 270;  B sum = 210  →  A wins
    const r = resolvePresidentialElection(
      nominee('Whig',     [80, 80, 80, 10, 10, 10]),
      nominee('Unionist', [10, 10, 10, 60, 60, 60]),
    );
    expect(r.winner).toBe('Whig');
    expect(r.isTieBreak).toBe(true);
  });
});
