-- Migration 0002: Add router_metadata column to messages table
-- Run manually in Supabase SQL Editor before using /v2/chat endpoint.
-- This column stores the full Router output for every user message,
-- enabling Router decision replay when investigating wrong responses.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS router_metadata jsonb DEFAULT NULL;

-- Optional index for filtering by intent (e.g. find all CLARIFY messages)
CREATE INDEX IF NOT EXISTS idx_messages_router_intent
  ON messages ((router_metadata->>'intent'))
  WHERE router_metadata IS NOT NULL;
