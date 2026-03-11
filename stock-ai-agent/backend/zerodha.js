const KiteConnect = require("kiteconnect").KiteConnect

require("dotenv").config()

const apiKey = process.env.KITE_API_KEY
const apiSecret = process.env.KITE_API_SECRET

const kc = new KiteConnect({ api_key: apiKey })

let accessToken = null

function login(req, res) {
  const loginUrl = kc.getLoginURL()
  res.redirect(loginUrl)
}

function status(req, res) {
  res.json({
    connected: !!accessToken
  })
}

async function callback(req, res) {
  const { request_token } = req.query

  const session = await kc.generateSession(
    request_token,
    apiSecret
  )

  accessToken = session.access_token
  kc.setAccessToken(accessToken)

  res.send("Zerodha Connected!")
}

async function getPortfolio(req, res) {
  if (!accessToken) {
    return res.status(401).send("Not connected")
  }

  const holdings = await kc.getHoldings()
  res.json(holdings)
}

function disconnect(req, res) {
  accessToken = null
  res.send("Disconnected")
}

module.exports = {
  login,
  callback,
  getPortfolio,
  disconnect,
  status
}