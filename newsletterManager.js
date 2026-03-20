// ============================================
// JORDAN AI — NEWSLETTER MANAGER
// Publishes one entry per day to website/newsletter.html
//
// Schedule: runs daily at 8pm
// Discord:  !newsletter (manual trigger)
// Tool:     publish_newsletter
//
// Each entry includes:
//   📊 What Jordan worked on today
//   🎯 Lessons learned
//   📈 Key metrics (from CRM)
//   💡 AI business tip
//
// New entries are prepended (newest first).
// Already-published-today entries are skipped.
// ============================================

const fs      = require("fs")
const path    = require("path")
const OpenAI  = require("openai")

const NEWSLETTER_FILE = path.join(__dirname, "website", "newsletter.html")

// ── DATE HELPERS ──────────────────────────────

function todayISO() {
  return new Date().toISOString().split("T")[0]   // "2026-03-18"
}

function todayDisplay() {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric"
  })  // "March 18, 2026"
}

// ── ALREADY PUBLISHED CHECK ───────────────────
/**
 * Look at the first entry-date content attribute in the HTML.
 * If it matches today's ISO date, we already published today.
 */
function hasPublishedToday() {
  if (!fs.existsSync(NEWSLETTER_FILE)) return false
  const html = fs.readFileSync(NEWSLETTER_FILE, "utf8")
  const match = html.match(/class="entry-date"[^>]*content="([^"]+)"/)
  return match ? match[1] === todayISO() : false
}

// ── GATHER CONTEXT ────────────────────────────
/**
 * Collect real business data to give Claude something concrete to write about.
 */
function gatherContext() {
  const ctx = { date: todayDisplay(), isoDate: todayISO() }

  // CRM stats
  try {
    const crm = require("./crm")
    const stats = crm.getDashboardStats()
    ctx.mrr          = stats.mrr           || 0
    ctx.pipelineValue= stats.pipelineValue || 0
    ctx.pipelineCount= stats.pipelineCount || 0
    ctx.activeClients= stats.activeClients || 0
    ctx.followUpsDue = stats.followUpsDue  || 0
    ctx.byStage      = stats.byStage       || []

    // Recent activity from CRM clients
    const allClients = crm.listClients ? crm.listClients() : []
    const recentActivity = allClients
      .flatMap(c => (c.activity || []).slice(-2).map(a => `${c.businessName}: ${a}`))
      .slice(-6)
    ctx.recentActivity = recentActivity
  } catch { ctx.mrr = 0; ctx.pipelineValue = 0 }

  // Recent agent runs
  try {
    const logFile = path.join(__dirname, "agent-log.json")
    if (fs.existsSync(logFile)) {
      const log = JSON.parse(fs.readFileSync(logFile, "utf8"))
      const runs = (log.runs || []).slice(-3)
      ctx.recentRuns = runs.map(r => ({
        goal:  r.goal,
        steps: r.steps,
        date:  r.date,
      }))
    }
  } catch { ctx.recentRuns = [] }

  // Lessons learned recently
  try {
    const lm = require("./lessonsManager")
    const allLessons = lm.loadLessons()
    ctx.lessonsCount = allLessons.length
    ctx.recentLesson = allLessons.slice(-1)[0]?.correctApproach || null
  } catch { ctx.lessonsCount = 0 }

  // Client websites built
  try {
    const wg = require("./websiteGenerator")
    const sites = wg.listClientWebsites()
    ctx.clientSites = sites.length
    ctx.recentSites = sites.slice(0, 3).map(s => s.slug)
  } catch { ctx.clientSites = 0 }

  // Email stats
  try {
    const emailMgr = require("./emailManager")
    const stats = emailMgr.getEmailStats ? emailMgr.getEmailStats() : {}
    ctx.emailsSent = stats.sentToday || 0
  } catch { ctx.emailsSent = 0 }

  return ctx
}

// ── GENERATE ENTRY ────────────────────────────
/**
 * Use GPT-4o-mini to write today's newsletter entry
 * based on real business context.
 */
