// ============================================
// JORDAN AI - SELF REVIEW & MEMORY CLEANUP
// Daily introspection to get smarter over time
// ============================================

require("dotenv").config()
const fs = require("fs")
const path = require("path")
const { thinkDeep } = require("./aiBrain")
const { loadPersona, addMemory } = require("./ceoBrain")

const PERSONA_DIR = path.join(__dirname, "persona")
const MEMORY_PATH = path.join(PERSONA_DIR, "MEMORY.md")
const REVIEW_LOG_PATH = path.join(PERSONA_DIR, "review-log.json")

// ============================================
// INITIALIZE REVIEW LOG
// ============================================
function initReviewLog() {
  if (!fs.existsSync(REVIEW_LOG_PATH)) {
    const initialLog = {
      reviews: [],
      lastReview: null,
      insights: []
    }
    fs.writeFileSync(REVIEW_LOG_PATH, JSON.stringify(initialLog, null, 2))
  }
  return JSON.parse(fs.readFileSync(REVIEW_LOG_PATH, "utf8"))
}

function saveReviewLog(log) {
  fs.writeFileSync(REVIEW_LOG_PATH, JSON.stringify(log, null, 2))
}

// ============================================
// DAILY SELF-REVIEW
// Jordan reflects on its performance
// ============================================
async function runSelfReview() {
  console.log("\n" + "=".repeat(60))
  console.log("🪞 JORDAN AI - DAILY SELF-REVIEW")
  console.log("=".repeat(60))
  
  const persona = loadPersona()
  const reviewLog = initReviewLog()
  
  // Get current memory content
  let currentMemory = ""
  try {
    currentMemory = fs.readFileSync(MEMORY_PATH, "utf8")
  } catch (err) {
    console.log("No memory file found")
    return
  }
  
  console.log("\n🧠 Analyzing my memory and patterns...")
  
  // Use Opus for deep self-reflection
  const reviewPrompt = `You are Jordan AI doing your daily self-review. Be honest and critical.

Here is your current memory and learned patterns:

${currentMemory}

Your identity:
${persona.identity}

Analyze yourself and answer:

1. WHAT'S WORKING: What patterns or decisions have been successful?
2. WHAT'S NOT WORKING: What should I stop doing or change?
3. REDUNDANCIES: Are there duplicate or conflicting memories?
4. GAPS: What am I missing? What should I learn?
5. PRIORITIES: What should I focus on tomorrow?
6. HONEST ASSESSMENT: On a scale of 1-10, how well am I doing at my job? Why?

Be specific. No fluff. This is for self-improvement.`

  const review = await thinkDeep(reviewPrompt)
  
  if (!review) {
    console.log("❌ Self-review failed")
    return
  }
  
  console.log("\n📝 Self-Review Results:")
  console.log("-".repeat(40))
  console.log(review)
  console.log("-".repeat(40))
  
  // Save review to log
  const reviewEntry = {
    date: new Date().toISOString(),
    review: review,
    memorySize: currentMemory.length
  }
  
  reviewLog.reviews.push(reviewEntry)
  reviewLog.lastReview = new Date().toISOString()
  
  // Keep only last 30 reviews
  if (reviewLog.reviews.length > 30) {
    reviewLog.reviews = reviewLog.reviews.slice(-30)
  }
  
  saveReviewLog(reviewLog)
  
  console.log("\n✅ Self-review complete and logged")
  
  return review
}

