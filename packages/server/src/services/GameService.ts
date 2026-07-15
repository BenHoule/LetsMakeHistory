import { randomBytes, randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { Server as IOServer } from 'socket.io';
import type {
  ClientToServerEvents, ServerToClientEvents, TurnPhase, TurnState,
  HeadlineRecord, EventRecord, NationalStatus, ActionType, VisibilitySettings,
} from '@lmh/types';
import { makeRNG, rollTrigger, rollSize, rollDirection, rollSeat, spectrumDistance } from '@lmh/rules';
import { makeQueries } from '../db/queries.js';

const PHASE_ORDER: TurnPhase[] = [
  'LOBBY', 'GENERATING', 'VOTING', 'PLAYER_ACTIONS',
  'FINALIZING', 'TURN_COMPLETE',
];

/**
 * Computes the next phase in the game given the current phase.
 * @param currentPhase The current phase of the game.
 * @returns The next phase of the game.
 */
function computeNextPhase(currentPhase: TurnPhase): TurnPhase {
  // Elections are implemented in M4; loop back to LOBBY for now.
  if (currentPhase === 'TURN_COMPLETE' || currentPhase === 'ELECTION') {
    return 'LOBBY';
  }
  const idx = PHASE_ORDER.indexOf(currentPhase);
  return PHASE_ORDER[(idx + 1) % PHASE_ORDER.length];
}

const seqCounters     = new Map<string, number>();
const nationalStatuses = new Map<string, NationalStatus>();
const visibilityMap    = new Map<string, VisibilitySettings>();

// In-memory stores for the action pipeline (no DB until GM accepts)
interface PendingAction {
  actionId: string; sessionId: string;
  playerName: string; party: string; region: string;
  type: ActionType; content: string; prompt: string;
  turnIndex: number; year: number;
}
interface PendingVote {
  action: PendingAction;
  playerVotes: Map<string, 'YEA' | 'NAY'>;
}
interface PendingStatRoll {
  action: PendingAction;
  sizeCategory: import('@lmh/types').SizeCategory;
  directionHint: 1 | -1;
}
const pendingActionsMap   = new Map<string, PendingAction>();
const pendingVotesMap     = new Map<string, PendingVote>();
const pendingStatRollsMap = new Map<string, PendingStatRoll>();

/**
 * Gets the next sequence number for the specified session.
 * @param sessionId The ID of the session.
 * @returns The next sequence number for the session.
 */
function nextSeq(sessionId: string): number {
  const n = (seqCounters.get(sessionId) ?? 0) + 1;
  seqCounters.set(sessionId, n);
  return n;
}

/**
 * Creates the game service.
 * @param db The database connection object.
 * @param io The Socket.IO server instance.
 */
export function makeGameService(
  db: Database.Database,
  io: IOServer<ClientToServerEvents, ServerToClientEvents>
) {
  const queries = makeQueries(db);

  function advancePhase(sessionId: string): TurnPhase {
    const session = queries.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Auto-close any pending legislative votes before advancing so players
    // are never left stuck with the "waiting for GM" message.
    for (const [actionId, pending] of pendingVotesMap.entries()) {
      if (pending.action.sessionId === sessionId) {
        closeActionVote(sessionId, actionId);
      }
    }

    const next = computeNextPhase(session.phase);

    // Gate: cannot advance past TURN_COMPLETE unless event/SC/NPC-bill content is queued.
    if (session.phase === 'TURN_COMPLETE' && !queries.isTurnContentReady(sessionId)) {
      throw new Error('Cannot advance: queue 3 events, 1 Supreme Court decision, 3 NPC bills, and 2 headlines (AP + American Standard) on the Dashboard first.');
    }

    queries.setPhase(sessionId, next);

    io.to(`session:${sessionId}`).emit('phase_changed', {
      phase: next,
      turnIndex: session.turn_index,
      seqId: nextSeq(sessionId),
    });

    // Side effects when entering a phase:
    if (next === 'GENERATING') {
      generateTurn(sessionId);
      // GENERATING is transient -- immediately advance to VOTING so the GM
      // only needs one click from LOBBY.
      return advancePhase(sessionId);
    }
    if (next === 'TURN_COMPLETE') finalizeLedger(sessionId);

    return next;
  }

  /**
   * Generates a new turn for the specified session.
   * @param sessionId The ID of the session to generate the turn for.
   */
  function generateTurn(sessionId: string): void {
    const session = queries.getSession(sessionId)!;

    // Seed stored in DB so any turn can be replayed exactly from it.
    const seed = randomBytes(4).readUInt32BE();
    const rng = makeRNG(seed);
    const turnId = queries.insertTurn(sessionId, session.turn_index, session.year, seed);

    // Always consume trigger + size + direction for every source, evven when
    // the trigger fails, so the RNG sequence stays stable for audit replay
    type Src = { seq: number; type: 'EVENT' | 'COURT'}
    const sources: Src[] = [
      { seq: 1, type: 'EVENT' },
      { seq: 2, type: 'EVENT' },
      { seq: 3, type: 'EVENT' },
      { seq: 1, type: 'COURT' },
    ];

    const events: EventRecord[] = [];
    // Use GM-queued narrative content; fall back to stubs if somehow missing.
    const queued = queries.getTurnContent(sessionId);
    const queuedEvents  = queued.filter(q => q.type === 'EVENT');
    const queuedCourt   = queued.find(q => q.type === 'COURT');
    const queuedNpcBills = queued.filter(q => q.type === 'NPC_BILL');
    const queuedApHl    = queued.find(q => q.type === 'AP_HEADLINE');
    const queuedAmStHl  = queued.find(q => q.type === 'AMST_HEADLINE');

    // Build event/court records and execute triggered stat rolls
    for (const src of sources) {
      // Always consume RNG tokens in fixed order regardless of trigger result
      const triggerRoll = rng();
      const sizeRaw     = rng();
      const dirRaw      = rng();

      let qItem: typeof queuedEvents[number] | typeof queuedCourt | undefined;
      let content: string;
      if (src.type === 'COURT') {
        qItem = queuedCourt;
        content = qItem?.content ?? `[COURT decision — narrative TBD]`;
      } else {
        qItem = queuedEvents[src.seq - 1];
        content = qItem?.content ?? `[EVENT ${src.seq} — narrative TBD]`;
      }

      const eventId = queries.insertEvent(turnId, src.seq, src.type, content);
      events.push({ id: eventId, sequence: src.seq, sourceType: src.type, content, statDeltaId: null });

      // Resolve trigger probability (GM override or rule default)
      const triggerProb = qItem?.trigger_weight ?? (src.type === 'COURT' ? 0.20 : 0.30);
      const triggered = triggerRoll < triggerProb;

      if (triggered && qItem) {
        // Direction: GM bias or roll
        const dir: 1|-1 = (qItem.direction_bias != null)
          ? (dirRaw < qItem.direction_bias ? 1 : -1)   // GM-set positive probability
          : (dirRaw < 0.5 ? 1 : -1);                   // default 50/50
        // Compute size from sizeRaw
        const sizeCat = sizeRaw < 0.60 ? 'Small' : sizeRaw < 0.90 ? 'Medium' : 'Large';

        // Emit pending stat roll to GM (who confirms stat/target/delta)
        const pendingRoll = {
          actionId:      eventId,
          playerName:    `[${src.type} ${src.seq}]`,
          actionContent: content,
          sizeCategory:  sizeCat as import('@lmh/types').SizeCategory,
          directionHint: dir,
          statHint:      qItem.stat_hint ?? undefined,
          targetHint:    qItem.target_hint ?? undefined,
          sourceType:    src.type,
        };
        pendingStatRollsMap.set(eventId, {
          action: {
            actionId: eventId, sessionId,
            playerName: `[${src.type} ${src.seq}]`,
            party: '', region: '', type: 'OTHER',
            content, prompt: '', turnIndex: session.turn_index, year: session.year,
          },
          sizeCategory: sizeCat as import('@lmh/types').SizeCategory,
          directionHint: dir,
        });
        io.to(`session:${sessionId}:gm`).emit('action_stat_roll', pendingRoll as any);
      }
    }

    // Queue NPC bills from turn_content, passing the current turnId
    for (const nb of queuedNpcBills) {
      queries.queueBill(sessionId, {
        title: nb.title || nb.content,
        content: nb.content,
        proposingParty: nb.party ?? 'Progressive',
        isAmendment: false,
        turnId: turnId,
        triggerWeight:  nb.trigger_weight  ?? undefined,
        directionBias:  nb.direction_bias  ?? undefined,
        statHint:       nb.stat_hint       ?? undefined,
        targetHint:     nb.target_hint     ?? undefined,
      });
    }

    // Notify all clients (especially the GM) to refresh the bill queue
    if (queuedNpcBills.length > 0) {
      (io.to(`session:${sessionId}`) as any).emit('bill_queue_updated', { sessionId });
    }

    // Clear used content
    queries.clearTurnContent(sessionId);

    // Headlines from queue or stubs
    const headlines: HeadlineRecord[] = [
      {
        id: randomUUID(), outlet: 'AP',
        headline: queuedApHl?.content ?? '[AP headline TBD]',
        summary: '',
      },
      {
        id: randomUUID(), outlet: 'AmericanStandard',
        headline: queuedAmStHl?.content ?? '[AmStd headline TBD]',
        summary: '',
      },
    ];
    const nationalStatus: NationalStatus = nationalStatuses.get(sessionId) ?? {
      financial: '[Financial TBD]',
      social:    '[Social TBD]',
      foreign:   '[Foreign TBD]',
    };

    const turn: TurnState = {
      id: turnId, turnIndex: session.turn_index, year: session.year,
      headlines, nationalStatus, events,
    };

    io.to(`session:${sessionId}`).emit('turn_generated', {
      turn, bills: [], seqId: nextSeq(sessionId),
    });
  }

  /**
   * Finalizes the ledger for the specified session.
   * @param sessionId The ID of the session to finalize the ledger for.
   */
  function finalizeLedger(sessionId: string): void {
    const turn = queries.getCurrentTurn(sessionId);
    const ledger = turn ? queries.getStatDeltasForTurn(turn.id) : [];
    const newTurnIndex = queries.incrementTurnIndex(sessionId);
    const newYear = 1901 + Math.floor(newTurnIndex / 2);
    // Clear national status for next turn
    nationalStatuses.delete(sessionId);
    io.to(`session:${sessionId}`).emit('ledger_finalized', {
      ledger, turnIndex: newTurnIndex, year: newYear, seqId: nextSeq(sessionId),
    });
  }

  function setNationalStatus(
    sessionId: string, financial: string, social: string, foreign: string
  ): void {
    const status: NationalStatus = { financial, social, foreign };
    nationalStatuses.set(sessionId, status);
    queries.persistNationalStatus(sessionId, financial, social, foreign);
    io.to(`session:${sessionId}`).emit('national_status_updated', {
      ...status, seqId: nextSeq(sessionId),
    });
  }

  /** Receives a player action — stores it in memory and notifies the GM.
   *  Nothing is written to the DB until the GM accepts. */
  function submitAction(
    sessionId: string,
    playerName: string, party: string, region: string,
    type: ActionType, content: string
  ): void {
    const session = queries.getSession(sessionId)!;
    const status  = nationalStatuses.get(sessionId) ?? {
      financial: 'unknown', social: 'unknown', foreign: 'unknown',
    };
    const actionId = randomUUID();
    const prompt = [
      `You are assisting a GM running "Let's Make History" (1901 alternate-history political game).`,
      ``,
      `TURN ${session.turn_index + 1} (Year ${session.year}) \u2014 PLAYER ACTION`,
      ``,
      `Player:      ${playerName}`,
      `Party:       ${party}`,
      `Region:      ${region}`,
      `Action Type: ${type}`,
      `Description: ${content}`,
      ``,
      `NATIONAL CONTEXT`,
      `Financial: ${status.financial}`,
      `Social:    ${status.social}`,
      `Foreign:   ${status.foreign}`,
      ``,
      `RULES REMINDER`,
      `\u2022 Player actions always trigger exactly one stat change.`,
      `\u2022 Choose the most affected stat: Approval, Recognition, Party, or Regional Party Modifier.`,
      `\u2022 Direction: positive only if clearly justified by the narrative, otherwise negative.`,
      `\u2022 Rizz is gain-only.`,
      `\u2022 Size: Small 60% / Medium 30% / Large 10%.`,
      ``,
      `OUTPUT \u2014 Turn Ledger row:`,
      `<Stat> | <Target> | <signed delta> | <one-line reason>`,
    ].join('\n');

    const pending: PendingAction = {
      actionId, sessionId, playerName, party, region,
      type, content, prompt,
      turnIndex: session.turn_index, year: session.year,
    };
    pendingActionsMap.set(actionId, pending);

    io.to(`session:${sessionId}:gm`).emit('player_action_submitted', {
      actionId, turnIndex: session.turn_index, year: session.year,
      playerName, party, region, type, content, prompt,
      seqId: nextSeq(sessionId),
    });
  }

  /** GM starts a vote on a queued bill (player-submitted or NPC). */
  function startBillVote(sessionId: string, billId: string): void {
    const bill = queries.getQueuedBills(sessionId).find((b: any) => b.id === billId);
    if (!bill) return;
    const actionId = billId; // reuse billId as the vote key
    const fakeAction: PendingAction = {
      actionId:  billId,
      sessionId,
      playerName: bill.player_name ?? `${bill.proposing_party} (NPC)`,
      party:      bill.proposing_party,
      region:     'National',
      type:       'LEGISLATION',
      content:    bill.title || bill.content,
      prompt:     '',
      turnIndex:  0,
      year:       0,
    };
    pendingVotesMap.set(actionId, { action: fakeAction, playerVotes: new Map() });
    const voteEvent = {
      actionId,
      playerName: fakeAction.playerName,
      party:      fakeAction.party,
      content:    fakeAction.content,
      seqId:      nextSeq(sessionId),
    };
    io.to(`session:${sessionId}`).emit('legislative_vote_requested', voteEvent);
    io.to(`session:${sessionId}:gm`).emit('legislative_vote_requested', voteEvent);
  }

  /** GM accepts an action (possibly with edits).
   *  Logs it to the DB, then either triggers a player vote (legislation)
   *  or immediately rolls for a stat change (other types). */
  function acceptAction(
    sessionId: string, actionId: string,
    editedType: ActionType, editedContent: string,
  ): void {
    const pending = pendingActionsMap.get(actionId);
    if (!pending) return;
    pendingActionsMap.delete(actionId);

    // Log the accepted (possibly edited) action to the DB.
    const turnId = queries.getCurrentTurn(sessionId)?.id ?? null;
    queries.insertGameLog(sessionId, turnId, pending.playerName, 'PLAYER_ACTION', {
      playerName: pending.playerName, party: pending.party, region: pending.region,
      type: editedType, content: editedContent, prompt: pending.prompt,
      turnIndex: pending.turnIndex, year: pending.year,
    });

    const accepted = { ...pending, type: editedType, content: editedContent };

    if (editedType === 'LEGISLATION') {
      // Queue the bill; the GM will start the vote from the Bills tab.
      // Resolve the player's DB id from their name so the bill queue retains it
      const playerRow = (queries.listPlayers(sessionId) as any[]).find(p => p.name === pending.playerName);
      const billId = queries.queueBill(pending.sessionId, {
        title:          editedContent,
        content:        editedContent,
        proposingParty: pending.party,
        isAmendment:    false,
        sourcePlayerId: playerRow?.id ?? undefined,
      });
      io.to(`session:${sessionId}`).emit('bill_queued' as any, {
        billId, playerName: pending.playerName, party: pending.party, content: editedContent,
      });
      io.to(`session:${sessionId}:gm`).emit('bill_queued' as any, {
        billId, playerName: pending.playerName, party: pending.party, content: editedContent,
      });
    } else {
      // Non-legislative: immediately roll stat size + direction for GM review.
      _rollAndQueueStat(sessionId, accepted);
    }
  }

  /** Called internally to generate a stat roll proposal and emit it to the GM. */
  function _rollAndQueueStat(sessionId: string, action: PendingAction): void {
    const seed = randomBytes(4).readUInt32BE();
    const rng  = makeRNG(seed);
    // Player actions always trigger, so we skip the trigger roll.
    const size = rollSize(rng);
    const dir  = rollDirection(rng);
    const roll: PendingStatRoll = { action, sizeCategory: size, directionHint: dir };
    pendingStatRollsMap.set(action.actionId, roll);
    io.to(`session:${sessionId}:gm`).emit('action_stat_roll', {
      actionId:      action.actionId,
      playerName:    action.playerName,
      actionContent: action.content,
      sizeCategory:  size,
      directionHint: dir,
      seqId:         nextSeq(sessionId),
    });
    // Tell GM room how many votes are still open for the turn counter badge
    io.to(`session:${sessionId}:gm`).emit('pending_votes_count' as any, {
      count: [...pendingVotesMap.values()].filter(v => v.action.sessionId === sessionId).length,
    });
  }

  /** Player casts a vote on a pending legislative action. */
  function recordActionVote(sessionId: string, actionId: string, playerId: string, vote: 'YEA' | 'NAY'): void {
    const pending = pendingVotesMap.get(actionId);
    if (!pending) return;
    pending.playerVotes.set(playerId, vote);

    // Look up the player's display name from the DB for the broadcast.
    const playerRow = queries.listPlayers(sessionId)
      .find((p: any) => p.id === playerId) as any;
    const playerName = playerRow?.name ?? playerId;

    // Broadcast vote to ALL session clients so everyone can see who voted what.
    (io.to(`session:${sessionId}`) as any).emit('player_action_voted', {
      actionId, playerName, vote,
    });

    // Notify GM of current vote tally so they can see progress in real time
    // and know when all players have voted.
    const totalPlayers = queries.listPlayers(sessionId).length;
    const votedCount   = pending.playerVotes.size;
    const tally: Record<string,'YEA'|'NAY'> = {};
    pending.playerVotes.forEach((v, pid) => { tally[pid] = v; });
    (io.to(`session:${sessionId}:gm`) as any).emit('action_vote_progress', {
      actionId, votedCount, totalPlayers, allVoted: votedCount >= totalPlayers, tally,
    });
  }

  /** GM closes voting: rolls NPC votes, emits result, then queues the stat roll. */
  function closeActionVote(
    sessionId: string,
    actionId: string,
    leanOverrides?: Record<string, { leanIdx: number; rizzBoosted: boolean }>,
  ): void {
    const pending = pendingVotesMap.get(actionId);
    if (!pending) return;
    pendingVotesMap.delete(actionId);

    // Count player votes; abstentions excluded from denominator per rules.
    let yeas = 0, nays = 0;
    for (const v of pending.playerVotes.values()) {
      if (v === 'YEA') yeas++; else nays++;
    }
    const totalPlayers = queries.listPlayers(sessionId).length;
    const abstains = Math.max(0, totalPlayers - pending.playerVotes.size);

    const LEAN_PROBS = [0.10, 0.30, 0.50, 0.70, 0.90];

    // Roll NPC senator votes using lean overrides (if provided) or default rollSeat
    const seats = queries.getNpcSenators(sessionId);
    const rng = makeRNG(randomBytes(4).readUInt32BE());
    for (const seat of seats) {
      let result: 'YEA' | 'NAY';
      const ov = leanOverrides?.[seat.party];
      if (ov !== undefined) {
        const boostedIdx = ov.rizzBoosted ? Math.min(4, ov.leanIdx + 1) : ov.leanIdx;
        result = rng() < LEAN_PROBS[boostedIdx] ? 'YEA' : 'NAY';
      } else {
        result = rollSeat(
          seat.party as import('@lmh/types').Party,
          pending.action.party as import('@lmh/types').Party,
          false, rng,
        );
      }
      if (result === 'YEA') yeas++; else nays++;
    }

    const passed = yeas > nays;
    // Mark bill voted if it came from the queue; also queue a post-vote stat roll for NPC bills
    try {
      queries.markBillVoted(actionId, passed ? 'PASSED' : 'FAILED', { yea: yeas, nay: nays, abstain: abstains });
      const bill = queries.getBill(actionId);
      if (bill && bill.is_npc) {
        // Roll trigger for NPC bill post-vote stat change
        const rng = makeRNG(randomBytes(4).readUInt32BE());
        const triggerProb = bill.trigger_weight ?? 0.30;
        if (rng() < triggerProb) {
          const sizeRaw = rng();
          const dirRaw  = rng();
          const sizeCat = sizeRaw < 0.60 ? 'Small' : sizeRaw < 0.90 ? 'Medium' : 'Large';
          const dir: 1|-1 = (bill.direction_bias != null)
            ? (dirRaw < bill.direction_bias ? 1 : -1)
            : (dirRaw < 0.5 ? 1 : -1);
          pendingStatRollsMap.set(actionId + '_bill', {
            action: {
              actionId: actionId + '_bill', sessionId,
              playerName: `[NPC Bill: ${bill.title || bill.content}]`,
              party: bill.proposing_party, region: '', type: 'LEGISLATION',
              content: bill.title || bill.content, prompt: '', turnIndex: 0, year: 0,
            },
            sizeCategory: sizeCat as import('@lmh/types').SizeCategory,
            directionHint: dir,
          });
          io.to(`session:${sessionId}:gm`).emit('action_stat_roll', {
            actionId: actionId + '_bill',
            playerName: `[NPC Bill: ${bill.title || bill.content}]`,
            actionContent: bill.title || bill.content,
            sizeCategory: sizeCat,
            directionHint: dir,
            statHint: bill.stat_hint ?? undefined,
            targetHint: bill.target_hint ?? undefined,
            sourceType: 'NPC_BILL',
          } as any);
        }
      }
    } catch {}
    // Broadcast to the session room so players' vote cards are cleared.
    // The visibility setting is enforced on the client side for display only.
    io.to(`session:${sessionId}`).emit('action_vote_result', {
      actionId, yeas, nays, abstains, passed, seqId: nextSeq(sessionId),
    });

    if (passed) _rollAndQueueStat(sessionId, pending.action);
  }

  /** GM dismisses an action without accepting — no DB record is created. */
  function dismissAction(sessionId: string, actionId: string): void {
    pendingActionsMap.delete(actionId);
    pendingVotesMap.delete(actionId);
    pendingStatRollsMap.delete(actionId);
  }

  /** GM confirms (or edits) a pending stat roll and applies it. */
  function confirmStatRoll(
    sessionId: string, actionId: string,
    stat: string, target: string, delta: number, reason: string,
  ): void {
    pendingStatRollsMap.delete(actionId);
    const record = queries.applyStatDelta(sessionId, 'gm', stat, target, delta, reason);
    io.to(`session:${sessionId}`).emit('stat_delta', record);
    const vis = visibilityMap.get(sessionId) ?? defaultVisibility;
    // (visibility applied on client side; server always broadcasts for now)
  }

  const defaultVisibility: VisibilitySettings = {
    ownRolls: false, allRolls: false, npcVoteRolls: false,
  };

  function setVisibility(sessionId: string, settings: VisibilitySettings): void {
    visibilityMap.set(sessionId, settings);
    io.to(`session:${sessionId}`).emit('visibility_updated', {
      settings, seqId: nextSeq(sessionId),
    });
  }

  /** Returns all pending legislative votes for a session, for replay on rejoin. */
  function getActivePendingVotes(sessionId: string): Array<{
    actionId: string; playerName: string; party: string; content: string;
  }> {
    const result = [];
    for (const [actionId, pending] of pendingVotesMap.entries()) {
      if (pending.action.sessionId === sessionId) {
        result.push({
          actionId,
          playerName: pending.action.playerName,
          party:      pending.action.party,
          content:    pending.action.content,
        });
      }
    }
    return result;
  }

  return {
    advancePhase, generateTurn, finalizeLedger,
    setNationalStatus, submitAction,
    acceptAction, dismissAction, recordActionVote, closeActionVote,
    confirmStatRoll, setVisibility, getActivePendingVotes, startBillVote,
  };
}

export type GameService = ReturnType<typeof makeGameService>;
