from fastapi import FastAPI, HTTPException
from fastapi import Query
import pandas as pd
import pandas_ta as ta
import yfinance as yf
from yahooquery import Ticker
import requests
import logging
import warnings
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

warnings.filterwarnings("ignore")
log = logging.getLogger("uvicorn.error")


# ─── Symbol resolution helpers (existing, unchanged) ─────────────────────────

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


# ─── DataFrame normalization (new) ───────────────────────────────────────────

def _normalize_hist_df(hist):
    """
    Normalize a yahooquery history DataFrame to a simple DatetimeIndex DataFrame.
    yahooquery 2.4+ returns MultiIndex (symbol, date) — this strips it to a flat DF.
    Output columns: open, high, low, close, volume (adjclose dropped after close exists).
    """
    if hist is None or not isinstance(hist, pd.DataFrame) or hist.empty:
        return None

    hist = hist.copy()

    # Normalize column names to lowercase
    hist.columns = [str(c).lower() for c in hist.columns]

    # Flatten MultiIndex columns if somehow present
    if isinstance(hist.columns, pd.MultiIndex):
        hist.columns = hist.columns.get_level_values(0)

    # Handle MultiIndex (symbol, date) index — standard for yahooquery 2.4+
    if isinstance(hist.index, pd.MultiIndex):
        hist = hist.reset_index()
        sym_cols = [c for c in hist.columns if str(c).lower() in ('symbol', 'ticker')]
        hist = hist.drop(columns=sym_cols, errors='ignore')
        date_cols = [c for c in hist.columns if str(c).lower() == 'date']
        if date_cols:
            hist = hist.set_index(date_cols[0])

    hist.index = pd.to_datetime(hist.index)

    # Remove timezone info if present
    if hasattr(hist.index, 'tz') and hist.index.tz is not None:
        hist.index = hist.index.tz_localize(None)

    hist = hist.sort_index()
    hist = hist[~hist.index.duplicated(keep='last')]

    # If only adjclose but no close, promote it
    if 'adjclose' in hist.columns and 'close' not in hist.columns:
        hist = hist.rename(columns={'adjclose': 'close'})

    if 'close' not in hist.columns:
        return None

    hist = hist.dropna(subset=['close'])
    return hist


# ─── Indicator computation helpers (new) ─────────────────────────────────────

def _safe_latest(series):
    """Return the last non-NaN float from a pandas Series, or None."""
    if series is None:
        return None
    s = series.dropna()
    if s.empty:
        return None
    return float(s.iloc[-1])


def _has_hlc(df):
    return all(c in df.columns for c in ('high', 'low', 'close'))


def _has_hlcv(df):
    return all(c in df.columns for c in ('high', 'low', 'close', 'volume'))


def _compute_rsi(df, params):
    return _safe_latest(ta.rsi(df["close"], length=14))


def _compute_stoch(df, params):
    if not _has_hlc(df):
        return None
    result = ta.stoch(df["high"], df["low"], df["close"])
    if result is None or result.empty:
        return None
    result = result.dropna()
    if result.empty:
        return None
    row = result.iloc[-1]
    k_col = next((c for c in result.columns if c.startswith("STOCHk")), None)
    d_col = next((c for c in result.columns if c.startswith("STOCHd")), None)
    return {
        "k": round(float(row[k_col]), 2) if k_col else None,
        "d": round(float(row[d_col]), 2) if d_col else None
    }


def _compute_macd(df, params):
    result = ta.macd(df["close"])
    if result is None or result.empty:
        return None
    result = result.dropna()
    if result.empty:
        return None
    row = result.iloc[-1]
    macd_col  = next((c for c in result.columns if c.startswith("MACD_")), None)
    hist_col  = next((c for c in result.columns if c.startswith("MACDh")), None)
    sig_col   = next((c for c in result.columns if c.startswith("MACDs")), None)
    return {
        "macd":      round(float(row[macd_col]), 4) if macd_col  else None,
        "histogram": round(float(row[hist_col]), 4) if hist_col  else None,
        "signal":    round(float(row[sig_col]),  4) if sig_col   else None
    }


