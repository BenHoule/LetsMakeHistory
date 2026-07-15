import { writable } from 'svelte/store';
import type { ActionType, SizeCategory, StatName, VisibilitySettings } from '@lmh/types';

/** A player action card held in the GM queue pending review. */
export interface PlayerActionRecord {
  actionId:      string;   // server-assigned; used to accept/dismiss
  turnIndex:     number;
  year:          number;
  playerName:    string;
  party:         string;
  region:        string;
  type:          ActionType;
  content:       string;
  prompt:        string;
  receivedAt:    string;
  /** Fields the GM may edit before accepting. */
  editedType:    ActionType;
  editedContent: string;
}

/** A proposed stat roll awaiting GM confirmation. */
export interface StatRollRecord {
  actionId:      string;
  playerName:    string;
  actionContent: string;
  sizeCategory:  SizeCategory;
  directionHint: 1 | -1;
  /** GM fills these in before confirming: */
  stat:          StatName;
  target:        string;
  reason:        string;
}

// ── Pending action queue ──────────────────────────────────────────────────────
const { subscribe: subActions, update: updActions } = writable<PlayerActionRecord[]>([]);
export const pendingActions = { subscribe: subActions };

export function addPlayerAction(r: Omit<PlayerActionRecord, 'editedType' | 'editedContent'>) {
  updActions(a => [...a, { ...r, editedType: r.type, editedContent: r.content }]);
}
export function updateActionEdit(
  actionId: string, field: 'editedType' | 'editedContent', value: string
) {
  updActions(a => a.map(r =>
    r.actionId === actionId ? { ...r, [field]: value } : r
  ));
}
export function removeAction(actionId: string) {
  updActions(a => a.filter(r => r.actionId !== actionId));
}
export function clearPendingActions() { updActions(() => []); }

// ── Pending stat rolls (awaiting GM confirmation) ─────────────────────────────
const { subscribe: subRolls, update: updRolls } = writable<StatRollRecord[]>([]);
export const pendingStatRolls = { subscribe: subRolls };

export function addStatRoll(r: Omit<StatRollRecord, 'stat' | 'target' | 'reason'>) {
  updRolls(a => [...a, { ...r, stat: 'Approval', target: r.playerName, reason: '' }]);
}
export function updateStatRoll(
  actionId: string,
  patch: Partial<Pick<StatRollRecord, 'stat' | 'target' | 'reason' | 'sizeCategory' | 'directionHint'>>
) {
  updRolls(a => a.map(r => r.actionId === actionId ? { ...r, ...patch } : r));
}
export function removeStatRoll(actionId: string) {
  updRolls(a => a.filter(r => r.actionId !== actionId));
}

// ── Visibility settings ───────────────────────────────────────────────────────
const defaultVis: VisibilitySettings = { ownRolls: false, allRolls: false, npcVoteRolls: false };
const { subscribe: subVis, set: setVisStore } = writable<VisibilitySettings>(defaultVis);
export const visibilitySettings = { subscribe: subVis };
export function setVisibility(s: VisibilitySettings) { setVisStore(s); }

