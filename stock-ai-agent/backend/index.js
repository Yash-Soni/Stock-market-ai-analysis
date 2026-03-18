require("dotenv").config()

const express = require("express")
const axios = require("axios")
const Groq = require("groq-sdk")
const fs = require("fs")
const memory = require("./memory")
const zerodha = require("./zerodha")
const portfolioSvc = require("./portfolioService")

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

// app.use(cors({
//   origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
//   methods: ["GET", "POST", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization", "Accept"],
//   credentials: true,
//   optionsSuccessStatus: 204,
// }))

app.use(cors({ origin: "*" }))
app.use(express.json())

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
    { timeout: 15000 }
  )
  
  if (response.data.error) {
    throw new Error(response.data.error)
  }

  return response.data
}

async function getFundamentals(symbol) {
  const response = await axios.get(
    `${TA_BASE_URL}/fundamentals?symbol=${symbol}`,
    { timeout: 15000 }
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

async function classifyIntent(message) {

  const intentCheck =
    await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
            Classify the user's intent into one of:

            1. STOCK
            2. PORTFOLIO
            3. MARKET
            4. GENERAL

            MARKET includes:
            - NIFTY
            - SENSEX
            - Smallcap
            - Midcap
            - Sector indices
            - S&P 500
            - NASDAQ

            Reply ONLY with one word.
          `
        },
        {
          role: "user",
          content: message
        }
      ]
    })

  return intentCheck
    .choices[0]
    .message
    .content
    .trim()
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

function getMFOverlap(symbol) {

  const overlapFunds = []

  for (let fund in mfHoldings) {
    if (mfHoldings[fund].includes(symbol)) {
      overlapFunds.push(fund)
    }
  }

  return overlapFunds
}

const analyzeStock = async (symbol, message, portfolio) => {
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
        ...memory.getHistory(),
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

            MF Overlap: ${
              mfOverlap
                ? `Yes, held via: ${mfOverlap.join(", ")}`
                : "No"
            }
          `
        }
      ]
    })

    // Store user message
    memory.addMessage({
      role: "user",
      content: message
    })

    // Store AI response
    memory.addMessage({
      role: "assistant",
      content: completion.choices[0].message.content
    })    

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

app.post("/chat", async (req, res) => {
  try {

    let { message } = req.body

    const intent = await classifyIntent(message)
    console.log('intent', intent);

    // ---------------- PORTFOLIO ----------------
    if (intent === "PORTFOLIO") {

      const weights =
        await portfolioSvc.analyzePortfolioLogic()

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
        reply: completion.choices[0].message.content
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
        `http://127.0.0.1:8000/ta-symbol?symbol=${indexMap[indexSymbol]}`
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

    // ---------------- SYMBOL RESOLUTION ----------------

    let symbols = []

    // 2️⃣ Otherwise extract from message
    if (symbols.length === 0) {
      const entities =
        await extractCompanyEntities(message)

      for (const entity of entities) {

        const resolved =
          await resolveSymbol(entity)
        console.log('resolved symbol', resolved, 'for entity', entity);

        if (resolved) {
          symbols.push({
            entity,
            symbol: resolved
          })
        }
      }
    }

    // 3️⃣ fallback to conversation memory
    if (symbols.length === 0) {

      const last =
        memory.getLastSymbol()

      if (last) {

        symbols.push({
          entity: last,
          symbol: last
        })

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
    memory.setLastSymbol(symbols[0].symbol)

    // ---------------- PORTFOLIO FETCH ----------------

    let portfolio = null

    try {
      const portfolioRes =
        await axios.get("http://localhost:3000/portfolio")

      portfolio = portfolioRes.data
    } catch {
      portfolio = null
    }

    memory.setLastSymbol(symbols[0].symbol)

    const results =
      await Promise.all(

        symbols.map(s =>
          analyzeStock(
            s.symbol,
            message,
            portfolio
          )
        )
      )

    return res.json({
      analyses: results
    })

  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})

app.get("/world-events", async(req,res)=>{
  try{
    const events = await getMacroEvents()
    res.json(events)
  }catch(err){
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
    res.status(401).json({
      error: "Please connect Zerodha first"
    })
  }
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Server running on port", PORT)
})