def _compute_cci(df, params):
    if not _has_hlc(df):
        return None
    result = ta.cci(df["high"], df["low"], df["close"], length=14)
    return round(_safe_latest(result), 2) if _safe_latest(result) is not None else None


def _compute_williams_r(df, params):
    if not _has_hlc(df):
        return None
    result = ta.willr(df["high"], df["low"], df["close"], length=14)
    return round(_safe_latest(result), 2) if _safe_latest(result) is not None else None


def _make_ema(length):
    def fn(df, params):
        result = ta.ema(df["close"], length=length)
        v = _safe_latest(result)
        return round(v, 4) if v is not None else None
    fn.__name__ = f"_compute_ema_{length}"
    return fn


def _make_sma(length):
    def fn(df, params):
        result = ta.sma(df["close"], length=length)
        v = _safe_latest(result)
        return round(v, 4) if v is not None else None
    fn.__name__ = f"_compute_sma_{length}"
    return fn


def _compute_adx(df, params):
    if not _has_hlc(df):
        return None
    result = ta.adx(df["high"], df["low"], df["close"], length=14)
    if result is None or result.empty:
        return None
    result = result.dropna()
    if result.empty:
        return None
    row = result.iloc[-1]
    adx_col = next((c for c in result.columns if c.startswith("ADX_")), None)
    dmp_col = next((c for c in result.columns if c.startswith("DMP_")), None)
    dmn_col = next((c for c in result.columns if c.startswith("DMN_")), None)
    return {
        "adx":       round(float(row[adx_col]), 2) if adx_col else None,
        "dmi_plus":  round(float(row[dmp_col]), 2) if dmp_col else None,
        "dmi_minus": round(float(row[dmn_col]), 2) if dmn_col else None
    }


def _compute_atr(df, params):
    if not _has_hlc(df):
        return None
    result = ta.atr(high=df["high"], low=df["low"], close=df["close"], length=14)
    v = _safe_latest(result)
    return round(v, 4) if v is not None else None


def _compute_bbands(df, params):
    result = ta.bbands(df["close"], length=20)
    if result is None or result.empty:
        return None
    result = result.dropna()
    if result.empty:
        return None
    row = result.iloc[-1]
    cols = result.columns.tolist()
    upper_col = next((c for c in cols if c.startswith("BBU")), None)
    mid_col   = next((c for c in cols if c.startswith("BBM")), None)
    lower_col = next((c for c in cols if c.startswith("BBL")), None)
    bw_col    = next((c for c in cols if c.startswith("BBB")), None)
    pb_col    = next((c for c in cols if c.startswith("BBP")), None)
    return {
        "upper":      round(float(row[upper_col]), 4) if upper_col else None,
        "middle":     round(float(row[mid_col]),   4) if mid_col   else None,
        "lower":      round(float(row[lower_col]), 4) if lower_col else None,
        "bandwidth":  round(float(row[bw_col]),    4) if bw_col    else None,
        "percent_b":  round(float(row[pb_col]),    4) if pb_col    else None
    }


def _compute_obv(df, params):
    if "volume" not in df.columns:
        return None
    result = ta.obv(df["close"], df["volume"])
    v = _safe_latest(result)
    return int(v) if v is not None else None


def _compute_vwap(df, params):
    """Rolling 20-day VWAP — more meaningful than cumulative for daily bars."""
    if not _has_hlcv(df):
        return None
    n = int(params.get("vwap_period", 20))
    typical = (df["high"] + df["low"] + df["close"]) / 3
    tp_vol = typical * df["volume"]
    rolling_vwap = tp_vol.rolling(n).sum() / df["volume"].rolling(n).sum()
    v = _safe_latest(rolling_vwap)
    return round(v, 4) if v is not None else None


