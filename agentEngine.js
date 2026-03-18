// ============================================
// JORDAN AI - AGENT ENGINE
// The core brain that makes Jordan AI autonomous
//
// MODEL SELECTION:
// - Opus = client work, creative, building (most powerful)
// - Sonnet = routine tasks, daily checks (cheaper)
// - GPT-4o-mini = sub-agents, content generation (cheapest)
// ============================================

require("dotenv").config()
const Anthropic = require("@anthropic-ai/sdk")
const OpenAI = require("openai")
const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

// Import all existing modules as tools
const leadScraper      = require("./leadScraper")
const websiteGenerator = require("./websiteGenerator")
const mediaManager     = require("./mediaManager")
const assetManager     = require("./assetManager")
const wp = require("./wordpressManager")
const email = require("./emailManager")
const crm = require("./crm")
const billing = require("./billingManager")
const social = require("./socialManager")
const fulfill = require("./fulfillment")
const { createBlogPost, createHomepage, createBlogIndex, createProductsIndex } = require("./websiteBuilder")
const { deployWebsite } = require("./gitDeploy")
const { addMemory, loadPersona } = require("./ceoBrain")
const taskQueue = require("./taskQueue")

// ============================================
// AI CLIENTS
// ============================================
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ============================================
// MODEL SELECTION
// ============================================
const MODELS = {
  opus: "claude-opus-4-20250514",
  sonnet: "claude-sonnet-4-20250514"
}

const OPUS_TRIGGERS = [
  "demo", "client", "website", "landing page", "design",
  "build", "create", "proposal", "pitch", "reino",
  "professional", "premium", "custom", "new client",
  "paying client", "first client", "redesign", "html"
]

function selectModel(goal) {
  const goalLower = goal.toLowerCase()
  const needsOpus = OPUS_TRIGGERS.some(trigger => goalLower.includes(trigger))
  const model = needsOpus ? MODELS.opus : MODELS.sonnet
  console.log(`   🧠 Model: ${needsOpus ? "OPUS (client work)" : "SONNET (routine)"}`)
  return model
}

// ============================================
// AGENT STATE
// ============================================
const AGENT_LOG = path.join(__dirname, "agent-log.json")
const MAX_STEPS_PER_RUN = 15
const MAX_DAILY_RUNS = 10

let agentState = {
  runsToday: 0,
  totalRuns: 0,
  lastRun: null,
  isRunning: false,
  currentGoal: null
}

function loadAgentLog() {
  try {
    if (fs.existsSync(AGENT_LOG)) return JSON.parse(fs.readFileSync(AGENT_LOG, "utf8"))
  } catch (err) {}
  return { runs: [], decisions: [], errors: [] }
}

function saveAgentLog(log) {
  if (log.runs.length > 100) log.runs = log.runs.slice(-100)
  if (log.decisions.length > 500) log.decisions = log.decisions.slice(-500)
  if (log.errors.length > 100) log.errors = log.errors.slice(-100)
  fs.writeFileSync(AGENT_LOG, JSON.stringify(log, null, 2))
}

// ============================================
// SAFETY GUARDRAILS
// ============================================
const GUARDRAILS = {
  needsApproval: [
    "billing_create_subscription",
    "billing_cancel_subscription",
    "crm_remove_client"
  ],
  maxStepsPerRun: MAX_STEPS_PER_RUN,
  protectedFiles: ["index.js", "agentEngine.js", ".env", "package.json"],
  maxEmailsPerHour: 10,
  emailsSentThisHour: 0
}

function needsApproval(toolName) {
  return GUARDRAILS.needsApproval.includes(toolName)
}

setInterval(() => { GUARDRAILS.emailsSentThisHour = 0 }, 60 * 60 * 1000)

