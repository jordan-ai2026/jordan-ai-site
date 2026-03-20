'use strict'

// ============================================
// STOCK SCANNER — Jordan AI
//
// TWO-TIER SCANNING:
//
// 1. MARKET SCREEN (Finviz, every 1h during market hours)
//    Finviz pre-filters ALL ~8,000 US stocks server-side.
//    Returns only tickers matching your criteria (~10–100 per screen).
//    We confirm each candidate with Yahoo Finance, then alert.
//    No API key. Free. Covers the entire market.
//
// 2. WATCHLIST SCAN (Yahoo Finance, every 15 min)
//    Full indicator calculation on your personal watchlist.
//    Use this for stocks you always want close eyes on.
//
// SCHEDULE (EST, weekdays only):
//    8:00 AM  — Pre-market market screen + watchlist scan
//    9:30–4PM — Market screen on the hour, watchlist every 15 min
//    4:30 PM  — After-hours summary
// ============================================

const axios = require('axios')
const { RSI, EMA, MACD } = require('technicalindicators')
const fs = require('fs')
const path = require('path')

// ============================================
// CONSTANTS
// ============================================

const WATCHLIST_PATH       = path.join(__dirname, 'watchlist.json')
const RULES_PATH           = path.join(__dirname, 'stockRules.json')
const STOCK_ALERTS_CHANNEL = '1481759964359033024'
const ALERT_COOLDOWN_MS    = 2 * 60 * 60 * 1000  // 2h per signal per symbol
const CACHE_TTL_MS         = 20 * 60 * 1000       // 20 min Yahoo Finance cache

// Yahoo Finance — no key required
const YF_BASE    = 'https://query1.finance.yahoo.com/v8/finance/chart'
const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
}

// Finviz screener — no key required
const FINVIZ_BASE    = 'https://finviz.com/screener.ashx'
const FINVIZ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

// Finviz filter combinations — each covers the full market, server-side
// sh_avgvol_o200 = avg daily volume > 200k (filters out illiquid stocks)
const FINVIZ_SCREENS = [
  { name: 'RSI Oversold',    filters: 'rsi_os30,sh_avgvol_o200'         },
  { name: 'RSI Overbought',  filters: 'rsi_ob70,sh_avgvol_o200'         },
  { name: 'Gap Up 5%+',      filters: 'ta_gap_u5,sh_avgvol_o200'        },
  { name: 'Gap Down 5%+',    filters: 'ta_gap_d5,sh_avgvol_o200'        },
  { name: 'MACD Bull Cross', filters: 'ta_macd_sb,sh_avgvol_o200'       },
  { name: 'MACD Bear Cross', filters: 'ta_macd_bb,sh_avgvol_o200'       },
  { name: 'Volume Spike 2x', filters: 'sh_relvol_o2,sh_avgvol_o200'     },
  { name: '52-Week High',    filters: 'ta_highlow52w_nh,sh_avgvol_o200' },
  { name: '52-Week Low',     filters: 'ta_highlow52w_nl,sh_avgvol_o200' },
]

// ============================================
// HELPERS
// ============================================

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ============================================
// DATA PERSISTENCE
// ============================================

function loadWatchlist() {
  if (!fs.existsSync(WATCHLIST_PATH)) {
    const defaults = { symbols: ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA'], alertsEnabled: true }
    fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(defaults, null, 2))
    return defaults
  }
  return JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'))
}

function saveWatchlist(data) {
  fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(data, null, 2))
}

function loadRules() {
  if (!fs.existsSync(RULES_PATH)) return getDefaultRules()
  return JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'))
}

// ============================================
// MARKET HOURS (EST)
// ============================================

function getNowEST() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
}

function isWeekend() {
  const d = getNowEST().getDay()
  return d === 0 || d === 6
}

function isMarketOpen() {
  if (isWeekend()) return false
  const est = getNowEST()
  const t = est.getHours() * 60 + est.getMinutes()
  return t >= 9 * 60 + 30 && t < 16 * 60
}

