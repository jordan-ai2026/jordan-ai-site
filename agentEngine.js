// ============================================
// JORDAN AI - AGENT ENGINE
// The core brain that makes Jordan AI autonomous
//
// HOW IT WORKS:
// 1. Agent receives a goal or trigger
// 2. Claude Opus THINKS about what to do
// 3. Opus CALLS a tool (wp_post, send_email, etc.)
// 4. Engine executes the tool and returns result
// 5. Opus SEES the result and decides next step
// 6. Loop continues until goal is achieved
//
// Opus = strategic thinking & decisions
// GPT-4o-mini = cheap content generation (called by tools)
// ============================================

require("dotenv").config()
const Anthropic = require("@anthropic-ai/sdk")
const OpenAI = require("openai")
const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

// Import all existing modules as tools
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
  // Keep last 100 runs
  if (log.runs.length > 100) log.runs = log.runs.slice(-100)
  if (log.decisions.length > 500) log.decisions = log.decisions.slice(-500)
  if (log.errors.length > 100) log.errors = log.errors.slice(-100)
  fs.writeFileSync(AGENT_LOG, JSON.stringify(log, null, 2))
}

// ============================================
// SAFETY GUARDRAILS
// ============================================
const GUARDRAILS = {
  // Actions that ALWAYS need human approval
  needsApproval: [
    "billing_create_subscription",
    "billing_cancel_subscription",
    "crm_remove_client",
    "run_shell_command"
  ],
  
  // Max API spend per run (approximate)
  maxStepsPerRun: MAX_STEPS_PER_RUN,
  
  // Files the agent can NEVER modify
  protectedFiles: [
    "index.js",
    "agentEngine.js",
    ".env",
    "package.json"
  ],
  
  // Max emails per hour
  maxEmailsPerHour: 10,
  emailsSentThisHour: 0
}

function needsApproval(toolName) {
  return GUARDRAILS.needsApproval.includes(toolName)
}

// Reset email counter hourly
setInterval(() => { GUARDRAILS.emailsSentThisHour = 0 }, 60 * 60 * 1000)

