'use strict'

// Llama-3 tokenizer is not available as a public JS package.
// We use a character-based heuristic: 1 token ≈ 4 characters (English prose).
// Counts are flagged as approximate so downstream consumers know not to use
// them for billing calculations. They are accurate enough for trend monitoring
// (e.g. "did our prompts grow by 20%?").
//
// If a tiktoken-compatible package for Llama is ever available, swap the
// implementation here. The interface ({ count, approximate }) stays the same.

/**
 * Returns an approximate token count for the given string.
 *
 * @param {string} text
 * @returns {{ count: number, approximate: true }}
 */
function countTokens(text) {
  if (!text || typeof text !== 'string') return { count: 0, approximate: true }
  return {
    count: Math.ceil(text.length / 4),
    approximate: true
  }
}

module.exports = { countTokens }
