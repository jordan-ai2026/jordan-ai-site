// ============================================
// JORDAN AI - ERROR HEALER
// Jordan's ability to fix her own problems.
//
// HOW IT WORKS (plain English):
// 1. A task fails and throws an error
// 2. We capture the error and send it to Claude AI
// 3. Claude reads the error and decides: retry, skip, or alert you
// 4. Jordan acts on that decision automatically
// 5. If she keeps hitting the same error, she flags it as a bottleneck
// 6. You only get a Discord ping when she truly cannot fix it herself
// ============================================

require("dotenv").config()
const fs   = require("fs")
const path = require("path")

// Pull in Jordan's AI brain for diagnosis
const { thinkDeepJSON } = require("./aiBrain")

// Pull in memory so Jordan can remember patterns
const { addMemory } = require("./ceoBrain")

// Pull in Discord reporter so Jordan can alert you when needed
// (sendReport is already wired to your Discord webhook in reporter.js)
let sendReport
try {
  const reporter = require("./reporter")
  sendReport = reporter.sendReport
} catch (_) {
  // If reporter.js doesn't exist yet, use a simple console fallback
  sendReport = async (msg) => console.log("📣 ALERT:", msg)
}

// ============================================
// ERROR LOG FILE
// Jordan keeps a running record of every error.
// This is how she spots bottlenecks (repeated failures).
// ============================================
const ERROR_LOG_PATH = path.join(__dirname, "error-log.json")

// Load the error log from disk (or start fresh if it doesn't exist)
function loadErrorLog() {
  try {
    if (fs.existsSync(ERROR_LOG_PATH)) {
      return JSON.parse(fs.readFileSync(ERROR_LOG_PATH, "utf8"))
    }
  } catch (_) {}
  // Default empty structure
  return { errors: [], bottlenecks: [] }
}

// Save the error log back to disk
function saveErrorLog(log) {
  // Only keep the last 200 errors so the file doesn't grow forever
  if (log.errors.length > 200) {
    log.errors = log.errors.slice(-200)
  }
  fs.writeFileSync(ERROR_LOG_PATH, JSON.stringify(log, null, 2))
}

// ============================================
// BOTTLENECK DETECTION
// If the same type of error happens 3+ times
// in the last hour, it's a bottleneck.
// Jordan flags it so you know something is
// structurally broken, not just a fluke.
// ============================================
const BOTTLENECK_THRESHOLD = 3    // how many times before it's a pattern
const BOTTLENECK_WINDOW_MS = 60 * 60 * 1000  // 1 hour window

function checkForBottleneck(taskName, errorMessage) {
  const log = loadErrorLog()
  const now  = Date.now()

  // Find recent errors for this same task
  const recentSameErrors = log.errors.filter(e =>
    e.taskName === taskName &&
    (now - e.timestamp) < BOTTLENECK_WINDOW_MS
  )

  if (recentSameErrors.length >= BOTTLENECK_THRESHOLD) {
    // Only record each bottleneck once (don't spam)
    const alreadyFlagged = log.bottlenecks.find(b =>
      b.taskName === taskName && (now - b.timestamp) < BOTTLENECK_WINDOW_MS
    )

    if (!alreadyFlagged) {
      log.bottlenecks.push({
        taskName,
        errorMessage,
        count: recentSameErrors.length,
        timestamp: now,
        date: new Date().toISOString()
      })
      saveErrorLog(log)
      return true  // Yes, this is a bottleneck
    }
  }

  return false  // Not a bottleneck yet
}

// ============================================
// LOG A SINGLE ERROR
// Every time Jordan hits an error, we record it.
// ============================================
function logError(taskName, errorMessage, action) {
  const log = loadErrorLog()

  log.errors.push({
    taskName,
    errorMessage,
    action,           // what Jordan decided to do (retry, skip, alert)
    timestamp: Date.now(),
    date: new Date().toISOString()
  })

  saveErrorLog(log)
}

