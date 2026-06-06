import { HelpCircle } from "lucide-react"

interface ClarificationProps {
  question: string
  suggestions?: string[]
  onSend?: (text: string) => void
}

export function Clarification({ question, suggestions = [], onSend }: ClarificationProps) {
  return (
    <div className="space-y-2 min-w-0">
      <div className="flex items-start gap-2.5 rounded-[1.25rem] rounded-tl-sm border border-border/80 bg-muted/40 px-3.5 py-2.5 shadow-sm min-w-0">
        <HelpCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-[15px] leading-relaxed text-foreground wrap-anywhere">{question}</p>
      </div>
      {suggestions.length > 0 && (
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
