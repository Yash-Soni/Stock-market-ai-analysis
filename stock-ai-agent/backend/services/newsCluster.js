const cosineSimilarity = require("cosine-similarity")

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

module.exports = { clusterHeadlines }