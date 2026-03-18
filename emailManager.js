// ============================================
// JORDAN AI - EMAIL MANAGER (Zoho SMTP)
// Sends emails: proposals, reports, follow-ups,
// invoices, outreach, and custom messages
//
// SETUP — add to .env:
//   SMTP_HOST=smtp.zoho.com
//   SMTP_PORT=465
//   SMTP_USER=info@jordan-ai.co
//   SMTP_PASS=your-zoho-password
//   FROM_EMAIL=info@jordan-ai.co
//   FROM_NAME=Jordan
//   REPLY_TO=info@jordan-ai.co
// ============================================

require("dotenv").config()
const nodemailer = require("nodemailer")
const fs = require("fs")
const path = require("path")

// ============================================
// SMTP CONFIG
// ============================================

function getConfig() {
  return {
    host:      process.env.SMTP_HOST || "smtp.zoho.com",
    port:      parseInt(process.env.SMTP_PORT || "465"),
    secure:    (process.env.SMTP_PORT || "465") === "465",  // true=SSL, false=TLS
    user:      process.env.SMTP_USER,
    pass:      process.env.SMTP_PASS,
    fromEmail: process.env.FROM_EMAIL || process.env.SMTP_USER,
    fromName:  process.env.FROM_NAME  || "Jordan",
    replyTo:   process.env.REPLY_TO   || process.env.FROM_EMAIL || process.env.SMTP_USER
  }
}

function isConfigured() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS)
}

// Create a fresh transporter each send (picks up .env changes without restart)
function createTransporter() {
  const cfg = getConfig()
  return nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass
    }
  })
}

async function sendEmail(to, subject, html, options = {}) {
  if (!isConfigured()) {
    return { success: false, error: "SMTP not configured — add SMTP_USER and SMTP_PASS to .env" }
  }

  const cfg = getConfig()
  const {
    from    = `${cfg.fromName} <${cfg.fromEmail}>`,
    replyTo = cfg.replyTo,
    cc      = null,
    tags    = []
  } = options

  try {
    const transporter = createTransporter()

    const mailOptions = {
      from,
      to,
      subject,
      html,
      replyTo
    }
    if (cc) mailOptions.cc = cc

    const info = await transporter.sendMail(mailOptions)

    console.log(`✅ Email sent to ${to}: "${subject}" (${info.messageId})`)
    logEmail(to, subject, tags)

    return { success: true, id: info.messageId, message: "Email sent" }

  } catch (err) {
    console.log(`❌ Email send error: ${err.message}`)
    // Give a clearer hint for the most common Zoho auth problem
    if (err.message.includes("535") || err.message.includes("auth")) {
      return { success: false, error: `SMTP auth failed — check SMTP_USER/SMTP_PASS in .env. Also ensure "Less secure app access" or App Password is set in Zoho. (${err.message})` }
    }
    if (err.message.includes("sender") || err.message.includes("not allowed")) {
      return { success: false, error: `Sender mismatch — FROM_EMAIL must match SMTP_USER or be a verified Zoho alias. Change FROM_EMAIL=${cfg.user} in .env to fix. (${err.message})` }
    }
    return { success: false, error: err.message }
  }
}

// ============================================
// EMAIL LOG
// ============================================
const LOG_FILE = path.join(__dirname, "email-log.json")

function loadLog() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, "utf8"))
    }
  } catch (err) {}
  return []
}

function logEmail(to, subject, tags = []) {
  const log = loadLog()
  log.push({
    to,
    subject,
    tags,
    sentAt: new Date().toISOString()
  })
  // Keep last 500 emails
  const trimmed = log.slice(-500)
  fs.writeFileSync(LOG_FILE, JSON.stringify(trimmed, null, 2))
}

