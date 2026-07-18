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

// Candidate paths for invite-settings.json (same order as Electron main process).
// The server reads the file directly so runtime-config works even when the
// server is NOT launched by Electron (e.g. standalone behind Caddy).
function readInviteSettingsFile(): { publicBaseUrl: string; publicPort: number } | null {
  const appData = process.env.APPDATA ?? '';
  const programData = process.env.ProgramData ?? '';
  const userDataFallback = process.env.LMH_USER_DATA ?? '';

  const candidates = [
    programData  ? path.join(programData,  'LetsMakeHistory',          'invite-settings.json') : '',
    userDataFallback ? path.join(userDataFallback, 'invite-settings.json') : '',
    appData      ? path.join(appData,       "Let's Make History",       'invite-settings.json') : '',
    appData      ? path.join(appData,       'lmhistory-app',            'invite-settings.json') : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      const baseUrl = typeof parsed?.publicBaseUrl === 'string' ? parsed.publicBaseUrl.trim() : '';
      const portRaw = Number(parsed?.publicPort);
      const publicPort = Number.isInteger(portRaw) && portRaw > 0 && portRaw <= 65535 ? portRaw : PORT;
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

  // 2. Read invite-settings.json directly (works when running standalone/Caddy).
  const settings = readInviteSettingsFile();
  if (!settings?.publicBaseUrl) return null;

  // Reconstruct a clean URL, injecting publicPort if not already in the URL.
  try {
    const url = new URL(settings.publicBaseUrl);
    if (!url.port) url.port = String(settings.publicPort);
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

  // Seed 18 NPC senators (6 regions × 3 classes)
  const REGIONS = ['Midwest','Mountain','Northeast','South','Southwest','West'];
  const PARTIES: Record<string, string[]> = {
    Midwest:   ['Unionist','Progressive','Whig','Conservative'],
    Mountain:  ['Whig','Unionist','Conservative','Progressive'],
    Northeast: ['Progressive','Unionist','Whig','Conservative'],
    South:     ['Conservative','Whig','Unionist','Progressive'],
    Southwest: ['Whig','Conservative','Unionist','Progressive'],
    West:      ['Progressive','Unionist','Whig','Conservative'],
  };
  for (const region of REGIONS) {
    const parties = PARTIES[region];
    for (let cls = 1; cls <= 3; cls++) {
      const party = parties[(cls - 1) % parties.length];
      db.prepare(
        'INSERT INTO senators (id, session_id, region, party, class, is_player) VALUES (?, ?, ?, ?, ?, 0)'
      ).run(randomUUID(), sessionId, region, party, cls);
    }
  }

  // Seed party approvals (all start at 35)
  const ALL_PARTIES = ['Progressive','Unionist','Whig','Conservative'];
  for (const party of ALL_PARTIES) {
    db.prepare('INSERT INTO party_approvals (id, session_id, party, approval) VALUES (?,?,?,35)')
      .run(randomUUID(), sessionId, party);
  }

  // Seed regional modifiers based on voter-profile rank (rank 1→1.3, 2→1.1, 3→0.9, 4→0.7)
  const RANK_MOD = [1.3, 1.1, 0.9, 0.7];
  for (const [region, ranked] of Object.entries(PARTIES)) {
    ranked.forEach((party, rank) => {
      db.prepare('INSERT INTO regional_modifiers (id,session_id,party,region,modifier) VALUES (?,?,?,?,?)')
        .run(randomUUID(), sessionId, party, region, RANK_MOD[rank]);
    });
  }

  // Seed NPC presidential candidate pool — first 9 election cycles
  const DEFAULT_CANDIDATES = [
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
  ];
  for (const c of DEFAULT_CANDIDATES) {
    db.prepare('INSERT INTO npc_candidates (id,session_id,year,party,name) VALUES (?,?,?,?,?)')
      .run(randomUUID(), sessionId, c.year, c.party, c.name);
  }

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
