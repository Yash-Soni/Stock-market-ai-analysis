const axios = require("axios")
const fs = require("fs")
const path = require("path")

require("dotenv").config({ path: path.join(__dirname, "..", ".env") })

const HTTP_TIMEOUT_MS = 20000

async function loadUS() {

  const res = await axios.get(
    "https://pkgstore.datahub.io/core/nasdaq-listings/nasdaq-listed_csv/data/nasdaq-listed_csv.csv"
  )

  const rows = res.data.split("\n").slice(1)

  return rows.map(r => {

    const [symbol,name] = r.split(",")

    if(!symbol || !name) return null

    return {
      symbol: symbol.trim(),
      name: name.trim(),
      exchange: "NASDAQ"
    }

  }).filter(Boolean)
}

async function loadNYSE() {
  const res = await axios.get(
    "https://ftp.nasdaqtrader.com/SymbolDirectory/otherlisted.txt",
    { timeout: HTTP_TIMEOUT_MS }
  )
  const rows = (res.data || "").split("\n").slice(1)
  return rows
    .filter((r) => r && !r.startsWith("File Creation"))
    .map((r) => {
      const [symbol, name] = r.split("|")
      return { symbol: (symbol || "").trim(), name: (name || "").trim(), exchange: "NYSE" }
    })
    .filter((s) => s.symbol && s.name)
}

async function loadNSE() {
  const res = await axios.get(
    "https://archives.nseindia.com/content/equities/EQUITY_L.csv",
    { timeout: HTTP_TIMEOUT_MS }
  )
  const rows = (res.data || "").split("\n").slice(1)
  return rows
    .map((r) => {
      const [symbol, name] = (r || "").split(",")
      return { symbol: `${(symbol || "").trim()}.NS`, name: (name || "").trim(), exchange: "NSE" }
    })
    .filter((s) => s.symbol && s.name)
}


async function loadFMPUS() {
  const key = process.env.FMP_API_KEY
  if (!key) return []
  const res = await axios.get(
    `https://financialmodelingprep.com/api/v3/stock/list?apikey=${key}`,
    { timeout: HTTP_TIMEOUT_MS }
  )
  const list = res.data || []
  // Keep only US-exchange stocks (no suffix, exchange is NASDAQ/NYSE/AMEX/NYSEArca etc.)
  const US_EXCHANGES = new Set(["NASDAQ", "NYSE", "AMEX", "NYSEArca", "NYSEARCA", "NasdaqGS", "NasdaqGM", "NasdaqCM"])
  return list
    .filter((s) => s.symbol && s.name && !s.symbol.includes(".") && US_EXCHANGES.has(s.exchangeShortName))
    .map((s) => ({ symbol: s.symbol, name: s.name, exchange: s.exchangeShortName }))
}

async function build() {
  const outPath = path.join(__dirname, "..", "data", "symbols.json")

  const tryLoad = async (name, fn) => {
    try {
      return await fn()
    } catch (e) {
      const msg = e.code === "ETIMEDOUT" ? "connection timed out" : (e.message || String(e))
      console.warn(`${name}: failed (${msg}). Skipping.`)
      return []
    }
  }

  // Always run NSE + FMP US in parallel — free NASDAQ/NYSE sources are unreliable
  const [nse, fmpUS] = await Promise.all([
    tryLoad("NSE", loadNSE),
    tryLoad("FMP-US", loadFMPUS),
  ])

  // Deduplicate by symbol — NSE takes priority for .NS symbols
  const seen = new Set()
  const symbols = []
  for (const s of [...nse, ...fmpUS]) {
    if (s.symbol && !seen.has(s.symbol)) {
      seen.add(s.symbol)
      symbols.push(s)
    }
  }

  if (symbols.length === 0) {
    console.error("Could not fetch any symbols. Check network or FMP_API_KEY in backend/.env")
    process.exit(1)
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(symbols, null, 2))
  const nseCount = symbols.filter(s => s.exchange === "NSE").length
  const usCount  = symbols.filter(s => s.exchange !== "NSE").length
  console.log(`Symbols saved: ${symbols.length} total (NSE: ${nseCount}, US: ${usCount}) → ${outPath}`)
}

build().catch((e) => {
  console.error("Error:", e.code === "ETIMEDOUT" ? "Connection timed out. Try another network or use FMP_API_KEY." : e.message)
  process.exit(1)
})