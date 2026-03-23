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
      <div className="mb-3 flex w-full min-w-0 max-w-full justify-end box-border pr-2 pl-1 max-lg:pr-3">
        {/*
          Keep bubbles inside the thread: % is relative to the list column (fixed by
          ScrollArea inner wrapper override in globals.css). Cap rem + % for readability.
        */}
        <div className="w-fit min-w-0 max-w-[min(17.5rem,82%)] sm:max-w-[min(20rem,78%)]">
          <div className="box-border min-w-0 rounded-[1.25rem] rounded-br-md bg-primary px-3 py-2 text-primary-foreground shadow-sm sm:px-3.5">
            <p className="text-[15px] leading-snug wrap-anywhere">
              {message.content}
            </p>
          </div>
          <span className="mt-0.5 block text-right text-[10px] text-muted-foreground">
            {formatMessageTime(message.timestamp)}
          </span>
        </div>
      </div>
    )
  }

  if (message.isLoading) {
    return (
      <div className="flex justify-start mb-3 w-full min-w-0 max-w-full px-0.5">
        <div className="max-w-[min(100%,36rem)] w-full min-w-0">
          <div className="rounded-[1.25rem] rounded-tl-sm border border-border/80 bg-muted/40 px-3.5 py-2.5 min-w-0 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="flex gap-1" aria-label="Analyzing">
                <span className="size-2 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                <span className="size-2 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                <span className="size-2 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
              </div>
              <span className="text-sm text-muted-foreground">
                Analyzing market data…
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-4 flex w-full min-w-0 max-w-full justify-start px-0.5 box-border">
      <div className="flex w-full min-w-0 max-w-full items-start gap-2 sm:gap-3">
        <div className="hidden sm:flex size-8 rounded-full bg-primary/15 items-center justify-center shrink-0 mt-0.5 border border-primary/20">
          <TrendingUp className="size-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 space-y-2 sm:space-y-3">
          {message.content && !message.stockAnalysis && !message.stockAnalyses?.length && (
            <div className="min-w-0 max-w-full overflow-hidden rounded-[1.25rem] rounded-tl-sm border border-border/80 bg-muted/40 px-3.5 py-2.5 shadow-sm box-border">
              <p className="text-[15px] leading-relaxed text-foreground wrap-anywhere">
                {message.content}
              </p>
            </div>
          )}

          {(message.stockAnalyses?.length ? message.stockAnalyses : message.stockAnalysis ? [message.stockAnalysis] : []).map((analysis, idx) => (
            <div key={analysis.symbol + String(idx)} className={`${idx > 0 ? "pt-5 mt-5 border-t border-border/60 space-y-2 sm:space-y-3" : "space-y-2 sm:space-y-3"} min-w-0`}>
              {analysis.symbol && (
                <div className="rounded-[1.25rem] rounded-tl-sm border border-border/80 bg-muted/30 dark:bg-muted/20 px-2.5 pt-2.5 pb-3 sm:p-3 min-w-0 max-w-full shadow-sm space-y-2 sm:space-y-3">
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

                  <div className="flex min-w-0 max-w-full flex-row items-stretch justify-center gap-1 overflow-hidden rounded-xl border border-border/70 bg-background/50 p-2 sm:justify-around sm:gap-2 sm:p-4">
                    <div className="flex min-w-0 flex-1 justify-center">
                      <ScoreGauge
                        value={analysis.buyScore}
                        max={100}
                        label="Buy Score"
                        size="sm"
                      />
                    </div>
                    <div className="h-auto w-px shrink-0 self-stretch bg-border sm:min-h-[4.5rem]" aria-hidden />
                    <div className="flex min-w-0 flex-1 justify-center">
                      <ScoreGauge
                        value={analysis.riskScore}
                        max={100}
                        label="Risk"
                        size="sm"
                      />
                    </div>
                  </div>

                  {analysis.chart_data?.prices && analysis.chart_data.prices.length >= 2 && (
                    <div className="rounded-xl border border-border/70 bg-background/50 min-w-0 overflow-hidden p-2.5 sm:p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                        <p className="text-xs font-medium text-muted-foreground">Price (10d)</p>
                        <div className="text-right text-xs text-muted-foreground min-w-0">
                          <span className="font-mono text-foreground">
                            {analysis.currency === "INR" ? "₹" : "$"}
                            {analysis.chart_data.prices[analysis.chart_data.prices.length - 1].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="ml-1.5 whitespace-nowrap">
                            (Range {Math.min(...analysis.chart_data.prices).toFixed(2)} – {Math.max(...analysis.chart_data.prices).toFixed(2)})
                          </span>
                        </div>
                      </div>
                      <Sparkline
                        data={analysis.chart_data.prices}
                        className="w-full h-16 min-w-0"
                        segmentColors
                      />
                      {(analysis.chart_data.dates?.length === analysis.chart_data.prices.length ? (
                        <div className="mt-2 space-y-1 text-[10px] text-muted-foreground font-mono">
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 justify-between">
                            {analysis.chart_data.dates.map((d) => (
                              <span key={d} title={d} className="min-w-0">
                                {d.slice(5)}
                              </span>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 justify-between">
                            {analysis.chart_data.prices.map((p, i) => (
                              <span key={`${analysis.chart_data!.dates![i]}-${p}`} className="min-w-0">
                                {(analysis.currency === "INR" ? "₹" : "$")}{p.toFixed(2)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null)}
                    </div>
                  )}

                  <Tabs defaultValue="technicals" className="w-full min-w-0 max-w-full overflow-x-hidden">
                    <TabsList className="grid h-auto w-full min-w-0 max-w-full grid-cols-1 gap-1 rounded-xl bg-secondary/80 p-1 sm:grid-cols-3 sm:gap-0.5">
                      <TabsTrigger
                        value="technicals"
                        className="flex h-auto w-full min-w-0 max-w-full flex-none flex-row items-center justify-start gap-2.5 rounded-lg px-3 py-2.5 text-sm sm:min-h-9 sm:justify-center sm:gap-1.5 sm:rounded-md sm:px-2 sm:py-1.5 sm:text-xs data-[state=active]:shadow-sm"
                      >
                        <BarChart3 className="size-4 shrink-0 sm:size-3.5" />
                        <span className="min-w-0 truncate text-left sm:text-center">Technicals</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="dividends"
                        className="flex h-auto w-full min-w-0 max-w-full flex-none flex-row items-center justify-start gap-2.5 rounded-lg px-3 py-2.5 text-sm sm:min-h-9 sm:justify-center sm:gap-1.5 sm:rounded-md sm:px-2 sm:py-1.5 sm:text-xs data-[state=active]:shadow-sm"
                      >
                        <DollarSign className="size-4 shrink-0 sm:size-3.5" />
                        <span className="min-w-0 truncate text-left sm:text-center">Dividends</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="fundamentals"
                        className="flex h-auto w-full min-w-0 max-w-full flex-none flex-row items-center justify-start gap-2.5 rounded-lg px-3 py-2.5 text-sm sm:min-h-9 sm:justify-center sm:gap-1.5 sm:rounded-md sm:px-2 sm:py-1.5 sm:text-xs data-[state=active]:shadow-sm"
                      >
                        <FileText className="size-4 shrink-0 sm:size-3.5" />
                        <span className="min-w-0 truncate text-left sm:text-center">Fundamentals</span>
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="technicals" className="mt-2 w-full min-w-0 max-w-full">
                      <MetricsCard
                        title="Technical Indicators"
                        icon={<BarChart3 className="size-4" />}
                        metrics={analysis.technicals}
                      />
                    </TabsContent>
                    <TabsContent value="dividends" className="mt-2 w-full min-w-0 max-w-full space-y-2">
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
                      <div className="rounded-xl w-full border border-border/70 bg-background/50 overflow-hidden min-w-0 max-w-full">
                        <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4 border-b border-border min-w-0">
                          <DollarSign className="size-4 shrink-0 text-primary" />
                          <h4 className="text-sm font-semibold text-foreground truncate">Recent Dividends (1y)</h4>
                        </div>
                        {analysis.recent_dividends?.length ? (
                          <>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-3 py-2 sm:px-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground border-b border-border/50 min-w-0">
                              <span className="min-w-0">Date</span>
                              <span className="shrink-0 text-right">Amount</span>
                            </div>
                            <div className="divide-y divide-border/50 min-w-0">
                              {analysis.recent_dividends.map((d) => (
                                <div
                                  key={d.date}
                                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-3 py-2.5 sm:px-4 hover:bg-accent/30 transition-colors items-center min-w-0"
                                >
                                  <span className="text-sm text-foreground wrap-break-word">{d.date}</span>
                                  <span className="text-sm font-mono font-medium text-foreground text-right tabular-nums shrink-0 wrap-break-word">
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
                    <TabsContent value="fundamentals" className="mt-2 w-full min-w-0 max-w-full">
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
                </div>
              )}

              {analysis.analysisMarkdown && (
                <div className="rounded-[1.25rem] rounded-tl-sm border border-border/80 bg-muted/30 dark:bg-muted/20 p-3 sm:p-4 min-w-0 max-w-full overflow-x-hidden shadow-sm">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 wrap-break-word">
                    {message.stockAnalysis?.symbol || message.stockAnalyses?.[0]?.symbol}
                    {" "}
                    — Full Analysis
                    {message.stockAnalyses?.length && message.stockAnalyses.length > 1 ? ` · ${analysis.symbol}` : ""}
                  </h4>
                  <div className="text-sm text-foreground/90 leading-relaxed prose prose-sm max-w-full min-w-0 [&_*]:max-w-full [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:wrap-break-word [&_p]:my-2 [&_p]:wrap-break-word [&_ul]:list-disc [&_ul]:list-outside [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:list-outside [&_ol]:pl-4 [&_li]:wrap-break-word [&_code]:wrap-break-word">
                    <ReactMarkdown
                      components={{
                        h3: ({ children }: { children?: ReactNode }) => <h3 className="font-semibold text-foreground text-base mt-4 mb-2 first:mt-0 wrap-break-word">{children}</h3>,
                        p: ({ children }: { children?: ReactNode }) => <p className="my-2 wrap-break-word">{children}</p>,
                        ul: ({ children }: { children?: ReactNode }) => <ul className="list-disc list-outside my-2 space-y-1 pl-4">{children}</ul>,
                        ol: ({ children }: { children?: ReactNode }) => <ol className="list-decimal list-outside my-2 space-y-1 pl-4">{children}</ol>,
                        li: ({ children }: { children?: ReactNode }) => <li className="wrap-break-word">{children}</li>,
                        strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold wrap-break-word">{children}</strong>,
                      }}
                    >
                      {analysis.analysisMarkdown}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          ))}

          <span className="text-[10px] text-muted-foreground mt-0.5 block pl-0.5 sm:pl-10">
            {formatMessageTime(message.timestamp)}
          </span>
        </div>
      </div>
    </div>
  )
}
