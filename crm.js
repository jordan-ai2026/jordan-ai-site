// ============================================
// JORDAN AI - CRM (Client Relationship Manager)
// Full client database with pipeline tracking
//
// Every client record stores:
// - Contact info (name, email, phone)
// - Business details (name, industry, website)
// - Deal info (services, monthly value, status)
// - Pipeline stage (lead → meeting → proposal → signed → active)
// - Notes and activity log
// - WordPress slug (links to wordpressManager)
// - Dates (created, last contact, next follow-up)
// ============================================

const fs = require("fs")
const path = require("path")

const CRM_FILE = path.join(__dirname, "crm.json")

// ============================================
// PIPELINE STAGES
// ============================================
const STAGES = {
  lead: { name: "Lead", emoji: "🔵", order: 1 },
  contacted: { name: "Contacted", emoji: "📞", order: 2 },
  meeting: { name: "Meeting Set", emoji: "📅", order: 3 },
  proposal: { name: "Proposal Sent", emoji: "📄", order: 4 },
  negotiation: { name: "Negotiation", emoji: "🤝", order: 5 },
  signed: { name: "Signed", emoji: "✅", order: 6 },
  active: { name: "Active Client", emoji: "🟢", order: 7 },
  paused: { name: "Paused", emoji: "⏸️", order: 8 },
  lost: { name: "Lost", emoji: "❌", order: 9 }
}

// ============================================
// DATABASE OPERATIONS
// ============================================
function loadCRM() {
  try {
    if (fs.existsSync(CRM_FILE)) {
      return JSON.parse(fs.readFileSync(CRM_FILE, "utf8"))
    }
  } catch (err) {
    console.log("CRM load error:", err.message)
  }
  return { clients: {}, nextId: 1 }
}

function saveCRM(data) {
  fs.writeFileSync(CRM_FILE, JSON.stringify(data, null, 2))
}

// ============================================
// ADD CLIENT
// ============================================
function addClient(slug, info) {
  const crm = loadCRM()
  
  crm.clients[slug] = {
    id: crm.nextId++,
    slug,
    
    // Contact
    contactName: info.contactName || "",
    email: info.email || "",
    phone: info.phone || "",
    
    // Business
    businessName: info.businessName || "",
    industry: info.industry || "",
    website: info.website || "",
    location: info.location || "",
    
    // Deal
    services: info.services || [],
    monthlyValue: info.monthlyValue || 0,
    setupFee: info.setupFee || 0,
    
    // Pipeline
    stage: info.stage || "lead",
    
    // WordPress link
    wpSlug: info.wpSlug || slug,
    
    // Dates
    createdAt: new Date().toISOString(),
    lastContact: new Date().toISOString(),
    nextFollowUp: info.nextFollowUp || null,
    signedAt: null,
    
    // Activity
    notes: [],
    activity: [{
      date: new Date().toISOString(),
      action: "Client added to CRM",
      auto: true
    }]
  }
  
  saveCRM(crm)
  console.log(`✅ CRM: Added ${info.businessName || slug}`)
  return crm.clients[slug]
}

// ============================================
// UPDATE CLIENT
// ============================================
function updateClient(slug, updates) {
  const crm = loadCRM()
  if (!crm.clients[slug]) return null
  
  // Track stage changes
  if (updates.stage && updates.stage !== crm.clients[slug].stage) {
    crm.clients[slug].activity.push({
      date: new Date().toISOString(),
      action: `Stage changed: ${crm.clients[slug].stage} → ${updates.stage}`,
      auto: true
    })
    
    if (updates.stage === "signed") {
      crm.clients[slug].signedAt = new Date().toISOString()
    }
  }
  
  Object.assign(crm.clients[slug], updates)
  crm.clients[slug].lastContact = new Date().toISOString()
  
  saveCRM(crm)
  return crm.clients[slug]
}

// ============================================
// GET CLIENT
// ============================================
function getClient(slug) {
  const crm = loadCRM()
  return crm.clients[slug] || null
}

// ============================================
// REMOVE CLIENT
// ============================================
function removeClient(slug) {
  const crm = loadCRM()
  if (!crm.clients[slug]) return false
  delete crm.clients[slug]
  saveCRM(crm)
  return true
}

