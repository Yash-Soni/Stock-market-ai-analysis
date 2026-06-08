import { useEffect, useRef, useState } from "react"
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type UTCTimestamp,
} from "lightweight-charts"
import { cn } from "../../lib/utils"

export interface OhlcvBar {
  date: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface StockChartProps {
  data: OhlcvBar[]
  ema20?: number | null
  ema50?: number | null
  currency: string
  ticker: string
}

type Period = "1M" | "3M" | "6M"
const PERIOD_BARS: Record<Period, number> = { "1M": 30, "3M": 63, "6M": 90 }

function computeEma(
  closes: number[],
  times: UTCTimestamp[],
  period: number
): { time: UTCTimestamp; value: number }[] {
  if (closes.length < period) return []
  const k = 2 / (period + 1)
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
  const result: { time: UTCTimestamp; value: number }[] = []
  for (let i = period - 1; i < closes.length; i++) {
    if (i > period - 1) ema = closes[i] * k + ema * (1 - k)
    result.push({ time: times[i], value: Math.round(ema * 100) / 100 })
  }
  return result
}

export function StockChart({ data, currency, ticker }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [period, setPeriod] = useState<Period>("3M")
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains("dark")
  )

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"))
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !data.length) return

    const bg         = isDark ? "#0d1117" : "#ffffff"
    const textColor  = isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.65)"
    const gridColor  = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"
    const borderColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"
    const currSymbol = currency === "INR" ? "₹" : "$"

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor },
      timeScale: { borderColor, timeVisible: false },
      localization: {
        priceFormatter: (p: number) =>
          `${currSymbol}${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      },
      width: container.clientWidth,
      height: 280,
      handleScroll: true,
      handleScale: true,
    })

    const filtered = data.slice(-PERIOD_BARS[period])
    const times  = filtered.map((d) => d.date as UTCTimestamp)
    const closes = filtered.map((d) => d.close)

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    })
    candleSeries.setData(
      filtered.map((d) => ({
        time: d.date as UTCTimestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
    )

    // Volume series on a separate scale (bottom 20% of chart)
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    })
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })
    volSeries.setData(
      filtered.map((d) => ({
        time: d.date as UTCTimestamp,
        value: d.volume,
        color: d.close >= d.open ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)",
      }))
    )

    // EMA lines computed from filtered price data
    const ema20Series = chart.addSeries(LineSeries, {
      color: "#f97316",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "EMA20",
      crosshairMarkerVisible: false,
    })
    ema20Series.setData(computeEma(closes, times, 20))

    const ema50Series = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "EMA50",
      crosshairMarkerVisible: false,
    })
    ema50Series.setData(computeEma(closes, times, 50))

    chart.timeScale().fitContent()

    const resizeObs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) chart.applyOptions({ width: w })
    })
    resizeObs.observe(container)

    return () => {
      resizeObs.disconnect()
      chart.remove()
    }
  }, [data, period, isDark, currency])

  if (!data.length) return null

  return (
    <div className="rounded-xl border border-border/70 bg-background/50 min-w-0 overflow-hidden p-2.5 sm:p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {ticker} — Price Chart
        </p>
        <div className="flex gap-1">
          {(["1M", "3M", "6M"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "px-2 py-0.5 text-[10px] font-semibold rounded transition-colors",
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="w-full" style={{ height: "280px" }} />
      <div className="flex items-center gap-3 mt-1.5 pl-0.5">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-[#f97316]" />
          EMA20
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-[#3b82f6]" />
          EMA50
        </span>
      </div>
    </div>
  )
}