def _compute_volume_history(df, params):
    if "volume" not in df.columns:
        return []
    n = int(params.get("days", 10))
    recent = df[["volume"]].tail(n)
    result = []
    for date_idx, row in recent.iterrows():
        result.append({
            "date":   pd.Timestamp(date_idx).strftime("%Y-%m-%d"),
            "volume": int(row["volume"]) if pd.notna(row["volume"]) else None
        })
    return result


def _compute_volume_avg_20(df, params):
    if "volume" not in df.columns:
        return None
    avg = df["volume"].tail(20).mean()
    return int(avg) if pd.notna(avg) else None


def _compute_support_resistance(df, params):
    """Pivot-based support/resistance using a 180-day lookback to capture levels on both sides of price."""
    lookback = int(params.get("lookback", 180))
    window   = int(params.get("window", 5))
    recent   = df.tail(lookback)
    if len(recent) < window * 2 + 1:
        return {"support": [], "resistance": [], "current": None}

    highs  = recent["high"]  if "high"  in recent.columns else recent["close"]
    lows   = recent["low"]   if "low"   in recent.columns else recent["close"]
    closes = recent["close"]

    resistance_candidates = []
    support_candidates    = []
    for i in range(window, len(closes) - window):
        h_window = highs.iloc[i - window: i + window + 1]
        l_window = lows.iloc[i  - window: i + window + 1]
        if highs.iloc[i] == h_window.max():
            resistance_candidates.append(round(float(highs.iloc[i]), 2))
        if lows.iloc[i] == l_window.min():
            support_candidates.append(round(float(lows.iloc[i]), 2))

    def cluster(levels, tolerance=0.01):
        if not levels:
            return []
        levels = sorted(set(levels), reverse=True)
        clustered = [levels[0]]
        for lv in levels[1:]:
            if clustered[-1] != 0 and abs(lv - clustered[-1]) / clustered[-1] > tolerance:
                clustered.append(lv)
        return clustered[:3]

    current     = round(float(closes.iloc[-1]), 2)
    resistances = sorted([r for r in cluster(resistance_candidates) if r > current])[:3]
    supports    = sorted([s for s in cluster(support_candidates)    if s < current], reverse=True)[:3]

    # Fallback: if no pivot lows found below current (e.g. stock at multi-month low),
    # use the rolling minimum of the full lookback as a floor support level.
    if not supports:
        low_col = "low" if "low" in recent.columns else "close"
        floor = round(float(recent[low_col].min()), 2)
        if floor < current:
            supports = [floor]

    return {"support": supports, "resistance": resistances, "current": current}


def _compute_52_week_range(df, params):
    year_data = df.tail(252)
    high_col  = "high"  if "high"  in df.columns else "close"
    low_col   = "low"   if "low"   in df.columns else "close"
    high    = round(float(year_data[high_col].max()), 2)
    low     = round(float(year_data[low_col].min()),  2)
    current = round(float(df["close"].iloc[-1]),      2)
    return {
        "low":           low,
        "high":          high,
        "current":       current,
        "pct_from_low":  round((current - low)  / low  * 100, 2) if low  else None,
        "pct_from_high": round((current - high) / high * 100, 2) if high else None
    }


def _compute_price_history(df, params):
    """Returns last 90 trading days as OHLCV records with Unix timestamp (seconds) dates."""
    cols = [c for c in ["open", "high", "low", "close", "volume"] if c in df.columns]
    if "close" not in cols:
        return []
    recent = df[cols].tail(90)
    result = []
    for date_idx, row in recent.iterrows():
        try:
            ts = int(pd.Timestamp(date_idx).replace(tzinfo=None).timestamp())
        except Exception:
            continue
        result.append({
            "date":   ts,
            "open":   round(float(row["open"]),   2) if "open"   in cols else round(float(row["close"]), 2),
            "high":   round(float(row["high"]),   2) if "high"   in cols else round(float(row["close"]), 2),
            "low":    round(float(row["low"]),    2) if "low"    in cols else round(float(row["close"]), 2),
            "close":  round(float(row["close"]),  2),
            "volume": int(row["volume"]) if "volume" in cols and pd.notna(row["volume"]) else 0,
        })
    return result


