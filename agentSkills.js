// ============================================
// JORDAN AI - AGENT SKILLS SYSTEM
// Assignable skills for sub-agents
// ============================================

require("dotenv").config()
const fs = require("fs")
const path = require("path")

const SKILLS_PATH = path.join(__dirname, "persona", "agent-skills.json")

// ============================================
// DEFAULT SKILLS LIBRARY
// ============================================
const DEFAULT_SKILLS = {
  // Research skills
  "market-research": {
    name: "Market Research",
    description: "Find market opportunities and validate ideas",
    prompt: `When doing market research:
- Identify specific pain points people pay to solve
- Find gaps competitors are missing
- Estimate market size and demand
- Be brutally honest about viability
- Focus on AI/automation niche`
  },
  
  "competitor-analysis": {
    name: "Competitor Analysis",
    description: "Analyze competitors and find opportunities",
    prompt: `When analyzing competitors:
- List direct and indirect competitors
- Identify their strengths and weaknesses
- Find gaps they're not serving
- Suggest differentiation strategies`
  },
  
  // Writing skills
  "sales-copy": {
    name: "Sales Copywriting",
    description: "Write compelling sales pages that convert",
    prompt: `When writing sales copy:
- Lead with the biggest pain point
- Use specific benefits, not features
- Include social proof elements
- Create urgency without being sleazy
- End with clear call to action`
  },
  
  "blog-writing": {
    name: "Blog Writing",
    description: "Write SEO-optimized blog posts",
    prompt: `When writing blog posts:
- Use keyword-rich headlines
- Write scannable content with subheadings
- Include actionable takeaways
- Naturally link to products
- Optimize for featured snippets`
  },
  
  "tweet-writing": {
    name: "Tweet Writing",
    description: "Write engaging tweets that get clicks",
    prompt: `When writing tweets:
- Hook in first line
- Use line breaks for readability
- End with engagement hook or CTA
- No hashtag spam
- Sound human, not corporate`
  },
  
  "email-sequences": {
    name: "Email Sequences",
    description: "Write email sequences that nurture and convert",
    prompt: `When writing email sequences:
- Welcome email: deliver value immediately
- Build trust before selling
- Tell stories, not pitches
- One CTA per email
- Subject lines that get opens`
  },
  
  // Support skills
  "customer-support": {
    name: "Customer Support",
    description: "Handle customer inquiries professionally",
    prompt: `When handling support:
- Acknowledge the issue first
- Be empathetic but efficient
- Solve the problem, don't just apologize
- Offer clear next steps
- Know when to escalate`
  },
  
  "refund-handling": {
    name: "Refund Handling",
    description: "Process refunds while retaining customers",
    prompt: `When handling refunds:
- Don't argue or be defensive
- Ask what went wrong (for learning)
- Process quickly if policy allows
- Offer alternatives when appropriate
- Thank them regardless`
  },
  
  // Sales skills
  "lead-qualification": {
    name: "Lead Qualification",
    description: "Identify and qualify hot prospects",
    prompt: `When qualifying leads:
- Identify budget, authority, need, timeline
- Score leads 1-10 on likelihood to buy
- Flag high-priority opportunities
- Suggest next actions for each`
  },
  
  "outreach-messages": {
    name: "Outreach Messages",
    description: "Write cold outreach that gets responses",
    prompt: `When writing outreach:
- Personalize the first line
- Show you understand their problem
- Make the ask small and easy
- No "just checking in" follow-ups
- Provide value before asking`
  },
  
  // Technical skills
  "code-generation": {
    name: "Code Generation",
    description: "Write clean, working code",
    prompt: `When writing code:
- Write production-ready code
- Include error handling
- Add helpful comments
- Test logic mentally before output
- Keep it simple and maintainable`
  },
  
  "debugging": {
    name: "Debugging",
    description: "Find and fix bugs efficiently",
    prompt: `When debugging:
- Reproduce the issue first
- Check the obvious things
- Read error messages carefully
- Fix root cause, not symptoms
- Explain what was wrong`
  },
  
  "automation-building": {
    name: "Automation Building",
    description: "Build workflows and automations",
    prompt: `When building automations:
- Map the full workflow first
- Handle edge cases
- Build in error recovery
- Log important events
- Make it maintainable`
  },
  
  // Product skills
  "product-ideation": {
    name: "Product Ideation",
    description: "Generate viable product ideas",
    prompt: `When generating product ideas:
- Focus on specific pain points
- Consider build effort vs revenue potential
- Target the AI/automation niche
- Think digital products (low overhead)
- Validate before building`
  },
  
  "pricing-strategy": {
    name: "Pricing Strategy",
    description: "Set optimal prices for products",
    prompt: `When setting prices:
- Research competitor pricing
- Consider perceived value, not cost
- Test different price points
- Use charm pricing ($97 vs $100)
- Higher prices = higher perceived quality`
  }
}

