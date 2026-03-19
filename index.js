// ============================================
// JORDAN AI - MAIN BOT
//
// MISSION: Build the "bring your own AI to work" movement.
// Target: Fiverr/Upwork marketers, freelancers, knowledge workers.
// Revenue: $10k/month via AdBot tiers + AI workforce products.
//
// BRAIN: Claude Sonnet (strategy, content, decisions)
// WORKERS: GPT-4o-mini (bulk content, reports)
// X POSTING: Daily — AI workforce thesis, building in public
// NEWSLETTER: Daily — audience building
// STOCK SCANNER: Moved to stockbot (separate repo)
// ============================================

require('dotenv').config({override: true})
const { Client, GatewayIntentBits } = require("discord.js")
const OpenAI = require("openai")
const Anthropic = require("@anthropic-ai/sdk")

// Core modules
const { buildSystemPrompt, addMemory } = require("./ceoBrain")
const blogLoop = require("./autonomousLoop")
const { learnFromFeedback, getLearningResponse } = require("./feedbackLearner")
const { deployWebsite } = require("./gitDeploy")
const email = require("./emailManager")
const crm = require("./crm")
const billing = require("./billingManager")
const social = require("./socialManager")
const fulfill = require("./fulfillment")
const agent = require("./agentEngine")
const taskQueue = require("./taskQueue")

// Orchestrator & Agents
const { orchestrate, quickOrchestrate } = require("./orchestrator")
const { listAgents, smartDelegate, delegateTo } = require("./subAgents")
const { assignSkill, removeSkill, createSkill, listAllSkills, getAgentSkills } = require("./agentSkills")

// Features
const { runNightlyRoutine, scheduleNightlyRoutine } = require("./selfReview")
const { evaluateAndRespond, mightNeedPushBack } = require("./pushBack")
const { getTrustLevel, setTrustLevel, formatTrustStatus } = require("./trustLadder")
const { updateDashboard, formatDashboard } = require("./revenueDashboard")

// Reporter + active systems
const reporter         = require("./reporter")
const lessonsManager   = require("./lessonsManager")
const newsletter       = require("./newsletterManager")
const xCrawler         = require("./xCrawler")
const xPoster          = require("./xPoster")
const { startAdbotWebhook }  = require("./adbotWebhook")
const { startMorningReport } = require("./morningReport")

// ARCHIVED (kept in codebase, not running):
// leadScraper, outboundOutreach, followUpSystem — old agency model
// websiteGenerator, assetManager, chatbotManager, clientRequests — old agency model
// stockScanner, btcCharlieScanner, tvWatchlistImport — moved to stockbot repo
// wordpressManager — not needed for new direction

// ============================================
// DUAL AI SETUP
// ============================================

// SONNET — The CEO brain (main conversation, strategic decisions; Opus only for proposals)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

// GPT-4o-mini — The worker (sub-agents, blogs, products, cheap tasks)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Helper: Talk to Opus (for important CEO-level thinking)
async function askOpus(systemPrompt, userMessage) {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        { role: "user", content: userMessage }
      ]
    })
    return response.content[0].text
  } catch (err) {
    console.log("Opus error, falling back to GPT-4o-mini:", err.message)
    // Fallback to GPT if Opus fails (budget ran out, API down, etc.)
    const fallback = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ]
    })
    return fallback.choices[0].message.content
  }
}

// ============================================
// DISCORD CLIENT
// ============================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
})

// Store conversation history per channel
const conversationHistory = new Map()

// ============================================
// HELPERS
// ============================================
async function sendLongMessage(channel, text) {
  const chunk = 1900
  for (let i = 0; i < text.length; i += chunk) {
    await channel.send(text.substring(i, i + chunk))
  }
}

// ============================================
// BLOG LOOP — runs every 4 hours automatically
// Uses autonomousLoop.js (GPT-4o-mini writes content)
// One cycle at a time — concurrency guard inside autonomousLoop
// ============================================
let blogLoopTimer = null

function startBlogLoop() {
  const INTERVAL_MS = 4 * 60 * 60 * 1000  // 4 hours

  // First run: 3 minutes after startup (let Discord connect first)
  setTimeout(async () => {
    console.log("📝 Running first blog cycle...")
    try {
      await blogLoop.runCycleWithReport()
      console.log("✅ First blog cycle complete")
    } catch (err) {
      console.log("❌ Blog cycle error:", err.message)
    }
  }, 3 * 60 * 1000)

  // Then every 4 hours
  blogLoopTimer = setInterval(async () => {
    console.log("📝 Running scheduled blog cycle...")
    try {
      await blogLoop.runCycleWithReport()
      console.log("✅ Blog cycle complete")
    } catch (err) {
      console.log("❌ Blog cycle error:", err.message)
    }
  }, INTERVAL_MS)

  console.log("📅 Blog loop started — runs every 4 hours (up to 6 posts/day)")
}

// ============================================
// OUTREACH LOOP — runs once/day at 9am
// REMOVED: startOutreachLoop — old agency model (cold email to local businesses)
// REMOVED: startFollowUpLoop — old agency model (lead follow-up)

// ============================================
// X CRAWLER LOOP — runs once/day at 9am
// Scans X for AI market intelligence
// ============================================
function startXCrawlerLoop() {
  if (!xCrawler.isConfigured()) {
    console.log("⚠️  X Crawler: RAPIDAPI_KEY not set — loop not started")
    return
  }

  function msUntil9am() {
    const now = new Date()
    const next = new Date(now)
    next.setHours(9, 0, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)
    return next - now
  }

  function scheduleNextRun() {
    setTimeout(async () => {
      console.log("🔍 Running scheduled X crawl...")
      try {
        const report = await xCrawler.runScan()
        const reportsChannel = reporter.getReportsChannel()
        if (reportsChannel) {
          try {
            const channel = await client.channels.fetch(reportsChannel)
            if (channel) await channel.send(xCrawler.formatDiscordReport(report))
          } catch (err) {}
        }
        console.log(`✅ X crawl done: ${report.selling.length} sellers, ${report.trends.length} trending topics`)
      } catch (err) {
        console.log("❌ X crawl error:", err.message)
      }
      scheduleNextRun()
    }, msUntil9am())
  }

  scheduleNextRun()
  const nextRun = new Date(Date.now() + msUntil9am())
  console.log(`📅 X Crawler loop started — next run at ${nextRun.toLocaleTimeString()} (then daily at 9am)`)
}

// ============================================
// NEWSLETTER LOOP — runs once/day at 8pm
// Publishes one entry to website/newsletter.html
// ============================================
function startNewsletterLoop() {
  function msUntil8pm() {
    const now = new Date()
    const next8pm = new Date(now)
    next8pm.setHours(20, 0, 0, 0)
    if (next8pm <= now) next8pm.setDate(next8pm.getDate() + 1)
    return next8pm - now
  }

  function scheduleNextRun() {
    setTimeout(async () => {
      console.log("📰 Running scheduled newsletter...")
      try {
        const result = await newsletter.runDailyNewsletter()
        if (result.skipped) {
          console.log("   ✅ Newsletter already published today — skipped")
        } else if (result.success) {
          console.log(`   ✅ Newsletter published: ${result.date}`)
          const reportsChannel = reporter.getReportsChannel()
          if (reportsChannel) {
            try {
              const channel = await client.channels.fetch(reportsChannel)
              if (channel) await channel.send(`📰 **Daily Newsletter Published**\n${result.date}\n\n**Worked On:** ${result.preview?.workedOn || ""}\n**Tip:** ${result.preview?.tipTitle || ""}`)
            } catch (err) {}
          }
        } else {
          console.log(`   ❌ Newsletter failed: ${result.error}`)
        }
      } catch (err) {
        console.log("❌ Newsletter error:", err.message)
      }
      scheduleNextRun()
    }, msUntil8pm())
  }

  scheduleNextRun()
  const nextRun = new Date(Date.now() + msUntil8pm())
  console.log(`📅 Newsletter loop started — next run at ${nextRun.toLocaleTimeString()} (then daily at 8pm)`)
}

// ============================================
// CLIENT REQUEST LOOP — checks inbox every 2 hours

function startRequestLoop() {
  if (!clientRequests.isConfigured()) {
    console.log("⚠️  Client Request Loop: SMTP not configured — loop not started")
    return
  }

  function msUntilNext2Hour() {
    const now = new Date()
    const minutes = now.getMinutes()
    const seconds = now.getSeconds()
    // Run at :00 of every even hour
    const minutesUntilNext = (120 - (now.getHours() % 2) * 60 - minutes) % 120 || 120
    return (minutesUntilNext * 60 - seconds) * 1000
  }

  function scheduleNextCheck() {
    setTimeout(async () => {
      console.log("📬 Checking client inbox for change requests...")
      try {
        const result = await clientRequests.runInboxCheck()
        if (result.processed > 0) {
          console.log(`✅ Inbox check: ${result.processed} requests processed, ${result.skipped} skipped`)
          const reportsChannel = reporter.getReportsChannel()
          if (reportsChannel) {
            try {
              const ch = await client.channels.fetch(reportsChannel)
              if (ch) await ch.send(`📬 **Client Requests:** Processed ${result.processed} request(s) from clients.`)
            } catch {}
          }
        }
      } catch (err) {
        console.log("❌ Inbox check error:", err.message)
      }
      scheduleNextCheck()
    }, msUntilNext2Hour())
  }

  scheduleNextCheck()
  console.log(`📬 Client Request Loop started — checks inbox every 2 hours`)
}
// REMOVED: startRequestLoop — old agency model (client email inbox checker)

// ============================================
// BOT STARTUP
// ============================================
client.once("ready", () => {
  console.log("\n" + "=".repeat(60))
  console.log("🤖 JORDAN AI — Bring Your Own AI to Work")
  console.log("=".repeat(60))
  console.log(`   Discord:   ${client.user.tag}`)
  console.log(`   Mission:   AI workforce tools — $10k/month target`)
  console.log(`   Brain:     Claude Sonnet (strategy) + GPT-4o-mini (content)`)
  console.log(`   Active:    Blog (4h) · Newsletter (8pm) · X Crawler (9am)`)
  console.log(`   Disabled:  Outreach · Follow-up · Client requests (old model)`)
  console.log(`   Stocks:    Moved to stockbot (separate repo)`)
  console.log(`   Email:     ${email.isConfigured() ? "✅ Zoho SMTP (info@jordan-ai.co)" : "❌ Not configured"}`)
  console.log(`   Billing:   ${billing.isConfigured() ? "✅ Stripe connected" : "❌ Not configured"}`)
  console.log(`   CRM:       ${crm.getDashboardStats().totalClients} clients | $${crm.getDashboardStats().mrr}/mo MRR`)
  console.log("=".repeat(60) + "\n")
  
  // Seed core lessons (idempotent — skips duplicates)
  lessonsManager.seedCoreLessons()
  console.log(`   Lessons: ${lessonsManager.loadLessons().length} loaded into agent prompts`)

  // Initialize reporter with Discord client
  reporter.setClient(client)
  
  // Initialize task queue notifier (sub-agents report here)
  taskQueue.setNotifier(async (msg) => {
    const reportsChannel = reporter.getReportsChannel()
    if (reportsChannel) {
      try {
        const channel = await client.channels.fetch(reportsChannel)
        if (channel) await channel.send(msg)
      } catch (err) {}
    }
  })
  
  // Start blog loop — posts every 4 hours (AI workforce thesis content)
  startBlogLoop()

  // Start newsletter loop — daily at 8pm
  startNewsletterLoop()

  // Start X crawler loop — market intel daily at 9am
  startXCrawlerLoop()

  // Start X poster — 9am, 1pm, 6pm ET daily
  xPoster.startXPosterLoop(client, reporter.getReportsChannel())

  // Start AdBot webhook server — catches Stripe payments, sends onboarding emails
  startAdbotWebhook(client)

  // Daily morning briefing at 8am + weekly strategy Mondays 6:30am
  startMorningReport(client, reporter.getReportsChannel())

  // DISABLED — old agency model, not running:
  // startOutreachLoop()    — cold email to local businesses
  // startFollowUpLoop()    — follow-up for local leads
  // startRequestLoop()     — client email inbox checker
  // stockScanner           — moved to stockbot repo

  // Schedule nightly self-review at 3am
  scheduleNightlyRoutine(3)
  
  // Update dashboard on startup
  updateDashboard()
  
  // Start fulfillment polling (checks Stripe every 5 min for new sales)
  const reportsChannel = reporter.getReportsChannel()
  fulfill.startFulfillmentPolling(5, async (msg) => {
    // Notify in Discord when a sale happens
    if (reportsChannel) {
      try {
        const channel = await client.channels.fetch(reportsChannel)
        if (channel) channel.send(msg)
      } catch (err) {}
    }
  })
  
  // NOTE: We do NOT call createHomepage() or deployWebsite() on startup
  // The service landing page at website/index.html is manually managed
})

