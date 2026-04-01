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

require('dotenv').config({override: true})
const fs      = require('fs')
const path    = require('path')
const crypto  = require('crypto')
const axios   = require('axios')
const OpenAI  = require('openai')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const Anthropic = require('@anthropic-ai/sdk')
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LOG_FILE        = path.join(__dirname, 'x-post-log.json')
const MARKET_INTEL    = path.join(__dirname, 'website', 'data', 'market-intel.json')
const PERSONA_DIR     = path.join(__dirname, 'Persona')

// Post 4x/day: 9am, 1pm, 6pm, 8pm ET
// 8pm = "what we built today" building post
const POST_SCHEDULE_HOURS = [9, 13, 18, 20]

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
  'informative',  // educational/thesis content
  'informative',  // 2 informative per day
  'product',      // 1 sales post per day
  // 4th slot (8pm) is always 'building' — handled by schedule logic
]

// ============================================
// POST GENERATOR
// ============================================

async function generatePost(type) {
  const soul        = loadSoul()
  const recentPosts = getRecentPosts(20)
  const intel       = getLatestIntel()

  // Pick a specific role to speak to for displaced/practical posts
  const ROLES = ['recruiter', 'marketing coordinator', 'customer service rep', 'data analyst', 'admin assistant', 'paralegal', 'inside sales rep', 'bookkeeper']
  const role = ROLES[Math.floor(Math.random() * ROLES.length)]

  // Force product rotation by time so all 5 products get equal airtime
  const PRODUCTS = [
    `AdBot — pulls your Meta ad data, scores every ad, finds what's winning and what's burning money, writes the full report, generates your next 5 creatives. One-time $497. jordan-ai.co/adbot.html`,
    `Your Own AI Employee — Jordan AI builds you a personal AI agent that works 24/7: posts your content, monitors your market, handles your follow-ups, sends you daily reports. Built for knowledge workers who want to stop drowning in busywork. Starts at $297/mo. DM "MY AI" to get started.`,
    `AI Workforce for Your Company — we build and run a full AI agent stack for your business. Your team keeps their jobs. They just stop doing the repetitive parts. Custom-built, we operate it monthly. Starts at $2,500/mo. DM "WORKFORCE" to talk scope.`,
    `Jordan AI Starter Kit — the exact OpenClaw setup powering Jordan AI. Soul file, memory system, autonomy ladder, heartbeat checks, manager model. Build your own AI employee from scratch. Coming soon — reply "KIT" to get early access.`,
    `AdBot for Agencies — white-label the entire AdBot stack. Run it for your clients. Unlimited client accounts. $2,500/mo. DM "AGENCY" if you manage more than 3 ad accounts.`,
  ]
  const productOfTheDay = PRODUCTS[Math.floor(Date.now() / (1000 * 60 * 60 * 8)) % PRODUCTS.length]

  const typeInstructions = {
    displaced: `Write a single tweet speaking DIRECTLY to a ${role} whose job is being affected by AI.
Acknowledge the fear. Then give them hope and a path forward.
The path: build your own AI agent that makes you worth more than anyone else in the room.
Be specific to their role. Example for recruiter: "If you're a recruiter and you're not using AI to source candidates, you're competing against people who are. Here's the difference between surviving this and not."
Be empathetic but direct. No hype. Real talk.`,

    company: `Write a single tweet aimed at business owners, HR directors, or COOs thinking about AI and their workforce.
Contrarian angle: cutting people for AI is short-sighted. Upgrading your people with AI is the real competitive advantage.
Hit the ROI angle: a knowledge worker with their own AI agent produces 2-3x the output. Same salary. Better results.
Example: "The companies replacing employees with AI will regret it in 3 years. The ones upgrading employees with AI will own their markets."`,

    building: `Write a single "what we built today" tweet about building Jordan AI — an autonomous AI business — in public.
This is the 8pm post. It should read like an end-of-day builder update.
Share ONE specific thing: a feature shipped, a system fixed, a number that moved, something discovered.
Format feel: "Today we [did X]. [Outcome or what it means]." — but don't be robotic about it.
Be honest, specific, and slightly vulnerable. Numbers and specifics beat vague updates every time.
Showcase what jordan-ai.co is building — an AI workforce platform for workers and companies.
Examples of the energy:
- "Rebuilt the blog engine today. All the location-specific junk posts are gone. The site now matches what we actually sell."
- "X poster now runs 4 posts a day. The 8pm slot is this one — building in public at end of day."
- "Cleo has memory now. She knows who Jordan is, what we're building, and what's been tried. Continuity across sessions."
- "AdBot is almost done. Today: wired up the Meta API → score → report pipeline. One piece left."
Be founder-authentic. The audience should feel like they're watching a real company get built.`,

    practical: `Write a single tweet with one specific, actionable tip for a ${role} who wants to use AI to stay ahead.
Something they can actually do this week. Tool recommendation, prompt idea, workflow change.
Be specific to their role. Make it immediately useful.
${intel ? `Current trending topics: ${intel.trends.join(', ')}` : ''}`,

    informative: `Write a single tweet. Pick ONE angle and go hard on it — no hedging:

OPTION A — Name the threat directly to a ${role}:
Don't soften it. State what's actually happening to their job and what separates the ones keeping theirs from the ones losing them. Example: "Bookkeepers who can't explain what their AI caught this quarter are being replaced by the ones who can. That's the new floor."

OPTION B — Contrarian take for companies:
Something that pushes back on the obvious narrative. Specific. A little uncomfortable. Example: "Your AI vendor is not going to tell you that replacing your CS team with a bot will tank your NPS in 6 months. I will."

OPTION C — Uncomfortable truth, no audience:
Just state something true about the AI/workforce shift that most people won't say out loud. No target persona needed.

OPTION D — Building in public (only if it feels natural):
One real, specific thing about building Jordan AI. A number, a failure, a lesson. Boring = don't post it.

EXAMPLES OF THE VOICE WE WANT (copy this energy, not these words):
- "A recruiter with AI placed 40 candidates last quarter. The one without placed 11. Same market, same tools available. One used them."
- "Companies that cut their CS team and replaced them with a bot saved $200k. They lost 30% of their renewal rate. Net: -$400k. Great plan."
- "Your employer owns your Salesforce login. They don't own your AI agent. That's the difference between a job and a career."

HARD RULES:
- Under 240 characters
- No "consider", "catalyst", "enhance", "empower", "navigate", "leverage", "adapt or be left behind"
- No exclamation points
- No hashtags
- Short sentences. One concrete idea. A number or specific scenario beats a vague claim every time.
- If it sounds like LinkedIn content, rewrite it.
${intel ? `Trending now: ${intel.trends.join(', ')} — use if relevant, ignore if not` : ''}`,

    product: `Write a single tweet selling this product. Be creative with the hook but keep the facts accurate:

${productOfTheDay}

Voice: founder energy, not marketer energy. Lead with the OUTCOME for the buyer, not the feature list. One hook, one value prop, one CTA. Short punchy sentences. No corporate fluff. Make them want to DM or click right now. Max 280 characters.`,
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
    // Informative posts use Claude Sonnet for sharper voice
    // Product posts stay on GPT-4o-mini (more templated)
    if (type === 'informative') {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 120,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
      return response.content[0].text.trim().replace(/^["']|["']$/g, '')
    } else {
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
    }
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

    // 8pm ET = "what we built today" — always a building post
    const forcedType = (h === 20) ? 'building' : null

    try {
      const result = await runPost(forcedType)
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
