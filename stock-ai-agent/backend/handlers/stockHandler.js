'use strict'

const fs   = require('fs')
const path = require('path')

const { getGroqClient, MODEL }   = require('../services/groqClient')
const { llmCall, handlerDispatch, logger } = require('../lib/logger')

async function groqWithRetry(params) {
  return getGroqClient().chat.completions.create(params)
}
const { countTokens }            = require('../lib/tokenCounter')
const { compute, getFundamentals } = require('../services/pythonClient')
const { buildComprehensivePrompt, buildComprehensiveDataBlock } = require('../prompts/comprehensivePrompt')
const { buildFocusedPrompt }     = require('../prompts/focusedPrompt')
const { getMacroEvents }         = require('../services/macroEvents')
const { handleClarify }          = require('./clarifyHandler')
const { getHoldings }            = require('../zerodha.service')

// MF overlap data — loaded once at startup
let mfHoldings = {}
try {
  mfHoldings = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../mf-portfolio.json'), 'utf-8'))
} catch { /* file may not exist in all environments */ }

// full_analysis_bundle expands to these specific indicators.
// Fundamentals are fetched separately via getFundamentals().
const BUNDLE_EXPANSION = [
  'rsi', 'ema_20', 'ema_50', 'macd', 'atr',
  'volume_avg_20', 'support_resistance', '52_week_range', 'price_history'
]

function _getMFOverlap(symbol) {
  const bare = symbol.replace(/\.(NS|BO)$/, '')
  const overlapping = []
  for (const fund in mfHoldings) {
    const holdings = mfHoldings[fund]
    if (Array.isArray(holdings) && (holdings.includes(symbol) || holdings.includes(bare))) {
      overlapping.push(fund)
    }
  }
  return overlapping
}

function _buildMacroSummary(events) {
  if (!Array.isArray(events) || events.length === 0) return 'No major world events detected'
  return events.map(e => {
    const bull = e?.sentiment?.bullishSectors ?? e?.bullishSectors ?? []
    const bear = e?.sentiment?.bearishSectors ?? e?.bearishSectors ?? []
    return `Event: ${e.event}\nBullish sectors: ${bull.join(', ')}\nBearish sectors: ${bear.join(', ')}`
  }).join('\n\n')
}

function _computeScores(computed) {
  const rsi      = computed.rsi
  const ema20    = computed.ema_20
  const ema50    = computed.ema_50
  const macdHist = computed.macd?.histogram
  const atr      = computed.atr
  const close    = computed['52_week_range']?.current ?? computed.support_resistance?.current

  let score = 0
  if (rsi != null && rsi > 40 && rsi < 65) score += 20
  if (close != null && ema20 != null && close > ema20)   score += 20
  if (close != null && ema50 != null && close > ema50)   score += 20
  if (macdHist != null && macdHist > 0)                  score += 20
  if (rsi != null && rsi < 70)                           score += 20

  let risk = 0
  if (rsi != null && rsi > 65)                            risk += 25
  if (close != null && ema20 != null && close < ema20)    risk += 25
  if (close != null && ema50 != null && close < ema50)    risk += 25
  if (macdHist != null && macdHist < 0)                   risk += 15
  if (atr != null && close != null && close > 0 && atr / close > 0.03) risk += 10

  return { score, risk }
}

async function _getPortfolioSectorAllocation() {
  try {
    const holdings = await getHoldings()
    if (!holdings?.length) return null

    const sectorMap = {}
    let total = 0
    for (const h of holdings) {
      const value  = h.quantity * h.last_price
      const sector = h.sector || 'Unknown'
      sectorMap[sector] = (sectorMap[sector] || 0) + value
      total += value
    }
    if (total === 0) return null
    const allocation = {}
    for (const sector in sectorMap) {
      allocation[sector] = ((sectorMap[sector] / total) * 100).toFixed(2)
    }
    return allocation
  } catch {
    return null  // Zerodha not connected or session expired — graceful degradation
  }
}

/**
 * Handles STOCK_QUERY intent.
 *
 * @param {object} routerOutput
 * @param {string|null} lastSymbol  — From DB (e.g. "INFY.NS")
 * @param {string|null} userId
 * @param {string|null} conversationId
 * @param {Array<{role,content}>} chatHistory — Last 4 messages
 * @returns {Promise<object>} analysis_card or focused_answer envelope
 */
