import { TrendingUp } from "lucide-react"

export interface FocusedAnswerProps {
  symbol: string
  displayName: string
  indicators: Record<string, unknown>
  reply: string
}

const INDICATOR_LABELS: Record<string, string> = {
  rsi:               "RSI",
  ema_20:            "EMA 20",
  ema_50:            "EMA 50",
  ema_200:           "EMA 200",
  sma_50:            "SMA 50",
  sma_200:           "SMA 200",
  macd:              "MACD Hist",
  atr:               "ATR",
  volume_avg_20:     "Vol Avg (20d)",
  support_resistance:"Support/Res",
  "52_week_range":   "52W Range",
  volume_history:    "Volume",
  bbands:            "BB Bands",
  stoch:             "Stoch",
  williams_r:        "Williams %R",
}

function fmtIndicatorValue(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === "number") {
    return Number.isFinite(val) ? val.toLocaleString("en-US", { maximumFractionDigits: 2 }) : null
  }
  if (typeof val === "string") return val || null
  if (Array.isArray(val)) {
    if (val.length === 0) return null
    const last = val[val.length - 1]
    return typeof last === "number" ? last.toLocaleString("en-US", { maximumFractionDigits: 0 }) : null
  }
  if (typeof val === "object") {
    const v = val as Record<string, unknown>
    // MACD: prefer histogram
    if ("histogram" in v && typeof v.histogram === "number") {
      return Number.isFinite(v.histogram) ? v.histogram.toFixed(2) : null
    }
    // support_resistance / 52_week_range: show current price
    if ("current" in v && typeof v.current === "number") {
      return Number.isFinite(v.current)
        ? v.current.toLocaleString("en-US", { maximumFractionDigits: 2 })
        : null
    }
    // Bollinger Bands: show middle band
    if ("middle" in v && typeof v.middle === "number") {
      return Number.isFinite(v.middle) ? v.middle.toFixed(2) : null
    }
  }
  return null
}

export function FocusedAnswer({ displayName, indicators, reply }: FocusedAnswerProps) {
  const kvPairs = Object.entries(indicators)
    .map(([key, val]) => ({
      label: INDICATOR_LABELS[key] ?? key.replace(/_/g, " ").toUpperCase(),
      value: fmtIndicatorValue(val),
    }))
    .filter((p): p is { label: string; value: string } => p.value !== null)

  const indicatorHeadline = kvPairs.map((p) => p.label).join(", ") || "Analysis"

  return (
    <div className="rounded-[1.25rem] rounded-tl-sm border border-border/80 bg-muted/40 px-3.5 pt-3 pb-3.5 shadow-sm space-y-2 min-w-0 max-w-full">
      <div className="flex items-center gap-1.5 min-w-0">
        <TrendingUp className="size-3.5 shrink-0 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground truncate">
          {displayName} — {indicatorHeadline}
        </p>
      </div>

      <p className="text-[15px] leading-relaxed text-foreground wrap-anywhere">{reply}</p>

      {kvPairs.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-[12px] font-mono">
          {kvPairs.map((p) => (
            <span key={p.label} className="whitespace-nowrap text-muted-foreground">
              <span className="font-medium text-foreground/80">{p.label}:</span>{" "}{p.value}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
