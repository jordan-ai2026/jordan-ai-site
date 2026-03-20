// ============================================
// CLIENT REQUESTS — Email-driven site change system
//
// Flow:
//   1. Client emails info@jordan-ai.co with a plain-text request
//   2. runInboxCheck() reads IMAP inbox, matches sender to CRM
//   3. parseRequest() uses GPT-4o-mini to parse the natural language
//   4. applyChange() mutates the HTML file directly
//   5. deployWebsite() pushes to Vercel
//   6. Confirmation email sent to client
//   7. History logged to website/clients/[slug]/request-history.json
// ============================================

require("dotenv").config()
const fs      = require("fs")
const path    = require("path")
const OpenAI  = require("openai")

const CLIENTS_DIR = path.join(__dirname, "website", "clients")

// ============================================
// CONFIGURATION CHECK
// ============================================
function isConfigured() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS)
}

// ============================================
// IMAP INBOX READER
// Connects to Zoho IMAP, fetches unseen emails
// ============================================
async function checkInbox() {
  if (!isConfigured()) {
    return { emails: [], error: "SMTP_USER or SMTP_PASS not set" }
  }

  let ImapFlow
  try {
    ImapFlow = require("imapflow")
  } catch (err) {
    return { emails: [], error: "imapflow not installed — run: npm install imapflow" }
  }

  const client = new ImapFlow.ImapFlow({
    host:   process.env.IMAP_HOST || "imap.zoho.com",
    port:   parseInt(process.env.IMAP_PORT || "993"),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    logger: false,
  })

  const emails = []

  try {
    await client.connect()
    await client.mailboxOpen("INBOX")

    // Fetch all unseen messages
    const uids = await client.search({ seen: false })
    if (!uids || uids.length === 0) {
      await client.logout()
      return { emails: [], error: null }
    }

    for (const uid of uids) {
      try {
        // Fetch the raw message source
        const msg = await client.fetchOne(uid.toString(), { source: true }, { uid: true })
        if (!msg || !msg.source) continue

        const raw = msg.source.toString("utf8")

        // Parse headers and body
        const headerBodySplit = raw.indexOf("\r\n\r\n")
        const headerSection   = headerBodySplit >= 0 ? raw.substring(0, headerBodySplit) : raw
        let   bodySection     = headerBodySplit >= 0 ? raw.substring(headerBodySplit + 4) : ""

        // Extract From
        const fromMatch = headerSection.match(/^From:\s*(.+)$/im)
        let   fromRaw   = fromMatch ? fromMatch[1].trim() : ""
        // Parse "Name <email>" or just "email"
        const emailMatch = fromRaw.match(/<([^>]+)>/)
        const fromEmail  = emailMatch ? emailMatch[1].trim().toLowerCase() : fromRaw.toLowerCase().trim()

        // Extract Subject
        const subjectMatch = headerSection.match(/^Subject:\s*(.+)$/im)
        const subject      = subjectMatch ? subjectMatch[1].trim() : "(no subject)"

        // Extract Date
        const dateMatch = headerSection.match(/^Date:\s*(.+)$/im)
        const date      = dateMatch ? dateMatch[1].trim() : new Date().toISOString()

        // Strip HTML tags from body
        bodySection = bodySection.replace(/<[^>]+>/g, " ")
        // Collapse whitespace
        bodySection = bodySection.replace(/\s+/g, " ").trim()
        // Remove quoted reply lines (lines starting with >)
        bodySection = bodySection
          .split("\n")
          .filter(line => !line.trim().startsWith(">"))
          .join("\n")
          .trim()

        // Mark as seen
        await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true })

        emails.push({ uid, from: fromEmail, subject, date, body: bodySection })
      } catch (msgErr) {
        console.log(`   ⚠️  Error reading message uid ${uid}: ${msgErr.message}`)
      }
    }

    await client.logout()
    return { emails, error: null }
  } catch (err) {
    try { await client.logout() } catch (_) {}
    return { emails: [], error: err.message }
  }
}

// ============================================
// MATCH CLIENT BY EMAIL
// ============================================
function matchClientByEmail(fromEmail) {
  try {
    const crm     = require("./crm")
    const clients = crm.listAllClients()
    const needle  = fromEmail.toLowerCase().trim()
    return clients.find(c => c.email && c.email.toLowerCase().trim() === needle) || null
  } catch (err) {
    console.log("   ⚠️  CRM lookup error:", err.message)
    return null
  }
}