async function handleStock(routerOutput, lastSymbol, userId, conversationId, chatHistory) {
  const t0 = Date.now()

  // ── 1. Resolve ticker ───────────────────────────────────────────────────
  let ticker = null
  if (routerOutput.ticker_source === 'explicit') {
    ticker = routerOutput.ticker   // canonical, already validated by router
  } else if (routerOutput.ticker_source === 'followup') {
    ticker = lastSymbol
  }

  if (!ticker) {
    return await handleClarify({
      reason:          'followup_no_context',
      lastSymbol,
      userId,
      conversationId
    })
  }

  const displayName = ticker.replace(/\.(NS|BO)$/, '')
  const isComprehensive = routerOutput.response_style === 'comprehensive'

  // ── 2. Build indicator list ─────────────────────────────────────────────
  let indicators = (routerOutput.indicators_needed || []).slice()
  if (indicators.includes('full_analysis_bundle')) {
    indicators = BUNDLE_EXPANSION
  }
  if (indicators.length === 0) indicators = BUNDLE_EXPANSION  // safe default

  // ── 3. Fetch data in parallel ───────────────────────────────────────────
  const computeCtx = { conversation_id: conversationId }
  const fetchPromises = [
    compute(ticker, indicators, routerOutput.parameters || {}, computeCtx),
    getMacroEvents()
  ]
  if (isComprehensive) {
    fetchPromises.push(getFundamentals(ticker, computeCtx))
    fetchPromises.push(_getPortfolioSectorAllocation())
  }

  let computeResult, macroEvents, fundamentals, sectorAllocation
  try {
    const results = await Promise.all(fetchPromises)
    computeResult    = results[0]
    macroEvents      = results[1]
    fundamentals     = results[2] ?? null
    sectorAllocation = results[3] ?? null
  } catch (err) {
    if (err.type === 'TICKER_NOT_FOUND') {
      return await handleClarify({
        reason:          'ticker_not_found',
        rejectedTicker:  displayName,
        userId,
        conversationId
      })
    }
    throw err
  }

  const computed     = computeResult.computed || {}
  const macroSummary = _buildMacroSummary(macroEvents)
  const mfOverlap    = _getMFOverlap(ticker)
  const { score, risk } = _computeScores(computed)
  const close = computed['52_week_range']?.current ?? computed.support_resistance?.current ?? null
  const currency = ticker.endsWith('.NS') || ticker.endsWith('.BO') ? 'INR' : 'USD'

  // ── 4a. Comprehensive response ──────────────────────────────────────────
  if (isComprehensive) {
    const systemPrompt = buildComprehensivePrompt(computed, fundamentals ?? {}, macroSummary)
    const dataBlock    = buildComprehensiveDataBlock({
      userQuestion:     routerOutput.user_question,
      computed,
      fundamentals:     fundamentals ?? {},
      score,
      risk,
      mfOverlap,
      sectorAllocation
    })

    const llmT0 = Date.now()
    const completion = await groqWithRetry({
      model:    MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...(chatHistory || []),
        { role: 'user',   content: dataBlock }
      ]
    })
    const llmLatency = Date.now() - llmT0
    const usage      = completion.usage ?? {}

    llmCall({
      provider:               'groq',
      model:                  MODEL,
      purpose:                'comprehensive_analysis',
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
      handler:          'stock',
      response_type:    'analysis_card',
      total_latency_ms: Date.now() - t0
    })

    return {
      type:        'analysis_card',
      intent:      'STOCK_QUERY',
      ticker,
      displayName,
      responseStyle: 'comprehensive',
      symbol:      ticker,
      score,
      risk,
      currency,
      close,
      rsi:         computed.rsi      ?? null,
      ema20:       computed.ema_20   ?? null,
      ema50:       computed.ema_50   ?? null,
      macd_hist:   computed.macd?.histogram ?? null,
      atr:         computed.atr      ?? null,
      pe:          fundamentals?.pe  ?? null,
      roe:         fundamentals?.roe ?? null,
      debtToEquity: fundamentals?.debtToEquity ?? null,
      revenueGrowth: fundamentals?.revenueGrowth ?? null,
      avg_dividend:      null,
      recent_dividends:  [],
      price_history:     computed.price_history ?? null,
      macroSummary,
      reply:       completion.choices[0].message.content
    }
  }

  // ── 4b. Focused response ────────────────────────────────────────────────
  const systemPrompt = buildFocusedPrompt(ticker, displayName, computed, routerOutput.user_question)

  const llmT0 = Date.now()
  const completion = await groqWithRetry({
    model:    MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: routerOutput.user_question }
    ]
  })
  const llmLatency = Date.now() - llmT0
  const usage      = completion.usage ?? {}

  llmCall({
    provider:               'groq',
    model:                  MODEL,
    purpose:                'focused_narration',
    input_tokens:           usage.prompt_tokens ?? countTokens(systemPrompt).count,
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
    handler:          'stock',
    response_type:    'focused_answer',
    total_latency_ms: Date.now() - t0
  })

  return {
    type:          'focused_answer',
    intent:        'STOCK_QUERY',
    ticker,
    displayName,
    responseStyle: 'focused',
    symbol:        ticker,
    indicators:    computed,
    reply:         completion.choices[0].message.content
  }
}

module.exports = { handleStock }
