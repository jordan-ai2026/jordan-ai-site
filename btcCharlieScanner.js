'use strict'

// ============================================
// BTC_CHARLIE TREND SCANNER — Jordan AI
//
// Replicates the "btc_charlie" / Trader XO Trend Scanner logic:
//   Bull signal → EMA(9) crosses ABOVE EMA(21) on 30m chart
//   Bear signal → EMA(9) crosses BELOW EMA(21) on 30m chart
//
// Fires a Discord alert to #stock-alerts ONLY on state change
// (flip from bull→bear or bear→bull). Runs every 30 min during
// market hours, checks every symbol in watchlist.json.
//
// Yahoo Finance 30m data: up to 60 days history. No API key needed.
// ============================================

const axios = require('axios')
const { EMA } = require('technicalindicators')
const fs = require('fs')
const path = require('path')

// ============================================
// CONFIG
// ============================================

const WATCHLIST_PATH       = path.join(__dirname, 'watchlist.json')
const STOCK_ALERTS_CHANNEL = '1481759964359033024'

// Trader XO btc_charlie EMA periods (9/21 on chosen timeframe)
const FAST_EMA  = 9
const SLOW_EMA  = 21
const TIMEFRAME = '30m'

const YF_BASE    = 'https://query1.finance.yahoo.com/v8/finance/chart'
const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ============================================
// STATE TRACKING
// In-memory: symbol → 'bull' | 'bear' | null
// ============================================

const trendState = new Map()
let _loopTimer = null

// ============================================
// MARKET HOURS
// ============================================

function getNowEST() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
}

function isWeekend() {
  const d = getNowEST().getDay()
  return d === 0 || d === 6
}

function isMarketHours() {
  if (isWeekend()) return false
  const est = getNowEST()
  const t = est.getHours() * 60 + est.getMinutes()
  // 8:00 AM–4:30 PM ET (include pre-market through after-hours close)
  return t >= 8 * 60 && t <= 16 * 60 + 30
}

// ============================================
// DATA FETCHING — 30-minute Yahoo Finance
// ============================================

async function fetch30mData(symbol) {
  try {
    const res = await axios.get(`${YF_BASE}/${symbol}`, {
      params: {
        interval: '30m',
        range: '5d',          // 5 trading days of 30m bars (~65 candles)
      },
      headers: YF_HEADERS,
      timeout: 10000,
    })

    const result = res.data?.chart?.result?.[0]
    if (!result) return null

    const ts = result.timestamp || []
    const q  = result.indicators?.quote?.[0] || {}

    const closes = []
    for (let i = 0; i < ts.length; i++) {
      if (q.close?.[i] != null) closes.push(q.close[i])
    }

    if (closes.length < SLOW_EMA + 2) return null  // need enough bars for EMA

    return { symbol, closes }
  } catch (err) {
    // Silently skip — could be a temporarily unavailable ticker
    return null
  }
}

// ============================================
// INDICATOR — EMA(9) vs EMA(21) crossover
// Returns: 'bull' | 'bear' | null
// ============================================

function calcTrend(closes) {
  if (closes.length < SLOW_EMA + 2) return null

  const fastVals = EMA.calculate({ values: closes, period: FAST_EMA })
  const slowVals = EMA.calculate({ values: closes, period: SLOW_EMA })

  if (fastVals.length < 2 || slowVals.length < 2) return null

  const fastNow  = fastVals[fastVals.length - 1]
  const slowNow  = slowVals[slowVals.length - 1]
  const fastPrev = fastVals[fastVals.length - 2]
  const slowPrev = slowVals[slowVals.length - 2]

  // Determine current trend direction
  const trend = fastNow > slowNow ? 'bull' : 'bear'

  // Detect crossover: changed sides on last candle close
  const crossedBull = fastPrev <= slowPrev && fastNow > slowNow
  const crossedBear = fastPrev >= slowPrev && fastNow < slowNow

  return { trend, crossedBull, crossedBear, fastNow, slowNow }
}

// ============================================
// ALERT FORMATTING
// ============================================

function formatBtcCharlieAlert(symbol, direction, fastEma, slowEma, price) {
  const time = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  if (direction === 'bull') {
    return (
      `🟢 **BTC_CHARLIE BULL — ${symbol}**\n` +
      `EMA(${FAST_EMA}) crossed **above** EMA(${SLOW_EMA}) on 30m chart\n` +
      `EMA${FAST_EMA}: $${fastEma.toFixed(2)} · EMA${SLOW_EMA}: $${slowEma.toFixed(2)}\n` +
      `Price: $${price.toFixed(2)}\n` +
      `Signal: **BULLISH TREND** (Trader XO / btc_charlie)\n` +
      `Time: ${time}`
    )
  } else {
    return (
      `🔴 **BTC_CHARLIE BEAR — ${symbol}**\n` +
      `EMA(${FAST_EMA}) crossed **below** EMA(${SLOW_EMA}) on 30m chart\n` +
      `EMA${FAST_EMA}: $${fastEma.toFixed(2)} · EMA${SLOW_EMA}: $${slowEma.toFixed(2)}\n` +
      `Price: $${price.toFixed(2)}\n` +
      `Signal: **BEARISH TREND** (Trader XO / btc_charlie)\n` +
      `Time: ${time}`
    )
  }
}

// ============================================
// MAIN SCAN — run all watchlist symbols
// ============================================

