// ============================================
// JORDAN AI - SUB-AGENTS
// Specialist agents with assignable skills
// ============================================

require("dotenv").config()
const { quickWrite, quickWriteJSON, thinkDeep } = require("./aiBrain")
const { buildAgentPrompt, getAgentSkills } = require("./agentSkills")

// ============================================
// SUB-AGENT DEFINITIONS
// ============================================
const AGENTS = {
  researcher: {
    name: "Scout",
    role: "Market Research Specialist",
    expertise: "Finding market opportunities, analyzing competitors, validating ideas",
    basePrompt: `You are Scout, a market research specialist working for Jordan AI.

Your job:
- Find real pain points people will pay to solve
- Analyze competitors and find gaps
- Validate product ideas with brutal honesty
- Focus on the AI/automation niche

Be specific, data-driven, and critical. No fluff.`
  },
  
  writer: {
    name: "Ink",
    role: "Content & Copy Specialist",
    expertise: "Writing sales copy, blog posts, product descriptions, tweets",
    basePrompt: `You are Ink, a content and copywriting specialist working for Jordan AI.

Your job:
- Write compelling sales copy that converts
- Create engaging blog posts for SEO
- Craft product descriptions that sell
- Write tweets that get engagement

Be punchy, benefit-focused, and persuasive. No generic fluff.`
  },
  
  support: {
    name: "Iris",
    role: "Customer Support Specialist", 
    expertise: "Handling inquiries, refunds, troubleshooting, customer satisfaction",
    basePrompt: `You are Iris, a customer support specialist working for Jordan AI.

Your job:
- Answer customer questions helpfully
- Handle refund requests professionally
- Troubleshoot issues with products
- Keep customers happy and reduce churn

Be friendly, efficient, and solution-oriented.`
  },
  
  sales: {
    name: "Rex",
    role: "Sales & Outreach Specialist",
    expertise: "Lead qualification, follow-ups, closing deals, partnerships",
    basePrompt: `You are Rex, a sales specialist working for Jordan AI.

Your job:
- Qualify leads and identify hot prospects
- Write follow-up sequences that convert
- Identify partnership opportunities
- Close deals without being pushy

Be professional, persistent, and value-focused.`
  },
  
  builder: {
    name: "Ralph",
    role: "Technical Builder Specialist",
    expertise: "Code generation, debugging, technical implementation, automation",
    basePrompt: `You are Ralph, a technical builder specialist working for Jordan AI.

Your job:
- Write clean, working code
- Debug and fix issues
- Implement automations
- Build technical products

Be precise, efficient, and production-ready.`
  }
}

// ============================================
// GET AGENT'S FULL SYSTEM PROMPT
// Combines base prompt with assigned skills
// ============================================
function getAgentSystemPrompt(agentId) {
  const agent = AGENTS[agentId]
  if (!agent) return null
  
  // Build prompt with skills
  return buildAgentPrompt(agentId, agent.basePrompt)
}

// ============================================
// DELEGATE TO SUB-AGENT
// ============================================
async function delegateTo(agentId, task, context = "") {
  const agent = AGENTS[agentId]
  
  if (!agent) {
    console.log(`❌ Unknown agent: ${agentId}`)
    return null
  }
  
  // Get skills for this agent
  const skills = getAgentSkills(agentId)
  const skillNames = skills.map(s => s.name).join(", ") || "None"
  
  console.log(`🤖 Delegating to ${agent.name} (${agent.role})`)
  console.log(`   Skills: ${skillNames}`)
  
  // Build full prompt with skills
  const systemPrompt = getAgentSystemPrompt(agentId)
  
  const prompt = context 
    ? `Context: ${context}\n\nTask: ${task}`
    : task
  
  const result = await quickWrite(prompt, systemPrompt)
  
  if (result) {
    console.log(`   ✅ ${agent.name} completed task`)
  }
  
  return {
    agent: agent.name,
    agentId: agentId,
    role: agent.role,
    skills: skills.map(s => s.name),
    result: result
  }
}

