'use strict'

const axios = require('axios')
const { pythonCall } = require('../lib/logger')

const TA_BASE_URL = process.env.TA_BASE_URL || 'http://localhost:8000'

// Capabilities are stable for the process lifetime — cache after first fetch.
let _cachedCapabilities = null

/**
 * Returns the list of available indicator names from the Python service.
 * Result is cached in memory — the registry never changes at runtime.
 *
 * @returns {Promise<string[]>}
 */
async function getCapabilities() {
  if (_cachedCapabilities) return _cachedCapabilities
  const res = await axios.get(`${TA_BASE_URL}/capabilities`, { timeout: 10000 })
  _cachedCapabilities = res.data.indicators
  return _cachedCapabilities
}

/**
 * Compute one or more indicators for a ticker via POST /compute.
 *
 * Emits a python_compute_call log event on every call (success or failure).
 *
 * Error types thrown (catch these in handlers):
 *   err.type === 'TICKER_NOT_FOUND'    — Python returned 404
 *   err.type === 'VALIDATION_ERROR'    — Python returned 422 (shouldn't happen if Router is correct)
 *   err.type === 'PYTHON_SERVICE_ERROR' — 5xx or network failure
 *
 * @param {string} ticker        — Canonical exchange-suffixed symbol e.g. "INFY.NS"
 * @param {string[]} indicators  — Names from INDICATOR_VOCAB
 * @param {object} [parameters]  — Optional extra params forwarded to the registry functions
 * @returns {Promise<{ ticker: string, computed: Record<string, any> }>}
 */
async function compute(ticker, indicators, parameters = {}, ctx = {}) {
  const t0 = Date.now()

  try {
    const res = await axios.post(
      `${TA_BASE_URL}/compute`,
      { ticker, indicators, parameters },
      { timeout: 90000 }  // full_analysis_bundle can be slow (fundamentals + dividends)
    )

    const latency_ms        = Date.now() - t0
    const computed          = res.data.computed || {}
    const indicators_returned = Object.keys(computed)
    const null_indicators   = indicators_returned.filter(k => computed[k] === null)

    pythonCall({
      ticker,
      indicators,
      parameters,
      latency_ms,
      success: true,
      indicators_returned,
      null_indicators,
      conversation_id: ctx.conversation_id ?? null
    })

    return res.data
  } catch (err) {
    const latency_ms = Date.now() - t0
    const status     = err.response?.status
    const detail     = err.response?.data?.detail || err.message

    pythonCall({
      ticker,
      indicators,
      parameters,
      latency_ms,
      success: false,
      indicators_returned: [],
      null_indicators: [],
      error: detail,
      conversation_id: ctx.conversation_id ?? null
    })

    const e    = new Error(detail)
    e.httpStatus = status
    e.type     = status === 404 ? 'TICKER_NOT_FOUND'
               : status === 422 ? 'VALIDATION_ERROR'
               : 'PYTHON_SERVICE_ERROR'

    // Include enough context for the handler to build a user-facing message
    e.ticker    = ticker
    e.indicators = indicators
    throw e
  }
}

/**
 * Fetch fundamental data (PE, ROE, D/E, revenue growth) for a ticker.
 * Calls the existing Python GET /fundamentals endpoint (kept until Phase 6).
 * Never throws — returns nulls on error so the analysis can continue.
 *
 * @param {string} ticker — Canonical exchange-suffixed symbol e.g. "INFY.NS"
 * @returns {Promise<{ pe, roe, debtToEquity, revenueGrowth, sector }>}
 */
async function getFundamentals(ticker, ctx = {}) {
  const t0 = Date.now()
  const cid = ctx.conversation_id ?? null
  try {
    const res = await axios.get(`${TA_BASE_URL}/fundamentals`, {
      params: { symbol: ticker },
      timeout: 30000
    })
    const latency_ms = Date.now() - t0
    const data = res.data || {}

    if (data.error) {
      pythonCall({ ticker, indicators: ['fundamentals'], parameters: {}, latency_ms, success: false, indicators_returned: [], null_indicators: [], error: data.error, conversation_id: cid })
      return { pe: null, roe: null, debtToEquity: null, revenueGrowth: null, sector: null }
    }

    pythonCall({ ticker, indicators: ['fundamentals'], parameters: {}, latency_ms, success: true, indicators_returned: ['pe', 'roe', 'debtToEquity', 'revenueGrowth'], null_indicators: [], conversation_id: cid })
    return { pe: data.pe ?? null, roe: data.roe ?? null, debtToEquity: data.debtToEquity ?? null, revenueGrowth: data.revenueGrowth ?? null, sector: data.sector ?? null }
  } catch (err) {
    const latency_ms = Date.now() - t0
    pythonCall({ ticker, indicators: ['fundamentals'], parameters: {}, latency_ms, success: false, indicators_returned: [], null_indicators: [], error: err.message, conversation_id: cid })
    return { pe: null, roe: null, debtToEquity: null, revenueGrowth: null, sector: null }
  }
}

/**
 * Search for up to 3 US (NYSE/NASDAQ) or Indian (NSE/BSE) candidates for a company name.
 * Returns [] on any error so callers can degrade gracefully.
 *
 * @param {string} query - Company name as typed by the user
 * @returns {Promise<Array<{symbol, name, exchange}>>}
 */
async function searchSymbol(query) {
  try {
    const res = await axios.get(`${TA_BASE_URL}/search-symbol`, {
      params: { q: query },
      timeout: 8000
    })
    return res.data.candidates || []
  } catch {
    return []
  }
}

module.exports = { compute, getCapabilities, getFundamentals, searchSymbol }
