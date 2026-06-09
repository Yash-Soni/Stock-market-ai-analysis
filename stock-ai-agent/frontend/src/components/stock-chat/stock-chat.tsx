import { useState, useRef, useEffect, useCallback, useContext, useMemo } from "react"
import { ScrollArea } from "../../components/ui/scroll-area"
import { ChatMessage, type ChatMessageData } from "./chat-message"
import { ChatInput } from "./chat-input"
import { ChatSidebar } from "./chat-sidebar"
import { mapBackendResponseToStockAnalyses } from "../../lib/backend-mapper"
import { QUICK_SUGGESTIONS } from "../../lib/sample-data"
import { useTheme } from "../../lib/use-theme"
import { TrendingUp, PanelLeftClose, PanelLeft, LogOut, UserRound, Loader2 } from "lucide-react"
import { MacroSummary } from "./macro-summary"
import { AuthContext } from "../../context/AuthContext"
import { supabase } from "../../lib/supabase"
import { ErrorBoundary } from "./error-boundary"

const WELCOME_MESSAGE: ChatMessageData = {
  id: "welcome",
  role: "assistant",
  content:
    "Welcome to StockPulse AI. I can analyze any stock for you with technical indicators, fundamental metrics, and AI-powered insights. Try asking about INFY, AAPL, or TSLA to see a full analysis.",
  timestamp: new Date(),
}

const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:3000").replace(/\/+$/, "")

