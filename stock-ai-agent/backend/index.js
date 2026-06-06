'use strict'
require("dotenv").config()

const express   = require("express")
const cors      = require("cors")
const { rateLimit, ipKeyGenerator } = require("express-rate-limit")
const { version } = require("./package.json")

const { db }             = require("./services/client")
const { getMacroEvents } = require("./services/macroEvents")
const zerodha            = require("./zerodha")

const { route: routerRoute } = require("./router/router")
const { getConversationContext, updateLastSymbol, saveMessagePair } = require("./services/conversationService")
const { handleStock }     = require("./handlers/stockHandler")
const { handleGeneral }   = require("./handlers/generalHandler")
const { handlePortfolio, handlePortfolioAnalysis } = require("./handlers/portfolioHandler")
const { handleMarket }    = require("./handlers/marketHandler")
const { handleClarify }   = require("./handlers/clarifyHandler")

const { logger, startupPromptSizes } = require("./lib/logger")
const { buildRouterPrompt }  = require("./router/routerPrompt")
const { STATIC_PROMPT: COMP_STATIC } = require("./prompts/comprehensivePrompt")
const { STATIC_RULES: FOCS_STATIC }  = require("./prompts/focusedPrompt")

const app = express()

app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://stock-market-ai-analysis.vercel.app",
    /https:\/\/stock-market-ai-analysis.*\.vercel\.app/,
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  credentials: true,
  optionsSuccessStatus: 204,
}))
app.use(express.json())

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: "Missing authorization token" })
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) return res.status(401).json({ error: "Invalid or expired token" })
  req.user = data.user
  next()
}

const chatLimiter = rateLimit({
  windowMs: 60 * 1000, max: 5,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip),
  handler: (req, res) => res.status(429).json({ error: "Too many requests. You can send 5 messages per minute. Please wait and try again." }),
  standardHeaders: true, legacyHeaders: false,
})

// ── Static routes ─────────────────────────────────────────────────────────────
app.get("/",      (req, res) => res.json({ status: "Backend running" }))
app.get("/health",(req, res) => res.json({ status: "ok", version, timestamp: new Date().toISOString() }))
app.get("/connect/zerodha",  zerodha.login)
app.get("/callback/zerodha", zerodha.callback)
app.get("/portfolio",        zerodha.getPortfolio)
app.get("/disconnect",       zerodha.disconnect)
app.get("/zerodha/status",   zerodha.status)

app.get("/world-events", requireAuth, async (req, res) => {
  try { res.json(await getMacroEvents()) }
  catch { res.status(500).json({ error: "Failed to fetch world events" }) }
})

app.get("/analyze-portfolio", requireAuth, async (req, res) => {
  try { res.json(await handlePortfolioAnalysis(req.user?.id)) }
  catch (err) {
    const isSession = err.message?.includes("reconnect") || err.message?.includes("Not connected")
    res.status(isSession ? 401 : 500).json({ error: isSession ? "Zerodha session expired. Please reconnect." : "Failed to analyze portfolio." })
  }
})

// ── Shared chat dispatch (used by both /chat and /v2/chat) ────────────────────
async function dispatchChat(req, res, isV2) {
  try {
    let { message, conversationId } = req.body
    const userId = req.user?.id
    if (!userId)           return res.status(401).json({ error: "Unauthorized" })
    if (!message?.trim())  return res.status(400).json({ error: "message is required" })

    if (!conversationId) {
      const { data, error } = await db.from("conversations").insert({ user_id: userId }).select().single()
      if (error) throw error
      conversationId = data.id
    }
    const { data: owned } = await db.from("conversations").select("id").eq("id", conversationId).eq("user_id", userId).single()
    if (!owned) return res.status(403).json({ error: "Conversation does not belong to user" })

    const { lastSymbol, recentMessages } = await getConversationContext(conversationId, userId)
    const rOut = await routerRoute(message, lastSymbol, { user_id: userId, conversation_id: conversationId })

    let response
    switch (rOut.intent) {
      case "STOCK_QUERY": response = await handleStock(rOut, lastSymbol, userId, conversationId, recentMessages); break
      case "PORTFOLIO":   response = await handlePortfolio(rOut, userId, conversationId); break
      case "MARKET":      response = await handleMarket(rOut, userId, conversationId); break
      case "GENERAL":     response = await handleGeneral(rOut, userId, conversationId, recentMessages); break
      default: {
        const reason = rOut._unresolved_ticker ? "ticker_not_found" : rOut._fallback_reason ? "ambiguous_message" : "low_confidence"
        response = handleClarify({ reason, rejectedTicker: rOut._unresolved_ticker, lastSymbol, userId, conversationId })
      }
    }

    await saveMessagePair(conversationId, message, response.reply || response.question || "", rOut)
    if (rOut.ticker_source === "explicit" && rOut.ticker) await updateLastSymbol(conversationId, userId, rOut.ticker)

    if (!isV2) {
      res.set("X-Deprecated", "true").set("X-Use-Instead", "/v2/chat")
      return res.json(response.type === "analysis_card"
        ? { analyses: [response], conversationId }
        : { reply: response.reply || response.question, conversationId })
    }
    return res.json({ ...response, conversationId })
  } catch (err) {
    const upstream = err.response?.status ?? err.httpStatus
    const isConnIssue = err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT"
    const isTransient = isConnIssue || upstream === 429 || upstream === 503
    const status = isConnIssue ? 503 : (upstream ?? 500)
    const message = isTransient ? "Technical analysis service is temporarily unavailable. Please try again in a moment." : (err.message || "Something went wrong")
    res.status(status).json({ error: message })
  }
}

// /chat kept for frontend backward-compat; responds with deprecation headers
app.post("/chat",    requireAuth, chatLimiter, (req, res) => dispatchChat(req, res, false))
app.post("/v2/chat", requireAuth, chatLimiter, (req, res) => dispatchChat(req, res, true))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  logger.info({ event: 'server_started', port: PORT })
  startupPromptSizes({ routerPromptText: buildRouterPrompt(null), comprehensivePromptText: COMP_STATIC, focusedPromptText: FOCS_STATIC })
})