function isPremarket() {
  if (isWeekend()) return false
  const est = getNowEST()
  const t = est.getHours() * 60 + est.getMinutes()
  return t >= 8 * 60 && t < 9 * 60 + 30
}

// ============================================
// INDICATOR CALCULATIONS
// ============================================

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null
  const vals = RSI.calculate({ values: closes, period })
  return vals.length ? vals[vals.length - 1] : null
}

function calcEMA(closes, period) {
  if (closes.length < period) return null
  const vals = EMA.calculate({ values: closes, period })
  return vals.length ? vals[vals.length - 1] : null
}

function calcPrevEMA(closes, period) {
  if (closes.length < period + 1) return null
  const vals = EMA.calculate({ values: closes.slice(0, -1), period })
  return vals.length ? vals[vals.length - 1] : null
}

function calcMACD(closes) {
  if (closes.length < 35) return null
  const vals = MACD.calculate({
    values: closes,
    fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    SimpleMAOscillator: false, SimpleMASignal: false,
  })
  if (vals.length < 2) return null
  return { current: vals[vals.length - 1], prev: vals[vals.length - 2] }
}

function calcVolumeRatio(volumes) {
  if (volumes.length < 21) return 1
  const avg = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20
  return avg > 0 ? volumes[volumes.length - 1] / avg : 1
}

function calc52WeekRange(highs, lows) {
  const n = Math.min(252, highs.length)
  return { high52: Math.max(...highs.slice(-n)), low52: Math.min(...lows.slice(-n)) }
}

// ============================================
// YAHOO FINANCE DATA FETCHING + CACHE
// ============================================

const dataCache = new Map() // symbol → { data, fetchedAt }

async function fetchStockData(symbol) {
  try {
    const res = await axios.get(`${YF_BASE}/${symbol}`, {
      params: { interval: '1d', range: '1y' },
      headers: YF_HEADERS,
      timeout: 10000,
    })

    const result = res.data?.chart?.result?.[0]
    if (!result) return null

    const ts = result.timestamp || []
    const q  = result.indicators?.quote?.[0] || {}

    const rows = []
    for (let i = 0; i < ts.length; i++) {
      if (q.close[i] != null && q.volume[i] != null) {
        rows.push({ open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] })
      }
    }
    if (rows.length < 50) return null

    const last = rows[rows.length - 1]
    const prev = rows[rows.length - 2]

    return {
      symbol,
      closes:        rows.map(r => r.close),
      highs:         rows.map(r => r.high),
      lows:          rows.map(r => r.low),
      opens:         rows.map(r => r.open),
      volumes:       rows.map(r => r.volume),
      currentPrice:  last.close,
      prevClose:     prev?.close ?? null,
      todayOpen:     last.open,
      currentVolume: last.volume,
    }
  } catch (err) {
    // Don't log every miss — market screens generate lots of expected failures
    return null
  }
}

async function fetchStockDataCached(symbol) {
  const cached = dataCache.get(symbol)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data
  const data = await fetchStockData(symbol)
  if (data) dataCache.set(symbol, { data, fetchedAt: Date.now() })
  return data
}

async function fetchQuote(symbol) {
  try {
    const res = await axios.get(`${YF_BASE}/${symbol}`, {
      params: { interval: '1d', range: '1d' },
      headers: YF_HEADERS,
      timeout: 8000,
    })
    const meta = res.data?.chart?.result?.[0]?.meta
    if (!meta) return null
    return {
      regularMarketPrice:         meta.regularMarketPrice,
      regularMarketChangePercent: meta.regularMarketChangePercent,
      previousClose:              meta.previousClose,
    }
  } catch { return null }
}

// ============================================
// FINVIZ SCREENER
// ============================================

