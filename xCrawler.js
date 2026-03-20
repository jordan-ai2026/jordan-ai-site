// ============================================
// JORDAN AI — X (TWITTER) MARKET CRAWLER
// Scrapes X for AI market intel, categorizes
// findings, tracks trends, and feeds Jordan
// actionable strategy insights.
//
// BACKEND (set in .env):
//   RAPIDAPI_KEY=xxx   (twitter-api45 subscription)
//   OR TWITTER_BEARER_TOKEN=xxx  (Twitter Basic $100/mo)
//
// Schedule: runs daily at 9am
// Discord:  !x scan | !x report | !x keywords add "..."
// Intel:    website/data/market-intel.json
// ============================================

require("dotenv").config()
const fs   = require("fs")
const path = require("path")
const OpenAI = require("openai")

const KEYWORDS_FILE     = path.join(__dirname, "x-keywords.json")
const LAST_REPORT_FILE  = path.join(__dirname, "x-last-report.json")
const MARKET_INTEL_FILE = path.join(__dirname, "website", "data", "market-intel.json")

const MIN_LIKES     = 50
const MAX_AGE_HOURS = 48

const RAPIDAPI_HOSTS = [
  { host: "twitter-api45.p.rapidapi.com",  searchPath: "/search.php?query={q}&count=30",           label: "Twitter API45"                },
  { host: "twitter-api-v2.p.rapidapi.com", searchPath: "/tweets/search?query={q}&max_results=30",  label: "Twitter API v2 (andrefelipe)" },
  { host: "twitter135.p.rapidapi.com",     searchPath: "/search/?q={q}&count=30&lang=en",           label: "Twitter135 (DailyBots)"       },
]

// ── DEFAULT KEYWORDS ──────────────────────────

const DEFAULT_KEYWORDS = [
  "AI agent",
  "AI automation",
  "AI SaaS",
  "selling AI services",
  "AI freelance",
  "built with Claude",
  "built with GPT",
]

// ── KEYWORD STORE ─────────────────────────────

function loadKeywords() {
  if (!fs.existsSync(KEYWORDS_FILE)) {
    fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(DEFAULT_KEYWORDS, null, 2))
    return [...DEFAULT_KEYWORDS]
  }
  try {
    const data = JSON.parse(fs.readFileSync(KEYWORDS_FILE, "utf8"))
    return Array.isArray(data) ? data : [...DEFAULT_KEYWORDS]
  } catch { return [...DEFAULT_KEYWORDS] }
}

function saveKeywords(kws) {
  fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(kws, null, 2))
}

function addKeyword(keyword) {
  const kws   = loadKeywords()
  const clean = keyword.trim()
  if (kws.some(k => k.toLowerCase() === clean.toLowerCase())) {
    return { added: false, reason: "Keyword already exists" }
  }
  kws.push(clean)
  saveKeywords(kws)
  return { added: true, keyword: clean, total: kws.length }
}

function removeKeyword(keyword) {
  const kws = loadKeywords()
  const idx = kws.findIndex(k => k.toLowerCase() === keyword.trim().toLowerCase())
  if (idx === -1) return { removed: false, reason: "Keyword not found" }
  const removed = kws.splice(idx, 1)[0]
  saveKeywords(kws)
  return { removed: true, keyword: removed }
}

// ── BACKEND DETECTION ─────────────────────────

function detectBackend() {
  if (process.env.RAPIDAPI_KEY) return "rapidapi"
  if (process.env.TWITTER_BEARER_TOKEN) return "twitter_bearer"
  if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET) return "twitter_appauth"
  return null
}

function isConfigured() {
  return !!detectBackend()
}

// ── TWITTER API v2 ────────────────────────────

