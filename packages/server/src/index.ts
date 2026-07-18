import express from 'express';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { migrate } from './db/migrate.js';
import { makeQueries } from './db/queries.js';
import { makeGameService } from './services/GameService.js';
import type { ClientToServerEvents, ServerToClientEvents } from '@lmh/types';

// Resolve __dirname in a way that works in both ESM (dev/tsx) and CJS (production bundle).
// In esbuild's CJS output import.meta is set to {} so we fall back to __filename.
const __dirname = (() => {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    // CJS environment — __filename is always available here
    return path.dirname(
      typeof __filename !== 'undefined' ? __filename : process.argv[1] ?? '.'
    );
  }
})();

const DB_PATH = process.env.DB_PATH ?? 'lmhistory.db';
const PORT = Number(process.env.PORT ?? 3001);
// In a packaged Electron app this is set to the extracted static build folder.
const STATIC_DIR = process.env.STATIC_DIR ?? path.join(__dirname, '..', '..', 'client', 'build');
const REGIONS = ['Midwest', 'Mountain', 'Northeast', 'South', 'Southwest', 'West'] as const;
const ALL_PARTIES = ['Progressive', 'Unionist', 'Whig', 'Conservative'] as const;
const DEFAULT_REGION_PARTIES: Record<string, string[]> = {
  Midwest:   ['Unionist', 'Progressive', 'Whig', 'Conservative'],
  Mountain:  ['Whig', 'Unionist', 'Conservative', 'Progressive'],
  Northeast: ['Progressive', 'Unionist', 'Whig', 'Conservative'],
  South:     ['Conservative', 'Whig', 'Unionist', 'Progressive'],
  Southwest: ['Whig', 'Conservative', 'Unionist', 'Progressive'],
  West:      ['Progressive', 'Unionist', 'Whig', 'Conservative'],
};
const DEFAULT_NPC_CANDIDATES = [
  { year:1904, party:'Progressive', name:'Theodore Roosevelt (President)'                 },
  { year:1904, party:'Unionist',    name:'William Jennings Bryan (Senator, Mountain)'     },
  { year:1904, party:'Whig',        name:'John D. Rockefeller (Businessman)'              },
  { year:1904, party:'Conservative',name:'James S. Sherman (Representative)'              },
  { year:1908, party:'Progressive', name:'Theodore Roosevelt (former President)'          },
  { year:1908, party:'Unionist',    name:'William Jennings Bryan (Senator, Mountain)'     },
  { year:1908, party:'Whig',        name:'George B. McClellan Jr. (Mayor)'                },
  { year:1908, party:'Conservative',name:'Henry Cabot Lodge (Senator, Northeast)'         },
  { year:1912, party:'Progressive', name:'Robert La Follette (Senator, Midwest)'          },
  { year:1912, party:'Unionist',    name:'Woodrow Wilson (Governor)'                      },
  { year:1912, party:'Whig',        name:'William Howard Taft (Secretary)'                },
  { year:1912, party:'Conservative',name:'Joseph G. Cannon (Representative)'              },
  { year:1916, party:'Progressive', name:'Robert La Follette (Senator, Midwest)'          },
  { year:1916, party:'Unionist',    name:'Woodrow Wilson (Governor)'                      },
  { year:1916, party:'Whig',        name:'Charles Evans Hughes (SC Justice)'              },
  { year:1916, party:'Conservative',name:'Philander C. Knox (Senator, Northeast)'         },
  { year:1920, party:'Progressive', name:'Hiram Johnson (Senator, West)'                  },
  { year:1920, party:'Unionist',    name:'James M. Cox (Governor)'                        },
  { year:1920, party:'Whig',        name:'Warren G. Harding (Senator, Midwest)'           },
  { year:1920, party:'Conservative',name:'Howard Sutherland (Senator, South)'             },
  { year:1924, party:'Progressive', name:'Hiram Johnson (Senator, West)'                  },
  { year:1924, party:'Unionist',    name:'Oscar Underwood (Senator, South)'               },
  { year:1924, party:'Whig',        name:'Calvin Coolidge (Governor)'                     },
  { year:1924, party:'Conservative',name:'John W. Davis (Ambassador)'                     },
  { year:1928, party:'Progressive', name:'Hiram Johnson (Senator, West)'                  },
  { year:1928, party:'Unionist',    name:'Al Smith (Governor)'                            },
  { year:1928, party:'Whig',        name:'Herbert Hoover (Secretary)'                     },
  { year:1928, party:'Conservative',name:'Henry Cabot Lodge Jr. (Senator, Northeast)'     },
  { year:1932, party:'Progressive', name:'Franklin D. Roosevelt (Governor)'               },
  { year:1932, party:'Unionist',    name:'John Nance Garner (Representative)'             },
  { year:1932, party:'Whig',        name:'Herbert Hoover (Secretary)'                     },
  { year:1932, party:'Conservative',name:'Theodore G. Bilbo (Governor)'                   },
  { year:1936, party:'Progressive', name:'Franklin D. Roosevelt (Governor)'               },
  { year:1936, party:'Unionist',    name:'John Nance Garner (Representative)'             },
  { year:1936, party:'Whig',        name:'Alf Landon (Governor)'                          },
  { year:1936, party:'Conservative',name:'Robert A. Taft (Senator, Midwest)'              },
] as const;

// Candidate paths for invite-settings.json (same order as Electron main process).
// The server reads the file directly so runtime-config works even when the
// server is NOT launched by Electron (e.g. standalone behind Caddy).
function readInviteSettingsFile(): { publicBaseUrl: string; publicPort: number | null } | null {
  const userDataFallback = process.env.LMH_USER_DATA ?? '';
  const programData = process.env.ProgramData ?? '';
  const appData = process.env.APPDATA ?? '';

  const candidates = [
    userDataFallback ? path.join(userDataFallback, 'invite-settings.json') : '',
    programData  ? path.join(programData,  'LetsMakeHistory',          'invite-settings.json') : '',
    appData      ? path.join(appData,       "Let's Make History",       'invite-settings.json') : '',
    appData      ? path.join(appData,       'lmhistory-app',            'invite-settings.json') : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      const baseUrl = typeof parsed?.publicBaseUrl === 'string' ? parsed.publicBaseUrl.trim() : '';
      const portRaw = Number(parsed?.publicPort);
      const publicPort = Number.isInteger(portRaw) && portRaw > 0 && portRaw <= 65535 ? portRaw : null;
      if (baseUrl) return { publicBaseUrl: baseUrl, publicPort };
    } catch {
      // ignore unreadable file, try next
    }
  }
  return null;
}