async function runBtcCharlieScan(discordClient) {
  if (!discordClient) return

  const watchlistData = fs.existsSync(WATCHLIST_PATH)
    ? JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'))
    : { symbols: [], alertsEnabled: true }

  if (!watchlistData.alertsEnabled) return
  if (!watchlistData.symbols?.length) return

  const alerts = []

  for (const symbol of watchlistData.symbols) {
    try {
      const data = await fetch30mData(symbol)
      if (!data) { await sleep(300); continue }

      const result = calcTrend(data.closes)
      if (!result) { await sleep(300); continue }

      const { trend, crossedBull, crossedBear, fastNow, slowNow } = result
      const price = data.closes[data.closes.length - 1]
      const prev  = trendState.get(symbol)

      // Update state
      trendState.set(symbol, trend)

      // Only alert on a fresh crossover
      if (crossedBull) {
        console.log(`[btcCharlie] 🟢 BULL cross — ${symbol}`)
        alerts.push(formatBtcCharlieAlert(symbol, 'bull', fastNow, slowNow, price))
      } else if (crossedBear) {
        console.log(`[btcCharlie] 🔴 BEAR cross — ${symbol}`)
        alerts.push(formatBtcCharlieAlert(symbol, 'bear', fastNow, slowNow, price))
      }

      await sleep(400) // polite delay between symbols
    } catch (err) {
      console.error(`[btcCharlie] Error scanning ${symbol}:`, err.message)
    }
  }

  if (!alerts.length) return

  try {
    const channel = await discordClient.channels.fetch(STOCK_ALERTS_CHANNEL)
    for (const msg of alerts) {
      await channel.send(msg)
    }
  } catch (err) {
    console.error('[btcCharlie] Discord send failed:', err.message)
  }
}

// ============================================
// SCHEDULER — every 30 minutes during market hours
// Fires on :00 and :30 of each hour
// ============================================

let _lastRunMin = -1

function startBtcCharlieLoop(discordClient) {
  console.log('[btcCharlie] Loop started — EMA(9)/EMA(21) on 30m, firing on bull/bear crossovers')

  _loopTimer = setInterval(async () => {
    if (!isMarketHours()) return

    const est  = getNowEST()
    const h    = est.getHours()
    const m    = est.getMinutes()
    const tMin = h * 60 + m

    if (tMin === _lastRunMin) return

    // Fire on :00 and :30
    if (m % 30 === 0) {
      _lastRunMin = tMin
      console.log(`[btcCharlie] Running 30m scan at ${h}:${String(m).padStart(2, '0')} ET...`)
      await runBtcCharlieScan(discordClient)
    }
  }, 60_000) // check every minute, fire every 30
}

function stopBtcCharlieLoop() {
  if (_loopTimer) { clearInterval(_loopTimer); _loopTimer = null }
}

// ============================================
// DISCORD COMMAND — !btccharlie status
// ============================================

async function handleBtcCharlieCommand(message) {
  const content = message.content.trim().toLowerCase()
  if (!content.startsWith('!btccharlie') && !content.startsWith('!charlie')) return false

  const watchlistData = fs.existsSync(WATCHLIST_PATH)
    ? JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'))
    : { symbols: [] }

  if (!watchlistData.symbols?.length) {
    return message.reply('Watchlist is empty. Add symbols: `!watchlist add AAPL TSLA`')
  }

  const parts = content.split(/\s+/)
  const sub   = parts[1]

  // !btccharlie scan — force a scan right now
  if (sub === 'scan' || sub === 'now') {
    await message.reply(`Running btc_charlie scan on ${watchlistData.symbols.length} symbols...`)
    // Temporarily clear state so it reports current trend even without a crossover
    const tempStates = []
    for (const symbol of watchlistData.symbols) {
      const data = await fetch30mData(symbol)
      if (!data) { await sleep(300); continue }
      const result = calcTrend(data.closes)
      if (!result) { await sleep(300); continue }
      const price = data.closes[data.closes.length - 1]
      tempStates.push(
        `${result.trend === 'bull' ? '🟢' : '🔴'} **${symbol}** — ${result.trend.toUpperCase()} ` +
        `(EMA${FAST_EMA}: $${result.fastNow.toFixed(2)} vs EMA${SLOW_EMA}: $${result.slowNow.toFixed(2)}) ` +
        `Price: $${price.toFixed(2)}`
      )
      await sleep(400)
    }
    if (!tempStates.length) return message.reply('No data available right now.')
    return message.reply(
      `**btc_charlie Trend State (30m chart)**\n\n${tempStates.join('\n')}\n\n` +
      `_Alerts fire automatically when trend flips. This is the current state._`
    )
  }

  // !btccharlie status — show current known states
  const lines = []
  for (const symbol of watchlistData.symbols) {
    const state = trendState.get(symbol)
    lines.push(`${state === 'bull' ? '🟢' : state === 'bear' ? '🔴' : '⬜'} **${symbol}** — ${state ? state.toUpperCase() : 'unknown (not yet scanned)'}`)
  }

  return message.reply(
    `**btc_charlie Status (EMA${FAST_EMA}/EMA${SLOW_EMA} on 30m)**\n\n${lines.join('\n')}\n\n` +
    `Scanning every 30 min during market hours. Alerts post to <#${STOCK_ALERTS_CHANNEL}> on trend flips.\n` +
    `Run \`!btccharlie scan\` to force an immediate snapshot.`
  )
}

function isBtcCharlieCommand(content) {
  const cmd = content.trim().toLowerCase().split(/\s+/)[0]
  return cmd === '!btccharlie' || cmd === '!charlie'
}

module.exports = {
  startBtcCharlieLoop,
  stopBtcCharlieLoop,
  runBtcCharlieScan,
  handleBtcCharlieCommand,
  isBtcCharlieCommand,
}