// ============================================
// TOOL DEFINITIONS
// ============================================
const TOOLS = [
  {
    name: "check_business_status",
    description: "Get a full overview of the business: CRM stats, revenue, pipeline, follow-ups due, product sales, email stats.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "check_client_details",
    description: "Get full details about a specific client from the CRM.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Client slug identifier" }
      },
      required: ["slug"]
    }
  },
  {
    name: "check_wordpress_site",
    description: "Check the status of a client's WordPress site.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "WordPress client slug" }
      },
      required: ["slug"]
    }
  },
  {
    name: "check_sales",
    description: "Check Stripe for any new product sales.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "read_file",
    description: "Read the contents of a file from the project directory.",
    input_schema: {
      type: "object",
      properties: {
        filepath: { type: "string", description: "Path relative to project root" }
      },
      required: ["filepath"]
    }
  },
  {
    name: "list_directory",
    description: "List files in a directory.",
    input_schema: {
      type: "object",
      properties: {
        dirpath: { type: "string", description: "Directory path relative to project root" }
      },
      required: ["dirpath"]
    }
  },
  {
    name: "wp_create_post",
    description: "Write and publish a blog post to a client's WordPress site.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "WordPress client slug" },
        topic: { type: "string", description: "Blog post topic" },
        categories: { type: "array", items: { type: "string" } }
      },
      required: ["slug", "topic"]
    }
  },
  {
    name: "wp_create_page",
    description: "Create a new page on a client's WordPress site.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "WordPress client slug" },
        topic: { type: "string", description: "Page topic with full context" }
      },
      required: ["slug", "topic"]
    }
  },
  {
    name: "wp_publish_draft",
    description: "Publish a draft post on a client's WordPress site.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "WordPress client slug" },
        post_id: { type: "number", description: "Post ID to publish" }
      },
      required: ["slug", "post_id"]
    }
  },
  {
    name: "wp_list_drafts",
    description: "List all draft posts on a client's WordPress site.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "WordPress client slug" }
      },
      required: ["slug"]
    }
  },
  {
    name: "send_email",
    description: "Send an email to anyone.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body (plain text)" }
      },
      required: ["to", "subject", "body"]
    }
  },
  {
    name: "send_proposal",
    description: "Send a professional branded proposal email.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        client_name: { type: "string", description: "Contact person name" },
        business_name: { type: "string", description: "Business name" },
        services: { type: "string", description: "Comma-separated services with prices" }
      },
      required: ["to", "client_name", "business_name", "services"]
    }
  },
  {
    name: "send_monthly_report",
    description: "Send a monthly report email to a client.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string" },
        client_name: { type: "string" },
        business_name: { type: "string" },
        posts_published: { type: "number" },
        highlights: { type: "string" }
      },
      required: ["to", "client_name", "business_name", "posts_published"]
    }
  },
  {
    name: "send_invoice_email",
    description: "Send an invoice email to a client.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string" },
        client_name: { type: "string" },
        business_name: { type: "string" },
        items: { type: "string" }
      },
      required: ["to", "client_name", "business_name", "items"]
    }
  },
  {
    name: "ai_write_and_send_email",
    description: "Have AI compose and send an email based on purpose and context.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string" },
        purpose: { type: "string" },
        context: { type: "string" }
      },
      required: ["to", "purpose", "context"]
    }
  },
  {
    name: "crm_add_client",
    description: "Add a new client to the CRM database.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        business_name: { type: "string" },
        contact_name: { type: "string" },
        email: { type: "string" },
        industry: { type: "string" },
        monthly_value: { type: "number" }
      },
      required: ["slug", "business_name"]
    }
  },
  {
    name: "crm_update_stage",
    description: "Move a client to a new pipeline stage.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        stage: { type: "string" }
      },
      required: ["slug", "stage"]
    }
  },
  {
    name: "crm_add_note",
    description: "Add a note to a client's CRM record.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        note: { type: "string" }
      },
      required: ["slug", "note"]
    }
  },
  {
    name: "crm_set_followup",
    description: "Set a follow-up date for a client.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        when: { type: "string" }
      },
      required: ["slug", "when"]
    }
  },
  {
    name: "billing_create_customer",
    description: "Create a Stripe customer from CRM data. NEEDS APPROVAL.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" }
      },
      required: ["slug"]
    }
  },
  {
    name: "billing_create_subscription",
    description: "Create a recurring subscription in Stripe. NEEDS APPROVAL.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        items: { type: "string" }
      },
      required: ["slug", "items"]
    }
  },
  {
    name: "billing_get_revenue",
    description: "Get current revenue stats from Stripe.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "social_write_and_post",
    description: "Have AI write and post to social media.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        platform: { type: "string" }
      },
      required: ["topic"]
    }
  },
  {
    name: "create_blog_post",
    description: "Create a blog post on the Jordan AI website.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" }
      },
      required: ["title", "content"]
    }
  },
  {
    name: "deploy_website",
    description: "Push the website to GitHub for Vercel deployment.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string" }
      },
      required: ["message"]
    }
  },
  {
    name: "write_file",
    description: "Write content to a file. CRITICAL RULES: (1) You MUST include BOTH filepath AND content in the SAME call. (2) content must be the COMPLETE file — for HTML, the full document from <!DOCTYPE html> to </html>. (3) There is NO way to write content in a second call — it is all-or-nothing. (4) If you call this without content, it will FAIL and you will need to call it again with the full content anyway. Just include the content now.",
    input_schema: {
      type: "object",
      properties: {
        filepath: { type: "string", description: "Path relative to project root (e.g., website/demos/client.html)" },
        content: { type: "string", description: "REQUIRED: The COMPLETE file content. For HTML, include the full document. Cannot be empty." }
      },
      required: ["filepath", "content"]
    }
  },
  {
    name: "run_shell_command",
    description: "Run a shell command. NEEDS APPROVAL.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string" }
      },
      required: ["command"]
    }
  },
  {
    name: "delegate_blog_post",
    description: "Delegate a blog post to the Writer sub-agent (GPT-4o-mini).",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        topic: { type: "string" }
      },
      required: ["slug", "topic"]
    }
  },
  {
    name: "delegate_page",
    description: "Delegate page creation to the Builder sub-agent.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        topic: { type: "string" }
      },
      required: ["slug", "topic"]
    }
  },
  {
    name: "delegate_email",
    description: "Delegate an email to the Sales sub-agent.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string" },
        purpose: { type: "string" },
        context: { type: "string" }
      },
      required: ["to", "purpose", "context"]
    }
  },
  {
    name: "delegate_social_post",
    description: "Delegate a social post to the Writer sub-agent.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string" }
      },
      required: ["topic"]
    }
  },
  {
    name: "delegate_monthly_report",
    description: "Delegate a monthly report to the Support sub-agent.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string" },
        client_name: { type: "string" },
        business_name: { type: "string" },
        posts_published: { type: "number" },
        highlights: { type: "string" }
      },
      required: ["to", "client_name", "business_name"]
    }
  },
  {
    name: "delegate_deploy",
    description: "Delegate a deploy to the Builder sub-agent.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string" }
      },
      required: ["message"]
    }
  },
  {
    name: "check_task_queue",
    description: "Check the status of delegated tasks.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "save_memory",
    description: "Save an important fact to long-term memory.",
    input_schema: {
      type: "object",
      properties: {
        fact: { type: "string" },
        category: { type: "string" }
      },
      required: ["fact"]
    }
  },
  {
    name: "think_deeply",
    description: "Think carefully about a complex decision before acting.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string" },
        context: { type: "string" }
      },
      required: ["question"]
    }
  },
  {
    name: "scrape_leads",
    description: "Search Google Maps/Places for local businesses in a specific industry and city, and add them to the CRM as prospects.",
    input_schema: {
      type: "object",
      properties: {
        industry: { type: "string", description: "Business type to search for (e.g. 'dentist', 'restaurant', 'landscaping company')" },
        city: { type: "string", description: "City and state to search in (e.g. 'Columbia, SC')" },
        max_leads: { type: "number", description: "Max leads to add (default 10, max 20)" }
      },
      required: ["industry"]
    }
  },
  {
    name: "outreach_leads",
    description: "Send personalized outreach emails to CRM prospects who haven't been contacted yet. AI writes each email based on their business.",
    input_schema: {
      type: "object",
      properties: {
        max_emails: { type: "number", description: "Max emails to send in this batch (default 5)" },
        service_pitch: { type: "string", description: "Which service to pitch (e.g. 'AI chatbot', 'SEO blog content', 'website management')" }
      },
      required: []
    }
  },
  {
    name: "create_client_website",
    description: "Build a premium, fully-designed website for a client using a professional dark-theme template. Fills in their business details and deploys to jordan-ai.co/clients/[slug]/. Use this when a client signs up or you want to demo a website to a prospect.",
    input_schema: {
      type: "object",
      properties: {
        slug:         { type: "string",  description: "URL-safe identifier, e.g. 'green-peak-landscaping'" },
        businessName: { type: "string",  description: "Full business name, e.g. 'Green Peak Landscaping'" },
        industry:     { type: "string",  description: "Industry/type: landscaping, cleaning, dental, restaurant, contractor, etc." },
        phone:        { type: "string",  description: "Phone number, e.g. '(512) 555-0194'" },
        email:        { type: "string",  description: "Business email address" },
        city:         { type: "string",  description: "City and state, e.g. 'Austin, TX'" },
        color:        { type: "string",  description: "Accent color: green, blue, orange, red, purple, teal, gold, cyan, rose, indigo — or a hex code like #22c55e" },
        years:        { type: "string",  description: "Years in business, e.g. '12'" },
        jobsDone:     { type: "string",  description: "Jobs completed stat, e.g. '850+'" },
        clients:      { type: "string",  description: "Happy clients count, e.g. '400'" },
        rating:       { type: "string",  description: "Average rating, e.g. '4.9'" },
        deploy:       { type: "boolean", description: "Whether to deploy to Vercel after creation (default true)" }
      },
      required: ["slug", "businessName"]
    }
  },
  {
    name: "fetch_client_media",
    description: "Fetch and download industry-relevant photos for a client website. Downloads real images from Unsplash (with API key) or uses curated CDN fallbacks (no key needed). Call this before or after create_client_website to refresh images.",
    input_schema: {
      type: "object",
      properties: {
        slug:          { type: "string",  description: "Client slug matching their website folder" },
        industry:      { type: "string",  description: "Industry: landscaping, cleaning, dental, restaurant, bounce house, contractor, etc." },
        numServices:   { type: "number",  description: "Number of service images to fetch (default 4)" },
        downloadImages:{ type: "boolean", description: "Download images to disk (true, default) or just return CDN URLs (false)" },
        fetchVideo:    { type: "boolean", description: "Also fetch a hero background video from Pexels (needs PEXELS_API_KEY)" },
      },
      required: ["slug", "industry"]
    }
  },
  {
    name: "upload_client_assets",
    description: "Upload a client-provided logo, photo, or video into the correct subfolder of their organized asset library. Source can be a URL (Discord attachment, Google Drive, Dropbox) or local path. After uploading, call place_asset_on_site to apply it.",
    input_schema: {
      type: "object",
      properties: {
        slug:     { type: "string", description: "Client slug e.g. 'green-peak-landscaping'" },
        type:     { type: "string", description: "Asset category: 'hero' | 'about' | 'service' | 'gallery' | 'team' | 'misc' | 'video-hero' | 'video-content' | 'logo'" },
        source:   { type: "string", description: "URL to download or absolute local file path" },
        filename: { type: "string", description: "Override filename e.g. 'main.png' or 'hero.jpg'. Auto-generated if omitted." },
      },
      required: ["slug", "type", "source"]
    }
  },
  {
    name: "place_asset_on_site",
    description: "Place an uploaded client asset on their website at a specific location (hero, about, logo, service1..6). Re-renders and deploys the site automatically.",
    input_schema: {
      type: "object",
      properties: {
        slug:     { type: "string", description: "Client slug e.g. 'green-peak-landscaping'" },
        filename: { type: "string", description: "The asset filename e.g. 'hero.jpg' or 'logo.png'" },
        location: { type: "string", description: "'hero' | 'about' | 'logo' | 'service1' | 'service2' | 'service3' | 'service4' | 'service5' | 'service6'" },
      },
      required: ["slug", "filename", "location"]
    }
  },
  {
    name: "design_website_from_image",
    description: "Analyze an image (logo, brand photo, reference design, or inspiration) using Claude vision to extract colors and style, then build a complete website that matches that visual identity. Use this when a client says 'design around my logo' or 'match this style' or sends a brand image.",
    input_schema: {
      type: "object",
      properties: {
        slug:         { type: "string",  description: "Client slug e.g. 'green-peak-landscaping'" },
        businessName: { type: "string",  description: "Business display name" },
        imageUrl:     { type: "string",  description: "URL of the image to analyze (Discord attachment URL, logo URL, etc.)" },
        industry:     { type: "string",  description: "Override detected industry if known (optional — auto-detected from image if omitted)" },
        phone:        { type: "string",  description: "Business phone number" },
        email:        { type: "string",  description: "Business email" },
        city:         { type: "string",  description: "City/service area" },
        deploy:       { type: "boolean", description: "Deploy to live site after building (default true)" },
      },
      required: ["slug", "businessName", "imageUrl"]
    }
  },
  {
    name: "analyze_image_style",
    description: "Analyze an image with Claude vision to extract brand colors, style, mood, and industry. Returns hex colors, style keywords, and template recommendation. Use this to preview what design_website_from_image will produce.",
    input_schema: {
      type: "object",
      properties: {
        imageUrl: { type: "string", description: "URL of the image to analyze" },
      },
      required: ["imageUrl"]
    }
  }
]

