'use strict'

const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')

require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { route } = require('../router/router')

const CASES_PATH = path.resolve(__dirname, 'routerCases.json')
const CACHE_DIR  = path.resolve(__dirname, '.cache')
const NO_CACHE   = process.argv.includes('--no-cache')

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })

// ── Cache helpers ─────────────────────────────────────────────────────────────

function cacheKey(input, lastSymbol) {
  return crypto
    .createHash('md5')
    .update(input + '|' + (lastSymbol ?? 'null'))
    .digest('hex')
}

function readCache(input, lastSymbol) {
  if (NO_CACHE) return null
  const file = path.join(CACHE_DIR, cacheKey(input, lastSymbol) + '.json')
  if (!fs.existsSync(file)) return null
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return null }
}

function writeCache(input, lastSymbol, routerOutput) {
  const file = path.join(CACHE_DIR, cacheKey(input, lastSymbol) + '.json')
  fs.writeFileSync(file, JSON.stringify({ input, lastSymbol, routerOutput, ts: Date.now() }, null, 2))
}

// ── Partial matcher ───────────────────────────────────────────────────────────

function checkCase(actual, expected) {
  const failures = []

  const exact = ['intent', 'ticker', 'ticker_source', 'is_followup', 'response_style']
  for (const field of exact) {
    if (!(field in expected)) continue
    if (actual[field] !== expected[field]) {
      failures.push({ field, expected: expected[field], actual: actual[field] })
    }
  }

  if (expected.indicators_needed_includes) {
    const actualSet = new Set(actual.indicators_needed ?? [])
    for (const ind of expected.indicators_needed_includes) {
      if (!actualSet.has(ind)) {
        failures.push({ field: 'indicators_needed', expected: `includes "${ind}"`, actual: JSON.stringify([...actualSet]) })
      }
    }
  }

  if (expected.indicators_needed_excludes) {
    const actualSet = new Set(actual.indicators_needed ?? [])
    for (const ind of expected.indicators_needed_excludes) {
      if (actualSet.has(ind)) {
        failures.push({ field: 'indicators_needed', expected: `excludes "${ind}"`, actual: JSON.stringify([...actualSet]) })
      }
    }
  }

  if (expected.confidence_min != null) {
    if ((actual.confidence ?? 0) < expected.confidence_min) {
      failures.push({ field: 'confidence', expected: `>= ${expected.confidence_min}`, actual: actual.confidence })
    }
  }

  return failures
}

// ── Main harness ──────────────────────────────────────────────────────────────

async function main() {
  const cases   = JSON.parse(fs.readFileSync(CASES_PATH, 'utf-8'))
  const results = []

  let totalInputTokens  = 0
  let totalOutputTokens = 0
  let liveCalls         = 0
  let cacheHits         = 0

  console.log(`\nStockPulse Router Test Harness — ${cases.length} cases${NO_CACHE ? ' [--no-cache]' : ''}`)
  console.log('═'.repeat(70))

  for (const c of cases) {
    const cached = readCache(c.input, c.lastSymbol)
    let routerOutput
    let fromCache = false

    if (cached && !cached.routerOutput?._fallback_reason) {
      // Only use cache if the stored response was a real LLM response, not a fallback
      routerOutput = cached.routerOutput
      fromCache    = true
      cacheHits++
    } else {
      routerOutput = await route(c.input, c.lastSymbol)
      // Only cache valid LLM responses — skip caching rate-limit / network fallbacks
      if (!routerOutput._fallback_reason) {
        writeCache(c.input, c.lastSymbol, routerOutput)
      }
      liveCalls++
      totalInputTokens  += routerOutput._meta?.input_tokens  ?? 0
      totalOutputTokens += routerOutput._meta?.output_tokens ?? 0
    }

    const failures = checkCase(routerOutput, c.expected)
    const passed   = failures.length === 0

    results.push({ id: c.id, passed, fromCache, failures, routerOutput, expected: c.expected, description: c.description })

    const mark   = passed ? '✓' : '✗'
    const source = fromCache ? '[cache]' : '[live] '
    console.log(`${mark} ${c.id.padEnd(5)} ${source}  ${c.description}`)

    if (!passed) {
      for (const f of failures) {
        console.log(`       ↳ ${f.field}: expected=${JSON.stringify(f.expected)}  actual=${JSON.stringify(f.actual)}`)
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed)

  console.log('\n' + '═'.repeat(70))
  console.log(`Results: ${passed}/${cases.length} passed`)

  if (failed.length > 0) {
    console.log(`\nFailed cases: ${failed.map(r => r.id).join(', ')}`)
  }

  console.log(`\nToken usage (live calls only):`)
  console.log(`  Live calls:     ${liveCalls}   Cache hits: ${cacheHits}`)
  console.log(`  Input tokens:   ${totalInputTokens}`)
  console.log(`  Output tokens:  ${totalOutputTokens}`)
  console.log(`  Total tokens:   ${totalInputTokens + totalOutputTokens}`)
  if (liveCalls > 0) {
    console.log(`  Avg input/call: ${Math.round(totalInputTokens / liveCalls)}`)
    console.log(`  Avg output/call:${Math.round(totalOutputTokens / liveCalls)}`)
  }

  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Harness error:', err.message)
  process.exit(1)
})