function buildSharePlayerBaseUrl(): string | null {
  // 1. Env var set by Electron parent process (preferred when launched via app).
  const fromEnv = (process.env.INTERNET_BASE_URL ?? '').trim();
  if (fromEnv) return fromEnv;

  const fromEnvBase = (process.env.PUBLIC_BASE_URL ?? '').trim();
  const fromEnvPortRaw = Number(process.env.PUBLIC_PORT);

  // 2. Read invite-settings.json directly (works when running standalone/Caddy).
  const settings = readInviteSettingsFile();
  const baseSource = settings?.publicBaseUrl || fromEnvBase;
  if (!baseSource) return null;

  // Reconstruct a clean URL, injecting an explicit publicPort when present.
  try {
    const url = new URL(baseSource);
    const envPort = Number.isInteger(fromEnvPortRaw) && fromEnvPortRaw > 0 && fromEnvPortRaw <= 65535 ? fromEnvPortRaw : null;
    const explicitPort = settings?.publicPort ?? envPort;
    if (!url.port && explicitPort) url.port = String(explicitPort);
    return url.origin; // strips trailing slash
  } catch {
    return null;
  }
}

function getRuntimeConfig() {
  const sharePlayerBaseUrl = buildSharePlayerBaseUrl();
  const internetInviteSource = (process.env.INTERNET_INVITE_SOURCE ?? (sharePlayerBaseUrl ? 'config' : 'unknown')).trim() || 'unknown';
  return {
    sharePlayerBaseUrl,
    internetInviteSource,
  };
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // allows concurrent reads alongside writes
db.pragma('foreign_keys = ON');  // enforce all REFERENCES constraints

const migrationsDir = path.join(__dirname, 'db', 'migrations');
migrate(db, migrationsDir);

const queries = makeQueries(db);
const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-gm-token');
  if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

const httpServer = createServer(app);
const io = new IOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' },
});
const gameService = makeGameService(db, io);

function defaultSenateRows() {
  return REGIONS.flatMap(region => {
    const parties = DEFAULT_REGION_PARTIES[region];
    return [1, 2, 3].map(cls => ({ region, class: cls, party: parties[(cls - 1) % parties.length] }));
  });
}

function defaultPartyApprovals() {
  return ALL_PARTIES.map(party => ({ party, approval: 35 }));
}

function defaultRegionalModifiers() {
  const rankMod = [1.3, 1.1, 0.9, 0.7];
  return Object.entries(DEFAULT_REGION_PARTIES).flatMap(([region, ranked]) =>
    ranked.map((party, rank) => ({ region, party, modifier: rankMod[rank] }))
  );
}

function mapPlayersForClient(sessionId: string) {
  return (queries.listPlayers(sessionId) as Array<Record<string, unknown>>)
    .map(p => ({
      id: p['id'] as string,
      name: p['name'] as string,
      region: p['region'] as string,
      party: p['party'] as string,
      class: p['class'] as number,
      approval: p['approval'] as number,
      recognition: p['recognition'] as number,
      rizz: p['rizz'] as number,
    }));
}

function mapPartyApprovalsForExport(sessionId: string) {
  return Object.fromEntries(queries.getPartyApprovals(sessionId).map(r => [r.party, r.approval]));
}

function mapRegionalModifiersForExport(sessionId: string) {
  const out: Record<string, Record<string, number>> = {};
  for (const row of queries.getRegionalModifiers(sessionId)) {
    (out[row.region] ??= {})[row.party] = row.modifier;
  }
  return out;
}

function getPersistedNationalStatus(sessionId: string) {
  const row = db.prepare('SELECT national_status FROM sessions WHERE id = ?').get(sessionId) as { national_status: string | null } | undefined;
  if (!row?.national_status) return { financial: '', social: '', foreign: '' };
  try {
    return JSON.parse(row.national_status) as { financial: string; social: string; foreign: string };
  } catch {
    return { financial: '', social: '', foreign: '' };
  }
}

function ensureSeatRows(sessionId: string) {
  const existing = db.prepare('SELECT id, region, class FROM senators WHERE session_id = ? ORDER BY region, class').all(sessionId) as Array<{ id: string; region: string; class: number }>;
  if (existing.length > 0) return existing;

  for (const seat of defaultSenateRows()) {
    db.prepare(
      'INSERT INTO senators (id, session_id, region, party, class, is_player) VALUES (?, ?, ?, ?, ?, 0)'
    ).run(randomUUID(), sessionId, seat.region, seat.party, seat.class);
  }

  return db.prepare('SELECT id, region, class FROM senators WHERE session_id = ? ORDER BY region, class').all(sessionId) as Array<{ id: string; region: string; class: number }>;
}

