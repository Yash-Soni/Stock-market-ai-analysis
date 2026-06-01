const KiteConnect = require("kiteconnect").KiteConnect

const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY })

let accessToken = null

function isConnected() {
  return !!accessToken
}

function getLoginURL() {
  return kc.getLoginURL()
}

async function generateSession(requestToken) {
  const session = await kc.generateSession(requestToken, process.env.KITE_API_SECRET)
  accessToken = session.access_token
  kc.setAccessToken(accessToken)
  return session
}

async function getHoldings() {
  if (!accessToken) {
    const err = new Error("Zerodha session expired. Please reconnect.")
    err.code = "ZERODHA_NOT_CONNECTED"
    throw err
  }
  try {
    return await kc.getHoldings()
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      accessToken = null
      const sessionErr = new Error("Zerodha session expired. Please reconnect.")
      sessionErr.code = "ZERODHA_SESSION_EXPIRED"
      throw sessionErr
    }
    throw err
  }
}

function clearSession() {
  accessToken = null
}

module.exports = { isConnected, getLoginURL, generateSession, getHoldings, clearSession }
