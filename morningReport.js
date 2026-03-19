'use strict'

// ============================================
// MORNING REPORT — Jordan AI
//
// Sends Jordan a daily 8am briefing via Discord:
//   - What Jordan-AI did yesterday
//   - Content performance snapshot
//   - One specific action to take today
//   - New growth idea from Jordan-AI
//
// Also runs a weekly strategy update (Mondays)
// where Cleo and Jordan-AI review what's working
// and update content direction.
// ============================================

require('dotenv').config({ override: true })
const fs      = require('fs')
const path    = require('path')
const cron    = require('node-cron')
const OpenAI  = require('openai')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const X_LOG          = path.join(__dirname, 'x-post-log.json')
const REDDIT_LOG     = path.join(__dirname, 'reddit-seen.json')
const MARKET_INTEL   = path.join(__dirname, 'website', 'data', 'market-intel.json')
const LINKEDIN_DIR   = path.join(__dirname, 'linkedin-articles')
const ORDERS_FILE    = path.join(__dirname, 'adbot-orders.json')

// ============================================
// DATA LOADERS
// ============================================

function getYesterdaysPosts() {
  if (!fs.existsSync(X_LOG)) return []
  const log = JSON.parse(fs.readFileSync(X_LOG, 'utf8'))
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  return log.filter(p => p.postedAt?.startsWith(yesterday))
}

function getRecentOrders() {
  if (!fs.existsSync(ORDERS_FILE)) return []
  const orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'))
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  return orders.filter(o => o.createdAt > yesterday)
}

function getBlogCount() {
  try {
    const blogDir = path.join(__dirname, 'website', 'blog')
    if (!fs.existsSync(blogDir)) return 0
    return fs.readdirSync(blogDir).filter(f => f.endsWith('.html')).length
  } catch { return 0 }
}

function getLinkedInReady() {
  try {
    if (!fs.existsSync(LINKEDIN_DIR)) return null
    const files = fs.readdirSync(LINKEDIN_DIR)
      .filter(f => f.endsWith('.md'))
      .sort().reverse()
    return files[0] || null
  } catch { return null }
}

// ============================================
// AI: GENERATE TODAY'S ACTION + NEW IDEA
// ============================================

async function generateDailyInsight(context) {
  const prompt = `You are Jordan AI — an autonomous AI business agent focused on helping workers and companies navigate AI workforce changes.

Current context:
- X posts yesterday: ${context.xPosts.length}
- Blog posts total: ${context.blogCount}
- New orders yesterday: ${context.newOrders.length}
- Top X post yesterday: "${context.topPost || 'none'}"

Generate two things:

1. ONE SPECIFIC ACTION Jordan (the human) should take today to grow the business. 
   Be very specific. Example: "Post a reply in r/recruitinghell to the top post about AI screening. Say [specific thing]."
   It should take Jordan less than 10 minutes.

2. ONE NEW GROWTH IDEA that Jordan-AI could implement autonomously this week.
   Something new we haven't tried yet. Could be a new platform, content angle, distribution method, or product idea.

Format:
ACTION: [specific action]
IDEA: [new growth idea]`

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.8,
    })
    return res.choices[0].message.content.trim()
  } catch { return null }
}

// ============================================
// BUILD AND SEND MORNING REPORT
// ============================================