async function getTwitterBearer() {
  if (process.env.TWITTER_BEARER_TOKEN) return process.env.TWITTER_BEARER_TOKEN
  const key    = process.env.TWITTER_API_KEY
  const secret = process.env.TWITTER_API_SECRET
  const creds  = Buffer.from(encodeURIComponent(key) + ":" + encodeURIComponent(secret)).toString("base64")
  const res    = await fetch("https://api.twitter.com/oauth2/token", {
    method:  "POST",
    headers: { "Authorization": "Basic " + creds, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body:    "grant_type=client_credentials",
  })
  const data = await res.json()
  if (!data.access_token) throw new Error("Twitter bearer token failed: " + JSON.stringify(data))
  return data.access_token
}

async function searchTwitterAPI(query, bearer, maxResults = 30) {
  const params = new URLSearchParams({
    query: `${query} lang:en -is:retweet`, max_results: String(Math.min(maxResults, 100)),
    "tweet.fields": "public_metrics,created_at,author_id,text",
    expansions: "author_id", "user.fields": "username,name",
  })
  const res  = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
    headers: { Authorization: "Bearer " + bearer },
  })
  const body = await res.json()
  if (body.errors || body.title) throw new Error(`Twitter API: ${body.title || body.errors?.[0]?.message}`)
  const usersById = {}
  for (const u of (body.includes?.users || [])) usersById[u.id] = u
  return (body.data || []).map(t => {
    const user = usersById[t.author_id] || {}
    return {
      id: t.id, username: user.username || t.author_id, displayName: user.name || "",
      text: t.text || "", likes: t.public_metrics?.like_count || 0,
      replies: t.public_metrics?.reply_count || 0, retweets: t.public_metrics?.retweet_count || 0,
      createdAt: new Date(t.created_at || Date.now()),
      url: `https://x.com/${user.username || "i"}/status/${t.id}`,
    }
  })
}

// ── RAPIDAPI ──────────────────────────────────

async function searchRapidAPI(query, hostConfig) {
  const url = `https://${hostConfig.host}${hostConfig.searchPath.replace("{q}", encodeURIComponent(query))}`
  const res  = await fetch(url, {
    headers: { "X-RapidAPI-Key": process.env.RAPIDAPI_KEY, "X-RapidAPI-Host": hostConfig.host },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`RapidAPI ${hostConfig.label} ${res.status}: ${err.substring(0, 150)}`)
  }
  const body = await res.json()
  const tweets = body.timeline || body.data || body.statuses || body.results || body.tweets || (Array.isArray(body) ? body : [])
  if (!Array.isArray(tweets)) return []
  return tweets.filter(t => t.type !== "promoted").map(t => {
    const username = t.screen_name
      || body.includes?.users?.find?.(u => u.id === t.author_id)?.username
      || t.user?.screen_name || t.username || "unknown"
    return {
      id:          t.tweet_id || t.id || t.id_str || "",
      username,
      displayName: t.name || t.user?.name || username || "",
      text:        t.text || t.full_text || "",
      likes:       Number(t.favorites || t.public_metrics?.like_count || t.favorite_count || t.likes || 0),
      replies:     Number(t.replies   || t.public_metrics?.reply_count || t.reply_count || 0),
      retweets:    Number(t.retweets  || t.public_metrics?.retweet_count || t.retweet_count || 0),
      createdAt:   new Date(t.created_at || t.createdAt || Date.now()),
      url:         t.url || `https://x.com/${username}/status/${t.tweet_id || t.id || t.id_str || ""}`,
    }
  })
}

// ── FETCH ALL KEYWORDS ────────────────────────

