import { cn } from "@/lib/utils"

interface SparklineProps {
  data: number[]
  className?: string
  positive?: boolean
}

export function Sparkline({ data, className, positive = true }: SparklineProps) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const width = 120
  const height = 32
  const padding = 2

  const points = data
    .map((value, index) => {
      const x = padding + (index / (data.length - 1)) * (width - padding * 2)
      const y =
        height - padding - ((value - min) / range) * (height - padding * 2)
      return `${x},${y}`
    })
    .join(" ")

  const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`

  const gradientId = `sparkGrad-${positive ? "up" : "down"}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-[120px] h-8", className)}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor={
              positive ? "oklch(0.72 0.19 155)" : "oklch(0.60 0.22 25)"
            }
            stopOpacity="0.3"
          />
          <stop
            offset="100%"
            stopColor={
              positive ? "oklch(0.72 0.19 155)" : "oklch(0.60 0.22 25)"
            }
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={
          positive ? "oklch(0.72 0.19 155)" : "oklch(0.60 0.22 25)"
        }
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
