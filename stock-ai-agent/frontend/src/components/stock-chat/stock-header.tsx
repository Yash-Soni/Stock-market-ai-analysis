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
    <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="text-lg font-bold font-mono text-foreground">
            {symbol}
          </span>
          <Badge
            variant="secondary"
            className="text-xs bg-accent text-accent-foreground"
          >
            {sector}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground truncate mb-2">{name}</p>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold font-mono text-foreground">
            {currency === "INR" ? "₹" : "$"}
            {price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
          <span
            className={cn(
              "text-sm font-mono font-medium",
              isPositive ? "text-success" : "text-danger"
            )}
          >
            {isPositive ? "+" : ""}
            {change.toFixed(2)} ({isPositive ? "+" : ""}
            {changePercent.toFixed(2)}%)
          </span>
        </div>
      </div>
      <div className="flex-shrink-0">
        <Sparkline data={sparkData} positive={isPositive} />
      </div>
    </div>
  )
}