// Parse stock tickers from Finviz screener HTML
function parseFinvizTickers(html) {
  const tickers = []
  // Primary pattern: screener link cells
  const re = /screener-link-primary[^>]*href="quote\.ashx\?t=([A-Z.]+)"/g
  let m
  while ((m = re.exec(html)) !== null) tickers.push(m[1])
  return tickers
}

// Fetch one Finviz screen, paginating up to maxResults tickers
async function fetchFinvizScreen(screen, maxResults = 100) {
  const tickers = []
  for (let page = 1; page <= 5 && tickers.length < maxResults; page++) {
    try {
      const r = (page - 1) * 20 + 1
      const res = await axios.get(FINVIZ_BASE, {
        params: { v: 111, f: screen.filters, ft: 4, r },
        headers: FINVIZ_HEADERS,
        timeout: 15000,
      })
      const found = parseFinvizTickers(res.data)
      if (!found.length) break
      tickers.push(...found)
      if (found.length < 20) break // last page
      await sleep(700) // polite paging delay
    } catch (err) {
      // Stop pagination on error — may just be an empty page
      break
    }
  }
  return [...new Set(tickers)]
}

// Run all Finviz screens and return unique candidates with screen hints
async function collectFinvizCandidates() {
  const candidateMap = new Map() // symbol → array of screen names that matched

  for (const screen of FINVIZ_SCREENS) {
    try {
      const tickers = await fetchFinvizScreen(screen)
      console.log(`[StockScanner] Finviz "${screen.name}": ${tickers.length} candidates`)
      for (const t of tickers) {
        if (!candidateMap.has(t)) candidateMap.set(t, [])
        candidateMap.get(t).push(screen.name)
      }
    } catch (err) {
      console.error(`[StockScanner] Finviz screen "${screen.name}" error:`, err.message)
    }
    await sleep(1200) // polite delay between screens
  }

  return candidateMap
}

// ============================================
// SIGNAL DETECTION
// ============================================

