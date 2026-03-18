// ============================================
// JORDAN AI - FOLLOW-UP SYSTEM
// Automatically follows up with leads that
// haven't responded after 3 days.
//
// Flow:
//   1. Find stage="contacted" leads where last email was 3+ days ago
//   2. If follow-up count < 2: send follow-up email, reset 3-day clock
//   3. If follow-up count >= 2: move to stage="cold" (done chasing)
//   4. Respect daily send limit (default: 5)
//
// Follow-up count is tracked via activity log entries
// containing "Follow-up sent".
//
// Runs automatically once/day at 10am via index.js startFollowUpLoop()
// Can also be triggered manually: !followup run
// ============================================

require("dotenv").config()
const crm = require("./crm")
const emailManager = require("./emailManager")

// ============================================
// CONFIG
// ============================================
const DAYS_BEFORE_FOLLOWUP = 3
const MAX_FOLLOWUPS_PER_LEAD = 2   // after this many, move to cold
const DEFAULT_DAILY_LIMIT = 5
const MAX_DAILY_LIMIT = 20

// ============================================
// DAILY COUNTER — resets at midnight
// ============================================
let followUpsSentToday = 0

function scheduleDailyReset() {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  setTimeout(() => {
    followUpsSentToday = 0
    console.log("🌅 Follow-up daily counter reset")
    scheduleDailyReset()
  }, tomorrow - now)
}
scheduleDailyReset()

// ============================================
// HELPERS
// ============================================

// Days elapsed since a Date object
function daysSince(date) {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
}

// Find the timestamp of the most recent email we sent to this lead
// (checks activity log for outreach or follow-up entries)
function getLastEmailDate(client) {
  const emailActivities = (client.activity || []).filter(a =>
    a.action?.includes("Outreach email sent") ||
    a.action?.includes("Follow-up sent")
  )
  if (emailActivities.length === 0) return null
  return emailActivities.reduce((latest, a) => {
    const d = new Date(a.date)
    return d > latest ? d : latest
  }, new Date(0))
}

// Count how many follow-ups (not counting the initial outreach) we've sent
function getFollowUpCount(client) {
  return (client.activity || []).filter(a =>
    a.action?.includes("Follow-up sent")
  ).length
}

// Extract first name from contactName, fall back to "there"
function firstName(client) {
  if (!client.contactName || !client.contactName.trim()) return "there"
  return client.contactName.trim().split(" ")[0]
}

// ============================================
// EMAIL TEMPLATE
// Plain, human-feeling follow-up — not a newsletter
// ============================================
function buildFollowUpHtml(client, followUpNumber) {
  const name = firstName(client)
  const businessName = client.businessName || "your business"

  // Slightly vary the message on the second follow-up so it doesn't feel robotic
  const body = followUpNumber === 1
    ? `
      <p>Hi ${name},</p>
      <p>Just wanted to follow up on my note from a few days ago.</p>
      <p>I put together a quick analysis of how ${businessName} could get more customers from Google. Happy to share it if you're interested.</p>
      <p>No pressure either way.</p>
      <p>— Jordan<br>
      <span style="color:#71717a;font-size:13px">Jordan AI · <a href="https://jordan-ai.co" style="color:#2A5CFF">jordan-ai.co</a></span></p>
    `
    : `
      <p>Hi ${name},</p>
      <p>Last message from me on this — I don't want to be a bother.</p>
      <p>If the timing isn't right for ${businessName}, no worries at all. Feel free to reach out whenever it makes sense.</p>
      <p>— Jordan<br>
      <span style="color:#71717a;font-size:13px">Jordan AI · <a href="https://jordan-ai.co" style="color:#2A5CFF">jordan-ai.co</a></span></p>
    `

  return emailManager.baseTemplate(body, `Following up — ${businessName}`)
}

function buildSubject(client) {
  return `Following up - ${client.businessName || "your business"}`
}

