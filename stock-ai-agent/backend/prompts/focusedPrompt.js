'use strict'

// Static rules block — this text is counted for startup_prompt_sizes.
const STATIC_RULES = `You are a precise stock data narrator. A user has asked a specific question about a stock.

Rules you MUST follow without exception:
1. Answer ONLY what the user asked. Do not volunteer unrequested analysis.
2. Use ONLY the numbers in the DATA BLOCK below. Never invent, estimate, or cite values not present.
3. Never recommend buying or selling unless the user explicitly used the words "buy", "sell", or "should I".
4. Write 2 to 4 sentences. No markdown headers. No bullet points. Plain prose only.
5. If a value in the DATA BLOCK is null or missing, say exactly: "I don't have [indicator name] data for [stock name] right now." Do not omit it or approximate.`

/**
 * Builds the system + data block for a focused indicator query.
 * Returns a single system prompt string.
 *
 * @param {string} ticker       — Canonical symbol e.g. "TCS.NS"
 * @param {string} displayName  — Human-readable name e.g. "TCS" (ticker without suffix)
 * @param {object} computed     — { rsi: 52.1, ema_20: 3410.5, ... }
 * @param {string} userQuestion — Original user message
 * @returns {string}
 */
function buildFocusedPrompt(ticker, displayName, computed, userQuestion) {
  const dataBlock = _formatDataBlock(computed, displayName)
  return `${STATIC_RULES}

Stock: ${displayName} (${ticker})
User's question: "${userQuestion}"

DATA BLOCK:
${dataBlock}`
}

/**
 * Formats the computed indicators object into readable "Key: value" lines.
 * Nested objects (bbands, macd, adx, stoch, support_resistance, 52_week_range)
 * are expanded into indented sub-fields.
 */
function _formatDataBlock(computed, displayName) {
  if (!computed || Object.keys(computed).length === 0) {
    return `  (no indicator data available for ${displayName})`
  }

  const LABEL = {
    rsi:               'RSI (14)',
    stoch:             'Stochastic',
    macd:              'MACD',
    cci:               'CCI (14)',
    williams_r:        'Williams %R (14)',
    ema_20:            'EMA 20',
    ema_50:            'EMA 50',
    ema_100:           'EMA 100',
    ema_200:           'EMA 200',
    sma_50:            'SMA 50',
    sma_200:           'SMA 200',
    adx:               'ADX',
    atr:               'ATR (14)',
    bbands:            'Bollinger Bands',
    obv:               'OBV',
    vwap:              'VWAP (20-day rolling)',
    volume_history:    'Volume History (10d)',
    volume_avg_20:     'Volume Average (20d)',
    support_resistance:'Support / Resistance',
    '52_week_range':   '52-Week Range'
  }

  const lines = []
  for (const [key, val] of Object.entries(computed)) {
    const label = LABEL[key] || key
    if (val === null || val === undefined) {
      lines.push(`  ${label}: null`)
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      lines.push(`  ${label}:`)
      for (const [subKey, subVal] of Object.entries(val)) {
        lines.push(`    ${subKey}: ${subVal ?? 'null'}`)
      }
    } else if (Array.isArray(val)) {
      lines.push(`  ${label}: ${JSON.stringify(val)}`)
    } else {
      lines.push(`  ${label}: ${val}`)
    }
  }
  return lines.join('\n')
}

module.exports = { buildFocusedPrompt, STATIC_RULES }