function detectSignals(data, rules) {
  const signals = []
  const { closes, highs, lows, volumes, currentPrice, prevClose, todayOpen } = data

  // RSI
  const rsi = calcRSI(closes, rules.rsi.period)
  if (rsi != null) {
    if (rsi < rules.rsi.oversold) {
      signals.push({ type: 'RSI_OVERSOLD', emoji: '📉', description: `RSI Oversold (${rsi.toFixed(1)})`, setup: 'Potential bounce play — watch for reversal candle' })
    } else if (rsi > rules.rsi.overbought) {
      signals.push({ type: 'RSI_OVERBOUGHT', emoji: '📈', description: `RSI Overbought (${rsi.toFixed(1)})`, setup: 'Extended — potential pullback or short setup' })
    }
  }

  // EMA crossovers
  for (const period of rules.ema.periods) {
    if (closes.length >= period + 1 && prevClose != null) {
      const ema = calcEMA(closes, period)
      const prevEma = calcPrevEMA(closes, period)
      if (ema && prevEma) {
        if (prevClose < prevEma && currentPrice > ema) {
          signals.push({ type: `EMA${period}_CROSS_ABOVE`, emoji: '🟢', description: `Price crossed above EMA${period} ($${ema.toFixed(2)})`, setup: `Bullish EMA${period} cross — momentum entry` })
        } else if (prevClose > prevEma && currentPrice < ema) {
          signals.push({ type: `EMA${period}_CROSS_BELOW`, emoji: '🔴', description: `Price crossed below EMA${period} ($${ema.toFixed(2)})`, setup: `Bearish EMA${period} break — watch for further weakness` })
        }
      }
    }
  }

  // MACD
  const macd = calcMACD(closes)
  if (macd?.current && macd?.prev) {
    const { MACD: m, signal: s } = macd.current
    const { MACD: pm, signal: ps } = macd.prev
    if (pm != null && ps != null && m != null && s != null) {
      if (pm < ps && m > s) signals.push({ type: 'MACD_BULLISH_CROSS', emoji: '🟢', description: 'MACD Bullish Crossover', setup: 'Momentum shifting bullish' })
      else if (pm > ps && m < s) signals.push({ type: 'MACD_BEARISH_CROSS', emoji: '🔴', description: 'MACD Bearish Crossover', setup: 'Momentum shifting bearish' })
    }
  }

  // Volume spike
  const volRatio = calcVolumeRatio(volumes)
  if (volRatio >= rules.volume.spikeMultiplier) {
    signals.push({ type: 'VOLUME_SPIKE', emoji: '📊', description: `Volume Spike (${volRatio.toFixed(1)}x average)`, setup: 'High volume — institutional activity likely' })
  }

  // 52-week breakout / breakdown
  if (highs.length >= 50) {
    const { high52, low52 } = calc52WeekRange(highs, lows)
    if (currentPrice >= high52 * (1 - rules.breakout.nearHighPct / 100)) {
      signals.push({ type: '52W_HIGH', emoji: '🚀', description: `Near 52-Week High ($${high52.toFixed(2)})`, setup: 'Breakout watch — momentum play if volume confirms' })
    } else if (currentPrice <= low52 * (1 + rules.breakout.nearLowPct / 100)) {
      signals.push({ type: '52W_LOW', emoji: '⚠️', description: `Near 52-Week Low ($${low52.toFixed(2)})`, setup: 'Support test — watch for reversal or breakdown continuation' })
    }
  }

  // Gap up/down
  if (prevClose && todayOpen) {
    const gapPct = ((todayOpen - prevClose) / prevClose) * 100
    if (gapPct >= rules.gap.minPct) {
      signals.push({ type: 'GAP_UP', emoji: '⬆️', description: `Gap Up +${gapPct.toFixed(1)}% at open`, setup: 'Gap play — watch for fill or continuation' })
    } else if (gapPct <= -rules.gap.minPct) {
      signals.push({ type: 'GAP_DOWN', emoji: '⬇️', description: `Gap Down ${gapPct.toFixed(1)}% at open`, setup: 'Gap down — bounce watch or continuation short' })
    }
  }

  return signals
}

// ============================================
// ALERT FORMATTING
// ============================================

function formatAlert(symbol, signals, data, quote, source = 'watchlist') {
  const time = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })

  const volRatio   = calcVolumeRatio(data.volumes)
  const price      = data.currentPrice
  const main       = signals[0]
  const extra      = signals.slice(1)
  const pctRaw     = quote?.regularMarketChangePercent
  const changePct  = pctRaw != null ? `${pctRaw >= 0 ? '+' : ''}${pctRaw.toFixed(2)}%` : null
  const sourceTag  = source === 'market' ? ' _(market screen)_' : ''

  let msg = `🚨 **STOCK ALERT: ${symbol}**${sourceTag}\n`
  msg += `Signal: ${main.description}\n`
  msg += `Price: $${price.toFixed(2)}${changePct ? ` (${changePct})` : ''}\n`
  msg += `Volume: ${volRatio.toFixed(1)}x average\n`
  msg += `Setup: ${main.setup}\n`
  if (extra.length > 0) msg += `Also: ${extra.map(s => `${s.emoji} ${s.description}`).join(' · ')}\n`
  msg += `Time: ${time}`
  return msg
}

// ============================================
// DEDUP — don't re-alert same signal within 2h
// ============================================

const alertHistory = new Map()

function filterNewSignals(symbol, signals) {
  const now  = Date.now()
  const prev = alertHistory.get(symbol) || {}
  const fresh = signals.filter(s => {
    const last = prev[s.type]
    return !last || now - last > ALERT_COOLDOWN_MS
  })
  if (fresh.length > 0) {
    const updated = { ...prev }
    fresh.forEach(s => { updated[s.type] = now })
    alertHistory.set(symbol, updated)
  }
  return fresh
}