// ============================================
// LIST ALL CLIENTS
// ============================================
function listAllClients() {
  const crm = loadCRM()
  return Object.values(crm.clients).sort((a, b) => {
    const stageA = STAGES[a.stage]?.order || 99
    const stageB = STAGES[b.stage]?.order || 99
    return stageA - stageB
  })
}

// ============================================
// ADD NOTE
// ============================================
function addNote(slug, note) {
  const crm = loadCRM()
  if (!crm.clients[slug]) return false
  
  crm.clients[slug].notes.push({
    date: new Date().toISOString(),
    text: note
  })
  
  crm.clients[slug].activity.push({
    date: new Date().toISOString(),
    action: `Note added: ${note.substring(0, 50)}...`,
    auto: false
  })
  
  crm.clients[slug].lastContact = new Date().toISOString()
  saveCRM(crm)
  return true
}

// ============================================
// LOG ACTIVITY
// ============================================
function logActivity(slug, action) {
  const crm = loadCRM()
  if (!crm.clients[slug]) return false
  
  crm.clients[slug].activity.push({
    date: new Date().toISOString(),
    action,
    auto: true
  })
  
  saveCRM(crm)
  return true
}

// ============================================
// SET FOLLOW-UP DATE
// ============================================
function setFollowUp(slug, dateStr) {
  const crm = loadCRM()
  if (!crm.clients[slug]) return false
  
  // Parse date - accepts "tomorrow", "next week", "3 days", or a date
  let followDate = null
  const now = new Date()
  
  if (dateStr === "tomorrow") {
    followDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  } else if (dateStr === "next week") {
    followDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  } else if (dateStr.match(/^(\d+)\s*days?$/)) {
    const days = parseInt(dateStr.match(/^(\d+)/)[1])
    followDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  } else {
    followDate = new Date(dateStr)
    if (isNaN(followDate.getTime())) return false
  }
  
  crm.clients[slug].nextFollowUp = followDate.toISOString()
  
  crm.clients[slug].activity.push({
    date: new Date().toISOString(),
    action: `Follow-up set for ${followDate.toLocaleDateString()}`,
    auto: false
  })
  
  saveCRM(crm)
  return true
}

// ============================================
// PIPELINE VIEW
// ============================================
function getPipeline() {
  const clients = listAllClients()
  const pipeline = {}
  
  Object.keys(STAGES).forEach(stage => {
    pipeline[stage] = {
      ...STAGES[stage],
      clients: clients.filter(c => c.stage === stage)
    }
  })
  
  return pipeline
}

// ============================================
// GET FOLLOW-UPS DUE
// ============================================
function getFollowUpsDue() {
  const clients = listAllClients()
  const now = new Date()
  
  return clients.filter(c => {
    if (!c.nextFollowUp) return false
    return new Date(c.nextFollowUp) <= now
  }).sort((a, b) => new Date(a.nextFollowUp) - new Date(b.nextFollowUp))
}

// ============================================
// GET UPCOMING FOLLOW-UPS
// ============================================
function getUpcomingFollowUps(days = 7) {
  const clients = listAllClients()
  const now = new Date()
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  
  return clients.filter(c => {
    if (!c.nextFollowUp) return false
    const followDate = new Date(c.nextFollowUp)
    return followDate > now && followDate <= future
  }).sort((a, b) => new Date(a.nextFollowUp) - new Date(b.nextFollowUp))
}

// ============================================
// DASHBOARD STATS
// ============================================
function getDashboardStats() {
  const clients = listAllClients()
  
  const activeClients = clients.filter(c => c.stage === "active")
  const mrr = activeClients.reduce((sum, c) => sum + (c.monthlyValue || 0), 0)
  const pipelineValue = clients
    .filter(c => !["active", "lost", "paused"].includes(c.stage))
    .reduce((sum, c) => sum + (c.monthlyValue || 0), 0)
  
  const followUpsDue = getFollowUpsDue()
  const stagnant = clients.filter(c => {
    if (["active", "lost", "paused"].includes(c.stage)) return false
    const lastContact = new Date(c.lastContact)
    const daysSince = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
    return daysSince > 7
  })
  
  return {
    totalClients: clients.length,
    activeClients: activeClients.length,
    mrr,
    arr: mrr * 12,
    pipelineValue,
    pipelineCount: clients.filter(c => !["active", "lost", "paused"].includes(c.stage)).length,
    followUpsDue: followUpsDue.length,
    stagnantDeals: stagnant.length,
    byStage: Object.keys(STAGES).map(s => ({
      stage: s,
      ...STAGES[s],
      count: clients.filter(c => c.stage === s).length
    })).filter(s => s.count > 0)
  }
}

