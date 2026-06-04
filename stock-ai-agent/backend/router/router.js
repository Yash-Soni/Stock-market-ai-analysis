'use strict'

const Groq = require('groq-sdk')
const { buildRouterPrompt } = require('./routerPrompt')
const { normalizeTicker, validateRouterOutput } = require('./validation')
const { symbolsMap } = require('../services/symbolValidator')
const { llmCall, routerDecision, validationFailure } = require('../lib/logger')
const { countTokens } = require('../lib/tokenCounter')

// Lazy-initialized so requiring this module before dotenv.config() is safe.
let _client = null
function getClient() {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return _client
}

/**
 * Routes a user message to a structured intent/ticker/indicator decision.
 *
 * Flow:
 *   1. Build system prompt with lastSymbol context (suffix stripped per Q4)
 *   2. Single Groq LLM call with JSON mode enforced
 *   3. Log llm_call with actual token counts from API response
 *   4. JSON parse → schema validation → post-processing rules
 *   5. Confidence < 0.7 → override intent to CLARIFY
 *   6. Explicit ticker → normalizeTicker → validation_failure + CLARIFY if not found
 *   7. Log router_decision with full output and validation metadata
 *
 * @param {string} message - Raw user message
 * @param {string|null} lastSymbol - Last validated symbol from DB (e.g. "INFY.NS")
 * @param {{ user_id?: string|null, conversation_id?: string|null }} [ctx]
 * @returns {Promise<object>} Router output conforming to the RouterOutput shape
 */
async function route(message, lastSymbol, ctx = {}) {
  const { user_id = null, conversation_id = null } = ctx
  const systemPrompt = buildRouterPrompt(lastSymbol)

  // ── LLM call ──────────────────────────────────────────────────────────────
  let raw
  let completion
  const t0 = Date.now()

  try {
    completion = await getClient().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
    })
    raw = completion.choices[0].message.content.trim()
  } catch (err) {
    const latency_ms = Date.now() - t0
    llmCall({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      purpose: 'router',
      input_tokens: countTokens(systemPrompt + message).count,
      input_tokens_approximate: true,
      output_tokens: 0,
      output_tokens_approximate: true,
      latency_ms,
      user_id,
      conversation_id,
      cached: false,
      success: false,
      error: err.message
    })
    return _fallback(message, `LLM call failed: ${err.message}`)
  }

  const latency_ms = Date.now() - t0
  const usage = completion.usage ?? {}

  // Groq returns actual token counts in usage.prompt_tokens / completion_tokens
  const inputTokens = usage.prompt_tokens ?? countTokens(systemPrompt + message).count
  const outputTokens = usage.completion_tokens ?? countTokens(raw).count
  const tokensApproximate = !usage.prompt_tokens

  llmCall({
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    purpose: 'router',
    input_tokens: inputTokens,
    input_tokens_approximate: tokensApproximate,
    output_tokens: outputTokens,
    output_tokens_approximate: tokensApproximate,
    latency_ms,
    user_id,
    conversation_id,
    cached: false,
    success: true
  })

  // ── JSON parse ────────────────────────────────────────────────────────────
  let parsed
  try {
    const jsonStr = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
    parsed = JSON.parse(jsonStr)
  } catch {
    const result = _fallback(message, 'JSON parse failure')
    routerDecision({
      user_id,
      conversation_id,
      input_message: message,
      last_symbol: lastSymbol,
      router_output: result,
      validation_passed: false,
      validation_reason: 'json_parse_failure',
      confidence_threshold_triggered: false
    })
    return result
  }

  // Coerce missing ticker to null
  if (parsed.ticker === undefined) parsed.ticker = null

  // ── Schema validation ─────────────────────────────────────────────────────
  const { valid, errors } = validateRouterOutput(parsed)
  if (!valid) {
    const result = _fallback(message, `schema error: ${errors.join('; ')}`)
    routerDecision({
      user_id,
      conversation_id,
      input_message: message,
      last_symbol: lastSymbol,
      router_output: result,
      validation_passed: false,
      validation_reason: `schema_error: ${errors.join('; ')}`,
      confidence_threshold_triggered: false
    })
    return result
  }

  // ── Post-processing rule: confidence < 0.7 → CLARIFY ─────────────────────
  const confidenceTriggered = parsed.confidence < 0.7
  if (confidenceTriggered) {
    const result = {
      ...parsed,
      intent: 'CLARIFY',
      ticker: null,
      ticker_source: 'none',
      response_style: 'clarification_needed'
    }
    routerDecision({
      user_id,
      conversation_id,
      input_message: message,
      last_symbol: lastSymbol,
      router_output: result,
      validation_passed: true,
      confidence_threshold_triggered: true
    })
    return result
  }

  // ── Ticker validation for explicit STOCK_QUERY ────────────────────────────
  if (
    parsed.intent === 'STOCK_QUERY' &&
    parsed.ticker_source === 'explicit' &&
    parsed.ticker
  ) {
    const canonical = normalizeTicker(parsed.ticker, symbolsMap)
    if (!canonical) {
      validationFailure({
        user_id,
        conversation_id,
        reason: 'ticker_not_in_symbols_map',
        rejected_ticker: parsed.ticker,
        route_taken: 'clarify'
      })

      const result = {
        intent: 'CLARIFY',
        ticker: null,
        ticker_source: 'none',
        is_followup: false,
        indicators_needed: [],
        parameters: {},
        response_style: 'clarification_needed',
        user_question: message,
        confidence: parsed.confidence,
        _unresolved_ticker: parsed.ticker
      }
      routerDecision({
        user_id,
        conversation_id,
        input_message: message,
        last_symbol: lastSymbol,
        router_output: result,
        validation_passed: false,
        validation_reason: 'ticker_not_in_symbols_map',
        confidence_threshold_triggered: false
      })
      return result
    }
    parsed.ticker = canonical
  }

  // ── Success path ──────────────────────────────────────────────────────────
  routerDecision({
    user_id,
    conversation_id,
    input_message: message,
    last_symbol: lastSymbol,
    router_output: parsed,
    validation_passed: true,
    confidence_threshold_triggered: false
  })

  return parsed
}

/**
 * Safe default when the LLM call fails or output cannot be parsed.
 * Always routes to CLARIFY so no handler breaks downstream.
 */
function _fallback(message, reason) {
  return {
    intent: 'CLARIFY',
    ticker: null,
    ticker_source: 'none',
    is_followup: false,
    indicators_needed: [],
    parameters: {},
    response_style: 'clarification_needed',
    user_question: message,
    confidence: 0.0,
    _fallback_reason: reason
  }
}

module.exports = { route }
