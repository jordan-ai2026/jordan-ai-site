// ============================================
// JORDAN AI - TASK QUEUE & SUB-AGENT RUNNER
// 
// Lets the agent brain delegate tasks to
// sub-agents that run in the background.
// Main brain stays free for conversation.
//
// ARCHITECTURE:
// Opus (CEO) → decides what needs to happen
//   → Queues tasks for sub-agents
//   → Sub-agents run independently (GPT-4o-mini)
//   → Results reported back to Discord
//   → Opus stays free to chat with you
//
// Sub-agents:
//   writer    — blog posts, emails, content
//   researcher — market analysis, competitor checks
//   builder   — WordPress pages, site updates
//   sales     — outreach, proposals, follow-ups
//   support   — client check-ins, report generation
// ============================================

const fs = require("fs")
const path = require("path")
const OpenAI = require("openai")

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ============================================
// TASK QUEUE
// ============================================
const QUEUE_FILE = path.join(__dirname, "task-queue.json")

let taskQueue = []
let runningTasks = new Map()  // taskId → { task, promise }
let completedTasks = []
let taskIdCounter = 1
let isProcessing = false
const MAX_CONCURRENT = 3  // Run up to 3 sub-agent tasks at once
let discordNotifyFn = null  // Set from index.js

function setNotifier(fn) {
  discordNotifyFn = fn
}

function notify(msg) {
  if (discordNotifyFn) {
    try { discordNotifyFn(msg) } catch (err) {}
  }
}

// ============================================
// TASK STRUCTURE
// ============================================
function createTask(agentId, description, toolCalls, options = {}) {
  const task = {
    id: taskIdCounter++,
    agentId,  // writer, researcher, builder, sales, support
    description,
    toolCalls,  // Array of { tool, input } to execute in order
    priority: options.priority || "normal",  // high, normal, low
    status: "queued",  // queued, running, completed, failed
    queuedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    result: null,
    error: null
  }
  
  taskQueue.push(task)
  console.log(`📋 Task #${task.id} queued → ${agentId}: ${description}`)
  saveQueue()
  
  // Auto-start processing
  processQueue()
  
  return task
}

// ============================================
// AGENT DEFINITIONS
// Each sub-agent has a personality and capabilities
// ============================================
const AGENTS = {
  writer: {
    name: "Ink (Writer)",
    model: "gpt-4o-mini",
    systemPrompt: "You are Ink, a skilled content writer for a digital agency. You write SEO blog posts, email copy, social media content, and marketing materials. Your tone is professional but warm. You write for small business owners who aren't tech-savvy. Every piece of content should be genuinely helpful."
  },
  researcher: {
    name: "Scout (Researcher)",
    model: "gpt-4o-mini",
    systemPrompt: "You are Scout, a market researcher for a digital agency. You analyze competitors, identify opportunities, validate ideas, and gather data. You're thorough but concise. Focus on actionable insights, not fluff."
  },
  builder: {
    name: "Forge (Builder)",
    model: "gpt-4o-mini",
    systemPrompt: "You are Forge, a technical builder for a digital agency. You create WordPress content, build web pages, configure tools, and handle technical tasks. You're efficient and detail-oriented."
  },
  sales: {
    name: "Closer (Sales)",
    model: "gpt-4o-mini",
    systemPrompt: "You are Closer, a sales agent for a digital agency that builds AI chatbots and manages websites for small businesses. You write outreach emails, proposals, and follow-ups. You're persuasive but never pushy. You focus on the prospect's problems, not your features."
  },
  support: {
    name: "Pulse (Support)",
    model: "gpt-4o-mini",
    systemPrompt: "You are Pulse, a client success agent for a digital agency. You check on clients, generate reports, track satisfaction, and flag issues before they become problems. You're proactive and detail-oriented."
  }
}