// ============================================
// AI DIAGNOSIS
// This is the core self-healing step.
// Jordan sends the error to Claude AI and
// gets back a decision: what should she do?
// ============================================
async function diagnoseError(taskName, errorMessage, attemptNumber) {
  console.log(`\n🩺 Diagnosing error in "${taskName}" (attempt ${attemptNumber})...`)

  const prompt = `You are the error-recovery system for Jordan AI, an autonomous business agent.

TASK THAT FAILED: ${taskName}
ERROR MESSAGE: ${errorMessage}
ATTEMPT NUMBER: ${attemptNumber}

Your job is to decide what Jordan should do next.

Choose one of these three actions:

1. "retry" — The error is probably temporary (network timeout, rate limit, API hiccup).
   Jordan should wait a moment and try again.
   Include a wait time in seconds (waitSeconds).

2. "skip" — The error means this specific task cannot work right now, but
   Jordan can move on and do other things. Don't block the whole system.
   Include a reason why it's safe to skip.

3. "alert" — This is serious. Something is broken that Jordan cannot fix herself.
   She needs to notify the human owner immediately.
   Include a plain-English message explaining what broke and why.

DECISION RULES:
- Attempt 1: Prefer "retry" for network/API errors. Prefer "skip" for content errors.
- Attempt 2: Prefer "retry" if different strategy. Prefer "skip" if same error.
- Attempt 3+: Prefer "alert". Jordan has tried enough.
- ALWAYS "alert" for: authentication errors, billing errors, database corruption.
- NEVER "alert" for: timeouts, rate limits, missing optional content.

Respond ONLY with valid JSON. No extra text. Example:
{
  "action": "retry",
  "waitSeconds": 30,
  "reason": "Looks like a temporary API timeout. Worth trying again.",
  "alertMessage": null
}

OR:
{
  "action": "skip",
  "waitSeconds": 0,
  "reason": "The WordPress endpoint returned 404 - this post URL may be invalid. Safe to skip.",
  "alertMessage": null
}

OR:
{
  "action": "alert",
  "waitSeconds": 0,
  "reason": "Authentication failed - API key may be expired or invalid.",
  "alertMessage": "Jordan cannot publish to WordPress. The API key returned 401 Unauthorized. Please check your WP_API_KEY in the .env file."
}`

  // Ask Claude to diagnose it
  const diagnosis = await thinkDeepJSON(prompt)

  // If Claude itself fails to respond, default to a safe skip
  if (!diagnosis) {
    console.log("⚠️ Diagnosis failed — defaulting to skip")
    return {
      action: "skip",
      waitSeconds: 0,
      reason: "Diagnosis AI was unavailable. Skipping to keep Jordan running.",
      alertMessage: null
    }
  }

  console.log(`🩺 Diagnosis: ${diagnosis.action.toUpperCase()} — ${diagnosis.reason}`)
  return diagnosis
}

// ============================================
// WAIT (sleep) HELPER
// Pauses for a number of seconds before retrying.
// Example: await wait(30) pauses for 30 seconds.
// ============================================
function wait(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000))
}