// ============================================
// MESSAGE HANDLER
// ============================================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return
  const content = message.content.trim()
  
  console.log(`[${message.author.username}]: ${content}`)

  // ========================================
  // ORCHESTRATION COMMANDS
  // ========================================
  
  // !orchestrate - Full orchestration for a goal (uses Opus for planning)
  if (content.startsWith("!orchestrate")) {
    const goal = content.replace("!orchestrate", "").trim()
    if (!goal) {
      message.reply("Usage: `!orchestrate <goal>`\nI'll create a plan and delegate to my team.")
      return
    }
    await message.reply("🎯 Starting orchestration... Jordan is planning and delegating.")
    const result = await orchestrate(goal)
    if (result.success && result.report) {
      await sendLongMessage(message.channel, result.report)
    } else {
      await message.reply(`❌ Orchestration failed: ${result.error}`)
    }
    return
  }

  // !cycle - Run one agent cycle manually
  if (content === "!cycle") {
    await message.reply("🧠 Running agent cycle... Jordan is thinking and acting.")
    
    const result = await agent.runAgent(
      "Check the business status. Handle any overdue follow-ups. If any active WordPress clients need new content this week, write a blog post. Then check for any new product sales.",
      {
        maxSteps: 10,
        discordNotify: async (msg) => {
          try { await message.channel.send(msg) } catch (err) {}
        }
      }
    )
    
    if (result.success) {
      await message.reply(`✅ Agent cycle complete — ${result.steps} steps taken`)
    } else {
      await message.reply(`❌ ${result.error}`)
    }
    return
  }

  // ========================================
  // AGENT COMMANDS
  // ========================================
  
  // !agents - List all agents with skills
  if (content === "!agents") {
    const agents = listAgents()
    const agentList = agents.map(a => {
      const skillList = a.skills.length > 0 ? a.skills.join(", ") : "_No skills assigned_"
      return `**${a.name}** (${a.id}) — ${a.role}\n   Skills: ${skillList}`
    }).join("\n\n")
    await message.reply(`**🤖 Jordan's Team**\n\n${agentList}`)
    return
  }

  // !delegate - Smart delegation (sub-agents use GPT-4o-mini)
  if (content.startsWith("!delegate")) {
    const task = content.replace("!delegate", "").trim()
    if (!task) {
      message.reply("Usage: `!delegate <task>`")
      return
    }
    await message.reply("🔀 Delegating...")
    const result = await smartDelegate(task)
    if (result?.result) {
      await sendLongMessage(message.channel, `**${result.agent}** (${result.role}):\n\n${result.result}`)
    } else {
      await message.reply("❌ Delegation failed")
    }
    return
  }

  // !ask <agent> <task> - Direct delegation (sub-agents use GPT-4o-mini)
  if (content.startsWith("!ask")) {
    const parts = content.replace("!ask", "").trim().split(" ")
    const agentId = parts[0]
    const task = parts.slice(1).join(" ")
    
    if (!agentId || !task) {
      message.reply("Usage: `!ask <agent> <task>`\nAgents: researcher, writer, support, sales, builder")
      return
    }
    
    await message.reply(`🤖 Asking ${agentId}...`)
    const result = await delegateTo(agentId, task)
    if (result?.result) {
      await sendLongMessage(message.channel, `**${result.agent}**:\n\n${result.result}`)
    } else {
      await message.reply(`❌ Unknown agent: ${agentId}`)
    }
    return
  }

  // ========================================
  // SKILLS COMMANDS
  // ========================================
  
  // !skills - List all available skills
  if (content === "!skills") {
    const skills = listAllSkills()
    const skillList = skills.map(s => `• **${s.id}** — ${s.name}`).join("\n")
    await message.reply(`**📚 Available Skills**\n\n${skillList}`)
    return
  }

  // !skill assign <agent> <skill>
  if (content.startsWith("!skill assign")) {
    const parts = content.replace("!skill assign", "").trim().split(" ")
    const agentId = parts[0]
    const skillId = parts[1]
    
    if (!agentId || !skillId) {
      message.reply("Usage: `!skill assign <agent> <skill-id>`")
      return
    }
    
    const success = assignSkill(agentId, skillId)
    if (success) {
      await message.reply(`✅ Assigned **${skillId}** to **${agentId}**`)
    } else {
      await message.reply(`❌ Couldn't assign skill. Check IDs.`)
    }
    return
  }

  // !skill remove <agent> <skill>
  if (content.startsWith("!skill remove")) {
    const parts = content.replace("!skill remove", "").trim().split(" ")
    const agentId = parts[0]
    const skillId = parts[1]
    
    if (!agentId || !skillId) {
      message.reply("Usage: `!skill remove <agent> <skill-id>`")
      return
    }
    
    const success = removeSkill(agentId, skillId)
    await message.reply(success ? `✅ Removed **${skillId}** from **${agentId}**` : `❌ Skill not found`)
    return
  }

  // !skill create <id> <name> | <description> | <prompt>
  if (content.startsWith("!skill create")) {
    const rest = content.replace("!skill create", "").trim()
    const parts = rest.split("|").map(p => p.trim())
    
    if (parts.length < 3) {
      message.reply("Usage: `!skill create <id> <name> | <description> | <prompt>`")
      return
    }
    
    const [idName, description, prompt] = parts
    const [skillId, ...nameParts] = idName.split(" ")
    const name = nameParts.join(" ")
    
    createSkill(skillId, name, description, prompt)
    await message.reply(`✅ Created skill **${skillId}** — ${name}`)
    return
  }

  // ========================================
  // STATUS & MANAGEMENT
  // ========================================
  
  // !status
  if (content === "!status") {
    const agentStatus = agent.getAgentStatus()
    const trust = getTrustLevel()
    const reportsChannel = reporter.getReportsChannel()
    const statusMsg = `**🤖 Jordan AI Status**

**Mode:** Autonomous Agent
**CEO Brain:** Claude Sonnet (Anthropic) — Opus for proposals only
**Workers:** GPT-4o-mini (OpenAI)
**Tools Available:** ${agent.TOOLS.length}
**Agent Runs Today:** ${agentStatus.runsToday}/10
**Last Run:** ${agentStatus.lastRun ? new Date(agentStatus.lastRun).toLocaleTimeString() : "Never"}

**Trust Level:** ${trust.level}/4 — ${trust.name}
**Reports Channel:** ${reportsChannel ? `<#${reportsChannel}>` : "Not set"}
**Homepage:** 🔒 Protected (manual only)
**Email:** ${email.isConfigured() ? "✅ Zoho SMTP connected" : "❌ Not configured"}

**CRM:** ${crm.getDashboardStats().totalClients} clients | $${crm.getDashboardStats().mrr}/mo MRR${crm.getFollowUpsDue().length > 0 ? `\n⚠️ **${crm.getFollowUpsDue().length} follow-ups overdue!**` : ""}
**Billing:** ${billing.isConfigured() ? "✅ Stripe connected" : "❌ Not configured"}
**Social:** ${social.getConnectedPlatforms().length > 0 ? social.getConnectedPlatforms().map(p => "✅ " + p).join(", ") : "❌ No platforms connected"}
**Products:** ${Object.keys(fulfill.listProducts()).length} in catalog | ${fulfill.getFulfillmentStats().totalSales} sales | $${fulfill.getFulfillmentStats().totalRevenue} revenue
**Agent:** 🧠 ${agentStatus.isRunning ? "Running — " + agentStatus.currentGoal : "Idle"} | ${agentStatus.totalRuns} total runs`
    await message.reply(statusMsg)
    return
  }

  // !reports - Set reports channel
  if (content === "!reports here") {
    reporter.setReportsChannel(message.channel.id)
    await message.reply(`✅ Reports will be sent to this channel: <#${message.channel.id}>`)
    return
  }
  
  if (content === "!reports off") {
    reporter.clearReportsChannel()
    await message.reply("✅ Reports channel disabled")
    return
  }
  
  if (content === "!reports") {
    const reportsChannel = reporter.getReportsChannel()
    if (reportsChannel) {
      await message.reply(`📢 Reports channel: <#${reportsChannel}>\n\nUse \`!reports here\` to change or \`!reports off\` to disable.`)
    } else {
      await message.reply("📢 No reports channel set.\n\nUse \`!reports here\` in the channel where you want autonomous reports.")
    }
    return
  }

  // !dashboard
  if (content === "!dashboard" || content === "!stats") {
    await message.reply("📊 Fetching dashboard...")
    await updateDashboard()
    await message.reply(formatDashboard())
    if (billing.isConfigured()) {
      const revDash = await billing.formatRevenueDashboard()
      await sendLongMessage(message.channel, revDash)
    }
    return
  }

  // !review
  if (content === "!review") {
    await message.reply("🪞 Starting self-review...")
    await runNightlyRoutine()
    await message.reply("✅ Self-review complete!")
    return
  }

  // !trust
  if (content.startsWith("!trust")) {
    const arg = content.replace("!trust", "").trim()
    if (!arg) {
      await message.reply(formatTrustStatus())
      return
    }
    const newLevel = parseInt(arg)
    if (newLevel >= 1 && newLevel <= 4) {
      setTrustLevel(newLevel)
      await message.reply(`🔐 Trust level set to **${newLevel}/4 — ${getTrustLevel().name}**`)
    } else {
      await message.reply("Usage: `!trust 1-4`")
    }
    return
  }

  // !remember
  if (content.startsWith("!remember")) {
    const fact = content.replace("!remember", "").trim()
    if (!fact) {
      message.reply("Usage: `!remember <fact>`")
      return
    }
    addMemory(fact)
    await message.reply(`✅ I'll remember: "${fact}"`)
    return
  }

  // ========================================
  // ARCHIVED COMMANDS — old agency model
  // leads, outreach, followup, website, assets, chatbot, requests
  // These modules still exist in the codebase but are not active
  // Uncomment to restore if needed
  if (false) { // ARCHIVED BLOCK START
  // ========================================
  // LEAD GENERATION
  // ========================================

  // !leads scrape <industry> <city>
  if (content.startsWith("!leads scrape")) {
    const rest = content.replace("!leads scrape", "").trim()
    if (!rest) {
      await message.reply("Usage: `!leads scrape <industry> [city]`\n\nExamples:\n`!leads scrape dentist`\n`!leads scrape restaurant Columbia, SC`\n`!leads scrape landscaping Lexington, SC`")
      return
    }

    if (!leadScraper.isConfigured()) {
      await message.reply("❌ GOOGLE_PLACES_API_KEY not set in .env\n\nGet one at: https://console.cloud.google.com/\nEnable: Places API")
      return
    }

    // Split on comma or first natural break — last "city, state" part
    const parts = rest.split(",")
    let industry, city
    if (parts.length >= 2) {
      // "dentist Columbia, SC" or "dentist, Columbia SC"
      const words = rest.split(" ")
      // Find if there's a state abbreviation (2 caps) at the end
      const stateIdx = words.findIndex(w => /^[A-Z]{2}$/.test(w))
      if (stateIdx >= 2) {
        city = words.slice(stateIdx - 1).join(" ")
        industry = words.slice(0, stateIdx - 1).join(" ")
      } else {
        industry = words[0]
        city = words.slice(1).join(" ")
      }
    } else {
      industry = rest
      city = "Columbia, SC"
    }

    await message.reply(`🔍 Scraping Google Maps for **${industry}** near **${city}**...`)
    try {
      const result = await leadScraper.scrapeLeads(industry.trim(), city.trim(), 10)
      await sendLongMessage(message.channel, leadScraper.formatLeadResults(result))
    } catch (err) {
      await message.reply(`❌ Scrape failed: ${err.message}`)
    }
    return
  }

  // !leads list - Show CRM prospects
  if (content === "!leads list") {
    const allClients = crm.listAllClients()
    const prospects = allClients.filter(c => c.stage === "prospect" || c.stage === "contacted")
    if (prospects.length === 0) {
      await message.reply("No prospects in CRM yet.\n\nRun `!leads scrape <industry>` to find some.")
      return
    }
    const lines = prospects.map(p => `• **${p.businessName}** [${p.stage}]${p.email ? ` — ${p.email}` : " — no email"}`)
    await sendLongMessage(message.channel, `**📋 Prospects (${prospects.length})**\n\n${lines.join("\n")}`)
    return
  }

  // !outreach run - Send emails to uncontacted leads now (don't wait for 9am)
  if (content.startsWith("!outreach")) {
    const limitArg = parseInt(content.replace(/\D/g, "")) || 5
    const limit = Math.min(limitArg, 20)
    await message.reply(`📧 Running outreach batch (up to ${limit} emails)...`)
    try {
      const result = await outreach.runOutreach({ dailyLimit: limit })
      await sendLongMessage(message.channel, outreach.formatOutreachReport(result))
    } catch (err) {
      await message.reply(`❌ Outreach error: ${err.message}`)
    }
    return
  }

  // !outreach status - Show pending leads and today's stats
  if (content === "!outreach status") {
    const stats = outreach.getOutreachStats()
    await message.reply(
      `**📧 Outreach Status**\n\n` +
      `Pending leads (have email, not yet contacted): **${stats.pendingOutreach}**\n` +
      `Contacted (all time): **${stats.contacted}**\n` +
      `Emails sent today: **${stats.emailsSentToday}/${stats.dailyLimit}**\n` +
      `Total leads in CRM: **${stats.totalLeads}**\n\n` +
      `Auto-runs daily at 9am. Use \`!outreach\` to run now.`
    )
    return
  }

  // !followup run [limit] - Run follow-up batch now
  if (content.startsWith("!followup run") || content === "!followup run") {
    const limitArg = parseInt(content.replace(/\D/g, "")) || 5
    const limit = Math.min(limitArg, 20)
    await message.reply(`🔁 Running follow-up batch (up to ${limit} emails)...`)
    try {
      const result = await followUp.runFollowUps({ dailyLimit: limit })
      await sendLongMessage(message.channel, followUp.formatFollowUpReport(result))
    } catch (err) {
      await message.reply(`❌ Follow-up error: ${err.message}`)
    }
    return
  }

  // !followup status - Show follow-up stats
  if (content === "!followup status") {
    const stats = followUp.getFollowUpStats()
    await message.reply(
      `**🔁 Follow-Up Status**\n\n` +
      `Leads in "contacted" stage: **${stats.contacted}**\n` +
      `Ready for follow-up (3+ days): **${stats.readyForFollowUp}**\n` +
      `Moved to cold (all time): **${stats.cold}**\n` +
      `Follow-ups sent today: **${stats.followUpsSentToday}/${stats.dailyLimit}**\n\n` +
      `Auto-runs daily at 10am. Use \`!followup run\` to run now.`
    )
    return
  }

  // !website create <slug> <name> | <industry> | <city> | <phone> | <email> | [color]
  if (content.startsWith("!website create")) {
    const rest = content.replace("!website create", "").trim()
    const [slugPart, ...pipes] = rest.split("|").map(p => p.trim())
    const [slug, ...nameParts] = slugPart.trim().split(" ")
    const businessName = nameParts.join(" ") || slug

    if (!slug || !businessName) {
      await message.reply(
        "Usage: `!website create <slug> <name> | <industry> | <city> | <phone> | <email> | [color]`\n\n" +
        "Example:\n`!website create green-peak Green Peak Landscaping | landscaping | Austin TX | (512) 555-0194 | info@greenpeak.com | green`\n\n" +
        `Colors: ${Object.keys(websiteGenerator.COLOR_PRESETS).join(", ")}`
      )
      return
    }

    await message.reply(`🌐 Building website for **${businessName}**...`)
    try {
      const result = await websiteGenerator.createClientWebsite({
        slug,
        businessName,
        industry: pipes[0] || "service",
        city:     pipes[1] || "Your City",
        phone:    pipes[2] || "",
        email:    pipes[3] || "",
        color:    pipes[4] || "green",
        deploy:   true,
      })
      await message.reply(websiteGenerator.formatWebsiteResult(result))
    } catch (err) {
      await message.reply(`❌ Website creation failed: ${err.message}`)
    }
    return
  }

  // !website list
  if (content === "!website list") {
    const sites = websiteGenerator.listClientWebsites()
    if (sites.length === 0) {
      await message.reply("No client websites created yet. Use `!website create` to build one.")
      return
    }
    const lines = [`**🌐 Client Websites (${sites.length})**`, ``]
    for (const s of sites) {
      lines.push(`• **${s.slug}** — ${s.url}`)
    }
    await message.reply(lines.join("\n"))
    return
  }

  // !design <slug> <name> | <city> | <phone> | <email>
  // Attach an image (logo, brand photo, inspiration) — Jordan analyzes colors and builds the site
  if (content.startsWith("!design")) {
    const rest = content.replace("!design", "").trim()
    const [slugPart, ...pipes] = rest.split("|").map(p => p.trim())
    const [slug, ...nameParts] = slugPart.trim().split(" ")
    const businessName = nameParts.join(" ") || slug

    // Get image URL — attachment first, then URL in message
    let imageUrl = null
    if (message.attachments.size > 0) {
      imageUrl = message.attachments.first().url
    } else {
      // Check if any pipe segment looks like a URL
      const urlPipe = pipes.find(p => p.startsWith("http"))
      if (urlPipe) imageUrl = urlPipe
    }

    if (!slug || !businessName) {
      await message.reply(
        "**Usage:** Attach an image (logo, photo, or brand reference) then:\n" +
        "`!design <slug> <name> | <city> | <phone> | <email>`\n\n" +
        "**Example:**\n" +
        "`!design rc-bounce-llc RC Bounce LLC | Columbia SC | (803) 555-0199 | info@rcbounce.com`\n\n" +
        "Jordan will analyze your image, extract the colors and style, and build the entire website to match."
      )
      return
    }

    if (!imageUrl) {
      await message.reply(
        "Attach an image to analyze (logo, brand photo, or design inspiration).\n" +
        "Or include the image URL in the command:\n" +
        "`!design rc-bounce-llc RC Bounce LLC | Columbia SC | https://...logo.png`"
      )
      return
    }

    try {
      await message.reply(
        `🎨 **Analyzing your image...**\n` +
        `Extracting colors, style, and mood for **${businessName}**.\n` +
        `Building the site to match — this takes about 30 seconds.`
      )

      const result = await websiteGenerator.designWebsiteFromImage({
        slug,
        businessName,
        imageUrl,
        city:    pipes[0] || "Your City",
        phone:   pipes[1] || "",
        email:   pipes[2] || "",
        deploy:  true,
      })

      const style = result.imageAnalysis
      await message.reply(
        `**✅ Website Built from Image**\n\n` +
        `🖌️ **Style detected:** ${style.style}\n` +
        `💬 **Mood:** ${style.mood || "N/A"}\n` +
        `🎨 **Primary color:** \`${style.primaryHex}\`\n` +
        `🎯 **Accent color:** \`${style.accentHex}\`\n` +
        `🏗️ **Template:** \`${result.templateType}\`\n` +
        `🏭 **Industry:** ${style.industry}\n\n` +
        `🔗 ${result.url}\n` +
        (result.deployed ? `🚀 Live on jordan-ai.co` : `⚠️ Deploy: \`!deploy\``)
      )
    } catch (err) {
      await message.reply(`❌ Design failed: ${err.message}`)
    }
    return
  }

  // ========================================
  // CLIENT ASSET COMMANDS
  // ========================================

  // !assets upload <slug> <type> <URL or attachment>
  // Types: hero | about | service | gallery | team | misc | video-hero | video-content | logo
  if (content.startsWith("!assets upload")) {
    const parts = content.replace("!assets upload", "").trim().split(/\s+/)
    const slug = parts[0]
    const type = parts[1]
    let source = parts.slice(2).join(" ")

    // Support Discord attachment (no URL needed when file is attached)
    if (!source && message.attachments.size > 0) {
      source = message.attachments.first().url
    }

    if (!slug || !type || !source) {
      await message.reply(
        "**Usage:** `!assets upload <slug> <type> <URL>`\n" +
        "Or attach a file: `!assets upload <slug> <type>` (Discord attachment)\n\n" +
        "**Image types:** `hero` `about` `service` `gallery` `team` `misc`\n" +
        "**Video types:** `video-hero` `video-content`\n" +
        "**Logo types:** `logo`\n\n" +
        "**Examples:**\n" +
        "`!assets upload green-peak logo https://...logo.png`\n" +
        "`!assets upload rc-bounce hero https://...hero.jpg`\n" +
        "`!assets upload green-peak about` ← attach photo in Discord"
      )
      return
    }

    try {
      await message.reply(`⬆️ Uploading \`${type}\` asset for **${slug}**...`)
      const result = await assetManager.uploadClientAsset(slug, type, source)
      const placeLoc = type === "logo" ? "logo" : type.startsWith("video") ? "hero" : type.split("-")[0]
      await message.reply(
        `**✅ Asset Uploaded**\n\n` +
        `📁 Folder: \`${result.subfolder.replace(/\\/g, "/")}/\`\n` +
        `💾 File: \`${result.filename}\`\n` +
        `🔗 Path: \`${result.relUrl}\`\n\n` +
        `**Next step:** \`!assets place ${slug} ${result.filename} ${placeLoc}\``
      )
    } catch (err) {
      await message.reply(`❌ Upload failed: ${err.message}`)
    }
    return
  }

  // !assets place <slug> <filename> <location>
  // Locations: hero | about | logo | service1..6 | gallery | team
  if (content.startsWith("!assets place")) {
    const parts = content.replace("!assets place", "").trim().split(/\s+/)
    const slug     = parts[0]
    const filename = parts[1]
    const location = parts[2]

    if (!slug || !filename || !location) {
      await message.reply(
        "**Usage:** `!assets place <slug> <filename> <location>`\n\n" +
        "**Locations:** `hero` `about` `logo` `service1`–`service6` `gallery` `team`\n\n" +
        "**Examples:**\n" +
        "`!assets place green-peak main.png logo`\n" +
        "`!assets place green-peak hero-12345.jpg hero`\n" +
        "`!assets place rc-bounce-llc about-12345.jpg about`"
      )
      return
    }

    try {
      await message.reply(`🎨 Placing **${filename}** → **${location}** on **${slug}**'s site...`)
      const result = await assetManager.placeAssetOnSite(slug, filename, location)
      await message.reply(
        `**✅ Asset Placed & Site Updated**\n\n` +
        `📍 Location: \`${result.location}\`\n` +
        `🖼️ File: \`${result.relUrl}\`\n` +
        `🔄 Re-rendered: ${result.rerendered ? "Yes ✅" : "No ⚠️"}\n` +
        `🔗 ${result.url}`
      )
    } catch (err) {
      await message.reply(`❌ Failed: ${err.message}`)
    }
    return
  }

  // !assets list <slug>
  if (content.startsWith("!assets list")) {
    const slug = content.replace("!assets list", "").trim()
    if (!slug) {
      await message.reply("Usage: `!assets list <slug>`")
      return
    }

    try {
      const info = assetManager.listClientAssets(slug)
      const lines = [`**📂 Asset Library: ${slug}**`, ``]

      // Show files grouped by subfolder
      let totalFiles = 0
      for (const [folder, files] of Object.entries(info.tree)) {
        if (files.length > 0) {
          lines.push(`**${folder}/** (${files.length})`)
          files.forEach(f => lines.push(`  • \`${f}\``))
          totalFiles += files.length
        }
      }

      if (totalFiles === 0) {
        lines.push("No assets uploaded yet.")
        lines.push(``, `Upload one: \`!assets upload ${slug} logo https://...\``)
      }

      // Show active placements
      const placements = Object.entries(info.placements).filter(([k]) => k !== "updatedAt")
      if (placements.length > 0) {
        lines.push(``, `**📌 Placed on site (${placements.length}):**`)
        placements.forEach(([loc, url]) => {
          const file = url.split("/").pop()
          lines.push(`  • \`${loc}\` ← \`${file}\``)
        })
      }

      await message.reply(lines.join("\n"))
    } catch (err) {
      await message.reply(`❌ ${err.message}`)
    }
    return
  }

  // ========================================
  // LESSONS / SELF-CORRECTION COMMANDS
  // ========================================

  // !learn "lesson text" — teach Jordan something directly
  // !learn what="..." wrong="..." fix="..." cat="..."
  if (content.startsWith("!learn")) {
    const rest = content.replace("!learn", "").trim()

    if (!rest) {
      await message.reply(
        '**Usage:** `!learn "what Jordan should always do"`\n\n' +
        '**Examples:**\n' +
        '`!learn "Always download Discord attachments before building website"`\n' +
        '`!learn "Check assets.json before fetching Unsplash images"`\n\n' +
        'For full detail: `!learn what="..." wrong="..." fix="..." cat="general"`'
      )
      return
    }

    // Parse short form: !learn "lesson text"
    // Parse long form: !learn what="..." wrong="..." fix="..." cat="..."
    let whatHappened = "", whatWentWrong = "", correctApproach = "", category = "general"

    const fixMatch  = rest.match(/fix="([^"]+)"/)
    const whatMatch = rest.match(/what="([^"]+)"/)
    const wrongMatch= rest.match(/wrong="([^"]+)"/)
    const catMatch  = rest.match(/cat="([^"]+)"/)

    if (fixMatch) {
      // Long form
      correctApproach = fixMatch[1]
      whatHappened    = whatMatch?.[1]  || ""
      whatWentWrong   = wrongMatch?.[1] || ""
      category        = catMatch?.[1]   || "general"
    } else {
      // Short form — strip surrounding quotes
      correctApproach = rest.replace(/^"|"$/g, "")
    }

    if (!correctApproach) {
      await message.reply('❌ Could not parse lesson. Use: `!learn "Your lesson text here"`')
      return
    }

    const result = lessonsManager.addLesson({ whatHappened, whatWentWrong, correctApproach, category, source: "human" })

    if (result.added) {
      await message.reply(
        `**✅ Lesson Saved** (Lesson #${result.lesson.id})\n\n` +
        `📚 **[${result.lesson.category}]** ${correctApproach}\n\n` +
        `_Jordan will apply this before every future task._`
      )
    } else {
      await message.reply(
        `⚠️ **Already learned:** This lesson already exists.\n\n` +
        `"${result.existing.correctApproach}"`
      )
    }
    return
  }

  // !lessons — show everything Jordan has learned
  if (content === "!lessons") {
    const text = lessonsManager.formatLessonsForDiscord()
    await sendLongMessage(message.channel, text)
    return
  }

  // !lesson remove <id> — remove a lesson by ID
  if (content.startsWith("!lesson remove")) {
    const id = parseInt(content.replace("!lesson remove", "").trim())
    if (isNaN(id)) {
      await message.reply("Usage: `!lesson remove <id>` — get IDs from `!lessons`")
      return
    }
    const all = lessonsManager.loadLessons()
    const idx = all.findIndex(l => l.id === id)
    if (idx === -1) {
      await message.reply(`❌ Lesson #${id} not found.`)
      return
    }
    const removed = all.splice(idx, 1)[0]
    // Re-save (lessonsManager doesn't export save directly, write inline)
    const fs = require("fs")
    fs.writeFileSync(require("path").join(__dirname, "lessons.json"), JSON.stringify(all, null, 2))
    await message.reply(`✅ Removed lesson #${id}: "${removed.correctApproach}"`)
    return
  }

  // ========================================
  // NEWSLETTER COMMANDS
  // ========================================

  // !newsletter — publish today's entry now (or skip if already published)
  if (content === "!newsletter" || content === "!newsletter run") {
    await message.reply("📰 Running newsletter pipeline...")
    try {
      const result = await newsletter.runDailyNewsletter()
      if (result.skipped) {
        await message.reply(`✅ Already published today — skipping.\n\nUse \`!newsletter force\` to publish again.`)
      } else if (result.success) {
        await message.reply(
          `✅ **Newsletter Published!**\n\n` +
          `**Date:** ${result.date}\n` +
          `**Worked On:** ${result.preview?.workedOn || ""}\n` +
          `**Tip:** ${result.preview?.tipTitle || ""}\n\n` +
          `Auto-runs daily at 8pm.`
        )
      } else {
        await message.reply(`❌ Newsletter failed: ${result.error}`)
      }
    } catch (err) {
      await message.reply(`❌ Error: ${err.message}`)
    }
    return
  }

  // !newsletter force — publish even if already published today
  if (content === "!newsletter force") {
    await message.reply("📰 Force-publishing newsletter entry...")
    try {
      const result = await newsletter.runDailyNewsletter(true)
      if (result.success) {
        await message.reply(
          `✅ **Newsletter Force-Published!**\n\n` +
          `**Date:** ${result.date}\n` +
          `**Worked On:** ${result.preview?.workedOn || ""}\n` +
          `**Tip:** ${result.preview?.tipTitle || ""}`
        )
      } else {
        await message.reply(`❌ Newsletter failed: ${result.error}`)
      }
    } catch (err) {
      await message.reply(`❌ Error: ${err.message}`)
    }
    return
  }

  // !newsletter status — check if published today
  if (content === "!newsletter status") {
    const publishedToday = newsletter.hasPublishedToday()
    await message.reply(
      `**📰 Newsletter Status**\n\n` +
      `Published today: **${publishedToday ? "Yes ✅" : "No ❌"}**\n\n` +
      `Auto-runs daily at 8pm. Use \`!newsletter\` to publish now.`
    )
    return
  }

  // ========================================
  // X CRAWLER COMMANDS
  // ========================================

  // !x scan — run a full X crawl right now
  if (content === "!x scan" || content === "!x") {
    if (!xCrawler.isConfigured()) {
      await message.reply(
        "❌ **X Crawler not configured.**\n\n" +
        "Add one of these to your `.env` file:\n" +
        "• `RAPIDAPI_KEY=your_key` — subscribe to a Twitter API on rapidapi.com (free tiers available)\n" +
        "• `TWITTER_BEARER_TOKEN=your_token` — Twitter/X developer portal (Basic $100/mo)"
      )
      return
    }
    await message.reply("🔍 Running X scan now... (takes ~2 minutes)")
    try {
      const report = await xCrawler.runScan()
      const text   = xCrawler.formatDiscordReport(report)
      await sendLongMessage(message.channel, text)
    } catch (err) {
      await message.reply(`❌ Scan failed: ${err.message}`)
    }
    return
  }

  // !x report — show the last saved report
  if (content === "!x report") {
    const report = xCrawler.loadLastReport()
    if (!report) {
      await message.reply("No report yet. Run `!x scan` first.")
      return
    }
    await sendLongMessage(message.channel, xCrawler.formatDiscordReport(report))
    return
  }

  // !x keywords — list current keywords
  if (content === "!x keywords" || content === "!x keywords list") {
    const kws = xCrawler.loadKeywords()
    await message.reply(`**🔎 X Crawler Keywords (${kws.length})**\n${kws.map((k, i) => `${i + 1}. "${k}"`).join("\n")}`)
    return
  }

  // !x keywords add "keyword" — add a keyword
  if (content.startsWith("!x keywords add")) {
    const match = content.match(/!x keywords add\s+"([^"]+)"/) || content.match(/!x keywords add\s+(.+)/)
    if (!match) {
      await message.reply('Usage: `!x keywords add "AI voice agent"`')
      return
    }
    const result = xCrawler.addKeyword(match[1])
    if (result.added) {
      await message.reply(`✅ Added keyword: **"${result.keyword}"** — now tracking ${result.total} keywords`)
    } else {
      await message.reply(`⚠️ Already tracking that keyword.`)
    }
    return
  }

  // !x keywords remove "keyword" — remove a keyword
  if (content.startsWith("!x keywords remove")) {
    const match = content.match(/!x keywords remove\s+"([^"]+)"/) || content.match(/!x keywords remove\s+(.+)/)
    if (!match) {
      await message.reply('Usage: `!x keywords remove "AI automation"`')
      return
    }
    const result = xCrawler.removeKeyword(match[1])
    if (result.removed) {
      await message.reply(`✅ Removed keyword: **"${result.keyword}"**`)
    } else {
      await message.reply(`❌ Keyword not found. Use \`!x keywords\` to see the list.`)
    }
    return
  }

  if (false) { // ARCHIVED: client requests + chatbot commands
  // ========================================
  // CLIENT REQUEST COMMANDS
  // ========================================

  // !requests check — check inbox now
  if (content === "!requests check" || content === "!requests") {
    if (!clientRequests.isConfigured()) {
      await message.reply("❌ Email not configured. Set SMTP_USER and SMTP_PASS in .env")
      return
    }
    await message.reply("📬 Checking client inbox...")
    try {
      const result = await clientRequests.runInboxCheck()
      await message.reply(
        `📬 **Inbox Check Done**\n` +
        `• Processed: ${result.processed} request(s)\n` +
        `• Skipped (not clients): ${result.skipped}\n` +
        (result.errors.length ? `• Errors: ${result.errors.join(", ")}` : "• No errors")
      )
    } catch (err) {
      await message.reply(`❌ Error: ${err.message}`)
    }
    return
  }

  // !requests process [slug] "request text"
  if (content.startsWith("!requests process ")) {
    const match = content.match(/!requests process\s+(\S+)\s+"([^"]+)"/)
    if (!match) {
      await message.reply('Usage: `!requests process [slug] "change phone to 555-1234"`')
      return
    }
    const [, slug, requestText] = match
    await message.reply(`🔧 Processing request for ${slug}...`)
    try {
      const result = await clientRequests.processRequest(slug, requestText, null)
      if (result.success) {
        await message.reply(
          `✅ **Request processed for ${slug}**\n` +
          `• Change: ${result.result?.description || "applied"}\n` +
          `• Deployed: ${result.deployed ? "Yes ✅" : "No ⚠️"}`
        )
      } else {
        await message.reply(`❌ Failed: ${result.error}`)
      }
    } catch (err) {
      await message.reply(`❌ Error: ${err.message}`)
    }
    return
  }

  // !requests history [slug]
  if (content.startsWith("!requests history")) {
    const slug = content.split(" ")[2]
    if (!slug) {
      await message.reply("Usage: `!requests history [client-slug]`")
      return
    }
    const history = clientRequests.getRequestHistory(slug)
    if (history.length === 0) {
      await message.reply(`No request history for ${slug} yet.`)
      return
    }
    const lines = [`**📋 Request History — ${slug}**`]
    for (const entry of history.slice(0, 5)) {
      lines.push(`• **${entry.date?.split("T")[0] || "?"}** — ${entry.requestText?.substring(0, 60)}`)
      lines.push(`  → ${entry.result?.description || entry.change?.type || "processed"}`)
    }
    if (history.length > 5) lines.push(`\n_...and ${history.length - 5} more_`)
    await message.reply(lines.join("\n"))
    return
  }

  // !requests sitemap [slug]
  if (content.startsWith("!requests sitemap")) {
    const slug = content.split(" ")[2]
    if (!slug) {
      await message.reply("Usage: `!requests sitemap [client-slug]`")
      return
    }
    try {
      const sitemap = clientRequests.generateSitemap(slug)
      if (!sitemap) {
        await message.reply(`❌ No index.html found for ${slug}`)
        return
      }
      const sections = Object.entries(sitemap.sections).map(([k, v]) => `• **${k}** (lines ${v.line_start}–${v.line_end}): ${v.description}`).join("\n")
      const editable = Object.entries(sitemap.editable).map(([k, v]) => `• **${k}**: \`${v.current}\` (${v.lines?.length || 0} locations)`).join("\n")
      await message.reply(`📋 **Sitemap for ${slug}**\n\n**Sections:**\n${sections}\n\n**Editable fields:**\n${editable}`)
    } catch (err) {
      await message.reply(`❌ Error generating sitemap: ${err.message}`)
    }
    return
  }

  // !x help — show all x commands
  if (content === "!x help") {
    await message.reply(
      "**🔍 X Crawler Commands**\n\n" +
      "`!x scan` — Run a full X scan now (takes ~2 min)\n" +
      "`!x report` — Show the last saved report\n" +
      "`!x keywords` — List current search keywords\n" +
      '`!x keywords add "keyword"` — Add a search keyword\n' +
      '`!x keywords remove "keyword"` — Remove a keyword\n\n' +
      "*Auto-runs daily at 9am and posts to reports channel.*"
    )
    return
  }

  // ========================================
  // CHATBOT COMMANDS
  // ========================================

  // !chatbot setup <slug> <tidioKey> [accentColor]
  if (content.startsWith("!chatbot setup")) {
    const parts = content.replace("!chatbot setup", "").trim().split(/\s+/)
    const slug        = parts[0]
    const tidioKey    = parts[1]
    const accentColor = parts[2] || null

    if (!slug || !tidioKey) {
      await message.reply(
        "**Usage:** `!chatbot setup <slug> <tidioKey> [accentColor]`\n\n" +
        "**How to get your Tidio key:**\n" +
        "1. Create a free account at tidio.com\n" +
        "2. Go to **Settings → Developer**\n" +
        "3. Copy the **Public Key**\n\n" +
        "**Example:**\n" +
        "`!chatbot setup rc-bounce-llc abcdef123456 #ef4444`"
      )
      return
    }

    try {
      await message.reply(`💬 Setting up Tidio chatbot for **${slug}**...`)
      const result = await chatbotManager.setupClientChatbot(slug, { tidioKey, accentColor })
      await message.reply(
        `**✅ Chatbot Live: ${slug}**\n\n` +
        `📦 Provider: Tidio\n` +
        `🔑 Key: \`${tidioKey}\`\n` +
        `🔄 Site re-rendered: ${result.rerendered ? "Yes" : "No"}\n\n` +
        `**Next steps:**\n` +
        `• Visit [Tidio Automations](${result.setupUrl}) to set up response flows\n` +
        `• Customize responses: \`!chatbot update ${slug} greeting "Welcome!"\`\n` +
        `• View chatbot: \`!chatbot list\``
      )
    } catch (err) {
      await message.reply(`❌ Setup failed: ${err.message}`)
    }
    return
  }

  // !chatbot update <slug> <field> <"value">
  // Fields: greeting, hours, services, contact, appointment, pricing, location, fallback
  if (content.startsWith("!chatbot update")) {
    const rest  = content.replace("!chatbot update", "").trim()
    const match = rest.match(/^(\S+)\s+(\S+)\s+"(.+)"$/)

    if (!match) {
      await message.reply(
        "**Usage:** `!chatbot update <slug> <field> \"<response text>\"`\n\n" +
        "**Fields:** `greeting` `hours` `services` `contact` `appointment` `pricing` `location` `fallback`\n\n" +
        "**Placeholders you can use:**\n" +
        "`{{BUSINESS_NAME}}` `{{PHONE}}` `{{EMAIL}}` `{{CITY}}` `{{SERVICES}}`\n\n" +
        "**Example:**\n" +
        '`!chatbot update rc-bounce-llc greeting "Welcome to RC Bounce! Ready to make your party epic? 🎉"`'
      )
      return
    }

    const [, slug, field, value] = match
    const validFields = ["greeting","hours","services","contact","appointment","pricing","location","fallback"]
    if (!validFields.includes(field)) {
      await message.reply(`❌ Unknown field: \`${field}\`\nValid fields: ${validFields.map(f => `\`${f}\``).join(", ")}`)
      return
    }

    try {
      const result = await chatbotManager.updateChatbotResponses(slug, { [field]: value })
      await message.reply(
        `**✅ Chatbot Response Updated: ${slug}**\n\n` +
        `📝 \`${field}\`: "${value}"\n` +
        `🔄 Site updated: ${result.rerendered ? "Yes" : "No"}`
      )
    } catch (err) {
      await message.reply(`❌ ${err.message}`)
    }
    return
  }

  // !chatbot remove <slug>
  if (content.startsWith("!chatbot remove")) {
    const slug = content.replace("!chatbot remove", "").trim()
    if (!slug) {
      await message.reply("Usage: `!chatbot remove <slug>`")
      return
    }
    try {
      const result = await chatbotManager.removeChatbot(slug)
      await message.reply(`✅ Chatbot removed from **${slug}**. Site re-rendered: ${result.rerendered ? "Yes" : "No"}`)
    } catch (err) {
      await message.reply(`❌ ${err.message}`)
    }
    return
  }

  // !chatbot list
  if (content === "!chatbot list" || content === "!chatbot") {
    const bots = chatbotManager.listChatbots()
    if (bots.length === 0) {
      await message.reply(
        "No chatbots configured yet.\n\n" +
        "Set one up: `!chatbot setup <slug> <tidioKey>`\n" +
        "Get a free Tidio key at **tidio.com** → Settings → Developer"
      )
      return
    }
    const lines = [`**💬 Active Chatbots (${bots.filter(b => b.active).length}/${bots.length})**`, ``]
    for (const b of bots) {
      lines.push(chatbotManager.formatChatbotStatus(b))
    }
    await message.reply(lines.join("\n"))
    return
  }

  // !chatbot responses <slug>
  if (content.startsWith("!chatbot responses")) {
    const slug = content.replace("!chatbot responses", "").trim()
    const config = chatbotManager.getChatbotConfig(slug)
    if (!config) {
      await message.reply(`No chatbot found for \`${slug}\`. Use \`!chatbot setup ${slug} <key>\` first.`)
      return
    }
    const lines = [`**💬 Chatbot Responses: ${slug}**`, ``]
    for (const [key, val] of Object.entries(config.responses)) {
      lines.push(`**${key}:** ${val}`)
    }
    await message.reply(lines.join("\n"))
    return
  }
  } // ARCHIVED: client requests + chatbot commands END

  // !deploy - Deploy website (but NEVER overwrite index.html)
  if (content === "!deploy") {
    await message.reply("🚀 Deploying website... (homepage is protected)")
    await deployWebsite("Manual deploy")
    await message.reply("✅ Deployed! Homepage was NOT overwritten.")
    return
  }
  } // ARCHIVED BLOCK END

  // ========================================
  // WORDPRESS CLIENT MANAGEMENT
  // ========================================

  // !wp clients - List all WordPress clients
  if (content === "!wp clients") {
    const clients = wp.listClients()
    const slugs = Object.keys(clients)
    
    if (slugs.length === 0) {
      await message.reply("No WordPress clients yet.\n\nAdd one with:\n`!wp add <slug> <name> | <url> | <username> | <app-password>`")
      return
    }
    
    const list = slugs.map(s => {
      const c = clients[s]
      return `**${c.name}** (\`${s}\`)\n   ${c.url}\n   Mode: ${c.mode} | Posts: ${c.postsPublished} | Pages: ${c.pagesCreated}`
    }).join("\n\n")
    
    await message.reply(`**🌐 WordPress Clients**\n\n${list}`)
    return
  }

  // !wp add <slug> <name> | <url> | <username> | <app-password>
  if (content.startsWith("!wp add")) {
    const rest = content.replace("!wp add", "").trim()
    const firstSpace = rest.indexOf(" ")
    
    if (firstSpace === -1) {
      await message.reply("Usage: `!wp add <slug> <name> | <url> | <username> | <app-password>`\n\nExample:\n`!wp add lakemurray Lake Murray Landscape | https://www.lakemurrayls.com | admin | xxxx xxxx xxxx xxxx`")
      return
    }
    
    const slug = rest.substring(0, firstSpace)
    const parts = rest.substring(firstSpace + 1).split("|").map(p => p.trim())
    
    if (parts.length < 4) {
      await message.reply("Need 4 parts separated by `|`:\n`!wp add <slug> <name> | <url> | <username> | <app-password>`")
      return
    }
    
    const [name, url, username, appPassword] = parts
    
    wp.addClient(slug, { name, url, username, appPassword })
    await message.reply(`✅ Added WordPress client: **${name}**\nSlug: \`${slug}\`\nURL: ${url}\nMode: draft (change with \`!wp mode ${slug} publish\`)\n\nTest connection: \`!wp test ${slug}\``)
    return
  }

  // !wp remove <slug>
  if (content.startsWith("!wp remove")) {
    const slug = content.replace("!wp remove", "").trim()
    if (!slug) {
      await message.reply("Usage: `!wp remove <slug>`")
      return
    }
    
    const removed = wp.removeClient(slug)
    await message.reply(removed ? `✅ Removed client: ${slug}` : `❌ Client "${slug}" not found`)
    return
  }

  // !wp test <slug> - Test connection
  if (content.startsWith("!wp test")) {
    const slug = content.replace("!wp test", "").trim()
    if (!slug) {
      await message.reply("Usage: `!wp test <slug>`")
      return
    }
    
    await message.reply(`🔌 Testing connection to ${slug}...`)
    const result = await wp.testConnection(slug)
    
    if (result.success) {
      await message.reply(`✅ **Connected to ${result.siteName}**\nURL: ${result.siteUrl}\nLogged in as: ${result.loggedInAs}\nRole: ${result.role}`)
    } else {
      await message.reply(`❌ Connection failed: ${result.error}\n\nCheck:\n1. URL is correct\n2. Username is correct\n3. Application password is correct (not your regular password)\n4. Create app password at: Users → Profile → Application Passwords`)
    }
    return
  }

  // !wp mode <slug> <draft|publish>
  if (content.startsWith("!wp mode")) {
    const parts = content.replace("!wp mode", "").trim().split(" ")
    const slug = parts[0]
    const mode = parts[1]
    
    if (!slug || !mode) {
      await message.reply("Usage: `!wp mode <slug> <draft|publish>`\n\n**draft** = creates posts as drafts for you to review\n**publish** = publishes immediately")
      return
    }
    
    if (mode !== "draft" && mode !== "publish") {
      await message.reply("Mode must be `draft` or `publish`")
      return
    }
    
    const success = wp.setClientMode(slug, mode)
    await message.reply(success ? `✅ **${slug}** mode set to **${mode}**` : `❌ Client "${slug}" not found`)
    return
  }

  // ========================================
  // WORDPRESS CONTENT COMMANDS
  // ========================================

  // !wp post <slug> <topic> - Write and publish a blog post
  if (content.startsWith("!wp post")) {
    const rest = content.replace("!wp post", "").trim()
    const firstSpace = rest.indexOf(" ")
    
    if (firstSpace === -1) {
      await message.reply("Usage: `!wp post <slug> <topic>`\n\nExample:\n`!wp post lakemurray Best mulch for Columbia SC gardens`")
      return
    }
    
    const slug = rest.substring(0, firstSpace)
    const topic = rest.substring(firstSpace + 1)
    
    const client = wp.getClient(slug)
    if (!client) {
      await message.reply(`❌ Client "${slug}" not found. Run \`!wp clients\` to see your clients.`)
      return
    }
    
    await message.reply(`📝 Writing blog post for **${client.name}**: "${topic}"...\nMode: ${client.mode}`)
    
    const result = await wp.writeAndPublish(slug, topic, openai, {
      type: "post",
      categories: ["Blog"]
    })
    
    if (result.success) {
      await message.reply(`✅ **Post ${result.status === "publish" ? "published" : "saved as draft"}!**\nTitle: ${result.title}\nURL: ${result.url}\nID: ${result.id}${result.status === "draft" ? "\n\nPublish with: `!wp publish " + slug + " " + result.id + "`" : ""}`)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !wp page <slug> <topic>
  if (content.startsWith("!wp page")) {
    const rest = content.replace("!wp page", "").trim()
    const firstSpace = rest.indexOf(" ")
    
    if (firstSpace === -1) {
      await message.reply("Usage: `!wp page <slug> <topic>`\n\nExample:\n`!wp page lakemurray Service areas we deliver to in Columbia SC`")
      return
    }
    
    const slug = rest.substring(0, firstSpace)
    const topic = rest.substring(firstSpace + 1)
    
    const client = wp.getClient(slug)
    if (!client) {
      await message.reply(`❌ Client "${slug}" not found`)
      return
    }
    
    await message.reply(`📄 Creating page for **${client.name}**: "${topic}"...`)
    
    const result = await wp.writeAndPublish(slug, topic, openai, {
      type: "page"
    })
    
    if (result.success) {
      await message.reply(`✅ **Page created!**\nTitle: ${result.title}\nURL: ${result.url}\nID: ${result.id}`)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !wp batch <slug> <topic1> | <topic2> | <topic3>
  if (content.startsWith("!wp batch")) {
    const rest = content.replace("!wp batch", "").trim()
    const firstSpace = rest.indexOf(" ")
    
    if (firstSpace === -1) {
      await message.reply("Usage: `!wp batch <slug> <topic1> | <topic2> | <topic3>`\n\nExample:\n`!wp batch lakemurray Best mulch types | Pine straw vs mulch | When to plant palms in SC`")
      return
    }
    
    const slug = rest.substring(0, firstSpace)
    const topicsStr = rest.substring(firstSpace + 1)
    const topics = topicsStr.split("|").map(t => t.trim()).filter(t => t)
    
    const client = wp.getClient(slug)
    if (!client) {
      await message.reply(`❌ Client "${slug}" not found`)
      return
    }
    
    await message.reply(`📝 Writing **${topics.length} posts** for **${client.name}**...\nThis will take a few minutes.\n\nTopics:\n${topics.map((t, i) => `${i + 1}. ${t}`).join("\n")}`)
    
    const result = await wp.batchWriteAndPublish(slug, topics, openai, {
      categories: ["Blog"]
    })
    
    if (result.success) {
      const summary = result.results.map(r => 
        r.success ? `✅ ${r.title || r.topic}` : `❌ ${r.topic}: ${r.error}`
      ).join("\n")
      
      await sendLongMessage(message.channel, `**Batch Complete**\nPublished: ${result.published} | Failed: ${result.failed}\n\n${summary}`)
    } else {
      await message.reply(`❌ Batch failed: ${result.error}`)
    }
    return
  }

  // !wp publish <slug> <post-id>
  if (content.startsWith("!wp publish")) {
    const parts = content.replace("!wp publish", "").trim().split(" ")
    const slug = parts[0]
    const postId = parseInt(parts[1])
    
    if (!slug || !postId) {
      await message.reply("Usage: `!wp publish <slug> <post-id>`")
      return
    }
    
    await message.reply(`📤 Publishing post ${postId}...`)
    const result = await wp.publishDraft(slug, postId)
    
    if (result.success) {
      await message.reply(`✅ Post published!\nURL: ${result.data.link}`)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !wp drafts <slug>
  if (content.startsWith("!wp drafts")) {
    const slug = content.replace("!wp drafts", "").trim()
    if (!slug) {
      await message.reply("Usage: `!wp drafts <slug>`")
      return
    }
    
    const result = await wp.listPosts(slug, { status: "draft" })
    
    if (result.success) {
      if (result.data.length === 0) {
        await message.reply("No drafts waiting for review.")
        return
      }
      
      const list = result.data.map(p => 
        `**${p.title.rendered}** (ID: ${p.id})\n   Created: ${new Date(p.date).toLocaleDateString()}\n   Publish: \`!wp publish ${slug} ${p.id}\``
      ).join("\n\n")
      
      await message.reply(`**📋 Drafts for ${slug}**\n\n${list}`)
    } else {
      await message.reply(`❌ Error: ${result.error}`)
    }
    return
  }

  // !wp status <slug>
  if (content.startsWith("!wp status")) {
    const slug = content.replace("!wp status", "").trim()
    if (!slug) {
      await message.reply("Usage: `!wp status <slug>`")
      return
    }
    
    await message.reply(`🔍 Checking ${slug}...`)
    const status = await wp.getSiteStatus(slug)
    
    if (status.success) {
      let statusMsg = `**🌐 ${status.client}**\nURL: ${status.url}\nMode: ${status.mode}\n\n`
      
      statusMsg += `**Jordan AI Stats:**\nPosts Published: ${status.stats.postsPublished}\nPages Created: ${status.stats.pagesCreated}\nLast Activity: ${status.stats.lastActivity || "Never"}\n\n`
      
      if (status.draftPosts > 0) {
        statusMsg += `**📋 ${status.draftPosts} Drafts Waiting:**\n`
        status.drafts.forEach(d => {
          statusMsg += `• ${d.title} (ID: ${d.id})\n`
        })
        statusMsg += "\n"
      }
      
      if (status.recentPosts && status.recentPosts.length > 0) {
        statusMsg += `**📝 Recent Posts:**\n`
        status.recentPosts.forEach(p => {
          statusMsg += `• ${p.title} (${new Date(p.date).toLocaleDateString()})\n`
        })
        statusMsg += "\n"
      }
      
      if (status.pages && status.pages.length > 0) {
        statusMsg += `**📄 Pages (${status.pages.length}):**\n`
        status.pages.forEach(p => {
          statusMsg += `• ${p.title}\n`
        })
      }
      
      await sendLongMessage(message.channel, statusMsg)
    } else {
      await message.reply(`❌ Error: ${status.error}`)
    }
    return
  }

  // !wp help
  if (content === "!wp help" || content === "!wp") {
    const helpMsg = `**🌐 WordPress Manager**

**Client Management**
\`!wp clients\` — List all clients
\`!wp add <slug> <name> | <url> | <user> | <app-pass>\` — Add client
\`!wp remove <slug>\` — Remove client
\`!wp test <slug>\` — Test connection
\`!wp mode <slug> <draft|publish>\` — Set mode

**Content**
\`!wp post <slug> <topic>\` — Write & publish blog post
\`!wp page <slug> <topic>\` — Create a new page
\`!wp batch <slug> <topic1> | <topic2> | ...\` — Write multiple posts

**Review**
\`!wp drafts <slug>\` — View draft posts
\`!wp publish <slug> <post-id>\` — Publish a draft
\`!wp status <slug>\` — Full site status`
    await message.reply(helpMsg)
    return
  }

  // ========================================
  // EMAIL COMMANDS
  // ========================================

  // !email status - Check email configuration
  if (content === "!email status") {
    if (!email.isConfigured()) {
      await message.reply(`❌ **Email not configured**\n\nAdd these to your \`.env\` file:\n\`\`\`\nSMTP_HOST=smtp.zoho.com\nSMTP_PORT=465\nSMTP_USER=info@jordan-ai.co\nSMTP_PASS=your-password\nFROM_EMAIL=info@jordan-ai.co\nFROM_NAME=Jordan\n\`\`\``)
      return
    }

    const config = email.getConfig()
    await message.reply(`**📧 Email System**\n\n**Status:** ✅ Configured\n**SMTP:** ${config.host}:${config.port}\n**From:** ${config.fromName} <${config.fromEmail}>\n**Reply-To:** ${config.replyTo}`)
    return
  }

  // !email send <to> | <subject> | <message>
  if (content.startsWith("!email send")) {
    const rest = content.replace("!email send", "").trim()
    const parts = rest.split("|").map(p => p.trim())
    
    if (parts.length < 3) {
      await message.reply("Usage: `!email send <to> | <subject> | <message>`\n\nExample:\n`!email send john@example.com | Quick question | Hi John, wanted to follow up on our conversation...`")
      return
    }
    
    const [to, subject, body] = parts
    const htmlBody = body.split("\\n").map(l => `<p>${l}</p>`).join("")
    const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">${htmlBody}<br><p style="color:#888;font-size:13px">— Jordan AI Team</p></body></html>`
    
    await message.reply(`📧 Sending email to ${to}...`)
    const result = await email.sendEmail(to, subject, html)
    
    if (result.success) {
      await message.reply(`✅ **Email sent!**\nTo: ${to}\nSubject: ${subject}`)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !email write <to> | <purpose> | <context>
  if (content.startsWith("!email write")) {
    const rest = content.replace("!email write", "").trim()
    const parts = rest.split("|").map(p => p.trim())
    
    if (parts.length < 3) {
      await message.reply("Usage: `!email write <to> | <purpose> | <context>`\n\nExample:\n`!email write john@example.com | follow up after meeting | We discussed SEO services for his landscaping business`\n\nJordan AI will write and send the email automatically.")
      return
    }
    
    const [to, purpose, context] = parts
    
    await message.reply(`📝 Writing and sending email to ${to}...\nPurpose: ${purpose}`)
    
    const result = await email.writeAndSendEmail(to, purpose, context, openai, {
      recipientName: parts[3] || null,
      businessName: parts[4] || null
    })
    
    if (result.success) {
      await message.reply(`✅ **Email written and sent!**\nTo: ${to}\nSubject: ${result.subject}\n\n_Preview:_\n${result.body.substring(0, 300)}...`)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !email proposal <to> | <client name> | <business name> | <service1:price, service2:price>
  if (content.startsWith("!email proposal")) {
    const rest = content.replace("!email proposal", "").trim()
    const parts = rest.split("|").map(p => p.trim())
    
    if (parts.length < 4) {
      await message.reply("Usage: `!email proposal <to> | <name> | <business> | <service1:price, service2:price>`\n\nExample:\n`!email proposal john@lake.com | John | Lake Murray Landscape | Website Management:300, SEO Content:200`")
      return
    }
    
    const [to, clientName, businessName, servicesStr] = parts
    
    // Parse services
    const services = []
    const pricing = []
    
    servicesStr.split(",").map(s => s.trim()).forEach(s => {
      const [name, price] = s.split(":").map(p => p.trim())
      services.push({ name, description: `Monthly ${name.toLowerCase()} service` })
      pricing.push({ item: name, amount: `$${price}/mo` })
    })
    
    await message.reply(`📧 Sending proposal to ${clientName} at ${to}...`)
    
    const result = await email.sendProposal(to, clientName, businessName, services, pricing)
    
    if (result.success) {
      await message.reply(`✅ **Proposal sent!**\nTo: ${clientName} (${to})\nBusiness: ${businessName}\nServices: ${services.map(s => s.name).join(", ")}`)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !email report <to> | <client name> | <business name> | <posts published> | <highlights>
  if (content.startsWith("!email report")) {
    const rest = content.replace("!email report", "").trim()
    const parts = rest.split("|").map(p => p.trim())
    
    if (parts.length < 4) {
      await message.reply("Usage: `!email report <to> | <name> | <business> | <posts count> | <highlights>`\n\nExample:\n`!email report john@lake.com | John | Lake Murray Landscape | 4 | Published 4 SEO blogs, Service areas page created`")
      return
    }
    
    const [to, clientName, businessName, postsStr, highlightsStr] = parts
    
    const data = {
      postsPublished: parseInt(postsStr) || 0,
      pagesCreated: 0,
      highlights: highlightsStr ? highlightsStr.split(",").map(h => h.trim()) : [],
      nextMonth: ["Continue weekly blog publishing", "Optimize existing pages for local keywords", "Monitor search rankings"]
    }
    
    await message.reply(`📊 Sending monthly report to ${clientName}...`)
    
    const result = await email.sendMonthlyReport(to, clientName, businessName, data)
    
    if (result.success) {
      await message.reply(`✅ **Monthly report sent!**\nTo: ${clientName} (${to})`)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !email invoice <to> | <client name> | <business name> | <item1:amount, item2:amount>
  if (content.startsWith("!email invoice")) {
    const rest = content.replace("!email invoice", "").trim()
    const parts = rest.split("|").map(p => p.trim())
    
    if (parts.length < 4) {
      await message.reply("Usage: `!email invoice <to> | <name> | <business> | <item1:amount, item2:amount>`\n\nExample:\n`!email invoice john@lake.com | John | Lake Murray Landscape | Website Management:300, SEO Content:200`")
      return
    }
    
    const [to, clientName, businessName, itemsStr] = parts
    
    const items = itemsStr.split(",").map(s => {
      const [description, amount] = s.trim().split(":").map(p => p.trim())
      return { description, amount: parseInt(amount) || 0 }
    })
    
    await message.reply(`💰 Sending invoice to ${clientName}...`)
    
    const result = await email.sendInvoice(to, clientName, businessName, items)
    
    if (result.success) {
      const total = items.reduce((sum, i) => sum + i.amount, 0)
      await message.reply(`✅ **Invoice sent!**\nTo: ${clientName} (${to})\nTotal: $${total}`)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !email log - Show recent emails
  if (content === "!email log") {
    const stats = email.getEmailStats()
    
    if (stats.recent.length === 0) {
      await message.reply("No emails sent yet.")
      return
    }
    
    const list = stats.recent.map(e => 
      `**${e.subject}**\nTo: ${e.to} | ${new Date(e.sentAt).toLocaleString()}\nTags: ${e.tags.join(", ") || "none"}`
    ).join("\n\n")
    
    await message.reply(`**📧 Recent Emails**\n\nToday: ${stats.today} | This month: ${stats.thisMonth} | Total: ${stats.total}\n\n${list}`)
    return
  }

  // !email help
  if (content === "!email help" || content === "!email") {
    const configured = email.isConfigured()
    const helpMsg = `**📧 Email Manager** ${configured ? "✅" : "❌ Not configured"}

**Send**
\`!email send <to> | <subject> | <message>\` — Send a manual email
\`!email write <to> | <purpose> | <context>\` — AI writes and sends

**Business**
\`!email proposal <to> | <name> | <biz> | <svc1:price, svc2:price>\`
\`!email report <to> | <name> | <biz> | <posts count> | <highlights>\`
\`!email invoice <to> | <name> | <biz> | <item1:amt, item2:amt>\`

**System**
\`!email status\` — Config and stats
\`!email log\` — Recent sent emails

**Example:**
\`\`\`
!email proposal john@lake.com | John | Lake Murray Landscape | Website Management:300, SEO Content:200
\`\`\``
    await message.reply(helpMsg)
    return
  }

  // ========================================
  // CRM COMMANDS
  // ========================================

  // !crm add <slug> <business name> | <contact name> | <email> | <industry> | <monthly value>
  if (content.startsWith("!crm add")) {
    const rest = content.replace("!crm add", "").trim()
    const firstSpace = rest.indexOf(" ")
    
    if (firstSpace === -1) {
      await message.reply("Usage: `!crm add <slug> <business name> | <contact> | <email> | <industry> | <value>`\n\nExample:\n`!crm add lakemurray Lake Murray Landscape | John | john@lake.com | Landscaping | 500`")
      return
    }
    
    const slug = rest.substring(0, firstSpace)
    const parts = rest.substring(firstSpace + 1).split("|").map(p => p.trim())
    
    const client = crm.addClient(slug, {
      businessName: parts[0] || slug,
      contactName: parts[1] || "",
      email: parts[2] || "",
      industry: parts[3] || "",
      monthlyValue: parseInt(parts[4]) || 0,
      website: parts[5] || "",
      wpSlug: slug
    })
    
    await message.reply(`✅ **Added to CRM:** ${client.businessName}\nSlug: \`${slug}\`\nContact: ${client.contactName || "—"}\nStage: 🔵 Lead\nValue: $${client.monthlyValue}/mo\n\nNext: \`!crm stage ${slug} contacted\``)
    return
  }

  // !crm remove <slug>
  if (content.startsWith("!crm remove")) {
    const slug = content.replace("!crm remove", "").trim()
    if (!slug) { await message.reply("Usage: `!crm remove <slug>`"); return }
    await message.reply(crm.removeClient(slug) ? `✅ Removed ${slug}` : `❌ Not found: ${slug}`)
    return
  }

  // !crm view <slug> - View full client details
  if (content.startsWith("!crm view")) {
    const slug = content.replace("!crm view", "").trim()
    if (!slug) { await message.reply("Usage: `!crm view <slug>`"); return }
    
    const client = crm.getClient(slug)
    if (!client) { await message.reply(`❌ Client "${slug}" not found`); return }
    
    const stage = crm.STAGES[client.stage] || { emoji: "❓", name: client.stage }
    const daysSince = Math.round((Date.now() - new Date(client.lastContact).getTime()) / (1000 * 60 * 60 * 24))
    
    let msg = `**${stage.emoji} ${client.businessName}** (\`${slug}\`)\n\n`
    msg += `**Contact:** ${client.contactName || "—"}\n`
    msg += `**Email:** ${client.email || "—"}\n`
    msg += `**Phone:** ${client.phone || "—"}\n`
    msg += `**Industry:** ${client.industry || "—"}\n`
    msg += `**Website:** ${client.website || "—"}\n`
    msg += `**Location:** ${client.location || "—"}\n\n`
    msg += `**Stage:** ${stage.name}\n`
    msg += `**Monthly Value:** $${client.monthlyValue}/mo\n`
    msg += `**Setup Fee:** $${client.setupFee}\n`
    msg += `**Services:** ${client.services.length > 0 ? client.services.join(", ") : "None yet"}\n\n`
    msg += `**Last Contact:** ${daysSince} days ago\n`
    msg += `**Next Follow-up:** ${client.nextFollowUp ? new Date(client.nextFollowUp).toLocaleDateString() : "Not set"}\n`
    msg += `**Added:** ${new Date(client.createdAt).toLocaleDateString()}\n`
    
    if (client.notes.length > 0) {
      msg += `\n**Recent Notes:**\n`
      client.notes.slice(-3).forEach(n => {
        msg += `• _${new Date(n.date).toLocaleDateString()}:_ ${n.text}\n`
      })
    }
    
    await sendLongMessage(message.channel, msg)
    return
  }

  // !crm stage <slug> <stage> - Move client to new stage
  if (content.startsWith("!crm stage")) {
    const parts = content.replace("!crm stage", "").trim().split(" ")
    const slug = parts[0]
    const newStage = parts[1]
    
    if (!slug || !newStage) {
      const stageList = Object.entries(crm.STAGES).map(([k, v]) => `\`${k}\` ${v.emoji} ${v.name}`).join("\n")
      await message.reply(`Usage: \`!crm stage <slug> <stage>\`\n\n**Stages:**\n${stageList}`)
      return
    }
    
    if (!crm.STAGES[newStage]) {
      await message.reply(`❌ Unknown stage: ${newStage}\n\nValid: ${Object.keys(crm.STAGES).join(", ")}`)
      return
    }
    
    const client = crm.updateClient(slug, { stage: newStage })
    if (!client) { await message.reply(`❌ Client "${slug}" not found`); return }
    
    const stage = crm.STAGES[newStage]
    await message.reply(`${stage.emoji} **${client.businessName}** moved to **${stage.name}**`)
    return
  }

  // !crm note <slug> <note text> - Add a note
  if (content.startsWith("!crm note")) {
    const rest = content.replace("!crm note", "").trim()
    const firstSpace = rest.indexOf(" ")
    
    if (firstSpace === -1) {
      await message.reply("Usage: `!crm note <slug> <note text>`")
      return
    }
    
    const slug = rest.substring(0, firstSpace)
    const note = rest.substring(firstSpace + 1)
    
    if (crm.addNote(slug, note)) {
      await message.reply(`📝 Note added to **${slug}**: "${note}"`)
    } else {
      await message.reply(`❌ Client "${slug}" not found`)
    }
    return
  }

  // !crm followup <slug> <when> - Set follow-up date
  if (content.startsWith("!crm followup")) {
    const rest = content.replace("!crm followup", "").trim()
    const firstSpace = rest.indexOf(" ")
    
    if (firstSpace === -1) {
      await message.reply("Usage: `!crm followup <slug> <when>`\n\nExamples:\n`!crm followup lakemurray tomorrow`\n`!crm followup lakemurray next week`\n`!crm followup lakemurray 3 days`\n`!crm followup lakemurray 2026-04-01`")
      return
    }
    
    const slug = rest.substring(0, firstSpace)
    const when = rest.substring(firstSpace + 1)
    
    if (crm.setFollowUp(slug, when)) {
      const client = crm.getClient(slug)
      await message.reply(`📅 Follow-up set for **${client.businessName}**: ${new Date(client.nextFollowUp).toLocaleDateString()}`)
    } else {
      await message.reply(`❌ Could not set follow-up. Check slug and date format.`)
    }
    return
  }

  // !crm services <slug> <service1, service2, ...> - Set services
  if (content.startsWith("!crm services")) {
    const rest = content.replace("!crm services", "").trim()
    const firstSpace = rest.indexOf(" ")
    
    if (firstSpace === -1) {
      await message.reply("Usage: `!crm services <slug> <service1, service2, ...>`\n\nExample:\n`!crm services lakemurray Website Management, SEO Content, AI Chatbot`")
      return
    }
    
    const slug = rest.substring(0, firstSpace)
    const services = rest.substring(firstSpace + 1).split(",").map(s => s.trim())
    
    const client = crm.updateClient(slug, { services })
    if (client) {
      await message.reply(`✅ **${client.businessName}** services updated: ${services.join(", ")}`)
    } else {
      await message.reply(`❌ Client "${slug}" not found`)
    }
    return
  }

  // !crm value <slug> <monthly amount> - Set monthly value
  if (content.startsWith("!crm value")) {
    const parts = content.replace("!crm value", "").trim().split(" ")
    const slug = parts[0]
    const value = parseInt(parts[1])
    
    if (!slug || isNaN(value)) {
      await message.reply("Usage: `!crm value <slug> <monthly amount>`\n\nExample: `!crm value lakemurray 500`")
      return
    }
    
    const client = crm.updateClient(slug, { monthlyValue: value })
    if (client) {
      await message.reply(`💰 **${client.businessName}** value set to **$${value}/mo**`)
    } else {
      await message.reply(`❌ Client "${slug}" not found`)
    }
    return
  }

  // !crm update <slug> <field> <value> - Update any field
  if (content.startsWith("!crm update")) {
    const rest = content.replace("!crm update", "").trim()
    const parts = rest.split(" ")
    const slug = parts[0]
    const field = parts[1]
    const value = parts.slice(2).join(" ")
    
    if (!slug || !field || !value) {
      await message.reply("Usage: `!crm update <slug> <field> <value>`\n\nFields: contactName, email, phone, website, location, industry, setupFee")
      return
    }
    
    const update = {}
    update[field] = field === "setupFee" || field === "monthlyValue" ? parseInt(value) : value
    
    const client = crm.updateClient(slug, update)
    if (client) {
      await message.reply(`✅ **${client.businessName}** — ${field} updated to: ${value}`)
    } else {
      await message.reply(`❌ Client "${slug}" not found`)
    }
    return
  }

  // !pipeline - Show sales pipeline
  if (content === "!pipeline") {
    await sendLongMessage(message.channel, crm.formatPipeline())
    return
  }

  // !followups - Show follow-ups
  if (content === "!followups" || content === "!followup") {
    await message.reply(crm.formatFollowUps())
    return
  }

  // !crm list - List all clients
  if (content === "!crm list" || content === "!crm clients" || content === "!clients") {
    const clients = crm.listAllClients()
    
    if (clients.length === 0) {
      await message.reply("No clients in CRM yet.\n\nAdd one: `!crm add <slug> <business> | <contact> | <email> | <industry> | <value>`")
      return
    }
    
    const list = clients.map(c => crm.formatClientCard(c)).join("\n\n")
    await sendLongMessage(message.channel, `**📇 All Clients (${clients.length})**\n\n${list}`)
    return
  }

  // !crm search <query>
  if (content.startsWith("!crm search")) {
    const query = content.replace("!crm search", "").trim()
    if (!query) { await message.reply("Usage: `!crm search <query>`"); return }
    
    const results = crm.searchClients(query)
    if (results.length === 0) {
      await message.reply(`No clients matching "${query}"`)
      return
    }
    
    const list = results.map(c => crm.formatClientCard(c)).join("\n\n")
    await message.reply(`**🔍 Results for "${query}" (${results.length})**\n\n${list}`)
    return
  }

  // !crm help
  if (content === "!crm help" || content === "!crm") {
    const stats = crm.getDashboardStats()
    const helpMsg = `**📇 CRM** — ${stats.totalClients} clients | $${stats.mrr}/mo MRR

**Clients**
\`!crm add <slug> <biz> | <name> | <email> | <industry> | <value>\`
\`!crm view <slug>\` — Full client details
\`!crm list\` — All clients
\`!crm search <query>\` — Find a client
\`!crm remove <slug>\` — Delete client

**Pipeline**
\`!crm stage <slug> <stage>\` — Move client through pipeline
\`!pipeline\` — View full pipeline
\`!followups\` — See due and upcoming follow-ups

**Client Details**
\`!crm note <slug> <text>\` — Add a note
\`!crm followup <slug> <when>\` — Set follow-up (tomorrow, 3 days, next week)
\`!crm services <slug> <svc1, svc2>\` — Set services
\`!crm value <slug> <amount>\` — Set monthly value
\`!crm update <slug> <field> <value>\` — Update any field

**Stages:** lead → contacted → meeting → proposal → negotiation → signed → active`
    await message.reply(helpMsg)
    return
  }

  // ========================================
  // BILLING COMMANDS
  // ========================================

  // !billing customer <slug> - Create Stripe customer from CRM data
  if (content.startsWith("!billing customer")) {
    const slug = content.replace("!billing customer", "").trim()
    if (!slug) {
      await message.reply("Usage: `!billing customer <slug>`\n\nCreates a Stripe customer using CRM data.")
      return
    }
    
    const client = crm.getClient(slug)
    if (!client) {
      await message.reply(`❌ Client "${slug}" not in CRM. Add with \`!crm add\` first.`)
      return
    }
    
    if (!client.email) {
      await message.reply(`❌ ${client.businessName} has no email. Update with \`!crm update ${slug} email their@email.com\``)
      return
    }
    
    await message.reply(`💳 Creating Stripe customer for **${client.businessName}**...`)
    const result = await billing.createCustomer(slug, client.businessName, client.email)
    
    if (result.success) {
      if (result.existing) {
        await message.reply(`ℹ️ Stripe customer already exists for ${client.businessName}`)
      } else {
        crm.logActivity(slug, "Stripe customer created")
        await message.reply(`✅ Stripe customer created: **${client.businessName}**\nID: ${result.customerId}`)
      }
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !billing subscribe <slug> <service1:price, service2:price>
  if (content.startsWith("!billing subscribe")) {
    const rest = content.replace("!billing subscribe", "").trim()
    const firstSpace = rest.indexOf(" ")
    
    if (firstSpace === -1) {
      await message.reply("Usage: `!billing subscribe <slug> <service1:price, service2:price>`\n\nExample:\n`!billing subscribe lakemurray Website Management:300, SEO Content:200`")
      return
    }
    
    const slug = rest.substring(0, firstSpace)
    const itemsStr = rest.substring(firstSpace + 1)
    
    const items = itemsStr.split(",").map(s => {
      const [name, price] = s.trim().split(":").map(p => p.trim())
      return { name, amount: parseInt(price) || 0 }
    })
    
    const client = crm.getClient(slug)
    const displayName = client ? client.businessName : slug
    
    await message.reply(`💳 Creating subscription for **${displayName}**...\n${items.map(i => `• ${i.name}: $${i.amount}/mo`).join("\n")}`)
    
    const result = await billing.createSubscription(slug, items)
    
    if (result.success) {
      const total = items.reduce((sum, i) => sum + i.amount, 0)
      
      // Update CRM with value and services
      if (client) {
        crm.updateClient(slug, {
          monthlyValue: total,
          services: items.map(i => i.name)
        })
        crm.logActivity(slug, `Subscription created: $${total}/mo`)
      }
      
      await message.reply(`✅ **Subscription active!**\nClient: ${displayName}\nTotal: **$${result.monthlyTotal}/mo**\nStatus: ${result.status}\n\nStripe will auto-charge monthly.`)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !billing invoice <slug> <item1:amount, item2:amount>
  if (content.startsWith("!billing invoice")) {
    const rest = content.replace("!billing invoice", "").trim()
    const firstSpace = rest.indexOf(" ")
    
    if (firstSpace === -1) {
      await message.reply("Usage: `!billing invoice <slug> <item1:amount, item2:amount>`\n\nExample:\n`!billing invoice lakemurray Website Setup:500, First Month SEO:200`")
      return
    }
    
    const slug = rest.substring(0, firstSpace)
    const itemsStr = rest.substring(firstSpace + 1)
    
    const items = itemsStr.split(",").map(s => {
      const parts = s.trim().split(":").map(p => p.trim())
      return { name: parts[0], amount: parseInt(parts[1]) || 0 }
    })
    
    const client = crm.getClient(slug)
    const displayName = client ? client.businessName : slug
    
    await message.reply(`💰 Creating and sending Stripe invoice to **${displayName}**...`)
    
    const result = await billing.createInvoice(slug, items)
    
    if (result.success) {
      if (client) crm.logActivity(slug, `Invoice sent: $${result.total}`)
      await message.reply(`✅ **Invoice sent!**\nClient: ${displayName}\nTotal: **$${result.total}**\nPay link: ${result.hostedUrl}`)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !billing link <name> <amount> - Create payment link (recurring)
  if (content.startsWith("!billing link")) {
    const rest = content.replace("!billing link", "").trim()
    const parts = rest.split("|").map(p => p.trim())
    
    if (parts.length < 2) {
      await message.reply("Usage: `!billing link <name> | <amount> | <recurring: yes/no>`\n\nExample:\n`!billing link Website Management | 300 | yes`")
      return
    }
    
    const [name, amountStr, recurringStr] = parts
    const amount = parseInt(amountStr) || 0
    const recurring = recurringStr !== "no"
    
    await message.reply(`🔗 Creating ${recurring ? "recurring" : "one-time"} payment link...`)
    
    const result = await billing.createPaymentLink(name, amount, { recurring })
    
    if (result.success) {
      await message.reply(`✅ **Payment link created!**\nService: ${name}\nAmount: $${amount}${recurring ? "/mo" : ""}\nLink: ${result.url}`)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !billing cancel <slug>
  if (content.startsWith("!billing cancel")) {
    const slug = content.replace("!billing cancel", "").trim()
    if (!slug) {
      await message.reply("Usage: `!billing cancel <slug>`\n\nCancels at end of current billing period.")
      return
    }
    
    await message.reply(`⚠️ Canceling subscription for **${slug}** at end of period...`)
    const result = await billing.cancelSubscription(slug)
    
    if (result.success) {
      crm.logActivity(slug, "Subscription cancellation requested")
      await message.reply(`✅ ${result.status}`)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !billing info <slug>
  if (content.startsWith("!billing info")) {
    const slug = content.replace("!billing info", "").trim()
    if (!slug) { await message.reply("Usage: `!billing info <slug>`"); return }
    
    const info = billing.getCustomerInfo(slug)
    
    if (!info.customer) {
      await message.reply(`❌ No billing record for "${slug}". Create with \`!billing customer ${slug}\``)
      return
    }
    
    let msg = `**💳 Billing: ${info.customer.name}**\n`
    msg += `Customer ID: ${info.customer.customerId}\n`
    msg += `Email: ${info.customer.email}\n\n`
    
    if (info.subscription) {
      const statusEmoji = info.subscription.status === "active" ? "🟢" : "🔴"
      msg += `**Subscription:** ${statusEmoji} ${info.subscription.status}\n`
      msg += `Monthly: **$${info.subscription.monthlyTotal}/mo**\n`
      info.subscription.items.forEach(i => {
        msg += `• ${i.name}: $${i.amount}\n`
      })
    } else {
      msg += "**Subscription:** None\n"
    }
    
    if (info.invoices.length > 0) {
      msg += `\n**Invoices (${info.invoices.length}):**\n`
      info.invoices.slice(-5).forEach(inv => {
        msg += `• $${inv.total} (${inv.status}) — ${new Date(inv.createdAt).toLocaleDateString()}\n`
      })
    }
    
    await message.reply(msg)
    return
  }

  // !revenue - Full revenue dashboard
  if (content === "!revenue" || content === "!mrr") {
    await message.reply("💰 Pulling revenue data...")
    const dashboard = await billing.formatRevenueDashboard()
    await sendLongMessage(message.channel, dashboard)
    return
  }

  // !billing help
  if (content === "!billing help" || content === "!billing") {
    const helpMsg = `**💳 Billing Manager**

**Setup (per client)**
\`!billing customer <slug>\` — Create Stripe customer from CRM
\`!billing subscribe <slug> <svc:price, svc:price>\` — Start subscription
\`!billing cancel <slug>\` — Cancel subscription

**Payments**
\`!billing invoice <slug> <item:amt, item:amt>\` — Send one-time invoice
\`!billing link <name> | <amount> | <yes/no>\` — Create payment link

**Info**
\`!billing info <slug>\` — Client billing details
\`!revenue\` — Full revenue dashboard

**Workflow:**
\`\`\`
!crm add lakemurray Lake Murray Landscape | John | john@lake.com | Landscaping | 500
!billing customer lakemurray
!billing subscribe lakemurray Website Management:300, SEO Content:200
\`\`\``
    await message.reply(helpMsg)
    return
  }

  // ========================================
  // SOCIAL MEDIA COMMANDS
  // ========================================

  // !social status - Show platform connections
  if (content === "!social status") {
    const status = social.getPlatformStatus()
    const stats = social.getPostStats()
    
    let msg = `**📱 Social Media Manager**\n\n`
    msg += `**Platforms:**\n`
    msg += `${status.twitter ? "✅" : "❌"} X/Twitter ${status.twitter ? "(connected)" : "— add TWITTER_API_KEY to .env"}\n`
    msg += `${status.facebook ? "✅" : "❌"} Facebook ${status.facebook ? "(connected)" : "— add FACEBOOK_PAGE_ID to .env"}\n`
    msg += `${status.linkedin ? "✅" : "❌"} LinkedIn ${status.linkedin ? "(connected)" : "— add LINKEDIN_ACCESS_TOKEN to .env"}\n\n`
    msg += `**Stats:**\n`
    msg += `Today: ${stats.today} | This week: ${stats.thisWeek} | This month: ${stats.thisMonth} | Total: ${stats.total}`
    
    await message.reply(msg)
    return
  }

  // !social post <text> - Post to all platforms
  if (content.startsWith("!social post")) {
    const text = content.replace("!social post", "").trim()
    if (!text) {
      await message.reply("Usage: `!social post <your message>`\n\nPosts to all connected platforms.")
      return
    }
    
    const platforms = social.getConnectedPlatforms()
    if (platforms.length === 0) {
      await message.reply("❌ No platforms connected. Run `!social status` to see setup instructions.")
      return
    }
    
    await message.reply(`📱 Posting to ${platforms.join(", ")}...`)
    const result = await social.postToAll(text)
    
    let msg = `**Post Results:**\n`
    Object.entries(result.results).forEach(([platform, r]) => {
      msg += `${r.success ? "✅" : "❌"} **${platform}** — ${r.success ? (r.url || "Posted") : r.error}\n`
    })
    
    await message.reply(msg)
    return
  }

  // !social tweet <text> - Post to Twitter only
  if (content.startsWith("!social tweet")) {
    const text = content.replace("!social tweet", "").trim()
    if (!text) { await message.reply("Usage: `!social tweet <text>`"); return }
    
    await message.reply("🐦 Posting to X/Twitter...")
    const result = await social.postToTwitter(text)
    await message.reply(result.success ? `✅ Posted: ${result.url}` : `❌ Failed: ${result.error}`)
    return
  }

  // !social facebook <text> - Post to Facebook only
  if (content.startsWith("!social facebook")) {
    const text = content.replace("!social facebook", "").trim()
    if (!text) { await message.reply("Usage: `!social facebook <text>`"); return }
    
    await message.reply("📘 Posting to Facebook...")
    const result = await social.postToFacebook(text)
    await message.reply(result.success ? `✅ Posted: ${result.url}` : `❌ Failed: ${result.error}`)
    return
  }

  // !social linkedin <text> - Post to LinkedIn only
  if (content.startsWith("!social linkedin")) {
    const text = content.replace("!social linkedin", "").trim()
    if (!text) { await message.reply("Usage: `!social linkedin <text>`"); return }
    
    await message.reply("💼 Posting to LinkedIn...")
    const result = await social.postToLinkedIn(text)
    await message.reply(result.success ? `✅ Posted!` : `❌ Failed: ${result.error}`)
    return
  }

  // !social write <topic> - AI writes and posts
  if (content.startsWith("!social write")) {
    const rest = content.replace("!social write", "").trim()
    
    if (!rest) {
      await message.reply("Usage: `!social write <topic>`\n\nExample:\n`!social write Why small businesses need AI chatbots in 2026`\n\nJordan AI writes the post and publishes to all connected platforms.")
      return
    }

    // Check for platform-specific posting
    let platform = "all"
    let topic = rest
    
    const platformPrefixes = ["twitter:", "facebook:", "linkedin:"]
    for (const prefix of platformPrefixes) {
      if (rest.toLowerCase().startsWith(prefix)) {
        platform = prefix.replace(":", "")
        topic = rest.substring(prefix.length).trim()
        break
      }
    }
    
    const platforms = platform === "all" ? social.getConnectedPlatforms() : [platform]
    if (platforms.length === 0) {
      await message.reply("❌ No platforms connected.")
      return
    }
    
    await message.reply(`📝 Writing and posting about "${topic}"...\nPlatform: ${platform === "all" ? platforms.join(", ") : platform}`)
    
    const result = await social.writeAndPost(topic, openai, { platform })
    
    if (result.content) {
      let msg = `**Post content:**\n> ${result.content}\n\n`
      if (result.results) {
        Object.entries(result.results).forEach(([p, r]) => {
          msg += `${r.success ? "✅" : "❌"} **${p}** — ${r.success ? (r.url || "Posted") : r.error}\n`
        })
      } else {
        msg += result.success ? `✅ Posted!${result.url ? ` ${result.url}` : ""}` : `❌ ${result.error}`
      }
      await sendLongMessage(message.channel, msg)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !social batch <topic1> | <topic2> | <topic3>
  if (content.startsWith("!social batch")) {
    const rest = content.replace("!social batch", "").trim()
    
    if (!rest) {
      await message.reply("Usage: `!social batch <topic1> | <topic2> | <topic3>`\n\nExample:\n`!social batch AI chatbots save time | Why SEO matters for local business | Meet our latest client success`")
      return
    }
    
    const topics = rest.split("|").map(t => t.trim()).filter(t => t)
    
    await message.reply(`📱 Writing and posting **${topics.length} posts** to all platforms...\nThis will take a few minutes.`)
    
    const result = await social.batchPost(topics, openai)
    
    let msg = `**Batch Complete:** ${result.posted} posted, ${result.failed} failed\n\n`
    result.results.forEach(r => {
      msg += `${r.success ? "✅" : "❌"} **${r.topic}**\n`
      if (r.content) msg += `> ${r.content.substring(0, 100)}...\n`
    })
    
    await sendLongMessage(message.channel, msg)
    return
  }

  // !social ideas - Generate content ideas
  if (content.startsWith("!social ideas")) {
    const business = content.replace("!social ideas", "").trim() || null
    
    await message.reply("💡 Generating content ideas...")
    const result = await social.generateContentIdeas(business, openai)
    
    if (result.success) {
      await sendLongMessage(message.channel, `**💡 Content Ideas**\n\n${result.ideas}`)
    } else {
      await message.reply(`❌ Failed: ${result.error}`)
    }
    return
  }

  // !social log - Recent posts
  if (content === "!social log") {
    const stats = social.getPostStats()
    
    if (stats.recent.length === 0) {
      await message.reply("No posts yet.")
      return
    }
    
    let msg = `**📱 Recent Posts**\n\nToday: ${stats.today} | Week: ${stats.thisWeek} | Month: ${stats.thisMonth}\n\n`
    stats.recent.forEach(p => {
      msg += `${p.success ? "✅" : "❌"} **${p.platform}** — ${p.content}...\n   ${new Date(p.postedAt).toLocaleString()}${p.url ? ` — ${p.url}` : ""}\n\n`
    })
    
    await message.reply(msg)
    return
  }

  // !social help
  if (content === "!social help" || content === "!social") {
    const connected = social.getConnectedPlatforms()
    const helpMsg = `**📱 Social Media Manager** — ${connected.length} platforms connected

**Post Directly**
\`!social post <text>\` — Post to all platforms
\`!social tweet <text>\` — X/Twitter only
\`!social facebook <text>\` — Facebook only
\`!social linkedin <text>\` — LinkedIn only

**AI-Powered**
\`!social write <topic>\` — AI writes and posts to all
\`!social write twitter: <topic>\` — AI writes for Twitter only
\`!social batch <topic1> | <topic2> | ...\` — AI writes multiple posts
\`!social ideas\` — Generate content ideas

**System**
\`!social status\` — Platform connections and stats
\`!social log\` — Recent posts

**Setup:** Add API keys to .env for each platform. Run \`!social status\` for details.`
    await message.reply(helpMsg)
    return
  }

  // ========================================
  // FULFILLMENT COMMANDS
  // ========================================

  // !fulfill setup - Create all Stripe products from catalog
  if (content === "!fulfill setup") {
    await message.reply("💳 Creating Stripe products for all items in catalog...")
    const results = await fulfill.setupAllProducts()
    
    let msg = "**📦 Product Setup Results:**\n\n"
    results.forEach(r => {
      if (r.status === "created") {
        msg += `✅ **${r.name}** — ${r.url}\n`
      } else if (r.status === "already exists") {
        msg += `ℹ️ **${r.name}** — already set up\n`
      } else {
        msg += `❌ **${r.name}** — ${r.error}\n`
      }
    })
    
    await sendLongMessage(message.channel, msg)
    return
  }

  // !fulfill check - Manually check for new sales
  if (content === "!fulfill check") {
    await message.reply("🔍 Checking Stripe for new sales...")
    const result = await fulfill.checkForNewSales()
    
    if (result.newSales > 0) {
      let msg = `🎉 **${result.newSales} new sale(s) found and delivered!**\n\n`
      result.sales.forEach(s => {
        const product = fulfill.getProduct(s.productSlug)
        msg += `✅ **${product?.name || s.productSlug}** → ${s.email} ($${s.amount})\n`
      })
      await message.reply(msg)
    } else {
      await message.reply("No new sales since last check.")
    }
    return
  }

  // !fulfill deliver <email> <product-slug> - Manual delivery
  if (content.startsWith("!fulfill deliver")) {
    const parts = content.replace("!fulfill deliver", "").trim().split(" ")
    const email = parts[0]
    const slug = parts[1]
    
    if (!email || !slug) {
      await message.reply("Usage: `!fulfill deliver <email> <product-slug>`\n\nExample: `!fulfill deliver john@example.com seo-blueprint`\n\nProduct slugs: " + Object.keys(fulfill.listProducts()).join(", "))
      return
    }
    
    await message.reply(`📧 Delivering **${slug}** to ${email}...`)
    const result = await fulfill.manualDeliver(email, slug)
    await message.reply(result.success ? `✅ Delivered!` : `❌ Failed: ${result.error}`)
    return
  }

  // !fulfill stats - Show sales stats
  if (content === "!fulfill stats" || content === "!sales") {
    const stats = fulfill.getFulfillmentStats()
    
    let msg = `**📦 Product Sales**\n\n`
    msg += `**Today:** ${stats.salesToday} sales ($${stats.revenueToday})\n`
    msg += `**This month:** ${stats.salesThisMonth} sales ($${stats.revenueThisMonth})\n`
    msg += `**All time:** ${stats.totalSales} sales ($${stats.totalRevenue})\n`
    msg += `**Products in catalog:** ${stats.totalProducts}\n`
    
    if (stats.recentSales.length > 0) {
      msg += `\n**Recent Sales:**\n`
      stats.recentSales.forEach(s => {
        msg += `• ${s.productSlug} → ${s.customerEmail} ($${s.amount}) — ${new Date(s.deliveredAt).toLocaleString()}\n`
      })
    }
    
    await message.reply(msg)
    return
  }

  // !fulfill catalog - Show product catalog
  if (content === "!fulfill catalog" || content === "!products") {
    const catalog = fulfill.listProducts()
    const slugs = Object.keys(catalog)
    
    if (slugs.length === 0) {
      await message.reply("No products in catalog. Add with `!fulfill add`")
      return
    }
    
    let msg = `**📦 Product Catalog (${slugs.length} products)**\n\n`
    slugs.forEach(slug => {
      const p = catalog[slug]
      const hasStripe = p.stripePaymentLink ? "✅" : "❌"
      msg += `${hasStripe} **${p.name}** (\`${slug}\`) — $${p.price}\n`
      if (p.stripePaymentLink) msg += `   Link: ${p.stripePaymentLink}\n`
      msg += `   File: ${p.fileName}\n\n`
    })
    
    await sendLongMessage(message.channel, msg)
    return
  }

  // !fulfill help
  if (content === "!fulfill help" || content === "!fulfill") {
    const stats = fulfill.getFulfillmentStats()
    const helpMsg = `**📦 Product Fulfillment** — ${stats.totalSales} sales | $${stats.totalRevenue} revenue

**Setup**
\`!fulfill setup\` — Create Stripe payment links for all products
\`!fulfill catalog\` — View product catalog with links

**Sales**
\`!fulfill check\` — Check for new sales now
\`!fulfill stats\` or \`!sales\` — View sales stats
\`!fulfill deliver <email> <slug>\` — Manual delivery / re-send

**Auto-fulfillment is running** — checks Stripe every 5 minutes. When a sale comes in, the customer gets an email with their download link automatically.

**Product slugs:** ${Object.keys(fulfill.listProducts()).join(", ")}`
    await message.reply(helpMsg)
    return
  }

  // Stock/btcCharlie/tvImport commands moved to stockbot repo

  // X POSTER COMMANDS — !xpost now/status/preview
  if (xPoster.isXPostCommand(content)) {
    await xPoster.handleXPostCommand(message)
    return
  }

  // !help
  if (content === "!help") {
    const crmStats = crm.getDashboardStats()
    const socialPlatforms = social.getConnectedPlatforms()
    const fulfillStats = fulfill.getFulfillmentStats()
    const helpMsg = `**🤖 Jordan AI - CEO Mode**

**Orchestration**
\`!orchestrate <goal>\` — Full orchestration with plan
\`!cycle\` — Run one autonomous cycle
\`!delegate <task>\` — Smart delegation
\`!ask <agent> <task>\` — Direct ask

**Agents**
\`!agents\` — List team with skills

**Skills**
\`!skills\` — List all skills
\`!skill assign <agent> <skill>\` — Give skill

**CRM** (\`!crm help\`) — ${crmStats.totalClients} clients | $${crmStats.mrr}/mo
\`!crm add\` · \`!pipeline\` · \`!followups\`

**Billing** (\`!billing help\`)
\`!billing subscribe\` · \`!billing invoice\` · \`!revenue\`

**Products** (\`!fulfill help\`) — ${fulfillStats.totalSales} sales | $${fulfillStats.totalRevenue}
\`!fulfill setup\` · \`!sales\` · \`!fulfill catalog\`

**WordPress** (\`!wp help\`)
\`!wp post\` · \`!wp drafts\` · \`!wp batch\`

**Email** (\`!email help\`)
\`!email proposal\` · \`!email report\` · \`!email invoice\`

**Social** (\`!social help\`) — ${socialPlatforms.length} platforms
\`!social write\` · \`!social batch\` · \`!social ideas\`

**Agent** (\`!agent help\`)
\`!agent <goal>\` — Give Jordan a goal, watch it work autonomously

**Stocks** (\`!rules show\`)
\`!watchlist add/remove/show\` · \`!scan now\` · \`!alerts on/off\`

**System**
\`!status\` · \`!dashboard\` · \`!review\` · \`!trust\` · \`!remember\` · \`!deploy\`

**AI:** CEO = Claude Sonnet (Opus for proposals) | Workers = GPT-4o-mini

**Pro tip:** You can also just talk to me normally.
I'll use tools automatically when I need to.`
    await message.reply(helpMsg)
    return
  }

  // ========================================
  // AGENT COMMANDS
  // ========================================

  // !agent <goal> - Run the agent with a specific goal (NON-BLOCKING)
  if (content.startsWith("!agent") && content !== "!agent status" && content !== "!agents") {
    let goal = content.replace("!agent", "").trim()
    if (!goal) {
      await message.reply(`**🧠 Agent Mode**\n\nGive Jordan a goal and watch it work autonomously.\n\n**Examples:**\n\`!agent Check on all clients and handle overdue follow-ups\`\n\`!agent Write and publish a blog post about AI for landscaping businesses\`\n\`!agent Review revenue and find the highest impact action for today\`\n\`!agent Onboard lakemurray and create their first 2 blog posts\`\n\n**Status:** \`!agent status\` | **Queue:** \`!queue\``)
      return
    }

    // Attach any Discord file URLs as a direct instruction for the agent
    if (message.attachments.size > 0) {
      const urls = [...message.attachments.values()]
        .map(a => `  filename: "${a.name || "file"}", url: "${a.url}"`)
        .join("\n")
      goal = goal
        + `\n\n[Discord attachments detected — ACTION REQUIRED: call upload_client_assets with the URL below. Do NOT say you cannot see the image. Download it with the tool.]\n`
        + urls
    }

    await message.reply(`🧠 **Agent starting in background...**\nGoal: ${goal.split("\n")[0]}\n\nI'll update this channel as I work. You can keep chatting — I'm not blocked.`)
    
    // Run in background — does NOT block the bot
    agent.runAgent(goal, {
      maxSteps: 15,
      discordNotify: async (msg) => {
        try { await message.channel.send(msg) } catch (err) {}
      }
    }).then(result => {
      if (result.success) {
        message.channel.send(`✅ **Agent finished** — ${result.steps} steps taken\nGoal: ${goal}`)
      } else {
        message.channel.send(`❌ Agent error: ${result.error}`)
      }
    }).catch(err => {
      message.channel.send(`❌ Agent crashed: ${err.message}`)
    })
    
    return
  }

  // !agent status - Show agent status
  if (content === "!agent status") {
    const status = agent.getAgentStatus()
    const queueStatus = taskQueue.getQueueStatus()
    await message.reply(
      `**🧠 Agent Status**\n\n` +
      `Running: ${status.isRunning ? "✅ Yes — " + status.currentGoal : "❌ Idle"}\n` +
      `Runs today: ${status.runsToday}/10\n` +
      `Total runs: ${status.totalRuns}\n` +
      `Last run: ${status.lastRun || "Never"}\n` +
      `Max steps/run: ${status.guardrails.maxStepsPerRun}\n` +
      `Emails this hour: ${status.guardrails.emailsSentThisHour}/10\n\n` +
      `**Sub-agent Queue:**\n` +
      `Queued: ${queueStatus.queued} | Running: ${queueStatus.running} | Completed: ${queueStatus.completed}`
    )
    return
  }

  // !queue - Show task queue status
  if (content === "!queue") {
    await message.reply(taskQueue.formatQueueStatus())
    return
  }

  // !queue clear - Clear the task queue
  if (content === "!queue clear") {
    const cleared = taskQueue.clearQueue()
    await message.reply(`🗑️ Cleared ${cleared} queued tasks`)
    return
  }

  // ========================================
  // NATURAL CONVERSATION (Agent-powered)
  // Jordan AI can now take ACTIONS during chat
  // This is the brain — not just a chatbot
  // ========================================
  
  try {
    // Store conversation history per channel
    if (!conversationHistory.has(message.channel.id)) {
      conversationHistory.set(message.channel.id, [])
    }

    const history = conversationHistory.get(message.channel.id)

    // Keep last 20 messages for context
    if (history.length > 20) {
      history.splice(0, history.length - 20)
    }

    // Append Discord attachments as direct instructions so Jordan uses the tool
    let chatContent = content
    if (message.attachments.size > 0) {
      const urls = [...message.attachments.values()]
        .map(a => `  filename: "${a.name || "file"}", url: "${a.url}"`)
        .join("\n")
      chatContent = content
        + `\n\n[Discord attachments detected — ACTION REQUIRED: call upload_client_assets with the URL below. Do NOT say you cannot see the image. The URL is a direct download link, not something you need to view visually.]\n`
        + urls
    }

    const result = await agent.agentChat(chatContent, history)

    if (result.success) {
      // Update conversation history
      history.push({ role: "user", content: chatContent })
      history.push({ role: "assistant", content: result.response || "✅ Done." })

      // Show what tools were used
      let toolNote = ""
      if (result.toolsUsed.length > 0) {
        const tools = result.toolsUsed.map(t =>
          `${t.result === "success" ? "✅" : t.result === "needs_approval" ? "⚠️" : "❌"} ${t.tool}`
        ).join(", ")
        toolNote = `\n\n_Tools used: ${tools}_`
      }

      // Use fallback message if Claude finished via tools with no text response
      const displayText = result.response || "✅ Done."
      await sendLongMessage(message.channel, displayText + toolNote)
    } else {
      const errDetail = result.response ? ` — ${result.response.substring(0, 200)}` : ""
      await message.channel.send(`I ran into an issue. Try again or use a specific !command.${errDetail}`)
    }
    
  } catch (err) {
    console.log("Chat error:", err.message)
  }
})

// ============================================
// START
// ============================================
client.login(process.env.DISCORD_TOKEN)
