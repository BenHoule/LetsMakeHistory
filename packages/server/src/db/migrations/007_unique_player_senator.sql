-- Migration 007: ensure a senator seat can map to at most one player row
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_unique_senator
ON players(senator_id);