// ============================================
// TOOL EXECUTION
// ============================================
async function executeTool(toolName, toolInput) {
  console.log(`   🔧 Tool: ${toolName}`)
  console.log(`   📥 Input: ${JSON.stringify(toolInput).substring(0, 500)}`)
  
  try {
    switch (toolName) {
      case "check_business_status": {
        const crmStats = crm.getDashboardStats()
        const followUps = crm.getFollowUpsDue()
        const fulfillStats = fulfill.getFulfillmentStats()
        const emailStats = email.getEmailStats()
        const clients = crm.listAllClients()
        
        let revenueInfo = "Stripe not checked"
        if (billing.isConfigured()) {
          try {
            const rev = await billing.getRevenueStats()
            revenueInfo = `MRR: $${rev.mrr}, Active subs: ${rev.activeSubscriptions}`
          } catch (err) { revenueInfo = `Error: ${err.message}` }
        }
        
        return {
          crm: {
            totalClients: crmStats.totalClients,
            activeClients: crmStats.activeClients,
            mrr: crmStats.mrr,
            pipelineValue: crmStats.pipelineValue,
            followUpsDue: followUps.length,
            followUps: followUps.map(f => ({ slug: f.slug, business: f.businessName, due: f.nextFollowUp })),
            byStage: crmStats.byStage
          },
          revenue: revenueInfo,
          products: fulfillStats,
          emails: emailStats,
          clients: clients.map(c => ({ slug: c.slug, business: c.businessName, stage: c.stage, value: c.monthlyValue })),
          wpClients: Object.keys(wp.listClients())
        }
      }
      
      case "check_client_details": {
        const client = crm.getClient(toolInput.slug)
        if (!client) return { error: `Client "${toolInput.slug}" not found` }
        const wpInfo = wp.getClient(toolInput.slug)
        const billingInfo = billing.getCustomerInfo(toolInput.slug)
        return { client, wordpress: wpInfo ? "connected" : "not connected", billing: billingInfo }
      }
      
      case "check_wordpress_site": {
        return await wp.getSiteStatus(toolInput.slug)
      }
      
      case "check_sales": {
        return await fulfill.checkForNewSales()
      }
      
      case "read_file": {
        const fullPath = path.join(__dirname, toolInput.filepath)
        if (!fs.existsSync(fullPath)) return { error: `File not found: ${toolInput.filepath}` }
        const content = fs.readFileSync(fullPath, "utf8")
        return { filepath: toolInput.filepath, content: content.substring(0, 15000), truncated: content.length > 15000 }
      }
      
      case "list_directory": {
        const fullPath = path.join(__dirname, toolInput.dirpath || ".")
        if (!fs.existsSync(fullPath)) return { error: `Directory not found: ${toolInput.dirpath}` }
        const files = fs.readdirSync(fullPath)
        return { directory: toolInput.dirpath || ".", files }
      }
      
      case "wp_create_post": {
        return await wp.writeAndPublish(toolInput.slug, toolInput.topic, openai, {
          type: "post",
          categories: toolInput.categories || ["Blog"]
        })
      }
      
      case "wp_create_page": {
        return await wp.writeAndPublish(toolInput.slug, toolInput.topic, openai, { type: "page" })
      }
      
      case "wp_publish_draft": {
        return await wp.publishDraft(toolInput.slug, toolInput.post_id)
      }
      
      case "wp_list_drafts": {
        const result = await wp.listPosts(toolInput.slug, { status: "draft" })
        if (result.success) {
          return { drafts: result.data.map(d => ({ id: d.id, title: d.title.rendered, date: d.date })) }
        }
        return result
      }
      
      case "send_email": {
        if (GUARDRAILS.emailsSentThisHour >= GUARDRAILS.maxEmailsPerHour) {
          return { error: "Email rate limit reached (10/hour)" }
        }
        const htmlBody = toolInput.body.split("\n").filter(l => l.trim()).map(l => `<p>${l}</p>`).join("")
        const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">${htmlBody}<br><p style="color:#888;font-size:13px">— Jordan AI Team</p></body></html>`
        GUARDRAILS.emailsSentThisHour++
        return await email.sendEmail(toolInput.to, toolInput.subject, html)
      }
      
      case "send_proposal": {
        const services = []; const pricing = []
        toolInput.services.split(",").map(s => s.trim()).forEach(s => {
          const [name, price] = s.split(":").map(p => p.trim())
          services.push({ name, description: `Monthly ${name.toLowerCase()} service` })
          pricing.push({ item: name, amount: `$${price}/mo` })
        })
        GUARDRAILS.emailsSentThisHour++
        return await email.sendProposal(toolInput.to, toolInput.client_name, toolInput.business_name, services, pricing)
      }
      
      case "send_monthly_report": {
        const data = {
          postsPublished: toolInput.posts_published || 0,
          highlights: toolInput.highlights ? toolInput.highlights.split(",").map(h => h.trim()) : [],
          nextMonth: ["Continue weekly blog publishing", "Monitor keyword rankings", "Optimize existing content"]
        }
        GUARDRAILS.emailsSentThisHour++
        return await email.sendMonthlyReport(toolInput.to, toolInput.client_name, toolInput.business_name, data)
      }
      
      case "send_invoice_email": {
        const items = toolInput.items.split(",").map(s => {
          const [desc, amt] = s.trim().split(":").map(p => p.trim())
          return { description: desc, amount: parseInt(amt) || 0 }
        })
        GUARDRAILS.emailsSentThisHour++
        return await email.sendInvoice(toolInput.to, toolInput.client_name, toolInput.business_name, items)
      }
      
      case "ai_write_and_send_email": {
        GUARDRAILS.emailsSentThisHour++
        return await email.writeAndSendEmail(toolInput.to, toolInput.purpose, toolInput.context, openai)
      }
      
      case "crm_add_client": {
        return crm.addClient(toolInput.slug, {
          businessName: toolInput.business_name,
          contactName: toolInput.contact_name || "",
          email: toolInput.email || "",
          industry: toolInput.industry || "",
          monthlyValue: toolInput.monthly_value || 0
        })
      }
      
      case "crm_update_stage": {
        const result = crm.updateClient(toolInput.slug, { stage: toolInput.stage })
        return result ? { success: true, stage: toolInput.stage } : { error: "Client not found" }
      }
      
      case "crm_add_note": {
        return crm.addNote(toolInput.slug, toolInput.note) ? { success: true } : { error: "Client not found" }
      }
      
      case "crm_set_followup": {
        return crm.setFollowUp(toolInput.slug, toolInput.when) ? { success: true } : { error: "Failed to set follow-up" }
      }
      
      case "billing_create_customer": {
        const client = crm.getClient(toolInput.slug)
        if (!client) return { error: "Client not in CRM" }
        if (!client.email) return { error: "Client has no email in CRM" }
        return await billing.createCustomer(toolInput.slug, client.businessName, client.email)
      }
      
      case "billing_create_subscription": {
        const items = toolInput.items.split(",").map(s => {
          const [name, price] = s.trim().split(":").map(p => p.trim())
          return { name, amount: parseInt(price) || 0 }
        })
        return await billing.createSubscription(toolInput.slug, items)
      }
      
      case "billing_get_revenue": {
        return await billing.getRevenueStats()
      }
      
      case "social_write_and_post": {
        return await social.writeAndPost(toolInput.topic, openai, { platform: toolInput.platform || "all" })
      }
      
      case "create_blog_post": {
        const result = await createBlogPost(toolInput.title, toolInput.content)
        if (result && result.success) await createBlogIndex()
        return result
      }
      
      case "deploy_website": {
        try {
          execSync("git add .", { cwd: __dirname, timeout: 15000 })
          execSync(`git commit -m "${toolInput.message || 'Jordan AI deploy'}"`, { cwd: __dirname, timeout: 15000 })
          const output = execSync("git push", { cwd: __dirname, timeout: 30000, encoding: "utf8" })
          return { success: true, message: "Deployed to GitHub.", output: output.substring(0, 500) }
        } catch (err) {
          if (err.message.includes("nothing to commit")) {
            return { success: true, message: "No changes to deploy." }
          }
          return { error: `Deploy failed: ${err.message.substring(0, 300)}` }
        }
      }
      
      case "write_file": {
        console.log("   📝 WRITE_FILE CALLED")
        console.log("   📁 Filepath:", toolInput.filepath)
        console.log("   📄 Content length:", toolInput.content ? toolInput.content.length : "NO CONTENT")
        
        const basename = path.basename(toolInput.filepath || "")
        if (GUARDRAILS.protectedFiles.includes(basename)) {
          return { error: `Cannot modify protected file: ${basename}` }
        }
        
        if (!toolInput.filepath) {
          return { error: "No filepath provided. Call write_file again with both filepath and content." }
        }
        if (!toolInput.content || toolInput.content.length === 0) {
          return { error: "RETRY REQUIRED: You called write_file without content. Call write_file again RIGHT NOW with the COMPLETE file content in the content parameter. Do not do anything else first." }
        }
        if (toolInput.content.length < 100) {
          return { error: `RETRY REQUIRED: Content is only ${toolInput.content.length} characters — too short to be a complete file. Call write_file again with the FULL content.` }
        }
        
        try {
          const fullPath = path.join(__dirname, toolInput.filepath)
          const dir = path.dirname(fullPath)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(fullPath, toolInput.content)
          console.log("   ✅ File written successfully:", fullPath)
          return { success: true, filepath: toolInput.filepath, bytesWritten: toolInput.content.length }
        } catch (writeErr) {
          console.log("   ❌ Write error:", writeErr.message)
          return { error: `Write failed: ${writeErr.message}` }
        }
      }
      
      case "run_shell_command": {
        const dangerous = ["rm -rf", "rm -r /", "del /f", "format", "mkfs", "> /dev"]
        if (dangerous.some(d => toolInput.command.includes(d))) {
          return { error: "Dangerous command blocked" }
        }
        try {
          const output = execSync(toolInput.command, { 
            cwd: __dirname, 
            timeout: 30000,
            encoding: "utf8",
            maxBuffer: 1024 * 1024
          })
          return { success: true, output: output.substring(0, 2000) }
        } catch (err) {
          return { error: err.message.substring(0, 500) }
        }
      }
      
      case "save_memory": {
        addMemory(toolInput.fact, toolInput.category || "General")
        return { success: true, saved: toolInput.fact }
      }
      
      case "delegate_blog_post": {
        const task = taskQueue.delegateBlogPost(toolInput.slug, toolInput.topic)
        return { success: true, taskId: task.id, message: `Blog post delegated. Task #${task.id}` }
      }
      
      case "delegate_page": {
        const task = taskQueue.delegatePage(toolInput.slug, toolInput.topic)
        return { success: true, taskId: task.id, message: `Page delegated. Task #${task.id}` }
      }
      
      case "delegate_email": {
        const task = taskQueue.delegateEmail(toolInput.to, toolInput.purpose, toolInput.context)
        return { success: true, taskId: task.id, message: `Email delegated. Task #${task.id}` }
      }
      
      case "delegate_social_post": {
        const task = taskQueue.delegateSocialPost(toolInput.topic)
        return { success: true, taskId: task.id, message: `Social post delegated. Task #${task.id}` }
      }
      
      case "delegate_monthly_report": {
        const task = taskQueue.delegateMonthlyReport(
          toolInput.to, toolInput.client_name, toolInput.business_name,
          toolInput.posts_published || 0, toolInput.highlights || ""
        )
        return { success: true, taskId: task.id, message: `Report delegated. Task #${task.id}` }
      }
      
      case "delegate_deploy": {
        const task = taskQueue.delegateDeploy(toolInput.message)
        return { success: true, taskId: task.id, message: `Deploy delegated. Task #${task.id}` }
      }
      
      case "check_task_queue": {
        return taskQueue.getQueueStatus()
      }
      
      case "think_deeply": {
        const response = await anthropic.messages.create({
          model: MODELS.opus,
          max_tokens: 2048,
          messages: [{
            role: "user",
            content: `Think carefully:\n\nQuestion: ${toolInput.question}\n\nContext: ${toolInput.context || "None"}\n\nProvide analysis and recommendation.`
          }]
        })
        return { analysis: response.content[0].text }
      }
      
      case "scrape_leads": {
        const result = await leadScraper.scrapeLeads(
          toolInput.industry,
          toolInput.city || "Columbia, SC",
          Math.min(toolInput.max_leads || 10, 20)
        )
        return result
      }

      case "outreach_leads": {
        const maxEmails = Math.min(toolInput.max_emails || 5, 20)
        const pitch = toolInput.service_pitch || "AI chatbots and website management"

        // Get all leads/prospects with an email address who haven't been contacted
        const allClients = crm.listAllClients()
        const prospects = allClients.filter(c =>
          (c.stage === "prospect" || c.stage === "lead") &&
          c.email &&
          c.email.trim() !== "" &&
          !(c.notes || []).some(n => n.text?.includes("outreach-sent")) &&
          !(c.activity || []).some(a => a.action?.toLowerCase().includes("outreach"))
        ).slice(0, maxEmails)

        if (prospects.length === 0) {
          return { success: true, message: "No uncontacted prospects with email addresses found. Run scrape_leads first." }
        }

        const sent = []
        const failed = []

        for (const prospect of prospects) {
          try {
            if (GUARDRAILS.emailsSentThisHour >= GUARDRAILS.maxEmailsPerHour) {
              failed.push({ name: prospect.businessName, reason: "hourly email limit reached" })
              break
            }

            const emailResult = await email.writeAndSendEmail(
              prospect.email,
              `Outreach to ${prospect.businessName} about ${pitch}`,
              `Business: ${prospect.businessName}
Industry: ${prospect.industry || "small business"}
Location: ${prospect.address || "local area"}
Website: ${prospect.website || "unknown"}
Phone: ${prospect.phone || "unknown"}

We are Jordan AI (jordan-ai.co), a digital agency in South Carolina that helps local businesses with AI chatbots, SEO content, and website management.

Write a short, friendly cold outreach email (3-4 short paragraphs) that:
- Opens with something specific about their business (not generic)
- Explains one specific way we could help them (tie it to their industry)
- Keeps it casual, not sales-y
- Ends with a soft ask to hop on a quick call
- Signs off from "Jordan" at Jordan AI`,
              openai
            )

            GUARDRAILS.emailsSentThisHour++

            if (emailResult && emailResult.success) {
              // Mark as contacted in CRM
              crm.addNote(prospect.slug, `outreach-sent: ${new Date().toISOString()} | pitch: ${pitch}`)
              crm.updateClient(prospect.slug, { stage: "contacted" })
              sent.push({ name: prospect.businessName, email: prospect.email })
              console.log(`   ✅ Outreach sent to ${prospect.businessName}`)
            } else {
              failed.push({ name: prospect.businessName, reason: emailResult?.error || "send failed" })
            }

            // Small delay between emails
            await new Promise(r => setTimeout(r, 2000))
          } catch (err) {
            failed.push({ name: prospect.businessName, reason: err.message })
          }
        }

        return {
          success: true,
          sent: sent.length,
          failed: failed.length,
          sentTo: sent,
          failedList: failed,
          summary: `Sent ${sent.length} outreach emails, ${failed.length} failed`
        }
      }

      case "fetch_client_media": {
        const media = await mediaManager.fetchClientMedia(
          toolInput.slug,
          toolInput.industry,
          {
            downloadImages: toolInput.downloadImages !== false,
            numServices:    toolInput.numServices || 4,
            fetchVideo:     toolInput.fetchVideo  || false,
          }
        )
        return {
          success:  true,
          source:   media.source,
          hero:     media.hero,
          about:    media.about,
          services: media.services,
          video:    media.video,
          summary:  `Fetched ${media.services.length} service images + hero + about (${media.source})`
        }
      }

      case "create_client_website": {
        const result = await websiteGenerator.createClientWebsite({
          slug:         toolInput.slug,
          businessName: toolInput.businessName,
          industry:     toolInput.industry     || "landscaping",
          phone:        toolInput.phone        || "",
          email:        toolInput.email        || "",
          city:         toolInput.city         || "Your City",
          color:        toolInput.color        || "green",
          years:        toolInput.years        || "10",
          jobsDone:     toolInput.jobsDone     || "500+",
          clients:      toolInput.clients      || "300",
          rating:       toolInput.rating       || "4.9",
          deploy:       toolInput.deploy !== false,
        })
        return result
      }

      case "upload_client_assets": {
        const result = await assetManager.uploadClientAsset(
          toolInput.slug,
          toolInput.type,
          toolInput.source,
          toolInput.filename || null
        )
        return {
          ...result,
          summary: `Uploaded ${result.filename} (${result.type}) for ${result.slug} → ${result.relUrl}`
        }
      }

      case "place_asset_on_site": {
        const result = await assetManager.placeAssetOnSite(
          toolInput.slug,
          toolInput.filename,
          toolInput.location
        )
        return {
          ...result,
          summary: `Placed ${result.filename} at ${result.location} on ${result.slug}. Site re-rendered: ${result.rerendered}`
        }
      }

      case "analyze_image_style": {
        const style = await websiteGenerator.analyzeImageStyle(toolInput.imageUrl)
        return {
          ...style,
          summary: `Style: ${style.style} | Primary: ${style.primaryHex} | Accent: ${style.accentHex} | Industry: ${style.industry} | Template: ${style.templateType}`
        }
      }

      case "design_website_from_image": {
        const result = await websiteGenerator.designWebsiteFromImage({
          slug:         toolInput.slug,
          businessName: toolInput.businessName,
          imageUrl:     toolInput.imageUrl,
          industry:     toolInput.industry     || null,
          phone:        toolInput.phone        || "",
          email:        toolInput.email        || "",
          city:         toolInput.city         || "Your City",
          deploy:       toolInput.deploy !== false,
        })
        return {
          ...result,
          summary: `Built ${result.businessName} site (${result.templateType}) with colors from image. Color: ${result.colorApplied}. Style: ${result.styleNotes}. URL: ${result.url}`
        }
      }

      default:
        return { error: `Unknown tool: ${toolName}` }
    }
  } catch (err) {
    console.log(`   ❌ Tool error: ${err.message}`)
    return { error: err.message }
  }
}