async function sendMorningReport(discordClient, channelId) {
  if (!discordClient || !channelId) return

  const xPosts    = getYesterdaysPosts()
  const newOrders = getRecentOrders()
  const blogCount = getBlogCount()
  const linkedIn  = getLinkedInReady()
  const topPost   = xPosts.sort((a, b) => 0)[0]?.text?.substring(0, 80)

  const insight = await generateDailyInsight({ xPosts, newOrders, blogCount, topPost })

  const now = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', month: 'long', day: 'numeric'
  })

  let report = `☀️ **Good morning — Jordan AI Daily Briefing**\n_${now}_\n\n`

  report += `**📊 Yesterday's Activity**\n`
  report += `• X posts sent: ${xPosts.length}\n`
  report += `• Blog posts total: ${blogCount}\n`
  report += `• New AdBot orders: ${newOrders.length > 0 ? `💰 ${newOrders.length} — ${newOrders.map(o => o.tier).join(', ')}` : '0'}\n`

  if (xPosts.length > 0) {
    report += `\n**🐦 Recent X Posts**\n`
    xPosts.slice(0, 3).forEach(p => {
      report += `• [${p.type}] "${p.text?.substring(0, 80)}..."\n`
    })
  }

  if (linkedIn) {
    report += `\n**📝 LinkedIn Article Ready**\n`
    report += `• File: \`${linkedIn}\`\n`
    report += `• Copy from: \`linkedin-articles/${linkedIn}\`\n`
    report += `• Post under your name on LinkedIn (2 min)\n`
  }

  if (insight) {
    const lines = insight.split('\n')
    const action = lines.find(l => l.startsWith('ACTION:'))?.replace('ACTION:', '').trim()
    const idea   = lines.find(l => l.startsWith('IDEA:'))?.replace('IDEA:', '').trim()

    if (action) report += `\n**✅ Today's Action (10 min)**\n${action}\n`
    if (idea)   report += `\n**💡 New Growth Idea**\n${idea}\n`
  }

  report += `\n_Jordan AI is running autonomously. Reply with any direction changes._`

  try {
    const channel = await discordClient.channels.fetch(channelId)
    if (channel) await channel.send(report)
    console.log('[MorningReport] ✅ Daily briefing sent')
  } catch (err) {
    console.error('[MorningReport] Send failed:', err.message)
  }
}

// ============================================
// WEEKLY STRATEGY UPDATE (Mondays 6:30am)
// Reviews what's working, updates direction
// ============================================

async function sendWeeklyStrategy(discordClient, channelId) {
  if (!discordClient || !channelId) return

  const xLog     = fs.existsSync(X_LOG) ? JSON.parse(fs.readFileSync(X_LOG, 'utf8')) : []
  const weekAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const weekPosts = xLog.filter(p => p.postedAt > weekAgo)
  const blogCount = getBlogCount()
  const orders    = fs.existsSync(ORDERS_FILE) ? JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')) : []
  const weekOrders = orders.filter(o => o.createdAt > weekAgo)

  const prompt = `You are Jordan AI running a weekly strategy review for an AI workforce tools business.

This week's data:
- X posts: ${weekPosts.length} (types: ${[...new Set(weekPosts.map(p => p.type))].join(', ')})
- Blog posts total: ${blogCount}
- New orders: ${weekOrders.length}
- Post types breakdown: displaced=${weekPosts.filter(p=>p.type==='displaced').length}, company=${weekPosts.filter(p=>p.type==='company').length}, building=${weekPosts.filter(p=>p.type==='building').length}

Target market: workers being displaced by AI (recruiters, marketing coordinators, CS reps, analysts) AND companies wanting to upgrade their workforce with AI.

Write a brief weekly strategy update covering:
1. What content mix is working this week
2. What to double down on next week  
3. One new angle or platform to test
4. Updated focus for blog topics next week

Keep it under 200 words. Practical and specific.`

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
    })

    const strategy = res.choices[0].message.content.trim()
    const channel  = await discordClient.channels.fetch(channelId)
    if (channel) {
      await channel.send(
        `📈 **Weekly Strategy Review — Jordan AI**\n\n${strategy}\n\n_Cleo reviews this and updates content direction automatically._`
      )
    }
    console.log('[MorningReport] ✅ Weekly strategy sent')
  } catch (err) {
    console.error('[MorningReport] Weekly strategy failed:', err.message)
  }
}

// ============================================
// SCHEDULER
// ============================================

function startMorningReport(discordClient, channelId) {
  if (!channelId) {
    console.log('[MorningReport] No channel ID — skipping')
    return
  }

  // Daily briefing at 8:00 AM ET
  cron.schedule('0 8 * * *', () => {
    sendMorningReport(discordClient, channelId)
  }, { timezone: 'America/New_York' })

  // Weekly strategy on Mondays at 6:30 AM ET
  cron.schedule('30 6 * * 1', () => {
    sendWeeklyStrategy(discordClient, channelId)
  }, { timezone: 'America/New_York' })

  console.log('[MorningReport] Daily briefing at 8am ET | Weekly strategy Mondays 6:30am ET')
}

module.exports = { startMorningReport, sendMorningReport, sendWeeklyStrategy }
