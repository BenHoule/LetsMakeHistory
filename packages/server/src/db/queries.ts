import type Database from 'better-sqlite3';
import type { TurnPhase, StatDeltaRecord } from '@lmh/types';
import { BOUNDS } from '@lmh/types';
import { randomUUID } from 'crypto';

/**
 * Factory function to create database query functions.
 * @param db The database connection object.
 * @returns An object containing query functions for sessions.
 */
export function makeQueries(db: Database.Database) {
  /** Exposed so GameService can access the raw DB for NPC vote rolling. */
  const _db = db;

  const addPlayerTx = db.transaction((
    sessionId: string,
    name: string,
    region: string,
    party: string,
    cls: number,
  ): { playerId: string; senatorId: string } => {
    // Prefer an NPC seat matching the player's party; fall back to any NPC.
    const seat = (
      db.prepare(
        `SELECT id FROM senators
         WHERE session_id = ? AND region = ? AND class = ?
           AND is_player = 0 AND party = ?
         LIMIT 1`
      ).get(sessionId, region, cls, party) ??
      db.prepare(
        `SELECT id FROM senators
         WHERE session_id = ? AND region = ? AND class = ?
           AND is_player = 0
         LIMIT 1`
      ).get(sessionId, region, cls)
    ) as { id: string } | undefined;

    if (!seat) {
      throw new Error(`No available NPC seat for region=${region} class=${cls}`);
    }

    db.prepare('UPDATE senators SET is_player = 1, party = ? WHERE id = ?')
      .run(party, seat.id);

    const playerId = randomUUID();
    db.prepare(`
      INSERT INTO players
        (id, session_id, name, region, party, class, senator_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(playerId, sessionId, name, region, party, cls, seat.id);

    return { playerId, senatorId: seat.id };
  });

  return {
    /**
     * Creates a new session in the database.
     * @param name The name of the session to create.
     * @param gmTokenHash The hashed GM token for the session.
     * @returns The ID of the newly created session.
     */
    createSession(name: string, gmTokenHash: string) {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO sessions (id, name, gm_token_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, name, gmTokenHash, now, now);
      return id;
    },

    /**
     * Gets the session details for the specified session ID.
     * @param sessionId The ID of the session to retrieve.
     * @returns The session details, or undefined if not found.
     */
    getSession(sessionId: string) {
      return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
      { id: string; name: string; turn_index: number; year: number;
        phase: TurnPhase; class_cycle: number } | undefined
    },

    /**
     * Sets the current phase for the specified session.
     * @param sessionId The ID of the session to update.
     * @param phase The new phase to set for the session.
     */
    setPhase(sessionId: string, phase: TurnPhase) {
      db.prepare('UPDATE sessions SET phase = ?, updated_at = ? WHERE id = ?')
        .run(phase, new Date().toISOString(), sessionId);
    },

    /**
     * Lists all sessions in the database.
     * @returns A list of all sessions with their ID, name, phase, and turn index.
     */
    listSessions() {
      return db.prepare('SELECT id, name, phase, turn_index FROM sessions')
        .all();
    },

    /**
     * Gets the current turn for the specified session.
     * @param sessionId The ID of the session to retrieve the current turn for.
     * @returns The current turn details, or undefined if not found.
     */
    getCurrentTurn(sessionId: string) {
      const row = db.prepare(
        'SELECT * FROM turns WHERE session_id = ? ORDER BY turn_index DESC LIMIT 1'
      ).get(sessionId) as { turn_index: number } | undefined;
      if (!row) return undefined;
      return db.prepare(
        'SELECT * FROM turns WHERE session_id = ? AND turn_index = ?'
      ).get(sessionId, row.turn_index) as
        { id: string; turn_index: number; year: number; rng_seed: number } | undefined;
    },

    /**
     * Inserts a new turn for the specified session.
     * @param sessionId The ID of the session to insert the turn for.
     * @param turnIndex The index of the turn to insert.
     * @param year The year of the turn to insert.
     * @param rngSeed The RNG seed for the turn.
     * @returns The ID of the newly inserted turn.
     */
    insertTurn(sessionId: string, turnIndex: number, year: number, rngSeed: number): string {
      const id = randomUUID();
      db.prepare(
        'INSERT INTO turns (id, session_id, turn_index, year, rng_seed) VALUES (?, ?, ?, ?, ?)'
      ).run(id, sessionId, turnIndex, year, rngSeed);
      return id;
    },

    /**
     * Inserts a new event for the specified turn.
     * @param turnId The ID of the turn to insert the event for.
     * @param sequence The sequence number of the event.
     * @param sourceType The source type of the event.
     * @param content The content of the event.
     * @returns The ID of the newly inserted event.
     */
    insertEvent(turnId: string, sequence: number, sourceType: string, content: string): string {
      const id = randomUUID();
      db.prepare(
        'INSERT INTO events (id, turn_id, sequence, source_type, content) VALUES (?, ?, ?, ?, ?)'
      ).run(id, turnId, sequence, sourceType, content);
      return id;
    },

    /**
     * Retrieves all stat delta records for the specified turn.
     * @param turnId The ID of the turn to retrieve stat deltas for.
     * @returns A list of stat delta records associated with the turn.
     */
    getStatDeltasForTurn(turnId: string): StatDeltaRecord[] {
      return db.prepare(`
        SELECT stat, target, delta, reason,
               size_cat AS sizeCat,
               source_type AS sourceType,
               source_id AS sourceId
        FROM stat_deltas WHERE turn_id = ?
      `).all(turnId) as StatDeltaRecord[];
    },

    /**
     * Increments the turn index for the specified session.
     * @param sessionId The ID of the session to increment the turn index for.
     * @returns The new turn index after incrementing.
     */
    incrementTurnIndex(sessionId: string): number {
      const row = db.prepare(
        'SELECT turn_index FROM sessions WHERE id = ?'
      ).get(sessionId) as { turn_index: number } | undefined;
      if (!row) throw new Error(`Session not found: ${sessionId}`);
      const next = row.turn_index + 1;
      const year = 1901 + Math.floor(next / 2);
      db.prepare(
        'UPDATE sessions SET turn_index = ?, year = ?, updated_at = ? WHERE id = ?'
      ).run(next, year, new Date().toISOString(), sessionId);
      return next;
    },

    /**
     * Adds a player senator to a session.
     * Finds an NPC seat in the given region + class (preferring the player's
     * party, falling back to any NPC seat) and inserts the player record.
     */
    addPlayer(
      sessionId: string,
      name: string,
      region: string,
      party: string,
      cls: number,
    ): { playerId: string; senatorId: string } {
      // Immediate transaction prevents concurrent requests from claiming the
      // same NPC seat under load.
      return addPlayerTx.immediate(sessionId, name, region, party, cls);
    },

    listPlayers(sessionId: string) {
      return db.prepare(
        'SELECT * FROM players WHERE session_id = ?'
      ).all(sessionId);
    },

    getNpcSenators(sessionId: string): Array<{ party: string }> {
      return db.prepare(
        'SELECT party FROM senators WHERE session_id = ? AND is_player = 0'
      ).all(sessionId) as Array<{ party: string }>;
    },

    /**
     * Returns a map of { region -> { 1: npcCount, 2: npcCount, 3: npcCount } }
     * so the join form can disable fully-claimed region/class combos.
     */
    getAvailableSeats(sessionId: string): Record<string, Record<number, number>> {
      const rows = db.prepare(`
        SELECT region, class, COUNT(*) AS npc_count
        FROM senators
        WHERE session_id = ? AND is_player = 0
        GROUP BY region, class
      `).all(sessionId) as Array<{ region: string; class: number; npc_count: number }>;
      const result: Record<string, Record<number, number>> = {};
      for (const r of rows) {
        if (!result[r.region]) result[r.region] = {};
        result[r.region][r.class] = r.npc_count;
      }
      return result;
    },

    getAllSenators(sessionId: string) {
      return db.prepare(`
        SELECT s.id, s.region, s.party, s.class, s.is_player,
               p.id AS player_id, p.name AS player_name
        FROM senators s
        LEFT JOIN players p ON p.senator_id = s.id
        WHERE s.session_id = ?
        ORDER BY s.region, s.class
      `).all(sessionId) as Array<{
        id: string; region: string; party: string; class: number;
        is_player: number; player_id: string | null; player_name: string | null;
      }>;
    },

    getPartyApprovals(sessionId: string) {
      return db.prepare('SELECT party, approval FROM party_approvals WHERE session_id = ?')
        .all(sessionId) as Array<{ party: string; approval: number }>;
    },

    setPartyApproval(sessionId: string, party: string, value: number): void {
      const clamped = Math.max(0, Math.min(100, value));
      db.prepare('UPDATE party_approvals SET approval = ? WHERE session_id = ? AND party = ?')
        .run(clamped, sessionId, party);
    },

    getRegionalModifiers(sessionId: string) {
      return db.prepare('SELECT region, party, modifier FROM regional_modifiers WHERE session_id = ?')
        .all(sessionId) as Array<{ region: string; party: string; modifier: number }>;
    },

    setRegionalModifier(sessionId: string, region: string, party: string, value: number): void {
      const clamped = Math.max(0, value);
      db.prepare('UPDATE regional_modifiers SET modifier = ? WHERE session_id = ? AND region = ? AND party = ?')
        .run(clamped, sessionId, region, party);
    },

    getStatHistory(sessionId: string) {
      return (db.prepare(`
        SELECT payload, occurred_at FROM game_log
        WHERE session_id = ? AND event_type = 'STAT_DELTA'
        ORDER BY id DESC LIMIT 200
      `).all(sessionId) as Array<{ payload: string; occurred_at: string }>)
      .map(r => ({ ...JSON.parse(r.payload), at: r.occurred_at }));
    },

    // ── Election data ──────────────────────────────────────────────────────

    getElectionData(sessionId: string) {
      const row = db.prepare(`
        SELECT president_name, president_party, president_elected_year,
               president_is_player, next_senate_class,
               crossover_weight, left_lean_bias, pending_nominees
        FROM sessions WHERE id = ?
      `).get(sessionId) as any;
      return {
        presidentName:      row?.president_name       ?? 'Theodore Roosevelt',
        presidentParty:     row?.president_party      ?? 'Whig',
        presidentYear:      row?.president_elected_year ?? 1901,
        presidentIsPlayer:  !!row?.president_is_player,
        nextSenateClass:    row?.next_senate_class     ?? 1,
        crossoverWeight:    row?.crossover_weight      ?? 0.4,
        leftLeanBias:       row?.left_lean_bias        ?? 0.3,
        pendingNominees:    row?.pending_nominees ? JSON.parse(row.pending_nominees) : null,
      };
    },

    updateElectionSettings(sessionId: string, patch: Record<string, unknown>): void {
      const allowed = ['next_senate_class','crossover_weight','left_lean_bias'];
      for (const [k, v] of Object.entries(patch)) {
        if (allowed.includes(k)) {
          db.prepare(`UPDATE sessions SET ${k} = ? WHERE id = ?`).run(v, sessionId);
        }
      }
    },

    updatePresident(sessionId: string, name: string, party: string, year: number, isPlayer: boolean): void {
      db.prepare(`
        UPDATE sessions
        SET president_name=?, president_party=?, president_elected_year=?, president_is_player=?
        WHERE id=?
      `).run(name, party, year, isPlayer ? 1 : 0, sessionId);
    },

    advanceSenateClass(sessionId: string): void {
      const row = db.prepare('SELECT next_senate_class FROM sessions WHERE id=?').get(sessionId) as {next_senate_class:number}|undefined;
      const next = ((row?.next_senate_class ?? 1) % 3) + 1;
      db.prepare('UPDATE sessions SET next_senate_class=? WHERE id=?').run(next, sessionId);
    },

    setPendingNominees(sessionId: string, nominees: unknown): void {
      db.prepare('UPDATE sessions SET pending_nominees=? WHERE id=?')
        .run(nominees ? JSON.stringify(nominees) : null, sessionId);
    },

    getNpcCandidates(sessionId: string) {
      return db.prepare('SELECT year, party, name FROM npc_candidates WHERE session_id=? ORDER BY year, party')
        .all(sessionId) as Array<{year:number;party:string;name:string}>;
    },

    upsertNpcCandidate(sessionId: string, year: number, party: string, name: string): void {
      db.prepare(`
        INSERT INTO npc_candidates (id, session_id, year, party, name) VALUES (?,?,?,?,?)
        ON CONFLICT(session_id, year, party) DO UPDATE SET name=excluded.name
      `).run(randomUUID(), sessionId, year, party, name);
    },

    deleteNpcCandidate(sessionId: string, year: number, party: string): void {
      db.prepare('DELETE FROM npc_candidates WHERE session_id=? AND year=? AND party=?').run(sessionId, year, party);
    },

    /** Directly set a senate seat's party and player status after an election. */
    updateSenatorSeat(sessionId: string, region: string, cls: number, party: string): void {
      db.prepare(`UPDATE senators SET party=?, is_player=0 WHERE session_id=? AND region=? AND class=?`)
        .run(party, sessionId, region, cls);
    },

    /**
     * Sync all NPC senate seats to current regional standings:
     *   Class 1 & 3 → region's top-ranked party (by weighted regional approval)
     *   Class 2      → region's second-ranked party
     * Player seats are never touched.
     */
    syncNpcSeatsToStandings(sessionId: string): void {
      const approvals = db.prepare(
        'SELECT party, approval FROM party_approvals WHERE session_id = ?'
      ).all(sessionId) as Array<{ party: string; approval: number }>;
      const mods = db.prepare(
        'SELECT region, party, modifier FROM regional_modifiers WHERE session_id = ?'
      ).all(sessionId) as Array<{ region: string; party: string; modifier: number }>;

      const apMap: Record<string, number> = {};
      for (const r of approvals) apMap[r.party] = r.approval;

      const modMap: Record<string, Record<string, number>> = {};
      for (const r of mods) {
        if (!modMap[r.region]) modMap[r.region] = {};
        modMap[r.region][r.party] = r.modifier;
      }

      const PARTIES = ['Progressive', 'Unionist', 'Whig', 'Conservative'];

      // Build ranked party list per region once
      const rankedByRegion: Record<string, string[]> = {};
      for (const region of Object.keys(modMap)) {
        rankedByRegion[region] = [...PARTIES]
          .sort((a, b) =>
            ((apMap[b] ?? 0) * (modMap[region][b] ?? 1)) -
            ((apMap[a] ?? 0) * (modMap[region][a] ?? 1))
          );
      }

      // Update NPC seats: class 1 & 3 → rank 0, class 2 → rank 1
      const npcSeats = db.prepare(
        'SELECT id, region, class FROM senators WHERE session_id = ? AND is_player = 0'
      ).all(sessionId) as Array<{ id: string; region: string; class: number }>;

      for (const seat of npcSeats) {
        const ranked = rankedByRegion[seat.region] ?? PARTIES;
        const partyIndex = seat.class === 2 ? 1 : 0;
        const party = ranked[partyIndex] ?? ranked[0];
        db.prepare('UPDATE senators SET party = ? WHERE id = ?').run(party, seat.id);
      }
    },

    /** Append an immutable entry to the audit log. Returns the new row's id. */
    insertGameLog(
      sessionId: string,
      turnId:    string | null,
      actor:     string,
      eventType: string,
      payload:   Record<string, unknown>,
    ): number {
      const info = db.prepare(`
        INSERT INTO game_log (session_id, turn_id, occurred_at, actor, event_type, payload)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sessionId, turnId, new Date().toISOString(), actor, eventType,
             JSON.stringify(payload));
      return Number(info.lastInsertRowid);
    },

    /** Return all undismissed player-action log entries for a session, oldest first. */
    getPlayerActions(sessionId: string): Array<Record<string, unknown>> {
      return (db.prepare(`
        SELECT id, payload, occurred_at
        FROM   game_log
        WHERE  session_id = ? AND event_type = 'PLAYER_ACTION'
          AND  dismissed_at IS NULL
        ORDER  BY id ASC
      `).all(sessionId) as Array<{ id: number; payload: string; occurred_at: string }>)
      .map(row => ({ logId: row.id, ...JSON.parse(row.payload), receivedAt: row.occurred_at }));
    },

    /** Return a session history: player actions, stat changes, and turn events. */
    getSessionHistory(sessionId: string): {
      id: string; type: string; turnIndex: number | null; year: number | null;
      actor: string | null; content: string; outcome: string | null;
      positive: boolean | null; occurredAt: string;
    }[] {
      const logs = (db.prepare(`
        SELECT gl.id, gl.event_type, gl.occurred_at, gl.actor, gl.payload,
               t.turn_index, t.year
        FROM game_log gl
        LEFT JOIN turns t ON t.id = gl.turn_id
        WHERE gl.session_id = ? AND gl.dismissed_at IS NULL
        ORDER BY gl.id DESC LIMIT 200
      `).all(sessionId) as any[]).map(r => {
        let p: any = {};
        try { p = JSON.parse(r.payload); } catch {}
        let content = p.content ?? p.detail ?? p.action ?? r.event_type;
        let outcome: string | null = null;
        let positive: boolean | null = null;
        if (r.event_type === 'STAT_DELTA') {
          const delta = p.delta ?? 0;
          outcome = `${delta > 0 ? '+' : ''}${delta} ${p.stat ?? ''}`;
          positive = delta >= 0;
          content = p.target ? `${p.target} — ${p.reason ?? ''}` : (p.reason ?? content);
        } else if (r.event_type === 'BILL_VOTE') {
          outcome = p.passed ? 'PASSED' : 'FAILED';
          positive = p.passed ?? null;
          content = p.title ?? content;
        } else if (r.event_type === 'PLAYER_ACTION') {
          outcome = p.voteResult ?? null;
          positive = p.voteResult === 'PASSED' ? true : p.voteResult === 'FAILED' ? false : null;
        }
        return {
          id: String(r.id), type: r.event_type, turnIndex: r.turn_index ?? null,
          year: r.year ?? null, actor: r.actor ?? null, content, outcome, positive,
          occurredAt: r.occurred_at,
        };
      });

      const events = (db.prepare(`
        SELECT e.id, e.sequence, e.source_type, e.content, t.turn_index, t.year
        FROM events e JOIN turns t ON t.id = e.turn_id
        WHERE t.session_id = ?
        ORDER BY t.turn_index DESC,
                 CASE WHEN e.source_type = 'COURT' THEN 9999 ELSE e.sequence END
        LIMIT 100
      `).all(sessionId) as any[]).map(e => ({
        id: `evt-${e.id}`, type: 'EVENT', turnIndex: e.turn_index, year: e.year,
        actor: e.source_type, content: e.content, outcome: null, positive: null,
        occurredAt: '',
      }));

      return [...logs, ...events].sort((a, b) => (b.turnIndex ?? 0) - (a.turnIndex ?? 0));
    },

    /** Return the current turn with full turn state data for page-refresh recovery. */
    getCurrentTurnFull(sessionId: string): null | {
      id: string; turnIndex: number; year: number;
      headlines: any[]; events: any[]; nationalStatus: { financial: string; social: string; foreign: string };
    } {
      const turn = db.prepare(
        'SELECT * FROM turns WHERE session_id = ? ORDER BY turn_index DESC LIMIT 1'
      ).get(sessionId) as any;
      if (!turn) return null;

      const events = (db.prepare(
        `SELECT id, sequence, source_type, content FROM events WHERE turn_id = ?
         ORDER BY CASE WHEN source_type = 'COURT' THEN 9999 ELSE sequence END`
      ).all(turn.id) as any[]).map(e => ({
        id: e.id, sequence: e.sequence,
        sourceType: e.source_type as 'EVENT'|'COURT', content: e.content, statDeltaId: null,
      }));

      const headlines = (db.prepare(
        'SELECT id, outlet, headline, summary FROM headlines WHERE turn_id = ?'
      ).all(turn.id) as any[]).map(h => ({
        id: h.id, outlet: h.outlet as 'AP'|'AmericanStandard', headline: h.headline, summary: h.summary,
      }));

      const sessionRow = db.prepare('SELECT national_status FROM sessions WHERE id = ?').get(sessionId) as any;
      const ns = sessionRow?.national_status ? JSON.parse(sessionRow.national_status) : null;

      return {
        id: turn.id, turnIndex: turn.turn_index, year: turn.year,
        events, headlines,
        nationalStatus: ns ?? { financial: '', social: '', foreign: '' },
      };
    },

    persistNationalStatus(sessionId: string, financial: string, social: string, foreign: string): void {
      db.prepare('UPDATE sessions SET national_status = ? WHERE id = ?')
        .run(JSON.stringify({ financial, social, foreign }), sessionId);
    },

    /** Mark a game_log entry as dismissed (GM soft-delete). */
    dismissAction(logId: number, sessionId: string): void {
      db.prepare(`
        UPDATE game_log SET dismissed_at = ?
        WHERE  id = ? AND session_id = ? AND event_type = 'PLAYER_ACTION'
      `).run(new Date().toISOString(), logId, sessionId);
    },

    /**
     * Apply a signed stat delta, clamp to BOUNDS, log to game_log, and
     * return the StatDeltaRecord with the actual (post-clamp) delta.
     */
    applyStatDelta(
      sessionId: string,
      actor:     string,
      stat:      string,
      target:    string,
      requested: number,
      reason:    string,
    ): StatDeltaRecord {
      const key = stat as keyof typeof BOUNDS;
      const [floor, ceil] = BOUNDS[key];
      let actual = requested;

      if (stat === 'Approval' || stat === 'Recognition' || stat === 'Rizz') {
        const col = stat === 'Approval' ? 'approval'
                  : stat === 'Recognition' ? 'recognition' : 'rizz';
        const row = db.prepare(
          `SELECT ${col} FROM players WHERE session_id = ? AND name = ?`
        ).get(sessionId, target) as Record<string, number> | undefined;
        if (!row) throw new Error(`Player "${target}" not found`);
        const cur = row[col] as number;
        const nv  = Math.max(floor, Math.min(ceil, cur + requested));
        actual = parseFloat((nv - cur).toFixed(4));
        db.prepare(`UPDATE players SET ${col} = ? WHERE session_id = ? AND name = ?`)
          .run(nv, sessionId, target);

      } else if (stat === 'Party') {
        const row = db.prepare(
          `SELECT approval FROM party_approvals WHERE session_id = ? AND party = ?`
        ).get(sessionId, target) as { approval: number } | undefined;
        if (!row) throw new Error(`Party "${target}" not found in this session`);
        const nv = Math.max(floor, Math.min(ceil, row.approval + requested));
        actual = parseFloat((nv - row.approval).toFixed(4));
        db.prepare(`UPDATE party_approvals SET approval = ? WHERE session_id = ? AND party = ?`)
          .run(nv, sessionId, target);

      } else if (stat === 'Region') {
        const parts = target.split(':');
        if (parts.length !== 2) throw new Error('Region target must be "RegionName:PartyName"');
        const [region, party] = parts;
        const row = db.prepare(
          `SELECT modifier FROM regional_modifiers WHERE session_id = ? AND region = ? AND party = ?`
        ).get(sessionId, region, party) as { modifier: number } | undefined;
        if (!row) throw new Error(`Regional modifier for "${target}" not found`);
        const nv = Math.max(floor, row.modifier + requested);
        actual = parseFloat((nv - row.modifier).toFixed(4));
        db.prepare(
          `UPDATE regional_modifiers SET modifier = ? WHERE session_id = ? AND region = ? AND party = ?`
        ).run(nv, sessionId, region, party);
      }

      db.prepare(`
        INSERT INTO game_log (session_id, occurred_at, actor, event_type, payload)
        VALUES (?, ?, ?, 'STAT_DELTA', ?)
      `).run(sessionId, new Date().toISOString(), actor,
        JSON.stringify({ stat, target, delta: actual, reason }));

      return { stat: stat as StatDeltaRecord['stat'], target, delta: actual, reason };
    },

    // ── Bill queue ──────────────────────────────────────────────────────────

    /** Queue a bill (from a player legislative action or GM pre-set). */
    queueBill(sessionId: string, opts: {
      title: string; content: string; proposingParty: string;
      isAmendment: boolean; sourcePlayerId?: string; turnId?: string;
      triggerWeight?: number; directionBias?: number; statHint?: string; targetHint?: string;
    }): string {
      const id = randomUUID();
      // Use the provided turnId, or fall back to the current active turn, or '' as last resort
      const resolvedTurnId = opts.turnId
        ?? (db.prepare('SELECT id FROM turns WHERE session_id=? ORDER BY turn_index DESC LIMIT 1').get(sessionId) as any)?.id
        ?? '';
      db.prepare(`
        INSERT INTO bills (id, turn_id, session_id, proposing_party, content, title, is_amendment,
                           is_npc, queued_at, source_player_id, vote_result,
                           trigger_weight, direction_bias, stat_hint, target_hint)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)
      `).run(id, resolvedTurnId, sessionId, opts.proposingParty, opts.content, opts.title,
             opts.isAmendment ? 1 : 0, opts.sourcePlayerId ? 0 : 1,
             new Date().toISOString(), opts.sourcePlayerId ?? null,
             opts.triggerWeight ?? null, opts.directionBias ?? null,
             opts.statHint ?? null, opts.targetHint ?? null);
      return id;
    },

    getQueuedBills(sessionId: string) {
      return db.prepare(`
        SELECT b.id, b.title, b.content, b.proposing_party, b.is_amendment, b.is_npc,
               b.queued_at, b.vote_result, b.source_player_id,
               b.trigger_weight, b.direction_bias, b.stat_hint, b.target_hint,
               p.name AS player_name
        FROM bills b
        LEFT JOIN players p ON p.id = b.source_player_id
        WHERE b.session_id = ? AND b.vote_result = 'PENDING'
        ORDER BY b.queued_at
      `).all(sessionId) as any[];
    },

    markBillVoted(billId: string, result: 'PASSED' | 'FAILED', counts?: {yea:number;nay:number;abstain:number}): void {
      db.prepare(`UPDATE bills SET vote_result = ?, voted_at = ?, yea_count = ?, nay_count = ?, abstain_count = ? WHERE id = ?`)
        .run(result, new Date().toISOString(), counts?.yea ?? null, counts?.nay ?? null, counts?.abstain ?? null, billId);
    },

    getBillHistory(sessionId: string) {
      return db.prepare(`
        SELECT b.id, b.title, b.content, b.proposing_party, b.is_amendment, b.is_npc,
               b.vote_result, b.voted_at, b.yea_count, b.nay_count, b.abstain_count,
               b.source_player_id,
               p.name  AS player_name,
               t.turn_index, t.year
        FROM bills b
        LEFT JOIN players p ON p.id = b.source_player_id
        LEFT JOIN turns   t ON t.id = b.turn_id
        WHERE b.session_id = ? AND b.vote_result IN ('PASSED','FAILED')
        ORDER BY b.voted_at DESC
        LIMIT 200
      `).all(sessionId) as any[];
    },

    getBill(billId: string): any {
      return db.prepare(`SELECT * FROM bills WHERE id = ?`).get(billId);
    },

    removeBillFromQueue(billId: string, sessionId: string): void {
      db.prepare(`DELETE FROM bills WHERE id = ? AND session_id = ? AND vote_result = 'PENDING'`)
        .run(billId, sessionId);
    },

    // ── Turn content queue (events / SC decisions / NPC bills) ──────────────

    getTurnContent(sessionId: string) {
      return db.prepare(`
        SELECT id, type, content, party, title, trigger_weight, direction_bias, stat_hint, target_hint, created_at
        FROM turn_content WHERE session_id = ? ORDER BY created_at
      `).all(sessionId) as Array<{
        id:string; type:string; content:string; party:string|null; title:string|null;
        trigger_weight:number|null; direction_bias:number|null;
        stat_hint:string|null; target_hint:string|null; created_at:string;
      }>;
    },

    addTurnContent(sessionId: string, type: string, content: string, party: string | null, opts?: {
      title?: string; triggerWeight?: number; directionBias?: number; statHint?: string; targetHint?: string;
    }): string {
      const id = randomUUID();
      db.prepare(`INSERT INTO turn_content (id, session_id, type, content, party, title, trigger_weight, direction_bias, stat_hint, target_hint, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, sessionId, type, content ?? '', party,
        opts?.title ?? null, opts?.triggerWeight ?? null,
        opts?.directionBias ?? null, opts?.statHint ?? null, opts?.targetHint ?? null,
        new Date().toISOString()
      );
      return id;
    },

    removeTurnContent(id: string, sessionId: string): void {
      db.prepare(`DELETE FROM turn_content WHERE id = ? AND session_id = ?`).run(id, sessionId);
    },

    clearTurnContent(sessionId: string): void {
      db.prepare(`DELETE FROM turn_content WHERE session_id = ?`).run(sessionId);
    },

    isTurnContentReady(sessionId: string): boolean {
      const counts = db.prepare(`
        SELECT
          SUM(CASE WHEN type='EVENT'          THEN 1 ELSE 0 END) AS events,
          SUM(CASE WHEN type='COURT'          THEN 1 ELSE 0 END) AS courts,
          SUM(CASE WHEN type='NPC_BILL'       THEN 1 ELSE 0 END) AS npc_bills,
          SUM(CASE WHEN type='AP_HEADLINE'    THEN 1 ELSE 0 END) AS ap_hl,
          SUM(CASE WHEN type='AMST_HEADLINE'  THEN 1 ELSE 0 END) AS amst_hl
        FROM turn_content WHERE session_id = ?
      `).get(sessionId) as {events:number;courts:number;npc_bills:number;ap_hl:number;amst_hl:number};
      return (counts.events ?? 0) >= 3 && (counts.courts ?? 0) >= 1 &&
             (counts.npc_bills ?? 0) >= 3 &&
             (counts.ap_hl ?? 0) >= 1 && (counts.amst_hl ?? 0) >= 1;
    },

    // ── Player removal ───────────────────────────────────────────────────────

    removePlayer(sessionId: string, playerId: string): void {
      // Get the senator seat back to NPC, reset party to best-ranked
      const player = db.prepare('SELECT senator_id, region, class FROM players WHERE id=? AND session_id=?')
        .get(playerId, sessionId) as {senator_id:string;region:string;class:number}|undefined;
      if (!player) return;
      db.prepare('UPDATE senators SET is_player=0 WHERE id=?').run(player.senator_id);
      db.prepare('DELETE FROM players WHERE id=? AND session_id=?').run(playerId, sessionId);
    },
  };
}

// Type representing the object returned by makeQueries, containing all session query functions.
export type Queries = ReturnType<typeof makeQueries>;