// ============================================
// DELEGATE JSON TASK
// ============================================
async function delegateJSONTo(agentId, task, context = "") {
  const agent = AGENTS[agentId]
  
  if (!agent) {
    console.log(`❌ Unknown agent: ${agentId}`)
    return null
  }
  
  console.log(`🤖 Delegating to ${agent.name} (${agent.role})...`)
  
  const systemPrompt = getAgentSystemPrompt(agentId) + "\n\nRespond only with valid JSON."
  
  const prompt = context 
    ? `Context: ${context}\n\nTask: ${task}`
    : task
  
  const result = await quickWriteJSON(prompt, systemPrompt)
  
  if (result) {
    console.log(`   ✅ ${agent.name} completed task`)
  }
  
  return {
    agent: agent.name,
    agentId: agentId,
    role: agent.role,
    result: result
  }
}

// ============================================
// ESCALATE TO JORDAN (OPUS)
// ============================================
async function escalateToJordan(task, context = "") {
  console.log(`⬆️ Escalating to Jordan (CEO)...`)
  
  const prompt = `You are Jordan AI, the CEO. A task has been escalated to you that requires executive decision-making.

${context ? `Context: ${context}\n\n` : ""}Task: ${task}

Make the decision. Be direct and decisive.`
  
  const result = await thinkDeep(prompt)
  
  console.log(`   ✅ Jordan made decision`)
  
  return {
    agent: "Jordan",
    role: "CEO",
    result: result
  }
}

// ============================================
// SMART DELEGATION
// ============================================
async function smartDelegate(task) {
  const keywords = {
    researcher: ["research", "market", "competitor", "validate", "opportunity", "analyze", "trend", "find", "discover"],
    writer: ["write", "blog", "copy", "description", "tweet", "content", "article", "post", "email", "draft"],
    support: ["customer", "refund", "help", "issue", "problem", "support", "complaint", "inquiry"],
    sales: ["lead", "sell", "close", "outreach", "partnership", "prospect", "follow up", "pitch"],
    builder: ["code", "build", "fix", "bug", "implement", "automate", "technical", "script", "program"]
  }
  
  const taskLower = task.toLowerCase()
  
  let bestAgent = null
  let bestScore = 0
  
  for (const [agentId, agentKeywords] of Object.entries(keywords)) {
    const score = agentKeywords.filter(kw => taskLower.includes(kw)).length
    if (score > bestScore) {
      bestScore = score
      bestAgent = agentId
    }
  }
  
  if (!bestAgent || bestScore === 0) {
    console.log(`🤔 Complex task, escalating to Jordan`)
    return await escalateToJordan(task)
  }
  
  return await delegateTo(bestAgent, task)
}

// ============================================
// PARALLEL DELEGATION
// ============================================
async function delegateParallel(task, agentIds) {
  console.log(`🔀 Delegating to ${agentIds.length} agents in parallel...`)
  
  const promises = agentIds.map(id => delegateTo(id, task))
  const results = await Promise.all(promises)
  
  return results.filter(r => r !== null)
}

// ============================================
// LIST AGENTS WITH SKILLS
// ============================================
function listAgents() {
  return Object.entries(AGENTS).map(([id, agent]) => {
    const skills = getAgentSkills(id)
    return {
      id: id,
      name: agent.name,
      role: agent.role,
      expertise: agent.expertise,
      skills: skills.map(s => s.name)
    }
  })
}

function getAgentInfo(agentId) {
  const agent = AGENTS[agentId]
  if (!agent) return null
  
  const skills = getAgentSkills(agentId)
  return {
    id: agentId,
    ...agent,
    skills: skills
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  delegateTo,
  delegateJSONTo,
  escalateToJordan,
  smartDelegate,
  delegateParallel,
  listAgents,
  getAgentInfo,
  getAgentSystemPrompt,
  AGENTS
}
