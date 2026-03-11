import { cn } from "../../lib/utils"
import { TrendingUp, Clock, Star, BarChart3, Moon, Sun } from "lucide-react"
import type { StockAnalysis } from "./chat-message"

interface ChatSidebarProps {
  recentAnalyses: StockAnalysis[]
  onSelectSymbol: (symbol: string) => void
  theme: "light" | "dark"
  onToggleTheme: () => void
}

const WATCHLIST = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "TSLA", name: "Tesla, Inc." },
  { symbol: "INFY", name: "Infosys Limited" },
]

export function ChatSidebar({
  recentAnalyses,
  onSelectSymbol,
  theme,
  onToggleTheme,
}: ChatSidebarProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo + Theme toggle */}
      <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <TrendingUp className="size-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground tracking-tight truncate">
              StockPulse
            </h2>
            <p className="text-[10px] text-muted-foreground">AI Agent</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          className={cn(
            "size-9 rounded-lg flex items-center justify-center shrink-0 border transition-colors",
            theme === "dark"
              ? "bg-white border-white/30 text-black hover:bg-white/90"
              : "bg-black border-black/20 text-white hover:bg-black/90"
          )}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Watchlist */}
        <div>
          <div className="flex items-center gap-1.5 px-2 mb-2">
            <Star className="size-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Watchlist
            </span>
          </div>
          <div className="space-y-0.5">
            {WATCHLIST.map((stock) => (
              <button
                key={stock.symbol}
                type="button"
                onClick={() => onSelectSymbol(stock.symbol)}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors text-left group"
              >
                <div className="size-7 rounded-md bg-accent flex items-center justify-center">
                  <BarChart3 className="size-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold font-mono text-foreground block">
                    {stock.symbol}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate block">
                    {stock.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Analyses */}
        {recentAnalyses.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-2 mb-2">
              <Clock className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Analyses
              </span>
            </div>
            <div className="space-y-0.5">
              {recentAnalyses.map((analysis, idx) => (
                <button
                  key={`${analysis.symbol}-${idx}`}
                  type="button"
                  onClick={() => onSelectSymbol(analysis.symbol)}
                  className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        "size-7 rounded-md flex items-center justify-center",
                        analysis.verdictType === "bullish" &&
                          "bg-success/15",
                        analysis.verdictType === "bearish" &&
                          "bg-danger/15",
                        analysis.verdictType === "neutral" &&
                          "bg-warning/15"
                      )}
                    >
                      <TrendingUp
                        className={cn(
                          "size-3.5",
                          analysis.verdictType === "bullish" &&
                            "text-success",
                          analysis.verdictType === "bearish" &&
                            "text-danger rotate-180",
                          analysis.verdictType === "neutral" &&
                            "text-warning"
                        )}
                      />
                    </div>
                    <div>
                      <span className="text-xs font-semibold font-mono text-foreground block">
                        {analysis.symbol}
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        Score: {analysis.buyScore}/100
                      </span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium capitalize",
                      analysis.verdictType === "bullish" && "text-success",
                      analysis.verdictType === "bearish" && "text-danger",
                      analysis.verdictType === "neutral" && "text-warning"
                    )}
                  >
                    {analysis.verdictType}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
          Data for demonstration only. Not financial advice.
        </p>
      </div>
    </div>
  )
}
