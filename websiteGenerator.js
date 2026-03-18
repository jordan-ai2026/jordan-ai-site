// ============================================
// JORDAN AI — WEBSITE GENERATOR
// Fills premium templates with client data
// and deploys to website/clients/[slug]/
//
// Templates:
//   template-service.html      → landscaping, cleaning, contractors
//   template-professional.html → dental, legal, accounting
//   template-restaurant.html   → restaurants, cafes, bars
//
// Usage (Discord):
//   !website create <slug>
//   !website list
//
// Tool: create_client_website
// ============================================

const fs   = require("fs")
const path = require("path")
const { deployWebsite }  = require("./gitDeploy")
const { fetchClientMedia, getCuratedMedia } = require("./mediaManager")
const { getClientAssets, createClientFolders } = require("./assetManager")
const chatbotManager = require("./chatbotManager")

const TEMPLATES_DIR = path.join(__dirname, "website", "templates")
const CLIENTS_DIR   = path.join(__dirname, "website", "clients")

// ============================================
// TEMPLATE SELECTION
// ============================================
const TEMPLATE_MAP = {
  // Service template
  landscaping:  "service",
  lawn:         "service",
  cleaning:     "service",
  maid:         "service",
  contractor:   "service",
  construction: "service",
  roofing:      "service",
  plumbing:     "service",
  electrical:   "service",
  hvac:         "service",
  painting:     "service",
  moving:       "service",
  pest:         "service",
  pool:         "service",
  handyman:     "service",
  // Professional template
  dental:       "professional",
  dentist:      "professional",
  legal:        "professional",
  lawyer:       "professional",
  attorney:     "professional",
  accounting:   "professional",
  accountant:   "professional",
  cpa:          "professional",
  medical:      "professional",
  doctor:       "professional",
  therapy:      "professional",
  chiropractic: "professional",
  // Party rental template
  bounce:       "party",
  inflatable:   "party",
  party:        "party",
  rental:       "party",
  "bounce house": "party",
  jumper:       "party",
  moonwalk:     "party",
  carnival:     "party",
  // Restaurant template
  restaurant:   "restaurant",
  cafe:         "restaurant",
  coffee:       "restaurant",
  bar:          "restaurant",
  bakery:       "restaurant",
  pizza:        "restaurant",
  sushi:        "restaurant",
  bbq:          "restaurant",
  food:         "restaurant",
}

function pickTemplate(industry = "") {
  const key = industry.toLowerCase().replace(/\s+/g, "")
  for (const [word, tmpl] of Object.entries(TEMPLATE_MAP)) {
    if (key.includes(word)) return tmpl
  }
  return "service"  // safe default
}

// ============================================
// ACCENT COLOR PRESETS
// ============================================
const COLOR_PRESETS = {
  green:   { hex: "#22c55e", dark: "#16a34a", glow: "rgba(34,197,94,0.12)"  },
  blue:    { hex: "#3b82f6", dark: "#2563eb", glow: "rgba(59,130,246,0.12)" },
  orange:  { hex: "#f97316", dark: "#ea580c", glow: "rgba(249,115,22,0.12)" },
  red:     { hex: "#ef4444", dark: "#dc2626", glow: "rgba(239,68,68,0.12)"  },
  purple:  { hex: "#a855f7", dark: "#9333ea", glow: "rgba(168,85,247,0.12)" },
  teal:    { hex: "#14b8a6", dark: "#0d9488", glow: "rgba(20,184,166,0.12)" },
  gold:    { hex: "#eab308", dark: "#ca8a04", glow: "rgba(234,179,8,0.12)"  },
  cyan:    { hex: "#06b6d4", dark: "#0891b2", glow: "rgba(6,182,212,0.12)"  },
  rose:    { hex: "#f43f5e", dark: "#e11d48", glow: "rgba(244,63,94,0.12)"  },
  indigo:  { hex: "#6366f1", dark: "#4f46e5", glow: "rgba(99,102,241,0.12)" },
}

