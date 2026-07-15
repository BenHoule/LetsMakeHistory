-- Migration 002: elections support
-- President tracking, senate cycle, election settings, NPC candidate pool
ALTER TABLE sessions ADD COLUMN president_name TEXT NOT NULL DEFAULT 'Theodore Roosevelt';
ALTER TABLE sessions ADD COLUMN president_party TEXT NOT NULL DEFAULT 'Progressive';
ALTER TABLE sessions ADD COLUMN president_elected_year INTEGER NOT NULL DEFAULT 1901;
ALTER TABLE sessions ADD COLUMN president_is_player INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN next_senate_class INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sessions ADD COLUMN crossover_weight REAL NOT NULL DEFAULT 0.4;
ALTER TABLE sessions ADD COLUMN left_lean_bias REAL NOT NULL DEFAULT 0.3;
ALTER TABLE sessions ADD COLUMN pending_nominees TEXT;

CREATE TABLE npc_candidates (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  year       INTEGER NOT NULL,
  party      TEXT NOT NULL,
  name       TEXT NOT NULL,
  UNIQUE(session_id, year, party)
);
