'use strict'

const { db } = require('./client')
const { logger } = require('../lib/logger')

/**
 * Stub for the future summary compression feature.
 * Returns the last 4 messages and last_symbol for a conversation.
 * When summary compression is added in a future phase, this function
 * is the only place that needs to change.
 *
 * @param {string} conversationId
 * @param {string} userId
 * @returns {Promise<{ lastSymbol: string|null, recentMessages: Array<{role,content}> }>}
 */
async function getConversationContext(conversationId, userId) {
  const [convoResult, messagesResult] = await Promise.all([
    db.from('conversations')
      .select('last_symbol')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single(),
    db.from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(4)
  ])

  return {
    lastSymbol:     convoResult.data?.last_symbol ?? null,
    recentMessages: (messagesResult.data || []).map(m => ({ role: m.role, content: m.content }))
  }
}

/**
 * Updates last_symbol in the conversations table.
 * Called only when ticker_source === "explicit" and validation passed.
 *
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} symbol — Canonical exchange-suffixed symbol e.g. "INFY.NS"
 */
async function updateLastSymbol(conversationId, userId, symbol) {
  await db.from('conversations')
    .update({ last_symbol: symbol })
    .eq('id', conversationId)
    .eq('user_id', userId)
}

/**
 * Persists a user message and its router metadata, plus the assistant reply.
 *
 * @param {string} conversationId
 * @param {string} userContent
 * @param {string} assistantContent
 * @param {object} routerMetadata — Full Router output (stored in router_metadata JSONB column)
 */
async function saveMessagePair(conversationId, userContent, assistantContent, routerMetadata) {
  const { error } = await db.from('messages').insert([
    {
      conversation_id: conversationId,
      role:            'user',
      content:         userContent,
      router_metadata: routerMetadata
    },
    {
      conversation_id: conversationId,
      role:            'assistant',
      content:         assistantContent
    }
  ])
  if (error) {
    logger.error({ event: 'save_message_pair_failed', conversation_id: conversationId, db_error: error.message, db_error_code: error.code })
  }
}

module.exports = { getConversationContext, updateLastSymbol, saveMessagePair }
