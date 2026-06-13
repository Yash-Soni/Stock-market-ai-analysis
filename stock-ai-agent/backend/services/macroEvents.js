const axios = require("axios")
const Groq = require("groq-sdk")
const { clusterHeadlines } = require("./newsCluster")
const { logger } = require("../lib/logger")
const { db } = require("./client")

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

let cache = {
  events: null,
  timestamp: 0
}

const CACHE_DURATION = 30 * 60 * 1000   // 30 minutes

async function fetchNews() {
  if (!process.env.NEWS_API_KEY) {
    logger.warn({ event: 'macro_news_fetch_skipped', reason: 'missing_api_key' })
    return []
  }
  try {
    const res = await axios.get(
      "https://newsapi.org/v2/everything",
      {
        params: {
          q: "war OR sanctions OR oil OR inflation OR central bank OR conflict",
          language: "en",
          sortBy: "publishedAt",
          apiKey: process.env.NEWS_API_KEY
        },
        timeout: 15000
      }
    )
    const articles = res.data?.articles
    if (res.data?.status === "error") {
      logger.warn({ event: 'macro_news_fetch_failed', http_status: res.status, api_message: res.data?.message })
    }
    return Array.isArray(articles) ? articles.slice(0, 15) : []
  } catch (err) {
    logger.warn({ event: 'macro_news_fetch_failed', error: err.message })
    return []
  }
}

async function generateMacroEvents(clusters){

  const completion =
    await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
            You are a macro market analyst.

            For each cluster of headlines:
            1. Summarize into ONE short market-moving event
            2. Identify impacted sectors

            Return STRICT JSON:
            [
              {
                "event": "",
                "bullishSectors": [],
                "bearishSectors": []
              }
            ]

            Rules:
            - No explanation
            - No markdown
            - Max 25 words per event
          `
        },
        {
          role: "user",
          content: JSON.stringify(clusters)
        }
      ]
    })

  const raw = completion.choices[0].message.content

  try{
    return JSON.parse(raw)
  }catch(e){
    logger.warn({ event: 'macro_events_parse_failed', stage: 'generate_macro_events', error: e.message })
    return []
  }
}

async function getMacroEvents(){

  const now = Date.now()

  // Layer 1: in-memory cache (avoids Supabase round-trip within same process)
  if (cache.events && now - cache.timestamp < CACHE_DURATION) {
    return cache.events
  }

  // Layer 2: Supabase persistent cache (survives Render restarts)
  try {
    const { data: row } = await db
      .from('macro_events_cache')
      .select('events, cached_at')
      .eq('id', 1)
      .single()

    if (row && (now - new Date(row.cached_at).getTime()) < CACHE_DURATION) {
      const events = Array.isArray(row.events) ? row.events : []
      cache = { events, timestamp: new Date(row.cached_at).getTime() }
      logger.info({ event: 'macro_events_cache_hit', source: 'supabase' })
      return events
    }
  } catch (err) {
    logger.warn({ event: 'macro_events_cache_read_failed', error: err.message })
  }

  // Layer 3: live fetch + Groq call
  const news = await fetchNews()

  const headlines = news
    .map((a) => a && a.title)
    .filter(Boolean)

  if (headlines.length === 0) {
    cache = { events: [], timestamp: now }
    return []
  }

  const clusters = clusterHeadlines(headlines)

  if (clusters.length === 0) {
    cache = { events: [], timestamp: now }
    return []
  }

  const events = await generateMacroEvents(clusters)

  const topEvents = Array.isArray(events) ? events.slice(0, 10) : []

  cache = { events: topEvents, timestamp: now }

  // Persist to Supabase so next cold start skips the Groq call
  try {
    await db.from('macro_events_cache').upsert({
      id: 1,
      events: topEvents,
      cached_at: new Date().toISOString()
    })
  } catch (err) {
    logger.warn({ event: 'macro_events_cache_write_failed', error: err.message })
  }

  return topEvents
}

module.exports = { getMacroEvents }