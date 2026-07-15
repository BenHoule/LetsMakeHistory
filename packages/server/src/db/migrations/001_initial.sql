-- 001_initial.sql

CREATE TABLE sessions(
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  turn_index      INTEGER NOT NULL DEFAULT 0,
  year            INTEGER NOT NULL DEFAULT 1901,
  phase           TEXT NOT NULL DEFAULT 'LOBBY',
  class_cycle     INTEGER NOT NULL DEFAULT 1,
  gm_token_hash   TEXT NOT NULL DEFAULT '',
  event_cache     TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE senators (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  region          TEXT NOT NULL,
  party           TEXT NOT NULL,
  class           INTEGER NOT NULL,
  is_player       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE players (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  name            TEXT NOT NULL,
  region          TEXT NOT NULL,
  party           TEXT NOT NULL,
  class           INTEGER NOT NULL,
  senator_id      TEXT NOT NULL REFERENCES senators(id),
  approval        REAL NOT NULL DEFAULT 50.0,
  recognition     REAL NOT NULL DEFAULT 10.0,
  rizz            REAL NOT NULL DEFAULT 0.0
);

CREATE TABLE party_approvals (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  party           TEXT NOT NULL,
  approval        REAL NOT NULL DEFAULT 50.0,
  UNIQUE (session_id, party)
);

CREATE TABLE regional_modifiers (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  party           TEXT NOT NULL,
  region          TEXT NOT NULL,
  modifier        REAL NOT NULL,
  UNIQUE (session_id, party, region)
);

CREATE TABLE turns (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  turn_index      INTEGER NOT NULL DEFAULT 0,
  year            INTEGER NOT NULL DEFAULT 1901,
  rng_seed        INTEGER NOT NULL,
  finalized_at    TEXT,
  UNIQUE (session_id, turn_index)
);

CREATE TABLE events (
  id              TEXT PRIMARY KEY,
  turn_id         TEXT NOT NULL REFERENCES turns(id),
  sequence        INTEGER NOT NULL,
  source_type     TEXT NOT NULL,
  content         TEXT NOT NULL
);

CREATE TABLE bills (
  id              TEXT PRIMARY KEY,
  turn_id         TEXT NOT NULL REFERENCES turns(id),
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  proposing_party TEXT NOT NULL,
  content         TEXT NOT NULL,
  is_npc          INTEGER NOT NULL DEFAULT 1,
  vote_result     TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE votes (
  id            TEXT PRIMARY KEY,
  bill_id       TEXT NOT NULL REFERENCES bills(id),
  senator_id    TEXT NOT NULL REFERENCES senators(id),
  vote          TEXT NOT NULL,
  UNIQUE (bill_id, senator_id)
);

CREATE TABLE stat_deltas (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  turn_id       TEXT NOT NULL REFERENCES turns(id),
  source_type   TEXT NOT NULL,
  source_id     TEXT,
  stat          TEXT NOT NULL,
  target        TEXT NOT NULL,
  delta         REAL NOT NULL,
  size_cat      TEXT NOT NULL,
  reason        TEXT NOT NULL
);

CREATE TABLE headlines (
 id            TEXT PRIMARY KEY,
 turn_id       TEXT NOT NULL REFERENCES turns(id),
 outlet        TEXT NOT NULL,
 headline      TEXT NOT NULL,
 summary       TEXT NOT NULL,
 source_event_id TEXT REFERENCES events(id)
);

CREATE TABLE game_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL REFERENCES sessions(id),
  turn_id      TEXT,
  occurred_at  TEXT NOT NULL,
  actor        TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  payload      TEXT NOT NULL DEFAULT '{}',
  dismissed_at TEXT
);