function hexDarken(hex, amount = 0.18) {
  const h = hex.replace("#", "")
  const r = Math.round(parseInt(h.slice(0,2), 16) * (1 - amount))
  const g = Math.round(parseInt(h.slice(2,4), 16) * (1 - amount))
  const b = Math.round(parseInt(h.slice(4,6), 16) * (1 - amount))
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`
}

function hexGlow(hex) {
  const h = hex.replace("#", "")
  const r = parseInt(h.slice(0,2), 16)
  const g = parseInt(h.slice(2,4), 16)
  const b = parseInt(h.slice(4,6), 16)
  return `rgba(${r},${g},${b},0.15)`
}

function resolveColor(colorInput) {
  if (!colorInput) return COLOR_PRESETS.green

  const lower = colorInput.toLowerCase().trim()
  if (COLOR_PRESETS[lower]) return COLOR_PRESETS[lower]

  // Raw hex — compute real dark + glow variants
  const hex = colorInput.startsWith("#") ? colorInput : `#${colorInput}`
  return {
    hex,
    dark: hexDarken(hex),
    glow: hexGlow(hex),
  }
}

// ============================================
// SERVICE-SPECIFIC DEFAULTS
// Fills in content when client doesn't supply it
// ============================================
function getServiceDefaults(industry) {
  const ind = (industry || "").toLowerCase()

  if (ind.includes("landscap") || ind.includes("lawn")) return {
    tagline:            "Professional Landscaping & Lawn Care",
    heroHeadline:       "Beautiful Yards,",
    heroHeadlineAccent: "Zero Hassle",
    heroSubtext:        "We handle everything from weekly lawn maintenance to full landscape transformations. Licensed, insured, and trusted by hundreds of homeowners.",
    aboutHeadline:      "Your Neighborhood Landscaping Experts",
    aboutText:          "We're a locally owned and operated landscaping company serving this community for over a decade. Our team brings professional-grade equipment and genuine care to every yard we touch — because your home deserves to look its best.",
    guarantee:          "Satisfaction",
    services: [
      { icon: "🌿", name: "Lawn Maintenance", desc: "Regular mowing, edging, and trimming to keep your lawn looking sharp week after week.", items: ["Weekly & bi-weekly mowing", "Edge trimming & blowing", "Seasonal clean-ups"] },
      { icon: "🌳", name: "Landscaping Design", desc: "Transform your outdoor space with custom planting, mulching, and garden bed design.", items: ["Plant selection & installation", "Mulch & rock beds", "Garden border design"] },
      { icon: "💧", name: "Irrigation Services", desc: "Keep your lawn green without the waste. We install, repair, and optimize sprinkler systems.", items: ["System installation & repair", "Seasonal startup & winterize", "Smart controller upgrades"] },
      { icon: "🍂", name: "Seasonal Services", desc: "From spring clean-ups to fall leaf removal, we keep your property pristine year-round.", items: ["Spring & fall clean-ups", "Aeration & overseeding", "Snow removal (seasonal)"] },
    ],
    testimonials: [
      { text: "Best landscaping company in the area. My yard has never looked better and they always show up on time. Highly recommend!", name: "Sarah M.", location: "Homeowner", initials: "SM" },
      { text: "Called them for a quote on Tuesday and they had a crew out by Thursday. Professional work at a fair price. Will be using them regularly.", name: "Tom K.", location: "Homeowner", initials: "TK" },
      { text: "They transformed my overgrown mess into a beautiful garden. The team was friendly, efficient, and cleaned up everything perfectly.", name: "Linda R.", location: "Homeowner", initials: "LR" },
    ],
  }

  if (ind.includes("clean") || ind.includes("maid")) return {
    tagline:            "Professional Home & Office Cleaning",
    heroHeadline:       "A Spotless Home,",
    heroHeadlineAccent: "Every Time",
    heroSubtext:        "Trusted cleaning professionals who treat your home like their own. Fully vetted, insured, and background-checked.",
    aboutHeadline:      "Cleaning You Can Actually Trust",
    aboutText:          "Every member of our team is background-checked, insured, and trained to our high standards. We use eco-friendly products that are safe for your family and pets — without sacrificing results.",
    guarantee:          "Satisfaction",
    services: [
      { icon: "🏠", name: "Residential Cleaning", desc: "Regular home cleaning tailored to your schedule and specific needs.", items: ["Weekly, bi-weekly, or monthly", "Kitchen & bathrooms", "Bedrooms & living areas"] },
      { icon: "✨", name: "Deep Cleaning", desc: "A thorough top-to-bottom clean for move-ins, move-outs, or seasonal refresh.", items: ["Inside appliances & cabinets", "Baseboards & light fixtures", "Grout & tile scrubbing"] },
      { icon: "🏢", name: "Commercial Cleaning", desc: "Professional office and commercial space cleaning to keep your business pristine.", items: ["Office & workspace cleaning", "Restroom sanitization", "Flexible scheduling"] },
      { icon: "🎉", name: "Post-Event Cleaning", desc: "Fast turnaround cleaning after parties, events, and gatherings.", items: ["Same-day availability", "Full property reset", "Trash removal included"] },
    ],
    testimonials: [
      { text: "I've tried four different cleaning services and this is the only one I've kept. Reliable, thorough, and they remember exactly how I like things done.", name: "Jessica T.", location: "Homeowner", initials: "JT" },
      { text: "Our office has never been cleaner. The team is professional and discreet — they work around our schedule with zero disruption.", name: "Mark D.", location: "Office Manager", initials: "MD" },
      { text: "Booked a deep clean before selling my house. The place looked brand new. The realtor couldn't believe it was the same home!", name: "Andrea P.", location: "Homeowner", initials: "AP" },
    ],
  }

  if (ind.includes("bounce") || ind.includes("inflatable") || ind.includes("party") || ind.includes("rental") || ind.includes("jumper")) return {
    tagline:            "Bounce Houses, Inflatables & Party Rentals",
    heroHeadline:       "The Party Starts",
    heroHeadlineAccent: "Right Here!",
    heroSubtext:        "Bounce houses, giant slides, tables, chairs, and more — delivered and set up at your door. Serving " + (industry.includes(",") ? industry : "your area") + " for the most epic parties ever!",
    aboutHeadline:      "We Live for the Party!",
    aboutText:          "We're a family-owned party rental company that has been making birthdays, backyard bashes, and community events unforgettable. Every inflatable is cleaned, inspected, and set up by our friendly crew — so all you have to do is have fun.",
    guarantee:          "Satisfaction",
    services: [
      { icon: "🏰", name: "Bounce Houses",       desc: "Classic and themed bounce houses for all ages — the centerpiece of any great party.",   items: ["Multiple sizes & themes", "Safe for kids of all ages",    "Setup & takedown included"]    },
      { icon: "🌊", name: "Inflatable Slides",   desc: "Towering dry slides and splash-zone water slides that kids will line up for all day.",  items: ["Dry & wet slide options",  "Safe enclosed climb lanes",   "Available with water hookup"]  },
      { icon: "🪑", name: "Tables & Chairs",     desc: "Everything you need to seat your guests comfortably — folding tables and chairs for any event size.", items: ["6ft & 8ft folding tables", "White & natural chair options", "Delivery & pickup included"] },
      { icon: "🎠", name: "Combo Units",          desc: "Bounce house + slide combos for double the fun in one unit — perfect for bigger parties.", items: ["Bounce area + attached slide", "Obstacle course styles", "Water & dry configurations"]  },
      { icon: "🎪", name: "Obstacle Courses",    desc: "Giant inflatable obstacle courses perfect for birthday competitions and team events.",    items: ["Multiple course lengths",  "Side-by-side race format",    "Great for all age groups"]     },
      { icon: "🎊", name: "Party Packages",      desc: "Bundle everything together and save — we handle the full setup so your party is perfect.", items: ["Custom bundles & discounts", "Full delivery & setup crew",  "Linens & extras available"]   },
    ],
    testimonials: [
      { text: "My daughter's birthday was INCREDIBLE. The bounce house was huge, set up perfectly, and the kids didn't want to leave. Booking again next year for sure!", name: "Ashley R.", location: "Birthday Mom, " + "Local Area", initials: "AR" },
      { text: "Used them for our block party. Tables, chairs, AND two bounce houses — all on time, clean, and the crew was super friendly. Made our life so easy!", name: "Marcus T.", location: "Block Party Host", initials: "MT" },
      { text: "Best party rental company around! They showed up an hour early, set everything up beautifully, and the kids absolutely loved the water slide. 10/10!", name: "Priya K.", location: "Birthday Mom", initials: "PK" },
    ],
  }

  // Generic contractor/service default
  return {
    tagline:            "Professional Home Services",
    heroHeadline:       "Quality Work,",
    heroHeadlineAccent: "Guaranteed Results",
    heroSubtext:        "Licensed and insured professionals delivering expert service to homeowners in your area. Done right the first time.",
    aboutHeadline:      "Trusted Professionals in Your Community",
    aboutText:          "We're a locally owned company with years of experience serving homeowners throughout this area. Our team is licensed, insured, and committed to delivering quality results on every job.",
    guarantee:          "Satisfaction",
    services: [
      { icon: "🔧", name: "Service 1",  desc: "Professional service tailored to your needs.", items: ["Item one", "Item two", "Item three"] },
      { icon: "⚙️",  name: "Service 2", desc: "Expert solutions for your home or business.",  items: ["Item one", "Item two", "Item three"] },
      { icon: "🏠",  name: "Service 3", desc: "Reliable and professional every time.",          items: ["Item one", "Item two", "Item three"] },
      { icon: "✅",  name: "Service 4", desc: "Done right, on time, and on budget.",            items: ["Item one", "Item two", "Item three"] },
    ],
    testimonials: [
      { text: "Outstanding service from start to finish. Professional team, fair price, great result.", name: "Customer 1", location: "Homeowner", initials: "C1" },
      { text: "Called on a Monday, job was done by Wednesday. Exceeded my expectations in every way.", name: "Customer 2", location: "Homeowner", initials: "C2" },
      { text: "Highly professional, friendly staff, and excellent quality. Will definitely use again.", name: "Customer 3", location: "Homeowner", initials: "C3" },
    ],
  }
}

