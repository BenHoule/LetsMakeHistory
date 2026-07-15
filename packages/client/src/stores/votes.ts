import { writable } from 'svelte/store';
import type { VoteOption } from '@lmh/types';

export interface LegislativeVoteItem {
  actionId:   string;
  playerName: string;
  party:      string;
  content:    string;
  myVote:     VoteOption | null;
  /** Live tally of player votes keyed by player name. */
  playerVotes: Record<string, VoteOption>;
}

export interface VoteResultItem {
  actionId:   string;
  playerName: string;
  content:    string;
  yeas:       number;
  nays:       number;
  abstains:   number;
  passed:     boolean;
  resolvedAt: string;
}

const { subscribe: subVotes, update: updVotes } = writable<LegislativeVoteItem[]>([]);
export const pendingActionVotes = { subscribe: subVotes };

const { subscribe: subResults, update: updResults } = writable<VoteResultItem[]>([]);
export const voteResults = { subscribe: subResults };

export function addActionVote(item: Omit<LegislativeVoteItem, 'myVote' | 'playerVotes'>) {
  updVotes(a => a.some(i => i.actionId === item.actionId) ? a : [...a, { ...item, myVote: null, playerVotes: {} }]);
}

export function recordMyActionVote(actionId: string, vote: VoteOption) {
  updVotes(a => a.map(i => i.actionId === actionId ? { ...i, myVote: vote } : i));
}

export function recordPlayerVote(actionId: string, playerName: string, vote: VoteOption) {
  updVotes(a => a.map(i =>
    i.actionId === actionId
      ? { ...i, playerVotes: { ...i.playerVotes, [playerName]: vote } }
      : i
  ));
}

export function removeActionVote(actionId: string) {
  updVotes(a => a.filter(i => i.actionId !== actionId));
}

export function addVoteResult(result: VoteResultItem) {
  updResults(r => [result, ...r.slice(0, 19)]);
}
