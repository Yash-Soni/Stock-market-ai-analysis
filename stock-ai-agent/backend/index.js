require("dotenv").config()

const express = require("express")
const axios = require("axios")
const Groq = require("groq-sdk")
const fs = require("fs")
const rateLimit = require("express-rate-limit")
const zerodha = require("./zerodha")
const portfolioSvc = require("./portfolioService")
const { db } = require("./services/client")

const { getMacroEvents } = require("./services/macroEvents")
const { resolveSymbol } = require("./symbolResolver")

const app = express()
const cors = require("cors")

// const portfolio = JSON.parse(
//   fs.readFileSync("./portfolio.json", "utf-8")
// )

const mfHoldings = JSON.parse(
  fs.readFileSync("./mf-portfolio.json", "utf-8")
)

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

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

// app.use(cors({ origin: "*" }))
app.use(express.json())

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ""
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null

  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" })
  }

  const { data, error } = await db.auth.getUser(token)

  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired token" })
  }

  req.user = data.user
  next()
}

app.get("/", (req, res) => {
  res.json({ status: "Backend running" })
})

app.get("/connect/zerodha", zerodha.login)
app.get("/callback/zerodha", zerodha.callback)
app.get("/portfolio", zerodha.getPortfolio)
app.get("/disconnect", zerodha.disconnect)
app.get("/zerodha/status", zerodha.status)

const TA_BASE_URL = process.env.TA_BASE_URL || "http://localhost:8000"

async function getTAFromSymbol(symbol) {
  
  const response = await axios.get(
    `${TA_BASE_URL}/ta-symbol?symbol=${symbol}`,
    { timeout: 30000 }
  )
  
  if (response.data.error) {
    throw new Error(response.data.error)
  }

  return response.data
}

async function getFundamentals(symbol) {
  const response = await axios.get(
    `${TA_BASE_URL}/fundamentals?symbol=${symbol}`,
    { timeout: 30000 }
  )

  if (response.data.error) {
    throw new Error(response.data.error)
  }

  return response.data
}

// app.post("/analyze-rsi", async (req, res) => {
//   const { close } = req.body

//   try {
//     const response = await axios.post("http://localhost:8000/rsi", {
//       close
//     })
//     res.json(response.data)
//   } catch (err) {
//     const status = err.response?.status ?? 502
//     const message =
//       err.code === "ECONNREFUSED"
//         ? "Python TA service not running. Start it with: cd python-ta-service && uvicorn app:app --reload --port 8000"
//         : err.message
//     res.status(status).json({ error: message })
//   }
// })

const ALLOWED_INTENTS = ["STOCK", "PORTFOLIO", "MARKET", "GENERAL"]

