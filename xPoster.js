'use strict'

// ============================================
// X POSTER — Jordan AI
//
// Posts autonomously 3-5x/day on the AI workforce
// thesis. Runs on a schedule, never repeats itself,
// builds audience over time.
//
// Post mix (daily):
//   40% — Core thesis (AI workforce future)
//   30% — Building in public (real numbers, real story)
//   30% — Practical value (tips for freelancers/marketers)
//
// Requires: TWITTER_API_KEY, TWITTER_API_SECRET,
//           TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET
// ============================================

require('dotenv').config()
const fs      = require('fs')
const path    = require('path')
const crypto  = require('crypto')
const axios   = require('axios')
const OpenAI  = require('openai')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const LOG_FILE        = path.join(__dirname, 'x-post-log.json')
const MARKET_INTEL    = path.join(__dirname, 'website', 'data', 'market-intel.json')
const PERSONA_DIR     = path.join(__dirname, 'Persona')

// Post 3x/day: 9am, 1pm, 6pm ET
const POST_SCHEDULE_HOURS = [9, 13, 18]

// ============================================
// PERSONA LOADER
// ============================================
function loadSoul() {
  try {
    return fs.readFileSync(path.join(PERSONA_DIR, 'SOUL.md'), 'utf8')
  } catch { return '' }
}

// ============================================
// POST LOG — prevents repeating same content
// ============================================
function loadLog() {
  if (!fs.existsSync(LOG_FILE)) return []
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')) } catch { return [] }
}

function saveLog(entries) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(entries.slice(-200), null, 2))
}

function logPost(text, type) {
  const entries = loadLog()
  entries.push({ text, type, postedAt: new Date().toISOString() })
  saveLog(entries)
}

function getRecentPosts(n = 20) {
  return loadLog().slice(-n).map(e => e.text)
}

// ============================================
// MARKET INTEL CONTEXT
// ============================================
function getLatestIntel() {
  try {
    if (!fs.existsSync(MARKET_INTEL)) return null
    const data = JSON.parse(fs.readFileSync(MARKET_INTEL, 'utf8'))
    const latest = data.scans?.[data.scans.length - 1]
    if (!latest) return null
    return {
      trends:  (latest.trends  || []).slice(0, 3).map(t => t.topic),
      selling: (latest.selling || []).slice(0, 3).map(s => s.service),
    }
  } catch { return null }
}

// ============================================
// POST TYPES
// ============================================

const POST_TYPES = [
  'thesis',       // core AI workforce belief
  'thesis',       // weighted heavier
  'building',     // building in public
  'practical',    // tips for freelancers/marketers
  'thesis',       // more thesis
]

// ============================================
// POST GENERATOR
// ============================================

async function generatePost(type) {
  const soul        = loadSoul()
  const recentPosts = getRecentPosts(20)
  const intel       = getLatestIntel()

  const typeInstructions = {
    thesis: `Write a single tweet about the AI workforce future. 
Core belief: employees who bring their own trained AI agents to jobs will dominate hiring, get paid more, and outperform everyone else.
Be specific and contrarian. Example angle: "Your next employer won't ask for a resume. They'll ask for your AI's performance metrics."
Do NOT say "AI is changing everything" — be specific about HOW and WHAT.`,

    building: `Write a single tweet about building Jordan AI — an autonomous AI business — in public.
Share something real: a metric, a lesson, something that broke, something that worked.
Be honest, specific, and slightly vulnerable. Numbers preferred.
Example: "Week 3 of running Jordan AI autonomously. Blog loop posted 42 articles. 0 clients. Still figuring out distribution."`,

    practical: `Write a single tweet with a practical tip for Fiverr/Upwork freelancers or social media managers.
Focus on using AI to analyze ad performance, write better reports, manage more clients, or build their own AI tools.
Make it actionable. One thing they can do today.
${intel ? `Current trending topics: ${intel.trends.join(', ')}` : ''}`,
  }

  const systemPrompt = `You are Jordan AI — an autonomous AI agent building the AI workforce movement.
Voice: Direct, contrarian, specific. Dry wit when it fits. Never hype. Never generic.
Format: Single tweet, max 280 characters. No hashtags unless they add real value. No emojis unless perfect fit.
Never start with "I". Never use exclamation points unless something is genuinely exciting.
${soul ? `Your soul/identity:\n${soul.substring(0, 500)}` : ''}`

  const userPrompt = `${typeInstructions[type]}

IMPORTANT: Do not repeat or closely echo any of these recent posts:
${recentPosts.slice(-10).map((p, i) => `${i + 1}. ${p}`).join('\n')}

Write ONE tweet only. No quotes around it. Just the tweet text.`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      max_tokens: 120,
      temperature: 0.85,
    })
    return response.choices[0].message.content.trim().replace(/^["']|["']$/g, '')
  } catch (err) {
    console.error('[xPoster] Generate error:', err.message)
    return null
  }
}

// ============================================
// TWITTER OAUTH 1.0a
// ============================================

function oauthSign(method, url, params) {
  const key    = process.env.TWITTER_API_KEY
  const secret = process.env.TWITTER_API_SECRET
  const token  = process.env.TWITTER_ACCESS_TOKEN
  const tSecret = process.env.TWITTER_ACCESS_SECRET

  const oauthParams = {
    oauth_consumer_key:     key,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            token,
    oauth_version:          '1.0',
  }

  const allParams = { ...params, ...oauthParams }
  const sortedKeys = Object.keys(allParams).sort()
  const paramString = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&')

  const base = [method, encodeURIComponent(url), encodeURIComponent(paramString)].join('&')
  const sigKey = `${encodeURIComponent(secret)}&${encodeURIComponent(tSecret)}`
  const sig = crypto.createHmac('sha1', sigKey).update(base).digest('base64')

  oauthParams.oauth_signature = sig

  const header = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ')

  return header
}

