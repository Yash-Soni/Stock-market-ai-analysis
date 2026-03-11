import { cn } from "../../lib/utils"
import type { ReactNode } from "react"

interface Metric {
  label: string
  value: string | number
  signal?: "bullish" | "bearish" | "neutral"
}

interface MetricsCardProps {
  title: string
  metrics: Metric[]
  icon: ReactNode
}

export function MetricsCard({ title, metrics, icon }: MetricsCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="text-primary">{icon}</span>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <div className="divide-y divide-border/50">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/30 transition-colors"
          >
            <span className="text-sm text-muted-foreground">{metric.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-medium text-foreground">
                {metric.value}
              </span>
              {metric.signal && (
                <span
                  className={cn(
                    "size-2 rounded-full",
                    metric.signal === "bullish" && "bg-success",
                    metric.signal === "bearish" && "bg-danger",
                    metric.signal === "neutral" && "bg-warning"
                  )}
                  aria-label={metric.signal}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
