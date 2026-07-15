-- Bills that have been queued (from player legislative actions or GM pre-set NPC bills)
-- but not yet voted on. After a vote the result is stored here.
ALTER TABLE bills ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE bills ADD COLUMN is_amendment INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN queued_at TEXT;
ALTER TABLE bills ADD COLUMN voted_at TEXT;
ALTER TABLE bills ADD COLUMN source_player_id TEXT REFERENCES players(id);

-- Pre-queued narrative content for the next generated turn.
-- Cleared when the GM advances past COMPLETE (i.e. when generateTurn runs).
CREATE TABLE IF NOT EXISTS turn_content (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  type        TEXT NOT NULL, -- 'EVENT' | 'COURT' | 'NPC_BILL'
  content     TEXT NOT NULL,
  party       TEXT,          -- for NPC_BILL: proposing party
  created_at  TEXT NOT NULL
);