// ============================================
// EXECUTE A SINGLE TASK
// Runs the tool calls in sequence using the
// sub-agent's personality via GPT-4o-mini
// ============================================
async function executeTask(task, executeTool) {
  const agent = AGENTS[task.agentId] || AGENTS.writer
  
  task.status = "running"
  task.startedAt = new Date().toISOString()
  
  console.log(`🤖 ${agent.name} starting: ${task.description}`)
  notify(`🤖 **${agent.name}** starting: ${task.description}`)
  
  const results = []
  
  try {
    for (const call of task.toolCalls) {
      console.log(`   🔧 ${agent.name} → ${call.tool}`)
      
      // If the tool call needs AI-generated content, use the sub-agent's model
      if (call.needsAI) {
        const aiResponse = await openai.chat.completions.create({
          model: agent.model,
          messages: [
            { role: "system", content: agent.systemPrompt },
            { role: "user", content: call.aiPrompt }
          ]
        })
        call.input = { ...call.input, ...call.aiResult(aiResponse.choices[0].message.content) }
      }
      
      // Execute the actual tool
      const result = await executeTool(call.tool, call.input)
      results.push({ tool: call.tool, result })
      
      if (result.error) {
        console.log(`   ❌ ${agent.name}: ${result.error}`)
      } else {
        console.log(`   ✅ ${agent.name}: ${call.tool} done`)
      }
    }
    
    task.status = "completed"
    task.completedAt = new Date().toISOString()
    task.result = results
    
    console.log(`✅ ${agent.name} finished: ${task.description}`)
    notify(`✅ **${agent.name}** finished: ${task.description}`)
    
  } catch (err) {
    task.status = "failed"
    task.completedAt = new Date().toISOString()
    task.error = err.message
    
    console.log(`❌ ${agent.name} failed: ${err.message}`)
    notify(`❌ **${agent.name}** failed: ${task.description} — ${err.message}`)
  }
  
  // Move to completed
  completedTasks.push(task)
  if (completedTasks.length > 100) completedTasks = completedTasks.slice(-100)
  
  saveQueue()
  return task
}

// ============================================
// PROCESS QUEUE
// Runs tasks up to MAX_CONCURRENT at a time
// Non-blocking — doesn't stop the main bot
// ============================================
async function processQueue() {
  if (isProcessing) return
  isProcessing = true
  
  // This is intentionally not awaited from the caller
  // It runs in the background
  ;(async () => {
    while (taskQueue.length > 0) {
      // Wait if at max concurrency
      if (runningTasks.size >= MAX_CONCURRENT) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }
      
      // Sort by priority
      taskQueue.sort((a, b) => {
        const priority = { high: 0, normal: 1, low: 2 }
        return (priority[a.priority] || 1) - (priority[b.priority] || 1)
      })
      
      // Get next task
      const task = taskQueue.shift()
      if (!task) break
      
      // Get the execute function (set from agentEngine)
      const executeTool = taskQueue._executeTool
      if (!executeTool) {
        console.log("⚠️ No executeTool function set — can't process tasks")
        taskQueue.unshift(task)
        break
      }
      
      // Run it (don't await — let it run in background)
      const promise = executeTask(task, executeTool)
      runningTasks.set(task.id, { task, promise })
      
      promise.then(() => {
        runningTasks.delete(task.id)
      }).catch(() => {
        runningTasks.delete(task.id)
      })
    }
    
    isProcessing = false
  })()
}

// Set the tool executor (called from agentEngine)
function setToolExecutor(fn) {
  taskQueue._executeTool = fn
}

// ============================================
// QUICK DELEGATE FUNCTIONS
// Use these from the agent engine or Discord
// ============================================

// Delegate a blog post to the writer agent
function delegateBlogPost(slug, topic, executeTool) {
  return createTask("writer", `Write blog post: ${topic}`, [
    {
      tool: "wp_create_post",
      input: { slug, topic, categories: ["Blog"] },
      needsAI: false  // wp_create_post already uses GPT-4o-mini internally
    }
  ])
}

// Delegate a page creation to the builder agent
function delegatePage(slug, topic, executeTool) {
  return createTask("builder", `Create page: ${topic}`, [
    {
      tool: "wp_create_page",
      input: { slug, topic },
      needsAI: false
    }
  ])
}

// Delegate an email to the sales agent
function delegateEmail(to, purpose, context) {
  return createTask("sales", `Email: ${purpose}`, [
    {
      tool: "ai_write_and_send_email",
      input: { to, purpose, context },
      needsAI: false
    }
  ])
}

