'use strict'

const fs   = require('fs')
const path = require('path')
const { handlerDispatch } = require('../lib/logger')
const { searchSymbol } = require('../services/pythonClient')

const CACHE_PATH = path.resolve(__dirname, '../data/resolvedSymbols.json')

function _readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) } catch { return {} }
}
function _writeCache(query, symbol) {
  try {
    const cache = _readCache()
    cache[query.toUpperCase()] = symbol
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
  } catch { /* non-critical */ }
}

const QUESTIONS = {
  ticker_not_found:    (rejected) =>
    `I couldn't find a match for **${rejected}**. Did you mean one of these?`,
  ticker_no_results:   (rejected) =>
    `I couldn't find **${rejected}**. Try the exchange symbol directly (e.g. INFY, AAPL).`,
  followup_no_context: () =>
    `Which stock were you asking about? Please name it directly.`,
  ambiguous_message:   () =>
    `Could you clarify what you'd like to know? For example: "Analyse TCS" or "What is RSI?"`,
  low_confidence:      () =>
    `I wasn't sure what you meant. Did you want to analyse a stock, check your portfolio, or ask a general question?`
}

/**
 * Builds a clarification or symbol_disambiguation response.
 * When reason is 'ticker_not_found', calls /search-symbol on the Python service
 * and returns candidates for the user to pick from (US + Indian exchanges only).
 * Writes the top candidate to data/resolvedSymbols.json for future fast-path lookup.
 */
async function handleClarify({ reason, rejectedTicker, lastSymbol, userId, conversationId }) {
  const t0 = Date.now()

  if (reason === 'ticker_not_found' && rejectedTicker) {
    const candidates = await searchSymbol(rejectedTicker)

    if (candidates.length > 0) {
      _writeCache(rejectedTicker, candidates[0].symbol)

      handlerDispatch({
        user_id: userId, conversation_id: conversationId,
        handler: 'clarify', response_type: 'symbol_disambiguation',
        total_latency_ms: Date.now() - t0
      })

      const question = QUESTIONS.ticker_not_found(rejectedTicker)
      return {
        type:          'symbol_disambiguation',
        intent:        'CLARIFY',
        ticker:        null,
        responseStyle: 'clarification_needed',
        query:         rejectedTicker,
        candidates,
        question,
        reply:         question
      }
    }

    // Search returned nothing — fall through to plain clarification
    const question = QUESTIONS.ticker_no_results(rejectedTicker)
    handlerDispatch({
      user_id: userId, conversation_id: conversationId,
      handler: 'clarify', response_type: 'clarification',
      total_latency_ms: Date.now() - t0
    })
    return {
      type: 'clarification', intent: 'CLARIFY', ticker: null,
      responseStyle: 'clarification_needed', question, suggestions: [], reply: question
    }
  }

  const question = (QUESTIONS[reason] ?? QUESTIONS.ambiguous_message)()
  handlerDispatch({
    user_id: userId, conversation_id: conversationId,
    handler: 'clarify', response_type: 'clarification',
    total_latency_ms: Date.now() - t0
  })
  return {
    type: 'clarification', intent: 'CLARIFY', ticker: null,
    responseStyle: 'clarification_needed', question, suggestions: [], reply: question
  }
}

module.exports = { handleClarify, _readCache }