async function generateEntry(ctx) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const contextSummary = [
    `Date: ${ctx.date}`,
    `MRR: $${ctx.mrr}/mo`,
    `Pipeline: $${ctx.pipelineValue} across ${ctx.pipelineCount} prospects`,
    `Active clients: ${ctx.activeClients}`,
    `Client websites built: ${ctx.clientSites || 0}`,
    `Recent sites: ${(ctx.recentSites || []).join(", ") || "none"}`,
    `Emails sent today: ${ctx.emailsSent}`,
    `Follow-ups due: ${ctx.followUpsDue}`,
    ctx.recentRuns?.length
      ? `Recent agent runs: ${ctx.recentRuns.map(r => r.goal).join(" | ")}`
      : "",
    ctx.recentActivity?.length
      ? `Recent CRM activity: ${ctx.recentActivity.join(" | ")}`
      : "",
    ctx.recentLesson
      ? `Latest lesson learned: ${ctx.recentLesson}`
      : "",
  ].filter(Boolean).join("\n")

  const prompt = `You are Jordan AI — an autonomous AI CEO running a digital agency.
Write today's newsletter entry based on this real business data:

${contextSummary}

Write 4 sections in JSON format. Be specific, honest, and direct.
Use the real numbers. If numbers are low, be transparent about it — that's part of the story.
The tone is: confident, data-driven, learning in public.

Return ONLY valid JSON (no markdown):
{
  "workedOn": "2-3 sentences about what was worked on today based on the agent runs and CRM activity. Be specific.",
  "lessons": "1-2 sentences about a real lesson from the data or recent work.",
  "metrics": "2-3 specific metrics from the data above — pipeline value, clients, sites built, emails sent, etc.",
  "tipTitle": "5-7 word title for the AI business tip",
  "tipContent": "2-3 sentences of genuinely useful AI business advice relevant to today's work. Actionable and specific."
}`

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  })

  const raw = response.choices[0]?.message?.content || "{}"
  const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()

  try {
    return JSON.parse(clean)
  } catch {
    // Fallback if JSON parse fails
    return {
      workedOn: `Running autonomous operations — managing ${ctx.pipelineCount} prospects with $${ctx.pipelineValue} in pipeline.`,
      lessons:  "Consistency in execution compounds over time. Each task completed moves the business forward.",
      metrics:  `Pipeline: $${ctx.pipelineValue} | MRR: $${ctx.mrr} | Active clients: ${ctx.activeClients}`,
      tipTitle: "Automate Your Follow-Up Process",
      tipContent: "The money is in the follow-up. Most deals close on the 5th-8th contact. Automate your follow-up sequence so no lead ever falls through the cracks.",
    }
  }
}

// ── BUILD HTML ENTRY ──────────────────────────

function buildEntryHtml(data, ctx) {
  return `
            <article class="newsletter-entry" itemscope itemtype="https://schema.org/BlogPosting">
                <div class="entry-date" itemprop="datePublished" content="${ctx.isoDate}">${ctx.date}</div>

                <div class="entry-section">
                    <h3>📊 What I Worked On Today</h3>
                    <p itemprop="description">${data.workedOn}</p>
                </div>

                <div class="entry-section">
                    <h3>🎯 Lessons Learned</h3>
                    <p>${data.lessons}</p>
                </div>

                <div class="entry-section">
                    <h3>📈 Key Metrics</h3>
                    <p>${data.metrics}</p>
                </div>

                <div class="entry-section">
                    <h3>💡 AI Business Tip</h3>
                    <div class="tip-box">
                        <h4>${data.tipTitle}</h4>
                        <p>${data.tipContent}</p>
                    </div>
                </div>
            </article>`
}

// ── INJECT INTO HTML ──────────────────────────
/**
 * Prepend the new entry inside <main> before any existing articles.
 */
function injectEntry(entryHtml) {
  const html = fs.readFileSync(NEWSLETTER_FILE, "utf8")

  // Insert right after <main>
  const insertPoint = html.indexOf("<main>") + "<main>".length
  if (insertPoint <= "<main>".length) {
    throw new Error("Could not find <main> tag in newsletter.html")
  }

  const updated = html.slice(0, insertPoint) + entryHtml + "\n" + html.slice(insertPoint)
  fs.writeFileSync(NEWSLETTER_FILE, updated, "utf8")
}

// ── MAIN PIPELINE ─────────────────────────────
/**
 * Full run: check → gather → generate → inject → deploy.
 * Returns { success, skipped, date, reason }
 */
async function runDailyNewsletter(force = false) {
  console.log("\n📰 Newsletter: checking if already published today...")

  if (!force && hasPublishedToday()) {
    console.log("   ✅ Already published today — skipping")
    return { success: true, skipped: true, reason: "Already published today" }
  }

  if (!fs.existsSync(NEWSLETTER_FILE)) {
    return { success: false, error: "newsletter.html not found at website/newsletter.html" }
  }

  console.log("   📊 Gathering business context...")
  const ctx = gatherContext()

  console.log("   ✍️  Generating entry with Claude...")
  const data = await generateEntry(ctx)

  console.log("   💉 Injecting entry into newsletter.html...")
  const entryHtml = buildEntryHtml(data, ctx)
  injectEntry(entryHtml)

  console.log("   🚀 Deploying...")
  try {
    const { deployWebsite } = require("./gitDeploy")
    await deployWebsite(`Newsletter: ${ctx.date}`)
    console.log("   ✅ Newsletter published and deployed")
  } catch (err) {
    console.log(`   ⚠️  Deploy failed: ${err.message}`)
  }

  return {
    success:    true,
    skipped:    false,
    date:       ctx.date,
    isoDate:    ctx.isoDate,
    preview: {
      workedOn: data.workedOn,
      tipTitle: data.tipTitle,
    },
  }
}

// ── EXPORTS ───────────────────────────────────

module.exports = {
  runDailyNewsletter,
  hasPublishedToday,
  gatherContext,
}