// Delegate a social media post to the writer
function delegateSocialPost(topic) {
  return createTask("writer", `Social post: ${topic}`, [
    {
      tool: "social_write_and_post",
      input: { topic, platform: "all" },
      needsAI: false
    }
  ])
}

// Delegate a follow-up check to support
function delegateFollowUpCheck(slug) {
  return createTask("support", `Check on client: ${slug}`, [
    {
      tool: "check_client_details",
      input: { slug },
      needsAI: false
    }
  ])
}

// Delegate a monthly report to support
function delegateMonthlyReport(to, clientName, businessName, postsPublished, highlights) {
  return createTask("support", `Monthly report: ${businessName}`, [
    {
      tool: "send_monthly_report",
      input: { to, client_name: clientName, business_name: businessName, posts_published: postsPublished, highlights },
      needsAI: false
    }
  ])
}

// Delegate website deploy to builder
function delegateDeploy(message) {
  return createTask("builder", `Deploy: ${message}`, [
    {
      tool: "deploy_website",
      input: { message },
      needsAI: false
    }
  ])
}

// ============================================
// BATCH DELEGATE
// Queue multiple tasks at once
// ============================================
function delegateBatch(tasks) {
  const queued = []
  for (const t of tasks) {
    const task = createTask(t.agent, t.description, t.toolCalls, { priority: t.priority })
    queued.push(task)
  }
  return queued
}

// ============================================
// STATUS & MANAGEMENT
// ============================================
function getQueueStatus() {
  return {
    queued: taskQueue.length,
    running: runningTasks.size,
    completed: completedTasks.length,
    runningTasks: Array.from(runningTasks.values()).map(r => ({
      id: r.task.id,
      agent: r.task.agentId,
      description: r.task.description,
      startedAt: r.task.startedAt
    })),
    recentCompleted: completedTasks.slice(-5).reverse().map(t => ({
      id: t.id,
      agent: t.agentId,
      description: t.description,
      status: t.status,
      duration: t.completedAt && t.startedAt ? 
        Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 1000) + "s" : "unknown"
    }))
  }
}

function clearQueue() {
  const count = taskQueue.length
  taskQueue = []
  saveQueue()
  return count
}

function formatQueueStatus() {
  const status = getQueueStatus()
  
  let msg = `**📋 Task Queue**\n\n`
  msg += `Queued: ${status.queued} | Running: ${status.running} | Completed: ${status.completed}\n`
  msg += `Max concurrent: ${MAX_CONCURRENT}\n\n`
  
  if (status.runningTasks.length > 0) {
    msg += "**🔄 Running Now:**\n"
    status.runningTasks.forEach(t => {
      msg += `• #${t.id} **${AGENTS[t.agent]?.name || t.agent}**: ${t.description}\n`
    })
    msg += "\n"
  }
  
  if (status.recentCompleted.length > 0) {
    msg += "**✅ Recently Completed:**\n"
    status.recentCompleted.forEach(t => {
      const icon = t.status === "completed" ? "✅" : "❌"
      msg += `${icon} #${t.id} **${AGENTS[t.agent]?.name || t.agent}**: ${t.description} (${t.duration})\n`
    })
  }
  
  return msg
}

// ============================================
// PERSISTENCE
// ============================================
function saveQueue() {
  try {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify({
      queue: taskQueue,
      completed: completedTasks.slice(-50),
      counter: taskIdCounter
    }, null, 2))
  } catch (err) {}
}

function loadQueue() {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const data = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"))
      taskIdCounter = data.counter || 1
      completedTasks = data.completed || []
      // Don't reload queued tasks — start fresh on restart
    }
  } catch (err) {}
}

loadQueue()

// ============================================
// EXPORTS
// ============================================
module.exports = {
  // Core
  createTask,
  processQueue,
  setToolExecutor,
  setNotifier,
  
  // Quick delegates
  delegateBlogPost,
  delegatePage,
  delegateEmail,
  delegateSocialPost,
  delegateFollowUpCheck,
  delegateMonthlyReport,
  delegateDeploy,
  delegateBatch,
  
  // Status
  getQueueStatus,
  formatQueueStatus,
  clearQueue,
  
  // Constants
  AGENTS
}
