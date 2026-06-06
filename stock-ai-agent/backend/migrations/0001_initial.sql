-- StockPulse AI — initial schema
-- Generated: 2026-06-06
-- Apply manually in Supabase dashboard SQL editor
-- Tables are CREATE IF NOT EXISTS for idempotency
--
-- Run this before 0002_router_metadata.sql and 0003_token_usage.sql,
-- which alter/extend these base tables.

CREATE TABLE IF NOT EXISTS conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  last_symbol text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('user', 'assistant')),
  content          text NOT NULL,
  router_metadata  jsonb DEFAULT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_router_intent
  ON messages ((router_metadata->>'intent'))
  WHERE router_metadata IS NOT NULL;

-- token_usage — defined in 0003_token_usage.sql.
-- Confirm 0003 has been applied to this project; if not, run it after this file.
CREATE TABLE IF NOT EXISTS token_usage (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid REFERENCES conversations(id) ON DELETE CASCADE,
  message_id       uuid REFERENCES messages(id)      ON DELETE CASCADE,
  user_id          uuid NOT NULL,
  provider         text NOT NULL,
  model            text NOT NULL,
  purpose          text NOT NULL,
  input_tokens     integer NOT NULL DEFAULT 0,
  output_tokens    integer NOT NULL DEFAULT 0,
  approximate      boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_user_id    ON token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage(created_at);
