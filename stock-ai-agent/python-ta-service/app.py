from fastapi import FastAPI
from fastapi import Query
import pandas as pd
import pandas_ta as ta
import yfinance as yf
from yahooquery import Ticker
import requests

def _search_symbol(query: str):
    """Resolve via yfinance Search, then raw Yahoo API as fallback. No hardcoded mappings."""
    try:
        search = yf.Search(query.strip(), max_results=15)
        quotes = getattr(search, "quotes", None)
        if quotes is not None and hasattr(quotes, "__iter__") and not isinstance(quotes, (str, dict)):
            return list(quotes)
    except Exception as e:
        print("yfinance Search error:", e)

    try:
        url = f"https://query2.finance.yahoo.com/v1/finance/search?q={requests.utils.quote(query)}"
        r = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
        data = r.json()
        return data.get("quotes", []) or []
    except Exception as e:
        print("Yahoo API search error:", e)
    return []


def _quote_text(item) -> str:
    """Get searchable name from a quote (object or dict)."""
    if isinstance(item, dict):
        return " ".join(
            str(item.get(k, "")) for k in ("shortname", "longname", "symbol", "quoteType")
        ).lower()
    return " ".join(
        str(getattr(item, k, "")) for k in ("shortname", "longname", "symbol", "quoteType")
    ).lower()


def _score_quote(query: str, item) -> int:
    """Higher = better match. Prefer quotes whose name contains query words (e.g. REIT in query -> prefer REIT in name)."""
    q = query.lower().strip()
    text = _quote_text(item)
    if not text:
        return 0
    words = [w for w in q.split() if len(w) > 1]
    score = 0
    for w in words:
        if w in text:
            score += 10
        if w in text and w in ("reit", "etf", "fund"):
            score += 20
    return score


def _best_quote(query: str, quotes: list):
    """Return the best quote: prefer NSE, and among those prefer best relevance to query."""
    if not quotes:
        return None
    scored = [(_score_quote(query, q), q) for q in quotes]
    scored.sort(key=lambda x: -x[0])
    for _, q in scored:
        sym = getattr(q, "symbol", None) or (q.get("symbol") if isinstance(q, dict) else None)
        if not sym:
            continue
        is_nse = (
            getattr(q, "exchange", None) == "NSI"
            or (isinstance(q, dict) and q.get("exchange") == "NSI")
            or (isinstance(sym, str) and sym.endswith(".NS"))
        )
        if is_nse:
            return q
    return scored[0][1] if scored else quotes[0]


def resolve_ticker(symbol):
    symbol = symbol.strip()
    if symbol.startswith("^"):
        return symbol

    # If it already looks like a ticker (e.g. EMBASSY.NS, AAPL), try direct first
    if "." in symbol or (len(symbol) <= 5 and symbol.isalpha()):
        try:
            t = yf.Ticker(symbol)
            hist = t.history(period="5d")
            if hist is not None and not hist.empty:
                return symbol
        except Exception:
            pass

    quotes = _search_symbol(symbol)
    if not quotes and len(symbol.split()) > 2:
        quotes = _search_symbol(" ".join(symbol.split()[:2]))

    if not quotes:
        return None

    best = _best_quote(symbol, quotes)
    sym = getattr(best, "symbol", None) or (best.get("symbol") if isinstance(best, dict) else None)
    if sym:
        print("Resolved:", sym)
    return sym

app = FastAPI()

@app.get("/resolve-symbol")
def resolve_symbol(q: str):
    try:
        if not q or not q.strip():
            return {"symbol": None}
        q = q.strip()

        quotes = _search_symbol(q)
        if not quotes and len(q.split()) > 2:
            quotes = _search_symbol(" ".join(q.split()[:2]))

        if not quotes:
            return {"symbol": None}

        best = _best_quote(q, quotes)
        sym = getattr(best, "symbol", None) or (best.get("symbol") if isinstance(best, dict) else None)
        return {"symbol": sym}
    except Exception as e:
        print("resolve-symbol error:", e)
        return {"symbol": None}

@app.get("/fundamentals")
def get_fundamentals(symbol: str):
    try:
        lookup = resolve_ticker(symbol)

        if not lookup:
          return {"error": "Ticker not found globally"}

        t = Ticker(lookup)

        _stats = t.key_stats.get(lookup, {})
        _financial = t.financial_data.get(lookup, {})
        stats = _stats if isinstance(_stats, dict) else {}
        financial = _financial if isinstance(_financial, dict) else {}

        pe = stats.get("forwardPE", None)
        roe = financial.get("returnOnEquity", None)
        raw_debt = financial.get("debtToEquity", None)

        debt = None
        if raw_debt is not None:
            debt = raw_debt / 100

        # debt = financial.get("debtToEquity", None)
        revenue_growth = financial.get("revenueGrowth", None)

        return {
            "pe": pe,
            "roe": roe,
            "debtToEquity": debt,
            "revenueGrowth": revenue_growth
        }

    except Exception as e:
        return {"error": str(e)}