function getEmailStats() {
  const log = loadLog()
  const now = new Date()
  const today = log.filter(e => {
    const d = new Date(e.sentAt)
    return d.toDateString() === now.toDateString()
  })
  const thisMonth = log.filter(e => {
    const d = new Date(e.sentAt)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  
  return {
    total: log.length,
    today: today.length,
    thisMonth: thisMonth.length,
    recent: log.slice(-5).reverse()
  }
}

// ============================================
// EMAIL TEMPLATES
// ============================================

const BRAND = {
  color: "#2A5CFF",
  name: "Jordan AI",
  tagline: "Custom AI Solutions for Small Business"
}

function baseTemplate(content, preheader = "") {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; color: #18181b; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #ffffff; border-radius: 12px; padding: 40px 32px; border: 1px solid #e4e4e7; }
    .header { text-align: center; margin-bottom: 32px; }
    .logo { font-size: 20px; font-weight: 700; color: ${BRAND.color}; text-decoration: none; }
    .divider { border: none; border-top: 1px solid #e4e4e7; margin: 24px 0; }
    h1 { font-size: 24px; font-weight: 700; margin: 0 0 16px; color: #18181b; }
    h2 { font-size: 18px; font-weight: 600; margin: 24px 0 12px; color: #18181b; }
    p { font-size: 15px; line-height: 1.7; margin: 0 0 16px; color: #3f3f46; }
    .btn { display: inline-block; padding: 12px 28px; background: ${BRAND.color}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; }
    .muted { font-size: 13px; color: #71717a; }
    .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #a1a1aa; }
    .stat-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f4f4f5; }
    .stat-label { font-size: 14px; color: #71717a; }
    .stat-value { font-size: 14px; font-weight: 600; color: #18181b; }
    ul { padding-left: 20px; margin: 0 0 16px; }
    li { font-size: 15px; line-height: 1.7; color: #3f3f46; margin-bottom: 8px; }
    .price-box { background: #f4f4f5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }
    .price { font-size: 36px; font-weight: 700; color: ${BRAND.color}; }
    .price-label { font-size: 14px; color: #71717a; }
    ${preheader ? '' : ''}
  </style>
</head>
<body>
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden">${preheader}</div>` : ''}
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <span class="logo">${BRAND.name}</span>
      </div>
      ${content}
    </div>
    <div class="footer">
      <p>${BRAND.name} — ${BRAND.tagline}</p>
    </div>
  </div>
</body>
</html>`
}

// ============================================
// PROPOSAL EMAIL
// ============================================
function proposalTemplate(clientName, businessName, services, pricing, notes = "") {
  const serviceList = services.map(s => `<li><strong>${s.name}</strong> — ${s.description}</li>`).join("")
  
  const pricingRows = pricing.map(p => 
    `<div class="stat-row"><span class="stat-label">${p.item}</span><span class="stat-value">${p.amount}</span></div>`
  ).join("")
  
  const totalAmount = pricing.reduce((sum, p) => {
    const num = parseInt(p.amount.replace(/[^0-9]/g, ""))
    return sum + (isNaN(num) ? 0 : num)
  }, 0)
  
  const content = `
    <h1>Your Custom Proposal</h1>
    <p>Hi ${clientName},</p>
    <p>Thanks for taking the time to chat about <strong>${businessName}</strong>. I've put together a customized plan based on what we discussed.</p>
    
    <hr class="divider">
    
    <h2>What I'll do for ${businessName}</h2>
    <ul>${serviceList}</ul>
    
    <h2>Investment</h2>
    ${pricingRows}
    
    <div class="price-box">
      <div class="price-label">Monthly Total</div>
      <div class="price">$${totalAmount}/mo</div>
    </div>
    
    ${notes ? `<p class="muted">${notes}</p>` : ''}
    
    <p>Ready to get started? Just reply to this email and we'll kick things off this week.</p>
    
    <p>Looking forward to working together,<br><strong>Jordan AI Team</strong></p>
  `
  
  return baseTemplate(content, `Proposal for ${businessName} — $${totalAmount}/mo`)
}

// ============================================
// MONTHLY REPORT EMAIL
// ============================================
function monthlyReportTemplate(clientName, businessName, data) {
  const {
    postsPublished = 0,
    pagesCreated = 0,
    topPosts = [],
    highlights = [],
    nextMonth = []
  } = data
  
  const month = new Date().toLocaleString("default", { month: "long", year: "numeric" })
  
  const topPostsList = topPosts.length > 0
    ? topPosts.map(p => `<li><a href="${p.url}" style="color:${BRAND.color}">${p.title}</a></li>`).join("")
    : "<li>Content publishing ramping up</li>"
  
  const highlightsList = highlights.map(h => `<li>${h}</li>`).join("")
  const nextMonthList = nextMonth.map(n => `<li>${n}</li>`).join("")
  
  const content = `
    <h1>${month} Report</h1>
    <p>Hi ${clientName},</p>
    <p>Here's your monthly update for <strong>${businessName}</strong>.</p>
    
    <hr class="divider">
    
    <h2>This month by the numbers</h2>
    <div class="stat-row"><span class="stat-label">Blog posts published</span><span class="stat-value">${postsPublished}</span></div>
    <div class="stat-row"><span class="stat-label">Pages created/updated</span><span class="stat-value">${pagesCreated}</span></div>
    
    <h2>Content published</h2>
    <ul>${topPostsList}</ul>
    
    ${highlights.length > 0 ? `<h2>Highlights</h2><ul>${highlightsList}</ul>` : ''}
    
    <h2>Coming next month</h2>
    <ul>${nextMonthList}</ul>
    
    <p>Questions? Just reply to this email.</p>
    
    <p>Best,<br><strong>Jordan AI Team</strong></p>
  `
  
  return baseTemplate(content, `${month} Report for ${businessName}`)
}

// ============================================
// FOLLOW-UP EMAIL
// ============================================
function followUpTemplate(clientName, context, callToAction) {
  const content = `
    <h1>Quick follow-up</h1>
    <p>Hi ${clientName},</p>
    <p>${context}</p>
    <p>${callToAction}</p>
    <p>Best,<br><strong>Jordan AI Team</strong></p>
  `
  
  return baseTemplate(content)
}

// ============================================
// OUTREACH EMAIL (cold or warm)
// ============================================
function outreachTemplate(recipientName, businessName, personalHook, pitch) {
  const content = `
    <p>Hi ${recipientName},</p>
    <p>${personalHook}</p>
    <p>${pitch}</p>
    <p>If you're open to it, I'd love to show you a quick demo — takes about 15 minutes. No pressure either way.</p>
    <p style="text-align:center;margin:28px 0"><a href="https://jordan-ai.co/services.html" class="btn">Learn More</a></p>
    <p>Best,<br><strong>Jordan AI Team</strong></p>
  `
  
  return baseTemplate(content, `AI solutions for ${businessName}`)
}

// ============================================
// INVOICE EMAIL
// ============================================
function invoiceTemplate(clientName, businessName, items, invoiceNumber, dueDate) {
  const itemRows = items.map(i => 
    `<div class="stat-row"><span class="stat-label">${i.description}</span><span class="stat-value">$${i.amount}</span></div>`
  ).join("")
  
  const total = items.reduce((sum, i) => sum + i.amount, 0)
  
  const content = `
    <h1>Invoice #${invoiceNumber}</h1>
    <p>Hi ${clientName},</p>
    <p>Here's your invoice for <strong>${businessName}</strong> services.</p>
    
    <hr class="divider">
    
    <div class="stat-row"><span class="stat-label">Invoice Number</span><span class="stat-value">#${invoiceNumber}</span></div>
    <div class="stat-row"><span class="stat-label">Due Date</span><span class="stat-value">${dueDate}</span></div>
    
    <h2>Services</h2>
    ${itemRows}
    
    <div class="price-box">
      <div class="price-label">Total Due</div>
      <div class="price">$${total}</div>
    </div>
    
    <p style="text-align:center"><a href="#" class="btn">Pay Now</a></p>
    
    <p class="muted">Payment is due by ${dueDate}. Reply to this email if you have any questions.</p>
    
    <p>Thank you for your business,<br><strong>Jordan AI Team</strong></p>
  `
  
  return baseTemplate(content, `Invoice #${invoiceNumber} — $${total} due ${dueDate}`)
}

// ============================================
// CUSTOM EMAIL (AI-written)
// ============================================
async function writeAndSendEmail(to, purpose, context, openai, options = {}) {
  try {
    const prompt = `Write a professional email for a digital agency that provides AI chatbots and website management to small businesses.

Purpose: ${purpose}
Context: ${context}
Recipient: ${to}
${options.recipientName ? `Recipient Name: ${options.recipientName}` : ''}
${options.businessName ? `Their Business: ${options.businessName}` : ''}

Write the email body only (no subject line, no "From" line). 
Use a warm, professional tone. Keep it concise — under 200 words.
Don't use phrases like "I hope this email finds you well."
Be direct and helpful.`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You write concise, professional business emails. No fluff. Direct and warm." },
        { role: "user", content: prompt }
      ]
    })
    
    const body = response.choices[0].message.content
    
    // Generate subject line
    const subjectResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: `Write a short email subject line (under 8 words) for this email:\n\n${body}\n\nJust the subject line, nothing else.` }
      ]
    })
    
    const subject = subjectResponse.choices[0].message.content.replace(/^["']|["']$/g, "").trim()
    
    // Convert body to HTML
    const htmlBody = body.split("\n").filter(l => l.trim()).map(l => `<p>${l}</p>`).join("")
    const html = baseTemplate(htmlBody)
    
    // Send it
    const result = await sendEmail(to, subject, html, {
      tags: ["ai-written", purpose.toLowerCase().replace(/\s+/g, "-")]
    })
    
    return {
      ...result,
      subject,
      body,
      to
    }
    
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ============================================
// SEND PROPOSAL
// ============================================
async function sendProposal(to, clientName, businessName, services, pricing, options = {}) {
  const html = proposalTemplate(clientName, businessName, services, pricing, options.notes)
  const subject = `Your Custom Proposal — ${businessName}`
  
  return await sendEmail(to, subject, html, {
    tags: ["proposal", businessName.toLowerCase().replace(/\s+/g, "-")],
    ...options
  })
}

// ============================================
// SEND MONTHLY REPORT
// ============================================
async function sendMonthlyReport(to, clientName, businessName, data) {
  const month = new Date().toLocaleString("default", { month: "long", year: "numeric" })
  const html = monthlyReportTemplate(clientName, businessName, data)
  const subject = `${month} Report — ${businessName}`
  
  return await sendEmail(to, subject, html, {
    tags: ["report", "monthly", businessName.toLowerCase().replace(/\s+/g, "-")]
  })
}

// ============================================
// SEND FOLLOW-UP
// ============================================
async function sendFollowUp(to, clientName, context, callToAction) {
  const html = followUpTemplate(clientName, context, callToAction)
  const subject = `Quick follow-up`
  
  return await sendEmail(to, subject, html, {
    tags: ["follow-up"]
  })
}

// ============================================
// SEND INVOICE
// ============================================
async function sendInvoice(to, clientName, businessName, items, paymentLink = null) {
  const invoiceNumber = `JA-${Date.now().toString().slice(-6)}`
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()
  
  let html = invoiceTemplate(clientName, businessName, items, invoiceNumber, dueDate)
  
  // Replace placeholder pay link with real Stripe link
  if (paymentLink) {
    html = html.replace('href="#"', `href="${paymentLink}"`)
  }
  
  return await sendEmail(to, `Invoice #${invoiceNumber} — ${businessName}`, html, {
    tags: ["invoice", businessName.toLowerCase().replace(/\s+/g, "-")]
  })
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  // Core
  sendEmail,
  isConfigured,
  getConfig,

  // Stats
  getEmailStats,

  // Templates
  baseTemplate,
  proposalTemplate,
  monthlyReportTemplate,
  followUpTemplate,
  outreachTemplate,
  invoiceTemplate,

  // Send helpers
  sendProposal,
  sendMonthlyReport,
  sendFollowUp,
  sendInvoice,

  // AI-powered
  writeAndSendEmail
}