// ============================================
// THE AGENT LOOP
// ============================================
async function runAgent(goal, options = {}) {
  const { maxSteps = MAX_STEPS_PER_RUN, discordNotify = null, approvalCallback = null } = options
  
  if (agentState.isRunning) {
    return { success: false, error: "Agent is already running" }
  }
  
  if (agentState.runsToday >= MAX_DAILY_RUNS) {
    return { success: false, error: `Daily run limit reached (${MAX_DAILY_RUNS})` }
  }
  
  agentState.isRunning = true
  agentState.currentGoal = goal
  agentState.runsToday++
  agentState.totalRuns++
  agentState.lastRun = new Date().toISOString()
  
  const persona = loadPersona()
  const runLog = []
  let stepCount = 0
  
  const selectedModel = selectModel(goal)
  
  console.log("\n" + "=".repeat(60))
  console.log("🧠 JORDAN AI AGENT — STARTING")
  console.log(`   Goal: ${goal}`)
  console.log(`   Model: ${selectedModel}`)
  console.log("=".repeat(60))
  
  if (discordNotify) {
    const modelName = selectedModel === MODELS.opus ? "OPUS" : "SONNET"
    discordNotify(`🧠 **Agent starting** (${modelName})\nGoal: ${goal}`)
  }
  
  const systemPrompt = `You are Jordan AI, the CEO of a digital agency. Your partner handles relationships and sales; you handle everything digital.

CURRENT GOAL: ${goal}

RULE FOR write_file — READ THIS:
When you call write_file, you MUST include the complete file content in that same call.
- There is no second step. It writes the file immediately.
- If you omit content, the call fails and you have to redo it anyway.
- For HTML files: write the ENTIRE document (<!DOCTYPE html> ... </html>) in the content parameter.
- Do not write a placeholder. Do not split into two calls. Just write the whole thing.

MEMORY: ${persona.memory || "No lessons saved yet."}

Keep responses brief. Take action. Don't over-explain.`

  let messages = [
    { role: "user", content: `Goal: ${goal}\n\nStart working.` }
  ]
  
  try {
    while (stepCount < maxSteps) {
      stepCount++
      console.log(`\n--- Step ${stepCount}/${maxSteps} ---`)
      
      const response = await anthropic.messages.create({
        model: selectedModel,
        max_tokens: 8192,
        system: systemPrompt,
        tools: TOOLS,
        messages
      })
      
      let hasToolUse = false
      let assistantContent = []
      
      for (const block of response.content) {
        assistantContent.push(block)
        
        if (block.type === "text") {
          console.log(`   💭 ${block.text.substring(0, 200)}`)
          runLog.push({ step: stepCount, type: "thinking", text: block.text })
          if (discordNotify && block.text.length > 10) {
            discordNotify(`💭 **Step ${stepCount}:** ${block.text.substring(0, 500)}`)
          }
        }
        
        if (block.type === "tool_use") {
          hasToolUse = true
          const toolName = block.name
          const toolInput = block.input
          
          console.log(`   🔧 Calling: ${toolName}`)
          runLog.push({ step: stepCount, type: "tool_call", tool: toolName, input: toolInput })
          
          if (needsApproval(toolName)) {
            console.log(`   ⚠️ NEEDS APPROVAL: ${toolName}`)
            if (discordNotify) {
              discordNotify(`⚠️ **Approval needed:** \`${toolName}\`\nReply \`!approve\` or \`!deny\``)
            }
            messages.push({ role: "assistant", content: assistantContent })
            messages.push({ 
              role: "user", 
              content: [{ type: "tool_result", tool_use_id: block.id, content: "This action requires human approval. Skip it." }] 
            })
            runLog.push({ step: stepCount, type: "skipped_needs_approval", tool: toolName })
            assistantContent = []
            continue
          }
          
          const result = await executeTool(toolName, toolInput)
          
          console.log(`   ${result.error ? "❌" : "✅"} Result: ${JSON.stringify(result).substring(0, 200)}`)
          runLog.push({ step: stepCount, type: "tool_result", tool: toolName, success: !result.error, result })
          
          if (discordNotify) {
            discordNotify(`🔧 **${toolName}** → ${result.error ? "❌ " + result.error : "✅ Success"}`)
          }
          
          messages.push({ role: "assistant", content: assistantContent })
          messages.push({ 
            role: "user", 
            content: [{ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result).substring(0, 10000) }] 
          })
          assistantContent = []
        }
      }
      
      if (!hasToolUse) {
        console.log("\n✅ Agent finished")
        break
      }
      
      if (response.stop_reason === "end_turn" && !hasToolUse) {
        break
      }
    }
    
    if (stepCount >= maxSteps) {
      console.log(`\n⚠️ Reached max steps (${maxSteps})`)
    }
    
  } catch (err) {
    console.log(`\n❌ Agent error: ${err.message}`)
    runLog.push({ step: stepCount, type: "error", error: err.message })
    
    const log = loadAgentLog()
    log.errors.push({ date: new Date().toISOString(), goal, error: err.message })
    saveAgentLog(log)
  }
  
  const log = loadAgentLog()
  log.runs.push({ date: new Date().toISOString(), goal, model: selectedModel, steps: stepCount, log: runLog })
  saveAgentLog(log)
  
  agentState.isRunning = false
  agentState.currentGoal = null
  
  console.log("\n" + "=".repeat(60))
  console.log(`🧠 AGENT COMPLETE — ${stepCount} steps`)
  console.log("=".repeat(60))
  
  if (discordNotify) {
    discordNotify(`✅ **Agent finished** — ${stepCount} steps\nGoal: ${goal}`)
  }
  
  return { success: true, steps: stepCount, model: selectedModel, log: runLog }
}

