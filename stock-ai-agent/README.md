# StockPulse AI

An AI-powered stock analysis assistant that lets users ask natural language questions about any stock, index, or portfolio and receive a structured, data-driven response backed by live technical indicators, fundamental metrics, and macro context.

---

## What It Does

Users type messages like:

- _"Should I buy Infosys right now?"_
- _"Compare AAPL and TSLA"_
- _"How is my portfolio diversified?"_
- _"What is the NIFTY trend today?"_

The app responds with:

- A **buy confidence score** and **risk score** (0–100)
- Live **technical indicators** — RSI, EMA20, EMA50, MACD Histogram, ATR
- **Fundamental metrics** — PE Ratio, ROE, Debt/Equity, Revenue Growth
- **Dividend history** for the past year
- **AI-generated analysis** written in plain language (trend, entry plan, risk note, long-term view)
- **Macro context** — live world events and which sectors they impact
- **Mutual fund overlap** — whether the stock is held in your MF portfolio
- A **price sparkline** chart

Conversation is stateful — the user can ask follow-up questions like _"What about its debt?"_ and the app remembers the last stock discussed.

---

## How It Works

### Architecture

```
User (Browser)
     │
     ▼
Frontend — React + TypeScript (Vercel)
     │  REST API calls with JWT
     ▼
Backend — Node.js + Express (Render)
     │
     ├── Groq LLM (Llama 3.3 70B) — intent classification + analysis generation
     ├── Python TA Service — technical indicators + fundamentals (FastAPI on Render)
     ├── Supabase — auth (magic link) + conversation + message history
     ├── Zerodha KiteConnect — live portfolio holdings (optional, user connects)
     └── NewsAPI + Groq — macro event extraction from live headlines
```

### Request Flow (Stock Analysis)

1. User sends a message via chat UI
2. Frontend attaches the user's JWT and POSTs to `/chat`
3. Backend verifies the JWT via Supabase
4. LLM classifies intent: `STOCK`, `PORTFOLIO`, `MARKET`, or `GENERAL`
5. For `STOCK`:
   - LLM extracts company names from the message
   - Symbol resolver maps company name → ticker (local fuzzy search → Yahoo Finance API fallback)
   - Python TA service fetches 3-month price history and computes RSI, EMA20, EMA50, MACD, ATR, dividends
   - Python service fetches fundamentals (PE, ROE, Debt/Equity, Revenue Growth) via Yahoo Finance
   - Backend computes a buy score and risk score from the indicators
   - Macro events (cached, refreshed every 30 min) are fetched and included as context
   - All of this is passed to the LLM which generates a structured plain-language analysis
6. Response is saved to Supabase (conversation history)
7. Frontend renders analysis cards with scores, indicators, charts, and the AI narrative

### Intent Routing

| Intent | What Happens |
|--------|-------------|
| `STOCK` | Full technical + fundamental + AI analysis per symbol |
| `PORTFOLIO` | Fetches Zerodha holdings, runs sector/weight analysis via LLM |
| `MARKET` | Fetches TA for the relevant index (NIFTY, SENSEX, S&P 500, etc.) |
| `GENERAL` | LLM responds directly with no data fetch |

### Scoring Model

**Buy Confidence Score (0–100)**
- RSI between 40–65: +20
- Close > EMA20: +20
- Close > EMA50: +20
- MACD Histogram > 0: +20
- RSI < 70 (not overbought): +20

**Risk Score (0–100)**
- RSI > 65: +25
- Close < EMA20: +25
- Close < EMA50: +25
- MACD Histogram < 0: +15
- ATR% > 3% (high volatility): +10

**Capital Deployment Rules (AI-generated)**
- ATR% > 3% → initial allocation 20%
- ATR% 1.5–3% → initial allocation 30%
- ATR% < 1.5% → initial allocation 40%
- ROE > 30% with positive revenue growth → increase allocation by up to 10%
- Missing fundamentals → reduce allocation by 10%

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express 5 |
| AI / LLM | Groq API — Llama 3.3 70B Versatile |
| Technical Analysis | Python, FastAPI, pandas-ta, yfinance, yahooquery |
| Auth + Database | Supabase (magic link OTP, PostgreSQL) |
| Broker Integration | Zerodha KiteConnect API |
| News / Macro | NewsAPI + custom headline clustering + Groq |
| Symbol Resolution | Fuse.js (local fuzzy) + Yahoo Finance search API |
| Frontend Deployment | Vercel |
| Backend Deployment | Render |

---

## Key Features

**Multi-symbol queries** — "Compare AAPL and TSLA" runs parallel analysis on both stocks simultaneously.

**Conversation memory** — Last discussed symbol is stored in Supabase. Follow-up questions like "What is its PE?" work without repeating the stock name.

**Macro event awareness** — Live headlines are fetched, clustered by topic, and summarized into market-moving events. The LLM uses these to contextualize analysis (e.g. if oil prices rise, energy stocks are flagged as bullish).

**Mutual fund overlap detection** — Checks if the queried stock appears in a user's MF portfolio, so users understand their total indirect exposure.

**Zerodha integration** — Users can connect their Zerodha account to get portfolio-aware analysis — sector concentration, overexposure warnings, and weighted portfolio health reports.

**Passwordless auth** — Magic link sign-in via email. No passwords stored.

**Rate limiting** — 5 messages per minute per authenticated user on the `/chat` endpoint.

---

## Indian Market Focus

- Symbol resolver prioritizes NSE (`.NS`) and BSE (`.BO`) tickers
- Supports Indian indices: NIFTY 50, SENSEX, NIFTY Smallcap, NIFTY Midcap, all sector indices
- Supports US markets: S&P 500, NASDAQ, individual US stocks
- Currency displayed as INR for Indian stocks, USD for US stocks
- Mutual fund overlap data maintained for Indian MF schemes

---

## Current Limitations

- Zerodha token is session-based — users need to reconnect after a server restart
- Technical analysis requires at least 60 trading days of history; newer listings may show limited data
- Fundamental data availability varies — some Indian mid/small-caps may show "Not Available" for ROE or Debt
- No mobile app — web-only (responsive design supports mobile browsers)
- Analysis is informational only — not SEBI-registered investment advice

---

## User Flow

```
1. User visits the web app
2. Signs in with email magic link (no password)
3. Types a question about any stock in the chat
4. Receives scored analysis with technicals, fundamentals, AI narrative
5. Optionally connects Zerodha to enable portfolio-aware responses
6. Continues the conversation with follow-up questions
```

---

## Environment Setup (for developers)

### Backend (`/backend`)
```
GROQ_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEWS_API_KEY=
FMP_API_KEY=
KITE_API_KEY=
KITE_API_SECRET=
TA_BASE_URL=http://localhost:8000
BACKEND_BASE_URL=http://localhost:3000
PORT=3000
```

### Frontend (`/frontend`)
```
VITE_API_BASE=http://localhost:3000/
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### Python TA Service (`/python-ta-service`)
```bash
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```
