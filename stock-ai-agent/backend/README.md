# StockPulse AI — Backend

Node/Express backend for StockPulse AI: routes user chat messages through an
LLM-based intent router, dispatches to handlers (stock/portfolio/market/general),
pulls technical analysis from a Python service, and narrates results via Groq LLMs.

## Architecture

```
Request → requireAuth → Router (intent + ticker resolution)
        → Handler (stock | portfolio | market | general | clarify)
        → Python TA service (/compute, /resolve-symbol) for indicators & chart data
        → LLM narration (comprehensivePrompt | focusedPrompt) via Groq
        → Response persisted to Supabase (conversations / messages / token_usage)
```

- **Router** (`router/`) — classifies intent and resolves the ticker symbol from
  the message + conversation context (`lastSymbol`).
- **Handlers** (`handlers/`) — one per intent; build the final response payload
  (`analysis_card`, `focused_answer`, `clarification`, etc).
- **Services** (`services/`) — Supabase client, conversation persistence, Python
  TA client, Groq client, macro news/clustering, symbol validation.
- **Python TA service** (`../python-ta-service/`) — FastAPI service exposing
  `/compute` (unified indicator computation), `/capabilities`, `/resolve-symbol`,
  `/fundamentals`.

## Running locally

1. Install dependencies: `npm install` (and `pip install -r requirements.txt`
   in `python-ta-service/`).
2. Copy `.env.example` to `.env` and fill in real credentials (Supabase, Groq,
   Kite, FMP, NewsAPI).
3. Start the Python TA service: `cd ../python-ta-service && uvicorn app:app --host 0.0.0.0 --port 8000`
4. Start the Node backend: `node index.js` (listens on `PORT`, default 3000).

## Tests

`npm run test:router` — replays `tests/routerCases.json` against the live Router,
using cached LLM responses in `tests/.cache/` so it runs without API calls.
Use `npm run test:router:live` to bypass the cache and hit the Groq API directly.

## File structure

```
router/        intent classification + ticker resolution + prompt building
handlers/      per-intent response builders (stock, portfolio, market, general, clarify)
services/      Supabase client, conversation persistence, Python/Groq clients, news
prompts/       static LLM prompt templates (comprehensive, focused)
lib/           structured Pino logger
tests/         router regression suite + cached fixtures
migrations/    SQL schema migrations (apply manually via Supabase SQL editor)
```

## Known limitations / post-beta backlog

- NewsAPI is rate-limited on the free tier — migrate macro events to GNews.
- yfinance-backed lookups are uncached; add a TTL cache layer.
- LLM narration is on Groq/Llama; evaluate OpenRouter + Gemini for cost/quality.
- No stock-comparison ("X vs Y") intent yet.
- No watchlists or price alerts.
- Migration `0002_router_metadata.sql` must be applied manually in the Supabase
  SQL editor before `router_metadata` persistence will succeed in production.
