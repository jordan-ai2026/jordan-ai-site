'use strict'

// ============================================
// TRADINGVIEW WATCHLIST IMPORTER — Jordan AI
//
// Fetches tickers directly from a public TradingView watchlist URL.
// No login needed — scrapes the page HTML for EXCHANGE:SYMBOL patterns.
//
// URL configured below. Bot re-fetches on startup and every 6 hours,
// plus on demand via !watchlist tv-sync.
//
// Only keeps US equity/ETF tickers from: NASDAQ, NYSE, AMEX, CBOE.
// Strips index/crypto/forex/commodity noise automatically.
// ============================================

const fs      = require('fs')
const path    = require('path')
const https   = require('https')

const BOT_DIR        = __dirname
const WATCHLIST_PATH = path.join(BOT_DIR, 'watchlist.json')

// ── Your public TradingView watchlist URL ──
const TV_WATCHLIST_URL = 'https://www.tradingview.com/watchlists/16359349/'

// Only keep tickers from these US exchanges (filters out indices, crypto, forex, etc.)
const KEEP_EXCHANGES = ['NASDAQ', 'NYSE', 'AMEX', 'CBOE']

// Sync interval: every 6 hours
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000

// Legacy file-drop support (kept for backwards compat)
const IMPORT_FILENAME = 'tradingview-watchlist.txt'
const IMPORT_PATH     = path.join(BOT_DIR, IMPORT_FILENAME)

// ============================================
// FETCH — pull raw HTML from TV watchlist URL
// ============================================

function fetchTVPage(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }
    https.get(url, opts, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

// ============================================
// PARSER — extract tickers from TV page HTML
// ============================================

function parseTVPage(html) {
  // TradingView embeds symbols as EXCHANGE:SYMBOL in the page HTML
  const matches = html.match(/[A-Z]{1,6}:[A-Z]{1,10}/g) || []
  const seen = new Set()
  const symbols = []

  for (const m of matches) {
    const [exchange, ticker] = m.split(':')
    if (!KEEP_EXCHANGES.includes(exchange)) continue
    if (seen.has(ticker)) continue
    seen.add(ticker)
    symbols.push(ticker)
  }

  return symbols
}

// ============================================
// PARSER — handles TV file export format (legacy)
// ============================================

function parseTVExport(raw) {
  const symbols = []
  const parts = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
  for (const part of parts) {
    const ticker = part.includes(':') ? part.split(':')[1] : part
    const clean  = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, '')
    if (clean.length >= 1 && clean.length <= 10) symbols.push(clean)
  }
  return [...new Set(symbols)]
}

// ============================================
// SYNC — apply parsed symbols to watchlist.json
// ============================================

function loadWatchlist() {
  if (!fs.existsSync(WATCHLIST_PATH)) {
    return { symbols: [], alertsEnabled: true }
  }
  return JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'))
}

function syncWatchlist(symbols) {
  const wl = loadWatchlist()
  const before = [...wl.symbols]
  wl.symbols = symbols  // full replace with TV export

  fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(wl, null, 2))

  const added   = symbols.filter(s => !before.includes(s))
  const removed = before.filter(s => !symbols.includes(s))

  return { before, after: symbols, added, removed }
}

// ============================================
// IMPORT FILE PROCESSOR
// ============================================

function processImportFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const symbols = parseTVExport(raw)

    if (!symbols.length) {
      console.log(`[TVImport] No valid symbols found in ${path.basename(filePath)}`)
      return null
    }

    const result = syncWatchlist(symbols)
    console.log(
      `[TVImport] Synced ${symbols.length} symbols from TradingView export.` +
      (result.added.length   ? ` Added: ${result.added.join(', ')}.`   : '') +
      (result.removed.length ? ` Removed: ${result.removed.join(', ')}.` : '')
    )
    return result
  } catch (err) {
    console.error('[TVImport] Failed to process file:', err.message)
    return null
  }
}

// ============================================
// URL SYNC — fetch from TradingView and update watchlist
// ============================================

async function syncFromURL(silent = false) {
  try {
    console.log(`[TVImport] Fetching watchlist from ${TV_WATCHLIST_URL}...`)
    const html = await fetchTVPage(TV_WATCHLIST_URL)
    const symbols = parseTVPage(html)

    if (!symbols.length) {
      console.log('[TVImport] No valid US equity symbols found in page.')
      return null
    }

    const result = syncWatchlist(symbols)
    console.log(
      `[TVImport] URL sync: ${symbols.length} symbols.` +
      (result.added.length   ? ` Added: ${result.added.join(', ')}.`   : '') +
      (result.removed.length ? ` Removed: ${result.removed.join(', ')}.` : '')
    )
    return result
  } catch (err) {
    console.error('[TVImport] URL sync failed:', err.message)
    return null
  }
}

// ============================================
// SCHEDULER — re-sync every 6 hours + on startup
// ============================================

let _syncTimer  = null
let _onSyncCb   = null

function startWatcher(onSync) {
  _onSyncCb = onSync || null

  // Sync immediately on startup
  syncFromURL(false).then(result => {
    if (result && _onSyncCb) _onSyncCb(result)
  })

  // Then every 6 hours
  _syncTimer = setInterval(async () => {
    const result = await syncFromURL(false)
    if (result && _onSyncCb && (result.added.length || result.removed.length)) {
      // Only notify Discord if something actually changed
      _onSyncCb(result)
    }
  }, SYNC_INTERVAL_MS)

  console.log(`[TVImport] Auto-sync started — fetching from TradingView every 6 hours.`)
}

function stopWatcher() {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null }
}

// ============================================
// DISCORD COMMAND — !watchlist tv-sync
// ============================================

async function handleTVSyncCommand(message) {
  const content = message.content.trim().toLowerCase()
  if (!content.includes('tv-sync') && !content.includes('tv-import')) return false

  await message.reply(`🔄 Fetching your TradingView watchlist...`)

  const result = await syncFromURL()
  if (!result) {
    return message.reply('❌ Failed to fetch the TradingView watchlist. The page may be temporarily unavailable.')
  }

  return message.reply(
    `✅ **TradingView watchlist synced!**\n\n` +
    `**Symbols (${result.after.length}):** ${result.after.join(', ')}\n` +
    (result.added.length   ? `➕ Added: ${result.added.join(', ')}\n`   : '') +
    (result.removed.length ? `➖ Removed: ${result.removed.join(', ')}\n` : '') +
    `\nAll scans and btc_charlie alerts updated.`
  )
}

module.exports = {
  startWatcher,
  stopWatcher,
  syncFromURL,
  processImportFile,
  parseTVExport,
  handleTVSyncCommand,
  TV_WATCHLIST_URL,
  IMPORT_PATH,
  IMPORT_FILENAME,
}
