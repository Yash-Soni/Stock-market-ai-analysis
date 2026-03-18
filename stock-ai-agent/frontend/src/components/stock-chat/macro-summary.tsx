import { useState, useEffect } from "react"
import { TrendingUp, TrendingDown } from "lucide-react"

export interface MacroEventItem {
  event: string
  sectorsImpacted?: string[]
  sentiment?: {
    bullishSectors?: string[]
    bearishSectors?: string[]
    bullish?: string[]
    bearish?: string[]
  }
}

const VISIBLE_BOXES = 3
const MAX_EVENTS = 6
const ROTATE_INTERVAL_MS = 4000
const CARD_HEIGHT_PX = 88
const GAP_PX = 8
const SLIDE_DURATION_MS = 600
const STEP_PX = CARD_HEIGHT_PX + GAP_PX
const VIEWPORT_HEIGHT_PX = VISIBLE_BOXES * STEP_PX - GAP_PX
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000"

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string")
  return []
}

/** Extract a short 1–2 line event title from raw LLM output (preamble, markdown bold, etc.) */
function parseEventTitle(raw: string): string {
  if (!raw || typeof raw !== "string") return ""
  let s = raw.trim()
  // Remove common LLM preambles (case-insensitive)
  const preamble = /^(here is a possible market-moving macro event[^:]*:?\s*|this headline does not appear[^.]*\.?\s*|it seems like[^!]*!?\s*|here's a market-moving macro event[^:]*:?\s*|no significant market-moving macro event[^.]*\.?\s*)/i
  s = s.replace(preamble, "").trim()
  // Prefer content inside **...** (first occurrence) as the title
  const boldMatch = s.match(/\*\*([^*]+)\*\*/)
  if (boldMatch) return boldMatch[1].trim()
  // Otherwise take first line or first sentence (max ~120 chars)
  const firstLine = s.split(/\n+/)[0]?.trim() || s
  if (firstLine.length <= 120) return firstLine
  const sentenceEnd = firstLine.match(/^[^.!?]{1,120}[.!?]/)
  return sentenceEnd ? sentenceEnd[0].trim() : firstLine.slice(0, 117) + "..."
}

/** Skip items that are clearly not macro events (noise, off-topic) */
function isRealMacroEvent(event: string): boolean {
  const lower = event.toLowerCase()
  const skip = [
    "does not appear to be related",
    "question about a pet",
    "hedgehog",
    "sports award",
    "sports ceremony",
    "not related to a market-moving",
    "if you could provide the actual headlines",
    "if you'd like to provide more headlines"
  ]
  return !skip.some((phrase) => lower.includes(phrase)) && event.length >= 10
}

/** Normalize API response into display-ready MacroEventItem[] */
function parseMacroEvents(data: unknown): MacroEventItem[] {
  if (!Array.isArray(data)) return []
  console.log('data in parseMacroEvents', data);
  return data
    .filter((item): item is Record<string, unknown> => item != null && typeof item === "object")
    .map((item) => {
      const rawEvent = typeof item.event === "string" ? item.event : ""
      const title = parseEventTitle(rawEvent)
      return {
        event: title,
        sectorsImpacted: toArray(item.sectorsImpacted),
        sentiment: {
          bullishSectors: toArray(item.bullishSectors ?? item.bullish),
          bearishSectors: toArray(item.bearishSectors ?? item.bearish)
        }
      }
    })
    .filter((item) => item.event && isRealMacroEvent(item.event))
    .slice(0, MAX_EVENTS)
}

export function MacroSummary() {
  const [events, setEvents] = useState<MacroEventItem[]>([])
  const [startIndex, setStartIndex] = useState(0)
  const [slideOffset, setSlideOffset] = useState(0)
  const [transitionDisabled, setTransitionDisabled] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`${API_BASE}world-events`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return
        const list = parseMacroEvents(data)
        setEvents(list)
      } catch {
        if (!cancelled) setEvents([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Smooth rotation: slide up by one card, then reset index and position
  useEffect(() => {
    if (events.length < 2) return
    const id = setInterval(() => {
      setSlideOffset(-STEP_PX)
    }, ROTATE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [events.length])

  const handleTransitionEnd = () => {
    if (slideOffset === 0) return
    setTransitionDisabled(true)
    setSlideOffset(0)
    setStartIndex((prev) => (prev + 1) % Math.max(1, events.length))
  }

  useEffect(() => {
    if (!transitionDisabled) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setTransitionDisabled(false))
    })
    return () => cancelAnimationFrame(id)
  }, [transitionDisabled, startIndex])

  // For smooth slide we need one extra item (the next one coming in); show 5 when rotating
  const slideCount = events.length >= 2 ? VISIBLE_BOXES + 1 : events.length
  const visibleEvents =
    events.length === 0
      ? []
      : Array.from({ length: slideCount }, (_, i) =>
          events[(startIndex + i) % events.length]
        )

  if (loading) {
    return (
      <div className="flex flex-col h-full p-3 border-l border-border bg-card/20">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Global macro
        </h3>
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col h-full p-3 border-l border-border bg-card/20">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Global macro
        </h3>
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No events
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full border-l border-border bg-card/20 w-72 shrink-0">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-3 pb-2">
        Global macro
      </h3>
      <div
        className="flex-1 overflow-hidden px-2 pb-3"
        style={{ minHeight: VIEWPORT_HEIGHT_PX }}
      >
        <div
          className="flex flex-col pr-2"
          style={{
            transform: `translateY(${slideOffset}px)`,
            transition: transitionDisabled
              ? "none"
              : `transform ${SLIDE_DURATION_MS}ms ease-out`,
            gap: GAP_PX,
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          {visibleEvents.map((item, idx) => {
            const bullish = toArray(
              item.sentiment?.bullishSectors ?? item.sentiment?.bullish
            )
            const bearish = toArray(
              item.sentiment?.bearishSectors ?? item.sentiment?.bearish
            )
            return (
              <div
                key={`${startIndex}-${idx}-${item.event.slice(0, 20)}`}
                className="rounded-lg border border-border bg-card p-2.5 shadow-sm shrink-0"
                style={{ minHeight: CARD_HEIGHT_PX }}
              >
                <p className="text-md font-medium text-foreground leading-snug line-clamp-2 mb-2">
                  {item.event}
                </p>
                <div className="flex flex-wrap gap-1">
                  {bullish.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[12px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    >
                      <TrendingUp className="size-3.5" />
                      {s}
                    </span>
                  ))}
                  {bearish.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[12px] font-medium bg-red-500/15 text-red-700 dark:text-red-400"
                    >
                      <TrendingDown className="size-3.5" />
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
