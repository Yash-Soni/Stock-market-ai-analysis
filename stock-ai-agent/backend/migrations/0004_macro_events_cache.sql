-- Migration 0004: Persistent macro events cache
-- Single-row table (id always 1) — survives Render restarts.
-- Allows at most one Groq call per 30-minute window across all instances.

CREATE TABLE IF NOT EXISTS macro_events_cache (
  id        integer PRIMARY KEY DEFAULT 1,
  events    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  cached_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
