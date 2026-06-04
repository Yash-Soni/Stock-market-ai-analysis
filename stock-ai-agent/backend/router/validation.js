'use strict'

const { INDICATOR_VOCAB } = require('./constants')

const VALID_INTENTS = new Set(['STOCK_QUERY', 'PORTFOLIO', 'MARKET', 'GENERAL', 'CLARIFY'])
const VALID_TICKER_SOURCES = new Set(['explicit', 'followup', 'none'])
const VALID_RESPONSE_STYLES = new Set(['comprehensive', 'focused', 'clarification_needed'])
const VALID_INDICATORS = new Set(INDICATOR_VOCAB)

/**
 * Maps a raw ticker string (as extracted by the LLM or typed by the user)
 * to the canonical exchange-suffixed symbol from symbols.json, or null if
 * not found.
 *
 * Lookup order: exact uppercase → bare+.NS → bare+.BO
 * Returns the entry's `.symbol` field (e.g. "INFY.NS", "MSFT").
 *
 * This is the single source of truth for "user string → backend identifier".
 * Never call the LLM or any network service from this function.
 *
 * @param {string} raw - Raw ticker or company name to look up
 * @param {Map} symbolsMap - The loaded symbols map from symbolValidator
 * @returns {string|null} Canonical symbol or null
 */
function normalizeTicker(raw, symbolsMap) {
  if (!raw || typeof raw !== 'string') return null
  const t = raw.trim().toUpperCase()
  if (t.length < 3) return null

  if (symbolsMap.has(t)) return symbolsMap.get(t).symbol

  const withNS = t + '.NS'
  if (symbolsMap.has(withNS)) return symbolsMap.get(withNS).symbol

  const withBO = t + '.BO'
  if (symbolsMap.has(withBO)) return symbolsMap.get(withBO).symbol

  return null
}

/**
 * Validates the structural shape of a parsed Router output object.
 * Does NOT call the LLM or check symbols.json — shape checks only.
 *
 * @param {object} parsed
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRouterOutput(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, errors: ['output is not a plain object'] }
  }

  const errors = []

  if (!VALID_INTENTS.has(parsed.intent)) {
    errors.push(`invalid intent "${parsed.intent}"`)
  }

  if (!VALID_TICKER_SOURCES.has(parsed.ticker_source)) {
    errors.push(`invalid ticker_source "${parsed.ticker_source}"`)
  }

  if (!VALID_RESPONSE_STYLES.has(parsed.response_style)) {
    errors.push(`invalid response_style "${parsed.response_style}"`)
  }

  if (typeof parsed.is_followup !== 'boolean') {
    errors.push('is_followup must be boolean')
  }

  if (!Array.isArray(parsed.indicators_needed)) {
    errors.push('indicators_needed must be an array')
  } else {
    for (const ind of parsed.indicators_needed) {
      if (!VALID_INDICATORS.has(ind)) {
        errors.push(`unknown indicator "${ind}" — not in INDICATOR_VOCAB`)
      }
    }
  }

  if (parsed.ticker !== null && parsed.ticker !== undefined && typeof parsed.ticker !== 'string') {
    errors.push('ticker must be a string or null')
  }

  if (
    typeof parsed.confidence !== 'number' ||
    parsed.confidence < 0 ||
    parsed.confidence > 1
  ) {
    errors.push('confidence must be a number between 0.0 and 1.0')
  }

  if (typeof parsed.user_question !== 'string') {
    errors.push('user_question must be a string')
  }

  if (!parsed.parameters || typeof parsed.parameters !== 'object' || Array.isArray(parsed.parameters)) {
    errors.push('parameters must be a plain object')
  }

  return { valid: errors.length === 0, errors }
}

module.exports = { normalizeTicker, validateRouterOutput, VALID_INDICATORS }
