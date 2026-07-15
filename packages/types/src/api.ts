// API Request and Response Typing
import type { Party, Region, StatName, StatDeltaRecord } from './stats.js';
import type {
  TurnPhase, SessionMeta, TurnState, BillState,
  PlayerState, SenatorRecord, VoteOption, ActionType,
} from './session.js';

// ---- POST /api/v1/sessions --------------------------------------------------
/** Request/Response for creating a session.
 * @remarks
 * A GM creates a new campaign by supplying a name.
 * The server responds with the session id (used in every subsequent URL) and a
 * gmToken (a secret UUID only the GM receives — all `/gm/` routes require it in
 * the `x-gm-token` header).
 */
export interface CreateSessionRequest  { name: string; }
export interface CreateSessionResponse { id: string; gmToken: string; }

// ---- POST /api/v1/sessions/:id/players --------------------------------------
/** Request for adding a new player to the session.
 * @remarks
 * A player joins by declaring their name, region, party, and Senate class. The
 * server finds the matching NPC seat in that region/class and removes it, then
 * returns the new playerId and the senatorId of the seat they now occupy.
 */
export interface AddPlayerRequest {
  name:   string;
  region: Region;
  party:  Party;
  class:  1 | 2 | 3;
}
export interface AddPlayerResponse { playerId: string; senatorId: string; }

// ---- GET /api/v1/sessions/:id -----------------------------------------------
/** Response for fetching the current session state.
 * @remarks
 * This is what the frontend loads on page visit or reconnect -- it contains the
 * session metadata, all player stats, and the complete 18-seat Senate roster.
 * The players array drives the `StatSidebar`;
 * the senators array drives the `SenateSeatGrid` on the lobby page.
 */
export interface SessionStateResponse {
  session:  SessionMeta;
  players:  PlayerState[];
  senators: SenatorRecord[];
  phase:    TurnPhase;
}

// ---- GET /api/v1/sessions/:id/turns/current ---------------------------------
/** Response for fetching the current turn state.
 * @remarks
 * An alias for TurnState (the immutable generated content: headlines, events,
 * national status). The frontend subscribes to turn_generated WebSocket events
 * for live updates, but this REST endpoint lets a reconnecting client catch up
 * without replaying all socket events.
 */
export type TurnStateResponse = TurnState;

// ---- POST /api/v1/sessions/:id/turns/advance (GM only) ----------------------
/** Response for advancing the turn phase.
 * @remarks
 * The GM POSTs to turns/advance to step the phase machine forward
 * (e.g. from `VOTING` to `PLAYER_ACTIONS`).
 * The response just confirms the new phase so the GM's UI can update the phase
 * badge immediately without waiting for the broadcast.
 */
export interface AdvancePhaseResponse { phase: TurnPhase; }

// ---- POST /api/v1/sessions/:id/bills/:billId/votes --------------------------
/** Request for submitting a vote on a bill.
 * @remarks
 * A player casts their vote on a specific bill. The billId is in the URL;
 * the body just carries vote: "YEA" | "NAY".
 * The boolean recorded confirms the vote was accepted.
 * Rejection occurs when the vote is invalid, e.g. the session is not in the
 * `VOTING` phase.
 */
export interface SubmitVoteRequest  { vote: VoteOption; }
export interface SubmitVoteResponse { recorded: boolean; }

// ---- POST /api/v1/sessions/:id/actions --------------------------------------
/** Request for submitting a player action.
 * @remarks
 * A player takes their turn -- either proposing legislation or campaigning.
 * The `type` field tells the server which Rules Engine path to follow;
 * `content` is the free-text description the GM and Claude receive.
 * The server returns an `actionId` so the client can correlate the subsequent
 * `stat_delta` WebSocket event back to this action.
 */
export interface SubmitActionRequest  { type: ActionType; content: string; }
export interface SubmitActionResponse { actionId: string; }

// ---- GET /api/v1/sessions/:id/ledger ----------------------------------------
/** Response for fetching the current ledger.
 * @remarks
 * An array of `StatDeltaRecord` -- the full stat history for a session. Used by
 * the GM's audit view and potentially by a player's personal history panel.
 */
export type LedgerResponse   = StatDeltaRecord[];