// ============================================
// SEARCH CLIENTS
// ============================================
function searchClients(query) {
  const clients = listAllClients()
  const q = query.toLowerCase()
  
  return clients.filter(c => 
    c.contactName.toLowerCase().includes(q) ||
    c.businessName.toLowerCase().includes(q) ||
    c.email.toLowerCase().includes(q) ||
    c.industry.toLowerCase().includes(q) ||
    c.slug.toLowerCase().includes(q)
  )
}

// ============================================
// FORMAT CLIENT CARD (for Discord)
// ============================================
function formatClientCard(client) {
  const stage = STAGES[client.stage] || { emoji: "❓", name: client.stage }
  const daysSinceContact = Math.round((Date.now() - new Date(client.lastContact).getTime()) / (1000 * 60 * 60 * 24))
  
  let card = `${stage.emoji} **${client.businessName || client.slug}**\n`
  card += `   Contact: ${client.contactName || "—"}`
  if (client.email) card += ` (${client.email})`
  card += "\n"
  card += `   Stage: ${stage.name} | Value: $${client.monthlyValue}/mo\n`
  card += `   Last contact: ${daysSinceContact} days ago`
  
  if (client.nextFollowUp) {
    const followDate = new Date(client.nextFollowUp)
    const isOverdue = followDate <= new Date()
    card += `\n   Follow-up: ${followDate.toLocaleDateString()}${isOverdue ? " ⚠️ OVERDUE" : ""}`
  }
  
  if (client.services.length > 0) {
    card += `\n   Services: ${client.services.join(", ")}`
  }
  
  return card
}

// ============================================
// FORMAT PIPELINE (for Discord)
// ============================================
function formatPipeline() {
  const stats = getDashboardStats()
  const clients = listAllClients()
  
  let msg = `**📊 Sales Pipeline**\n\n`
  msg += `MRR: **$${stats.mrr}** | Pipeline: **$${stats.pipelineValue}/mo** | Active: **${stats.activeClients}**\n`
  
  if (stats.followUpsDue > 0) {
    msg += `⚠️ **${stats.followUpsDue} follow-ups overdue!**\n`
  }
  
  msg += "\n"
  
  stats.byStage.forEach(s => {
    msg += `${s.emoji} **${s.name}** (${s.count})\n`
    clients.filter(c => c.stage === s.stage).forEach(c => {
      msg += `   • ${c.businessName || c.slug} — $${c.monthlyValue}/mo`
      if (c.contactName) msg += ` (${c.contactName})`
      msg += "\n"
    })
    msg += "\n"
  })
  
  return msg
}

// ============================================
// FORMAT FOLLOW-UPS (for Discord)
// ============================================
function formatFollowUps() {
  const overdue = getFollowUpsDue()
  const upcoming = getUpcomingFollowUps(7)
  
  let msg = "**📋 Follow-ups**\n\n"
  
  if (overdue.length > 0) {
    msg += "**⚠️ Overdue:**\n"
    overdue.forEach(c => {
      const days = Math.round((Date.now() - new Date(c.nextFollowUp).getTime()) / (1000 * 60 * 60 * 24))
      msg += `• **${c.businessName}** — ${days} days overdue (${c.contactName})\n`
    })
    msg += "\n"
  }
  
  if (upcoming.length > 0) {
    msg += "**📅 This week:**\n"
    upcoming.forEach(c => {
      msg += `• **${c.businessName}** — ${new Date(c.nextFollowUp).toLocaleDateString()} (${c.contactName})\n`
    })
    msg += "\n"
  }
  
  if (overdue.length === 0 && upcoming.length === 0) {
    msg += "No follow-ups scheduled. Use `!crm followup <slug> <when>` to set one."
  }
  
  return msg
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  // CRUD
  addClient,
  updateClient,
  getClient,
  removeClient,
  listAllClients,
  searchClients,
  
  // Activity
  addNote,
  logActivity,
  setFollowUp,
  
  // Pipeline
  getPipeline,
  getFollowUpsDue,
  getUpcomingFollowUps,
  getDashboardStats,
  
  // Formatting
  formatClientCard,
  formatPipeline,
  formatFollowUps,
  
  // Constants
  STAGES
}
