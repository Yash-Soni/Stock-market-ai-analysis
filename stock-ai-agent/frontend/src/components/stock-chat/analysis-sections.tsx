import { useState, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import { ChevronDown } from "lucide-react"
import { cn } from "../../lib/utils"

// ── Section parser ──────────────────────────────────────────────────────────

type SectionName = "decision" | "entry" | "risk" | "longterm" | "layman" | "preamble"

const HEADERS: { name: SectionName; re: RegExp }[] = [
  { name: "decision", re: /(?:📊\s*)?Decision Summary\s*:?/i },
  { name: "entry",    re: /Entry Plan\s*:?/i },
  { name: "risk",     re: /Risk Note\s*:?/i },
  { name: "longterm", re: /Long[-\s]?[Tt]erm View\s*:?/i },
  { name: "layman",   re: /Layman[-\s]?[Ff]riendly Insight\s*:?/i },
]

function parseSections(text: string): Partial<Record<SectionName, string>> {
  const result: Partial<Record<SectionName, string>> = {}

  type Hit = { name: SectionName; start: number; headerEnd: number }
  const hits: Hit[] = []

  for (const { name, re } of HEADERS) {
    const m = re.exec(text)
    if (m) hits.push({ name, start: m.index, headerEnd: m.index + m[0].length })
  }

  hits.sort((a, b) => a.start - b.start)

  if (hits.length > 0 && hits[0].start > 0) {
    result.preamble = text.slice(0, hits[0].start).trim()
  } else if (hits.length === 0) {
    result.preamble = text
  }

  for (let i = 0; i < hits.length; i++) {
    const { name, headerEnd } = hits[i]
    const nextStart = hits[i + 1]?.start ?? text.length
    result[name] = text.slice(headerEnd, nextStart).trim()
  }

  return result
}

// ── Shared markdown renderer ────────────────────────────────────────────────

function Md({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        p:      ({ children }: { children?: ReactNode }) => (
          <p className="my-1.5 text-sm leading-relaxed wrap-break-word">{children}</p>
        ),
        ul:     ({ children }: { children?: ReactNode }) => (
          <ul className="list-disc list-outside pl-4 my-1.5 space-y-1">{children}</ul>
        ),
        ol:     ({ children }: { children?: ReactNode }) => (
          <ol className="list-decimal list-outside pl-4 my-1.5 space-y-1">{children}</ol>
        ),
        li:     ({ children }: { children?: ReactNode }) => (
          <li className="text-sm leading-relaxed wrap-break-word">{children}</li>
        ),
        strong: ({ children }: { children?: ReactNode }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

// ── Collapsible section ─────────────────────────────────────────────────────

function CollapsibleSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">
          {title}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform duration-200 shrink-0",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1.5 border-t border-border/60 text-foreground/80">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Main export ─────────────────────────────────────────────────────────────

export function StructuredAnalysis({ markdown }: { markdown: string }) {
  const s = parseSections(markdown)

  return (
    <div className="space-y-2.5 min-w-0">

      {/* Any text before the first recognised section header */}
      {s.preamble && (
        <div className="text-sm text-foreground/80">
          <Md>{s.preamble}</Md>
        </div>
      )}

      {/* Decision Summary — bold background block */}
      {s.decision && (
        <div className="rounded-lg bg-muted/50 border border-border/70 px-3 py-2.5 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-foreground mb-1.5">
            📊 Decision Summary
          </p>
          <div className="text-sm font-medium text-foreground/90 leading-relaxed">
            <Md>{s.decision}</Md>
          </div>
        </div>
      )}

      {/* Entry Plan — bordered card with separated bullets */}
      {s.entry && (
        <div className="rounded-lg border border-border/60 px-3 py-2.5 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-foreground mb-1.5">
            Entry Plan
          </p>
          <div className="text-foreground/80">
            <Md>{s.entry}</Md>
          </div>
        </div>
      )}

      {/* Risk Note — amber left border */}
      {s.risk && (
        <div className="border-l-2 border-amber-400 dark:border-amber-500 pl-3 py-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
            ⚠ Risk Note
          </p>
          <div className="text-foreground/80">
            <Md>{s.risk}</Md>
          </div>
        </div>
      )}

      {/* Long-term View — collapsible, collapsed by default */}
      {s.longterm && (
        <CollapsibleSection title="Long-term View">
          <Md>{s.longterm}</Md>
        </CollapsibleSection>
      )}

      {/* Layman-Friendly Insight — collapsible, collapsed by default */}
      {s.layman && (
        <CollapsibleSection title="Layman-Friendly Insight">
          <Md>{s.layman}</Md>
        </CollapsibleSection>
      )}

    </div>
  )
}