async function fetchAllKeywords(keywords) {
  const backend = detectBackend()
  const seen = new Set()
  const all  = []

  if (backend === "twitter_bearer" || backend === "twitter_appauth") {
    const bearer = await getTwitterBearer()
    for (const kw of keywords) {
      console.log(`   🔎 Searching: "${kw}"`)
      try {
        const tweets = await searchTwitterAPI(kw, bearer, 30)
        for (const t of tweets) { if (!t.id || seen.has(t.id)) continue; seen.add(t.id); all.push(t) }
      } catch (err) { console.log(`   ⚠️  "${kw}": ${err.message}`) }
    }
    return all
  }

  if (backend === "rapidapi") {
    let workingHost = null
    for (const hostConfig of RAPIDAPI_HOSTS) {
      try {
        console.log(`   🔌 Testing: ${hostConfig.label}`)
        const test = await searchRapidAPI(keywords[0], hostConfig)
        workingHost = hostConfig
        console.log(`   ✅ Using: ${hostConfig.label}`)
        for (const t of test) { if (!t.id || seen.has(t.id)) continue; seen.add(t.id); all.push(t) }
        break
      } catch (err) { console.log(`   ❌ ${hostConfig.label}: ${err.message.substring(0, 80)}`) }
    }
    if (!workingHost) throw new Error("No RapidAPI Twitter subscription found.\nSubscribe to one of these FREE at rapidapi.com:\n  • 'Twitter API v2' by andrefelipe\n  • 'Twitter135' by DailyBots\nThen add RAPIDAPI_KEY to your .env")
    for (const kw of keywords.slice(1)) {
      console.log(`   🔎 Searching: "${kw}"`)
      try {
        const tweets = await searchRapidAPI(kw, workingHost)
        for (const t of tweets) { if (!t.id || seen.has(t.id)) continue; seen.add(t.id); all.push(t) }
      } catch (err) { console.log(`   ⚠️  "${kw}": ${err.message.substring(0, 80)}`) }
    }
    return all
  }

  throw new Error("No Twitter API configured. Set RAPIDAPI_KEY in .env")
}

// ── FILTER ────────────────────────────────────

function filterTweets(tweets) {
  const cutoff = Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000
  return tweets
    .filter(t => t.likes >= MIN_LIKES && t.createdAt.getTime() >= cutoff)
    .sort((a, b) => b.likes - a.likes)
}

// ── DEEP GPT-4o-mini ANALYSIS ─────────────────
/**
 * One GPT call that returns all 5 intelligence categories + strategy.
 */