// ============================================
// MAIN FUNCTION: healAndRun
// This wraps any task with self-healing.
//
// HOW TO USE IT (example):
//
//   const result = await healAndRun(
//     "publish blog post",           ← name of the task (for logging)
//     () => createBlogPost(title)    ← the actual function to run
//   )
//
// That's it. Jordan handles the rest automatically.
// ============================================
async function healAndRun(taskName, taskFn, maxAttempts = 3) {
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // ── Try to run the task ──
      console.log(`\n▶️  Running "${taskName}" (attempt ${attempt}/${maxAttempts})`)
      const result = await taskFn()
      
      // ── Success! ──
      console.log(`✅ "${taskName}" succeeded on attempt ${attempt}`)
      return { success: true, result, attempts: attempt }

    } catch (err) {
      // ── Task threw an error ──
      lastError = err
      const errorMessage = err.message || String(err)

      console.log(`\n❌ "${taskName}" failed (attempt ${attempt}): ${errorMessage}`)

      // Record this error in the log
      logError(taskName, errorMessage, "diagnosing")

      // Check if this is becoming a bottleneck pattern
      const isBottleneck = checkForBottleneck(taskName, errorMessage)
      if (isBottleneck) {
        const bottleneckMsg = `🚨 BOTTLENECK DETECTED: "${taskName}" has failed ${BOTTLENECK_THRESHOLD}+ times in the last hour.\n\nLatest error: ${errorMessage}\n\nJordan has paused this task. Please investigate.`
        console.log(bottleneckMsg)
        await sendReport(bottleneckMsg)
        addMemory(`Bottleneck detected: ${taskName} — ${errorMessage}`, "Errors")
        return { success: false, error: errorMessage, bottleneck: true, attempts: attempt }
      }

      // If we've used all attempts, don't diagnose — just alert
      if (attempt >= maxAttempts) {
        break
      }

      // ── Ask AI what to do ──
      const diagnosis = await diagnoseError(taskName, errorMessage, attempt)
      logError(taskName, errorMessage, diagnosis.action)

      if (diagnosis.action === "retry") {
        // Wait the recommended time, then loop back and retry
        if (diagnosis.waitSeconds > 0) {
          console.log(`⏳ Waiting ${diagnosis.waitSeconds}s before retry...`)
          await wait(diagnosis.waitSeconds)
        }
        continue  // Go back to the top of the for loop

      } else if (diagnosis.action === "skip") {
        // Safe to move on — log it and return a graceful failure
        console.log(`⏭️  Skipping "${taskName}": ${diagnosis.reason}`)
        addMemory(`Skipped task "${taskName}": ${diagnosis.reason}`, "Errors")
        return { success: false, skipped: true, reason: diagnosis.reason, attempts: attempt }

      } else if (diagnosis.action === "alert") {
        // Something serious — notify you on Discord immediately
        const alertMsg = `🚨 Jordan needs help!\n\n**Task:** ${taskName}\n**Problem:** ${diagnosis.alertMessage || diagnosis.reason}\n\nJordan has paused this task and will continue with other work.`
        console.log(`📣 Alerting owner: ${diagnosis.alertMessage}`)
        await sendReport(alertMsg)
        addMemory(`Alerted owner about "${taskName}": ${diagnosis.alertMessage}`, "Errors")
        return { success: false, alerted: true, reason: diagnosis.alertMessage, attempts: attempt }
      }
    }
  }

  // ── All attempts exhausted ──
  const finalError = lastError?.message || "Unknown error"
  console.log(`\n💀 "${taskName}" failed after ${maxAttempts} attempts: ${finalError}`)

  const finalAlert = `🚨 Jordan gave up on: "${taskName}"\n\nFailed ${maxAttempts} times.\nLast error: ${finalError}\n\nThis task has been skipped for now.`
  await sendReport(finalAlert)
  addMemory(`Task permanently failed: "${taskName}" — ${finalError}`, "Errors")
  logError(taskName, finalError, "exhausted")

  return { success: false, exhausted: true, error: finalError, attempts: maxAttempts }
}

// ============================================
// BONUS: getErrorSummary
// Call this to see what's been going wrong.
// Jordan will report her recent errors.
// ============================================
function getErrorSummary() {
  const log = loadErrorLog()
  const now  = Date.now()
  const last24h = 24 * 60 * 60 * 1000

  const recent = log.errors.filter(e => (now - e.timestamp) < last24h)
  const activeBottlenecks = log.bottlenecks.filter(b => (now - b.timestamp) < last24h)

  return {
    totalErrorsLast24h: recent.length,
    activeBottlenecks: activeBottlenecks.length,
    bottlenecks: activeBottlenecks,
    mostRecentError: recent[recent.length - 1] || null
  }
}

// ============================================
// EXPORTS — what other files can use
// ============================================
module.exports = {
  healAndRun,        // Main wrapper — use this around any task
  getErrorSummary,   // See what's been breaking
  logError,          // Manually log an error
  checkForBottleneck // Manually check if something is a bottleneck
}