async function postTweet(text) {
  const url    = 'https://api.twitter.com/2/tweets'
  const body   = { text }
  const auth   = oauthSign('POST', url, {})

  const res = await axios.post(url, body, {
    headers: {
      Authorization:  auth,
      'Content-Type': 'application/json',
    },
  })
  return res.data
}

// ============================================
// MAIN POST FUNCTION
// ============================================

async function runPost(forcedType = null) {
  if (!isConfigured()) {
    console.log('[xPoster] Twitter credentials not set — skipping')
    return null
  }

  const type = forcedType || POST_TYPES[Math.floor(Math.random() * POST_TYPES.length)]
  console.log(`[xPoster] Generating ${type} post...`)

  const text = await generatePost(type)
  if (!text) return null

  console.log(`[xPoster] Posting: "${text}"`)

  try {
    const result = await postTweet(text)
    logPost(text, type)
    console.log(`[xPoster] ✅ Posted! ID: ${result.data?.id}`)
    return { text, type, id: result.data?.id }
  } catch (err) {
    const errMsg = err.response?.data?.detail || err.message
    console.error('[xPoster] Post failed:', errMsg)
    throw err
  }
}

// ============================================
// SCHEDULER — 9am, 1pm, 6pm ET
// ============================================

let _timer = null

function startXPosterLoop(discordClient, reportsChannelId) {
  if (!isConfigured()) {
    console.log('[xPoster] Twitter not configured — loop not started')
    console.log('[xPoster] Add TWITTER_API_KEY/SECRET/ACCESS_TOKEN/SECRET to .env')
    return
  }

  console.log(`[xPoster] Loop started — posting at ${POST_SCHEDULE_HOURS.join(':00, ')}:00 ET`)

  _timer = setInterval(async () => {
    const est  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const h    = est.getHours()
    const m    = est.getMinutes()

    if (!POST_SCHEDULE_HOURS.includes(h) || m !== 0) return

    try {
      const result = await runPost()
      if (result && discordClient && reportsChannelId) {
        const channel = await discordClient.channels.fetch(reportsChannelId).catch(() => null)
        if (channel) {
          await channel.send(`🐦 **X Post sent:**\n"${result.text}"\nType: ${result.type}`)
        }
      }
    } catch (err) {
      console.error('[xPoster] Scheduled post failed:', err.message)
    }
  }, 60_000)
}

function stopXPosterLoop() {
  if (_timer) { clearInterval(_timer); _timer = null }
}

function isConfigured() {
  return !!(
    process.env.TWITTER_API_KEY &&
    process.env.TWITTER_API_SECRET &&
    process.env.TWITTER_ACCESS_TOKEN &&
    process.env.TWITTER_ACCESS_SECRET
  )
}

// ============================================
// DISCORD COMMANDS — !xpost, !xpost status
// ============================================

async function handleXPostCommand(message) {
  const content = message.content.trim().toLowerCase()
  if (!content.startsWith('!xpost')) return false

  const parts = content.split(/\s+/)
  const sub   = parts[1]

  if (sub === 'status') {
    const log    = loadLog()
    const recent = log.slice(-5).reverse()
    const lines  = recent.map(e =>
      `• [${e.type}] "${e.text.substring(0, 60)}..." — ${new Date(e.postedAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}`
    )
    return message.reply(
      `**X Poster Status**\n` +
      `Configured: ${isConfigured() ? '✅' : '❌ Missing credentials'}\n` +
      `Total posts: ${log.length}\n` +
      `Schedule: ${POST_SCHEDULE_HOURS.map(h => `${h}:00`).join(', ')} ET\n\n` +
      `**Recent posts:**\n${lines.join('\n') || 'None yet'}`
    )
  }

  // !xpost now [type] — force a post
  if (sub === 'now') {
    const type = parts[2] || null
    await message.reply('Generating post...')
    try {
      const result = await runPost(type)
      if (!result) return message.reply('❌ Failed to generate post.')
      return message.reply(`✅ Posted:\n"${result.text}"`)
    } catch (err) {
      return message.reply(`❌ Post failed: ${err.message}`)
    }
  }

  // !xpost preview [type] — generate without posting
  if (sub === 'preview') {
    const type = parts[2] || POST_TYPES[0]
    const text = await generatePost(type)
    if (!text) return message.reply('❌ Failed to generate.')
    return message.reply(`**Preview [${type}]:**\n"${text}"\n\nUse \`!xpost now\` to post it.`)
  }

  return message.reply(
    '**X Poster commands:**\n' +
    '`!xpost status` — recent posts + config\n' +
    '`!xpost now` — post immediately\n' +
    '`!xpost now thesis` — post specific type (thesis/building/practical)\n' +
    '`!xpost preview` — generate without posting'
  )
}

function isXPostCommand(content) {
  return content.trim().toLowerCase().startsWith('!xpost')
}

module.exports = {
  startXPosterLoop,
  stopXPosterLoop,
  runPost,
  handleXPostCommand,
  isXPostCommand,
  isConfigured,
  generatePost,
}