// ============================================
// CONVERSATION MODE (agentChat)
// ============================================
async function agentChat(message, conversationHistory = []) {
  const persona = loadPersona()
  const selectedModel = selectModel(message)
  
  console.log(`\n💬 Chat received: ${message.substring(0, 100)}`)
  console.log(`   🧠 Model: ${selectedModel === MODELS.opus ? "OPUS" : "SONNET"}`)
  
  const systemPrompt = `You are Jordan AI — CEO of a digital agency. You're chatting with your business partner.

IMPORTANT FOR FILE CREATION:
When using write_file, you MUST provide BOTH parameters:
1. filepath: where to save the file
2. content: the COMPLETE file content (for HTML, the full document)
Never call write_file without the content parameter filled in.

IMPORTANT FOR DISCORD ATTACHMENTS:
When the message contains a "[Discord attachments]" section with URLs, those are DIRECT DOWNLOAD LINKS to files the user sent.
- Do NOT say you cannot see images — you don't need to see them visually
- Use upload_client_assets with the URL to download the file to the client's folder
- Then use place_asset_on_site to apply it to the site
- You CAN download any URL — treat it exactly like any other file URL

Keep responses brief. Take action when needed.

${persona.memory || ""}`

  const messages = [...conversationHistory, { role: "user", content: message }]
  
  try {
    const response = await anthropic.messages.create({
      model: selectedModel,
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOLS,
      messages
    })
    
    let textResponse = ""
    let toolResults = []
    let newMessages = [...messages]
    
    let currentResponse = response
    let iterations = 0
    const maxIterations = 8
    
    while (iterations < maxIterations) {
      iterations++
      let hasToolUse = false
      let assistantContent = []
      
      for (const block of currentResponse.content) {
        assistantContent.push(block)
        
        if (block.type === "text") {
          textResponse += block.text
        }
        
        if (block.type === "tool_use") {
          hasToolUse = true
          
          if (needsApproval(block.name)) {
            newMessages.push({ role: "assistant", content: assistantContent })
            newMessages.push({
              role: "user",
              content: [{ type: "tool_result", tool_use_id: block.id, content: "Needs human approval. Skipped." }]
            })
            textResponse += `\n\n⚠️ **Needs approval:** \`${block.name}\``
            toolResults.push({ tool: block.name, result: "needs_approval" })
            assistantContent = []
            continue
          }
          
          const result = await executeTool(block.name, block.input)
          const resultStatus = result.error ? `error: ${result.error}` : "success"
          toolResults.push({ tool: block.name, result: resultStatus })
          
          newMessages.push({ role: "assistant", content: assistantContent })
          newMessages.push({
            role: "user",
            content: [{ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result).substring(0, 10000) }]
          })
          assistantContent = []
        }
      }
      
      if (!hasToolUse) break
      
      currentResponse = await anthropic.messages.create({
        model: selectedModel,
        max_tokens: 8192,
        system: systemPrompt,
        tools: TOOLS,
        messages: newMessages
      })
      
      textResponse = ""
      for (const block of currentResponse.content) {
        if (block.type === "text") textResponse += block.text
      }
      
      if (currentResponse.stop_reason === "end_turn") break
    }
    
    return {
      success: true,
      response: textResponse,
      toolsUsed: toolResults,
      model: selectedModel,
      conversationHistory: newMessages
    }
    
  } catch (err) {
    console.log("Agent chat error:", err.message)
    return {
      success: false,
      response: `Error: ${err.message}`,
      toolsUsed: [],
      conversationHistory: messages
    }
  }
}

