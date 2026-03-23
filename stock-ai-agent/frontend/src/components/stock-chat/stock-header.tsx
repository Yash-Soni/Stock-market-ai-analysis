import { Badge } from "../../components/ui/badge"
import { Sparkline } from "./sparkline"
import { cn } from "../../lib/utils"

interface StockHeaderProps {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  sparkData: number[]
  sector: string,
  currency: string
}

export function StockHeader({
  symbol,
  name,
  price,
  change,
  changePercent,
  sparkData,
  sector,
  currency
}: StockHeaderProps) {
  const isPositive = change >= 0
  
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border bg-card/50 backdrop-blur-sm w-full max-w-full min-w-0 overflow-hidden">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 mb-1">
          <span className="text-base sm:text-lg font-bold font-mono text-foreground truncate max-w-full">
            {symbol}
          </span>
          <Badge
            variant="secondary"
            className="text-xs bg-accent text-accent-foreground shrink-0"
          >
            {sector}
          </Badge>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground truncate mb-2">{name}</p>
        <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
          <span className="text-xl sm:text-2xl font-bold font-mono text-foreground">
            {currency === "INR" ? "₹" : "$"}
            {price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
          <span
            className={cn(
              "text-xs sm:text-sm font-mono font-medium",
              isPositive ? "text-success" : "text-danger"
            )}
          >
            {isPositive ? "+" : ""}
            {change.toFixed(2)} ({isPositive ? "+" : ""}
            {changePercent.toFixed(2)}%)
          </span>
        </div>
      </div>
      <div className="hidden sm:block shrink-0 self-start">
        <Sparkline data={sparkData} positive={isPositive} />
      </div>
    </div>
  )
}
