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
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-card/50 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4 sm:py-3">
        <span className="shrink-0 text-primary">{icon}</span>
        <h4 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <div className="divide-y divide-border/50">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="min-w-0 px-3 py-2.5 hover:bg-accent/30 sm:px-4"
          >
            {/* Mobile: stack label / value so nothing is pushed off-screen */}
            <div className="flex min-w-0 gap-1 flex-row items-center justify-between sm:gap-3">
              <span className="text-sm text-muted-foreground wrap-break-word sm:min-w-0 sm:max-w-[58%]">
                {metric.label}
              </span>
              <div className="flex min-w-0 items-center justify-between gap-2 sm:min-w-0 sm:max-w-[42%] sm:justify-end">
                <span className="min-w-0 flex-1 wrap-break-word text-left text-sm font-mono font-medium text-foreground tabular-nums sm:flex-none sm:text-right">
                  {metric.value}
                </span>
                {metric.signal && (
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      metric.signal === "bullish" && "bg-success",
                      metric.signal === "bearish" && "bg-danger",
                      metric.signal === "neutral" && "bg-warning"
                    )}
                    aria-label={metric.signal}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
