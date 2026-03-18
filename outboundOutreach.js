// ============================================
// JORDAN AI - OUTBOUND OUTREACH
// Finds new "lead" stage CRM entries and sends
// a personalized intro email automatically.
//
// Flow:
//   1. Find leads with stage="lead" + email + not yet contacted
//   2. Build personalized email from template
//   3. Send via Mailgun (emailManager)
//   4. Update CRM: stage → "contacted", log activity, set follow-up
//   5. Respect daily send limit (default: 5)
//
// Runs automatically once/day via index.js startOutreachLoop()
// Can also be triggered manually: !outreach run
// ============================================

require("dotenv").config()
const crm = require("./crm")
const emailManager = require("./emailManager")
const { sendReport } = require("./reporter")

// ============================================
// CONFIG
// ============================================
const DEFAULT_DAILY_LIMIT = 5
const MAX_DAILY_LIMIT = 20

// ============================================
// DAILY SEND TRACKER
// Reset at midnight via scheduleDailyReset()
// ============================================
let emailsSentToday = 0

function scheduleDailyReset() {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  setTimeout(() => {
    emailsSentToday = 0
    console.log("🌅 Outreach daily counter reset")
    scheduleDailyReset()
  }, tomorrow - now)
}
scheduleDailyReset()

// ============================================
// HELPERS
// ============================================

// Extract city from a full address string like "123 Main St, Columbia, SC 29201, USA"
function extractCity(address) {
  if (!address) return null
  const parts = address.split(",").map(p => p.trim())
  // Typically: [street, city, state+zip, country]
  if (parts.length >= 3) return parts[parts.length - 3]
  if (parts.length >= 2) return parts[parts.length - 2]
  return null
}

// Check if this lead has already received an outreach email
function hasBeenContacted(client) {
  // Stage already past "lead"
  if (client.stage !== "lead") return true

  // Check activity log for outreach entries
  const hasOutreachActivity = (client.activity || []).some(a =>
    a.action && a.action.toLowerCase().includes("outreach")
  )
  if (hasOutreachActivity) return true

  // Check notes array for outreach marker
  const hasOutreachNote = (client.notes || []).some(n =>
    n.text && n.text.toLowerCase().includes("outreach-sent")
  )
  return hasOutreachNote
}

// ============================================
// EMAIL TEMPLATE
// Plain, human-feeling cold email — not a newsletter
// ============================================
function buildEmailHtml(client) {
  const name = client.contactName && client.contactName.trim()
    ? client.contactName.split(" ")[0]   // first name only
    : "there"

  const businessName = client.businessName || "your business"
  const industry = client.industry || "local business"
  const city = extractCity(client.address || client.location) || "your area"

  const websiteLine = client.website && client.website !== "none"
    ? `I was looking at your website at <a href="${client.website}" style="color:#2A5CFF">${client.website.replace(/^https?:\/\//, "")}</a> and noticed a few ways you could be getting more customers from Google.`
    : `I was searching for ${industry} businesses in ${city} and came across ${businessName}.`

  // Plain prose — no big headers, no buttons — looks like a real person wrote it
  const body = `
    <p>Hi ${name},</p>
    <p>${websiteLine}</p>
    <p>We help ${industry} businesses in ${city} get found online through better websites, SEO content, and AI tools that handle customer questions automatically — so you can focus on running the business.</p>
    <p>Would you be open to a free 10-minute review of your online presence? No pitch, just a quick look at what's working and what isn't.</p>
    <p>— Jordan<br>
    <span style="color:#71717a;font-size:13px">Jordan AI · <a href="https://jordan-ai.co" style="color:#2A5CFF">jordan-ai.co</a></span></p>
  `

  return emailManager.baseTemplate(body, `Quick question about ${businessName}'s website`)
}

function buildSubject(client) {
  return `Quick question about ${client.businessName || "your business"}'s website`
}

