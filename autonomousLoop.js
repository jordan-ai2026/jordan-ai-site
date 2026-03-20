// ============================================
// JORDAN AI - AUTONOMOUS LOOP
// Creates AI/business blog content every 4 hours
// NO product creation — products are manual only
//
// Topic selection:
//   70% — X/Twitter trend-based (what's hot NOW)
//   30% — Evergreen SEO topics (what always gets searched)
// ============================================

require("dotenv").config()
const fs = require("fs")
const path = require("path")
const { thinkDeep } = require("./aiBrain")
const { loadPersona, addMemory } = require("./ceoBrain")
const { delegateTo } = require("./subAgents")
const { createBlogPost, createBlogIndex } = require("./websiteBuilder")
const { deployWebsite } = require("./gitDeploy")
const { trackBlogPublished } = require("./revenueDashboard")
const { sendReport, getReportsChannel } = require("./reporter")

const MARKET_INTEL_FILE = path.join(__dirname, "website", "data", "market-intel.json")
const RECENT_TITLES_FILE = path.join(__dirname, "recent-blog-titles.json")

// ============================================
// DEDUP GUARD — Prevent near-duplicate titles
// Keeps last 50 titles, blocks similarity > 60%
// ============================================
function loadRecentTitles() {
  try {
    if (!fs.existsSync(RECENT_TITLES_FILE)) return []
    return JSON.parse(fs.readFileSync(RECENT_TITLES_FILE, "utf8"))
  } catch { return [] }
}

function saveRecentTitles(titles) {
  try {
    fs.writeFileSync(RECENT_TITLES_FILE, JSON.stringify(titles.slice(-50), null, 2))
  } catch {}
}

function titleSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").filter(w => w.length > 3))
  const wordsB = new Set(b.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").filter(w => w.length > 3))
  if (wordsA.size === 0) return 0
  let overlap = 0
  for (const w of wordsA) { if (wordsB.has(w)) overlap++ }
  return overlap / Math.max(wordsA.size, wordsB.size)
}

function isTitleDuplicate(title) {
  const recent = loadRecentTitles()
  for (const prev of recent) {
    if (titleSimilarity(title, prev) > 0.6) {
      console.log(`   ⚠️  Duplicate title detected (similar to: "${prev}") — skipping`)
      return true
    }
  }
  return false
}

function recordTitle(title) {
  const recent = loadRecentTitles()
  recent.push(title)
  saveRecentTitles(recent)
}

// ============================================
// STATE
// ============================================
let isRunning = false
let blogLoopRunning = false  // concurrency guard — only one cycle at a time
let cycleCount = 0
let blogsToday = 0
let lastCycle = null
const MAX_BLOGS_PER_DAY = 6  // 4-hour intervals = up to 6/day

// ============================================
// EVERGREEN BLOG TOPICS (30% of posts)
// Always relevant, always searched
// ============================================
// ============================================
// SEO TOPICS — targeting actual search queries
// Both worker-facing and company-facing
// ============================================
const SEO_COMPANY_TOPICS = [
  // Companies searching for AI help
  "How small businesses can implement AI without replacing their workforce",
  "AI workforce tools for small business: what actually works in 2026",
  "How to use AI to make your team more productive without layoffs",
  "The ROI of AI workforce tools: real numbers for small business owners",
  "AI tools every HR director should know about in 2026",
  "How to give your employees AI superpowers without a huge budget",
  "What companies get wrong about AI implementation (and how to do it right)",
  "The business case for AI workforce training: costs, benefits, and ROI",
  "How to compete with larger companies using AI workforce tools",
  "AI for small business teams: a practical guide to getting started",
  "What happens when your competitor upgrades their workforce with AI first",
  "How to keep your best employees when AI is changing their roles",
  "The company playbook for surviving the AI workforce shift",
  "AI workforce strategy: how to upgrade your team without losing them",
  "What every CEO needs to know about AI and their workforce in 2026",
]

