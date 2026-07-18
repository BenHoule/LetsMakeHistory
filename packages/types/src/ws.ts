// WebSocket Interface Typing
import type { StatDeltaRecord, StatName, SizeCategory } from './stats.js';
import type {
  TurnPhase, TurnState, SessionStore, BillState, VoteOption, ActionType, BillVoteSeatResult,
} from './session.js';
import type { SenateElectionResult, PresidentialElectionResult } from './api.js';

// ---- Client -> Server payloads ----------------------------------------------

export interface JoinSessionPayload {
  sessionId: string;
  playerId:  string;
  gmToken?:  string;
}

export interface SubmitVotePayload {
  billId: string;
  vote:   VoteOption;
}

export interface SubmitActionPayload {
  type:    ActionType;
  content: string;
}

export interface GMAdvancePhasePayload { sessionId: string; }

export interface GMImportLedgerPayload {
  sessionId:   string;
  ledgerBlock: string;
}

export interface GMOverridePayload {
  sessionId: string;
  stat:      StatName;
  target:    string;
  delta:     number;
  reason:    string;
}

export interface GmSetNationalStatusPayload {
  sessionId: string;
  financial: string;
  social:    string;
  foreign:   string;
}

export interface GmAcceptActionPayload {
  sessionId: string;
  actionId:  string;
  /** GM may have edited these before accepting. */
  type:      ActionType;
  content:   string;
}

export interface GmDismissActionPayload {
  sessionId: string;
  actionId:  string;
}

export interface GmConfirmStatRollPayload {
  sessionId: string;
  actionId:  string;
  stat:      StatName;
  target:    string;
  delta:     number;
  reason:    string;
}

export interface GmSetVisibilityPayload {
  sessionId: string;
  settings:  VisibilitySettings;
}

export interface SubmitActionVotePayload {
  actionId: string;
  vote:     VoteOption;
}

export interface GmCloseActionVotePayload {
  sessionId:      string;
  actionId:       string;
  /** Per-party lean overrides keyed by party name (or '__president__').
   *  leanIdx = 0–4 from LEAN_CATS; rizzBoosted bumps one notch. */
  leanOverrides?: Record<string, { leanIdx: number; rizzBoosted: boolean }>;
}

// ---- Server -> Client event shapes ------------------------------------------

export interface PhaseChangedEvent {
  phase:     TurnPhase;
  turnIndex: number;
  /** Monotonically increasing per session; used for reconnect replay. */
  seqId:     number;
}

export interface TurnGeneratedEvent {
  turn:  TurnState;
  /** Initial BillState snapshot -- populates SessionStore.bills on receipt. */
  bills: BillState[];
  seqId: number;
}

export interface VoteRecordedEvent {
  billId:   string;
  playerId: string;
  vote:     VoteOption;
  seqId:    number;
}

export interface LedgerFinalizedEvent {
  ledger:     StatDeltaRecord[];
  /** New turn index after increment (used to update the client's session metadata). */
  turnIndex:  number;
  year:       number;
  seqId:      number;
}

export interface ElectionResultEvent {
  type:          'SENATE' | 'PRESIDENTIAL';
  senate?:       SenateElectionResult[];
  presidential?: PresidentialElectionResult;
  seqId:         number;
}

export interface WSErrorEvent {
  code:    number;
  message: string;
}

/** Emitted only to the GM room when a player submits an action.
 *  NOTE: the action is NOT yet logged to the DB -- that happens only on GM acceptance. */
export interface PlayerActionEvent {
  actionId:   string;   // server-assigned UUID; used to accept/dismiss
  turnIndex:  number;
  year:       number;
  playerName: string;
  party:      string;
  region:     string;
  type:       ActionType;
  content:    string;
  prompt:     string;
  seqId:      number;
}

/** Proposed stat roll -- emitted to GM room after accepting a non-legislative action
 *  (or after votes are closed for a legislative one). GM must confirm before it applies. */
export interface ActionStatRollEvent {
  actionId:     string;
  playerName:   string;
  actionContent: string;
  /** Rolled by the server; GM may override. */
  sizeCategory: SizeCategory;
  /** Rolled suggestion (+1 or -1); GM may override. */
  directionHint: 1 | -1;
  seqId:        number;
}