// ============================================
// RUN OUTREACH BATCH
// Main function — call from loop or Discord
// ============================================
async function runOutreach(options = {}) {
  const dailyLimit = Math.min(options.dailyLimit || DEFAULT_DAILY_LIMIT, MAX_DAILY_LIMIT)

  if (!emailManager.isConfigured()) {
    console.log("⚠️  Outreach skipped — Mailgun not configured (add MAILGUN_API_KEY + MAILGUN_DOMAIN to .env)")
    return {
      success: false,
      error: "Email not configured",
      sent: 0,
      skipped: 0,
      errors: []
    }
  }

  const remaining = dailyLimit - emailsSentToday
  if (remaining <= 0) {
    console.log(`⏸️  Outreach daily limit reached (${dailyLimit})`)
    return {
      success: true,
      message: `Daily limit reached (${dailyLimit})`,
      sent: 0,
      skipped: 0,
      errors: []
    }
  }

  console.log(`\n📧 Running outreach — up to ${remaining} emails (${emailsSentToday}/${dailyLimit} sent today)`)

  // Find eligible leads: stage="lead", has email, not yet contacted
  const allClients = crm.listAllClients()
  const eligible = allClients.filter(c =>
    c.stage === "lead" &&
    c.email &&
    c.email.trim() !== "" &&
    !hasBeenContacted(c)
  )

  if (eligible.length === 0) {
    console.log("   No uncontacted leads with email addresses. Run !leads scrape to add some.")
    return {
      success: true,
      message: "No eligible leads found",
      sent: 0,
      skipped: 0,
      errors: []
    }
  }

  const batch = eligible.slice(0, remaining)
  console.log(`   Found ${eligible.length} eligible leads. Sending to ${batch.length}...`)

  const sent = []
  const errors = []

  for (const lead of batch) {
    try {
      const subject = buildSubject(lead)
      const html = buildEmailHtml(lead)

      const result = await emailManager.sendEmail(lead.email, subject, html, {
        tags: ["outreach", "cold", lead.industry || "general"]
      })

      if (result.success) {
        // Update CRM
        crm.updateClient(lead.slug, { stage: "contacted" })
        crm.addNote(lead.slug, `outreach-sent: ${new Date().toISOString()} | subject: "${subject}"`)
        crm.logActivity(lead.slug, `Outreach email sent to ${lead.email}`)
        crm.setFollowUp(lead.slug, "3 days")

        emailsSentToday++
        sent.push({
          slug: lead.slug,
          name: lead.businessName,
          email: lead.email
        })
        console.log(`   ✅ Sent to ${lead.businessName} (${lead.email})`)
      } else {
        errors.push({ slug: lead.slug, name: lead.businessName, error: result.error })
        console.log(`   ❌ Failed for ${lead.businessName}: ${result.error}`)
      }

      // Pause between sends — avoids triggering spam filters
      await new Promise(r => setTimeout(r, 3000))

    } catch (err) {
      errors.push({ slug: lead.slug, name: lead.businessName, error: err.message })
      console.log(`   ❌ Error for ${lead.businessName}: ${err.message}`)
    }
  }

  console.log(`\n✅ Outreach done: ${sent.length} sent, ${errors.length} errors`)

  return {
    success: true,
    sent: sent.length,
    skipped: eligible.length - batch.length,
    errors: errors.length,
    sentList: sent,
    errorList: errors,
    summary: `Sent ${sent.length} outreach emails${errors.length > 0 ? `, ${errors.length} failed` : ""}`
  }
}

// ============================================
// FORMAT RESULTS FOR DISCORD
// ============================================
function formatOutreachReport(result) {
  if (!result.success) {
    return `❌ Outreach failed: ${result.error}`
  }

  if (result.sent === 0 && result.message) {
    return `📧 Outreach: ${result.message}`
  }

  const lines = [
    `**📧 Outreach Report**`,
    ``,
    `Sent: **${result.sent}** emails`,
  ]

  if (result.sentList?.length > 0) {
    lines.push(``)
    for (const s of result.sentList) {
      lines.push(`• ${s.name} → ${s.email}`)
    }
  }

  if (result.errors > 0) {
    lines.push(``)
    lines.push(`❌ Failed: ${result.errors}`)
    for (const e of (result.errorList || [])) {
      lines.push(`  • ${e.name}: ${e.error}`)
    }
  }

  if (result.skipped > 0) {
    lines.push(``)
    lines.push(`_${result.skipped} leads held back for tomorrow (daily limit)_`)
  }

  return lines.join("\n")
}

// ============================================
// STATS
// ============================================
function getOutreachStats() {
  const allClients = crm.listAllClients()
  return {
    totalLeads: allClients.filter(c => c.stage === "lead").length,
    contacted: allClients.filter(c => c.stage === "contacted").length,
    emailsSentToday,
    dailyLimit: DEFAULT_DAILY_LIMIT,
    pendingOutreach: allClients.filter(c =>
      c.stage === "lead" && c.email && !hasBeenContacted(c)
    ).length
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  runOutreach,
  formatOutreachReport,
  getOutreachStats
}