// Returns { intent, confidence, ticker }
// confidence < 0.7 → routed to GENERAL (safe default)
// ticker → company name/symbol the classifier spotted, null otherwise
async function classifyIntent(message, { lastSymbol = null } = {}) {
  const completion = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `
You are an intent classifier for a stock analysis app. Classify the user message and return a JSON object.

INTENT DEFINITIONS:

STOCK — User asks about a SPECIFIC named company, ticker, or stock.
  Positive examples:
  - "Analyze INFY"                        → STOCK, ticker: "INFY", confidence: 0.99
  - "Should I buy Reliance?"              → STOCK, ticker: "Reliance", confidence: 0.97
  - "Is Tesla overvalued?"                → STOCK, ticker: "Tesla", confidence: 0.97
  - "Target price for TCS?"               → STOCK, ticker: "TCS", confidence: 0.98
  - "Should I sell it?" (follow-up)       → STOCK, ticker: null, confidence: 0.92
  - "Is this a good buy?" (follow-up)     → STOCK, ticker: null, confidence: 0.90
  - "Worth holding?" (follow-up)          → STOCK, ticker: null, confidence: 0.88
  Negative examples (NOT STOCK):
  - "What makes a stock a good buy?"      → GENERAL (concept, no company named)
  - "Is long term investing worth it?"    → GENERAL (concept, not a company)
  - "What is a PE ratio?"                 → GENERAL (definition)

PORTFOLIO — User asks about their OWN personal holdings as a whole.
  Positive examples:
  - "How is my portfolio doing?"          → PORTFOLIO, confidence: 0.97
  - "Am I too concentrated in IT?"        → PORTFOLIO, confidence: 0.90
  - "Rebalance my holdings"               → PORTFOLIO, confidence: 0.97
  Negative examples (NOT PORTFOLIO):
  - "What is portfolio diversification?"  → GENERAL (a concept, not personal holdings)
  - "How do I build a good portfolio?"    → GENERAL (educational question)

MARKET — User asks about a broad market index.
  Positive examples:
  - "Nifty trend today"                   → MARKET, confidence: 0.97
  - "Is S&P 500 overbought?"              → MARKET, confidence: 0.95
  Negative examples (NOT MARKET):
  - "What is the Nifty?"                  → GENERAL (definition, not analysis request)

GENERAL — Conceptual, educational, definitional, greeting, or anything not about a specific named stock/portfolio/index.
  This is the correct category for: finance concepts, investing education, beginner questions,
  how-to questions, comparisons of concepts, greetings, thank-yous.
  Positive examples:
  - "What is long term investing?"        → GENERAL, confidence: 0.99
  - "I'm a beginner, how do I start?"     → GENERAL, confidence: 0.99
  - "Explain RSI to me"                   → GENERAL, confidence: 0.98
  - "What is a PE ratio?"                 → GENERAL, confidence: 0.99
  - "Difference between stocks and bonds?"→ GENERAL, confidence: 0.98
  - "What is SIP?"                        → GENERAL, confidence: 0.99
  - "How do I read a balance sheet?"      → GENERAL, confidence: 0.98
  - "Is investing risky?"                 → GENERAL, confidence: 0.97
  - "What is diversification?"            → GENERAL, confidence: 0.99
  - "What is the best investing strategy?"→ GENERAL, confidence: 0.97
  - "What is inflation?"                  → GENERAL, confidence: 0.99
  - "Hello" / "Hi" / "Thanks"            → GENERAL, confidence: 0.99

CRITICAL RULES:
1. If no specific company name or ticker is present, default to GENERAL — never infer a stock from conversation history.
2. Conceptual questions ("what is X", "how does Y work", "explain Z") are ALWAYS GENERAL even if they mention a financial term.
3. Only set confidence > 0.85 for STOCK if a company name or ticker is clearly present in THIS message.
4. For ambiguous cases, lower confidence below 0.7 — they will be safely routed to GENERAL.
5. The ticker field should be the raw company name or ticker from the message, or null if none is present.

Return ONLY this JSON (no markdown, no explanation):
{"intent":"STOCK","confidence":0.95,"ticker":"INFY"}
        `.trim()
      },
      { role: "user", content: message }
    ]
  })

  const raw = completion.choices[0].message.content.trim()

  try {
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    const parsed = JSON.parse(jsonStr)
    const intent = ALLOWED_INTENTS.includes(parsed.intent?.toUpperCase())
      ? parsed.intent.toUpperCase()
      : "GENERAL"
    const confidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5
    const ticker = typeof parsed.ticker === "string" && parsed.ticker.trim()
      ? parsed.ticker.trim()
      : null
    // Low confidence → route to GENERAL rather than guessing
    return { intent: confidence < 0.7 ? "GENERAL" : intent, confidence, ticker }
  } catch {
    // JSON parse failure → safe default
    return { intent: "GENERAL", confidence: 0.5, ticker: null }
  }
}

// async function extractCompanyEntity(message) {

//   const completion = await client.chat.completions.create({
//     model: "llama-3.3-70b-versatile",
//     temperature: 0,
//     messages: [
//       {
//         role: "system",
//         content: `
//           Extract the company, ETF, REIT, or stock name from the user's message.

//           Rules:
//           - Return ONLY the company name or ticker.
//           - Do not include extra words.
//           - If none found return NONE.
//         `
//       },
//       {
//         role: "user",
//         content: message
//       }
//     ]
//   })

//   const entity =
//     completion.choices[0].message.content.trim()

//   if (entity === "NONE")
//     return null

//   return entity
// }

async function extractCompanyEntities(message) {

  const completion = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `
          Extract all company or stock names mentioned.

          Return ONLY a JSON array.

          Example:
          ["Oracle","Rubrik"]

          If only one company exists return:
          ["Tesla"]
        `
      },
      { role: "user", content: message }
    ]
  })

  try {
    return JSON.parse(
      completion.choices[0].message.content
    )
  } catch {
    return []
  }
}