// ============================================
// TOOL DEFINITIONS
// These tell Claude Opus what tools are available
// Claude decides WHICH tool to use and WHEN
// ============================================
const TOOLS = [
  // ---- OBSERVATION TOOLS ----
  {
    name: "check_business_status",
    description: "Get a full overview of the business: CRM stats, revenue, pipeline, follow-ups due, product sales, email stats. Use this to understand the current state before making decisions.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "check_client_details",
    description: "Get full details about a specific client from the CRM including contact info, services, pipeline stage, notes, and follow-up dates.",
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
    description: "Check the status of a client's WordPress site — recent posts, drafts, pages.",
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
    description: "Check Stripe for any new product sales that need to be fulfilled.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "read_file",
    description: "Read the contents of a file from the project directory. Use for checking configs, reading data, or understanding current state.",
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
    description: "List files in a directory. Use to understand project structure or check what exists.",
    input_schema: {
      type: "object",
      properties: {
        dirpath: { type: "string", description: "Directory path relative to project root" }
      },
      required: ["dirpath"]
    }
  },

  // ---- WORDPRESS TOOLS ----
  {
    name: "wp_create_post",
    description: "Write and publish a blog post to a client's WordPress site. The AI writer will generate the content from the topic you provide. Use for SEO content, educational articles, and client blog management.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "WordPress client slug" },
        topic: { type: "string", description: "Blog post topic — be specific" },
        categories: { type: "array", items: { type: "string" }, description: "Post categories" }
      },
      required: ["slug", "topic"]
    }
  },
  {
    name: "wp_create_page",
    description: "Create a new page on a client's WordPress site (About, FAQ, Service Areas, etc.).",
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
    description: "List all draft posts waiting for review on a client's WordPress site.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "WordPress client slug" }
      },
      required: ["slug"]
    }
  },

  // ---- EMAIL TOOLS ----
  {
    name: "send_email",
    description: "Send an email to anyone. Use for follow-ups, outreach, reports, or custom messages.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body (plain text — will be converted to HTML)" }
      },
      required: ["to", "subject", "body"]
    }
  },
  {
    name: "send_proposal",
    description: "Send a professional branded proposal email to a prospective client.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        client_name: { type: "string", description: "Contact person name" },
        business_name: { type: "string", description: "Business name" },
        services: { type: "string", description: "Comma-separated services with prices, e.g. 'Website Management:300, SEO Content:200'" }
      },
      required: ["to", "client_name", "business_name", "services"]
    }
  },
  {
    name: "send_monthly_report",
    description: "Send a monthly report email to a client showing work completed.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Client email" },
        client_name: { type: "string", description: "Contact name" },
        business_name: { type: "string", description: "Business name" },
        posts_published: { type: "number", description: "Blog posts published this month" },
        highlights: { type: "string", description: "Comma-separated highlights" }
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
        to: { type: "string", description: "Client email" },
        client_name: { type: "string", description: "Contact name" },
        business_name: { type: "string", description: "Business name" },
        items: { type: "string", description: "Comma-separated items with amounts, e.g. 'Website Management:300, SEO:200'" }
      },
      required: ["to", "client_name", "business_name", "items"]
    }
  },
  {
    name: "ai_write_and_send_email",
    description: "Have the AI writer compose and send an email based on purpose and context. Good for follow-ups, outreach, and responses.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        purpose: { type: "string", description: "What the email is for" },
        context: { type: "string", description: "Background info for the AI writer" }
      },
      required: ["to", "purpose", "context"]
    }
  },

  // ---- CRM TOOLS ----
  {
    name: "crm_add_client",
    description: "Add a new client to the CRM database.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Short identifier (lowercase, no spaces)" },
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
    description: "Move a client to a new pipeline stage. Stages: lead, contacted, meeting, proposal, negotiation, signed, active, paused, lost.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        stage: { type: "string", description: "Pipeline stage" }
      },
      required: ["slug", "stage"]
    }
  },
  {
    name: "crm_add_note",
    description: "Add a note to a client's record in the CRM.",
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
    description: "Set a follow-up date for a client. Accepts: 'tomorrow', 'next week', '3 days', or a date.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        when: { type: "string", description: "When to follow up" }
      },
      required: ["slug", "when"]
    }
  },
{
    name: "crm_remove_client",
    description: "Remove a client from the CRM. NEEDS HUMAN APPROVAL. Use for cleaning up test data or lost prospects.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Client slug to remove" }
      },
      required: ["slug"]
    }
  },
  // ---- BILLING TOOLS ----
  {
    name: "billing_create_customer",
    description: "Create a Stripe customer from CRM data. Required before creating subscriptions. NEEDS HUMAN APPROVAL.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "CRM client slug" }
      },
      required: ["slug"]
    }
  },
  {
    name: "billing_create_subscription",
    description: "Create a recurring monthly subscription in Stripe for a client. NEEDS HUMAN APPROVAL.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        items: { type: "string", description: "Comma-separated services with prices, e.g. 'Website Management:300, SEO:200'" }
      },
      required: ["slug", "items"]
    }
  },
  {
    name: "billing_get_revenue",
    description: "Get current revenue stats: MRR, active subscriptions, recent invoices.",
    input_schema: { type: "object", properties: {}, required: [] }
  },

  // ---- SOCIAL MEDIA TOOLS ----
  {
    name: "social_write_and_post",
    description: "Have AI write a social media post about a topic and post it to all connected platforms.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "What to post about" },
        platform: { type: "string", description: "all, twitter, facebook, or linkedin" }
      },
      required: ["topic"]
    }
  },

  // ---- WEBSITE TOOLS ----
  {
    name: "create_blog_post",
    description: "Create a blog post on the Jordan AI website (jordan-ai.co). For the main site, not client sites.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string", description: "Blog post content in plain text with paragraph breaks" }
      },
      required: ["title", "content"]
    }
  },
  {
    name: "deploy_website",
    description: "Push the Jordan AI website to GitHub, which triggers Vercel deployment.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Commit message" }
      },
      required: ["message"]
    }
  },

  // ---- FILE TOOLS ----
  {
    name: "write_file",
    description: "Write content to a file. Use for creating new files or updating existing ones. CANNOT modify protected files (index.js, .env, agentEngine.js, package.json).",
    input_schema: {
      type: "object",
      properties: {
        filepath: { type: "string", description: "Path relative to project root" },
        content: { type: "string", description: "File content to write" }
      },
      required: ["filepath", "content"]
    }
  },
  {
    name: "run_shell_command",
    description: "Run a shell command on the system. Use for npm install, git operations, or system checks. NEEDS HUMAN APPROVAL. Cannot use rm -rf or delete system files.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run" }
      },
      required: ["command"]
    }
  },

  // ---- DELEGATION TOOLS ----
  // These let Opus delegate to sub-agents that run in the background
  {
    name: "delegate_blog_post",
    description: "Delegate a blog post to the Writer sub-agent. Runs in the background — you can continue working on other things. The Writer will use GPT-4o-mini to write and publish it.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "WordPress client slug" },
        topic: { type: "string", description: "Blog post topic" }
      },
      required: ["slug", "topic"]
    }
  },
  {
    name: "delegate_page",
    description: "Delegate a page creation to the Builder sub-agent. Runs in the background.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "WordPress client slug" },
        topic: { type: "string", description: "Page topic with context" }
      },
      required: ["slug", "topic"]
    }
  },
  {
    name: "delegate_email",
    description: "Delegate an email to the Sales sub-agent. Runs in the background. The Sales agent will write and send it using GPT-4o-mini.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        purpose: { type: "string", description: "What the email is for" },
        context: { type: "string", description: "Background info" }
      },
      required: ["to", "purpose", "context"]
    }
  },
  {
    name: "delegate_social_post",
    description: "Delegate a social media post to the Writer sub-agent. Runs in the background.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "What to post about" }
      },
      required: ["topic"]
    }
  },
  {
    name: "delegate_monthly_report",
    description: "Delegate a monthly client report to the Support sub-agent. Runs in the background.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Client email" },
        client_name: { type: "string" },
        business_name: { type: "string" },
        posts_published: { type: "number" },
        highlights: { type: "string", description: "Comma-separated highlights" }
      },
      required: ["to", "client_name", "business_name"]
    }
  },
  {
    name: "delegate_deploy",
    description: "Delegate a website deploy to the Builder sub-agent. Runs in the background.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Deploy commit message" }
      },
      required: ["message"]
    }
  },
  {
    name: "check_task_queue",
    description: "Check the status of delegated tasks. See what's queued, running, and recently completed.",
    input_schema: { type: "object", properties: {}, required: [] }
  },

  // ---- MEMORY TOOLS ----
  {
    name: "save_memory",
    description: "Save an important fact, lesson, or decision to long-term memory. Use when you learn something that should influence future decisions.",
    input_schema: {
      type: "object",
      properties: {
        fact: { type: "string", description: "What to remember" },
        category: { type: "string", description: "Category: Strategy, Clients, Products, Lessons, Market" }
      },
      required: ["fact"]
    }
  },
  {
    name: "think_deeply",
    description: "Use this when you need to think more carefully about a complex decision. Escalates thinking to a deeper analysis before acting. Use when stakes are high or you're unsure.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "What you need to think about" },
        context: { type: "string", description: "Relevant context for the decision" }
      },
      required: ["question"]
    }
  }
]