@app.get("/ta-symbol")
def get_ta_from_symbol(symbol: str):
    try:
        # Skip resolution for index symbols
        if symbol.startswith("^"):
            resolved = symbol
        else:
            resolved = resolve_ticker(symbol)

        print("Resolved:", resolved)

        if not resolved:
            return {"error": "Ticker not found globally"}

        ticker = Ticker(resolved)
        # Index symbols start with ^
        if symbol.startswith("^"):
            hist = ticker.history(period="6mo", interval="1d")
        else:
            hist = ticker.history(period="3mo", interval="1d")
            # Ensure history returned a DataFrame
            if not isinstance(hist, pd.DataFrame):
                return {"error": "Invalid historical data returned"}
        # Normalize column names to lowercase
        hist.columns = [col.lower() for col in hist.columns]
        hist = hist.dropna()

        # Flatten MultiIndex columns if present
        if isinstance(hist.columns, pd.MultiIndex):
          hist.columns = hist.columns.get_level_values(0)

        if hist is None or not isinstance(hist, pd.DataFrame) or hist.empty:
            return {"error": "No historical data"}

        possible_price_cols = ["close", "adjclose"]

        price_col = None

        for col in possible_price_cols:
            if col in hist.columns:
                price_col = col
                break

        if not price_col:
            print("Available Columns:", hist.columns)
            return {"error": "No usable price column"}

        # if "Close" not in hist.columns:
        #     if "Adj Close" in hist.columns:
        #         price_col = "Adj Close"
        #     else:
        #         return {"error": "No usable price column"}

        closes = hist[price_col].dropna().tolist()

        if len(closes) < 60:
            return {"error": "Not enough candle data"}

        df = pd.DataFrame(closes, columns=["close"])

        rsi_series = ta.rsi(df["close"], length=14)
        ema20_series = ta.ema(df["close"], length=20)
        ema50_series = ta.ema(df["close"], length=50)

        macd = ta.macd(df["close"])

        high = hist["high"] if "high" in hist.columns else None
        low = hist["low"] if "low" in hist.columns else None
        close = hist[price_col]

        if high is None or low is None:
            return {"error": "Missing OHLC data for ATR"}

        atr_series = ta.atr(
            high=high,
            low=low,
            close=close,
            length=14
        )

        if atr_series is None:
          return {"error": "ATR calculation failed"}

        atr_series = atr_series.dropna()

        if atr_series.empty:
          return {"error": "ATR contains NaN"}

        latest_atr = atr_series.iloc[-1]

        if macd is None:
          return {"error": "MACD calculation failed"}

        macd = macd.dropna()

        if macd.empty:
          return {"error": "MACD contains NaN"}

        macd_hist_series = macd["MACDh_12_26_9"]

        macd_hist = (
            macd_hist_series.dropna().iloc[-1]
            if not macd_hist_series.dropna().empty
            else None
        )

        latest_rsi = (
            rsi_series.dropna().iloc[-1]
            if rsi_series is not None and not rsi_series.dropna().empty
            else None
        )

        latest_ema20 = (
            ema20_series.dropna().iloc[-1]
            if ema20_series is not None and not ema20_series.dropna().empty
            else None
        )

        latest_ema50 = (
            ema50_series.dropna().iloc[-1]
            if ema50_series is not None and not ema50_series.dropna().empty
            else None
        )
        latest_close = closes[-1]

        return {
            "symbol": symbol,
            "rsi": float(latest_rsi) if latest_rsi else None,
            "ema20": float(latest_ema20) if latest_ema20 else None,
            "ema50": float(latest_ema50) if latest_ema50 else None,
            "macd_hist": float(macd_hist) if macd_hist else None,
            "atr": float(latest_atr) if latest_atr else None,
            "close": float(latest_close) if latest_close else None,
            "currency": "INR" if resolved.endswith((".NS", ".BO")) else "USD"
        }

    except Exception as e:
        return {"error": str(e)}


@app.post("/rsi")
def get_rsi(data: dict):
    close_prices = data["close"]
    df = pd.DataFrame(close_prices, columns=["close"])
    rsi = ta.rsi(df["close"], length=14)
    return {"rsi": float(rsi.iloc[-1])}