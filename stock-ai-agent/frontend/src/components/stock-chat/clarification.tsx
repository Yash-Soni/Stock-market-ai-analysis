import { HelpCircle, Search } from "lucide-react"

interface Candidate {
  symbol: string
  name: string
  exchange: string
}

interface ClarificationProps {
  question: string
  suggestions?: string[]
  candidates?: Candidate[]
  onSend?: (text: string) => void
}

export function Clarification({ question, suggestions = [], candidates = [], onSend }: ClarificationProps) {
  const hasDisambiguation = candidates.length > 0

  return (
    <div className="space-y-2 min-w-0">
      <div className="flex items-start gap-2.5 rounded-[1.25rem] rounded-tl-sm border border-border/80 bg-muted/40 px-3.5 py-2.5 shadow-sm min-w-0">
        {hasDisambiguation
          ? <Search className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          : <HelpCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        }
        <p className="text-[15px] leading-relaxed text-foreground wrap-anywhere">{question}</p>
      </div>

      {hasDisambiguation && (
        <div className="flex flex-wrap gap-2 pl-1">
          {candidates.map((c) => (
            <button
              key={c.symbol}
              type="button"
              onClick={() => onSend?.(`Analyze ${c.symbol}`)}
              className="flex flex-col items-start rounded-xl border border-border bg-background/80 px-3 py-2 text-left hover:bg-accent hover:border-primary/40 transition-colors"
            >
              <span className="text-sm font-semibold text-foreground">{c.symbol}</span>
              <span className="text-[11px] text-muted-foreground leading-tight">{c.name}</span>
              <span className="mt-0.5 text-[10px] font-medium text-primary/70 uppercase tracking-wide">{c.exchange}</span>
            </button>
          ))}
        </div>
      )}

      {!hasDisambiguation && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSend?.(s)}
              className="rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
