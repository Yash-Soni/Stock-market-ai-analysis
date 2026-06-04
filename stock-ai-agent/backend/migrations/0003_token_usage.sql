-- Migration 0003: Token usage tracking table
-- Stores per-message LLM token spend for cost monitoring.
-- Populated by a future aggregation job reading from structured logs.
-- Table is created now so the schema is ready when the job is built.

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

CREATE INDEX IF NOT EXISTS idx_token_usage_user_id   ON token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage(created_at);