// ============================================
// SITEMAP GENERATOR
// Scans rendered index.html, maps sections/fields/images
// Synchronous — no async needed
// ============================================
const SECTION_IDS = ["home", "about", "services", "gallery", "testimonials", "contact", "footer", "booking", "rentals", "steps"]
const SECTION_DESCRIPTIONS = {
  home:         "Main hero banner with headline",
  about:        "About section with company story",
  services:     "Services offered",
  gallery:      "Photo gallery",
  testimonials: "Customer reviews",
  contact:      "Contact form and business info",
  footer:       "Footer with links and info",
  booking:      "Booking/inquiry form",
  rentals:      "Rental items and packages",
  steps:        "How it works steps",
}

function generateSitemap(slug) {
  const htmlPath = path.join(CLIENTS_DIR, slug, "index.html")
  if (!fs.existsSync(htmlPath)) return null

  const raw   = fs.readFileSync(htmlPath, "utf8")
  const lines = raw.split("\n")

  // ── SECTIONS ──────────────────────────────────
  const sections = {}
  const sectionHits = [] // { id, lineIndex (0-based) }

  lines.forEach((line, idx) => {
    for (const id of SECTION_IDS) {
      // Match id="home" or id='home'
      if (new RegExp(`id=["']${id}["']`, "i").test(line)) {
        sectionHits.push({ id, lineIndex: idx })
        break
      }
    }
  })

  // Sort by line order and compute ranges
  sectionHits.sort((a, b) => a.lineIndex - b.lineIndex)
  for (let i = 0; i < sectionHits.length; i++) {
    const hit     = sectionHits[i]
    const nextHit = sectionHits[i + 1]
    const lineStart = hit.lineIndex + 1          // 1-based
    const lineEnd   = nextHit ? nextHit.lineIndex : lines.length  // 1-based end
    sections[hit.id] = {
      line_start:  lineStart,
      line_end:    lineEnd,
      description: SECTION_DESCRIPTIONS[hit.id] || hit.id,
    }
  }

  // ── EDITABLE FIELDS ───────────────────────────
  const editable = {}

  // Phone numbers
  const phoneRe      = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g
  const phoneMatches = []
  lines.forEach((line, idx) => {
    const m = line.match(phoneRe)
    if (m) {
      m.forEach(p => {
        const existing = phoneMatches.find(x => x.value === p)
        if (existing) {
          existing.lines.push(idx + 1)
        } else {
          phoneMatches.push({ value: p, lines: [idx + 1] })
        }
      })
    }
  })
  if (phoneMatches.length > 0) {
    // Use the most frequent phone number
    phoneMatches.sort((a, b) => b.lines.length - a.lines.length)
    editable.phone = { current: phoneMatches[0].value, lines: phoneMatches[0].lines }
  }

  // Email (exclude jordan-ai.co)
  const emailRe      = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const emailMatches = []
  lines.forEach((line, idx) => {
    const m = line.match(emailRe)
    if (m) {
      m.forEach(e => {
        if (e.includes("jordan-ai.co")) return
        const existing = emailMatches.find(x => x.value === e)
        if (existing) {
          existing.lines.push(idx + 1)
        } else {
          emailMatches.push({ value: e, lines: [idx + 1] })
        }
      })
    }
  })
  if (emailMatches.length > 0) {
    emailMatches.sort((a, b) => b.lines.length - a.lines.length)
    editable.email = { current: emailMatches[0].value, lines: emailMatches[0].lines }
  }

  // Hours patterns
  const hoursPatterns = [
    /Mon[- ](?:through[- ]|to[- ])?(?:Fri|Sat|Sun)[^<"'\n]{0,40}/gi,
    /[0-9]+\s*am\s*[-–]\s*[0-9]+\s*pm/gi,
    /[0-9]+:[0-9]+\s*[ap]m\s*[-–]\s*[0-9]+:[0-9]+\s*[ap]m/gi,
    /Open\s+[0-9]+\s*[ap]m[^<"'\n]{0,30}/gi,
  ]
  const hoursMatches = []
  lines.forEach((line, idx) => {
    for (const re of hoursPatterns) {
      re.lastIndex = 0
      const m = re.exec(line)
      if (m) {
        const existing = hoursMatches.find(x => x.value === m[0].trim())
        if (existing) {
          existing.lines.push(idx + 1)
        } else {
          hoursMatches.push({ value: m[0].trim(), lines: [idx + 1] })
        }
        break
      }
    }
  })
  if (hoursMatches.length > 0) {
    editable.hours = { current: hoursMatches[0].value, lines: hoursMatches[0].lines }
  }

  // ── IMAGES ────────────────────────────────────
  const images = { hero: [], about: [], gallery: [], logo: [], other: [] }
  const imgSrcRe  = /<img[^>]+src=["']([^"']+)["']/gi
  const bgRe      = /background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/gi

  const allImages = []
  lines.forEach((line) => {
    let m
    imgSrcRe.lastIndex = 0
    while ((m = imgSrcRe.exec(line)) !== null) allImages.push(m[1])
    bgRe.lastIndex = 0
    while ((m = bgRe.exec(line)) !== null) allImages.push(m[1])
  })

  for (const src of allImages) {
    const lower = src.toLowerCase()
    if      (lower.includes("hero"))    images.hero.push(src)
    else if (lower.includes("about"))   images.about.push(src)
    else if (lower.includes("gallery")) images.gallery.push(src)
    else if (lower.includes("logo"))    images.logo.push(src)
    else                                images.other.push(src)
  }
  // Deduplicate
  for (const key of Object.keys(images)) {
    images[key] = [...new Set(images[key])]
  }

  const sitemap = {
    sections,
    editable,
    images,
    generatedAt: new Date().toISOString(),
  }

  const sitemapPath = path.join(CLIENTS_DIR, slug, "sitemap.json")
  fs.writeFileSync(sitemapPath, JSON.stringify(sitemap, null, 2), "utf8")
  return sitemap
}

// ============================================
// REQUEST PARSER — GPT-4o-mini natural language → action JSON
// ============================================
async function parseRequest(requestText) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const systemPrompt = `You are a website change request parser. Analyze the client's request and return a JSON object only, with no extra text.

The JSON must have a "type" field with one of these values:
- update_phone — client wants to change phone number
- update_email — client wants to change email address
- update_hours — client wants to change business hours
- update_headline — client wants to change the main H1 heading
- update_subtext — client wants to change the hero subtitle/subtext paragraph
- update_about — client wants to change the about section text
- add_service — client wants to add a new service card
- update_service — client wants to modify an existing service
- remove_section — client wants to remove an entire section
- add_gallery_image — client wants to add a photo to the gallery
- other — anything else

Additional fields depending on type:
- update_phone: { newValue: "new phone number" }
- update_email: { newValue: "new@email.com", oldValue: "old@email.com or null" }
- update_hours: { newValue: "Mon-Fri 8am-6pm" }
- update_headline: { newValue: "New headline text" }
- update_subtext: { newValue: "New subtext paragraph" }
- update_about: { newValue: "New about paragraph text" }
- add_service: { serviceName: "Service Name", serviceDesc: "Description", serviceIcon: "emoji or null", serviceItems: ["item1","item2","item3"] }
- update_service: { serviceName: "existing service name", newValue: "new description or name" }
- remove_section: { sectionId: "one of: home,about,services,gallery,testimonials,contact,footer,booking,rentals,steps" }
- add_gallery_image: { imageUrl: "https://...", caption: "optional caption" }
- other: { description: "what they want" }

Return ONLY the JSON object. No markdown, no explanation.`

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 512,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: requestText },
      ],
    })

    const text = response.choices[0]?.message?.content?.trim() || "{}"
    // Strip any accidental markdown fences
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    return JSON.parse(cleaned)
  } catch (err) {
    return { type: "other", description: requestText, error: err.message }
  }
}

