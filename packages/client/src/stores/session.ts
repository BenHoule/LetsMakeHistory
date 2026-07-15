import { writable, derived } from 'svelte/store';
import type {
  SessionStore,
  TurnState,
  BillState,
  PlayerState,
  StatDeltaRecord,
  SessionMeta,
  RegionApprovalSnapshot,
  VoteOption,
  TurnPhase
} from '@lmh/types';

const INITIAL: SessionStore = {
  session: null,
  currentTurn: null,
  phase: 'LOBBY',
  players: [],
  bills: [],
  ledger: [],
  mapData: {},
  gmMode: false,
};

const { subscribe, update } = writable<SessionStore>(INITIAL);

export const sessionStore = { subscribe };
export const phase = derived(sessionStore, s => s.phase);
export const bills = derived(sessionStore, s => s.bills);
export const players = derived(sessionStore, s => s.players);
export const currentPlayerId = derived(sessionStore, s =>
  // Treat s as a SessionStore that might also have an optional _playerId field
  (s as SessionStore & { _playerId?: string})._playerId ?? null);

/**
 * Sets the session metadata for the store.
 * @param session The new session metadata to set.
 */
export function setSession(session: SessionMeta) {
  update(s => ({ ...s, session, phase: session.phase }));
}

/**
 * Sets the current phase of the session.
 * @param p The new phase to set for the session.
 */
export function setPhase(p: TurnPhase) {
  update(s => ({ ...s, phase: p }));
}

/**
 * Sets the current turn and associated bills for the session.
 * @param turn The new turn state to set.
 * @param bills The list of bills associated with the new turn.
 */
export function setTurn(turn: TurnState, bills: BillState[]) {
  update(s => ({ ...s, currentTurn: turn, bills, phase: 'VOTING' }));
}

export function setCurrentTurnOnly(turn: TurnState) {
  update(s => ({ ...s, currentTurn: turn }));
}

/**
 * Appends a new delta record to the session ledger.
 * @param delta The delta record to append.
 */
export function appendDelta(delta: StatDeltaRecord) {
  update(s => ({ ...s, ledger: [...s.ledger, delta] }));
}

/**
 * Sets the entire session ledger to the provided list of delta records.
 * @param ledger The new list of delta records to set for the session.
 */
export function setLedger(ledger: StatDeltaRecord[], turnIndex?: number, year?: number) {
  update(s => ({
    ...s,
    ledger,
    // Update session metadata with the new turn counter if provided.
    ...(s.session && turnIndex !== undefined
      ? { session: { ...s.session, turnIndex, year: year ?? s.session.year } }
      : {}),
  }));
}

/**
 * Sets the GM mode for the session.
 * @param gmMode The new GM mode to set for the session.
 */
export function setGMMode(gmMode: boolean) {
  update(s => ({ ...s, gmMode }));
}

/**
 * Sets the player ID for the current session.
 * @param id The player ID to set.
 */
export function setPlayerId(id: string) {
  update(s => ({ ...(s as any), _playerId: id }));
}

export function setPlayers(p: PlayerState[]) {
  update(s => ({ ...s, players: p }));
}

export function updatePlayerStat(
  playerName: string,
  stat: 'Approval' | 'Recognition' | 'Rizz',
  delta: number,
) {
  const col = stat.toLowerCase() as 'approval' | 'recognition' | 'rizz';
  update(s => ({
    ...s,
    players: s.players.map(p =>
      p.name === playerName ? { ...p, [col]: (p[col] as number) + delta } : p
    ),
  }));
}

export function setMapData(mapData: RegionApprovalSnapshot) {
  update(s => ({ ...s, mapData }));
}

export function setNationalStatus(financial: string, social: string, foreign: string) {
  update(s => {
    if (!s.currentTurn) return s;
    return { ...s, currentTurn: { ...s.currentTurn, nationalStatus: { financial, social, foreign } } };
  });
}

export function recordBillVote(billId: string, vote: VoteOption) {
  update(s => ({
    ...s,
    bills: s.bills.map(b => b.id === billId ? { ...b, playerVote: vote } : b),
  }));
}
