import { useState, useRef, useCallback, type ChangeEvent, type KeyboardEvent } from "react"
import { SendHorizonal } from "lucide-react"
import { cn } from "../../lib/utils"

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  suggestions?: string[]
}

export function ChatInput({ onSend, disabled, suggestions = [] }: ChatInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, disabled, onSend])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  return (
    <div className="space-y-3 w-full min-w-0">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSend(suggestion)}
              disabled={disabled}
              className="text-xs px-3 py-1.5 rounded-full border border-border bg-card/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <div className="relative flex min-w-0 items-end gap-2 rounded-2xl border border-border bg-card/50 backdrop-blur-sm p-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about any stock... e.g. 'Analyze AAPL for long term'"
          disabled={disabled}
          rows={1}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none px-2 py-1.5 max-h-[120px]",
            "disabled:opacity-50"
          )}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className={cn(
            "shrink-0 size-9 rounded-xl flex items-center justify-center transition-all",
            value.trim() && !disabled
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground"
          )}
          aria-label="Send message"
        >
          <SendHorizonal className="size-4" />
        </button>
      </div>
    </div>
  )
}