async function analyzeWithGPT(tweets) {
  if (tweets.length === 0) {
    return { selling: [], ideasToSteal: [], trends: [], competitors: [], partners: [], pricePoints: [], strategyInsights: [] }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const sample = tweets.slice(0, 50).map(t => ({
    username: "@" + t.username,
    text:     t.text.substring(0, 280),
    likes:    t.likes,
    replies:  t.replies,
    retweets: t.retweets,
    url:      t.url,
  }))

  const prompt = `You are a market intelligence analyst for Jordan AI — an AI digital agency selling chatbots, automation, SEO, and website services to small businesses.

Analyze these X (Twitter) posts about AI services. Our services: AI chatbots ($500-2k setup), automation workflows ($1-3k), website management ($500-1.5k/mo), SEO content ($500-1k/mo).

Posts:
${JSON.stringify(sample, null, 2)}

Return ONLY valid JSON (no markdown, no extra text):
{
  "selling": [
    {
      "username": "@handle",
      "service": "what they are selling (specific, under 10 words)",
      "price": "$X one-time or $X/month or null",
      "industry": "who they target (e.g. restaurants, SMBs, real estate)",
      "likes": 123,
      "url": "post url",
      "competitor": true or false
    }
  ],
  "ideasToSteal": [
    {
      "idea": "specific tactic or offer we could copy (under 20 words)",
      "why": "why this is working (under 15 words)",
      "action": "what Jordan should do to implement this (under 20 words)"
    }
  ],
  "trends": [
    {
      "topic": "trending AI topic or service (under 8 words)",
      "momentum": "growing/stable/fading",
      "relevance": "how relevant to our agency (high/medium/low)"
    }
  ],
  "competitors": [
    {
      "username": "@handle",
      "whatTheyDo": "their service offering (under 15 words)",
      "strength": "what makes them stand out (under 15 words)",
      "url": "post url"
    }
  ],
  "partners": [
    {
      "username": "@handle",
      "why": "why they'd be a good partner (under 15 words)",
      "approach": "how to reach out (under 15 words)",
      "url": "post url"
    }
  ],
  "pricePoints": [
    { "service": "service type", "low": 500, "high": 5000, "unit": "one-time or /month" }
  ],
  "strategyInsights": [
    "Specific actionable thing Jordan should do based on this data (under 25 words)"
  ]
}

Rules:
- selling[]: only posts where someone is ACTIVELY selling. Max 8 entries, highest engagement first.
- ideasToSteal[]: 3-5 tactics from the highest-performing posts we could adapt
- trends[]: 4-6 topics appearing across multiple posts, sorted by momentum
- competitors[]: people selling AI services similar to ours. Max 5.
- partners[]: people whose audience/skills complement ours (tool builders, coaches, consultants). Max 3.
- pricePoints[]: extract any $ amounts mentioned, group by service type
- strategyInsights[]: exactly 3 specific, actionable recommendations for Jordan based on what's working`

  const res = await openai.chat.completions.create({
    model:       "gpt-4o-mini",
    messages:    [{ role: "user", content: prompt }],
    max_tokens:  2000,
    temperature: 0.3,
  })

  const raw   = res.choices[0]?.message?.content || "{}"
  const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()

  try {
    return JSON.parse(clean)
  } catch {
    return { selling: [], ideasToSteal: [], trends: [], competitors: [], partners: [], pricePoints: [], strategyInsights: [] }
  }
}

// ── MARKET INTEL STORE ────────────────────────
/**
 * Append scan results to market-intel.json.
 * Tracks trends over time so Jordan can spot what's growing or dying.
 */
function saveMarketIntel(report) {
  const dir = path.dirname(MARKET_INTEL_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let intel = { scans: [], trendHistory: {}, serviceHistory: {} }
  if (fs.existsSync(MARKET_INTEL_FILE)) {
    try { intel = JSON.parse(fs.readFileSync(MARKET_INTEL_FILE, "utf8")) }
    catch { /* start fresh */ }
  }

  const dateKey = report.date.split("T")[0]

  // Append scan summary
  intel.scans.push({
    date:             dateKey,
    selling:          report.selling,
    ideasToSteal:     report.ideasToSteal,
    trends:           report.trends,
    competitors:      report.competitors,
    partners:         report.partners,
    pricePoints:      report.pricePoints,
    strategyInsights: report.strategyInsights,
    rawCount:         report.rawCount,
    filteredCount:    report.filteredCount,
  })
  // Keep last 90 scans
  if (intel.scans.length > 90) intel.scans = intel.scans.slice(-90)

  // Track trend history: trendHistory["AI voice agents"] = [{ date, count }]
  for (const trend of (report.trends || [])) {
    const key = trend.topic
    if (!intel.trendHistory[key]) intel.trendHistory[key] = []
    intel.trendHistory[key].push({ date: dateKey, momentum: trend.momentum })
    // Keep 30 data points per trend
    if (intel.trendHistory[key].length > 30) intel.trendHistory[key] = intel.trendHistory[key].slice(-30)
  }

  // Track service history: serviceHistory["AI chatbot"] = [{ date, priceLow, priceHigh }]
  for (const pp of (report.pricePoints || [])) {
    const key = pp.service
    if (!intel.serviceHistory[key]) intel.serviceHistory[key] = []
    intel.serviceHistory[key].push({ date: dateKey, low: pp.low, high: pp.high, unit: pp.unit })
    if (intel.serviceHistory[key].length > 30) intel.serviceHistory[key] = intel.serviceHistory[key].slice(-30)
  }

  fs.writeFileSync(MARKET_INTEL_FILE, JSON.stringify(intel, null, 2))
  console.log(`   💾 Market intel saved to website/data/market-intel.json (${intel.scans.length} scans total)`)
}

/**
 * Load market intel for Jordan to use in strategy decisions.
 */
function getMarketIntel() {
  if (!fs.existsSync(MARKET_INTEL_FILE)) return null
  try { return JSON.parse(fs.readFileSync(MARKET_INTEL_FILE, "utf8")) }
  catch { return null }
}

/**
 * Get a condensed strategy brief Jordan can read before making decisions.
 */
function getStrategyBrief() {
  const intel = getMarketIntel()
  if (!intel || intel.scans.length === 0) return "No market intel yet. Run !x scan to gather data."

  const recent = intel.scans.slice(-7)  // last 7 scans

  // Most mentioned services across recent scans
  const serviceCount = {}
  for (const scan of recent) {
    for (const s of (scan.selling || [])) {
      const k = s.service || ""
      serviceCount[k] = (serviceCount[k] || 0) + 1
    }
  }
  const topServices = Object.entries(serviceCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([svc]) => svc)

  // Growing trends
  const growingTrends = Object.entries(intel.trendHistory)
    .filter(([, history]) => {
      const recent = history.slice(-3)
      return recent.some(h => h.momentum === "growing")
    })
    .map(([topic]) => topic)
    .slice(0, 5)

  // Latest strategy insights
  const latestInsights = intel.scans.slice(-1)[0]?.strategyInsights || []

  // Price ranges
  const priceRanges = {}
  for (const scan of recent) {
    for (const pp of (scan.pricePoints || [])) {
      if (!priceRanges[pp.service]) priceRanges[pp.service] = { lows: [], highs: [] }
      if (pp.low)  priceRanges[pp.service].lows.push(pp.low)
      if (pp.high) priceRanges[pp.service].highs.push(pp.high)
    }
  }
  const priceSummary = Object.entries(priceRanges).map(([svc, data]) => {
    const avgLow  = data.lows.length  ? Math.round(data.lows.reduce((a, b) => a + b) / data.lows.length)   : null
    const avgHigh = data.highs.length ? Math.round(data.highs.reduce((a, b) => a + b) / data.highs.length) : null
    return `${svc}: $${avgLow || "?"}–$${avgHigh || "?"}`
  })

  return [
    `## X Market Intelligence Brief (last ${recent.length} scans)`,
    "",
    `**Top selling services right now:** ${topServices.join(", ") || "none"}`,
    `**Growing trends:** ${growingTrends.join(", ") || "none"}`,
    priceSummary.length ? `**Market prices:** ${priceSummary.join(" | ")}` : "",
    "",
    "**Latest strategy recommendations:**",
    ...latestInsights.map((i, n) => `${n + 1}. ${i}`),
  ].filter(Boolean).join("\n")
}

// ── MAIN SCAN ─────────────────────────────────

async function runScan() {
  const keywords = loadKeywords()
  const backend  = detectBackend()
  console.log(`\n🔍 X Crawler: scanning ${keywords.length} keywords (backend: ${backend || "NONE"})`)

  if (!backend) throw new Error("No API configured. Set RAPIDAPI_KEY in .env")

  const rawTweets = await fetchAllKeywords(keywords)
  console.log(`   📊 Raw tweets: ${rawTweets.length}`)

  const filtered = filterTweets(rawTweets)
  console.log(`   ✅ After filter (${MIN_LIKES}+ likes, <${MAX_AGE_HOURS}h): ${filtered.length}`)

  console.log("   🤖 Running deep analysis with GPT-4o-mini...")
  const analysis = await analyzeWithGPT(filtered)

  const report = {
    date:             new Date().toISOString(),
    dateDisplay:      new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    backend,
    keywordsUsed:     keywords,
    rawCount:         rawTweets.length,
    filteredCount:    filtered.length,
    selling:          analysis.selling          || [],
    ideasToSteal:     analysis.ideasToSteal     || [],
    trends:           analysis.trends           || [],
    competitors:      analysis.competitors      || [],
    partners:         analysis.partners         || [],
    pricePoints:      analysis.pricePoints      || [],
    strategyInsights: analysis.strategyInsights || [],
    topTweets:        filtered.slice(0, 10).map(t => ({
      username: t.username, text: t.text.substring(0, 200), likes: t.likes, url: t.url,
    })),
  }

  // Save last report + append to market intel history
  fs.writeFileSync(LAST_REPORT_FILE, JSON.stringify(report, null, 2))
  saveMarketIntel(report)

  return report
}

// ── FORMAT DISCORD REPORT ─────────────────────

function formatDiscordReport(report) {
  const lines = []

  lines.push(`🔍 **X AI Market Report — ${report.dateDisplay}**`)
  lines.push(`*${report.keywordsUsed.length} keywords · ${report.rawCount} posts found · ${report.filteredCount} high-engagement posts analyzed*`)
  lines.push("")

  // 💰 What's Selling
  lines.push("💰 **What's Selling Right Now:**")
  if (report.selling?.length > 0) {
    for (const s of report.selling.slice(0, 5)) {
      const price = s.price && s.price !== "null" ? ` — ${s.price}` : ""
      const industry = s.industry && s.industry !== "null" ? ` *(${s.industry})*` : ""
      lines.push(`• ${s.username}: **${s.service}**${price}${industry} — ${s.likes} ❤️`)
    }
  } else {
    lines.push("• No active sellers found")
  }

  lines.push("")

  // 💡 Ideas to Steal
  lines.push("💡 **Ideas to Steal:**")
  if (report.ideasToSteal?.length > 0) {
    for (const idea of report.ideasToSteal.slice(0, 3)) {
      lines.push(`• **${idea.idea}**`)
      lines.push(`  → *${idea.action}*`)
    }
  } else {
    lines.push("• None spotted")
  }

  lines.push("")

  // 🔥 Trending Topics
  lines.push("🔥 **Hot Trends:**")
  if (report.trends?.length > 0) {
    for (const t of report.trends.slice(0, 5)) {
      const emoji = t.momentum === "growing" ? "📈" : t.momentum === "fading" ? "📉" : "➡️"
      lines.push(`• ${emoji} ${t.topic} *(${t.relevance} relevance)*`)
    }
  } else {
    lines.push("• No clear trends")
  }

  lines.push("")

  // ⚠️ Competitors
  if (report.competitors?.length > 0) {
    lines.push("⚠️ **Competitors to Watch:**")
    for (const c of report.competitors.slice(0, 3)) {
      lines.push(`• ${c.username}: ${c.whatTheyDo} — *${c.strength}*`)
    }
    lines.push("")
  }

  // 🎯 Price Ranges Spotted
  if (report.pricePoints?.length > 0) {
    lines.push("💲 **Market Prices Spotted:**")
    for (const pp of report.pricePoints.slice(0, 4)) {
      lines.push(`• ${pp.service}: $${pp.low}–$${pp.high} ${pp.unit || ""}`)
    }
    lines.push("")
  }

  // 🎯 Strategy Insights
  lines.push("🎯 **Jordan Should:**")
  if (report.strategyInsights?.length > 0) {
    report.strategyInsights.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
  } else {
    lines.push("• No specific actions identified")
  }

  lines.push("")
  lines.push(`*Keywords: ${report.keywordsUsed.map(k => `"${k}"`).join(", ")}*`)

  return lines.join("\n")
}

// ── HELPERS ───────────────────────────────────

function loadLastReport() {
  if (!fs.existsSync(LAST_REPORT_FILE)) return null
  try { return JSON.parse(fs.readFileSync(LAST_REPORT_FILE, "utf8")) }
  catch { return null }
}

// ── EXPORTS ───────────────────────────────────

module.exports = {
  runScan,
  formatDiscordReport,
  loadLastReport,
  loadKeywords,
  addKeyword,
  removeKeyword,
  isConfigured,
  detectBackend,
  getMarketIntel,
  getStrategyBrief,
}
