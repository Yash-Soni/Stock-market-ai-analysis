'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// PII REDACTION RULES — read before adding new log fields
// ─────────────────────────────────────────────────────────────────────────────
// NEVER LOG:
//   - User email addresses (use user_id UUID only)
//   - Supabase JWT tokens or Zerodha access/API tokens
//   - Full LLM response text that contains portfolio holdings, position sizes,
//     or other user-specific financial details
//   - Any field named "password", "secret", "token", "key" from request bodies
//
// SAFE TO LOG:
//   - Supabase user_id (UUID — not PII on its own)
//   - conversation_id
//   - Raw user input message in "router_decision" events ONLY
//     (needed for Router replay/debugging; redact before shipping to any
//      third-party aggregator)
//   - Token counts, latencies, decision metadata, error messages
// ─────────────────────────────────────────────────────────────────────────────

const pino = require('pino')
const { countTokens } = require('./tokenCounter')
const { version } = require('../package.json')

const isDev = process.env.NODE_ENV !== 'production'

const pinoOptions = {
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'stockpulse-backend',
    env: process.env.NODE_ENV || 'development',
    version
  },
  // ISO timestamps are easier to parse in log aggregators than epoch ints
  timestamp: pino.stdTimeFunctions.isoTime
}

const transport = isDev
  ? pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: false,   // isoTime already set above
        ignore: 'pid,hostname,service,env,version',
        messageKey: 'event'    // use event as the displayed "message" in pretty mode
      }
    })
  : undefined

const logger = pino(pinoOptions, transport)

// ─────────────────────────────────────────────────────────────────────────────
// Structured event helpers
// Each helper is a thin wrapper that enforces the "event" discriminator field
// and documents required vs optional fields inline.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log a single LLM API call.
 *
 * @param {{
 *   provider: 'groq' | 'openrouter' | 'gemini',
 *   model: string,
 *   purpose: 'router' | 'comprehensive_analysis' | 'focused_narration'
 *            | 'general_answer' | 'portfolio_analysis' | 'market_analysis',
 *   input_tokens: number,
 *   output_tokens: number,
 *   input_tokens_approximate: boolean,
 *   output_tokens_approximate: boolean,
 *   latency_ms: number,
 *   user_id: string | null,
 *   conversation_id: string | null,
 *   cached: boolean,
 *   success: boolean,
 *   error?: string
 * }} fields
 */
function llmCall(fields) {
  logger.info({ event: 'llm_call', ...fields })
}

/**
 * Log the full Router decision after parsing and post-processing.
 *
 * @param {{
 *   user_id: string | null,
 *   conversation_id: string | null,
 *   input_message: string,
 *   last_symbol: string | null,
 *   router_output: object,
 *   validation_passed: boolean,
 *   validation_reason?: string,
 *   confidence_threshold_triggered: boolean
 * }} fields
 */
function routerDecision(fields) {
  logger.info({ event: 'router_decision', ...fields })
}

/**
 * Log a call to the Python /compute endpoint.
 *
 * @param {{
 *   ticker: string,
 *   indicators: string[],
 *   parameters: object,
 *   latency_ms: number,
 *   success: boolean,
 *   error?: string
 * }} fields
 */
function pythonCall(fields) {
  logger.info({ event: 'python_compute_call', ...fields })
}

/**
 * Log the entry and exit of a handler, including total execution time.
 *
 * @param {{
 *   user_id: string | null,
 *   conversation_id: string | null,
 *   handler: 'stock' | 'general' | 'portfolio' | 'market' | 'clarify',
 *   response_type: 'analysis_card' | 'focused_answer' | 'clarification' | 'data_card',
 *   total_latency_ms: number
 * }} fields
 */
function handlerDispatch(fields) {
  logger.info({ event: 'handler_dispatch', ...fields })
}

/**
 * Log a validation failure that caused a message to be routed to clarifyHandler.
 *
 * @param {{
 *   user_id: string | null,
 *   conversation_id: string | null,
 *   reason: string,
 *   rejected_ticker: string | null,
 *   route_taken: 'clarify'
 * }} fields
 */
function validationFailure(fields) {
  logger.warn({ event: 'validation_failure', ...fields })
}

/**
 * Emit baseline prompt token sizes at startup so we can track prompt growth
 * over time. Pass null for prompts not yet implemented.
 *
 * Call once from the server entry point after all modules are loaded.
 *
 * @param {{
 *   routerPromptText: string,
 *   comprehensivePromptText?: string | null,
 *   focusedPromptText?: string | null
 * }} prompts
 */
function startupPromptSizes({ routerPromptText, comprehensivePromptText = null, focusedPromptText = null }) {
  const router = countTokens(routerPromptText)
  const comprehensive = comprehensivePromptText ? countTokens(comprehensivePromptText) : null
  const focused = focusedPromptText ? countTokens(focusedPromptText) : null

  logger.info({
    event: 'startup_prompt_sizes',
    router_prompt_tokens: router.count,
    comprehensive_prompt_tokens: comprehensive ? comprehensive.count : null,
    focused_prompt_tokens: focused ? focused.count : null,
    approximate: true,
    note: 'Token counts use chars/4 heuristic — update in Phase 3 once comprehensivePrompt and focusedPrompt are extracted'
  })
}

module.exports = {
  logger,
  llmCall,
  routerDecision,
  pythonCall,
  handlerDispatch,
  validationFailure,
  startupPromptSizes
}
