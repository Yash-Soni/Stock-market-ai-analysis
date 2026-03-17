const Fuse = require("fuse.js")
const axios = require("axios")
const fs = require("fs")
const path = require("path")

const SYMBOL_PATH = path.resolve("./data/symbols.json")

// ---------- Load Symbols ----------
let symbols = JSON.parse(
  fs.readFileSync(SYMBOL_PATH, "utf-8")
)

// ---------- Fuse Search ----------
let fuse = new Fuse(symbols, {
  keys: [
    { name: "name", weight: 0.5 },
    { name: "symbol", weight: 0.5 }
  ],
  threshold: 0.3,
  ignoreLocation: true
})

// ---------- Cache ----------
const cache = new Map()

// ---------- Helper: Normalize Query ----------
function normalize(query) {
  return query
    .toUpperCase()
    .replace(/LTD|LIMITED|INC|CORP|PLC/gi, "")
    .trim()
}

// ---------- Append New Symbol ----------
function appendSymbol(entry) {

  symbols.push(entry)

  fs.writeFileSync(
    SYMBOL_PATH,
    JSON.stringify(symbols, null, 2)
  )

  // rebuild fuse index
  fuse = new Fuse(symbols, {
    keys: [
      { name: "name", weight: 0.7 },
      { name: "symbol", weight: 0.3 }
    ],
    threshold: 0.3,
    ignoreLocation: true
  })

  console.log("Added symbol to dataset:", entry.symbol)
}

function formatSymbol(entry) {
  if (entry.exchange === "NSE" && !entry.symbol.endsWith(".NS")) {
    return entry.symbol + ".NS"
  }

  if (entry.exchange === "BSE" && !entry.symbol.endsWith(".BO")) {
    return entry.symbol + ".BO"
  }

  return entry.symbol
}

// ---------- Resolver ----------
async function resolveSymbol(query) {

  if (!query) return null

  const normalized = normalize(query)

  // 1️⃣ CACHE
  if (cache.has(normalized)) {
    console.log("Cache hit:", normalized)
    return cache.get(normalized)
  }

  // 2️⃣ EXACT SYMBOL MATCH
  const exactSymbol = symbols.find(s =>
    s.symbol.replace(".NS","") === normalized ||
    s.symbol === normalized
  )

  if (exactSymbol) {

    cache.set(normalized, exactSymbol.symbol)

    console.log("Exact symbol match:", exactSymbol.symbol)

    return formatSymbol(exactSymbol)
  }

  // 3️⃣ EXACT COMPANY NAME MATCH
  const exactName = symbols.find(s =>
    normalize(s.name) === normalized
  )

  if (exactName) {

    cache.set(normalized, exactName.symbol)

    console.log("Exact name match:", exactName.symbol)

    return formatSymbol(exactName)
  }

  // 4️⃣ STARTS WITH MATCH
  const startsWith = symbols.find(s =>
    normalize(s.name).startsWith(normalized)
  )

  if (startsWith) {

    cache.set(normalized, startsWith.symbol)

    console.log("Starts-with match:", startsWith.symbol)

    return formatSymbol(startsWith)
  }

  // 5️⃣ API FALLBACK (try internet search before local fuzzy, so we get live tickers e.g. REITs)
  const apiQueries = [query]
  if (/\bREIT(S)?\b/i.test(query)) {
    const firstWord = query.trim().split(/\s+/)[0]
    if (firstWord) apiQueries.push(`${firstWord} REIT`, `${firstWord} Office Parks`)
  }

  for (const searchQuery of apiQueries) {
    try {

      const res = await axios.get(
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchQuery)}`,
        { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }
      )

      const quotes = res.data?.quotes || []
      const equity = quotes.find(q => q.quoteType === "EQUITY")
        || quotes.find(q => ["ETF", "FUND"].includes(q.quoteType))
        || quotes[0]

      if (equity?.symbol) {

        const newEntry = {
          symbol: equity.symbol,
          name: equity.shortname || equity.longname || query,
          exchange: equity.exchange || "UNKNOWN"
        }

        appendSymbol(newEntry)

        cache.set(normalized, equity.symbol)

        console.log("Resolved via API:", equity.symbol, "(query:", searchQuery + ")")

        return equity.symbol
      }

    } catch (err) {
      console.log("Symbol API error:", err.message)
    }
  }

  // 5.5️⃣ FIRST-WORD CONTAINS (e.g. "Embassy Reits" → "Embassy Developments Limited" when API returns nothing)
  const firstWord = normalized.split(/\s+/)[0]
  if (firstWord && firstWord.length >= 2) {
    const queryHasReit = /\bREIT\b/.test(normalized)
    const candidates = symbols.filter(s => {
      const n = normalize(s.name)
      return n.includes(firstWord)
    })
    const best = queryHasReit
      ? candidates.find(s => /REIT/i.test(s.name)) || candidates[0]
      : candidates[0]
    if (best) {
      cache.set(normalized, best.symbol)
      console.log("First-word contains match:", best.symbol)
      return formatSymbol(best)
    }
  }

  // 6️⃣ FUZZY SEARCH (local fallback when API fails or returns nothing)
  const fuzzy = fuse.search(query, { limit: 3 })

  if (fuzzy.length) {

    const best = fuzzy[0].item

    cache.set(normalized, best.symbol)

    console.log("Fuzzy match:", best.symbol)

    return formatSymbol(best)
  }

  return null
}

module.exports = { resolveSymbol }