// ============================================
// FILL TEMPLATE
// Simple string replacement on {{VARIABLES}}
// ============================================
function fillTemplate(templateHtml, vars) {
  let html = templateHtml
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g")
    html = html.replace(regex, value || "")
  }
  return html
}

// ============================================
// CREATE CLIENT WEBSITE
// Main function — called by agentEngine tool
// ============================================
async function createClientWebsite(options) {
  const {
    slug,
    businessName,
    industry      = "landscaping",
    services      = [],
    phone         = "",
    email         = "",
    city          = "Your City",
    color         = "green",
    years         = "10",
    jobsDone      = "500+",
    clients       = "300",
    rating        = "4.9",
    formspreeId   = "xwkgjpzl",  // fallback Formspree ID
    deploy        = true,
    fetchMedia    = true,   // fetch real images via mediaManager
    downloadMedia = true,   // download to disk (true) or CDN URLs (false)
    fetchVideo    = false,  // fetch hero video from Pexels (needs PEXELS_API_KEY)
  } = options

  if (!slug)         throw new Error("slug is required")
  if (!businessName) throw new Error("businessName is required")

  // Pick template
  const templateType = pickTemplate(industry)
  const templateFile = path.join(TEMPLATES_DIR, `template-${templateType}.html`)

  if (!fs.existsSync(templateFile)) {
    throw new Error(`Template not found: template-${templateType}.html`)
  }

  const templateHtml = fs.readFileSync(templateFile, "utf8")

  // Get content defaults for this industry
  const defaults = getServiceDefaults(industry)

  // Party template needs 6 services; others need 4
  const isParty = templateType === "party"
  const minServices = isParty ? 6 : 4

  // Override defaults with any custom services passed in
  let svcList = defaults.services
  if (services && services.length >= 1) {
    svcList = services.map((s, i) => ({
      icon:  s.icon  || defaults.services[i]?.icon  || "🔧",
      name:  s.name  || defaults.services[i]?.name  || `Service ${i+1}`,
      desc:  s.desc  || defaults.services[i]?.desc  || "",
      items: s.items || defaults.services[i]?.items || ["Professional service", "Quality results", "Satisfaction guaranteed"],
    }))
  }
  // Pad to required count
  while (svcList.length < minServices) svcList.push(defaults.services[svcList.length % defaults.services.length] || defaults.services[0])

  const clr = resolveColor(color)

  // ── SCAFFOLD CLIENT FOLDER STRUCTURE ─────────
  createClientFolders(slug)   // idempotent — skips existing dirs

  // ── SAVE SITE.JSON (stores options for re-render) ────────────
  const clientDir0 = path.join(CLIENTS_DIR, slug)
  fs.writeFileSync(path.join(clientDir0, "site.json"), JSON.stringify({ ...options, deploy: false }, null, 2), "utf8")

  // ── APPLY CLIENT ASSET OVERRIDES ──────────────
  // Load client-uploaded assets FIRST so we can skip downloading slots
  // that the client has already provided — no wasted Unsplash downloads
  const clientAssets = getClientAssets(slug)

  // ── FETCH MEDIA ──────────────────────────────
  // Skip downloading any slot already covered by a client upload
  console.log(`📸 Fetching media for ${slug} (${industry})...`)
  let media
  try {
    media = await fetchClientMedia(slug, industry, { numServices: minServices })
  } catch (err) {
    console.log(`   ⚠️  Media check error: ${err.message} — continuing with no images`)
    media = { hero: null, about: null, services: Array(minServices).fill(null), video: null }
  }

  // Apply client uploads (overrides anything fetchClientMedia returned)
  if (clientAssets.hero)     media.hero    = clientAssets.hero
  if (clientAssets.about)    media.about   = clientAssets.about
  if (clientAssets.service1) media.services[0] = clientAssets.service1
  if (clientAssets.service2) media.services[1] = clientAssets.service2
  if (clientAssets.service3) media.services[2] = clientAssets.service3
  if (clientAssets.service4) media.services[3] = clientAssets.service4
  if (clientAssets.service5) media.services[4] = clientAssets.service5
  if (clientAssets.service6) media.services[5] = clientAssets.service6

  // ── LOGO HTML ──────────────────────────────────
  // If client has uploaded a logo, use <img>; otherwise use styled text
  const logoImgUrl = clientAssets.logo
  let LOGO_HTML
  if (logoImgUrl) {
    LOGO_HTML = `<img src="${logoImgUrl}" alt="${businessName}" style="max-height:48px;display:block;">`
  } else if (isParty) {
    LOGO_HTML = `<span class="logo-icon">🎪</span><span class="logo-text">${businessName}<span>!</span></span>`
  } else {
    LOGO_HTML = `${businessName}<span>.</span>`
  }

  // Build substitution map
  const vars = {
    // Business identity
    BUSINESS_NAME: businessName,
    LOGO_TEXT:     businessName,
    LOGO_HTML,
    TAGLINE:       defaults.tagline,
    CITY:          city,
    PHONE:         phone || "(555) 000-0000",
    PHONE_RAW:     (phone || "5550000000").replace(/\D/g, ""),
    EMAIL:         email || `info@${slug.replace(/-/g, "")}.com`,
    YEAR:          new Date().getFullYear().toString(),

    // Colors
    ACCENT_HEX:      clr.hex,
    ACCENT_HEX_DARK: clr.dark,
    ACCENT_GLOW:     clr.glow,

    // Hero
    HERO_HEADLINE:        defaults.heroHeadline,
    HERO_HEADLINE_ACCENT: defaults.heroHeadlineAccent,
    HERO_SUBTEXT:         defaults.heroSubtext,
    HERO_IMAGE_URL:       media.hero,        // ← real media
    HERO_IMAGE:           media.hero,

    // Party template: photo if available, placeholder if not
    HERO_GRAPHIC_HTML:    media.hero
      ? `<img src="${media.hero}" alt="${businessName} in action" class="hero-photo">`
      : `<div class="hero-graphic image-placeholder" aria-hidden="true" style="background:rgba(255,255,255,0.15);border:3px dashed rgba(255,255,255,0.4);border-radius:16px;padding:2rem;text-align:center;color:rgba(255,255,255,0.7);font-size:1rem;font-weight:700;">📷<br>Upload hero photo</div>`,

    // Stats (service template)
    YEARS:     years,
    JOBS_DONE: jobsDone,
    CLIENTS:   clients,
    RATING:    rating,
    // Stats (party template uses different labels)
    PARTIES:    jobsDone,
    HAPPY_KIDS: clients,

    // About
    ABOUT_IMAGE_URL: media.about,            // ← real media
    ABOUT_IMAGE:     media.about,
    ABOUT_HEADLINE:  defaults.aboutHeadline,
    ABOUT_TEXT:      defaults.aboutText,
    GUARANTEE:       defaults.guarantee,

    // Service images
    SERVICE_1_IMAGE: media.services[0] || "",
    SERVICE_2_IMAGE: media.services[1] || "",
    SERVICE_3_IMAGE: media.services[2] || "",
    SERVICE_4_IMAGE: media.services[3] || "",
    SERVICE_5_IMAGE: media.services[4] || "",
    SERVICE_6_IMAGE: media.services[5] || "",

    // Video (optional — empty string if not fetched)
    HERO_VIDEO_SRC: media.video?.src || "",

    // Services
    SERVICE_1_ICON:   svcList[0].icon,
    SERVICE_1_NAME:   svcList[0].name,
    SERVICE_1_DESC:   svcList[0].desc,
    SERVICE_1_ITEM_1: svcList[0].items[0],
    SERVICE_1_ITEM_2: svcList[0].items[1],
    SERVICE_1_ITEM_3: svcList[0].items[2],

    SERVICE_2_ICON:   svcList[1].icon,
    SERVICE_2_NAME:   svcList[1].name,
    SERVICE_2_DESC:   svcList[1].desc,
    SERVICE_2_ITEM_1: svcList[1].items[0],
    SERVICE_2_ITEM_2: svcList[1].items[1],
    SERVICE_2_ITEM_3: svcList[1].items[2],

    SERVICE_3_ICON:   svcList[2].icon,
    SERVICE_3_NAME:   svcList[2].name,
    SERVICE_3_DESC:   svcList[2].desc,
    SERVICE_3_ITEM_1: svcList[2].items[0],
    SERVICE_3_ITEM_2: svcList[2].items[1],
    SERVICE_3_ITEM_3: svcList[2].items[2],

    SERVICE_4_ICON:   svcList[3].icon,
    SERVICE_4_NAME:   svcList[3].name,
    SERVICE_4_DESC:   svcList[3].desc,
    SERVICE_4_ITEM_1: svcList[3].items[0],
    SERVICE_4_ITEM_2: svcList[3].items[1],
    SERVICE_4_ITEM_3: svcList[3].items[2],

    // Services 5-6 (party template only)
    SERVICE_5_ICON:   svcList[4]?.icon   || "",
    SERVICE_5_NAME:   svcList[4]?.name   || "",
    SERVICE_5_DESC:   svcList[4]?.desc   || "",
    SERVICE_5_ITEM_1: svcList[4]?.items[0] || "",
    SERVICE_5_ITEM_2: svcList[4]?.items[1] || "",
    SERVICE_5_ITEM_3: svcList[4]?.items[2] || "",

    SERVICE_6_ICON:   svcList[5]?.icon   || "",
    SERVICE_6_NAME:   svcList[5]?.name   || "",
    SERVICE_6_DESC:   svcList[5]?.desc   || "",
    SERVICE_6_ITEM_1: svcList[5]?.items[0] || "",
    SERVICE_6_ITEM_2: svcList[5]?.items[1] || "",
    SERVICE_6_ITEM_3: svcList[5]?.items[2] || "",

    // Testimonials
    TESTIMONIAL_1_TEXT:     defaults.testimonials[0].text,
    TESTIMONIAL_1_NAME:     defaults.testimonials[0].name,
    TESTIMONIAL_1_LOCATION: defaults.testimonials[0].location,
    TESTIMONIAL_1_INITIALS: defaults.testimonials[0].initials,

    TESTIMONIAL_2_TEXT:     defaults.testimonials[1].text,
    TESTIMONIAL_2_NAME:     defaults.testimonials[1].name,
    TESTIMONIAL_2_LOCATION: defaults.testimonials[1].location,
    TESTIMONIAL_2_INITIALS: defaults.testimonials[1].initials,

    TESTIMONIAL_3_TEXT:     defaults.testimonials[2].text,
    TESTIMONIAL_3_NAME:     defaults.testimonials[2].name,
    TESTIMONIAL_3_LOCATION: defaults.testimonials[2].location,
    TESTIMONIAL_3_INITIALS: defaults.testimonials[2].initials,

    // Form
    FORMSPREE_ID: formspreeId,

    // Chatbot — Tidio script block (empty string if not configured)
    CHATBOT_SCRIPT: chatbotManager.buildChatbotScript(slug, {
      businessName: businessName,
      phone:        phone,
      email:        email,
      city:         city,
      services:     svcList.map(s => s.name),
    }),
  }

  // Fill and write
  const filled = fillTemplate(templateHtml, vars)

  const clientDir = path.join(CLIENTS_DIR, slug)
  fs.mkdirSync(clientDir, { recursive: true })

  const outputPath = path.join(clientDir, "index.html")
  fs.writeFileSync(outputPath, filled, "utf8")

  console.log(`✅ Website created: website/clients/${slug}/index.html`)
  console.log(`   Template: ${templateType} | Color: ${color} | Industry: ${industry}`)

  // Generate sitemap.json for client requests system
  try {
    const { generateSitemap } = require("./clientRequests")
    generateSitemap(slug)
    console.log(`   📋 Sitemap generated for ${slug}`)
  } catch (err) {
    // Non-fatal — sitemap generation is best-effort
  }

  // Deploy via git
  let deployResult = null
  if (deploy) {
    try {
      deployResult = await deployWebsite(`New client website: ${businessName} (${slug})`)
      console.log(`🚀 Deployed: ${slug}`)
    } catch (err) {
      console.log(`⚠️  Deploy failed: ${err.message}`)
    }
  }

  return {
    success:      true,
    slug,
    businessName,
    templateType,
    outputPath,
    url:          `https://jordan-ai.co/clients/${slug}/`,
    deployed:     !!deployResult?.success,
    deployError:  deployResult?.error || null,
  }
}

