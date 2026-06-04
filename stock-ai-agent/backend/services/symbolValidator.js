'use strict'

const fs = require('fs')
const path = require('path')

const STOPWORDS = new Set([
  'yes', 'no', 'ok', 'okay', 'sure', 'this', 'that', 'it', 'its', 'them',
  'these', 'those', 'what', 'how', 'why', 'when', 'where', 'who',
  'maybe', 'perhaps', 'thanks', 'thank', 'please', 'hi', 'hello',
  'bye', 'good', 'great', 'nice', 'fine', 'yep', 'nope', 'nah',
  'yea', 'yeah', 'hmm', 'hm', 'oh', 'ah', 'um', 'buy', 'sell',
  'hold', 'analyse', 'analyze', 'tell', 'show', 'give', 'get',
  'and', 'or', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had'
])

const SYMBOL_PATH = path.resolve(__dirname, '../data/symbols.json')
const rawSymbols = JSON.parse(fs.readFileSync(SYMBOL_PATH, 'utf-8'))

// Build a case-insensitive lookup map keyed three ways per entry:
//   1. Uppercase suffixed symbol  e.g. "INFY.NS"
//   2. Uppercase bare symbol      e.g. "INFY"   (only if not already taken)
//   3. Uppercase company name     e.g. "INFOSYS LIMITED"
// Value is always the original entry object so callers can read entry.symbol
// for the canonical exchange-suffixed form.
const symbolsMap = new Map()
for (const entry of rawSymbols) {
  const sym = entry.symbol.toUpperCase()
  symbolsMap.set(sym, entry)

  const bare = sym.replace(/\.(NS|BO)$/, '')
  if (!symbolsMap.has(bare)) symbolsMap.set(bare, entry)

  if (entry.name) symbolsMap.set(entry.name.toUpperCase(), entry)
}

/**
 * Returns true if `ticker` is a non-stopword string of ≥3 chars that
 * exists in symbols.json (checked bare, .NS, and .BO variants).
 * Pure and synchronous — no network calls.
 */
function isValidTicker(ticker) {
  if (!ticker || typeof ticker !== 'string') return false
  const t = ticker.trim()
  if (t.length < 3) return false
  if (STOPWORDS.has(t.toLowerCase())) return false
  const upper = t.toUpperCase()
  return (
    symbolsMap.has(upper) ||
    symbolsMap.has(upper + '.NS') ||
    symbolsMap.has(upper + '.BO')
  )
}

module.exports = { isValidTicker, symbolsMap, STOPWORDS }
