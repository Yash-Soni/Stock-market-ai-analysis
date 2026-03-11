const axios = require("axios")

const symbolCache = new Map()

function normalizeQuery(query) {
  let q = query.trim()

  q = q.replace(/\breits\b/i, "REIT")
  q = q.replace(/\betfs\b/i, "ETF")
  q = q.replace(/\bstocks\b/i, "stock")
  q = q.replace(/\bshares\b/i, "share")

  return q
}

function generateQueries(entity) {

  const normalized = normalizeQuery(entity)

  const words = normalized.split(" ")

  return [
    normalized,
    words.slice(0,2).join(" "),
    words[0]
  ].filter(Boolean)
}

function scoreQuote(quote, query) {

  let score = 0
  const q = query.toLowerCase()

  const name =
    (quote.shortname || quote.longname || "").toLowerCase()

  if (name.includes(q)) score += 50

  if (quote.quoteType === "EQUITY") score += 30

  const exchangePriority = {
    "NMS": 20,
    "NAS": 20,
    "NYQ": 20,
    "NSI": 20,
    "NSE": 20,
    "BSE": 15,
    "BOM": 15
  }

  if (exchangePriority[quote.exchange])
    score += exchangePriority[quote.exchange]

  // prefer exchange-qualified symbols
  if (quote.symbol.includes(".")) {
    score += 15
  } else {
    score -= 10
  }

  if (quote.symbol.toLowerCase().includes(q))
    score += 10

  return score
}

async function yahooSearch(query) {

  const res = await axios.get(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`
  )

  console.log("Yahoo raw response for:", query)
  console.log(JSON.stringify(res.data.quotes, null, 2))

  return res.data?.quotes || []
}

async function resolveSymbol(entity) {

  if (!entity) return null

  const key = entity.toLowerCase()

  if (symbolCache.has(key)) {
    console.log("Cache hit:", key)
    return symbolCache.get(key)
  }

  const queries = generateQueries(entity)

  for (const q of queries) {

    try {

      const quotes = await yahooSearch(q)

      if (!quotes.length) continue

      const filtered = quotes.filter(q => {

        if (!q.symbol) return false
      
        const s = q.symbol.toUpperCase()
      
        if (s.includes("-RR")) return false
        if (s.includes("-BE")) return false
        if (s.includes("-BL")) return false
      
        return true
      })

      const ranked =
        filtered
          .map(quote => ({
            ...quote,
            score: scoreQuote(quote, q)
          }))
          .sort((a,b) => b.score - a.score)

      ranked.forEach(r => {
        console.log(
          "Candidate:",
          r.symbol,
          "Exchange:",
          r.exchange,
          "Score:",
          r.score
        )
      })
      const best = ranked[0]

      if (!best?.symbol) continue

      symbolCache.set(key, best.symbol)

      return best.symbol

    } catch {
      continue
    }

  }

  return null
}

module.exports = { resolveSymbol }