def _compute_full_analysis_bundle(df, params):
    """
    Returns the complete data bundle consumed by comprehensivePrompt
    (technicals, chart data, dividends, and fundamentals in one call).
    Uses the Ticker object from params["_ticker_obj"] to avoid a second HTTP call.
    """
    resolved   = params.get("resolved_ticker")
    ticker_obj = params.get("_ticker_obj")
    if not resolved:
        return None

    close_val = round(float(df["close"].iloc[-1]), 2)
    currency  = "INR" if resolved.endswith((".NS", ".BO")) else "USD"

    # ── TA calculations ───────────────────────────────────────────────────────
    rsi_val   = _safe_latest(ta.rsi(df["close"], length=14))
    ema20_val = _safe_latest(ta.ema(df["close"], length=20))
    ema50_val = _safe_latest(ta.ema(df["close"], length=50))

    macd_res  = ta.macd(df["close"])
    macd_hist_val = None
    if macd_res is not None and not macd_res.empty:
        hist_col = next((c for c in macd_res.columns if c.startswith("MACDh")), None)
        if hist_col:
            macd_hist_val = _safe_latest(macd_res[hist_col])

    atr_val = None
    if _has_hlc(df):
        atr_res = ta.atr(high=df["high"], low=df["low"], close=df["close"], length=14)
        atr_val = _safe_latest(atr_res)

    # ── Chart data (last 10 days from df) ─────────────────────────────────────
    chart_recent = df.tail(10)
    chart_data   = {
        "prices": [round(float(p), 2) for p in chart_recent["close"].tolist()],
        "dates":  [pd.Timestamp(d).strftime("%Y-%m-%d") for d in chart_recent.index.tolist()]
    }

    # ── Dividend data ─────────────────────────────────────────────────────────
    avg_dividend    = None
    recent_divs     = []
    dividend_yield  = None
    try:
        t_obj = ticker_obj if ticker_obj else Ticker(resolved)
        div_raw = t_obj.dividend_history(start="2019-01-01")
        if isinstance(div_raw, pd.DataFrame) and not div_raw.empty and "dividends" in div_raw.columns:
            div_series = div_raw["dividends"].copy()
            if isinstance(div_series.index, pd.MultiIndex):
                try:
                    div_series = div_series.loc[resolved]
                except (KeyError, TypeError):
                    div_series = div_series.droplevel(0)
            div_df = div_series.reset_index()
            div_df.columns = ["date", "amount"]
            div_df["date"] = pd.to_datetime(div_df["date"]).dt.tz_localize(None)
            one_year_ago = pd.Timestamp.now() - pd.DateOffset(years=1)
            div_1y = div_df[div_df["date"] >= one_year_ago].sort_values("date", ascending=False)
            recent_divs = [
                {"date": row["date"].strftime("%Y-%m-%d"), "amount": float(row["amount"])}
                for _, row in div_1y.iterrows()
            ]
            total_div = float(div_1y["amount"].sum())
            avg_dividend = total_div
            if total_div and close_val:
                dividend_yield = round((total_div / close_val) * 100, 2)
    except Exception as e:
        log.warning(f"full_analysis_bundle: dividend fetch failed for {resolved}: {e}")

    # ── Fundamentals ─────────────────────────────────────────────────────────
    pe = roe = debt = revenue_growth = sector = None
    try:
        t_obj  = ticker_obj if ticker_obj else Ticker(resolved)
        stats  = t_obj.key_stats.get(resolved, {})
        fin    = t_obj.financial_data.get(resolved, {})
        prof   = t_obj.asset_profile.get(resolved, {})
        if isinstance(stats, dict):
            pe = stats.get("forwardPE")
        if isinstance(fin, dict):
            roe = fin.get("returnOnEquity")
            raw_debt = fin.get("debtToEquity")
            debt = raw_debt / 100 if raw_debt is not None else None
            revenue_growth = fin.get("revenueGrowth")
        if isinstance(prof, dict):
            sector = prof.get("sector")
    except Exception as e:
        log.warning(f"full_analysis_bundle: fundamentals fetch failed for {resolved}: {e}")

    return {
        "close":            close_val,
        "currency":         currency,
        "rsi":              round(rsi_val,   2) if rsi_val   is not None else None,
        "ema20":            round(ema20_val, 2) if ema20_val is not None else None,
        "ema50":            round(ema50_val, 2) if ema50_val is not None else None,
        "macd_hist":        round(macd_hist_val, 4) if macd_hist_val is not None else None,
        "atr":              round(atr_val,  2) if atr_val   is not None else None,
        "avg_dividend":     avg_dividend,
        "recent_dividends": recent_divs,
        "dividend_yield":   dividend_yield,
        "chart_data":       chart_data,
        "pe":               pe,
        "roe":              roe,
        "debtToEquity":     debt,
        "revenueGrowth":    revenue_growth,
        "sector":           sector
    }


