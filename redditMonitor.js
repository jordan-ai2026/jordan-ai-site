// ============================================
// REDDIT MONITOR — Jordan AI
//
// Scans target subreddits daily for AI displacement
// conversations. Ranks by engagement and surfaces
// the top 5 opportunities to Jordan via Discord.
//
// Schedule: 7:30am ET daily
// API: Reddit public JSON (no auth needed)
// State: reddit-seen.json (avoids repeat posts)
// ============================================

'use strict'

require('dotenv').config({override: true})
const fs   = require('fs')
const path = require('path')
const axios = require('axios')
const cron  = require('node-cron')

const SEEN_FILE = path.join(__dirname, 'reddit-seen.json')

// ============================================
// TARGET SUBREDDITS
// ============================================
const SUBREDDITS = [
  'recruitinghell',
  'cscareerquestions',
  'humanresources',
  'marketing',
  'Accounting',
  'CustomerService',
  'careerguidance',
  'artificial',
  'AItools',
  'Entrepreneur',
  'smallbusiness',
  'business'
]

// ============================================
// KEYWORDS TO MATCH IN TITLE OR SELFTEXT
// ============================================
const KEYWORDS = [
  'AI replace',
  'will AI take',
  'is my job safe',
  'layoffs',
  'getting laid off',
  'AI tools for',
  'how to use AI',
  'compete with AI',
  'AI taking over',
  'job security',
  'automation replacing',
  'workforce AI'
]

// ============================================
// REPLY ANGLE SUGGESTIONS
// Based on subreddit + keyword signals
// ============================================
function suggestAngle(post) {
  const title = (post.title || '').toLowerCase()
  const sub   = (post.subreddit || '').toLowerCase()

  if (title.includes('replace') || title.includes('taking over') || title.includes('automation replacing')) {
    return 'Empathize + position AI as a tool they control, not one that replaces them. Link to jordan-ai.co'
  }
  if (title.includes('job safe') || title.includes('layoff') || title.includes('laid off')) {
    return 'Share survival strategies — upskill with AI now. Soft pitch to jordan-ai.co toolkit'
  }
  if (title.includes('how to use ai') || title.includes('ai tools for') || title.includes('compete with ai')) {
    return 'Give genuine practical tip for their role + mention jordan-ai.co as a resource'
  }
  if (sub.includes('recruiting') || sub.includes('humanresources')) {
    return 'Recruiter angle: AI makes you faster, not obsolete. Mention AI-powered screening at jordan-ai.co'
  }
  if (sub.includes('marketing') || sub.includes('entrepreneur') || sub.includes('smallbusiness')) {
    return 'Small business owner angle: leverage AI like a team of 10. Point to jordan-ai.co'
  }
  return 'Add genuine value, tell a story about AI + human collaboration, mention jordan-ai.co'
}

// ============================================
// STATE TRACKING
// ============================================
function loadSeen() {
  if (!fs.existsSync(SEEN_FILE)) return {}
  try { return JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')) } catch { return {} }
}

function saveSeen(seen) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2))
}

function markSeen(seen, ids) {
  const now = Date.now()
  ids.forEach(id => { seen[id] = now })
  // Prune entries older than 30 days
  const cutoff = now - 30 * 24 * 60 * 60 * 1000
  for (const id in seen) {
    if (seen[id] < cutoff) delete seen[id]
  }
  return seen
}

