import { useState } from "react"
import { HelpCircle, Search } from "lucide-react"

interface Candidate {
  symbol: string
  name: string
  exchange: string
}

interface SuggestionItem {
  label: string
  value: string
}

interface ClarificationProps {
  question: string
  suggestions?: Array<SuggestionItem | string>
  candidates?: Candidate[]
  onSend?: (text: string) => void
}

export function Clarification({ question, suggestions = [], candidates = [], onSend }: ClarificationProps) {
  const hasDisambiguation = candidates.length > 0
  const hasLocalSuggestions = suggestions.length > 0
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null)

  function handleSuggestionClick(value: string, idx: number) {
    if (loadingIdx !== null) return
    setLoadingIdx(idx)
    onSend?.(value)
  }

  return (
    <div className="space-y-2 min-w-0">
      <div className="flex items-start gap-2.5 rounded-[1.25rem] rounded-tl-sm border border-border/80 bg-muted/40 px-3.5 py-2.5 shadow-sm min-w-0">
        {hasDisambiguation || hasLocalSuggestions
          ? <Search className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          : <HelpCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        }
        <p className="text-[15px] leading-relaxed text-foreground wrap-anywhere">{question}</p>
      </div>

      {hasLocalSuggestions && (
        <div className="flex flex-wrap gap-2 pl-1">
          {suggestions.map((s, i) => {
            const label = typeof s === 'string' ? s : s.label
            const value = typeof s === 'string' ? s : s.value
            const isLoading = loadingIdx === i
            return (
              <button
                key={value + i}
                type="button"
                disabled={loadingIdx !== null}
                onClick={() => handleSuggestionClick(value, i)}
                className="rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-foreground hover:bg-accent hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "…" : label}
              </button>
            )
          })}
        </div>
      )}

      {hasDisambiguation && (
        <div className="flex flex-wrap gap-2 pl-1">
          {candidates.map((c, i) => {
            const isLoading = loadingIdx === 1000 + i
            return (
              <button
                key={c.symbol}
                type="button"
                disabled={loadingIdx !== null}
                onClick={() => {
                  if (loadingIdx !== null) return
                  setLoadingIdx(1000 + i)
                  onSend?.(`Analyze ${c.symbol}`)
                }}
                className="flex flex-col items-start rounded-xl border border-border bg-background/80 px-3 py-2 text-left hover:bg-accent hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-sm font-semibold text-foreground">{isLoading ? "…" : c.symbol}</span>
                <span className="text-[11px] text-muted-foreground leading-tight">{c.name}</span>
                <span className="mt-0.5 text-[10px] font-medium text-primary/70 uppercase tracking-wide">{c.exchange}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