export function StockChat() {
  const { theme, toggleTheme } = useTheme()
  const [messages, setMessages] = useState<ChatMessageData[]>(() => {
    try {
      const saved = localStorage.getItem("chatHistory")
      if (saved) return JSON.parse(saved)
    } catch {}
    return [WELCOME_MESSAGE]
  })
  const [isLoading, setIsLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [zerodhaConnected, setZerodhaConnected] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [portfolioLoading, setPortfolioLoading] = useState(false)
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const submittingRef = useRef(false)

  const { user } = useContext(AuthContext);

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE}/zerodha/status`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => setZerodhaConnected(data.connected))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        const viewport = scrollRef.current.querySelector(
          "[data-slot='scroll-area-viewport']"
        )
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight
        }
      }
    }, 100)
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleSend = useCallback(async (content: string) => {
    if (submittingRef.current) return
    submittingRef.current = true

    const userMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)

    const loadingMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isLoading: true,
    }
    setMessages((prev) => [...prev, loadingMessage])

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    try {
      const res = await fetch(`${API_BASE}/v2/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: content, conversationId }),
      })
      const data = await res.json()

      if (data.conversationId) {
        setConversationId(data.conversationId)
      }

      if (!res.ok) {
        const errorContent =
          res.status === 429 ? "You've sent too many requests. Please wait a moment before trying again."
          : res.status === 401 ? "Your session has expired. Please refresh the page."
          : res.status === 503 ? "Analysis is temporarily unavailable. Please try again in a moment."
          : "Something went wrong. Please try again."
        const errorMessage: ChatMessageData = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: errorContent,
          timestamp: new Date(),
        }
        setMessages((prev) => {
          const next = [...prev.filter((m) => !m.isLoading), errorMessage]
          localStorage.setItem("chatHistory", JSON.stringify(next))
          return next
        })
        return
      }

      const responseMessage: ChatMessageData = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      }

      if (data.type === "analysis_card") {
        responseMessage.responseType = "analysis_card"
        responseMessage.stockAnalyses = mapBackendResponseToStockAnalyses(data)
      } else if (data.type === "focused_answer") {
        responseMessage.responseType = "focused_answer"
        responseMessage.focusedAnswer = {
          symbol: data.symbol ?? "",
          displayName: data.displayName ?? data.symbol ?? "",
          indicators: data.indicators ?? {},
          reply: data.reply ?? "",
        }
        responseMessage.content = data.reply ?? ""
      } else if (data.type === "clarification" || data.type === "symbol_disambiguation") {
        responseMessage.responseType = "clarification"
        responseMessage.clarification = {
          question: data.question ?? data.reply ?? "",
          suggestions: data.suggestions ?? [],
          candidates: data.candidates ?? [],
        }
        responseMessage.content = data.question ?? data.reply ?? ""
      } else {
        // data_card, general_answer, market_answer, portfolio_answer, or missing type
        responseMessage.responseType = "data_card"
        responseMessage.content = data.reply ?? data.question ?? ""
      }

      setMessages((prev) => {
        const next = [...prev.filter((m) => !m.isLoading), responseMessage]
        localStorage.setItem("chatHistory", JSON.stringify(next))
        return next
      })
    } catch {
      const errorMessage: ChatMessageData = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Could not reach the backend. Ensure it's running (e.g. `node index.js` in the backend folder) and try again.",
        timestamp: new Date(),
      }
      setMessages((prev) => {
        const next = [...prev.filter((m) => !m.isLoading), errorMessage]
        localStorage.setItem("chatHistory", JSON.stringify(next))
        return next
      })
    } finally {
      submittingRef.current = false
      setIsLoading(false)
    }
  }, [conversationId])

  const dedupedMessages = useMemo(() => {
    const seen = new Set<string>()
    return messages.filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
  }, [messages])

  const recentSymbols = dedupedMessages
    .filter((m) => m.stockAnalysis)
    .map((m) => m.stockAnalysis!)
    .reverse()

  return (
    <div className="flex h-full min-h-0 max-h-full w-full max-w-full overflow-hidden bg-background box-border">
      {/* Sidebar */}
      <div
        className={`hidden lg:flex flex-col border-r border-border bg-card/30 transition-all duration-300 ${
          sidebarOpen ? "w-72" : "w-0 overflow-hidden"
        }`}
      >
        <ChatSidebar
          recentAnalyses={recentSymbols}
          onSelectSymbol={(s) => handleSend(`Analyze ${s}`)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </div>

      {/* Main Chat */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden min-w-0 w-full max-w-full max-h-full">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 sm:px-4 lg:px-6 py-2 sm:py-3 border-b border-border bg-card/30 backdrop-blur-sm shrink-0 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex size-8 items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeft className="size-4" />
            )}
          </button>
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <div className="size-7 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center sm:size-8">
              <TrendingUp className="size-3.5 text-primary sm:size-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs font-semibold text-foreground sm:text-sm truncate">
                StockPulse AI
              </h1>
              <p className="text-[9px] text-muted-foreground sm:text-[10px] truncate">
                Intelligent Stock Analysis
              </p>
            </div>
          </div>
          <div className="ml-auto flex min-w-0 flex-1 basis-full sm:basis-auto sm:flex-initial flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {!zerodhaConnected && (
              <button
                type="button"
                className="text-[10px] sm:text-xs px-2 py-1 rounded-md border border-border bg-background/80 hover:bg-accent"
                onClick={() => window.open(`${API_BASE}/connect/zerodha`, "_blank")}
              >
                Connect Zerodha
              </button>
            )}

            {zerodhaConnected && (
              <button
                type="button"
                disabled={portfolioLoading}
                className="text-[10px] sm:text-xs px-2 py-1 rounded-md border border-border bg-background/80 flex items-center gap-1 disabled:opacity-50"
                onClick={async () => {
                  setPortfolioLoading(true)
                  try { await fetch(`${API_BASE}/portfolio`) }
                  finally { setPortfolioLoading(false) }
                }}
              >
                {portfolioLoading && <Loader2 className="size-3 animate-spin" />}
                Portfolio
              </button>
            )}

            {zerodhaConnected && (
              <button
                type="button"
                disabled={analyzeLoading}
                className="text-[10px] sm:text-xs px-2 py-1 rounded-md border border-border bg-background/80 flex items-center gap-1 disabled:opacity-50"
                onClick={async () => {
                  setAnalyzeLoading(true)
                  try {
                    const res = await fetch(`${API_BASE}/analyze-portfolio`)
                    const data = await res.json()
                    setMessages((prev) => [...prev, {
                      id: crypto.randomUUID(),
                      role: "assistant" as const,
                      content: data.analysis ?? data.reply ?? "",
                      timestamp: new Date(),
                      responseType: "data_card" as const,
                    }])
                  } finally {
                    setAnalyzeLoading(false)
                  }
                }}
              >
                {analyzeLoading && <Loader2 className="size-3 animate-spin" />}
                Analyze
              </button>
            )}

            {zerodhaConnected && (
              <button
                type="button"
                className="text-[10px] sm:text-xs px-2 py-1 rounded-md border border-border bg-background/80"
                onClick={() => fetch(`${API_BASE}/disconnect`)}
              >
                Disconnect
              </button>
            )}
            <span className="flex items-center gap-1 text-[10px] text-success font-medium shrink-0">
              <span className="size-1.5 shrink-0 rounded-full bg-success animate-pulse" />
              Live
            </span>
            {user && (
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2 py-1 min-w-0">
                <UserRound className="size-3 shrink-0 text-muted-foreground" />
                <span className="text-[10px] sm:text-xs text-foreground truncate max-w-[8rem] sm:max-w-[14rem]">
                  {user.email}
                </span>
                <button
                  type="button"
                  title="Sign out"
                  onClick={() => supabase.auth.signOut()}
                  className="ml-0.5 shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <LogOut className="size-3 sm:size-3.5" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="min-h-0 flex-1 basis-0 w-full min-w-0 max-w-full overflow-hidden">
          <ScrollArea className="h-full min-h-0 w-full min-w-0 max-w-full overflow-x-hidden">
            <div className="mx-auto box-border w-full min-w-0 max-w-full max-w-3xl overflow-x-hidden px-2 py-4 sm:px-4 sm:py-6 lg:px-6 max-lg:pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]">
              {dedupedMessages.map((message) => (
                <ErrorBoundary key={message.id}>
                  <ChatMessage message={message} onSend={handleSend} />
                </ErrorBoundary>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Input: pinned on small screens so it stays visible above long threads / iOS chrome */}
        <div
          className="z-40 w-full min-w-0 shrink-0 overflow-hidden border-t border-border bg-card/30 p-3 backdrop-blur-sm sm:p-4 lg:static lg:z-auto lg:px-6 lg:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] max-lg:fixed max-lg:bottom-0 max-lg:left-0 max-lg:right-0 max-lg:bg-card/95 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] max-lg:pt-3 max-lg:shadow-[0_-8px_32px_rgba(0,0,0,0.35)]"
        >
          <div className="mx-auto w-full max-w-3xl min-w-0">
            <ChatInput
              onSend={handleSend}
              disabled={isLoading}
              suggestions={
                messages.length <= 1 ? QUICK_SUGGESTIONS : []
              }
            />
          </div>
        </div>
      </div>

      {/* Right: Macro events */}
      <div className="hidden xl:flex flex-col border-l border-border bg-card/20">
        <MacroSummary />
      </div>
    </div>
  )
}
