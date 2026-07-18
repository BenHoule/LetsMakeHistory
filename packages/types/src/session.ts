// Session and Game State Typing
import type { Party, Region, StatDeltaRecord } from './stats.js';

export type TurnPhase =
  | 'LOBBY'
  | 'GENERATING'
  | 'VOTING'
  | 'PLAYER_ACTIONS'
  | 'FINALIZING'
  | 'TURN_COMPLETE'
  | 'ELECTION';

export type VoteOption  = 'YEA' | 'NAY';
export type ActionType  = 'LEGISLATION' | 'CAMPAIGN' | 'OTHER';

export interface NationalStatus {
  financial: string;
  social:    string;
  foreign:   string;
}

export interface HeadlineRecord {
  id:       string;
  outlet:   'AP' | 'AmericanStandard';
  headline: string;
  summary:  string;
}

export interface EventRecord {
  id:          string;
  sequence:    number;            // 1–3 for events, 1 for COURT
  sourceType:  'EVENT' | 'COURT';
  content:     string;
  statDeltaId: string | null;
}

/**
 * Live bill state tracked in SessionStore.bills.  Separate from TurnState so
 * that vote updates only touch this slice, not the entire turn record.
 */
export interface BillState {
  id:             string;
  proposingParty: Party;
  content:        string;
  isNpc:          boolean;
  voteResult:     'PENDING' | 'PASSED' | 'FAILED' | 'VETOED' | 'OVERRIDE_PASSED';
  statDelta:      StatDeltaRecord | null;
  /** This client's player's vote; null until they vote. */
  playerVote:     VoteOption | null;
}

export interface BillVoteSeatResult {
  id:         string;
  region:     Region;
  class:      1 | 2 | 3;
  party:      Party;
  playerName: string | null;
  isPlayer:   boolean;
  vote:       'YEA' | 'NAY' | 'ABSTAIN';
}

export interface PlayerState {
  id:          string;
  name:        string;
  region:      Region;
  party:       Party;
  class:       1 | 2 | 3;
  approval:    number;
  recognition: number;
  rizz:        number;
}

export interface SenatorRecord {
  id:         string;
  region:     Region;
  party:      Party;
  class:      1 | 2 | 3;
  isPlayer:   boolean;
  playerId:   string | null;
  playerName: string | null;
}

/**
 * Per-region snapshot for the Leaflet map panel.  Weighted approval is
 * Party Approval × Regional Modifier (Guide v2.1).
 */
export type RegionApprovalSnapshot = Partial<Record<Region, {
  leadingParty: Party;
  approvals:    Partial<Record<Party, number>>;
}>>;

/**
 * Immutable generated content for a single turn.
 * @remarks
 * Vote state lives in SessionStore.bills, not here, so
 * turn_generated events do not clobber in-progress votes.
 */
export interface TurnState {
  id:             string;
  turnIndex:      number;
  year:           number;
  headlines:      HeadlineRecord[];
  nationalStatus: NationalStatus;
  /** Three world events plus the Supreme Court decision (sourceType COURT). */
  events:         EventRecord[];
}

export interface SessionMeta {
  id:         string;
  name:       string;
  turnIndex:  number;
  year:       number;
  phase:      TurnPhase;
  /** Which Senate class is up for election this cycle (1 | 2 | 3). */
  classCycle: 1 | 2 | 3;
}

/** Top-level Svelte store shape — mirrors TDD §3.2. */
export interface SessionStore {
  session:     SessionMeta    | null;
  currentTurn: TurnState      | null;
  phase:       TurnPhase;
  players:     PlayerState[];
  bills:       BillState[];
  ledger:      StatDeltaRecord[];
  mapData:     RegionApprovalSnapshot;
  gmMode:      boolean;
}