// ============================================
// HTML CHANGE APPLICATOR
// Reads index.html, mutates lines, writes back
// ============================================
function applyChange(slug, change, sitemap) {
  const htmlPath = path.join(CLIENTS_DIR, slug, "index.html")
  if (!fs.existsSync(htmlPath)) {
    return { changed: false, description: `No index.html found for ${slug}` }
  }

  let html = fs.readFileSync(htmlPath, "utf8")

  switch (change.type) {
    // ── UPDATE PHONE ──────────────────────────
    case "update_phone": {
      if (!change.newValue) return { changed: false, description: "No new phone value provided" }
      const re        = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g
      const matches   = html.match(re)
      if (!matches || matches.length === 0) {
        return { changed: false, description: "Could not find any phone numbers in the HTML" }
      }
      const newHtml   = html.replace(re, change.newValue)
      fs.writeFileSync(htmlPath, newHtml, "utf8")
      return {
        changed:      true,
        description:  `Updated phone number to ${change.newValue} (${matches.length} location${matches.length !== 1 ? "s" : ""})`,
        linesAffected: matches.length,
      }
    }

    // ── UPDATE EMAIL ──────────────────────────
    case "update_email": {
      if (!change.newValue) return { changed: false, description: "No new email value provided" }
      const oldEmail = change.oldValue || (sitemap?.editable?.email?.current) || null
      if (!oldEmail) {
        return { changed: false, description: "Could not determine the old email to replace" }
      }
      // Escape special regex chars
      const escaped  = oldEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const re       = new RegExp(escaped, "gi")
      const matches  = html.match(re)
      if (!matches || matches.length === 0) {
        return { changed: false, description: `Could not find "${oldEmail}" in the HTML` }
      }
      const newHtml  = html.replace(re, change.newValue)
      fs.writeFileSync(htmlPath, newHtml, "utf8")
      return {
        changed:      true,
        description:  `Updated email from ${oldEmail} to ${change.newValue} (${matches.length} location${matches.length !== 1 ? "s" : ""})`,
        linesAffected: matches.length,
      }
    }

    // ── UPDATE HOURS ──────────────────────────
    case "update_hours": {
      if (!change.newValue) return { changed: false, description: "No new hours value provided" }
      // Try sitemap-based replacement first
      const currentHours = sitemap?.editable?.hours?.current
      if (currentHours) {
        const escaped = currentHours.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const re      = new RegExp(escaped, "g")
        if (re.test(html)) {
          const newHtml = html.replace(re, change.newValue)
          fs.writeFileSync(htmlPath, newHtml, "utf8")
          return { changed: true, description: `Updated hours to: ${change.newValue}`, linesAffected: 1 }
        }
      }
      // Fallback: generic hours regex
      const hoursRe  = /Mon[- ](?:through[- ]|to[- ])?(?:Fri|Sat|Sun)[^<"'\n]{0,40}|[0-9]+\s*am\s*[-–]\s*[0-9]+\s*pm/gi
      const matches  = html.match(hoursRe)
      if (!matches || matches.length === 0) {
        return { changed: false, description: "Could not find hours text in the HTML to replace" }
      }
      const newHtml  = html.replace(hoursRe, change.newValue)
      fs.writeFileSync(htmlPath, newHtml, "utf8")
      return { changed: true, description: `Updated hours to: ${change.newValue}`, linesAffected: matches.length }
    }

    // ── UPDATE HEADLINE ───────────────────────
    case "update_headline": {
      if (!change.newValue) return { changed: false, description: "No new headline value provided" }
      const lines     = html.split("\n")
      const heroSec   = sitemap?.sections?.home || null
      const startLine = heroSec ? heroSec.line_start - 1 : 0
      const endLine   = heroSec ? heroSec.line_end       : lines.length

      // Find <h1> within hero range
      let h1Idx = -1
      for (let i = startLine; i < endLine && i < lines.length; i++) {
        if (/<h1[\s>]/i.test(lines[i])) { h1Idx = i; break }
      }
      if (h1Idx === -1) {
        return { changed: false, description: "Could not find <h1> in the hero section" }
      }

      // Handle multi-line h1 — join until </h1>
      let combined  = ""
      let endH1Idx  = h1Idx
      for (let i = h1Idx; i < lines.length; i++) {
        combined += lines[i]
        if (lines[i].includes("</h1>")) { endH1Idx = i; break }
      }
      const newCombined = combined.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/i, `<h1$1>${change.newValue}</h1>`)
      if (newCombined === combined) {
        return { changed: false, description: "Could not find/replace H1 tag content" }
      }
      lines.splice(h1Idx, endH1Idx - h1Idx + 1, newCombined)
      fs.writeFileSync(htmlPath, lines.join("\n"), "utf8")
      return { changed: true, description: `Updated main headline to: ${change.newValue}`, linesAffected: 1 }
    }

    // ── UPDATE SUBTEXT ────────────────────────
    case "update_subtext": {
      if (!change.newValue) return { changed: false, description: "No new subtext value provided" }
      const lines     = html.split("\n")
      const heroSec   = sitemap?.sections?.home || null
      const startLine = heroSec ? heroSec.line_start - 1 : 0
      const endLine   = heroSec ? heroSec.line_end       : lines.length

      // Find the first <p class="hero-sub or <p after h1 in hero range
      let pIdx = -1
      for (let i = startLine; i < endLine && i < lines.length; i++) {
        if (/<p[^>]*class=["'][^"']*hero-sub/i.test(lines[i]) || (pIdx === -1 && /<p[\s>]/i.test(lines[i]))) {
          pIdx = i; break
        }
      }
      if (pIdx === -1) {
        return { changed: false, description: "Could not find hero subtitle paragraph" }
      }
      // Handle multi-line <p>
      let combined = ""
      let endPIdx  = pIdx
      for (let i = pIdx; i < lines.length; i++) {
        combined += lines[i]
        if (lines[i].includes("</p>")) { endPIdx = i; break }
      }
      const newCombined = combined.replace(/<p([^>]*)>[\s\S]*?<\/p>/i, `<p$1>${change.newValue}</p>`)
      if (newCombined === combined) {
        return { changed: false, description: "Could not replace paragraph content" }
      }
      lines.splice(pIdx, endPIdx - pIdx + 1, newCombined)
      fs.writeFileSync(htmlPath, lines.join("\n"), "utf8")
      return { changed: true, description: `Updated hero subtext`, linesAffected: 1 }
    }

    // ── UPDATE ABOUT ──────────────────────────
    case "update_about": {
      if (!change.newValue) return { changed: false, description: "No new about text provided" }
      const lines     = html.split("\n")
      const aboutSec  = sitemap?.sections?.about || null
      const startLine = aboutSec ? aboutSec.line_start - 1 : 0
      const endLine   = aboutSec ? aboutSec.line_end       : lines.length

      let pIdx = -1
      for (let i = startLine; i < endLine && i < lines.length; i++) {
        if (/<p[\s>]/i.test(lines[i])) { pIdx = i; break }
      }
      if (pIdx === -1) {
        return { changed: false, description: "Could not find paragraph in about section" }
      }
      let combined = ""
      let endPIdx  = pIdx
      for (let i = pIdx; i < lines.length; i++) {
        combined += lines[i]
        if (lines[i].includes("</p>")) { endPIdx = i; break }
      }
      const newCombined = combined.replace(/<p([^>]*)>[\s\S]*?<\/p>/i, `<p$1>${change.newValue}</p>`)
      if (newCombined === combined) {
        return { changed: false, description: "Could not replace about paragraph" }
      }
      lines.splice(pIdx, endPIdx - pIdx + 1, newCombined)
      fs.writeFileSync(htmlPath, lines.join("\n"), "utf8")
      return { changed: true, description: `Updated about section text`, linesAffected: 1 }
    }

    // ── ADD SERVICE ───────────────────────────
    case "add_service": {
      if (!change.serviceName) return { changed: false, description: "No serviceName provided" }
      const lines     = html.split("\n")
      const svcSec    = sitemap?.sections?.services || sitemap?.sections?.rentals || null
      const startLine = svcSec ? svcSec.line_start - 1 : 0
      const endLine   = svcSec ? svcSec.line_end       : lines.length

      // Find last </article> or </div> closing a service card before section end
      let insertAfter = -1
      for (let i = Math.min(endLine - 1, lines.length - 1); i >= startLine; i--) {
        if (/<\/article>/i.test(lines[i]) || /<\/div>/i.test(lines[i])) {
          insertAfter = i; break
        }
      }
      if (insertAfter === -1) {
        return { changed: false, description: "Could not find an insertion point in the services section" }
      }

      const icon    = change.serviceIcon || "⭐"
      const newCard = [
        `    <article class="service-card">`,
        `      <div class="service-icon">${icon}</div>`,
        `      <h3>${change.serviceName}</h3>`,
        `      <p>${change.serviceDesc || ""}</p>`,
        `    </article>`,
      ]
      lines.splice(insertAfter + 1, 0, ...newCard)
      fs.writeFileSync(htmlPath, lines.join("\n"), "utf8")
      return { changed: true, description: `Added new service card: ${change.serviceName}`, linesAffected: newCard.length }
    }

    // ── REMOVE SECTION ────────────────────────
    case "remove_section": {
      const sectionId = change.sectionId
      if (!sectionId) return { changed: false, description: "No sectionId provided" }
      const sec = sitemap?.sections?.[sectionId]
      if (!sec) return { changed: false, description: `Section "${sectionId}" not found in sitemap` }

      const lines     = html.split("\n")
      const start0    = sec.line_start - 1  // convert to 0-based
      const end0      = sec.line_end - 1
      const count     = end0 - start0 + 1
      if (start0 < 0 || start0 >= lines.length) {
        return { changed: false, description: "Section line range is out of bounds" }
      }
      lines.splice(start0, count)
      fs.writeFileSync(htmlPath, lines.join("\n"), "utf8")
      return { changed: true, description: `Removed section: ${sectionId} (${count} lines)`, linesAffected: count }
    }

    // ── ADD GALLERY IMAGE ─────────────────────
    case "add_gallery_image": {
      if (!change.imageUrl) return { changed: false, description: "No imageUrl provided" }
      const caption   = change.caption || "Gallery photo"
      const imgTag    = `    <img src="${change.imageUrl}" alt="${caption}" loading="lazy" class="gallery-img">`

      const lines     = html.split("\n")
      const galSec    = sitemap?.sections?.gallery || null
      const startLine = galSec ? galSec.line_start - 1 : 0
      const endLine   = galSec ? galSec.line_end       : lines.length

      // Find gallery grid div and inject before its closing tag
      let insertBefore = -1
      for (let i = startLine; i < Math.min(endLine, lines.length); i++) {
        if (/class=["'][^"']*gallery[-_]grid/i.test(lines[i]) || /class=["'][^"']*gallery[-_]wrap/i.test(lines[i])) {
          // Find the closing </div> for this container
          for (let j = i + 1; j < Math.min(endLine, lines.length); j++) {
            if (/<\/div>/i.test(lines[j])) { insertBefore = j; break }
          }
          break
        }
      }

      if (insertBefore === -1) {
        // Fallback: find any </section> in gallery range
        for (let i = Math.min(endLine - 1, lines.length - 1); i >= startLine; i--) {
          if (/<\/section>/i.test(lines[i])) { insertBefore = i; break }
        }
      }

      if (insertBefore === -1) {
        return { changed: false, description: "Could not find a gallery grid to insert image into" }
      }

      lines.splice(insertBefore, 0, imgTag)
      fs.writeFileSync(htmlPath, lines.join("\n"), "utf8")
      return { changed: true, description: `Added gallery image from ${change.imageUrl}`, linesAffected: 1 }
    }

    default:
      return { changed: false, description: `Unsupported change type: ${change.type}` }
  }
}

// ============================================
// PROCESS REQUEST — Main pipeline for one request
// ============================================
async function processRequest(slug, requestText, fromEmail) {
  try {
    // 1. Load sitemap (generate if missing)
    const sitemapPath = path.join(CLIENTS_DIR, slug, "sitemap.json")
    let sitemap = null
    if (fs.existsSync(sitemapPath)) {
      try { sitemap = JSON.parse(fs.readFileSync(sitemapPath, "utf8")) } catch (_) {}
    }
    if (!sitemap) {
      sitemap = generateSitemap(slug)
    }

    // 2. Parse request
    const change = await parseRequest(requestText)

    // 3. Apply change
    const result = applyChange(slug, change, sitemap)

    // 4. Deploy if changed
    let deployed = false
    if (result.changed) {
      try {
        const { deployWebsite } = require("./gitDeploy")
        const deployResult = await deployWebsite(`Client request: ${slug} — ${change.type}`)
        deployed = !!(deployResult?.success)
      } catch (err) {
        console.log(`   ⚠️  Deploy failed: ${err.message}`)
      }
    }

    // 5. Log to request history
    try {
      const historyPath = path.join(CLIENTS_DIR, slug, "request-history.json")
      let history = []
      if (fs.existsSync(historyPath)) {
        try { history = JSON.parse(fs.readFileSync(historyPath, "utf8")) } catch (_) {}
      }
      history.push({
        date:        new Date().toISOString(),
        requestText,
        fromEmail:   fromEmail || null,
        change,
        result,
        deployed,
      })
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf8")
    } catch (logErr) {
      console.log(`   ⚠️  Could not write request history: ${logErr.message}`)
    }

    return { success: true, change, result, deployed }
  } catch (err) {
    return { success: false, error: err.message, change: null, result: null, deployed: false }
  }
}

// ============================================
// REQUEST HISTORY
// ============================================
function getRequestHistory(slug) {
  const historyPath = path.join(CLIENTS_DIR, slug, "request-history.json")
  if (!fs.existsSync(historyPath)) return []
  try {
    const data = JSON.parse(fs.readFileSync(historyPath, "utf8"))
    return Array.isArray(data) ? data.slice().reverse() : []
  } catch (_) {
    return []
  }
}

// ============================================
// CONFIRMATION EMAIL
// ============================================
async function sendConfirmationEmail(toEmail, clientName, businessName, requestText, result) {
  try {
    const emailManager = require("./emailManager")
    if (!emailManager.isConfigured()) return

    const firstName = clientName ? clientName.split(" ")[0] : "there"
    const siteUrl   = `https://jordan-ai.co/clients/${businessName?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "your-site"}/`
    const desc      = result?.description || "Your requested change has been applied."

    const bodyHtml = `
      <h2 style="color:#1a1a2e;margin:0 0 16px;">We got your request! ✅</h2>
      <p>Hi ${firstName},</p>
      <p>We received your request and applied the change to your website right away.</p>
      <div style="background:#f4f6fa;border-left:4px solid #667eea;padding:16px;border-radius:4px;margin:20px 0;">
        <p style="margin:0 0 8px;font-weight:bold;color:#333;">Your request:</p>
        <p style="margin:0 0 12px;color:#555;">${requestText}</p>
        <p style="margin:0 0 4px;font-weight:bold;color:#333;">What we changed:</p>
        <p style="margin:0;color:#555;">${desc}</p>
      </div>
      <p>Your site is live at: <a href="${siteUrl}" style="color:#667eea;">${siteUrl}</a></p>
      <p>Need another change? Just reply to this email with your request — we'll take care of it.</p>
      <p style="margin-top:24px;">— Jordan<br><span style="color:#888;font-size:14px;">Jordan AI · Digital Agency</span></p>
    `
    const html = emailManager.baseTemplate(bodyHtml, "Your website change is live!")
    await emailManager.sendEmail(
      toEmail,
      `✅ Your website has been updated — ${businessName || ""}`,
      html
    )
  } catch (err) {
    console.log(`   ⚠️  Confirmation email failed: ${err.message}`)
  }
}

// ============================================
// INBOX CHECK PIPELINE — Full autonomous run
// ============================================
async function runInboxCheck() {
  const summary = { processed: 0, skipped: 0, errors: [] }

  try {
    const { emails, error } = await checkInbox()
    if (error) {
      summary.errors.push(error)
      return summary
    }

    for (const email of emails) {
      try {
        const clientRecord = matchClientByEmail(email.from)
        if (!clientRecord) {
          console.log(`   ⏭️  Skipping email from ${email.from} — not a CRM client`)
          summary.skipped++
          continue
        }

        console.log(`   📧 Processing request from ${clientRecord.businessName}: "${email.body.substring(0, 80)}..."`)
        const result = await processRequest(clientRecord.slug, email.body, email.from)

        // Send confirmation
        await sendConfirmationEmail(
          email.from,
          clientRecord.contactName || clientRecord.businessName,
          clientRecord.businessName,
          email.body,
          result.result
        )

        summary.processed++
      } catch (emailErr) {
        console.log(`   ❌ Error processing email from ${email.from}: ${emailErr.message}`)
        summary.errors.push(`${email.from}: ${emailErr.message}`)
      }
    }
  } catch (outerErr) {
    summary.errors.push(outerErr.message)
  }

  return summary
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  isConfigured,
  checkInbox,
  generateSitemap,
  parseRequest,
  processRequest,
  getRequestHistory,
  runInboxCheck,
}