// ============================================
// ANALYZE IMAGE STYLE
// Uses Claude vision to extract colors + style
// ============================================
async function analyzeImageStyle(imageUrl) {
  const Anthropic = require("@anthropic-ai/sdk")
  const { imageUrlToBase64 } = require("./assetManager")

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  console.log(`🎨 Analyzing image style: ${imageUrl.substring(0, 80)}...`)

  // Download the image and convert to base64
  const { base64, mediaType } = await imageUrlToBase64(imageUrl)

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        },
        {
          type: "text",
          text: `Analyze this image for website design. Extract brand colors and style.

Return ONLY valid JSON (no markdown, no explanation):
{
  "primaryHex": "#xxxxxx",
  "accentHex": "#xxxxxx",
  "darkHex": "#xxxxxx",
  "style": "modern|playful|professional|rustic|bold|elegant|minimal",
  "mood": "one sentence describing the feel",
  "industry": "most likely industry (e.g. landscaping, party rentals, dental, restaurant)",
  "templateType": "service|party|professional",
  "suggestedTagline": "short punchy tagline matching the brand style",
  "colorName": "one word color name e.g. forest, crimson, navy, gold"
}

Rules:
- primaryHex: the most dominant/important color
- accentHex: a strong accent color good for buttons and highlights
- darkHex: a darker version of the primary for hover states
- templateType: "party" for fun/colorful brands, "professional" for clean/corporate, "service" for trades/contractors
- If this looks like a logo, extract the logo's primary colors
- Provide real hex codes only`,
        },
      ],
    }],
  })

  const raw = response.content[0]?.text || "{}"
  // Strip markdown code fences if Claude wraps it anyway
  const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()

  try {
    const result = JSON.parse(clean)
    console.log(`   ✅ Style: ${result.style} | Primary: ${result.primaryHex} | Accent: ${result.accentHex}`)
    return result
  } catch {
    console.log(`   ⚠️  Could not parse style JSON, using defaults`)
    return { primaryHex: "#22c55e", accentHex: "#22c55e", style: "modern", industry: "service", templateType: "service" }
  }
}

