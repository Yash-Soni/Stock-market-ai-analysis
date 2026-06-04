'use strict'

const Groq = require('groq-sdk')

// Lazy-initialized singleton — safe to require before dotenv.config() runs.
let _client = null

function getGroqClient() {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return _client
}

const MODEL = 'llama-3.3-70b-versatile'

module.exports = { getGroqClient, MODEL }