// ============================================
// SYMBOL SCANNING
// ============================================

async function scanSymbol(symbol, rules, useCache = false) {
  const data = useCache ? await fetchStockDataCached(symbol) : await fetchStockData(symbol)
  if (!data) return null

  const signals = detectSignals(data, rules)
  if (!signals.length) return null

  const fresh = filterNewSignals(symbol, signals)
  if (!fresh.length) return null

  const quote = await fetchQuote(symbol)
  return { symbol, signals: fresh, data, quote }
}

// Scan a list of symbols in batches of `batchSize` concurrent requests
async function scanBatch(symbols, rules, { batchSize = 5, useCache = false, delayMs = 300 } = {}) {
  const hits = []
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize)
    const results = await Promise.all(batch.map(sym => scanSymbol(sym, rules, useCache)))
    hits.push(...results.filter(Boolean))
    if (i + batchSize < symbols.length) await sleep(delayMs)
  }
  return hits
}

async function sendAlerts(hits, discordClient, source) {
  if (!hits.length || !discordClient) return
  try {
    const channel = await discordClient.channels.fetch(STOCK_ALERTS_CHANNEL)
    for (const hit of hits) {
      await channel.send(formatAlert(hit.symbol, hit.signals, hit.data, hit.quote, source))
    }
  } catch (err) {
    console.error('[StockScanner] Discord send failed:', err.message)
  }
}

// ============================================
// SCAN STATS (for !scan status)
// ============================================

const scanStats = {
  market:    { lastRun: null, candidates: 0, alerts: 0 },
  watchlist: { lastRun: null, scanned: 0, alerts: 0 },
}

// ============================================
// MARKET SCREEN (Finviz → Yahoo Finance confirm)
// Covers entire ~8,000 stock market in ~2-3 minutes
// ============================================

async function runMarketScreen(discordClient) {
  const watchlist = loadWatchlist()
  if (!watchlist.alertsEnabled) return { candidates: 0, alerts: 0 }

  console.log('[StockScanner] Starting full market screen via Finviz...')

  const candidateMap = await collectFinvizCandidates()

  if (candidateMap.size === 0) {
    console.log('[StockScanner] No candidates returned — Finviz may be unavailable or all screens empty.')
    return { candidates: 0, alerts: 0, error: 'Finviz unavailable' }
  }

  console.log(`[StockScanner] ${candidateMap.size} unique candidates — confirming with Yahoo Finance...`)

  const rules   = loadRules()
  const symbols = [...candidateMap.keys()]

  // Scan candidates concurrently in batches of 5, using cache
  const hits = await scanBatch(symbols, rules, { batchSize: 5, useCache: true, delayMs: 300 })

  // Tag each alert with which Finviz screens it came from
  for (const hit of hits) {
    const screens = candidateMap.get(hit.symbol)
    if (screens?.length > 1) {
      const extra = `Found in: ${screens.join(', ')}`
      hit.signals[0] = { ...hit.signals[0], setup: `${hit.signals[0].setup} [${extra}]` }
    }
  }

  await sendAlerts(hits, discordClient, 'market')

  scanStats.market = { lastRun: new Date().toISOString(), candidates: candidateMap.size, alerts: hits.length }

  console.log(`[StockScanner] Market screen done: ${candidateMap.size} candidates → ${hits.length} alert(s).`)
  return { candidates: candidateMap.size, alerts: hits.length }
}

// ============================================
// WATCHLIST SCAN (close tracking, every 15 min)
// ============================================