# ─── Indicator registry ───────────────────────────────────────────────────────
# Each entry: callable(hist_df: DataFrame, params: dict) -> scalar | dict | list | None
# params always contains {"resolved_ticker": str, "_ticker_obj": Ticker} injected by /compute.

INDICATOR_REGISTRY: Dict[str, Any] = {
    # Momentum
    "rsi":         _compute_rsi,
    "stoch":       _compute_stoch,
    "macd":        _compute_macd,
    "cci":         _compute_cci,
    "williams_r":  _compute_williams_r,
    # Trend
    "ema_20":      _make_ema(20),
    "ema_50":      _make_ema(50),
    "ema_100":     _make_ema(100),
    "ema_200":     _make_ema(200),
    "sma_50":      _make_sma(50),
    "sma_200":     _make_sma(200),
    "adx":         _compute_adx,
    # Volatility
    "atr":         _compute_atr,
    "bbands":      _compute_bbands,
    # Volume
    "obv":              _compute_obv,
    "vwap":             _compute_vwap,
    "volume_history":   _compute_volume_history,
    "volume_avg_20":    _compute_volume_avg_20,
    # Levels
    "support_resistance": _compute_support_resistance,
    "52_week_range":      _compute_52_week_range,
    # Chart
    "price_history": _compute_price_history,
    # Bundle
    "full_analysis_bundle": _compute_full_analysis_bundle,
}


# ─── Pydantic request model ───────────────────────────────────────────────────

class ComputeRequest(BaseModel):
    ticker: str
    indicators: List[str] = []
    parameters: Optional[Dict[str, Any]] = {}


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI()


# ─── Existing endpoints (unchanged) ──────────────────────────────────────────

_ALLOWED_EXCHANGES = {"NYQ", "NMS", "NGM", "NCM", "ASE", "NasdaqGS", "NasdaqGM", "NasdaqCM", "NSI", "BSE"}
_EXCHANGE_LABELS   = {
    "NYQ": "NYSE", "NMS": "NASDAQ", "NGM": "NASDAQ", "NCM": "NASDAQ",
    "ASE": "AMEX", "NasdaqGS": "NASDAQ", "NasdaqGM": "NASDAQ", "NasdaqCM": "NASDAQ",
    "NSI": "NSE",  "BSE": "BSE",
}

