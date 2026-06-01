const fmp = require("./fmpService")
const { getHoldings } = require("./zerodha.service")

async function analyzePortfolioLogic() {
  let holdings
  try {
    holdings = await getHoldings()
  } catch (err) {
    throw new Error(err.message || "Zerodha session expired. Please reconnect.")
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

  const portfolioMetrics = []

  for (const h of weights) {
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

module.exports = { analyzePortfolioLogic }
