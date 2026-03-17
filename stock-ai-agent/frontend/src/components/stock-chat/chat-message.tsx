import type { ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import { TrendingUp, BarChart3, FileText, DollarSign } from "lucide-react"
import { Sparkline } from "./sparkline"
import { ScoreGauge } from "./score-gauge"
import { MetricsCard } from "./metrics-card"
import { StockHeader } from "./stock-header.tsx"
import { AnalysisCard } from "./analysis-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs"

export interface StockAnalysis {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  sparkData: number[]
  sector: string
  buyScore: number
  riskScore: number
  technicals: {
    label: string
    value: string | number
    signal?: "bullish" | "bearish" | "neutral"
  }[]
  fundamentals: {
    label: string
    value: string | number
    signal?: "bullish" | "bearish" | "neutral"
  }[]
  analysisSummary: string
  analysisPoints: { type: "bullish" | "bearish" | "neutral"; text: string }[]
  verdict: string
  verdictType: "bullish" | "bearish" | "neutral"
  /** Raw markdown from backend AI reply; rendered below the verdict when present */
  analysisMarkdown?: string,
  macroSummary?: string,
  currency: string,
  chart_data?: {
    prices: number[],
    dates: string[]
  }
  dividend_yield?: number,
  recent_dividends?: { date: string, amount: number }[],
  avg_dividend?: number,
}

export interface ChatMessageData {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date | string | number
  stockAnalysis?: StockAnalysis
  /** When backend returns multiple analyses (e.g. analyses array) */
  stockAnalyses?: StockAnalysis[]
  isLoading?: boolean
}

interface ChatMessageProps {
  message: ChatMessageData
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user"

  const formatMessageTime = (timestamp: Date | string | number) => {
    if (typeof timestamp === "string" || typeof timestamp === "number") {
      timestamp = new Date(timestamp)
    }
    return timestamp.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-md">
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5">
            <p className="text-sm">{message.content}</p>
          </div>
          <span className="text-[10px] text-muted-foreground mt-1 block text-right">
            {formatMessageTime(message.timestamp)}
          </span>
        </div>
      </div>
    )
  }

  if (message.isLoading) {
    return (
      <div className="flex justify-start mb-4">
        <div className="flex items-start gap-3 max-w-2xl">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <TrendingUp className="size-4 text-primary" />
          </div>
          <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex gap-1" aria-label="Analyzing">
                <span className="size-2 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                <span className="size-2 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                <span className="size-2 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-muted-foreground">
                Analyzing market data...
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start mb-6">
      <div className="flex items-start gap-3 max-w-2xl w-full">
        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <TrendingUp className="size-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          {message.content && !message.stockAnalysis && !message.stockAnalyses?.length && (
            <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
              <p className="text-sm text-foreground leading-relaxed">
                {message.content}
              </p>
            </div>
          )}

          {(message.stockAnalyses?.length ? message.stockAnalyses : message.stockAnalysis ? [message.stockAnalysis] : []).map((analysis, idx) => (
            <div key={analysis.symbol + String(idx)} className={idx > 0 ? "pt-6 mt-6 border-t border-border space-y-3" : "space-y-3"}>
              {analysis.symbol && (
                <>
                  <StockHeader
                    symbol={analysis.symbol}
                    name={analysis.name}
                    price={analysis.price}
                    change={analysis.change}
                    changePercent={analysis.changePercent}
                    sparkData={analysis.sparkData}
                    sector={analysis.sector}
                    currency={analysis.currency}
                  />

                  <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50">
                    <ScoreGauge
                      value={analysis.buyScore}
                      max={100}
                      label="Buy Score"
                    />
                    <div className="h-12 w-px bg-border" />
                    <ScoreGauge
                      value={analysis.riskScore}
                      max={100}
                      label="Risk"
                    />
                  </div>

                  {analysis.chart_data?.prices && analysis.chart_data.prices.length >= 2 && (
                    <div className="rounded-xl border border-border bg-card/50 p-4">
                      <div className="flex items-baseline justify-between gap-2 mb-2">
                        <p className="text-xs font-medium text-muted-foreground">Price (10d)</p>
                        <div className="text-right text-xs text-muted-foreground">
                          <span className="font-mono text-foreground">
                            {analysis.currency === "INR" ? "₹" : "$"}
                            {analysis.chart_data.prices[analysis.chart_data.prices.length - 1].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="ml-1.5">
                            (Range {Math.min(...analysis.chart_data.prices).toFixed(2)} – {Math.max(...analysis.chart_data.prices).toFixed(2)})
                          </span>
                        </div>
                      </div>
                      <Sparkline
                        data={analysis.chart_data.prices}
                        className="w-full h-16"
                        segmentColors
                      />
                      {(analysis.chart_data.dates?.length === analysis.chart_data.prices.length ? (
                        <>
                          <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground font-mono">
                            {analysis.chart_data.dates.map((d) => (
                              <span key={d} title={d}>
                                {d.slice(5)}
                              </span>
                            ))}
                          </div>
                          <div className="flex justify-between mt-0.5 text-[10px] text-muted-foreground font-mono">
                            {analysis.chart_data.prices.map((p, i) => (
                              <span key={`${analysis.chart_data!.dates![i]}-${p}`}>
                                {(analysis.currency === "INR" ? "₹" : "$")}{p.toFixed(2)}
                              </span>
                            ))}
                          </div>
                        </>
                      ) : null)}
                    </div>
                  )}

                  <Tabs defaultValue="technicals" className="w-full">
                    <TabsList className="w-full bg-secondary">
                      <TabsTrigger
                        value="technicals"
                        className="flex-1 gap-1.5 text-xs"
                      >
                        <BarChart3 className="size-3.5" />
                        Technicals
                      </TabsTrigger>
                      <TabsTrigger
                        value="dividends"
                        className="flex-1 gap-1.5 text-xs"
                      >
                        <DollarSign className="size-3.5" />
                        Dividends
                      </TabsTrigger>
                      <TabsTrigger
                        value="fundamentals"
                        className="flex-1 gap-1.5 text-xs"
                      >
                        <FileText className="size-3.5" />
                        Fundamentals
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="technicals">
                      <MetricsCard
                        title="Technical Indicators"
                        icon={<BarChart3 className="size-4" />}
                        metrics={analysis.technicals}
                      />
                    </TabsContent>
                    <TabsContent value="dividends">
                      <MetricsCard
                        title="Dividend Metrics"
                        icon={<DollarSign className="size-4" />}
                        metrics={[
                          {
                            label: "Dividend Yield",
                            value: analysis.dividend_yield ? `${analysis.dividend_yield.toFixed(2)}%` : "N/A",
                          },
                          {
                            label: "Total Dividend Last Year",
                            value: analysis.avg_dividend ? `${analysis.currency === "INR" ? "₹ " : "$ "}${analysis.avg_dividend.toFixed(2)}` : "N/A",
                          }
                        ]}
                      />
                      <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                          <DollarSign className="size-4 text-primary" />
                          <h4 className="text-sm font-semibold text-foreground">Recent Dividends (1y)</h4>
                        </div>
                        {analysis.recent_dividends?.length ? (
                          <>
                            <div className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground border-b border-border/50">
                              <span>Date</span>
                              <span>Amount</span>
                            </div>
                            <div className="divide-y divide-border/50">
                              {analysis.recent_dividends.map((d) => (
                                <div
                                  key={d.date}
                                  className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2.5 hover:bg-accent/30 transition-colors items-center"
                                >
                                  <span className="text-sm text-foreground">{d.date}</span>
                                  <span className="text-sm font-mono font-medium text-foreground">
                                    {analysis.currency === "INR" ? "₹" : "$"}
                                    {d.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="px-4 py-4 text-sm text-muted-foreground">No dividends in the last year.</p>
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value="fundamentals">
                      <MetricsCard
                        title="Fundamental Metrics"
                        icon={<FileText className="size-4" />}
                        metrics={analysis.fundamentals}
                      />
                    </TabsContent>
                  </Tabs>

                  <AnalysisCard
                    summary={analysis.analysisSummary}
                    points={analysis.analysisPoints}
                    verdict={analysis.verdict}
                    verdictType={analysis.verdictType}
                  />
                </>
              )}

              {analysis.analysisMarkdown && (
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                    {message.stockAnalysis?.symbol || message.stockAnalyses?.[0]?.symbol}
                    - Full Analysis {message.stockAnalyses?.length && message.stockAnalyses.length > 1 ? `· ${analysis.symbol}` : ""}
                  </h4>
                  <div className="text-sm text-foreground/90 leading-relaxed prose prose-sm max-w-none [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_p]:my-2 [&_ul]:list-disc [&_ul]:list-inside [&_ol]:list-decimal [&_ol]:list-inside">
                    <ReactMarkdown
                      components={{
                        h3: ({ children }: { children?: ReactNode }) => <h3 className="font-semibold text-foreground text-base mt-4 mb-2 first:mt-0">{children}</h3>,
                        p: ({ children }: { children?: ReactNode }) => <p className="my-2">{children}</p>,
                        ul: ({ children }: { children?: ReactNode }) => <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>,
                        ol: ({ children }: { children?: ReactNode }) => <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>,
                        li: ({ children }: { children?: ReactNode }) => <li className="ml-2">{children}</li>,
                        strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold">{children}</strong>,
                      }}
                    >
                      {analysis.analysisMarkdown}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          ))}

          <span className="text-[10px] text-muted-foreground mt-1 block">
            {formatMessageTime(message.timestamp)}
          </span>
        </div>
      </div>
    </div>
  )
}
