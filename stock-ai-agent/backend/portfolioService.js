const axios = require("axios")
const fmp = require("./fmpService")
const API_BASE = process.env.VITE_API_BASE || "http://localhost:3000"

async function analyzePortfolioLogic() {
  let holdings = null

  try {
    const response = await axios.get(
      `${API_BASE}portfolio`
    )
    holdings = response.data
  } catch (e) {
    throw new Error("Not connected")
  }

  let totalValue = 0

  const enriched = holdings.map(h => {
    const value = h.quantity * h.last_price
    totalValue += value

    return {
      symbol: h.tradingsymbol,
      value,
      invested: h.quantity * h.average_price
    }
  })

  const weights = enriched.map(h => ({
    symbol: h.symbol,
    weight: ((h.value / totalValue) * 100).toFixed(2),
    invested: h.invested,
    current: h.value
  }))

  let portfolioMetrics = []

  for (let h of weights) {

    const fund = await fmp.getFundamentals(h.symbol)

    portfolioMetrics.push({
      symbol: h.symbol,
      weight: h.weight,
      invested: h.invested,
      current: h.current,
      roe: fund?.roe || 0,
      debt: fund?.debt || 0,
      pe: fund?.pe || 0,
      sector: fund?.sector || "Unknown"
    })
  }

  return portfolioMetrics
}

module.exports = {
  analyzePortfolioLogic
}