async function handleGeneralQuery(message, chatHistory) {
  const completion = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `
You are a knowledgeable personal finance and investing advisor.

Answer the user's question clearly and helpfully. You may cover:
- Investing concepts and definitions (stocks, bonds, mutual funds, ETFs, SIPs, REITs)
- How financial instruments and markets work
- Beginner guidance and how to get started investing
- Risk management principles and strategies
- General market education and financial literacy

Guidelines:
- Keep answers concise: 3–5 short paragraphs max.
- Use plain, friendly language. Avoid unnecessary jargon.
- Do not fabricate or reference specific stock prices, analyst targets, or real-time data.
- If the user is a beginner, be encouraging and practical.
- If the question is a greeting or thanks, respond warmly and briefly.
- Do NOT analyze any specific stock unless the user explicitly names one in this message.
        `.trim()
      },
      ...chatHistory,
      { role: "user", content: message }
    ]
  })
  return completion.choices[0].message.content
}

function getMFOverlap(symbol) {

  const overlapFunds = []

  for (let fund in mfHoldings) {
    if (mfHoldings[fund].includes(symbol)) {
      overlapFunds.push(fund)
    }
  }

  return overlapFunds
}

const analyzeStock = async (symbol, message, portfolio, chatHistory) => {
  const ta = await getTAFromSymbol(symbol)
  const fundamentals = await getFundamentals(symbol)
  const mfOverlap = getMFOverlap(symbol)
  let score = 0   

  // RSI
  if (ta.rsi > 40 && ta.rsi < 65) score += 20
  // EMA20 Trend
  if (ta.close > ta.ema20) score += 20
  // EMA50 Trend
  if (ta.close > ta.ema50) score += 20
  // MACD Momentum
  if (ta.macd_hist > 0) score += 20
  // Avoid Overbought
  if (ta.rsi < 70) score += 20

  let risk = 0

  // Overbought risk
  if (ta.rsi > 65) risk += 25

  // Weak trend
  if (ta.close < ta.ema20) risk += 25
  if (ta.close < ta.ema50) risk += 25

  // Weak momentum
  if (ta.macd_hist < 0) risk += 15

  let sectorMap = {}
  let sectorAllocation = {}

  if (portfolio) {
    for (let stock in portfolio) {
      const sector = portfolio[stock].sector
      const amt = portfolio[stock].amount

      if (!sectorMap[sector]) {
        sectorMap[sector] = 0
      }

      sectorMap[sector] += amt
    }

    const totalInvestment = Object.values(sectorMap)
      .reduce((a, b) => a + b, 0)


    for (let sector in sectorMap) {
      sectorAllocation[sector] =
        ((sectorMap[sector] / totalInvestment) * 100).toFixed(2)
    }
  }

  // Volatility risk
  const volatility = ta.atr / ta.close

  if (volatility > 0.03) risk += 10

  const macroEvents = await getMacroEvents()

  const macroSummary = macroEvents.length > 0 ? macroEvents.map(e => {

      const bullish = e?.sentiment?.bullishSectors ?? []
      const bearish = e?.sentiment?.bearishSectors ?? []

      return `
        Event: ${e.event}
        Bullish sectors: ${bullish.join(", ")}
        Bearish sectors: ${bearish.join(", ")}
      `

    }).join("\n")
  : "No major world events detected"
  console.log('ta', ta);

  const completion = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `
          You are a professional portfolio manager managing institutional capital.

          When the user asks whether to buy, sell or analyze a stock:

          Do NOT give a simple yes/no answer.

          Evaluate across:

          1. Trend Structure
              - Close vs EMA20
              - EMA20 vs EMA50

            If:
            Close < EMA20 AND Close < EMA50
              → Bearish trend (downtrend intact)
              → Avoid full allocation

            If:
            Close > EMA20 AND EMA20 slope turning positive
              → Trend improvement
              → Possible reversal phase

          2. Momentum
            Use:
              - RSI
              - MACD Histogram

            RSI:
              < 25 → Deep oversold
              30–40 → Early accumulation zone
              > 70 → Overbought

            If:
            MACD improving while trend bearish
              → Momentum recovery inside downtrend

          3. Volatility Risk
              Calculate:
              ATR% = ATR / Close

              ATR% < 1.5% → Low volatility  
              ATR% 1.5–3% → Moderate volatility  
              ATR% > 3% → High volatility  

              Use ATR% for risk assessment.
              Do NOT interpret ATR in absolute terms.

          4. Long-term Investment Quality
              Use:
              - ROE
              - PE Ratio
              - Debt to Equity
              - Revenue Growth

              Interpret ROE as:
              <10% → Weak  
              10–20% → Average  
              20–30% → Strong  
              >30% → Exceptional  

              Treat ROE >30% as strong positive signal.

              Strong fundamentals:
              ROE >20%
              Debt/Equity <0.5
              Positive Revenue Growth

          5. Capital Deployment Rules

              If fundamentals strong but trend weak:
              → Use staggered accumulation.

              ATR-based allocation:

              ATR% >3% → Initial allocation = 20%  
              ATR% 1.5–3% → Initial allocation = 30%  
              ATR% <1.5% → Initial allocation = 40%

              Add:
              30% if RSI <30  
              Final allocation after:
              Close > EMA20 AND EMA20 slope positive

              If ROE > 30% AND Revenue Growth positive:
              → Increase initial allocation by up to 10%
              even in bearish trend.

              Business quality reduces downside persistence.
              Allow slightly higher staggered entry
              for fundamentally strong companies.
              
              If ROE or Debt is unavailable:
              → Reduce initial allocation by an additional 10%.

              Unknown business quality increases uncertainty.
              Lower exposure is recommended.

              Never recommend full allocation in bearish trend.

          ---

          OUTPUT FORMAT (STRICT):

          📊 Decision Summary:
          Trend:
          Momentum:
          Volatility (ATR%):
          Initial Allocation:
          Capital at Risk =
            Initial Allocation exposed if trend continues downward.

            Do NOT calculate Capital at Risk using Risk Score.
            Capital at Risk always equals Initial Allocation.

          Entry Plan:
          - % now
          - % if RSI <30
          - % after EMA20 slope positive

          Risk Note:
          - Trend risk
          - Volatility risk
          - False reversal risk

          Long-term View:
          - Profitability (ROE)
          - Leverage (Debt)
          - Growth

          Evaluate dividend strength:

            - Frequent dividends → stable cash flow
            - High dividend → income stock
            - Irregular dividends → less predictable

            Mention dividend insights in Long-term View.

          If fundamentals strong:
          Recommend SIP-style accumulation.

          Do NOT repeat indicators.
          After the Decision Summary:

          Provide a Layman-Friendly Insight section.

          Explain:
          - Current trend in simple language
          - What the entry plan means in practice
          - Short-term risks in plain terms
          - Long-term outlook based on business strength

          Avoid technical jargon like RSI, EMA, MACD in this section.
          Use simple investor-friendly language.

          Keep the Decision Summary numeric,
          but keep the Insight section descriptive and easy to understand.
          
          Speak as an advisor, not as an analyst.

          Avoid phrases like:
          "Our analysis suggests"
          "Based on the data"
          "This indicates"

          Instead use:
          "You may consider"
          "It may be safer to"
          "A gradual investment approach can help reduce risk"
        `
      },
      {
        role:"system",
        content:`
          Global Macro Context: ${macroSummary}
          Stock Sector: ${fundamentals.sector}
          
          Consider how these events may affect the stock being analyzed.
        `
      },
      ...chatHistory,
      {
        role: "user",
        content: `
          User asked: "${message}"

          RSI: ${ta.rsi}
          EMA20: ${ta.ema20}
          EMA50: ${ta.ema50}
          MACD Histogram: ${ta.macd_hist}
          Close Price: ${ta.close}

          Average Dividend: ${ta.avg_dividend ?? "Not Available"}

          Recent Dividends:
          ${ta.recent_dividends?.map(d => `${d.date}: ${d.amount}`).join("\n") || "None"}

          Buy Confidence Score: ${score} / 100
          Risk Score: ${risk} / 100
          ATR: ${ta.atr}

          ${portfolio ? "Sector Allocation:" : "No connected portfolio"}
          ${portfolio ? JSON.stringify(sectorAllocation) : "N/A"}

          ROE: ${
            fundamentals.roe !== null
              ? fundamentals.roe
              : "Not Available"
          }
          PE Ratio: ${
            fundamentals.pe !== null
              ? fundamentals.pe
              : "Not Available"
          }

          Debt to Equity: ${
            fundamentals.debtToEquity !== null
              ? fundamentals.debtToEquity
              : "Not Available"
          }

          Revenue Growth: ${
            fundamentals.revenueGrowth !== null
              ? fundamentals.revenueGrowth
              : "Not Available"
          }

          ${
            fundamentals.pe == null &&
            fundamentals.roe == null &&
            fundamentals.debtToEquity == null &&
            fundamentals.revenueGrowth == null
              ? "⚠️ No fundamental data is available for this stock from automated sources. In your Long-term View section, explicitly tell the user that PE, ROE, Debt/Equity, and Revenue Growth could not be fetched, and suggest they check Screener.in or Tickertape.in for this data."
              : ""
          }

          MF Overlap: ${
            mfOverlap
              ? `Yes, held via: ${mfOverlap.join(", ")}`
              : "No"
          }
        `
      }
    ]
  })

  // // Store user message
  // memory.addMessage({
  //   role: "user",
  //   content: message
  // })

  // // Store AI response
  // memory.addMessage({
  //   role: "assistant",
  //   content: completion.choices[0].message.content
  // })    

  return {
    symbol,
    score,
    risk,
    currency: ta.currency,
    ...ta,
    pe: fundamentals.pe,
    roe: fundamentals.roe,
    debtToEquity: fundamentals.debtToEquity,
    revenueGrowth: fundamentals.revenueGrowth,
    macroSummary: macroSummary,
    reply: completion.choices[0].message.content
  }
}

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    res.status(429).json({
      error: "Too many requests. You can send 5 messages per minute. Please wait and try again."
    })
  },
  standardHeaders: true,
  legacyHeaders: false,
})