async function runWatchlistScan(discordClient) {
  const watchlist = loadWatchlist()
  if (!watchlist.alertsEnabled) return { scanned: 0, alerts: 0 }

  const { symbols } = watchlist
  if (!symbols.length) return { scanned: 0, alerts: 0 }

  const rules = loadRules()
  console.log(`[StockScanner] Watchlist scan: ${symbols.length} symbols...`)

  // Watchlist: fresh data every time, sequential to be gentle
  const hits = []
  for (const symbol of symbols) {
    try {
      const result = await scanSymbol(symbol, rules, false)
      if (result) hits.push(result)
      await sleep(400)
    } catch (err) {
      console.error(`[StockScanner] Watchlist error on ${symbol}:`, err.message)
    }
  }

  await sendAlerts(hits, discordClient, 'watchlist')

  scanStats.watchlist = { lastRun: new Date().toISOString(), scanned: symbols.length, alerts: hits.length }

  console.log(`[StockScanner] Watchlist scan done: ${symbols.length} scanned, ${hits.length} alert(s).`)
  return { scanned: symbols.length, alerts: hits.length }
}

// Backwards-compat alias used by old `!scan now` flow
async function runScan(discordClient) {
  return runWatchlistScan(discordClient)
}

// ============================================
// AFTER-HOURS SUMMARY
// ============================================

async function sendAfterHoursSummary(discordClient) {
  const watchlist = loadWatchlist()
  if (!watchlist.alertsEnabled || !watchlist.symbols.length) return

  const lines = []
  for (const symbol of watchlist.symbols) {
    try {
      const quote = await fetchQuote(symbol)
      if (!quote) continue
      const pct = (quote.regularMarketChangePercent || 0).toFixed(2)
      const dir = pct >= 0 ? '🟢' : '🔴'
      lines.push(`${dir} **${symbol}** $${(quote.regularMarketPrice || 0).toFixed(2)} (${pct >= 0 ? '+' : ''}${pct}%)`)
      await sleep(300)
    } catch { /* skip */ }
  }

  if (!lines.length) return

  try {
    const channel = await discordClient.channels.fetch(STOCK_ALERTS_CHANNEL)
    const date = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric',
    })
    await channel.send(`📊 **After-Hours Summary — ${date}**\n\n${lines.join('\n')}`)
  } catch (err) {
    console.error('[StockScanner] After-hours summary failed:', err.message)
  }
}

// ============================================
// SCHEDULER
// ============================================

let _scanTimer  = null
let _lastRunMin = -1

function startStockScannerLoop(discordClient) {
  console.log('[StockScanner] Loop started — Finviz market screen hourly, watchlist every 15 min')

  _scanTimer = setInterval(async () => {
    if (isWeekend()) return

    const est  = getNowEST()
    const h    = est.getHours()
    const m    = est.getMinutes()
    const tMin = h * 60 + m

    if (tMin === _lastRunMin) return

    const marketOpen  = 9 * 60 + 30
    const marketClose = 16 * 60

    // 8:00 AM — pre-market: full market screen + watchlist
    if (h === 8 && m === 0) {
      _lastRunMin = tMin
      console.log('[StockScanner] Pre-market run...')
      await runMarketScreen(discordClient)
      await runWatchlistScan(discordClient)
      return
    }

    // Market hours: market screen on the hour, watchlist every 15 min
    if (tMin >= marketOpen && tMin < marketClose) {
      const isOnHour = (m === 0) || (h === 9 && m === 30) // include 9:30 open
      const isEvery15 = m % 15 === 0

      if (isEvery15) {
        _lastRunMin = tMin
        if (isOnHour) {
          // On the hour: run both
          console.log('[StockScanner] Hourly: market screen + watchlist scan...')
          await runMarketScreen(discordClient)
          await runWatchlistScan(discordClient)
        } else {
          // Between hours: watchlist only
          console.log('[StockScanner] 15-min: watchlist scan...')
          await runWatchlistScan(discordClient)
        }
      }
      return
    }

    // 4:30 PM — after-hours summary
    if (h === 16 && m === 30) {
      _lastRunMin = tMin
      await sendAfterHoursSummary(discordClient)
    }
  }, 60_000)
}

