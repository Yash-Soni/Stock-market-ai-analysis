'use strict'

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { route } = require('../router/router')
const { startupPromptSizes } = require('../lib/logger')
const { buildRouterPrompt } = require('../router/routerPrompt')

// The four known-broken cases from the approved plan
const CASES = [
  {
    name: 'A — INFY follow-up: "Should I buy this" after INFY analysis',
    message: 'Should I buy this',
    lastSymbol: 'INFY.NS',
    expected: {
      intent: 'STOCK_QUERY',
      ticker: null,
      ticker_source: 'followup',
      is_followup: true
    }
  },
  {
    name: 'B — "yes" alone with no prior last_symbol',
    message: 'yes',
    lastSymbol: null,
    expected: {
      intent: 'CLARIFY',
      ticker: null
    }
  },
  {
    name: 'C — "yes" WITH last_symbol set (should still be CLARIFY)',
    message: 'yes',
    lastSymbol: 'TCS.NS',
    expected: {
      intent: 'CLARIFY',
      ticker: null
    }
  },
  {
    name: 'D — Technical follow-up after INFY: ticker must be null, indicators [rsi, ema_200]',
    message: 'Can you tell me about its technical parameters like rsi and ema 200',
    lastSymbol: 'INFY.NS',
    expected: {
      intent: 'STOCK_QUERY',
      ticker: null,
      ticker_source: 'followup',
      is_followup: true,
      indicators_needed: ['rsi', 'ema_200']
    }
  }
]

function checkField(result, key, expected) {
  if (Array.isArray(expected)) {
    return JSON.stringify(result[key]) === JSON.stringify(expected)
  }
  return result[key] === expected
}

async function run() {
  // Emit startup baseline before anything else runs
  startupPromptSizes({
    routerPromptText: buildRouterPrompt(null),
    comprehensivePromptText: null,   // Phase 3
    focusedPromptText: null          // Phase 3
  })

  let passed = 0
  let failed = 0

  for (const c of CASES) {
    console.log(`\n${'═'.repeat(64)}`)
    console.log(`Case ${c.name}`)
    console.log(`  Input      : "${c.message}"`)
    console.log(`  last_symbol: ${c.lastSymbol}`)

    let result
    try {
      result = await route(c.message, c.lastSymbol)
    } catch (err) {
      console.log(`  ERROR: ${err.message}`)
      failed++
      continue
    }

    console.log('\n  Router output:')
    console.log(JSON.stringify(result, null, 4).replace(/^/gm, '  '))

    const mismatches = []
    for (const [key, expectedVal] of Object.entries(c.expected)) {
      if (!checkField(result, key, expectedVal)) {
        mismatches.push(
          `  ✗  ${key}: expected ${JSON.stringify(expectedVal)}, got ${JSON.stringify(result[key])}`
        )
      }
    }

    if (mismatches.length === 0) {
      console.log('\n  ✓  PASS')
      passed++
    } else {
      console.log('\n  ✗  FAIL')
      mismatches.forEach(m => console.log(m))
      failed++
    }
  }

  console.log(`\n${'═'.repeat(64)}`)
  console.log(`Results: ${passed}/${CASES.length} passed, ${failed} failed`)
}

run().catch(err => {
  console.error('Spot check script error:', err.message)
  process.exit(1)
})