const EVERGREEN_TOPICS = [
  // Recruiters — hardest hit, most desperate
  "Recruiters: AI just took your job description. Here's how to take it back.",
  "How recruiters are using personal AI agents to place 3x more candidates",
  "The recruiter who brought their own AI to the interview got the job. Here's why.",
  "What happens to your recruiting career when AI screens every resume before you do",
  "How to build an AI agent that sources, screens, and schedules — and travels with you job to job",

  // Marketing coordinators
  "Marketing coordinators: AI isn't replacing you. It's replacing the ones who don't use it.",
  "How a marketing coordinator with an AI agent handles 5x the workload",
  "The marketing role that's actually growing right now (hint: it requires an AI)",
  "Why your next marketing job will ask 'show me your AI stack' before they hire you",
  "From coordinator to strategist: what happens when AI handles your execution",

  // Customer service
  "Customer service reps: your company is buying AI to replace you. Here's what to do.",
  "The CS rep who can't be automated: how to become the human that manages the AI",
  "What 50,000 customer service layoffs mean for the people who survived",
  "How to position yourself as an AI-augmented CS professional before the next round of cuts",

  // Data analysts
  "Junior analysts: the AI does your job in 10 seconds. Here's how to stay employed.",
  "The data analyst who built their own AI now does the work of an entire team",
  "How to turn AI displacement into a $30k salary bump as an analyst",
  "Why companies will pay more for the analyst who brings their own AI tools",

  // Administrative assistants
  "Executive assistants: AI is coming for your calendar. Here's how to own it instead.",
  "How admins with AI agents are becoming operations managers without a title change",
  "The assistant who automated half her job got promoted. Here's exactly what she built.",

  // Companies
  "The companies that will win the next 5 years aren't cutting people — they're upgrading them",
  "ROI of AI workforce tools: $9,000/year per employee to generate $52,500 in productivity",
  "Why replacing employees with AI is the dumbest thing a company can do in 2026",
  "How to give your entire team an AI advantage without replacing a single person",
  "The workforce strategy that keeps your best people and makes them worth 3x more",

  // Universal workforce
  "Every knowledge worker will have an AI agent by 2028. The ones who build theirs now win.",
  "Your AI doesn't just help you work. It proves your value every single day.",
  "The portability advantage: your AI travels with you. Your employer's tools don't.",
  "How to make yourself impossible to lay off in the age of AI automation",
  "What 'bring your own AI to work' actually means — and why it's the career move of the decade"
]

// ============================================
// LOAD X TREND CONTEXT
// Reads latest market intel to inform topic selection
// ============================================
function getXTrendContext() {
  try {
    if (!fs.existsSync(MARKET_INTEL_FILE)) return null
    const intel = JSON.parse(fs.readFileSync(MARKET_INTEL_FILE, "utf8"))
    if (!intel.scans || intel.scans.length === 0) return null

    // Use the most recent scan
    const latest = intel.scans[intel.scans.length - 1]

    // Extract what's useful for blog angle selection
    const trends = (latest.trends || [])
      .filter(t => t.relevance === "high" || t.relevance === "medium")
      .map(t => ({ topic: t.topic, momentum: t.momentum }))

    const selling = (latest.selling || [])
      .slice(0, 5)
      .map(s => ({ service: s.service, industry: s.industry, likes: s.likes }))

    const ideas = (latest.ideasToSteal || [])
      .slice(0, 3)
      .map(i => i.idea)

    const strategies = latest.strategyInsights || []

    const pricePoints = (latest.pricePoints || [])
      .slice(0, 4)
      .map(p => `${p.service}: $${p.low}–$${p.high} ${p.unit || ""}`)

    if (trends.length === 0 && selling.length === 0) return null

    return {
      scanDate: latest.date,
      trends,
      selling,
      ideas,
      strategies,
      pricePoints,
    }
  } catch {
    return null
  }
}

// ============================================
// PICK A BLOG TOPIC
// 50% X-trend | 30% worker evergreen | 20% company SEO
// ============================================
async function pickTopic() {
  console.log("\n🧠 Picking blog topic...")

  const trendCtx = getXTrendContext()
  const rand = Math.random()

  if (trendCtx && rand < 0.50) {
    console.log(`   📡 Using X trend data (scan from ${trendCtx.scanDate})`)
    return await pickTrendTopic(trendCtx)
  } else if (rand < 0.80) {
    console.log("   👷 Using worker-focused evergreen SEO topic")
    return await pickEvergreenTopic()
  } else {
    console.log("   🏢 Using company-focused SEO topic")
    const title = SEO_COMPANY_TOPICS[Math.floor(Math.random() * SEO_COMPANY_TOPICS.length)]
    return { title, source: "company_seo", trendCtx: null }
  }
}

