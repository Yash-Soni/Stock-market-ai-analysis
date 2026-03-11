import { cn } from "@/lib/utils"

interface ScoreGaugeProps {
  value: number
  max: number
  label: string
  size?: "sm" | "md"
}

export function ScoreGauge({ value, max, label, size = "md" }: ScoreGaugeProps) {
  const percentage = (value / max) * 100
  const radius = size === "md" ? 40 : 30
  const strokeWidth = size === "md" ? 6 : 5
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference
  const svgSize = (radius + strokeWidth) * 2

  const getColor = () => {
    if (percentage >= 70) return "text-success"
    if (percentage >= 40) return "text-warning"
    return "text-danger"
  }

  const getTrackColor = () => {
    if (percentage >= 70) return "text-success/15"
    if (percentage >= 40) return "text-warning/15"
    return "text-danger/15"
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={radius + strokeWidth}
            cy={radius + strokeWidth}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className={getTrackColor()}
          />
          <circle
            cx={radius + strokeWidth}
            cy={radius + strokeWidth}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={cn("transition-all duration-700 ease-out", getColor())}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "font-mono font-bold",
              size === "md" ? "text-lg" : "text-sm"
            )}
          >
            {value}
          </span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
        {label}
      </span>
    </div>
  )
}
