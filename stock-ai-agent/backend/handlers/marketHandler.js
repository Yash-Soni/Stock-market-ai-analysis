'use strict'

const { getGroqClient, MODEL } = require('../services/groqClient')
const { llmCall, handlerDispatch } = require('../lib/logger')
const { countTokens } = require('../lib/tokenCounter')
const { compute }    = require('../services/pythonClient')
const { getFundamentals } = require('../services/pythonClient')
const { buildComprehensivePrompt, buildComprehensiveDataBlock } = require('../prompts/comprehensivePrompt')
const { getMacroEvents } = require('../services/macroEvents')
const { handleClarify } = require('./clarifyHandler')

const INDEX_MAP  = require('../indexMap')
const INDEX_EXPAND = [
  'rsi', 'ema_20', 'ema_50', 'macd', 'atr',
  'volume_avg_20', 'support_resistance', '52_week_range'
]

function _buildMacroSummary(events) {
  if (!Array.isArray(events) || events.length === 0) return 'No major world events detected'
  return events.map(e => {
    const bull = e?.sentiment?.bullishSectors ?? e?.bullishSectors ?? []
    const bear = e?.sentiment?.bearishSectors ?? e?.bearishSectors ?? []
    return `Event: ${e.event}\nBullish sectors: ${bull.join(', ')}\nBearish sectors: ${bear.join(', ')}`
  }).join('\n\n')
}

/**
 * Resolves user message to an index Yahoo Finance symbol via indexMap.
 * Returns null if no match.
 */
function _resolveIndexSymbol(message) {
  const normalized = message.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const key = Object.keys(INDEX_MAP).find(k => normalized.includes(k))
  return key ? INDEX_MAP[key] : null
}

/**
 * Handles MARKET intent — broad market index analysis.
 * Uses /compute with full indicator set + comprehensivePrompt.
 * Skips fundamentals section when symbol starts with "^" (index detection).
 *
 * @param {object} routerOutput
 * @param {string|null} userId
 * @param {string|null} conversationId
 * @returns {Promise<object>} analysis_card envelope
 */
async function handleMarket(routerOutput, userId, conversationId) {
  const t0 = Date.now()

  const indexSymbol = _resolveIndexSymbol(routerOutput.user_question)
  if (!indexSymbol) {
    return handleClarify({
      reason:          'ambiguous_message',
      userId,
      conversationId
    })
  }

  const isIndex = indexSymbol.startsWith('^')

  const [computeResult, macroEvents] = await Promise.all([
    compute(indexSymbol, INDEX_EXPAND, {}),
    getMacroEvents()
  ])

  const computed     = computeResult.computed || {}
  const macroSummary = _buildMacroSummary(macroEvents)

  // Indices don't have fundamentals — pass null to skip that section
  const fundamentals = isIndex ? null : await getFundamentals(indexSymbol)

  const score = 0   // no buy/sell scoring for indices
  const risk  = 0

  const systemPrompt = buildComprehensivePrompt(computed, fundamentals ?? {}, macroSummary)
  const dataBlock    = buildComprehensiveDataBlock({
    userQuestion:     routerOutput.user_question,
    computed,
    fundamentals:     fundamentals ?? {},
    score,
    risk,
    mfOverlap:        [],
    sectorAllocation: null
  })

  const llmT0 = Date.now()
  const completion = await getGroqClient().chat.completions.create({
    model:    MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: dataBlock }
    ]
  })
  const llmLatency = Date.now() - llmT0
  const usage      = completion.usage ?? {}

  llmCall({
    provider:               'groq',
    model:                  MODEL,
    purpose:                'market_analysis',
    input_tokens:           usage.prompt_tokens ?? countTokens(systemPrompt + dataBlock).count,
    input_tokens_approximate: !usage.prompt_tokens,
    output_tokens:          usage.completion_tokens ?? countTokens(completion.choices[0].message.content).count,
    output_tokens_approximate: !usage.completion_tokens,
    latency_ms:             llmLatency,
    user_id:                userId,
    conversation_id:        conversationId,
    cached:                 false,
    success:                true
  })

  handlerDispatch({
    user_id:          userId,
    conversation_id:  conversationId,
    handler:          'market',
    response_type:    'analysis_card',
    total_latency_ms: Date.now() - t0
  })

  const close = computed['52_week_range']?.current ?? computed.support_resistance?.current ?? null

  return {
    type:          'analysis_card',
    intent:        'MARKET',
    ticker:        indexSymbol,
    responseStyle: 'comprehensive',
    symbol:        indexSymbol,
    displayName:   Object.keys(INDEX_MAP).find(k => INDEX_MAP[k] === indexSymbol) ?? indexSymbol,
    score,
    risk,
    currency:      'N/A',
    close,
    ...computed,
    macroSummary,
    reply:         completion.choices[0].message.content
  }
}

module.exports = { handleMarket }