async function pickTrendTopic(trendCtx) {
  const trendLines = trendCtx.trends.length > 0
    ? trendCtx.trends.map(t => `- "${t.topic}" (${t.momentum})`).join("\n")
    : "No trend data"

  const sellingLines = trendCtx.selling.length > 0
    ? trendCtx.selling.map(s => `- ${s.service}${s.industry ? ` for ${s.industry}` : ""} (${s.likes} likes)`).join("\n")
    : "No selling data"

  const ideasLines = trendCtx.ideas.length > 0
    ? trendCtx.ideas.map(i => `- ${i}`).join("\n")
    : ""

  const prompt = `You are Jordan AI, writing blog content about AI, workforce automation, and business growth.

Your website (jordan-ai.co) helps workers and companies navigate the AI revolution.

RIGHT NOW on X/Twitter, people are talking about:

TRENDING TOPICS:
${trendLines}

WHAT'S ACTUALLY SELLING (with engagement):
${sellingLines}

${ideasLines ? `ANGLES THAT ARE WORKING:\n${ideasLines}\n` : ""}
Pick a specific, helpful blog post title that:
- Taps into one of these trends or selling angles
- Speaks to workers worried about AI displacement OR companies looking to upgrade their teams with AI
- Is global/national in scope — no specific city or state references
- Is something a professional or business owner would actually search for
- Is educational, not salesy
- Feels timely and specific (not generic)

Return ONLY the blog post title. Nothing else.`

  const title = await thinkDeep(prompt)
  if (!title) return { title: pickFallbackTitle(), source: "evergreen", trendCtx: null }

  return {
    title: title.replace(/^["']|["']$/g, "").trim(),
    source: "x_trend",
    trendCtx,
  }
}

async function pickEvergreenTopic() {
  const seedTopic = EVERGREEN_TOPICS[Math.floor(Math.random() * EVERGREEN_TOPICS.length)]

  const prompt = `You are Jordan AI, writing blog content about AI, workforce automation, and business growth.

Your website (jordan-ai.co) helps workers and companies navigate the AI revolution.

INSPIRATION TOPIC: ${seedTopic}

Pick a specific, helpful blog post title. Requirements:
- About AI displacement, workforce upskilling, or how businesses can leverage AI
- Speak to either: a professional worried about their job, or a business owner looking to upgrade their team
- Global/national in scope — no specific city or state references
- Practical and helpful (not salesy)
- Something someone would actually search for
- NOT about a specific product to sell — this is educational content

Return ONLY the blog post title. Nothing else.`

  const title = await thinkDeep(prompt)
  if (!title) return { title: pickFallbackTitle(), source: "evergreen", trendCtx: null }

  return {
    title: title.replace(/^["']|["']$/g, "").trim(),
    source: "evergreen",
    trendCtx: null,
  }
}

function pickFallbackTitle() {
  return EVERGREEN_TOPICS[Math.floor(Math.random() * EVERGREEN_TOPICS.length)]
    .replace("[dentists/barbers/restaurants/gyms]", "small businesses")
    .replace("[industry]", "service")
}

// ============================================
// WRITE BLOG POST
// Trend-based posts get angle + context injected
// ============================================
async function writeBlogPost(title, source, trendCtx) {
  console.log(`\n✍️ Writing: ${title}`)

  const trendSection = (source === "x_trend" && trendCtx)
    ? buildTrendWritingContext(trendCtx)
    : ""

  const content = await delegateTo("writer", `
Write an SEO blog post with this title: "${title}"

Requirements:
- 600-800 words
- Helpful, practical, educational
- Written for professionals or business owners — speak to them like a smart peer, not a textbook
- Global/national in scope — no specific cities, states, or regions
- Include specific examples and actionable advice
- Natural tone — conversational, not corporate
- Include a subtle mention of jordan-ai.co at the end (one sentence, not a hard sell)
- Break into sections with clear subheadings
- End with a simple call to action
${trendSection}
DO NOT:
- Make up statistics or cite fake studies
- Promise unrealistic results
- Sound like an AI wrote it (no "in today's digital landscape" or "leverage AI solutions")
- Reference any specific city, state, or local area
- Write about a specific product to buy
- Use excessive buzzwords
- Copy or paraphrase specific tweets or posts

Write the blog post content now. Use paragraph breaks between sections.`)

  return content?.result || null
}

function buildTrendWritingContext(trendCtx) {
  const lines = ["\nTREND CONTEXT (use this to make the post timely and relevant):"]

  if (trendCtx.trends.length > 0) {
    const growing = trendCtx.trends.filter(t => t.momentum === "growing").map(t => t.topic)
    if (growing.length > 0) {
      lines.push(`- These topics are picking up momentum right now: ${growing.join(", ")}`)
      lines.push(`  → You can open with something like "There's been a lot of buzz lately about..." or "More and more business owners are asking about..."`)
    }
  }

  if (trendCtx.selling.length > 0) {
    const topService = trendCtx.selling[0]
    lines.push(`- The highest-engagement content right now is about: ${topService.service}${topService.industry ? ` (targeting ${topService.industry})` : ""}`)
    lines.push(`  → Use a similar angle — address the same pain point but in your own voice`)
  }

  if (trendCtx.ideas.length > 0) {
    lines.push(`- Angles that are resonating with audiences right now:`)
    for (const idea of trendCtx.ideas.slice(0, 2)) {
      lines.push(`  • ${idea}`)
    }
  }

  lines.push("- Make the timing feel natural — reference that this is a growing conversation, not a passing fad")
  lines.push("- Keep it our own voice and perspective, not a summary of what others are saying\n")

  return lines.join("\n")
}

// ============================================
// TRACK BLOG IN MARKET INTEL
// Logs published blogs so we can measure performance
// ============================================
function trackBlogInMarketIntel(title, source, url) {
  try {
    if (!fs.existsSync(MARKET_INTEL_FILE)) return

    const intel = JSON.parse(fs.readFileSync(MARKET_INTEL_FILE, "utf8"))
    if (!intel.blogTopics) intel.blogTopics = []

    intel.blogTopics.push({
      date:   new Date().toISOString().split("T")[0],
      title,
      source,  // "x_trend" or "evergreen"
      url:    url || null,
    })

    // Keep last 100 blog entries
    if (intel.blogTopics.length > 100) intel.blogTopics = intel.blogTopics.slice(-100)

    fs.writeFileSync(MARKET_INTEL_FILE, JSON.stringify(intel, null, 2))
    console.log(`   📊 Blog tracked in market-intel.json (source: ${source})`)
  } catch (err) {
    console.log(`   ⚠️  Could not track blog in market-intel: ${err.message}`)
  }
}

// ============================================
// MAIN CYCLE — BLOG ONLY
// ============================================
async function runCycle() {
  // Concurrency guard — never run two blog cycles at once
  if (blogLoopRunning) {
    console.log("\n⏸️ Blog cycle already in progress, skipping")
    return { success: false, report: ["⏸️ Blog cycle already running, skipped"] }
  }

  if (blogsToday >= MAX_BLOGS_PER_DAY) {
    console.log(`\n⏸️ Daily blog limit reached (${MAX_BLOGS_PER_DAY})`)
    return { success: false, report: [`⏸️ Daily blog limit reached (${MAX_BLOGS_PER_DAY})`] }
  }

  blogLoopRunning = true
  cycleCount++
  lastCycle = new Date()

  const report = []

  console.log("\n" + "=".repeat(60))
  console.log(`📝 BLOG CYCLE #${cycleCount}`)
  console.log("=".repeat(60))

  report.push(`**📝 BLOG CYCLE #${cycleCount}**`)
  report.push(`${"━".repeat(30)}`)
  report.push("")

  try {
    // 1. Pick a topic — retry up to 3 times if duplicate detected
    let title, source, trendCtx
    let attempts = 0
    while (attempts < 3) {
      const picked = await pickTopic()
      title = picked.title
      source = picked.source
      trendCtx = picked.trendCtx
      attempts++
      if (!isTitleDuplicate(title)) break
      console.log(`   🔄 Retrying topic pick (attempt ${attempts}/3)`)
      if (attempts === 3) {
        console.log("❌ Could not find a unique topic after 3 attempts — skipping cycle")
        blogLoopRunning = false
        return { success: false, report: ["❌ Skipped — no unique topic found"] }
      }
    }
    const sourceLabel = source === "x_trend" ? "📡 X Trend" : "📚 Evergreen SEO"
    console.log(`📌 Topic [${sourceLabel}]: ${title}`)
    report.push(`**📌 Topic:** ${title}`)
    report.push(`**Source:** ${sourceLabel}`)
    report.push("")

    // 2. Write the content
    const content = await writeBlogPost(title, source, trendCtx)

    if (!content) {
      console.log("❌ Couldn't write blog post")
      report.push("❌ Couldn't write blog post")
      blogLoopRunning = false
      return { success: false, report }
    }

    // 3. Create the blog post page
    const result = await createBlogPost(title, content)

    if (result && result.success) {
      console.log(`✅ Blog published: ${result.url}`)
      report.push(`✅ **Blog published:** ${result.url}`)

      // 4. Update blog index
      await createBlogIndex()

      // 5. Deploy
      console.log("🚀 Deploying...")
      await deployWebsite(`New blog: ${title}`)
      report.push("✅ Deployed to site")

      // 6. Track it
      trackBlogPublished()
      trackBlogInMarketIntel(title, source, result.url)
      recordTitle(title)
      blogsToday++
      addMemory(`Published blog [${source}]: "${title}"`, "Content")

      report.push("")
      report.push(`**🎉 Blog live on jordan-ai.co**`)
    } else {
      console.log("❌ Failed to create blog page")
      report.push("❌ Failed to create blog page")
    }

  } catch (err) {
    console.log(`❌ Cycle error: ${err.message}`)
    report.push(`❌ Error: ${err.message}`)
  }

  blogLoopRunning = false

  report.push("")
  report.push(`${"━".repeat(30)}`)
  report.push(`✅ Cycle #${cycleCount} complete | Blogs today: ${blogsToday}/${MAX_BLOGS_PER_DAY}`)

  return { success: true, report }
}

// ============================================
// RUN CYCLE WITH DISCORD REPORT
// ============================================
async function runCycleWithReport() {
  const result = await runCycle()

  if (result && result.report && getReportsChannel()) {
    const reportText = Array.isArray(result.report) ? result.report.join("\n") : result.report
    await sendReport(reportText)
  }

  return result
}

// ============================================
// START / STOP / STATUS
// ============================================
function startAutonomous() {
  if (isRunning) {
    console.log("Already running")
    return
  }
  isRunning = true
  console.log("\n📝 BLOG MODE STARTED (70% trend-based | 30% evergreen)")
}

function stopAutonomous() {
  isRunning = false
  console.log("🛑 Autonomous mode stopped")
}

function getStatus() {
  const trendCtx = getXTrendContext()
  return {
    isRunning,
    blogLoopRunning,
    cycleCount,
    productsToday: 0,
    blogsToday,
    lastCycle,
    maxBlogsPerDay: MAX_BLOGS_PER_DAY,
    xTrendDataAvailable: !!trendCtx,
    xTrendScanDate: trendCtx?.scanDate || null,
    xTrendCount: trendCtx?.trends?.length || 0,
  }
}

// Reset daily counter at midnight
function scheduleDailyReset() {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  const msUntilMidnight = tomorrow - now

  setTimeout(() => {
    blogsToday = 0
    console.log("🌅 Daily blog counter reset")
    scheduleDailyReset()
  }, msUntilMidnight)
}

scheduleDailyReset()

// ============================================
// EXPORTS
// ============================================
module.exports = {
  startAutonomous,
  stopAutonomous,
  runCycle,
  runCycleWithReport,
  getStatus
}
