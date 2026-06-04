'use strict'

const { getGroqClient, MODEL } = require('../services/groqClient')
const { llmCall, handlerDispatch } = require('../lib/logger')
const { countTokens } = require('../lib/tokenCounter')

// System prompt extracted verbatim from index.js handleGeneralQuery()
const GENERAL_SYSTEM_PROMPT = `You are a knowledgeable personal finance and investing advisor.

Answer the user's question clearly and helpfully. You may cover:
- Investing concepts and definitions (stocks, bonds, mutual funds, ETFs, SIPs, REITs)
- How financial instruments and markets work
- Beginner guidance and how to get started investing
- Risk management principles and strategies
- General market education and financial literacy

Guidelines:
- Keep answers concise: 3–5 short paragraphs max.
- Use plain, friendly language. Avoid unnecessary jargon.
- Do not fabricate or reference specific stock prices, analyst targets, or real-time data.
- If the user is a beginner, be encouraging and practical.
- If the question is a greeting or thanks, respond warmly and briefly.
- Do NOT analyze any specific stock unless the user explicitly names one in this message.`

/**
 * Handles GENERAL intent — finance education, greetings, concepts.
 * No TA data, no stock context, no last_symbol injection.
 *
 * @param {object} routerOutput
 * @param {string|null} userId
 * @param {string|null} conversationId
 * @param {Array<{role,content}>} chatHistory — Last 4 messages
 * @returns {Promise<object>} data_card envelope
 */
async function handleGeneral(routerOutput, userId, conversationId, chatHistory) {
  const t0 = Date.now()

  const messages = [
    { role: 'system', content: GENERAL_SYSTEM_PROMPT },
    ...(chatHistory || []),
    { role: 'user', content: routerOutput.user_question }
  ]

  const llmT0 = Date.now()
  const completion = await getGroqClient().chat.completions.create({
    model:       MODEL,
    temperature: 0.4,
    messages
  })
  const llmLatency = Date.now() - llmT0
  const usage      = completion.usage ?? {}

  llmCall({
    provider:               'groq',
    model:                  MODEL,
    purpose:                'general_answer',
    input_tokens:           usage.prompt_tokens ?? countTokens(GENERAL_SYSTEM_PROMPT + routerOutput.user_question).count,
    input_tokens_approximate: !usage.prompt_tokens,
    output_tokens:          usage.completion_tokens ?? countTokens(completion.choices[0].message.content).count,
    output_tokens_approximate: !usage.completion_tokens,
    latency_ms:             llmLatency,
    user_id:                userId,
    conversation_id:        conversationId,
    cached:                 false,
    success:                true
  })

  const reply = completion.choices[0].message.content

  handlerDispatch({
    user_id:          userId,
    conversation_id:  conversationId,
    handler:          'general',
    response_type:    'data_card',
    total_latency_ms: Date.now() - t0
  })

  return {
    type:          'data_card',
    intent:        'GENERAL',
    ticker:        null,
    responseStyle: 'focused',
    reply
  }
}

module.exports = { handleGeneral }
