import { useState, type FormEvent } from "react"
import { Mail, TrendingUp, Sparkles } from "lucide-react"
import { supabase } from "../lib/supabase"
import { cn } from "../lib/utils"

export default function Login() {
  const [email, setEmail] = useState("")
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info"
    text: string
  } | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!email.trim()) {
      setFeedback({ type: "info", text: "Please enter your email address." })
      return
    }

    setLoading(true)
    setFeedback(null)

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    if (error) {
      setFeedback({ type: "error", text: error.message })
    } else {
      setFeedback({
        type: "success",
        text: "Check your inbox for a sign-in link.",
      })
    }

    setLoading(false)
  }

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-x-hidden bg-background p-4 sm:p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
      >
        <div className="absolute left-1/2 top-0 h-[min(50vh,24rem)] w-[min(100%,42rem)] -translate-x-1/2 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-[min(100%,22rem)] sm:max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-lg shadow-primary/5">
            <TrendingUp className="size-7 text-primary" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            StockPulse AI
          </h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Sign in with a magic link—no password. We’ll email you a secure link to
            continue.
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card/70 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="login-email"
                className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Email
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background/80 py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none ring-offset-background transition-[box-shadow,border-color] focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-md transition-[transform,opacity,box-shadow] hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              )}
            >
              {loading ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  Sending link…
                </>
              ) : (
                <>
                  <Sparkles className="size-4 opacity-90" />
                  Send magic link
                </>
              )}
            </button>
          </form>

          {feedback && (
            <p
              role="status"
              className={cn(
                "mt-5 rounded-lg border px-3 py-2.5 text-center text-sm leading-snug",
                feedback.type === "success" &&
                  "border-success/25 bg-success/10 text-success",
                feedback.type === "error" &&
                  "border-destructive/30 bg-destructive/10 text-destructive",
                feedback.type === "info" &&
                  "border-border bg-muted/40 text-muted-foreground"
              )}
            >
              {feedback.text}
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground/80">
          By continuing you agree to receive a one-time sign-in email from StockPulse.
        </p>
      </div>
    </div>
  )
}