// ============================================
// DESIGN WEBSITE FROM IMAGE
// Full pipeline: analyze → create → deploy
// ============================================
async function designWebsiteFromImage(options) {
  const {
    slug,
    businessName,
    imageUrl,
    industry,        // optional override — falls back to image analysis
    phone   = "",
    email   = "",
    city    = "Your City",
    years   = "10",
    jobsDone = "500+",
    clients  = "300",
    rating   = "4.9",
    deploy   = true,
  } = options

  if (!slug)         throw new Error("slug is required")
  if (!businessName) throw new Error("businessName is required")
  if (!imageUrl)     throw new Error("imageUrl is required")

  // Analyze the image
  const style = await analyzeImageStyle(imageUrl)

  // Upload the source image as a brand/misc asset
  const { uploadClientAsset } = require("./assetManager")
  let brandAssetUrl = imageUrl  // fallback to original URL if upload fails
  try {
    const uploaded = await uploadClientAsset(slug, "misc", imageUrl, "brand-reference.jpg")
    brandAssetUrl = uploaded.relUrl
  } catch (err) {
    console.log(`   ⚠️  Could not save brand image: ${err.message}`)
  }

  // Build color object from analysis
  const color = {
    hex:  style.accentHex  || style.primaryHex || "#22c55e",
    dark: style.darkHex    || hexDarken(style.accentHex || "#22c55e"),
    glow: hexGlow(style.accentHex || "#22c55e"),
  }

  // Determine industry + template — prefer explicit override, fall back to analysis
  const finalIndustry = industry || style.industry || "service"

  // Create the website with analyzed colors + style
  const result = await createClientWebsite({
    slug,
    businessName,
    industry:  finalIndustry,
    phone,
    email,
    city,
    color:     color.hex,      // resolveColor handles raw hex
    years,
    jobsDone,
    clients,
    rating,
    deploy,
    fetchMedia:    true,
    downloadMedia: true,
  })

  return {
    ...result,
    imageAnalysis: style,
    colorApplied:  color.hex,
    templateType:  result.templateType,
    styleNotes:    `${style.style} / ${style.mood || ""}`.trim(),
  }
}

