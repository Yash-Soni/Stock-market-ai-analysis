'use strict'

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { route }          = require('../router/router')
const { handleStock }    = require('../handlers/stockHandler')
const { handleGeneral }  = require('../handlers/generalHandler')

const TEST_USER_ID       = 'test-user-phase3'
const TEST_CONVO_ID      = 'test-convo-phase3'

async function runTest(label, fn) {
  console.log(`\n${'═'.repeat(64)}`)
  console.log(`TEST: ${label}`)
  try {
    const result = await fn()
    console.log('\nResponse envelope:')
    // Print envelope without the full reply text to keep output readable
    const summary = { ...result }
    if (summary.reply && summary.reply.length > 200) {
      summary.reply = summary.reply.slice(0, 200) + '... [truncated]'
    }
    console.log(JSON.stringify(summary, null, 2))
    console.log(`\n✓ PASS — type: ${result.type}, intent: ${result.intent}`)
    return result
  } catch (err) {
    console.log(`\n✗ FAIL — ${err.message}`)
    console.log(err.stack)
    return null
  }
}

async function main() {
  console.log('\nPhase 3 Handler Verification — direct handler calls (no HTTP/auth layer)')

  // ── TEST 1: Comprehensive analysis ───────────────────────────────────────
  const test1 = await runTest('Comprehensive analysis: "Analyse INFY"', async () => {
    const routerOutput = await route('Analyse INFY', null, {
      user_id: TEST_USER_ID, conversation_id: TEST_CONVO_ID
    })
    console.log('\nRouter decision:', JSON.stringify({
      intent:         routerOutput.intent,
      ticker:         routerOutput.ticker,
      ticker_source:  routerOutput.ticker_source,
      response_style: routerOutput.response_style,
      indicators_needed: routerOutput.indicators_needed
    }, null, 2))

    if (routerOutput.intent !== 'STOCK_QUERY') throw new Error(`Expected STOCK_QUERY, got ${routerOutput.intent}`)

    return handleStock(routerOutput, null, TEST_USER_ID, TEST_CONVO_ID, [])
  })

  const test1Ticker = test1?.ticker

  // ── TEST 2: Focused query ─────────────────────────────────────────────────
  await runTest('Focused query: "What is the RSI of TCS"', async () => {
    const routerOutput = await route('What is the RSI of TCS', null, {
      user_id: TEST_USER_ID, conversation_id: TEST_CONVO_ID
    })
    console.log('\nRouter decision:', JSON.stringify({
      intent:            routerOutput.intent,
      ticker:            routerOutput.ticker,
      ticker_source:     routerOutput.ticker_source,
      response_style:    routerOutput.response_style,
      indicators_needed: routerOutput.indicators_needed
    }, null, 2))

    if (routerOutput.intent !== 'STOCK_QUERY') throw new Error(`Expected STOCK_QUERY, got ${routerOutput.intent}`)
    if (routerOutput.response_style !== 'focused') throw new Error(`Expected focused, got ${routerOutput.response_style}`)

    const result = await handleStock(routerOutput, null, TEST_USER_ID, TEST_CONVO_ID, [])
    if (result.type !== 'focused_answer') throw new Error(`Expected focused_answer, got ${result.type}`)
    if (result.indicators?.rsi == null && result.indicators?.rsi !== 0) {
      console.log('  ⚠ Note: RSI may be null if Python service slow — check indicators object')
    }
    return result
  })

  // ── TEST 3: General question ──────────────────────────────────────────────
  await runTest('General question: "What is a PE ratio"', async () => {
    const routerOutput = await route('What is a PE ratio', null, {
      user_id: TEST_USER_ID, conversation_id: TEST_CONVO_ID
    })
    console.log('\nRouter decision:', JSON.stringify({
      intent:         routerOutput.intent,
      ticker:         routerOutput.ticker,
      response_style: routerOutput.response_style
    }, null, 2))

    if (routerOutput.intent !== 'GENERAL') throw new Error(`Expected GENERAL, got ${routerOutput.intent}`)

    const result = await handleGeneral(routerOutput, TEST_USER_ID, TEST_CONVO_ID, [])
    if (result.type !== 'data_card') throw new Error(`Expected data_card, got ${result.type}`)
    return result
  })

  // ── TEST 4: Follow-up (simulates last_symbol from Test 1) ─────────────────
  await runTest('Follow-up: "Should I buy this" (last_symbol = INFY.NS from Test 1)', async () => {
    const lastSymbol = test1Ticker || 'INFY.NS'
    console.log(`  Simulating last_symbol: ${lastSymbol}`)

    const routerOutput = await route('Should I buy this', lastSymbol, {
      user_id: TEST_USER_ID, conversation_id: TEST_CONVO_ID
    })
    console.log('\nRouter decision:', JSON.stringify({
      intent:         routerOutput.intent,
      ticker:         routerOutput.ticker,
      ticker_source:  routerOutput.ticker_source,
      is_followup:    routerOutput.is_followup,
      response_style: routerOutput.response_style
    }, null, 2))

    if (routerOutput.ticker_source !== 'followup') throw new Error(`Expected ticker_source=followup, got ${routerOutput.ticker_source}`)
    if (!routerOutput.is_followup) throw new Error('Expected is_followup=true')

    const result = await handleStock(routerOutput, lastSymbol, TEST_USER_ID, TEST_CONVO_ID, [])
    if (result.ticker !== lastSymbol) throw new Error(`Expected ticker=${lastSymbol}, got ${result.ticker}`)
    return result
  })

  console.log(`\n${'═'.repeat(64)}`)
  console.log('Phase 3 verification complete. Review log events above for full detail.')
}

main().catch(err => {
  console.error('Verification script error:', err)
  process.exit(1)
})
