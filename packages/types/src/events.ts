// Event and World Snapshot Typing
import type { StatName } from './stats.js';

/** Every source that can generate a stat adjustment -- TDD §5.2. */
export type SourceType = 'EVENT' | 'COURT' | 'NPC_BILL' | 'PLAYER_ACTION';

/**
 * Serialised record sent to the News Service for headline generation.
 * Never carries raw session state -- only the fields the LLM needs.
 * TDD §6.1.
 */
export interface GameEvent {
  id:          string;
  turnId:      string;
  sourceType:  SourceType;
  /** 1-3 for events; 1 for court decisions, bills, and player actions. */
  sequence:    number;
  /** Player name for PLAYER_ACTION; null for world events. */
  actor:       string | null;
  /** One-sentence deterministic description (built server-side, not by LLM). */
  description: string;
  location:    string | null;
  /** Non-null only when a stat adjustment was triggered for this event. */
  statDelta: {
    stat:   StatName;
    target: string;
    delta:  number;
  } | null;
}

/**
 * Compact context snapshot sent alongside every headline prompt.
 * Built from the rolling event cache -- never the full raw session state.
 * TDD §6.2.
 */
export interface WorldSnapshot {
  turnIndex:    number;
  year:         number;
  financial:    string;
  social:       string;
  foreign:      string;
  /** Last <=3 one-sentence event summaries (rolling cache). */
  recentEvents: string[];
}