app.post("/chat", requireAuth, chatLimiter, async (req, res) => {
  try {

    let { message, conversationId } = req.body

    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Create conversation if not exists
    if (!conversationId) {
      const { data } = await db
        .from("conversations")
        .insert({ user_id: userId })
        .select()
        .single();

      conversationId = data.id;
      console.log('conversationId', conversationId);
    }

    const { data: ownedConversation } = await db
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .single()
    if (!ownedConversation) {
      return res.status(403).json({ error: "Conversation does not belong to user" })
    }

    // Peek at last_symbol so the intent classifier can prefer STOCK on follow-ups
    const { data: convoForIntent } = await db
      .from("conversations")
      .select("last_symbol")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .single()

    const classification = await classifyIntent(message, {
      lastSymbol: convoForIntent?.last_symbol ?? null
    })
    const { intent, confidence, ticker: classifiedTicker } = classification

    // ---------------- PORTFOLIO ----------------
    if (intent === "PORTFOLIO") {

      let weights
      try {
        weights = await portfolioSvc.analyzePortfolioLogic()
      } catch (err) {
        if (err.message?.includes("reconnect") || err.message?.includes("Not connected")) {
          return res.json({
            reply: "Zerodha session expired. Please reconnect your Zerodha account and try again."
          })
        }
        throw err
      }

      const completion =
        await client.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: `
                You are a portfolio advisor.

                Evaluate:
                - Sector allocation
                - Overexposure
                - Diversification
                - Risk concentration
              `
            },
            {
              role: "user",
              content: `
                Portfolio:
                ${JSON.stringify(weights)}

                User asked:
                ${message}
              `
            }
          ]
        })

      return res.json({
        reply: completion.choices[0].message.content,
        conversationId
      })
    }

    // ---------------- MARKET ----------------
    if (intent === "MARKET") {

      const indexMap = require("./indexMap")

      const normalizedMsg =
        message.toUpperCase().replace(/[^A-Z0-9]/g, "")

      const indexSymbol =
        Object.keys(indexMap)
          .find(k => normalizedMsg.includes(k))

      if (!indexSymbol)
        return res.json({
          reply: "Index not supported yet"
        })

      const ta = await axios.get(
        `${TA_BASE_URL}/ta-symbol?symbol=${indexMap[indexSymbol]}`,
        { timeout: 30000 }
      )

      const completion =
        await client.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "You are a market analyst." },
            {
              role: "user",
              content: `
                Index: ${indexSymbol}

                RSI: ${ta.data.rsi}
                EMA20: ${ta.data.ema20}
                EMA50: ${ta.data.ema50}
                MACD: ${ta.data.macd_hist}

                Analyze overall market trend.
              `
            }
          ]
        })

      return res.json({
        reply: completion.choices[0].message.content
      })
    }

    // ---------------- GENERAL ----------------
    if (intent === "GENERAL") {
      await db.from("messages").insert({
        conversation_id: conversationId,
        role: "user",
        content: message
      })

      const { data: histMsgs } = await db
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(6)

      const chatHistory = (histMsgs || []).map(m => ({ role: m.role, content: m.content }))
      const reply = await handleGeneralQuery(message, chatHistory)

      await db.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: reply
      })

      return res.json({ reply, conversationId })
    }

    // ---------------- SYMBOL RESOLUTION (STOCK) ----------------

    let symbols = []

    // 1️⃣ Use classifier-provided ticker as first candidate (avoids a second LLM call)
    if (classifiedTicker) {
      const resolved = await resolveSymbol(classifiedTicker)
      if (resolved) symbols.push({ entity: classifiedTicker, symbol: resolved })
    }

    // 2️⃣ Extract entities from message when classifier gave no ticker
    if (symbols.length === 0) {
      const entities = await extractCompanyEntities(message)

      for (const entity of entities) {
        const resolved = await resolveSymbol(entity)
        if (resolved) symbols.push({ entity, symbol: resolved })
      }
    }

    // 3️⃣ Fallback to last_symbol ONLY for genuine follow-ups:
    //    STOCK intent, no named ticker in this message, and classifier was highly confident
    if (symbols.length === 0 && classifiedTicker === null && confidence >= 0.85) {
      const lastSymbol = convoForIntent?.last_symbol
      if (lastSymbol) {
        symbols.push({ entity: lastSymbol, symbol: lastSymbol })
      }
    }

    // 4️⃣ final failure
    if (symbols.length === 0) {

      return res.json({
        reply:
          "I couldn't identify the stock symbol. Try asking like 'Analyze Microsoft' or 'Analyze Reliance'."
      })

    }

    // store last symbol for context
    await db
      .from("conversations")
      .update({ last_symbol: symbols[0].symbol })
      .eq("id", conversationId)
      .eq("user_id", userId);

    // ---------------- PORTFOLIO FETCH ----------------

    let portfolio = null

    const BACKEND_BASE = process.env.BACKEND_BASE_URL || process.env.API_BASE || "http://localhost:3000"
    try {
      const portfolioRes =
        await axios.get(`${BACKEND_BASE}/portfolio`, { timeout: 8000 })

      portfolio = portfolioRes.data
    } catch {
      portfolio = null
    }

    await db.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: message
    });

    const { data: messages } = await db
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(6); // last 6 messages only

    const chatHistory = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const results =
      await Promise.all(
        symbols.map(s =>
          analyzeStock(
            s.symbol,
            message,
            portfolio,
            chatHistory
          )
        )
      )

    await db.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: results.map(r => r.reply).join("\n\n")
    });

    return res.json({
      analyses: results,
      conversationId
    })

  } catch (err) {
    const isAxiosErr = err.response != null || err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT"
    const status = err.response?.status ?? (isAxiosErr ? 503 : 500)
    const message = isAxiosErr && (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT")
      ? "Technical analysis service is unavailable. If deployed, set TA_BASE_URL to your Python TA service URL."
      : (err.message || "Something went wrong")
    res.status(status).json({ error: message })
  }
})

