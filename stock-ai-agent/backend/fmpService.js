const axios = require("axios")

const key = process.env.FMP_API_KEY

async function getFundamentals(symbol) {
  try {

    const ratios = await axios.get(
      `https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${key}`
    )

    const profile = await axios.get(
      `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${key}`
    )

    return {
      roe: ratios.data?.[0]?.returnOnEquityTTM,
      debt: ratios.data?.[0]?.debtEquityRatioTTM,
      pe: ratios.data?.[0]?.priceEarningsRatioTTM,
      sector: profile.data?.[0]?.sector,
      revenueGrowth: profile?.revenueGrowth ?? null
    }

  } catch (e) {
    console.log("FMP error for", symbol, e.message)

    // Always return safe object
    return empty
  }
}

module.exports = {
  getFundamentals
}