// ============================================
// TOOL EXECUTION
// Maps tool calls to actual functions
// ============================================
async function executeTool(toolName, toolInput) {
  console.log(`   🔧 Tool: ${toolName}`)
  
  try {
    switch (toolName) {
      
      // ---- OBSERVATION ----
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
            revenueInfo = `MRR: $${rev.mrr}, Active subs: ${rev.activeSubscriptions}, Balance: $${rev.stripeBalance || 'unknown'}`
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
          products: {
            totalSales: fulfillStats.totalSales,
            revenue: fulfillStats.totalRevenue,
            salesToday: fulfillStats.salesToday
          },
          emails: { today: emailStats.today, thisMonth: emailStats.thisMonth },
          clients: clients.map(c => ({ slug: c.slug, business: c.businessName, stage: c.stage, value: c.monthlyValue })),
          social: { connectedPlatforms: social.getConnectedPlatforms() },
          wpClients: Object.keys(wp.listClients())
        }
      }
      
      case "check_client_details": {
        const client = crm.getClient(toolInput.slug)
        if (!client) return { error: `Client "${toolInput.slug}" not found in CRM` }
        const wpInfo = wp.getClient(toolInput.slug)
        const billingInfo = billing.getCustomerInfo(toolInput.slug)
        return { client, wordpress: wpInfo ? "connected" : "not connected", billing: billingInfo }
      }
      
      case "check_wordpress_site": {
        const status = await wp.getSiteStatus(toolInput.slug)
        return status
      }
      
      case "check_sales": {
        const result = await fulfill.checkForNewSales()
        return result
      }
      
      case "read_file": {
        const fullPath = path.join(__dirname, toolInput.filepath)
        if (!fs.existsSync(fullPath)) return { error: `File not found: ${toolInput.filepath}` }
        const content = fs.readFileSync(fullPath, "utf8")
        return { filepath: toolInput.filepath, content: content.substring(0, 3000) }
      }
      
      case "list_directory": {
        const fullPath = path.join(__dirname, toolInput.dirpath || ".")
        if (!fs.existsSync(fullPath)) return { error: `Directory not found: ${toolInput.dirpath}` }
        const files = fs.readdirSync(fullPath)
        return { directory: toolInput.dirpath || ".", files }
      }
      
      // ---- WORDPRESS ----
      case "wp_create_post": {
        const result = await wp.writeAndPublish(toolInput.slug, toolInput.topic, openai, {
          type: "post",
          categories: toolInput.categories || ["Blog"]
        })
        return result
      }
      
      case "wp_create_page": {
        const result = await wp.writeAndPublish(toolInput.slug, toolInput.topic, openai, { type: "page" })
        return result
      }
      
      case "wp_publish_draft": {
        const result = await wp.publishDraft(toolInput.slug, toolInput.post_id)
        return result
      }
      
      case "wp_list_drafts": {
        const result = await wp.listPosts(toolInput.slug, { status: "draft" })
        if (result.success) {
          return { drafts: result.data.map(d => ({ id: d.id, title: d.title.rendered, date: d.date })) }
        }
        return result
      }
      
      // ---- EMAIL ----
      case "send_email": {
        if (GUARDRAILS.emailsSentThisHour >= GUARDRAILS.maxEmailsPerHour) {
          return { error: "Email rate limit reached (10/hour). Try again later." }
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
      
      // ---- CRM ----
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
      case "crm_remove_client": {
        const result = crm.removeClient(toolInput.slug)
        return result ? { success: true, removed: toolInput.slug } : { error: "Client not found" }
      }

      // ---- BILLING ----
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
      
      // ---- SOCIAL ----
      case "social_write_and_post": {
        return await social.writeAndPost(toolInput.topic, openai, {
          platform: toolInput.platform || "all"
        })
      }
      
      // ---- WEBSITE ----
      case "create_blog_post": {
        const result = await createBlogPost(toolInput.title, toolInput.content)
        if (result && result.success) await createBlogIndex()
        return result
      }
      
      case "deploy_website": {
        return await deployWebsite(toolInput.message)
      }
      
      // ---- FILE SYSTEM ----
      case "write_file": {
        const basename = path.basename(toolInput.filepath)
        if (GUARDRAILS.protectedFiles.includes(basename)) {
          return { error: `Cannot modify protected file: ${basename}` }
        }
        const fullPath = path.join(__dirname, toolInput.filepath)
        const dir = path.dirname(fullPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(fullPath, toolInput.content)
        return { success: true, filepath: toolInput.filepath }
      }
      
      case "run_shell_command": {
        const dangerous = ["rm -rf", "rm -r /", "del /f", "format", "mkfs", "> /dev"]
        if (dangerous.some(d => toolInput.command.includes(d))) {
          return { error: "Dangerous command blocked by guardrails" }
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
      
      // ---- MEMORY ----
      case "save_memory": {
        addMemory(toolInput.fact, toolInput.category || "General")
        return { success: true, saved: toolInput.fact }
      }
      
      // ---- DELEGATION (background tasks) ----
      case "delegate_blog_post": {
        const task = taskQueue.delegateBlogPost(toolInput.slug, toolInput.topic)
        return { success: true, taskId: task.id, message: `Blog post delegated to Writer. Task #${task.id} running in background.` }
      }
      
      case "delegate_page": {
        const task = taskQueue.delegatePage(toolInput.slug, toolInput.topic)
        return { success: true, taskId: task.id, message: `Page creation delegated to Builder. Task #${task.id} running in background.` }
      }
      
      case "delegate_email": {
        const task = taskQueue.delegateEmail(toolInput.to, toolInput.purpose, toolInput.context)
        return { success: true, taskId: task.id, message: `Email delegated to Sales. Task #${task.id} running in background.` }
      }
      
      case "delegate_social_post": {
        const task = taskQueue.delegateSocialPost(toolInput.topic)
        return { success: true, taskId: task.id, message: `Social post delegated to Writer. Task #${task.id} running in background.` }
      }
      
      case "delegate_monthly_report": {
        const task = taskQueue.delegateMonthlyReport(
          toolInput.to, toolInput.client_name, toolInput.business_name,
          toolInput.posts_published || 0, toolInput.highlights || ""
        )
        return { success: true, taskId: task.id, message: `Monthly report delegated to Support. Task #${task.id} running in background.` }
      }
      
      case "delegate_deploy": {
        const task = taskQueue.delegateDeploy(toolInput.message)
        return { success: true, taskId: task.id, message: `Deploy delegated to Builder. Task #${task.id} running in background.` }
      }
      
      case "check_task_queue": {
        return taskQueue.getQueueStatus()
      }
      
      case "think_deeply": {
        // Escalate to Opus for deeper analysis
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          messages: [{
            role: "user",
            content: `Think carefully about this:\n\nQuestion: ${toolInput.question}\n\nContext: ${toolInput.context || "No additional context"}\n\nProvide your analysis and recommendation.`
          }]
        })
        return { analysis: response.content[0].text }
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
// This is the core — observe, think, act, repeat
// ============================================
async function runAgent(goal, options = {}) {
  const {
    maxSteps = MAX_STEPS_PER_RUN,
    discordNotify = null,
    approvalCallback = null
  } = options
  
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
  let pendingApproval = null
  
  console.log("\n" + "=".repeat(60))
  console.log("🧠 JORDAN AI AGENT — STARTING")
  console.log(`   Goal: ${goal}`)
  console.log("=".repeat(60))
  
  if (discordNotify) {
    discordNotify(`🧠 **Agent starting**\nGoal: ${goal}`)
  }
  
  // Build the system prompt — this is Jordan's brain
  const systemPrompt = `You are Jordan AI, an autonomous AI CEO running a digital agency.

YOUR PERSONALITY:
${persona.soul || "Sharp, direct, revenue-focused. You think like a business owner, not an assistant."}

YOUR MISSION:
Build and scale a business to $10k/month and beyond. You provide AI chatbot building, WordPress management, SEO content, and digital products to small businesses.

YOUR CURRENT GOAL:
${goal}

YOUR MEMORY:
${persona.memory || "No memories yet."}

IMPORTANT RULES:
- You have real tools that take real actions (send emails, publish to WordPress, charge money)
- Start by checking business status to understand the current state
- Think step by step — observe first, then decide, then act
- After each action, evaluate whether it worked before moving on
- Save important lessons to memory for future decisions
- If unsure about something high-stakes, use think_deeply first
- You can do up to ${maxSteps} tool calls per run
- Some actions need human approval — you'll be told if so
- NEVER make up data. If you need real numbers, check them with a tool first
- Focus on actions that directly generate revenue or serve existing clients
- GPT-4o-mini handles content writing when you call WordPress or email tools

DELEGATION — THIS IS KEY:
- For content-heavy tasks (blog posts, emails, social posts, reports, deploys), 
  use the delegate_ tools instead of doing them directly
- Delegated tasks run IN THE BACKGROUND via sub-agents (GPT-4o-mini)
- This means you can delegate 3 blog posts AND keep working on other things
- You stay free to think strategically while workers handle the labor
- Use check_task_queue to see progress on delegated tasks
- Only do tasks DIRECTLY if they need your CEO-level thinking (strategy, decisions, client analysis)
- Think of yourself as a CEO who delegates to a team, not a worker doing everything alone

You are not chatting. You are WORKING. Every tool call should move you closer to the goal. When the goal is achieved or you've done everything you can, stop.`

  // Start the conversation with the goal
  let messages = [
    { role: "user", content: `Your goal: ${goal}\n\nStart by checking the current business status, then decide what to do.` }
  ]
  
  try {
    while (stepCount < maxSteps) {
      // Rate limit protection — pause between steps
      if (stepCount > 1) await new Promise(r => setTimeout(r, 2000))
      stepCount++
      console.log(`\n--- Step ${stepCount}/${maxSteps} ---`)
      
      // Call Claude Opus with tools
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOLS,
        messages
      })
      
      // Process the response
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
          
          // Check if approval is needed
          if (needsApproval(toolName)) {
            console.log(`   ⚠️ NEEDS APPROVAL: ${toolName}`)
            
            if (discordNotify) {
              discordNotify(
                `⚠️ **Approval needed:**\n` +
                `Tool: \`${toolName}\`\n` +
                `Input: ${JSON.stringify(toolInput).substring(0, 300)}\n\n` +
                `Reply \`!approve\` or \`!deny\``
              )
            }
            
            // If we have an approval callback, wait for it
            if (approvalCallback) {
              const approved = await approvalCallback(toolName, toolInput)
              if (!approved) {
                // Add denial as tool result
                messages.push({ role: "assistant", content: assistantContent })
                messages.push({ 
                  role: "user", 
                  content: [{ 
                    type: "tool_result", 
                    tool_use_id: block.id, 
                    content: "DENIED by human operator. Choose a different action or skip this." 
                  }] 
                })
                runLog.push({ step: stepCount, type: "denied", tool: toolName })
                assistantContent = []
                continue
              }
            } else {
              // No approval callback — skip the action
              messages.push({ role: "assistant", content: assistantContent })
              messages.push({ 
                role: "user", 
                content: [{ 
                  type: "tool_result", 
                  tool_use_id: block.id, 
                  content: "This action requires human approval which is not available right now. Skip it or choose a different action." 
                }] 
              })
              runLog.push({ step: stepCount, type: "skipped_needs_approval", tool: toolName })
              assistantContent = []
              continue
            }
          }
          
          // Execute the tool
          const result = await executeTool(toolName, toolInput)
          
          console.log(`   ${result.error ? "❌" : "✅"} Result: ${JSON.stringify(result).substring(0, 200)}`)
          runLog.push({ step: stepCount, type: "tool_result", tool: toolName, success: !result.error })
          
          if (discordNotify) {
            discordNotify(`🔧 **${toolName}** → ${result.error ? "❌ " + result.error : "✅ Success"}`)
          }
          
          // Send result back to Claude
          messages.push({ role: "assistant", content: assistantContent })
          messages.push({ 
            role: "user", 
            content: [{ 
              type: "tool_result", 
              tool_use_id: block.id, 
              content: JSON.stringify(result).substring(0, 10000) 
            }] 
          })
          assistantContent = []
        }
      }
      
      // If Claude didn't use any tools, it's done thinking
      if (!hasToolUse) {
        console.log("\n✅ Agent finished — no more tools to call")
        if (response.stop_reason === "end_turn") {
          break
        }
      }
      
      // If stop reason is end_turn and no tool use, we're done
      if (response.stop_reason === "end_turn" && !hasToolUse) {
        break
      }
    }
    
    if (stepCount >= maxSteps) {
      console.log(`\n⚠️ Reached max steps (${maxSteps})`)
      runLog.push({ step: stepCount, type: "max_steps_reached" })
    }
    
  } catch (err) {
    console.log(`\n❌ Agent error: ${err.message}`)
    runLog.push({ step: stepCount, type: "error", error: err.message })
    
    const log = loadAgentLog()
    log.errors.push({ date: new Date().toISOString(), goal, error: err.message })
    saveAgentLog(log)
  }
  
  // Save run to log
  const log = loadAgentLog()
  log.runs.push({
    date: new Date().toISOString(),
    goal,
    steps: stepCount,
    log: runLog
  })
  saveAgentLog(log)
  
  agentState.isRunning = false
  agentState.currentGoal = null
  
  console.log("\n" + "=".repeat(60))
  console.log(`🧠 AGENT COMPLETE — ${stepCount} steps`)
  console.log("=".repeat(60))
  
  if (discordNotify) {
    discordNotify(`✅ **Agent finished** — ${stepCount} steps taken\nGoal: ${goal}`)
  }
  
  return {
    success: true,
    steps: stepCount,
    log: runLog
  }
}

// ============================================
// CONVERSATION MODE
// For when you chat with Jordan AI in Discord
// Uses tools so Jordan can take actions mid-chat
// ============================================
async function agentChat(message, conversationHistory = []) {
  const persona = loadPersona()
  
  const systemPrompt = `You are Jordan AI, an autonomous AI CEO. You're chatting with your human operator via Discord.

${persona.soul || ""}

You have access to tools that let you take REAL actions during this conversation. If the human asks you to do something (check a client, send an email, publish a post), USE THE TOOL — don't just talk about it.

When you use a tool, briefly tell the human what you're doing and share the result.

Keep responses concise and action-oriented. You're a CEO, not an assistant.`

  const messages = [
    ...conversationHistory,
    { role: "user", content: message }
  ]
  
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOLS,
      messages
    })
    
    let textResponse = ""
    let toolResults = []
    let newMessages = [...messages]
    
    // Handle multi-turn tool use
    let currentResponse = response
    let iterations = 0
    const maxIterations = 5
    
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
          
          // Check approval
          if (needsApproval(block.name)) {
            newMessages.push({ role: "assistant", content: assistantContent })
            newMessages.push({
              role: "user",
              content: [{ type: "tool_result", tool_use_id: block.id, content: "This action requires human approval. Ask the operator to approve it with a !command." }]
            })
            textResponse += `\n\n⚠️ **Needs your approval:** \`${block.name}\` — use the appropriate !command to execute this manually.`
            toolResults.push({ tool: block.name, status: "needs_approval" })
            assistantContent = []
            continue
          }
          
          const result = await executeTool(block.name, block.input)
          toolResults.push({ tool: block.name, result: result.error ? "error" : "success" })
          
          newMessages.push({ role: "assistant", content: assistantContent })
          newMessages.push({
            role: "user",
            content: [{ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result).substring(0, 10000) }]
          })
          assistantContent = []
        }
      }
      
      if (!hasToolUse) break
      
      // If there were tool calls, get Claude's response to the results
      if (hasToolUse) {
        currentResponse = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: systemPrompt,
          tools: TOOLS,
          messages: newMessages
        })
        
        // Reset text for the new response
        textResponse = ""
        for (const block of currentResponse.content) {
          if (block.type === "text") textResponse += block.text
        }
        
        if (currentResponse.stop_reason === "end_turn") break
      }
    }
    
    return {
      success: true,
      response: textResponse,
      toolsUsed: toolResults,
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
// SCHEDULED AGENT RUNS
// Run specific goals on a schedule
// ============================================
async function dailyAgentRun(discordNotify = null) {
  const goals = [
    "Check all client follow-ups. For any that are overdue, decide what action to take — send a follow-up email, add a note, or reschedule. Then check if any active clients need new blog content this week.",
    "Review business metrics. Check revenue, sales, and pipeline. Identify the single highest-impact action to take today to move closer to $10k/month MRR.",
    "Create one valuable blog post for jordan-ai.co about AI for small business. Pick a topic that would attract our ideal customer (local business owners). Deploy it."
  ]
  
  // Pick goal based on day of week for variety
  const dayIndex = new Date().getDay() % goals.length
  const goal = goals[dayIndex]
  
  return await runAgent(goal, { discordNotify })
}

// ============================================
// GET AGENT STATUS
// ============================================
function getAgentStatus() {
  return {
    ...agentState,
    guardrails: {
      maxStepsPerRun: GUARDRAILS.maxStepsPerRun,
      maxDailyRuns: MAX_DAILY_RUNS,
      emailsSentThisHour: GUARDRAILS.emailsSentThisHour,
      protectedFiles: GUARDRAILS.protectedFiles
    }
  }
}

// Daily reset
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

// ============================================
// INITIALIZE TASK QUEUE
// Connect the tool executor so sub-agents
// can use the same tools as the main agent
// ============================================
taskQueue.setToolExecutor(executeTool)

// ============================================
// EXPORTS
// ============================================
module.exports = {
  runAgent,
  agentChat,
  dailyAgentRun,
  getAgentStatus,
  executeTool,
  TOOLS
}