// ============================================
// REDDIT FETCH
// Fetches new posts from one subreddit matching any keyword
// ============================================
async function fetchSubredditPosts(subreddit) {
  const posts = []

  for (const keyword of KEYWORDS) {
    try {
      const url = `https://www.reddit.com/r/${subreddit}/search.json`
      const params = {
        q:     keyword,
        sort:  'new',
        limit: 10,
        t:     'day',
        restrict_sr: 'true'
      }
      const resp = await axios.get(url, {
        params,
        headers: { 'User-Agent': 'jordan-ai-bot/1.0 (contact: info@jordan-ai.co)' },
        timeout: 10000
      })
      const children = resp.data?.data?.children || []
      children.forEach(c => {
        const d = c.data
        if (!d || !d.id) return
        posts.push({
          id:          d.id,
          subreddit:   d.subreddit,
          title:       d.title,
          url:         `https://reddit.com${d.permalink}`,
          score:       d.score       || 0,
          numComments: d.num_comments || 0,
          // engagement score — upvotes weighted 1x, comments 2x (comments = intent)
          engagementScore: (d.score || 0) + (d.num_comments || 0) * 2,
          matchedKeyword: keyword
        })
      })
    } catch (err) {
      // Non-fatal — continue with other keywords/subs
      console.log(`[RedditMonitor] ${subreddit} / "${keyword}": ${err.message}`)
    }

    // Small delay between keyword requests to be polite to Reddit's rate limits
    await new Promise(r => setTimeout(r, 600))
  }

  return posts
}

// ============================================
// DEDUP — remove duplicates by post ID
// ============================================
function dedup(posts) {
  const seen = new Map()
  posts.forEach(p => {
    if (!seen.has(p.id) || p.engagementScore > seen.get(p.id).engagementScore) {
      seen.set(p.id, p)
    }
  })
  return Array.from(seen.values())
}

// ============================================
// MAIN SCAN
// ============================================
async function runRedditScan(discordChannel) {
  console.log('[RedditMonitor] Starting daily Reddit scan...')
  const seen = loadSeen()

  let allPosts = []

  for (const sub of SUBREDDITS) {
    const posts = await fetchSubredditPosts(sub)
    allPosts = allPosts.concat(posts)
    // Gentle pause between subreddits
    await new Promise(r => setTimeout(r, 1200))
  }

  // Dedup and filter already-seen
  const unique = dedup(allPosts).filter(p => !seen[p.id])

  if (unique.length === 0) {
    console.log('[RedditMonitor] No new matching posts today.')
    return
  }

  // Sort by engagement, pick top 5
  unique.sort((a, b) => b.engagementScore - a.engagementScore)
  const top5 = unique.slice(0, 5)

  // Mark as seen
  const updatedSeen = markSeen(seen, top5.map(p => p.id))
  saveSeen(updatedSeen)

  // Format Discord message
  const lines = ['🎯 **Reddit Opportunities Today**', '']

  top5.forEach((p, i) => {
    const angle = suggestAngle(p)
    lines.push(
      `${i + 1}. r/${p.subreddit} — "${p.title}" (${p.score} upvotes, ${p.numComments} comments)`,
      `   Link: ${p.url}`,
      `   Angle: ${angle}`,
      ''
    )
  })

  const message = lines.join('\n').trim()

  if (discordChannel) {
    try {
      const ch = await discordChannel.client.channels.fetch(discordChannel)
      if (ch) {
        // Split if over 1900 chars
        const chunk = 1900
        for (let i = 0; i < message.length; i += chunk) {
          await ch.send(message.substring(i, i + chunk))
        }
        console.log(`[RedditMonitor] Sent top ${top5.length} opportunities to Discord.`)
      }
    } catch (err) {
      console.log('[RedditMonitor] Discord send error:', err.message)
    }
  } else {
    console.log('[RedditMonitor] No Discord channel set — report:\n', message)
  }
}

// ============================================
// START — cron at 7:30am ET daily
// ============================================
function startRedditMonitor(client, channelId) {
  if (!channelId) {
    console.log('⚠️  RedditMonitor: No reports channel set — will log to console only')
  }

  // Cron: "30 7 * * *" = 7:30am every day
  // node-cron runs in local server time; server should be ET, but we log clearly
  cron.schedule('30 7 * * *', async () => {
    console.log('[RedditMonitor] 7:30am — starting scheduled scan')
    try {
      await runRedditScan(channelId)
    } catch (err) {
      console.log('[RedditMonitor] Scheduled scan error:', err.message)
    }
  }, {
    timezone: 'America/New_York'
  })

  console.log('📅 Reddit Monitor started — scans daily at 7:30am ET')
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  startRedditMonitor,
  runRedditScan  // also export for manual/test runs
}