// ---- GET /api/v1/sessions/:id/senators --------------------------------------
/** Response for fetching the list of senators in the current session.
 * @remarks
 * The live Senate roster. The server rebuilds this from the senators table
 * after each election, so it reflects mid-game seat changes
 * (e.g. a player winning the Presidency vacates their seat).
 */
export type SenatorsResponse = SenatorRecord[];

// ---- POST /api/v1/gm/sessions/:id/override ----------------------------------
/** Request for overriding a stat delta as the GM.
 * @remarks
 * The GM corrects a stat directly -- e.g. to fix a misapplied ledger row, or
 * to apply a ruling the rules don't cover.
 * The target is a player name, party name, or "Region:Party" string
 * (same format as the Turn Ledger).
 * The server clamps the new value within BOUNDS, writes a `stat_delta` tagged
 * `actor = "gm"`, and returns the resulting `StatDeltaRecord`.
 */
export interface GMOverrideRequest  {
  stat:   StatName;
  target: string;
  delta:  number;
  reason: string;
}
export interface GMOverrideResponse { delta: StatDeltaRecord; }

// ---- POST /api/v1/gm/sessions/:id/votes/roll --------------------------------
/** Request for rolling votes on a bill as the GM.
 * @remarks
 * The GM asks the server to roll per-seat NPC votes for a specific bill.
 * `proposingParty` drives the lean table; `rizzParties` is the list of parties
 * a player spent Rizz on (bumps their lean one notch toward for).
 * The response is a `Record<seatId, "YEA"|"NAY">` -- the GM reviews it before
 * committing, so nothing is persisted by this call.
 */
export interface RollVotesRequest {
  billId:         string;
  proposingParty: Party;
  rizzParties?:   Party[];
}
export type RollVotesResponse = Record<string, VoteOption>;

// ---- POST /api/v1/gm/sessions/:id/ledger/import -----------------------------
/** Request for importing a ledger block as the GM.
 * @remarks
 * The GM pastes the raw fenced Turn Ledger block that Claude outputs.
 * The server runs it through `parseLedger()`, validates every row,
 * batch-inserts into `stat_deltas`, and returns the parsed `StatDeltaRecord[]`
 * so the GM's UI can confirm what was applied.
 */
export interface ImportLedgerRequest  { ledgerBlock: string; }
export interface ImportLedgerResponse { deltas: StatDeltaRecord[]; }

// ---- GET /api/v1/gm/sessions/:id/audit (paginated) --------------------------
/** Response for fetching the audit log for the current session (paginated).
 * @remarks
 * Paginated read of the game_log table. Every server-side mutation
 * (roll, vote, override, election) is appended there. actor distinguishes
 * player actions (playerId), GM corrections ("gm"), and automated system
 * events ("system"). payload is unknown because different event types carry
 * structurally different JSON blobs.
 */
export interface AuditLogEntry {
  id:         number;
  occurredAt: string;
  /** Player id | "gm" | "system" */
  actor:      string;
  eventType:  string;
  payload:    unknown;
}
export interface AuditLogResponse {
  entries: AuditLogEntry[];
  total:   number;
  page:    number;
}

// ---- POST /api/v1/gm/sessions/:id/elections/run -----------------------------

/** One record per region for the Senate class that cycled this year.
 * `isUnderdogHold` is true when the player's Buffer calculation beat the gap
 * and they kept their seat against the leading party -- useful for the GM
 * dashboard's election summary.
 */
export interface SenateElectionResult {
  region:         Region;
  class:          1 | 2 | 3;
  winningParty:   Party;
  isUnderdogHold: boolean;
}

/** The winner party, the 6-elector breakdown, and whether it required the
 * tie-break (summed weighted regional approvals across all six regions).
 */
export interface PresidentialElectionResult {
  winner:        Party;
  electoralVote: [number, number];  // [nomineeA electors, nomineeB electors]
  isTieBreak:    boolean;
}

/** Response for running elections in the current session.
 * @remarks
 * Includes the results for both the Senate and Presidential elections.
 */
export interface RunElectionsResponse {
  senate:       SenateElectionResult[];
  presidential: PresidentialElectionResult | null;
}