// ============================================
// MEMORY CONSOLIDATION
// Clean up duplicates, summarize, optimize
// ============================================
async function consolidateMemory() {
  console.log("\n🧹 MEMORY CONSOLIDATION")
  console.log("-".repeat(40))
  
  let currentMemory = ""
  try {
    currentMemory = fs.readFileSync(MEMORY_PATH, "utf8")
  } catch (err) {
    console.log("No memory file found")
    return
  }
  
  // Backup current memory
  const backupPath = path.join(PERSONA_DIR, "MEMORY_BACKUP.md")
  fs.writeFileSync(backupPath, currentMemory)
  console.log("📦 Memory backed up")
  
  console.log("🧠 Analyzing and consolidating...")
  
  const consolidationPrompt = `You are consolidating Jordan AI's memory file. Your goal is to make it cleaner and more useful.

Current memory file:
${currentMemory}

Tasks:
1. Remove exact duplicates
2. Merge similar entries (e.g., multiple "focus on X" entries)
3. Keep the most recent/specific version of conflicting info
4. Remove outdated info that's no longer relevant
5. Organize by category
6. Keep entries concise (1 line each)

Return the CLEANED memory file in the exact same markdown format.
Keep all section headers (## What Works, ## What Doesn't Work, etc.)
Keep the most valuable learnings. Remove noise.

Return ONLY the cleaned markdown file, nothing else.`

  const cleanedMemory = await thinkDeep(consolidationPrompt)
  
  if (!cleanedMemory) {
    console.log("❌ Consolidation failed, keeping original")
    return
  }
  
  // Validate it looks like a proper memory file
  if (!cleanedMemory.includes("##") || cleanedMemory.length < 100) {
    console.log("❌ Consolidated memory looks invalid, keeping original")
    return
  }
  
  // Save cleaned memory
  fs.writeFileSync(MEMORY_PATH, cleanedMemory)
  
  const savedBytes = currentMemory.length - cleanedMemory.length
  console.log(`✅ Memory consolidated`)
  console.log(`   Before: ${currentMemory.length} chars`)
  console.log(`   After: ${cleanedMemory.length} chars`)
  console.log(`   Saved: ${savedBytes} chars (${Math.round(savedBytes/currentMemory.length*100)}%)`)
  
  return cleanedMemory
}

// ============================================
// EXTRACT INSIGHTS FROM REVIEW
// Turn review into actionable memory
// ============================================
async function extractInsights(review) {
  console.log("\n💡 Extracting actionable insights...")
  
  const extractPrompt = `From this self-review, extract 2-3 specific actionable insights that should be remembered:

${review}

Return only the insights as a simple list, one per line. Start each with an action verb.
Example:
- Focus more on bot templates, they resonate with buyers
- Lower prices to $47-97 range for higher conversion
- Stop creating generic AI tools, be more specific`

  const insights = await thinkDeep(extractPrompt)
  
  if (insights) {
    // Add each insight to memory
    const lines = insights.split("\n").filter(l => l.trim().startsWith("-"))
    for (const line of lines.slice(0, 3)) {
      const insight = line.replace(/^-\s*/, "").trim()
      if (insight.length > 10) {
        addMemory(`[SELF-REVIEW] ${insight}`, "Key Decisions")
        console.log(`   Added: ${insight}`)
      }
    }
  }
  
  return insights
}

// ============================================
// FULL NIGHTLY ROUTINE
// ============================================
async function runNightlyRoutine() {
  console.log("\n" + "🌙".repeat(20))
  console.log("JORDAN AI - NIGHTLY ROUTINE")
  console.log("🌙".repeat(20))
  
  const startTime = Date.now()
  
  // 1. Self-review
  const review = await runSelfReview()
  
  // 2. Extract insights
  if (review) {
    await extractInsights(review)
  }
  
  // 3. Consolidate memory
  await consolidateMemory()
  
  const duration = Math.round((Date.now() - startTime) / 1000)
  
  console.log("\n" + "=".repeat(60))
  console.log(`✅ NIGHTLY ROUTINE COMPLETE (${duration}s)`)
  console.log("=".repeat(60) + "\n")
  
  return {
    success: true,
    duration,
    review
  }
}

// ============================================
// SCHEDULE NIGHTLY ROUTINE
// ============================================
function scheduleNightlyRoutine(hour = 3) {
  // Run at specified hour (default 3am)
  const now = new Date()
  let nextRun = new Date(now)
  nextRun.setHours(hour, 0, 0, 0)
  
  // If it's already past that time today, schedule for tomorrow
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1)
  }
  
  const msUntilRun = nextRun - now
  
  console.log(`🌙 Nightly routine scheduled for ${nextRun.toLocaleString()}`)
  
  // Schedule first run
  setTimeout(() => {
    runNightlyRoutine()
    
    // Then run every 24 hours
    setInterval(runNightlyRoutine, 24 * 60 * 60 * 1000)
  }, msUntilRun)
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  runSelfReview,
  consolidateMemory,
  extractInsights,
  runNightlyRoutine,
  scheduleNightlyRoutine
}
