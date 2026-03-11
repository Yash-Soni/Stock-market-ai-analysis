import type { StockAnalysis } from "../components/stock-chat/chat-message"

export interface BackendChatResponse {
  symbol: string
  score: number
  risk: number
  currency: string
  rsi?: number
  ema20?: number
  ema50?: number
  macd_hist?: number
  close?: number
  atr?: number
  pe?: number
  roe?: number
  debtToEquity?: number
  revenueGrowth?: number
  reply: string
  error?: string
}

/** Response shape when backend returns multiple analyses (e.g. multi-symbol query) */
export interface BackendChatResponseWithAnalyses {
  analyses: BackendChatResponse[]
}

function fmtNum(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return Number(v).toFixed(2)
}

function fmtClose(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtPct(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  if (v <= 1 && v >= 0) return `${(v * 100).toFixed(1)}%`
  return `${Number(v).toFixed(1)}%`
}

function rsiSignal(rsi: number): "bullish" | "bearish" | "neutral" {
  if (rsi < 30) return "bullish"
  if (rsi > 70) return "bearish"
  return "neutral"
}

export function mapBackendResponseToStockAnalysis(
  data: BackendChatResponse
): StockAnalysis {
  console.log('data', data);
  const score = Number(data.score)
  const risk = Number(data.risk)
  const rsi = data.rsi != null ? Number(data.rsi) : NaN
  const macd = data.macd_hist != null ? Number(data.macd_hist) : NaN
  const close = data.close != null ? Number(data.close) : 0

  const atrPct =
  data.atr != null && data.close
    ? data.atr / data.close
    : 0

const isBearish =
  data.close != null &&
  data.ema20 != null &&
  data.ema50 != null &&
  data.close < data.ema20 &&
  data.close < data.ema50

  const missingFundamentals =
    !data.roe ||
    !data.debtToEquity

  let verdictType: "bullish" | "neutral" | "bearish"

  if (isBearish && atrPct > 0.03) {
    verdictType = "bearish"
  }
  else if (missingFundamentals) {
    verdictType = "neutral"
  }
  else if (!isBearish && score >= 60) {
    verdictType = "bullish"
  }
  else if (score >= 40) {
    verdictType = "neutral"
  }
  else {
    verdictType = "bearish"
  }

  const technicals: StockAnalysis["technicals"] = [
    {
      label: "RSI (14)",
      value: Number.isFinite(rsi) ? rsi.toFixed(1) : "—",
      signal: Number.isFinite(rsi) ? rsiSignal(rsi) : undefined,
    },
    {
      label: "Close",
      value: fmtClose(data.close),
      signal: "neutral",
    },
    {
      label: "EMA 20",
      value: fmtNum(data.ema20),
      signal: data.close != null && data.ema20 != null ? (data.close > data.ema20 ? "bullish" : "bearish") : undefined,
    },
    {
      label: "EMA 50",
      value: fmtNum(data.ema50),
      signal: data.close != null && data.ema50 != null ? (data.close > data.ema50 ? "bullish" : "bearish") : undefined,
    },
    {
      label: "MACD Hist",
      value: fmtNum(data.macd_hist),
      signal: Number.isFinite(macd) ? (macd >= 0 ? "bullish" : "bearish") : undefined,
    },
    {
      label: "ATR",
      value: fmtNum(data.atr),
      signal: "neutral",
    },
  ]

  const fundamentals: StockAnalysis["fundamentals"] = [
    { label: "PE Ratio", value: fmtNum(data.pe), signal: "neutral" },
    { label: "ROE", value: fmtPct(data.roe), signal: "neutral" },
    { label: "Debt / Equity", value: fmtNum(data.debtToEquity), signal: "neutral" },
    { label: "Rev. Growth", value: fmtPct(data.revenueGrowth), signal: "neutral" },
  ]

  const summary =
    data.reply?.trim().split("\n")[0]?.slice(0, 200) ||
    `Analysis for ${data.symbol}. Score ${score}/100, Risk ${risk}/100.`

  
  const highVol =
    atrPct > 0.03

  let verdict: string

  if (isBearish && highVol) {
    verdict =
      "High-risk setup. Consider waiting for trend improvement."
  }
  else if (missingFundamentals) {
    verdict =
      "Limited business data available. Proceed cautiously."
  }
  else if (isBearish) {
    verdict =
      "Downtrend in place. Gradual accumulation may be safer."
  }
  else if (highVol) {
    verdict =
      "Volatility is elevated. Smaller staggered entries advised."
  }
  else if (score >= 60) {
    verdict =
      "Favorable setup with improving conditions."
  }
  else if (score >= 40) {
    verdict =
      "Mixed signals. Partial entry may be considered."
  }
  else {
    verdict =
      "Weak setup. Avoid fresh entries for now."
  }

  return {
    symbol: data.symbol,
    name: `${data.symbol} Stock`,
    price: close,
    change: 0,
    changePercent: 0,
    currency: data.currency,
    sparkData: Number.isFinite(close) ? [close * 0.98, close * 1.01, close] : [],
    sector: "—",
    buyScore: score,
    riskScore: risk,
    technicals,
    fundamentals,
    analysisSummary: summary,
    analysisPoints: [],
    verdict,
    verdictType,
    analysisMarkdown: data.reply || undefined,
  }
}

/**
 * Map backend response to StockAnalysis[].
 * Accepts either { analyses: BackendChatResponse[] } or a single BackendChatResponse (backward compat).
 */
export function mapBackendResponseToStockAnalyses(
  data: BackendChatResponseWithAnalyses | BackendChatResponse
): StockAnalysis[] {
  if (Array.isArray((data as BackendChatResponseWithAnalyses).analyses)) {
    return (data as BackendChatResponseWithAnalyses).analyses.map((a) =>
      mapBackendResponseToStockAnalysis(a)
    )
  }
  return [mapBackendResponseToStockAnalysis(data as BackendChatResponse)]
}
