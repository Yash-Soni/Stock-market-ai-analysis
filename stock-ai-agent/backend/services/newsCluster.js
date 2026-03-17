const cosineSimilarity = require("cosine-similarity")
const Groq = require("groq-sdk")

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") })
const client = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Build a simple word-vector embedding (no API): vocabulary index + term counts
function buildEmbedder(headlines) {
  const stop = new Set(["the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "of", "by", "is", "are", "was", "were"])
  const words = new Set()
  for (const h of headlines) {
    const tokens = String(h || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !stop.has(w))
    tokens.forEach((t) => words.add(t))
  }
  const vocab = [...words]
  return (text) => {
    const counts = new Map()
    vocab.forEach((v) => counts.set(v, 0))
    String(text || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !stop.has(w))
      .forEach((w) => {
        if (counts.has(w)) counts.set(w, counts.get(w) + 1)
      })
    return vocab.map((v) => counts.get(v) || 0)
  }
}

function clusterHeadlines(headlines) {
  if (!headlines || headlines.length === 0) return []
  const embed = buildEmbedder(headlines)
  const clusters = []

  for (const headline of headlines) {
    let added = false
    const v = embed(headline)
    for (const cluster of clusters) {
      const sim = cosineSimilarity(v, embed(cluster[0]))
      const similarity = Number.isFinite(sim) ? sim : 0
      if (similarity > 0.8) {
        cluster.push(headline)
        added = true
        break
      }
    }
    if (!added) {
      clusters.push([headline])
    }
  }

  return clusters
}

async function summarizeCluster(cluster) {
  if (!client) throw new Error("Groq client not configured")
  const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      messages:[
        {
          role:"system",
          content:`
            You summarize news headlines into ONE short market-moving event title.

            Rules:
            - Output ONLY the event title
            - No explanations
            - No prefixes like "Here is..."
            - No markdown
            - Maximum 12 words
            - Plain text only

            Example output:
            Iran conflict threatens global oil supply
          `
        },
        {
          role:"user",
          content: cluster.join("\n")
        }
      ]
    })

  const content = completion.choices[0]?.message?.content?.trim() || ""
  return { event: content }
}

module.exports = { clusterHeadlines, summarizeCluster }