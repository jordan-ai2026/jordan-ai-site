// ============================================
// JORDAN AI - TRUST LADDER
// Different autonomy levels for different actions
// ============================================

require("dotenv").config()
const fs = require("fs")
const path = require("path")

const TRUST_CONFIG_PATH = path.join(__dirname, "persona", "trust-config.json")

// ============================================
// DEFAULT TRUST CONFIGURATION
// ============================================
const DEFAULT_TRUST = {
  // Current trust level (1-4)
  level: 2,
  
  // Actions and their required trust levels
  actions: {
    // Level 1: Read-only
    "read_messages": 1,
    "read_files": 1,
    "read_analytics": 1,
    
    // Level 2: Draft & Approve
    "draft_product": 2,
    "draft_blog": 2,
    "draft_tweet": 2,
    "draft_email": 2,
    
    // Level 3: Act Within Bounds
    "create_product": 3,
    "publish_blog": 3,
    "deploy_website": 3,
    "post_tweet": 3,
    
    // Level 4: Full Autonomy
    "create_stripe_product": 4,
    "send_email": 4,
    "change_prices": 4,
    "delete_product": 4,
    "refund_customer": 4
  },
  
  // Boundaries even at max trust
  hardBoundaries: [
    "Never send money without explicit approval",
    "Never delete customer data",
    "Never share private information",
    "Never make claims about guaranteed results",
    "Always disclose AI-generated content when asked"
  ],
  
  // Trust history
  history: []
}

// ============================================
// LOAD TRUST CONFIG
// ============================================
function loadTrustConfig() {
  try {
    if (fs.existsSync(TRUST_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(TRUST_CONFIG_PATH, "utf8"))
    }
  } catch (err) {
    console.log("Error loading trust config:", err.message)
  }
  
  // Save default if doesn't exist
  saveTrustConfig(DEFAULT_TRUST)
  return DEFAULT_TRUST
}

function saveTrustConfig(config) {
  const dir = path.dirname(TRUST_CONFIG_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(TRUST_CONFIG_PATH, JSON.stringify(config, null, 2))
}

// ============================================
// CHECK IF ACTION IS ALLOWED
// ============================================
function canPerform(actionName) {
  const config = loadTrustConfig()
  const requiredLevel = config.actions[actionName]
  
  if (requiredLevel === undefined) {
    console.log(`⚠️ Unknown action: ${actionName}, defaulting to DENY`)
    return false
  }
  
  const allowed = config.level >= requiredLevel
  
  if (!allowed) {
    console.log(`🔒 Action "${actionName}" requires trust level ${requiredLevel}, current level is ${config.level}`)
  }
  
  return allowed
}

// ============================================
// GET TRUST LEVEL INFO
// ============================================
function getTrustLevel() {
  const config = loadTrustConfig()
  
  const levelNames = {
    1: "Read-Only",
    2: "Draft & Approve",
    3: "Act Within Bounds",
    4: "Full Autonomy"
  }
  
  const levelDescriptions = {
    1: "Can read messages, files, and analytics but cannot modify anything.",
    2: "Can draft content for your approval before publishing.",
    3: "Can publish content and create products within defined boundaries.",
    4: "Full autonomous operation with minimal oversight."
  }
  
  return {
    level: config.level,
    name: levelNames[config.level],
    description: levelDescriptions[config.level],
    boundaries: config.hardBoundaries
  }
}

// ============================================
// SET TRUST LEVEL
// ============================================
function setTrustLevel(newLevel) {
  if (newLevel < 1 || newLevel > 4) {
    console.log("Trust level must be between 1 and 4")
    return false
  }
  
  const config = loadTrustConfig()
  const oldLevel = config.level
  
  config.level = newLevel
  config.history.push({
    date: new Date().toISOString(),
    from: oldLevel,
    to: newLevel
  })
  
  // Keep only last 50 history entries
  if (config.history.length > 50) {
    config.history = config.history.slice(-50)
  }
  
  saveTrustConfig(config)
  
  console.log(`🔐 Trust level changed: ${oldLevel} → ${newLevel}`)
  return true
}

// ============================================
// REQUIRE APPROVAL
// Returns true if action needs human approval
// ============================================
function requiresApproval(actionName) {
  const config = loadTrustConfig()
  const requiredLevel = config.actions[actionName]
  
  if (requiredLevel === undefined) return true
  
  // If we're at level 2 (Draft & Approve), most actions need approval
  if (config.level === 2 && requiredLevel >= 2) {
    return true
  }
  
  // If action is above our trust level, needs approval
  return config.level < requiredLevel
}

// ============================================
// INCREASE TRUST (after good behavior)
// ============================================
function increaseTrust() {
  const config = loadTrustConfig()
  if (config.level < 4) {
    return setTrustLevel(config.level + 1)
  }
  console.log("Already at maximum trust level")
  return false
}

// ============================================
// DECREASE TRUST (after mistake)
// ============================================
function decreaseTrust() {
  const config = loadTrustConfig()
  if (config.level > 1) {
    return setTrustLevel(config.level - 1)
  }
  console.log("Already at minimum trust level")
  return false
}

// ============================================
// CHECK HARD BOUNDARIES
// ============================================
function violatesHardBoundary(action) {
  const config = loadTrustConfig()
  
  const violations = {
    "send_money": "Never send money without explicit approval",
    "delete_customer": "Never delete customer data",
    "share_private": "Never share private information",
    "guarantee_results": "Never make claims about guaranteed results"
  }
  
  return violations[action] || null
}

// ============================================
// FORMAT TRUST STATUS
// ============================================
function formatTrustStatus() {
  const info = getTrustLevel()
  
  return `**Trust Level: ${info.level}/4 — ${info.name}**
${info.description}

**Hard Boundaries (never crossed):**
${info.boundaries.map(b => `• ${b}`).join("\n")}`
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  canPerform,
  getTrustLevel,
  setTrustLevel,
  requiresApproval,
  increaseTrust,
  decreaseTrust,
  violatesHardBoundary,
  formatTrustStatus,
  loadTrustConfig
}
