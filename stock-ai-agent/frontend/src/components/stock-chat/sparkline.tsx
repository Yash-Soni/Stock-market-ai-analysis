import { cn } from "../../lib/utils"

const STROKE_UP = "oklch(0.72 0.19 155)"
const STROKE_DOWN = "oklch(0.60 0.22 25)"

interface SparklineProps {
  data: number[]
  className?: string
  /** Single color for whole line (based on overall direction) */
  positive?: boolean
  /** When true, each segment is green (up) or red (down) by price change */
  segmentColors?: boolean
}

export function Sparkline({ data, className, positive = true, segmentColors = false }: SparklineProps) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const width = 120
  const height = 32
  const padding = 2

  const coords = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * (width - padding * 2)
    const y = height - padding - ((value - min) / range) * (height - padding * 2)
    return { x, y }
  })

  const points = coords.map((p) => `${p.x},${p.y}`).join(" ")
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
            stopColor={positive ? STROKE_UP : STROKE_DOWN}
            stopOpacity="0.3"
          />
          <stop
            offset="100%"
            stopColor={positive ? STROKE_UP : STROKE_DOWN}
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      {!segmentColors && <polygon points={areaPoints} fill={`url(#${gradientId})`} />}
      {segmentColors ? (
        <g>
          {coords.slice(0, -1).map((from, i) => {
            const to = coords[i + 1]
            const up = data[i + 1] >= data[i]
            return (
              <line
                key={i}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={up ? STROKE_UP : STROKE_DOWN}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )
          })}
        </g>
      ) : (
        <polyline
          points={points}
          fill="none"
          stroke={positive ? STROKE_UP : STROKE_DOWN}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}
