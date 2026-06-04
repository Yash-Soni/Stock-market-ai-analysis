'use strict'

const { getGroqClient, MODEL } = require('../services/groqClient')
const { llmCall, handlerDispatch } = require('../lib/logger')
const { countTokens } = require('../lib/tokenCounter')
const portfolioSvc = require('../portfolioService')

/**
 * Handles PORTFOLIO intent — personal holdings analysis.
 * Calls portfolioService.analyzePortfolioLogic() directly (no self-HTTP).
 *
 * @param {object} routerOutput
 * @param {string|null} userId
 * @param {string|null} conversationId
 * @returns {Promise<object>} data_card envelope
 */
async function handlePortfolio(routerOutput, userId, conversationId) {
  const t0 = Date.now()

  let weights
  try {
    weights = await portfolioSvc.analyzePortfolioLogic()
  } catch (err) {
    const isSessionErr = err.message?.includes('reconnect') || err.message?.includes('Not connected') || err.code === 'ZERODHA_NOT_CONNECTED' || err.code === 'ZERODHA_SESSION_EXPIRED'

    handlerDispatch({
      user_id:          userId,
      conversation_id:  conversationId,
      handler:          'portfolio',
      response_type:    'data_card',
      total_latency_ms: Date.now() - t0
    })

    return {
      type:          'data_card',
      intent:        'PORTFOLIO',
      ticker:        null,
      responseStyle: 'comprehensive',
      reply:         isSessionErr
        ? 'Your Zerodha session has expired. Please reconnect your account and try again.'
        : 'Unable to fetch your portfolio right now. Please try again.'
    }
  }

  const systemPrompt = `You are a portfolio advisor.

Evaluate:
- Sector allocation
- Overexposure
- Diversification
- Risk concentration`

  const userContent = `Portfolio:\n${JSON.stringify(weights)}\n\nUser asked:\n${routerOutput.user_question}`

  const llmT0 = Date.now()
  const completion = await getGroqClient().chat.completions.create({
    model:    MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent }
    ]
  })
  const llmLatency = Date.now() - llmT0
  const usage      = completion.usage ?? {}

  llmCall({
    provider:               'groq',
    model:                  MODEL,
    purpose:                'portfolio_analysis',
    input_tokens:           usage.prompt_tokens ?? countTokens(systemPrompt + userContent).count,
    input_tokens_approximate: !usage.prompt_tokens,
    output_tokens:          usage.completion_tokens ?? countTokens(completion.choices[0].message.content).count,
    output_tokens_approximate: !usage.completion_tokens,
    latency_ms:             llmLatency,
    user_id:                userId,
    conversation_id:        conversationId,
    cached:                 false,
    success:                true
  })

  handlerDispatch({
    user_id:          userId,
    conversation_id:  conversationId,
    handler:          'portfolio',
    response_type:    'data_card',
    total_latency_ms: Date.now() - t0
  })

  return {
    type:             'data_card',
    intent:           'PORTFOLIO',
    ticker:           null,
    responseStyle:    'comprehensive',
    reply:            completion.choices[0].message.content,
    portfolioWeights: weights
  }
}

module.exports = { handlePortfolio }
