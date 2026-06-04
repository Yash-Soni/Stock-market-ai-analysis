'use strict'

// Single source of truth for valid indicator names.
// Imported by both routerPrompt.js (for vocabulary injection) and
// validation.js (for schema enforcement on LLM output).
const INDICATOR_VOCAB = [
  // Momentum
  'rsi', 'stoch', 'macd', 'cci', 'williams_r',
  // Trend
  'ema_20', 'ema_50', 'ema_100', 'ema_200', 'sma_50', 'sma_200', 'adx',
  // Volatility
  'atr', 'bbands',
  // Volume
  'obv', 'vwap', 'volume_history', 'volume_avg_20',
  // Levels
  'support_resistance', '52_week_range',
  // Bundle
  'full_analysis_bundle'
]

module.exports = { INDICATOR_VOCAB }