@app.get("/search-symbol")
def search_symbol(q: str):
    """Return up to 3 US (NYSE/NASDAQ) or Indian (NSE/BSE) candidates for a company name."""
    try:
        if not q or not q.strip():
            return {"candidates": []}
        quotes = _search_symbol(q.strip())
        if not quotes and len(q.split()) > 2:
            quotes = _search_symbol(" ".join(q.split()[:2]))
        candidates = []
        seen = set()
        for quote in (quotes or []):
            if isinstance(quote, dict):
                sym      = quote.get("symbol", "")
                exchange = quote.get("exchange", "")
                name     = quote.get("shortname") or quote.get("longname") or sym
            else:
                sym      = getattr(quote, "symbol", "")
                exchange = getattr(quote, "exchange", "")
                name     = getattr(quote, "shortname", None) or getattr(quote, "longname", None) or sym
            if not sym or exchange not in _ALLOWED_EXCHANGES or sym in seen:
                continue
            seen.add(sym)
            candidates.append({
                "symbol":   sym,
                "name":     name,
                "exchange": _EXCHANGE_LABELS.get(exchange, exchange),
            })
            if len(candidates) >= 3:
                break
        return {"candidates": candidates}
    except Exception as e:
        print("search-symbol error:", e)
        return {"candidates": []}


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

        revenue_growth = financial.get("revenueGrowth", None)

        return {
            "pe": pe,
            "roe": roe,
            "debtToEquity": debt,
            "revenueGrowth": revenue_growth
        }

    except Exception as e:
        return {"error": str(e)}




# ─── New endpoints ────────────────────────────────────────────────────────────

@app.post("/compute")
def compute_indicators(body: ComputeRequest):
    """
    Compute one or more indicators for a ticker in a single yfinance call.

    Input:  { ticker, indicators: [...], parameters: {} }
    Output: { ticker: <resolved>, computed: { <indicator>: <value> | null } }

    HTTP status codes:
      422 — ticker empty or indicators not a list
      404 — ticker cannot be resolved or has no price data
      500 — unexpected computation error
    """
    ticker_raw = body.ticker.strip()
    if not ticker_raw:
        raise HTTPException(status_code=422, detail="ticker must not be empty")

    if not isinstance(body.indicators, list):
        raise HTTPException(status_code=422, detail="indicators must be a list")

    # Resolve ticker (skip for index symbols)
    if ticker_raw.startswith("^"):
        resolved = ticker_raw
    else:
        resolved = resolve_ticker(ticker_raw)
        if not resolved:
            raise HTTPException(
                status_code=404,
                detail=f"Cannot resolve ticker '{ticker_raw}' — check that it is a valid NSE/BSE/US symbol"
            )

    # Fetch 1y of history (needed for ema_200, sma_200, 52_week_range)
    try:
        ticker_obj = Ticker(resolved)
        hist_raw   = ticker_obj.history(period="1y", interval="1d")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch price history: {e}")

    df = _normalize_hist_df(hist_raw)
    if df is None or df.empty or len(df) < 5:
        raise HTTPException(
            status_code=404,
            detail=f"No usable price data found for '{resolved}'"
        )

    # Build computation params — inject ticker context for full_analysis_bundle
    comp_params: Dict[str, Any] = dict(body.parameters or {})
    comp_params["resolved_ticker"] = resolved
    comp_params["_ticker_obj"]     = ticker_obj

    computed: Dict[str, Any] = {}
    for indicator in body.indicators:
        if indicator not in INDICATOR_REGISTRY:
            log.warning(f"/compute: unknown indicator '{indicator}' requested for {resolved}")
            computed[indicator] = None
            continue
        try:
            computed[indicator] = INDICATOR_REGISTRY[indicator](df, comp_params)
        except Exception as e:
            log.warning(f"/compute: indicator '{indicator}' failed for {resolved}: {e}")
            computed[indicator] = None

    return {"ticker": resolved, "computed": computed}


@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/capabilities")
def get_capabilities():
    """Returns the list of available indicator names from INDICATOR_REGISTRY."""
    return {"indicators": list(INDICATOR_REGISTRY.keys())}