// ============================================
// AGENT SKILL ASSIGNMENTS
// ============================================
const DEFAULT_ASSIGNMENTS = {
  researcher: ["market-research", "competitor-analysis", "product-ideation"],
  writer: ["sales-copy", "blog-writing", "tweet-writing", "email-sequences"],
  support: ["customer-support", "refund-handling"],
  sales: ["lead-qualification", "outreach-messages"],
  builder: ["code-generation", "debugging", "automation-building"]
}

// ============================================
// LOAD/SAVE SKILLS
// ============================================
function loadSkillsConfig() {
  try {
    if (fs.existsSync(SKILLS_PATH)) {
      return JSON.parse(fs.readFileSync(SKILLS_PATH, "utf8"))
    }
  } catch (err) {
    console.log("Error loading skills:", err.message)
  }
  
  // Initialize with defaults
  const config = {
    skills: DEFAULT_SKILLS,
    assignments: DEFAULT_ASSIGNMENTS
  }
  saveSkillsConfig(config)
  return config
}

function saveSkillsConfig(config) {
  const dir = path.dirname(SKILLS_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(SKILLS_PATH, JSON.stringify(config, null, 2))
}

// ============================================
// SKILL MANAGEMENT
// ============================================

// Get all skills for an agent
function getAgentSkills(agentName) {
  const config = loadSkillsConfig()
  const skillIds = config.assignments[agentName] || []
  
  return skillIds.map(id => ({
    id,
    ...config.skills[id]
  })).filter(s => s.name)
}

// Assign a skill to an agent
function assignSkill(agentName, skillId) {
  const config = loadSkillsConfig()
  
  if (!config.skills[skillId]) {
    console.log(`❌ Skill "${skillId}" doesn't exist`)
    return false
  }
  
  if (!config.assignments[agentName]) {
    config.assignments[agentName] = []
  }
  
  if (config.assignments[agentName].includes(skillId)) {
    console.log(`⚠️ ${agentName} already has skill "${skillId}"`)
    return false
  }
  
  config.assignments[agentName].push(skillId)
  saveSkillsConfig(config)
  
  console.log(`✅ Assigned "${skillId}" to ${agentName}`)
  return true
}

// Remove a skill from an agent
function removeSkill(agentName, skillId) {
  const config = loadSkillsConfig()
  
  if (!config.assignments[agentName]) {
    return false
  }
  
  config.assignments[agentName] = config.assignments[agentName].filter(s => s !== skillId)
  saveSkillsConfig(config)
  
  console.log(`✅ Removed "${skillId}" from ${agentName}`)
  return true
}

// Create a new skill
function createSkill(skillId, name, description, prompt) {
  const config = loadSkillsConfig()
  
  config.skills[skillId] = {
    name,
    description,
    prompt
  }
  
  saveSkillsConfig(config)
  console.log(`✅ Created skill "${skillId}"`)
  return true
}

// Build enhanced system prompt with skills
function buildAgentPrompt(agentName, basePrompt) {
  const skills = getAgentSkills(agentName)
  
  if (skills.length === 0) {
    return basePrompt
  }
  
  const skillPrompts = skills.map(s => `### ${s.name}\n${s.prompt}`).join("\n\n")
  
  return `${basePrompt}

## YOUR SKILLS

${skillPrompts}`
}

// List all available skills
function listAllSkills() {
  const config = loadSkillsConfig()
  return Object.entries(config.skills).map(([id, skill]) => ({
    id,
    name: skill.name,
    description: skill.description
  }))
}

// Get skill details
function getSkill(skillId) {
  const config = loadSkillsConfig()
  return config.skills[skillId] || null
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  getAgentSkills,
  assignSkill,
  removeSkill,
  createSkill,
  buildAgentPrompt,
  listAllSkills,
  getSkill,
  loadSkillsConfig
}