app.get("/world-events", async(req,res)=>{
  try{
    const events = await getMacroEvents()
    console.log("[/world-events] sending", events.length, "event(s) to client")
    res.json(events)
  }catch(err){
    console.error("[/world-events] error:", err.message)
    res.status(500).json({
      error:"Failed to fetch world events"
    })
  }
})

app.get("/analyze-portfolio", async (req, res) => {
  try {
    const weights =
      await portfolioSvc.analyzePortfolioLogic()

    // Portfolio Averages
    const avgROE =
    weights.reduce(
      (sum, s) => sum + (s.roe || 0), 0
    ) / weights.length

    const avgDebt =
    weights.reduce(
      (sum, s) => sum + (s.debt || 0), 0
    ) / weights.length

    // Sector Allocation Map
    const sectorMap = {}

    weights.forEach(s => {
    if (!sectorMap[s.sector])
      sectorMap[s.sector] = 0

    sectorMap[s.sector] +=
      parseFloat(s.weight)
    })

    const completion =
      await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `
              You are a portfolio advisor.
              Analyze allocation risk and diversification.
            `
          },
          {
            role: "user",
            content: `
              Portfolio Metrics:

              Average ROE:
              ${avgROE.toFixed(2)}

              Average Debt:
              ${avgDebt.toFixed(2)}

              Sector Allocation:
              ${JSON.stringify(sectorMap)}

              Holdings:
              ${JSON.stringify(weights)}

              Evaluate:
              - Financial strength
              - Leverage risk
              - Sector concentration
              - Growth vs Value tilt
            `
          }
        ]
      })

    res.json({
      analysis:
        completion.choices[0].message.content
    })

  } catch (e) {
    const isSessionError = e.message?.includes("reconnect") || e.message?.includes("Not connected")
    res.status(isSessionError ? 401 : 500).json({
      error: isSessionError
        ? "Zerodha session expired. Please reconnect."
        : "Failed to analyze portfolio. Please try again."
    })
  }
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Server running on port", PORT)
})