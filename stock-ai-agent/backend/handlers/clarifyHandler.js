'use strict'

const { handlerDispatch } = require('../lib/logger')

const REASONS = {
  ticker_not_found:   (rejected) =>
    `I couldn't find **${rejected}** in my database. Try the NSE symbol (e.g. INFY, TCS) or the full company name.`,
  followup_no_context: () =>
    `Which stock were you asking about? Please name it directly.`,
  ambiguous_message:  () =>
    `Could you clarify what you'd like to know? For example: "Analyse TCS" or "What is RSI?"`,
  low_confidence:     () =>
    `I wasn't sure what you meant. Did you want to analyse a stock, check your portfolio, or ask a general question?`
}

/**
 * Builds a clarification response envelope. No LLM call — pure deterministic.
 *
 * @param {{
 *   reason: 'ticker_not_found'|'followup_no_context'|'ambiguous_message'|'low_confidence',
 *   rejectedTicker?: string,
 *   lastSymbol?: string|null,
 *   userId: string|null,
 *   conversationId: string|null
 * }} opts
 * @returns {{ type, intent, ticker, responseStyle, question, suggestions, reply }}
 */
function handleClarify({ reason, rejectedTicker, lastSymbol, userId, conversationId }) {
  const t0 = Date.now()

  const reasonFn   = REASONS[reason] ?? REASONS.ambiguous_message
  const question   = reasonFn(rejectedTicker)

  handlerDispatch({
    user_id:         userId,
    conversation_id: conversationId,
    handler:         'clarify',
    response_type:   'clarification',
    total_latency_ms: Date.now() - t0
  })

  return {
    type:          'clarification',
    intent:        'CLARIFY',
    ticker:        null,
    responseStyle: 'clarification_needed',
    question,
    suggestions:   [],  // post-beta — populated in a future phase
    reply:         question
  }
}

module.exports = { handleClarify }