// ============================================
// RUN FOLLOW-UP BATCH
// Main function — call from loop or Discord
// ============================================
async function runFollowUps(options = {}) {
  const dailyLimit = Math.min(options.dailyLimit || DEFAULT_DAILY_LIMIT, MAX_DAILY_LIMIT)

  if (!emailManager.isConfigured()) {
    console.log("⚠️  Follow-ups skipped — email not configured")
    return { success: false, error: "Email not configured", sent: 0, movedToCold: 0, errors: [] }
  }

  const remaining = dailyLimit - followUpsSentToday
  if (remaining <= 0) {
    console.log(`⏸️  Follow-up daily limit reached (${dailyLimit})`)
    return { success: true, message: `Daily limit reached (${dailyLimit})`, sent: 0, movedToCold: 0, errors: [] }
  }

  console.log(`\n🔁 Running follow-up check — up to ${remaining} emails (${followUpsSentToday}/${dailyLimit} sent today)`)

  // Find eligible: stage="contacted", has email, last email was 3+ days ago
  const allClients = crm.listAllClients()
  const eligible = allClients.filter(c => {
    if (c.stage !== "contacted") return false
    if (!c.email || !c.email.trim()) return false
    const lastEmail = getLastEmailDate(c)
    if (!lastEmail) return false
    return daysSince(lastEmail) >= DAYS_BEFORE_FOLLOWUP
  })

  if (eligible.length === 0) {
    console.log("   No leads ready for follow-up yet.")
    return { success: true, message: "No leads ready for follow-up", sent: 0, movedToCold: 0, errors: [] }
  }

  console.log(`   Found ${eligible.length} lead(s) ready for follow-up.`)

  const sent = []
  const movedToCold = []
  const errors = []

  for (const lead of eligible) {
    // Stop if we've hit today's limit
    if (followUpsSentToday >= dailyLimit) break

    const followUpCount = getFollowUpCount(lead)

    // Already had 2 follow-ups with no response → move to cold
    if (followUpCount >= MAX_FOLLOWUPS_PER_LEAD) {
      crm.updateClient(lead.slug, { stage: "cold" })
      crm.logActivity(lead.slug, `Moved to cold — ${MAX_FOLLOWUPS_PER_LEAD} follow-ups sent with no response`)
      movedToCold.push({ slug: lead.slug, name: lead.businessName })
      console.log(`   🧊 ${lead.businessName} → cold (no response after ${MAX_FOLLOWUPS_PER_LEAD} follow-ups)`)
      continue
    }

    // Send follow-up
    try {
      const followUpNumber = followUpCount + 1  // 1 or 2
      const subject = buildSubject(lead)
      const html = buildFollowUpHtml(lead, followUpNumber)

      const result = await emailManager.sendEmail(lead.email, subject, html, {
        tags: ["follow-up", `follow-up-${followUpNumber}`]
      })

      if (result.success) {
        // Log the activity (this is how we track follow-up count and reset the 3-day clock)
        crm.logActivity(lead.slug, `Follow-up sent to ${lead.email} (follow-up #${followUpNumber})`)
        crm.addNote(lead.slug, `follow-up-${followUpNumber}: ${new Date().toISOString()}`)
        // Reset the 3-day follow-up clock
        crm.setFollowUp(lead.slug, `${DAYS_BEFORE_FOLLOWUP} days`)

        followUpsSentToday++
        sent.push({ slug: lead.slug, name: lead.businessName, email: lead.email, followUpNumber })
        console.log(`   ✅ Follow-up #${followUpNumber} sent to ${lead.businessName} (${lead.email})`)
      } else {
        errors.push({ slug: lead.slug, name: lead.businessName, error: result.error })
        console.log(`   ❌ Failed for ${lead.businessName}: ${result.error}`)
      }

      // Pause between sends
      await new Promise(r => setTimeout(r, 3000))

    } catch (err) {
      errors.push({ slug: lead.slug, name: lead.businessName, error: err.message })
      console.log(`   ❌ Error for ${lead.businessName}: ${err.message}`)
    }
  }

  console.log(`\n✅ Follow-up run done: ${sent.length} sent, ${movedToCold.length} moved to cold, ${errors.length} errors`)

  return {
    success: true,
    sent: sent.length,
    movedToCold: movedToCold.length,
    errors: errors.length,
    sentList: sent,
    movedToColdList: movedToCold,
    errorList: errors,
    summary: `Sent ${sent.length} follow-up${sent.length !== 1 ? "s" : ""}${movedToCold.length > 0 ? `, ${movedToCold.length} moved to cold` : ""}${errors.length > 0 ? `, ${errors.length} errors` : ""}`
  }
}

// ============================================
// FORMAT RESULTS FOR DISCORD
// ============================================
function formatFollowUpReport(result) {
  if (!result.success) return `❌ Follow-up failed: ${result.error}`
  if (result.sent === 0 && result.movedToCold === 0 && result.message) {
    return `🔁 Follow-ups: ${result.message}`
  }

  const lines = [`**🔁 Follow-Up Report**`, ``]

  if (result.sent > 0) {
    lines.push(`Sent **${result.sent}** follow-up email${result.sent !== 1 ? "s" : ""}:`)
    for (const s of (result.sentList || [])) {
      lines.push(`• ${s.name} → follow-up #${s.followUpNumber}`)
    }
  }

  if (result.movedToCold > 0) {
    lines.push(``)
    lines.push(`🧊 Moved **${result.movedToCold}** to cold (no response after ${MAX_FOLLOWUPS_PER_LEAD} follow-ups):`)
    for (const c of (result.movedToColdList || [])) {
      lines.push(`• ${c.name}`)
    }
  }

  if (result.errors > 0) {
    lines.push(``)
    lines.push(`❌ Errors: ${result.errors}`)
  }

  return lines.join("\n")
}

// ============================================
// STATS
// ============================================
function getFollowUpStats() {
  const allClients = crm.listAllClients()
  const contacted = allClients.filter(c => c.stage === "contacted")
  const readyForFollowUp = contacted.filter(c => {
    if (!c.email) return false
    const lastEmail = getLastEmailDate(c)
    if (!lastEmail) return false
    return daysSince(lastEmail) >= DAYS_BEFORE_FOLLOWUP
  })
  const cold = allClients.filter(c => c.stage === "cold")

  return {
    contacted: contacted.length,
    readyForFollowUp: readyForFollowUp.length,
    cold: cold.length,
    followUpsSentToday,
    dailyLimit: DEFAULT_DAILY_LIMIT,
    daysBeforeFollowUp: DAYS_BEFORE_FOLLOWUP,
    maxFollowUps: MAX_FOLLOWUPS_PER_LEAD
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  runFollowUps,
  formatFollowUpReport,
  getFollowUpStats
}