// ============================================
// LIST CLIENT WEBSITES
// ============================================
function listClientWebsites() {
  if (!fs.existsSync(CLIENTS_DIR)) return []
  return fs.readdirSync(CLIENTS_DIR)
    .filter(f => {
      try { return fs.statSync(path.join(CLIENTS_DIR, f)).isDirectory() } catch { return false }
    })
    .filter(slug => fs.existsSync(path.join(CLIENTS_DIR, slug, "index.html")))
    .map(slug => ({
      slug,
      url:     `https://jordan-ai.co/clients/${slug}/`,
      created: fs.statSync(path.join(CLIENTS_DIR, slug, "index.html")).mtime,
    }))
    .sort((a, b) => b.created - a.created)
}

// ============================================
// FORMAT FOR DISCORD
// ============================================
function formatWebsiteResult(result) {
  if (!result.success) return `❌ Website creation failed: ${result.error}`

  const lines = [
    `**✅ Website Created: ${result.businessName}**`,
    ``,
    `🎨 Template: \`${result.templateType}\``,
    `🔗 URL: ${result.url}`,
    `📁 File: \`website/clients/${result.slug}/index.html\``,
    result.deployed ? `🚀 Live on jordan-ai.co` : `⚠️ Deploy pending — run \`!deploy\` to push`,
  ]

  if (result.styleNotes) {
    lines.splice(3, 0, `🖌️ Style: \`${result.styleNotes}\``)
    lines.splice(4, 0, `🎨 Color extracted: \`${result.colorApplied}\``)
  }

  return lines.join("\n")
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  createClientWebsite,
  designWebsiteFromImage,
  analyzeImageStyle,
  listClientWebsites,
  formatWebsiteResult,
  pickTemplate,
  COLOR_PRESETS,
}