// ============================================
// DAILY AGENT RUN
// ============================================
async function dailyAgentRun(discordNotify = null) {
  const goals = [
    "Morning check-in. Check the business status. Handle anything urgent. Report what you find.",
    "Content day. Write and publish a blog post for SEO. Deploy the website.",
    "Client focus. Check every client. Any follow-ups overdue? Handle what you can.",
    "Growth mode. Create outreach content. Think about what's working and what's not.",
    "Systems check. Look at recent errors. Fix what you can.",
  ]
  
  const dayIndex = new Date().getDay() % goals.length
  return await runAgent(goals[dayIndex], { discordNotify })
}

// ============================================
// STATUS & EXPORTS
// ============================================
function getAgentStatus() {
  return {
    ...agentState,
    models: MODELS,
    opusTriggers: OPUS_TRIGGERS,
    guardrails: {
      maxStepsPerRun: GUARDRAILS.maxStepsPerRun,
      maxDailyRuns: MAX_DAILY_RUNS,
      emailsSentThisHour: GUARDRAILS.emailsSentThisHour,
      protectedFiles: GUARDRAILS.protectedFiles
    }
  }
}

function scheduleDailyReset() {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  setTimeout(() => {
    agentState.runsToday = 0
    console.log("🌅 Agent daily counter reset")
    scheduleDailyReset()
  }, tomorrow - now)
}
scheduleDailyReset()

taskQueue.setToolExecutor(executeTool)

module.exports = {
  runAgent,
  agentChat,
  dailyAgentRun,
  getAgentStatus,
  executeTool,
  selectModel,
  TOOLS,
  MODELS
}
