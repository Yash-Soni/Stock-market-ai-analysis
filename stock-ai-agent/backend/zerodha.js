const zerodhaService = require("./zerodha.service")

function login(req, res) {
  const loginUrl = zerodhaService.getLoginURL()
  res.redirect(loginUrl)
}

function status(req, res) {
  res.json({ connected: zerodhaService.isConnected() })
}

async function callback(req, res) {
  const { request_token } = req.query
  try {
    await zerodhaService.generateSession(request_token)
    res.send("Zerodha Connected!")
  } catch (err) {
    console.error("[Zerodha] callback error:", err.message)
    res.status(500).json({ error: "Failed to complete Zerodha login. Please try again." })
  }
}

async function getPortfolio(req, res) {
  try {
    const holdings = await zerodhaService.getHoldings()
    res.json(holdings)
  } catch (err) {
    if (err.code === "ZERODHA_NOT_CONNECTED" || err.code === "ZERODHA_SESSION_EXPIRED") {
      return res.status(401).json({ error: err.message })
    }
    console.error("[Zerodha] getPortfolio error:", err.message)
    res.status(500).json({ error: "Failed to fetch portfolio. Please try again." })
  }
}

function disconnect(req, res) {
  zerodhaService.clearSession()
  res.json({ disconnected: true })
}

module.exports = { login, callback, getPortfolio, disconnect, status }
