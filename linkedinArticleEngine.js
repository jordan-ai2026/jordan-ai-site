// ============================================
// LINKEDIN ARTICLE ENGINE — Jordan AI
//
// Generates one long-form LinkedIn article per week.
// Rotates through roles most at risk from AI displacement.
// SEO-optimised titles, ends with CTA to jordan-ai.co.
// Saves as Markdown, notifies Jordan via Discord.
//
// Schedule: Every Monday at 6:00am ET
// Model:    GPT-4o-mini
// Output:   linkedin-articles/YYYY-MM-DD-[role].md
// ============================================

'use strict'

require('dotenv').config({override: true})
const fs     = require('fs')
const path   = require('path')
const OpenAI = require('openai')
const cron   = require('node-cron')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const ARTICLES_DIR = path.join(__dirname, 'linkedin-articles')

// ============================================
// ROLES — rotated through weekly
// ============================================
const ROLES = [
  'recruiter',
  'marketing coordinator',
  'customer service manager',
  'data analyst',
  'HR director',
  'small business owner'
]

// ============================================
// ROLE ROTATION STATE
// Track which role we used last so we cycle evenly
// ============================================
const ROTATION_FILE = path.join(__dirname, 'linkedin-rotation.json')

function loadRotation() {
  if (!fs.existsSync(ROTATION_FILE)) return { lastIndex: -1 }
  try { return JSON.parse(fs.readFileSync(ROTATION_FILE, 'utf8')) } catch { return { lastIndex: -1 } }
}

function saveRotation(state) {
  fs.writeFileSync(ROTATION_FILE, JSON.stringify(state, null, 2))
}

function getNextRole() {
  const state = loadRotation()
  const nextIndex = (state.lastIndex + 1) % ROLES.length
  saveRotation({ lastIndex: nextIndex })
  return ROLES[nextIndex]
}

// ============================================
// SLUG HELPER
// "HR director" → "hr-director"
// ============================================
function toSlug(role) {
  return role.toLowerCase().replace(/\s+/g, '-')
}

// ============================================
// ARTICLE GENERATOR
// ============================================
async function generateArticle(role) {
  // Alternate between two SEO title hooks per rotation cycle
  const rotation = loadRotation()
  const useHook2 = rotation.lastIndex % 2 === 0
  const titleHook = useHook2
    ? `will AI replace ${role} 2026`
    : `AI tools for ${role}`

  const systemPrompt = `You are a LinkedIn content strategist who specialises in AI adoption for knowledge workers.
Write authoritative, empathetic long-form LinkedIn articles (700-900 words).
Voice: confident, practical, slightly provocative (challenge assumptions), human.
Always end with a CTA pointing to jordan-ai.co as the toolkit for surviving and thriving in the AI age.
Format as clean Markdown (H2 subheadings, bullet points where useful, no horizontal rules).`

  const userPrompt = `Write a LinkedIn long-form article for the role: "${role}".

Title must contain this SEO hook: "${titleHook}"
(Work the hook naturally into a compelling title — don't just paste it verbatim.)

Requirements:
- 700-900 words
- Speaks directly to someone in this role who is anxious about AI
- Covers: what AI is actually changing for this role, what it can't replace, the specific skills to double-down on
- Includes 2-3 concrete AI tools or tactics relevant to this role in 2025-2026
- Ends with a CTA encouraging the reader to visit jordan-ai.co to get their personal AI toolkit
- Tone: encouraging, real, not corporate fluff
- Output the article title as the first H1 line`

  const resp = await openai.chat.completions.create({
    model:      'gpt-4o-mini',
    max_tokens: 1200,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt }
    ]
  })

  return resp.choices[0].message.content
}

// ============================================
// SAVE ARTICLE
// ============================================
function saveArticle(role, content) {
  if (!fs.existsSync(ARTICLES_DIR)) {
    fs.mkdirSync(ARTICLES_DIR, { recursive: true })
    console.log('[LinkedInEngine] Created linkedin-articles/ directory')
  }

  const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const slug = toSlug(role)
  const filename = `${date}-${slug}.md`
  const filepath = path.join(ARTICLES_DIR, filename)

  fs.writeFileSync(filepath, content, 'utf8')
  return { filename, filepath, date }
}

// ============================================
// MAIN — generate and notify
// ============================================
async function runLinkedInEngine(discordChannel) {
  console.log('[LinkedInEngine] Generating weekly LinkedIn article...')

  const role = getNextRole()
  console.log(`[LinkedInEngine] This week's role: ${role}`)

  let article
  try {
    article = await generateArticle(role)
  } catch (err) {
    console.log('[LinkedInEngine] GPT error:', err.message)
    return
  }

  const { filename, date } = saveArticle(role, article)
  console.log(`[LinkedInEngine] Saved: ${filename}`)

  // Extract the title (first line starting with #)
  const titleLine = article.split('\n').find(l => l.startsWith('#')) || filename
  const titleClean = titleLine.replace(/^#+\s*/, '')

  const notify = [
    `📝 **New LinkedIn Article Ready — Copy/Paste to LinkedIn Now**`,
    ``,
    `**Role:** ${role}`,
    `**Title:** ${titleClean}`,
    `**File:** \`linkedin-articles/${filename}\``,
    ``,
    `> Go to LinkedIn → Write article → Paste the content from the file above.`,
    `> Don't forget to add a relevant image before publishing!`,
    ``,
    `_Auto-generated every Monday at 6am ET_`
  ].join('\n')

  if (discordChannel) {
    try {
      const ch = await discordChannel.client
        ? discordChannel.client.channels.fetch(discordChannel)
        : null

      // discordChannel might be a channelId string or a Channel object
      // handle both cases
      let channel = null
      if (typeof discordChannel === 'string') {
        // We need the client — it's passed in via startLinkedInEngine
        channel = _discordClient ? await _discordClient.channels.fetch(discordChannel) : null
      } else if (discordChannel && discordChannel.send) {
        channel = discordChannel
      }

      if (channel) {
        await channel.send(notify)
        console.log('[LinkedInEngine] Discord notification sent.')
      }
    } catch (err) {
      console.log('[LinkedInEngine] Discord send error:', err.message)
    }
  } else {
    console.log('[LinkedInEngine] No Discord channel — notification:\n', notify)
  }
}

// ============================================
// DISCORD CLIENT REFERENCE
// Stored so runLinkedInEngine can fetch channels
// ============================================
let _discordClient = null

// ============================================
// START — cron every Monday at 6:00am ET
// ============================================
function startLinkedInEngine(client, channelId) {
  _discordClient = client

  if (!channelId) {
    console.log('⚠️  LinkedInEngine: No reports channel set — will log to console only')
  }

  // "0 6 * * 1" = 6:00am every Monday
  cron.schedule('0 6 * * 1', async () => {
    console.log('[LinkedInEngine] Monday 6am — generating LinkedIn article')
    try {
      await runLinkedInEngine(channelId)
    } catch (err) {
      console.log('[LinkedInEngine] Scheduled run error:', err.message)
    }
  }, {
    timezone: 'America/New_York'
  })

  console.log('📅 LinkedIn Article Engine started — generates every Monday at 6:00am ET')
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  startLinkedInEngine,
  runLinkedInEngine  // also export for manual/test runs
}
