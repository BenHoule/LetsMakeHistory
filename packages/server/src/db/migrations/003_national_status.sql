-- Migration 003: persist national status and turn snapshot for page-refresh recovery
ALTER TABLE sessions ADD COLUMN national_status TEXT;