/** Emitted to the session room when a legislative action is accepted by the GM. */
export interface LegislativeVoteRequestedEvent {
  actionId:    string;
  playerName:  string;
  party:       string;
  content:     string;
  seqId:       number;
}

/** Emitted to the session room after GM closes voting for a legislative action. */
export interface ActionVoteResultEvent {
  actionId:        string;
  yeas:            number;
  nays:            number;
  abstains:        number;   // players who had not voted when GM closed the poll
  passed:          boolean;
  voteResult:      'PASSED' | 'FAILED' | 'VETOED' | 'OVERRIDE_PASSED';
  yeaShare:        number;
  senatePasses:    boolean;
  regionsOK:       boolean;
  regionsMajority: number;
  presidentSigns:  boolean | null;
  overridePassed:  boolean | null;
  isAmendment:     boolean;
  seatResults:     BillVoteSeatResult[];
  regionTally:     Record<string, { yea: number; nay: number; abstain: number }>;
  seqId:           number;
}

/** Current GM-controlled visibility settings for the session. */
export interface VisibilitySettings {
  /** Players can see their own stat roll results. */
  ownRolls:          boolean;
  /** Players can see ALL players' stat roll results. */
  allRolls:          boolean;
  /** Players can see NPC vote roll results. */
  npcVoteRolls:      boolean;
}

export interface VisibilityUpdatedEvent {
  settings: VisibilitySettings;
  seqId:    number;
}

export interface NationalStatusUpdatedEvent {
  financial: string;
  social:    string;
  foreign:   string;
  seqId:     number;
}

export interface PlayersUpdatedEvent {
  players: import('./session.js').PlayerState[];
  seqId:   number;
}

// ---- Socket.io typed interface maps -----------------------------------------
// Usage (server):  new Server<ClientToServerEvents, ServerToClientEvents>(...)
// Usage (client):  io<ServerToClientEvents, ClientToServerEvents>(WS_URL)

export interface ClientToServerEvents {
  join_session:            (payload: JoinSessionPayload)          => void;
  submit_vote:             (payload: SubmitVotePayload)           => void;
  submit_action:           (payload: SubmitActionPayload)         => void;
  submit_action_vote:      (payload: SubmitActionVotePayload)     => void;
  gm_advance_phase:        (payload: GMAdvancePhasePayload)       => void;
  gm_import_ledger:        (payload: GMImportLedgerPayload)       => void;
  gm_override:             (payload: GMOverridePayload)           => void;
  gm_set_national_status:  (payload: GmSetNationalStatusPayload)  => void;
  gm_accept_action:        (payload: GmAcceptActionPayload)       => void;
  gm_dismiss_action:       (payload: GmDismissActionPayload)      => void;
  gm_confirm_stat_roll:    (payload: GmConfirmStatRollPayload)    => void;
  gm_close_action_vote:    (payload: GmCloseActionVotePayload)    => void;
  gm_set_visibility:       (payload: GmSetVisibilityPayload)      => void;
}

export interface ServerToClientEvents {
  session_state:              (store: SessionStore)               => void;
  phase_changed:              (e: PhaseChangedEvent)              => void;
  turn_generated:             (e: TurnGeneratedEvent)             => void;
  vote_recorded:              (e: VoteRecordedEvent)              => void;
  stat_delta:                 (delta: StatDeltaRecord)            => void;
  ledger_finalized:           (e: LedgerFinalizedEvent)           => void;
  election_result:            (e: ElectionResultEvent)            => void;
  national_status_updated:    (e: NationalStatusUpdatedEvent)     => void;
  player_action_submitted:    (e: PlayerActionEvent)              => void;
  action_stat_roll:           (e: ActionStatRollEvent)            => void;
  legislative_vote_requested: (e: LegislativeVoteRequestedEvent)  => void;
  action_vote_result:         (e: ActionVoteResultEvent)          => void;
  visibility_updated:         (e: VisibilityUpdatedEvent)         => void;
  players_updated:            (e: PlayersUpdatedEvent)            => void;
  error:                      (e: WSErrorEvent)                   => void;
}