function stopStockScannerLoop() {
  if (_scanTimer) { clearInterval(_scanTimer); _scanTimer = null }
}

// ============================================
// DISCORD COMMANDS
// ============================================

async function handleStockCommand(message, discordClient) {
  const content = message.content.trim()
  const parts   = content.split(/\s+/)
  const cmd     = parts[0].toLowerCase()
  const sub     = parts[1]?.toLowerCase()

  // !watchlist add AAPL TSLA NVDA
  if (cmd === '!watchlist' && sub === 'add') {
    const toAdd = parts.slice(2).map(s => s.toUpperCase()).filter(Boolean)
    if (!toAdd.length) return message.reply('Usage: `!watchlist add AAPL TSLA NVDA`')
    const wl = loadWatchlist()
    const before = wl.symbols.length
    wl.symbols = [...new Set([...wl.symbols, ...toAdd])]
    saveWatchlist(wl)
    return message.reply(`Added ${wl.symbols.length - before} symbol(s). Watchlist (${wl.symbols.length}): ${wl.symbols.join(', ')}`)
  }

  // !watchlist remove AAPL
  if (cmd === '!watchlist' && sub === 'remove') {
    const toRemove = parts.slice(2).map(s => s.toUpperCase()).filter(Boolean)
    if (!toRemove.length) return message.reply('Usage: `!watchlist remove AAPL`')
    const wl = loadWatchlist()
    wl.symbols = wl.symbols.filter(s => !toRemove.includes(s))
    saveWatchlist(wl)
    return message.reply(`Removed. Watchlist (${wl.symbols.length}): ${wl.symbols.join(', ') || '(empty)'}`)
  }

  // !watchlist show
  if (cmd === '!watchlist') {
    const wl = loadWatchlist()
    if (!wl.symbols.length) return message.reply('Watchlist is empty. Add symbols: `!watchlist add AAPL TSLA`')
    return message.reply(
      `**Watchlist (${wl.symbols.length}):** ${wl.symbols.join(', ')}\n` +
      `Alerts: ${wl.alertsEnabled ? '✅ On' : '❌ Off'}\n\n` +
      `The market screen covers ALL stocks automatically — watchlist is for close tracking only.`
    )
  }

  // !scan now — run both market screen + watchlist
  if (cmd === '!scan' && sub === 'now') {
    await message.reply('Running full market screen (Finviz → Yahoo Finance confirm) + watchlist scan...\nThis takes ~2-3 minutes. Alerts will appear in <#' + STOCK_ALERTS_CHANNEL + '>.')
    const [mResult, wResult] = await Promise.allSettled([
      runMarketScreen(discordClient),
      runWatchlistScan(discordClient),
    ])
    const m = mResult.value || {}
    const w = wResult.value || {}
    return message.reply(
      `**Scan complete:**\n` +
      `Market screen: ${m.candidates || 0} candidates found → ${m.alerts || 0} alert(s)${m.error ? ` _(${m.error})_` : ''}\n` +
      `Watchlist: ${w.scanned || 0} scanned → ${w.alerts || 0} alert(s)`
    )
  }

  // !scan market — just the Finviz market screen
  if (cmd === '!scan' && sub === 'market') {
    await message.reply('Running full market screen (Finviz → Yahoo Finance)... ~2-3 min.')
    const result = await runMarketScreen(discordClient)
    return message.reply(
      result.error
        ? `❌ Market screen failed: ${result.error}`
        : `Market screen done: **${result.candidates}** candidates → **${result.alerts}** alert(s) sent.`
    )
  }

  // !scan watchlist — just the watchlist
  if (cmd === '!scan' && (sub === 'watchlist' || sub === 'list')) {
    const wl = loadWatchlist()
    if (!wl.symbols.length) return message.reply('Watchlist is empty. Add: `!watchlist add AAPL`')
    await message.reply(`Scanning ${wl.symbols.length} watchlist symbols...`)
    const result = await runWatchlistScan(discordClient)
    return message.reply(`Watchlist scan done: ${result.scanned} scanned, ${result.alerts} alert(s) sent.`)
  }

  // !scan status
  if (cmd === '!scan' && sub === 'status') {
    const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'Never'
    return message.reply(
      `**Stock Scanner Status**\n\n` +
      `**Market screen** (Finviz → entire market)\n` +
      `  Last run: ${fmt(scanStats.market.lastRun)}\n` +
      `  Last result: ${scanStats.market.candidates} candidates → ${scanStats.market.alerts} alert(s)\n` +
      `  Schedule: hourly during market hours + 8am pre-market\n\n` +
      `**Watchlist scan** (Yahoo Finance, close tracking)\n` +
      `  Last run: ${fmt(scanStats.watchlist.lastRun)}\n` +
      `  Last result: ${scanStats.watchlist.scanned} scanned → ${scanStats.watchlist.alerts} alert(s)\n` +
      `  Schedule: every 15 min during market hours\n\n` +
      `Alerts: ${loadWatchlist().alertsEnabled ? '✅ On' : '❌ Off'} · Market: ${isMarketOpen() ? '🟢 Open' : '🔴 Closed'}`
    )
  }

  // !alerts on / off
  if (cmd === '!alerts') {
    const wl = loadWatchlist()
    if (sub === 'on')  { wl.alertsEnabled = true;  saveWatchlist(wl); return message.reply('Stock alerts ✅ enabled.') }
    if (sub === 'off') { wl.alertsEnabled = false; saveWatchlist(wl); return message.reply('Stock alerts ❌ disabled.') }
    return message.reply(`Alerts: ${wl.alertsEnabled ? '✅ On' : '❌ Off'} — toggle with \`!alerts on\` / \`!alerts off\``)
  }

  // !rules show
  if (cmd === '!rules' && sub === 'show') {
    const r = loadRules()
    return message.reply(
      '**Current Scan Rules:**\n```\n' +
      `RSI Oversold:   < ${r.rsi.oversold}\n` +
      `RSI Overbought: > ${r.rsi.overbought}\n` +
      `EMA Periods:    ${r.ema.periods.join(', ')}\n` +
      `MACD:           (${r.macd.fast}, ${r.macd.slow}, ${r.macd.signal})\n` +
      `Volume Spike:   ${r.volume.spikeMultiplier}x avg\n` +
      `Gap Up/Down:    ≥${r.gap.minPct}%\n` +
      `52-Week Near:   ±${r.breakout.nearHighPct}%\n` +
      `Min Avg Volume: 200k (Finviz pre-filter)\n` +
      '```\n' +
      `Edit \`stockRules.json\` to adjust thresholds.\n\n` +
      `**Finviz screens running:**\n${FINVIZ_SCREENS.map(s => `• ${s.name}`).join('\n')}`
    )
  }

  return false
}

function isStockCommand(content) {
  const cmd = content.trim().split(/\s+/)[0].toLowerCase()
  return ['!watchlist', '!scan', '!alerts', '!rules'].includes(cmd)
}

// ============================================
// DEFAULT RULES
// ============================================

function getDefaultRules() {
  return {
    rsi:      { period: 14, oversold: 30, overbought: 70 },
    ema:      { periods: [20, 50, 200] },
    macd:     { fast: 12, slow: 26, signal: 9 },
    volume:   { spikeMultiplier: 2.0, lookbackPeriod: 20 },
    gap:      { minPct: 5.0 },
    breakout: { nearHighPct: 1.0, nearLowPct: 1.0 },
  }
}

module.exports = {
  runScan,
  runMarketScreen,
  runWatchlistScan,
  startStockScannerLoop,
  stopStockScannerLoop,
  handleStockCommand,
  isStockCommand,
  sendAfterHoursSummary,
  isMarketOpen,
  isPremarket,
  loadWatchlist,
}
