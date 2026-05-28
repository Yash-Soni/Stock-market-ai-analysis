const axios = require("axios")
const Groq = require("groq-sdk")
const { clusterHeadlines, summarizeCluster } = require("./newsCluster")

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

let cache = {
  events: null,
  timestamp: 0
}

const CACHE_DURATION = 30 * 60 * 1000   // 30 minutes

async function fetchNews() {
  console.log("[MacroEvents] fetchNews: NEWS_API_KEY present?", !!process.env.NEWS_API_KEY)
  if (!process.env.NEWS_API_KEY) {
    console.warn("[MacroEvents] fetchNews: NEWS_API_KEY missing — skipping")
    return []
  }
  try {
    console.log("[MacroEvents] fetchNews: sending request to NewsAPI")
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
    console.log("[MacroEvents] fetchNews: HTTP", res.status, "| articles received:", Array.isArray(articles) ? articles.length : `non-array (${typeof articles})`)
    if (res.data?.status === "error") {
      console.warn("[MacroEvents] fetchNews: NewsAPI error response:", res.data?.message)
    }
    return Array.isArray(articles) ? articles.slice(0, 15) : []
  } catch (err) {
    console.warn("[MacroEvents] fetchNews: request failed —", err.message)
    return []
  }
}

async function extractMarketEvents(articles){

  const headlines = articles.map(a=>a.title).join("\n")
  const completion =
    await client.chat.completions.create({
      model:"llama-3.3-70b-versatile",
      temperature:0,
      messages:[
        {
          role:"system",
          content:`
            Extract major market-moving global events.

            Return JSON array:

            [
              {
                event:"",
                sectorsImpacted:["Energy","Defense"],
                sentiment:{
                  Energy:"Bullish",
                  Airlines:"Bearish"
                }
              }
            ]

            Focus on events affecting:
            - commodities
            - geopolitics
            - inflation
            - central banks
          `
        },
        {
          role:"user",
          content:headlines
        }
      ]
    })
  const raw = completion.choices[0].message.content
  if (!raw || typeof raw !== "string") return []

  function extractJsonArray(str) {
    const s = str.trim()
    const codeBlock = s.match(/```(?:json)?\s*([\s\S]*?)```/)
    const toParse = codeBlock ? codeBlock[1].trim() : s
    const start = toParse.indexOf("[")
    const end = toParse.lastIndexOf("]")
    if (start === -1 || end === -1 || end <= start) return null
    try {
      return JSON.parse(toParse.slice(start, end + 1))
    } catch {
      return null
    }
  }

  try {
    const events = extractJsonArray(raw)
    if (Array.isArray(events)) {
      return events
    }
    return JSON.parse(raw)
  } catch (err) {
    console.warn("Macro events: LLM response was not valid JSON, using empty list:", err)
    return []
  }
}

async function inferSectorImpact(event){

  const completion =
    await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
            You are a macro strategist.

            For each event determine:
            - sectors positively impacted
            - sectors negatively impacted

            Return JSON format:

            [
            {
              event:"",
              bullishSectors:[],
              bearishSectors:[]
            }
            ]
          `
        },
        {
          role: "user",
          content: JSON.stringify(event)
        }
      ]
    })

  const raw = completion.choices[0].message.content
  if (!raw || typeof raw !== "string") return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed[0] : parsed
  } catch {
    return null
  }
}

function normalizeImpact(impact){

  return {
    bullishSectors: impact?.bullishSectors ?? impact?.bullish ?? [],
    bearishSectors: impact?.bearishSectors ?? impact?.bearish ?? []
  }

}

async function generateMacroEvents(clusters){

  console.log("[MacroEvents] generateMacroEvents: calling LLM with", clusters.length, "cluster(s)")

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
  console.log("[MacroEvents] generateMacroEvents: raw LLM response (first 300 chars):", raw?.slice(0, 300))

  try{
    const parsed = JSON.parse(raw)
    console.log("[MacroEvents] generateMacroEvents: parsed", Array.isArray(parsed) ? parsed.length : "non-array", "event(s)")
    return parsed
  }catch(e){
    console.warn("[MacroEvents] generateMacroEvents: JSON.parse failed —", e.message, "| raw:", raw?.slice(0, 200))
    return []
  }
}

async function withRetry(fn, retries = 2){

  try{
    return await fn()
  }catch(err){

    if(
      retries > 0 &&
      err?.response?.status === 429
    ){
      await new Promise(r => setTimeout(r, 2000))
      return withRetry(fn, retries - 1)
    }

    throw err
  }
}

async function getMacroEvents(){

  const now = Date.now()

  if(
    cache.events &&
    now - cache.timestamp < CACHE_DURATION
  ){
    console.log("[MacroEvents] getMacroEvents: cache hit —", cache.events.length, "event(s), age", Math.round((now - cache.timestamp) / 1000), "s")
    return cache.events
  }

  console.log("[MacroEvents] getMacroEvents: cache miss — fetching fresh events")

  const news = await fetchNews()
  console.log("[MacroEvents] getMacroEvents: fetchNews returned", news.length, "article(s)")

  // Step 1: extract headlines (filter out missing titles)
  const headlines = news
    .map((a) => a && a.title)
    .filter(Boolean)

  console.log("[MacroEvents] getMacroEvents: headlines extracted:", headlines.length)

  if (headlines.length === 0) {
    console.warn("[MacroEvents] getMacroEvents: no headlines — returning empty")
    cache = { events: [], timestamp: now }
    return []
  }

  // Step 2: cluster similar headlines
  const clusters = clusterHeadlines(headlines)
  console.log("[MacroEvents] getMacroEvents: clusters formed:", clusters.length)

  if (clusters.length === 0) {
    console.warn("[MacroEvents] getMacroEvents: no clusters — returning empty")
    cache = { events: [], timestamp: now }
    return []
  }

  const events = await withRetry(() =>
    generateMacroEvents(clusters)
  )

  const topEvents = Array.isArray(events) ? events.slice(0, 10) : []
  console.log("[MacroEvents] getMacroEvents: final topEvents count:", topEvents.length)

  cache = {
    events: topEvents,
    timestamp: now
  }

  return topEvents
}

module.exports = { getMacroEvents }