function seedDefaultSessionState(sessionId: string) {
  const seatMap = new Map(defaultSenateRows().map(seat => [`${seat.region}|${seat.class}`, seat]));
  for (const seat of ensureSeatRows(sessionId)) {
    const base = seatMap.get(`${seat.region}|${seat.class}`);
    if (!base) continue;
    db.prepare('UPDATE senators SET party = ?, is_player = 0 WHERE id = ?').run(base.party, seat.id);
  }

  db.prepare('DELETE FROM party_approvals WHERE session_id = ?').run(sessionId);
  for (const row of defaultPartyApprovals()) {
    db.prepare('INSERT INTO party_approvals (id, session_id, party, approval) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), sessionId, row.party, row.approval);
  }

  db.prepare('DELETE FROM regional_modifiers WHERE session_id = ?').run(sessionId);
  for (const row of defaultRegionalModifiers()) {
    db.prepare('INSERT INTO regional_modifiers (id, session_id, party, region, modifier) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), sessionId, row.party, row.region, row.modifier);
  }

  db.prepare('DELETE FROM npc_candidates WHERE session_id = ?').run(sessionId);
  for (const row of DEFAULT_NPC_CANDIDATES) {
    db.prepare('INSERT INTO npc_candidates (id, session_id, year, party, name) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), sessionId, row.year, row.party, row.name);
  }
}

function buildFullState(sessionId: string) {
  const row = queries.getSession(sessionId);
  if (!row) throw new Error(`Session not found: ${sessionId}`);

  return {
    version: 1,
    session: {
      id: row.id,
      name: row.name,
      turnIndex: row.turn_index,
      year: row.year,
      phase: row.phase,
      classCycle: row.class_cycle,
    },
    election: queries.getElectionData(sessionId),
    flags: queries.getGMFlags(sessionId),
    nationalStatus: getPersistedNationalStatus(sessionId),
    partyApprovals: mapPartyApprovalsForExport(sessionId),
    regionalModifiers: mapRegionalModifiersForExport(sessionId),
    players: mapPlayersForClient(sessionId),
    senators: queries.getAllSenators(sessionId),
    npcCandidates: queries.getNpcCandidates(sessionId),
    statHistory: queries.getStatHistory(sessionId),
    billQueue: queries.getQueuedBills(sessionId),
    billHistory: queries.getBillHistory(sessionId),
    turnContent: queries.getTurnContent(sessionId),
    currentTurn: queries.getCurrentTurnFull(sessionId),
  };
}

const replaceFullStateTx = db.transaction((sessionId: string, snapshot: any | null) => {
  const currentSession = queries.getSession(sessionId);
  if (!currentSession) throw new Error(`Session not found: ${sessionId}`);

  db.prepare('DELETE FROM votes WHERE bill_id IN (SELECT id FROM bills WHERE session_id = ?)').run(sessionId);
  db.prepare('DELETE FROM bills WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM stat_deltas WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM headlines WHERE turn_id IN (SELECT id FROM turns WHERE session_id = ?)').run(sessionId);
  db.prepare('DELETE FROM events WHERE turn_id IN (SELECT id FROM turns WHERE session_id = ?)').run(sessionId);
  db.prepare('DELETE FROM game_log WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM turn_content WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM npc_candidates WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM players WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM turns WHERE session_id = ?').run(sessionId);
  db.prepare('UPDATE senators SET is_player = 0 WHERE session_id = ?').run(sessionId);

  const now = new Date().toISOString();

  if (!snapshot) {
    seedDefaultSessionState(sessionId);
    db.prepare(`
      UPDATE sessions
      SET turn_index = 0,
          year = 1901,
          phase = 'LOBBY',
          class_cycle = 1,
          president_name = 'Theodore Roosevelt',
          president_party = 'Progressive',
          president_elected_year = 1901,
          president_is_player = 0,
          next_senate_class = 1,
          crossover_weight = 0.4,
          left_lean_bias = 0.3,
          pending_nominees = NULL,
          gm_flags = NULL,
          national_status = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(now, sessionId);
    return;
  }

  ensureSeatRows(sessionId);

  const partyApprovals = snapshot.partyApprovals ?? {};
  const regionalModifiers = snapshot.regionalModifiers ?? {};
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const senators = Array.isArray(snapshot.senators) ? snapshot.senators : [];
  const npcCandidates = Array.isArray(snapshot.npcCandidates) ? snapshot.npcCandidates : [];
  const statHistory = Array.isArray(snapshot.statHistory) ? snapshot.statHistory : [];
  const billQueue = Array.isArray(snapshot.billQueue) ? snapshot.billQueue : [];
  const billHistory = Array.isArray(snapshot.billHistory) ? snapshot.billHistory : [];
  const turnContent = Array.isArray(snapshot.turnContent) ? snapshot.turnContent : [];
  const currentTurn = snapshot.currentTurn && typeof snapshot.currentTurn === 'object' ? snapshot.currentTurn : null;
  const election = snapshot.election && typeof snapshot.election === 'object' ? snapshot.election : {};
  const flags = Array.isArray(snapshot.flags) ? snapshot.flags.filter((flag: unknown): flag is string => typeof flag === 'string') : [];
  const sessionState = snapshot.session && typeof snapshot.session === 'object' ? snapshot.session : {};
  const nationalStatus = snapshot.nationalStatus && typeof snapshot.nationalStatus === 'object'
    ? snapshot.nationalStatus
    : { financial: '', social: '', foreign: '' };

  db.prepare('DELETE FROM party_approvals WHERE session_id = ?').run(sessionId);
  for (const party of ALL_PARTIES) {
    const approval = typeof partyApprovals[party] === 'number' ? partyApprovals[party] : 35;
    db.prepare('INSERT INTO party_approvals (id, session_id, party, approval) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), sessionId, party, approval);
  }

  db.prepare('DELETE FROM regional_modifiers WHERE session_id = ?').run(sessionId);
  const defaultMods = Object.fromEntries(
    REGIONS.map(region => [region, Object.fromEntries(
      defaultRegionalModifiers()
        .filter(row => row.region === region)
        .map(row => [row.party, row.modifier])
    )])
  ) as Record<string, Record<string, number>>;
  for (const region of REGIONS) {
    for (const party of ALL_PARTIES) {
      const modifier = typeof regionalModifiers?.[region]?.[party] === 'number'
        ? regionalModifiers[region][party]
        : defaultMods[region]?.[party] ?? 1;
      db.prepare('INSERT INTO regional_modifiers (id, session_id, party, region, modifier) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), sessionId, party, region, modifier);
    }
  }

  const importedSeatMap = new Map((senators as any[]).map((seat: any) => [`${seat.region}|${seat.class}`, seat]));
  const importedPlayerSeatMap = new Map((players as any[]).map((player: any) => [`${player.region}|${player.class}`, player]));
  const defaultSeatMap = new Map(defaultSenateRows().map(seat => [`${seat.region}|${seat.class}`, seat]));
  const seatIdByKey = new Map(ensureSeatRows(sessionId).map(seat => [`${seat.region}|${seat.class}`, seat.id]));

  for (const [key, seatId] of seatIdByKey.entries()) {
    const importedSeat = importedSeatMap.get(key) as any;
    const importedPlayer = importedPlayerSeatMap.get(key) as any;
    const fallbackSeat = defaultSeatMap.get(key);
    const party = importedPlayer?.party ?? importedSeat?.party ?? fallbackSeat?.party ?? 'Progressive';
    db.prepare('UPDATE senators SET party = ?, is_player = ? WHERE id = ?')
      .run(party, importedPlayer ? 1 : 0, seatId);
  }

  for (const player of players as any[]) {
    const seatKey = `${player.region}|${player.class}`;
    const senatorId = seatIdByKey.get(seatKey);
    if (!senatorId) throw new Error(`No seat found for ${seatKey}`);
    db.prepare(`
      INSERT INTO players (id, session_id, name, region, party, class, senator_id, approval, recognition, rizz)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      player.id ?? randomUUID(),
      sessionId,
      player.name,
      player.region,
      player.party,
      Number(player.class),
      senatorId,
      typeof player.approval === 'number' ? player.approval : 50,
      typeof player.recognition === 'number' ? player.recognition : 10,
      typeof player.rizz === 'number' ? player.rizz : 0,
    );
  }

  db.prepare('DELETE FROM npc_candidates WHERE session_id = ?').run(sessionId);
  for (const candidate of npcCandidates as any[]) {
    db.prepare('INSERT INTO npc_candidates (id, session_id, year, party, name) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), sessionId, Number(candidate.year), candidate.party, candidate.name);
  }

  const turnIds = new Map<string, string>();
  const ensureTurn = (turnIndex: number, year: number, preferredId?: string) => {
    const key = `${turnIndex}|${year}`;
    const existing = turnIds.get(key);
    if (existing) return existing;
    const id = preferredId || randomUUID();
    db.prepare(
      'INSERT INTO turns (id, session_id, turn_index, year, rng_seed, finalized_at) VALUES (?, ?, ?, ?, ?, NULL)'
    ).run(id, sessionId, turnIndex, year, 0);
    turnIds.set(key, id);
    return id;
  };

  if (currentTurn && Number.isFinite(currentTurn.turnIndex) && Number.isFinite(currentTurn.year)) {
    const turnId = ensureTurn(Number(currentTurn.turnIndex), Number(currentTurn.year), currentTurn.id);
    for (const headline of Array.isArray(currentTurn.headlines) ? currentTurn.headlines : []) {
      db.prepare('INSERT INTO headlines (id, turn_id, outlet, headline, summary, source_event_id) VALUES (?, ?, ?, ?, ?, NULL)')
        .run(headline.id ?? randomUUID(), turnId, headline.outlet, headline.headline, headline.summary ?? '');
    }
    for (const event of Array.isArray(currentTurn.events) ? currentTurn.events : []) {
      db.prepare('INSERT INTO events (id, turn_id, sequence, source_type, content) VALUES (?, ?, ?, ?, ?)')
        .run(event.id ?? randomUUID(), turnId, Number(event.sequence ?? 0), event.sourceType ?? 'EVENT', event.content ?? '');
    }
  }

  const importedPlayerIds = new Set((players as any[]).map((player: any) => player.id));
  const currentSessionTurnIndex = Number.isFinite(sessionState.turnIndex) ? Number(sessionState.turnIndex) : 0;
  const currentSessionYear = Number.isFinite(sessionState.year) ? Number(sessionState.year) : 1901;

  const insertBill = db.prepare(`
    INSERT INTO bills (
      id, turn_id, session_id, proposing_party, content, title, is_amendment, is_npc,
      queued_at, voted_at, source_player_id, vote_result, trigger_weight, direction_bias,
      stat_hint, target_hint, yea_count, nay_count, abstain_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const bill of billHistory as any[]) {
    const turnId = ensureTurn(
      Number.isFinite(bill.turn_index) ? Number(bill.turn_index) : currentSessionTurnIndex,
      Number.isFinite(bill.year) ? Number(bill.year) : currentSessionYear,
    );
    insertBill.run(
      bill.id ?? randomUUID(),
      turnId,
      sessionId,
      bill.proposing_party,
      bill.content ?? bill.title ?? '',
      bill.title ?? '',
      bill.is_amendment ? 1 : 0,
      bill.is_npc ? 1 : 0,
      bill.queued_at ?? bill.voted_at ?? now,
      bill.voted_at ?? now,
      importedPlayerIds.has(bill.source_player_id) ? bill.source_player_id : null,
      bill.vote_result ?? 'FAILED',
      bill.trigger_weight ?? null,
      bill.direction_bias ?? null,
      bill.stat_hint ?? null,
      bill.target_hint ?? null,
      bill.yea_count ?? null,
      bill.nay_count ?? null,
      bill.abstain_count ?? null,
    );
  }

  const queuedTurnId = currentTurn && Number.isFinite(currentTurn.turnIndex) && Number.isFinite(currentTurn.year)
    ? ensureTurn(Number(currentTurn.turnIndex), Number(currentTurn.year), currentTurn.id)
    : ensureTurn(currentSessionTurnIndex, currentSessionYear);
  for (const bill of billQueue as any[]) {
    insertBill.run(
      bill.id ?? randomUUID(),
      queuedTurnId,
      sessionId,
      bill.proposing_party,
      bill.content ?? bill.title ?? '',
      bill.title ?? '',
      bill.is_amendment ? 1 : 0,
      bill.is_npc ? 1 : 0,
      bill.queued_at ?? now,
      null,
      importedPlayerIds.has(bill.source_player_id) ? bill.source_player_id : null,
      'PENDING',
      bill.trigger_weight ?? null,
      bill.direction_bias ?? null,
      bill.stat_hint ?? null,
      bill.target_hint ?? null,
      null,
      null,
      null,
    );
  }

  for (const item of turnContent as any[]) {
    db.prepare(`
      INSERT INTO turn_content (id, session_id, type, content, party, title, trigger_weight, direction_bias, stat_hint, target_hint, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id ?? randomUUID(),
      sessionId,
      item.type,
      item.content ?? '',
      item.party ?? null,
      item.title ?? null,
      item.trigger_weight ?? null,
      item.direction_bias ?? null,
      item.stat_hint ?? null,
      item.target_hint ?? null,
      item.created_at ?? now,
    );
  }

  const insertStatHistory = db.prepare(`
    INSERT INTO game_log (session_id, turn_id, occurred_at, actor, event_type, payload, dismissed_at)
    VALUES (?, NULL, ?, 'gm', 'STAT_DELTA', ?, NULL)
  `);
  for (const row of [...statHistory].reverse() as any[]) {
    insertStatHistory.run(
      sessionId,
      row.at ?? now,
      JSON.stringify({ stat: row.stat, target: row.target, delta: row.delta, reason: row.reason })
    );
  }

  db.prepare(`
    UPDATE sessions
    SET name = ?,
        turn_index = ?,
        year = ?,
        phase = ?,
        class_cycle = ?,
        president_name = ?,
        president_party = ?,
        president_elected_year = ?,
        president_is_player = ?,
        next_senate_class = ?,
        crossover_weight = ?,
        left_lean_bias = ?,
        pending_nominees = ?,
        gm_flags = ?,
        national_status = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    typeof sessionState.name === 'string' ? sessionState.name : currentSession.name,
    currentSessionTurnIndex,
    currentSessionYear,
    typeof sessionState.phase === 'string' ? sessionState.phase : 'LOBBY',
    Number.isFinite(sessionState.classCycle) ? Number(sessionState.classCycle) : 1,
    election.presidentName ?? 'Theodore Roosevelt',
    election.presidentParty ?? 'Progressive',
    Number.isFinite(election.presidentYear) ? Number(election.presidentYear) : 1901,
    election.presidentIsPlayer ? 1 : 0,
    Number.isFinite(election.nextSenateClass) ? Number(election.nextSenateClass) : 1,
    typeof election.crossoverWeight === 'number' ? election.crossoverWeight : 0.4,
    typeof election.leftLeanBias === 'number' ? election.leftLeanBias : 0.3,
    election.pendingNominees ? JSON.stringify(election.pendingNominees) : null,
    flags.length ? JSON.stringify(flags) : null,
    JSON.stringify({
      financial: nationalStatus.financial ?? '',
      social: nationalStatus.social ?? '',
      foreign: nationalStatus.foreign ?? '',
    }),
    now,
    sessionId,
  );
});

// Stub health check -- replace with real router in M2
app.get('/health', (_req, res) => res.json({ok: true}));

app.get('/api/v1/runtime-config', (_req, res) => {
  res.json(getRuntimeConfig());
});

app.get('/api/v1/sessions', (_req, res) => {
  res.json(queries.listSessions());
});

app.get('/api/v1/sessions/:id', (req, res) => {
  const row = queries.getSession(req.params.id);
  if (!row) return res.status(404).json({ error: 'Session not found' });

  const session = {
    id:         row.id,
    name:       row.name,
    turnIndex:  row.turn_index,
    year:       row.year,
    phase:      row.phase,
    classCycle: row.class_cycle as 1 | 2 | 3,
  };

  const players = (queries.listPlayers(req.params.id) as Array<Record<string, unknown>>)
    .map(p => ({
      id:          p['id'],
      name:        p['name'],
      region:      p['region'],
      party:       p['party'],
      class:       p['class'],
      approval:    p['approval'],
      recognition: p['recognition'],
      rizz:        p['rizz'],
    }));

  res.json({ session, players, senators: [], phase: row.phase });
});

app.post('/api/v1/sessions', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name) {
    return res.status(400).json({ error: 'Missing session name' });
  }
  const gmToken = randomUUID();
  const gmTokenHash = createHash('sha256').update(gmToken).digest('hex');
  const sessionId = queries.createSession(name, gmTokenHash);
  seedDefaultSessionState(sessionId);

  res.status(201).json({ id: sessionId, gmToken });
});

app.get('/api/v1/sessions/:id/available-seats', (req, res) => {
  res.json(queries.getAvailableSeats(req.params.id));
});

app.post('/api/v1/sessions/:id/players', (req, res) => {
  const sessionId = req.params.id;
  const { name, region, party } = req.body as
    { name?: string; region?: string; party?: string; class?: number };
  const cls = req.body.class as number | undefined;
  if (!name || !region || !party || !cls) {
    return res.status(400).json({ error: 'name, region, party, and class are required' });
  }
  try {
    const result = queries.addPlayer(sessionId, name, region, party, cls);
    // Notify all clients in the session (including GM) that the roster changed.
    const updatedPlayers = (queries.listPlayers(sessionId) as Array<Record<string, unknown>>)
      .map(p => ({
        id: p['id'] as string, name: p['name'] as string,
        region: p['region'] as string, party: p['party'] as string,
        class: p['class'] as number, approval: p['approval'] as number,
        recognition: p['recognition'] as number, rizz: p['rizz'] as number,
      }));
    io.to(`session:${sessionId}`).emit('players_updated', { players: updatedPlayers as any, seqId: Date.now() });
    res.status(201).json(result);
  } catch (err) {
    res.status(409).json({ error: String(err) });
  }
});

app.post('/api/v1/gm/sessions/:id/players/:playerId', (req, res) => {
  if (!gmCheck(req, res)) return;
  const { approval, recognition, rizz, party, region } = req.body as {
    approval?: number;
    recognition?: number;
    rizz?: number;
    party?: string;
    region?: string;
    class?: number;
  };
  const cls = req.body.class as number | undefined;
  if (
    approval === undefined && recognition === undefined && rizz === undefined &&
    party === undefined && region === undefined && cls === undefined
  ) {
    return res.status(400).json({ error: 'At least one player field is required' });
  }
  try {
    if (party !== undefined || region !== undefined || cls !== undefined) {
      queries.updatePlayerProfile(req.params.id, req.params.playerId, { party, region, class: cls });
    }
    queries.updatePlayerStats(req.params.id, req.params.playerId, { approval, recognition, rizz });
    const updatedPlayers = (queries.listPlayers(req.params.id) as Array<Record<string, unknown>>)
      .map(p => ({
        id: p['id'] as string,
        name: p['name'] as string,
        region: p['region'] as string,
        party: p['party'] as string,
        class: p['class'] as number,
        approval: p['approval'] as number,
        recognition: p['recognition'] as number,
        rizz: p['rizz'] as number,
      }));
    const updatedSenators = queries.getAllSenators(req.params.id);
    io.to(`session:${req.params.id}`).emit('players_updated', { players: updatedPlayers as any, seqId: Date.now() });
    res.json({ players: updatedPlayers, senators: updatedSenators });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('Player not found') ? 404 : 409;
    res.status(status).json({ error: message });
  }
});

app.get('/api/v1/sessions/:id/party-approvals', (req, res) => {
  res.json(queries.getPartyApprovals(req.params.id));
});

app.get('/api/v1/sessions/:id/regional-modifiers', (req, res) => {
  res.json(queries.getRegionalModifiers(req.params.id));
});

app.get('/api/v1/sessions/:id/senators', (req, res) => {
  res.json(queries.getAllSenators(req.params.id));
});

app.get('/api/v1/sessions/:id/stat-history', (req, res) => {
  res.json(queries.getStatHistory(req.params.id));
});

app.get('/api/v1/sessions/:id/turns/current', (req, res) => {
  const turn = queries.getCurrentTurnFull(req.params.id);
  res.json(turn);   // null if no turn generated yet
});

app.get('/api/v1/sessions/:id/game-history', (req, res) => {
  res.json(queries.getSessionHistory(req.params.id));
});

app.get('/api/v1/sessions/:id/election-data', (req, res) => {
  const ed  = queries.getElectionData(req.params.id);
  const npc = queries.getNpcCandidates(req.params.id);
  res.json({ ...ed, npcCandidates: npc });
});

// ── GM-authenticated election endpoints ──────────────────────────────────────

function gmCheck(req: any, res: any): boolean {
  const row = db.prepare('SELECT gm_token_hash FROM sessions WHERE id = ?')
    .get(req.params.id) as { gm_token_hash: string } | undefined;
  const hash = createHash('sha256').update((req.headers['x-gm-token'] as string) ?? '').digest('hex');
  if (!row || hash !== row.gm_token_hash) { res.status(403).json({ error: 'GM token required' }); return false; }
  return true;
}

app.get('/api/v1/gm/sessions/:id/flags', (req, res) => {
  if (!gmCheck(req, res)) return;
  res.json({ flags: queries.getGMFlags(req.params.id) });
});

app.put('/api/v1/gm/sessions/:id/flags', (req, res) => {
  if (!gmCheck(req, res)) return;
  const flags = Array.isArray(req.body?.flags)
    ? req.body.flags.filter((flag: unknown): flag is string => typeof flag === 'string' && flag.trim().length > 0).map((flag: string) => flag.trim())
    : [];
  queries.setGMFlags(req.params.id, flags);
  res.json({ flags });
});

app.get('/api/v1/gm/sessions/:id/full-state', (req, res) => {
  if (!gmCheck(req, res)) return;
  try {
    res.json(buildFullState(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.put('/api/v1/gm/sessions/:id/full-state', (req, res) => {
  if (!gmCheck(req, res)) return;
  const previousPlayerIds = new Set(mapPlayersForClient(req.params.id).map(player => player.id));
  try {
    replaceFullStateTx(req.params.id, req.body ?? null);
    gameService.clearSessionRuntime(req.params.id);
    gameService.setCachedNationalStatus(req.params.id, getPersistedNationalStatus(req.params.id));
    const state = buildFullState(req.params.id);
    const nextPlayerIds = new Set((state.players as Array<{ id: string }>).map(player => player.id));
    for (const playerId of previousPlayerIds) {
      if (!nextPlayerIds.has(playerId)) {
        io.to(`session:${req.params.id}`).emit('player_removed' as any, { playerId });
      }
    }
    io.to(`session:${req.params.id}`).emit('players_updated', { players: state.players as any, seqId: Date.now() });
    io.to(`session:${req.params.id}`).emit('phase_changed', {
      phase: state.session.phase,
      turnIndex: state.session.turnIndex,
      seqId: Date.now(),
    });
    res.json(state);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/v1/gm/sessions/:id/reset', (req, res) => {
  if (!gmCheck(req, res)) return;
  const previousPlayerIds = mapPlayersForClient(req.params.id).map(player => player.id);
  try {
    replaceFullStateTx(req.params.id, null);
    gameService.clearSessionRuntime(req.params.id);
    gameService.setCachedNationalStatus(req.params.id, null);
    const state = buildFullState(req.params.id);
    for (const playerId of previousPlayerIds) {
      io.to(`session:${req.params.id}`).emit('player_removed' as any, { playerId });
    }
    io.to(`session:${req.params.id}`).emit('players_updated', { players: state.players as any, seqId: Date.now() });
    io.to(`session:${req.params.id}`).emit('phase_changed', {
      phase: state.session.phase,
      turnIndex: state.session.turnIndex,
      seqId: Date.now(),
    });
    res.json(state);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.put('/api/v1/gm/sessions/:id/election-settings', (req, res) => {
  if (!gmCheck(req, res)) return;
  queries.updateElectionSettings(req.params.id, req.body as Record<string, unknown>);
  res.json({ ok: true });
});

app.put('/api/v1/gm/sessions/:id/president', (req, res) => {
  if (!gmCheck(req, res)) return;
  const { name, party, year, isPlayer } = req.body as any;
  queries.updatePresident(req.params.id, name, party, Number(year), !!isPlayer);
  io.to(`session:${req.params.id}`).emit('election_result', {
    type: 'PRESIDENTIAL',
    presidential: { winner: party as any, electoralVote: [0, 0], isTieBreak: false },
    seqId: Date.now(),
  });
  res.json({ ok: true });
});

app.put('/api/v1/gm/sessions/:id/pending-nominees', (req, res) => {
  if (!gmCheck(req, res)) return;
  queries.setPendingNominees(req.params.id, req.body.nominees ?? null);
  res.json({ ok: true });
});

app.post('/api/v1/gm/sessions/:id/npc-candidates', (req, res) => {
  if (!gmCheck(req, res)) return;
  const { year, party, name } = req.body as any;
  queries.upsertNpcCandidate(req.params.id, Number(year), party, name);
  res.json({ ok: true });
});

app.delete('/api/v1/gm/sessions/:id/npc-candidates/:year/:party', (req, res) => {
  if (!gmCheck(req, res)) return;
  queries.deleteNpcCandidate(req.params.id, Number(req.params.year), req.params.party);
  res.json({ ok: true });
});

app.post('/api/v1/gm/sessions/:id/sync-npc-seats', (req, res) => {
  if (!gmCheck(req, res)) return;
  queries.syncNpcSeatsToStandings(req.params.id);
  const updatedSenators = queries.getAllSenators(req.params.id);
  io.to(`session:${req.params.id}`).emit('players_updated', {
    players: [] as any, seqId: Date.now(),
  });
  res.json({ senators: updatedSenators });
});

app.post('/api/v1/gm/sessions/:id/apply-senate-results', (req, res) => {
  if (!gmCheck(req, res)) return;
  const results = req.body.results as Array<{region:string; cls:number; party:string}>;
  for (const r of results) {
    queries.updateSenatorSeat(req.params.id, r.region, r.cls, r.party);
  }
  queries.advanceSenateClass(req.params.id);
  const updatedSenators = queries.getAllSenators(req.params.id);
  io.to(`session:${req.params.id}`).emit('election_result', {
    type: 'SENATE',
    senate: results.map(r => ({
      region: r.region as any, class: r.cls as any,
      winningParty: r.party as any, isUnderdogHold: false,
    })),
    seqId: Date.now(),
  });
  res.json({ senators: updatedSenators });
});

app.put('/api/v1/gm/sessions/:id/party-approvals', (req, res) => {
  const row = db.prepare('SELECT gm_token_hash FROM sessions WHERE id = ?')
    .get(req.params.id) as { gm_token_hash: string } | undefined;
  const token = req.headers['x-gm-token'] as string | undefined;
  const hash = createHash('sha256').update(token ?? '').digest('hex');
  if (!row || hash !== row.gm_token_hash) return res.status(403).json({ error: 'GM token required' });
  const updates = req.body as Record<string, number>;
  for (const [party, value] of Object.entries(updates)) {
    queries.setPartyApproval(req.params.id, party, value);
  }
  res.json({ ok: true });
});

app.put('/api/v1/gm/sessions/:id/regional-modifiers', (req, res) => {
  const row = db.prepare('SELECT gm_token_hash FROM sessions WHERE id = ?')
    .get(req.params.id) as { gm_token_hash: string } | undefined;
  const token = req.headers['x-gm-token'] as string | undefined;
  const hash = createHash('sha256').update(token ?? '').digest('hex');
  if (!row || hash !== row.gm_token_hash) return res.status(403).json({ error: 'GM token required' });
  const updates = req.body as Record<string, Record<string, number>>;
  for (const [region, parties] of Object.entries(updates)) {
    for (const [party, value] of Object.entries(parties)) {
      queries.setRegionalModifier(req.params.id, region, party, value);
    }
  }
  res.json({ ok: true });
});

app.post('/api/v1/gm/sessions/:id/log-bill', (req, res) => {
  if (!gmCheck(req, res)) return;
  const { title, type, proposer, yeas, nays, abstains, passed } = req.body as any;
  queries.insertGameLog(req.params.id, null, proposer, 'BILL_VOTE', {
    title, type, proposer, yeas, nays, abstains, passed,
  });
  res.json({ ok: true });
});

app.post('/api/v1/gm/sessions/:id/override', (req, res) => {
  if (!gmCheck(req, res)) return;
  const { stat, target, delta, reason } = req.body as {
    stat?: string; target?: string; delta?: number; reason?: string;
  };
  if (!stat || !target || delta === undefined || !reason)
    return res.status(400).json({ error: 'stat, target, delta, and reason required' });
  try {
    const record = queries.applyStatDelta(req.params.id, 'gm', stat, target, delta, reason);
    io.to(`session:${req.params.id}`).emit('stat_delta', record);
    res.json({ delta: record });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.get('/api/v1/gm/sessions/:id/actions', (req, res) => {
  const row = db.prepare('SELECT gm_token_hash FROM sessions WHERE id = ?')
    .get(req.params.id) as { gm_token_hash: string } | undefined;
  const token = req.headers['x-gm-token'] as string | undefined;
  const hash = createHash('sha256').update(token ?? '').digest('hex');
  if (!row || hash !== row.gm_token_hash)
    return res.status(403).json({ error: 'GM token required' });
  res.json(queries.getPlayerActions(req.params.id));
});

app.post('/api/v1/gm/sessions/:id/actions/:logId/dismiss', (req, res) => {
  const row = db.prepare('SELECT gm_token_hash FROM sessions WHERE id = ?')
    .get(req.params.id) as { gm_token_hash: string } | undefined;
  const token = req.headers['x-gm-token'] as string | undefined;
  const hash = createHash('sha256').update(token ?? '').digest('hex');
  if (!row || hash !== row.gm_token_hash)
    return res.status(403).json({ error: 'GM token required' });
  queries.dismissAction(Number(req.params.logId), req.params.id);
  res.json({ ok: true });
});

app.get('/api/v1/sessions/:id/bill-history', (req, res) => {
  res.json(queries.getBillHistory(req.params.id));
});

// ── Bill queue ────────────────────────────────────────────────────────────
app.get('/api/v1/sessions/:id/bill-queue', (req, res) => {
  res.json(queries.getQueuedBills(req.params.id));
});

app.post('/api/v1/gm/sessions/:id/bill-queue', (req, res) => {
  if (!gmCheck(req, res)) return;
  const { title, content, proposingParty, isAmendment } = req.body as any;
  if (!title || !proposingParty) return res.status(400).json({ error: 'title and proposingParty required' });
  const id = queries.queueBill(req.params.id, {
    title, content: content ?? title, proposingParty, isAmendment: !!isAmendment,
  });
  io.to(`session:${req.params.id}`).emit('bill_queued' as any, {
    billId: id, playerName: 'GM', party: proposingParty, content: title,
  });
  res.status(201).json({ id });
});

app.delete('/api/v1/gm/sessions/:id/bill-queue/:billId', (req, res) => {
  if (!gmCheck(req, res)) return;
  queries.removeBillFromQueue(req.params.billId, req.params.id);
  res.json({ ok: true });
});

// ── Turn content queue ────────────────────────────────────────────────────
app.get('/api/v1/sessions/:id/turn-content', (req, res) => {
  res.json(queries.getTurnContent(req.params.id));
});

app.post('/api/v1/gm/sessions/:id/turn-content', (req, res) => {
  if (!gmCheck(req, res)) return;
  const { type, content, party, title, triggerWeight, directionBias, statHint, targetHint } = req.body as any;
  const id = queries.addTurnContent(req.params.id, type, content ?? '', party ?? null, {
    title, triggerWeight, directionBias, statHint, targetHint,
  });
  res.json({ id });
});

app.delete('/api/v1/gm/sessions/:id/turn-content/:itemId', (req, res) => {
  if (!gmCheck(req, res)) return;
  queries.removeTurnContent(req.params.itemId, req.params.id);
  res.json({ ok: true });
});

// ── Remove player ─────────────────────────────────────────────────────────
app.delete('/api/v1/gm/sessions/:id/players/:playerId', (req, res) => {
  if (!gmCheck(req, res)) return;
  queries.removePlayer(req.params.id, req.params.playerId);
  const updatedPlayers = (queries.listPlayers(req.params.id) as Array<Record<string,unknown>>)
    .map(p => ({
      id: p['id'], name: p['name'], region: p['region'], party: p['party'],
      class: p['class'], approval: p['approval'], recognition: p['recognition'], rizz: p['rizz'],
    }));
  io.to(`session:${req.params.id}`).emit('players_updated', { players: updatedPlayers as any, seqId: Date.now() });
  // Tell the removed player to go back to lobby
  io.to(`session:${req.params.id}`).emit('player_removed' as any, { playerId: req.params.playerId });
  res.json({ ok: true });
});

io.on('connection', socket => {
  console.log('client connected:', socket.id);

  socket.on('join_session', ({ sessionId, playerId, gmToken }) => {
    socket.join(`session:${sessionId}`);
    (socket as any)._playerId = playerId;
    // Verify the GM token and grant access to the private GM room.
    if (gmToken) {
      const row = db.prepare('SELECT gm_token_hash FROM sessions WHERE id = ?')
        .get(sessionId) as { gm_token_hash: string } | undefined;
      const hash = createHash('sha256').update(gmToken).digest('hex');
      if (row && hash === row.gm_token_hash) {
        socket.join(`session:${sessionId}:gm`);
        console.log(`${playerId} joined GM room for session:${sessionId}`);
      }
    }
    // Replay any active legislative votes so players who refresh don't miss them.
    const activeVotes = gameService.getActivePendingVotes(sessionId);
    for (const v of activeVotes) {
      socket.emit('legislative_vote_requested', v as any);
    }
    console.log(`${playerId} joined session:${sessionId}`);
  });

  socket.on('gm_advance_phase', ({ sessionId }) => {
    try {
      gameService.advancePhase(sessionId);
    } catch (err) {
      socket.emit('error', { code: 500, message: String(err) });
    }
  });

  socket.on('submit_action', ({ type, content }) => {
    // Identify the player from the socket's joined rooms.
    const sessionId = [...socket.rooms].find(r =>
      r.startsWith('session:') && !r.includes(':gm')
    )?.replace('session:', '');
    if (!sessionId) return;

    // Look up player name/party/region from DB using playerId stored on socket.
    const playerId = (socket as any)._playerId as string | undefined;
    const player = playerId
      ? (db.prepare('SELECT name, party, region FROM players WHERE id = ?').get(playerId) as
          { name: string; party: string; region: string } | undefined)
      : undefined;

    gameService.submitAction(
      sessionId,
      player?.name   ?? 'Unknown',
      player?.party  ?? 'Unknown',
      player?.region ?? 'Unknown',
      type, content,
    );
  });

  socket.on('gm_set_national_status', ({ sessionId, financial, social, foreign }) => {
    try {
      gameService.setNationalStatus(sessionId, financial, social, foreign);
    } catch (err) {
      socket.emit('error', { code: 500, message: String(err) });
    }
  });

  socket.on('gm_accept_action', ({ sessionId, actionId, type, content }) => {
    try { gameService.acceptAction(sessionId, actionId, type, content); }
    catch (err) { socket.emit('error', { code: 500, message: String(err) }); }
  });

  socket.on('gm_dismiss_action', ({ sessionId, actionId }) => {
    gameService.dismissAction(sessionId, actionId);
  });

  socket.on('submit_action_vote', ({ actionId, vote }) => {
    const sessionId = [...socket.rooms].find(
      r => r.startsWith('session:') && !r.includes(':gm')
    )?.replace('session:', '');
    if (sessionId) gameService.recordActionVote(sessionId, actionId, (socket as any)._playerId ?? socket.id, vote);
  });

  socket.on('gm_close_action_vote', ({ sessionId, actionId, leanOverrides }) => {
    try { gameService.closeActionVote(sessionId, actionId, leanOverrides); }
    catch (err) { socket.emit('error', { code: 500, message: String(err) }); }
  });

  socket.on('gm_confirm_stat_roll', ({ sessionId, actionId, stat, target, delta, reason }) => {
    try { gameService.confirmStatRoll(sessionId, actionId, stat, target, delta, reason); }
    catch (err) { socket.emit('error', { code: 500, message: String(err) }); }
  });

  socket.on('gm_set_visibility', ({ sessionId, settings }) => {
    gameService.setVisibility(sessionId, settings);
  });

  (socket as any).on('gm_start_bill_vote', ({ sessionId, billId }: {sessionId:string;billId:string}) => {
    gameService.startBillVote(sessionId, billId);
  });

  socket.on('disconnect', () => {
    console.log('client disconnected:', socket.id);
  });
});

// ── Static file serving (production only) ─────────────────────────────────
// The SvelteKit build is copied next to the server by the build script.
// In dev, Vite handles the client; this block is a no-op if the dir is absent.
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  // SPA fallback — serve index.html for every non-API route.
  // Using app.use() avoids the Express 5 wildcard (* → /{*path}) requirement.
  app.use((req, _res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
    _res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  // Signal to any parent process (e.g. Electron) that we are ready.
  if (process.send) process.send('ready');
});
