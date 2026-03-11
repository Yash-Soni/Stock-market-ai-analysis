import { cn } from "../../lib/utils"

interface AnalysisPoint {
  type: "bullish" | "bearish" | "neutral"
  text: string
}

interface AnalysisCardProps {
  summary: string
  points: AnalysisPoint[]
  verdict: string
  verdictType: "bullish" | "bearish" | "neutral"
}

export function AnalysisCard({
  summary,
  points,
  verdict,
  verdictType,
}: AnalysisCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="text-primary"
            aria-hidden="true"
          >
            <path
              d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z"
              fill="currentColor"
            />
          </svg>
          AI Analysis
        </h4>
      </div>
      <div className="p-4 space-y-4">

        <div className="space-y-1">
          {points.map((point, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span
                className={cn(
                  "mt-1.5 size-2 rounded-full flex-shrink-0",
                  point.type === "bullish" && "bg-success",
                  point.type === "bearish" && "bg-danger",
                  point.type === "neutral" && "bg-warning"
                )}
                aria-hidden="true"
              />
              <p className="text-sm text-foreground/80 leading-relaxed">
                {point.text}
              </p>
            </div>
          ))}
        </div>

        <div
          className={cn(
            "rounded-lg p-3 border",
            verdictType === "bullish" && "bg-success/10 border-success/20",
            verdictType === "bearish" && "bg-danger/10 border-danger/20",
            verdictType === "neutral" && "bg-warning/10 border-warning/20"
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                "text-xs font-bold uppercase tracking-wider",
                verdictType === "bullish" && "text-success",
                verdictType === "bearish" && "text-danger",
                verdictType === "neutral" && "text-warning"
              )}
            >
              Verdict
            </span>
          </div>
          <p
            className={cn(
              "text-sm font-medium",
              verdictType === "bullish" && "text-success",
              verdictType === "bearish" && "text-danger",
              verdictType === "neutral" && "text-warning"
            )}
          >
            {verdict}
          </p>
        </div>
      </div>
    </div>
  )
}
