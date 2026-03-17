// ============================================
// JORDAN AI - AUTONOMOUS LOOP
// Creates AI/business blog content daily
// NO product creation — products are manual only
// ============================================

require("dotenv").config()
const { thinkDeep } = require("./aiBrain")
const { loadPersona, addMemory } = require("./ceoBrain")
const { delegateTo } = require("./subAgents")
const { createBlogPost, createHomepage, createBlogIndex } = require("./websiteBuilder")
const { deployWebsite } = require("./gitDeploy")
const { trackBlogPublished } = require("./revenueDashboard")
const { sendReport, getReportsChannel } = require("./reporter")

// ============================================
// STATE
// ============================================
let isRunning = false
let cycleCount = 0
let blogsToday = 0
let lastCycle = null
const MAX_BLOGS_PER_DAY = 2

// ============================================
// BLOG TOPICS
// Real topics about AI for small business
// Jordan AI picks from these + generates its own
// ============================================
const TOPIC_CATEGORIES = [
  // How AI helps specific businesses
  "How AI chatbots help [dentists/barbers/restaurants/gyms] save time and money",
  "Why small businesses in [industry] are switching to AI customer service",
  "The real cost of missing customer calls after hours",
  "How a landscaping company used AI to double their online leads",
  "5 ways AI can automate your [industry] business today",
  
  // Practical AI guides
  "How to use ChatGPT to write better customer emails in 5 minutes",
  "A beginner's guide to AI tools for small business owners",
  "The truth about AI-generated content and Google rankings in 2026",
  "How to automate your social media without losing your authentic voice",
  "AI vs hiring: when does automation make more sense than a new employee",
  
  // SEO and online presence
  "Why your small business website needs a blog (and how AI makes it easy)",
  "Local SEO explained: how to show up when customers search near you",
  "The 5 biggest website mistakes small businesses make",
  "How to get more Google reviews without being annoying",
  "What is a chatbot and does your business actually need one",
  
  // Business and tech trends
  "How AI is changing customer expectations in 2026",
  "The small business owner's guide to not getting left behind by AI",
  "Why your competitor's website outranks yours (and how to fix it)",
  "How to evaluate if an AI tool is worth the investment for your business",
  "The difference between AI hype and AI that actually makes you money",
  
  // Jordan AI specific (subtle marketing)
  "What we learned building AI chatbots for 10 different industries",
  "Behind the scenes: how an AI agent manages a real business website",
  "Monthly SEO results: what realistic progress looks like for small businesses",
  "How we helped a local business go from invisible to page one on Google",
  "The tools we use to manage multiple client websites automatically"
]

// ============================================
// PICK A BLOG TOPIC
// ============================================
async function pickTopic() {
  console.log("\n🧠 Picking blog topic...")
  
  const persona = loadPersona()
  
  // Pick a random seed topic for inspiration
  const seedTopic = TOPIC_CATEGORIES[Math.floor(Math.random() * TOPIC_CATEGORIES.length)]
  
  const prompt = `You are Jordan AI, writing blog content about AI technology and how businesses can use it.

Your website (jordan-ai.co) offers:
- AI chatbot building for small businesses
- WordPress website management
- SEO content services
- Digital products (AI starter kits, SEO guides, chatbot playbooks)

INSPIRATION TOPIC: ${seedTopic}

Pick a specific, helpful blog post topic. Requirements:
- About AI, automation, or digital marketing for small businesses
- Practical and helpful (not salesy)
- Something a small business owner would actually search for
- Include a local angle when possible (South Carolina, Columbia area)
- NOT about a specific product to sell — this is educational content

Return ONLY the blog post title. Nothing else.`

  const title = await thinkDeep(prompt)
  
  if (!title) return seedTopic.replace("[dentists/barbers/restaurants/gyms]", "small businesses").replace("[industry]", "service")
  
  return title.replace(/^["']|["']$/g, "").trim()
}

// ============================================
// WRITE BLOG POST
// ============================================
async function writeBlogPost(title) {
  console.log(`\n✍️ Writing: ${title}`)
  
  const content = await delegateTo("writer", `
Write an SEO blog post with this title: "${title}"

Requirements:
- 600-800 words
- Helpful, practical, educational
- Written for small business owners who aren't tech-savvy
- Include specific examples and actionable advice
- Natural tone — conversational, not corporate
- Include a subtle mention of jordan-ai.co services at the end
  (just one sentence, not a hard sell)
- Break into sections with clear subheadings
- End with a simple call to action

DO NOT:
- Make up statistics or cite fake studies
- Promise unrealistic results
- Sound like an AI wrote it (no "in today's digital landscape" or "leverage AI solutions")
- Write about a specific product to buy
- Use excessive buzzwords

Write the blog post content now. Use paragraph breaks between sections.`)

  return content?.result || null
}

// ============================================
// MAIN CYCLE — BLOG ONLY
// ============================================
async function runCycle() {
  const report = []
  
  if (blogsToday >= MAX_BLOGS_PER_DAY) {
    console.log(`\n⏸️ Daily blog limit reached (${MAX_BLOGS_PER_DAY})`)
    return { success: false, report: [`⏸️ Daily blog limit reached (${MAX_BLOGS_PER_DAY})`] }
  }
  
  cycleCount++
  lastCycle = new Date()
  
  console.log("\n" + "=".repeat(60))
  console.log(`📝 BLOG CYCLE #${cycleCount}`)
  console.log("=".repeat(60))
  
  report.push(`**📝 BLOG CYCLE #${cycleCount}**`)
  report.push(`${"━".repeat(30)}`)
  report.push("")
  
  try {
    // 1. Pick a topic
    const title = await pickTopic()
    console.log(`📌 Topic: ${title}`)
    report.push(`**📌 Topic:** ${title}`)
    report.push("")
    
    // 2. Write the content
    const content = await writeBlogPost(title)
    
    if (!content) {
      console.log("❌ Couldn't write blog post")
      report.push("❌ Couldn't write blog post")
      return { success: false, report }
    }
    
    // 3. Create the blog post page
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
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
      blogsToday++
      addMemory(`Published blog: "${title}"`, "Content")
      
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
// These are called from index.js
// ============================================
function startAutonomous() {
  if (isRunning) {
    console.log("Already running")
    return
  }
  isRunning = true
  console.log("\n📝 BLOG MODE STARTED (no product creation)")
}

function stopAutonomous() {
  isRunning = false
  console.log("🛑 Autonomous mode stopped")
}

function getStatus() {
  return {
    isRunning,
    cycleCount,
    productsToday: 0,
    blogsToday,
    lastCycle,
    maxProductsPerDay: 0
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
  getStatus
}
