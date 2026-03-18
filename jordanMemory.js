// ============================================
// JORDAN AI - LIVING MEMORY SYSTEM
// jordanMemory.js
//
// This is NOT a static file Jordan reads once.
// This is a brain that GROWS every single day.
//
// What this does (plain English):
// - Every win, failure, idea, and lesson gets
//   written here automatically — by Jordan herself
// - Jordan reads her own memory before making
//   any decision, so she gets smarter over time
// - Memory is organized by what it IS, not by
//   when it happened — so old wins stay relevant
// - Jordan can reflect on her own patterns and
//   tell you what she's learning about herself
//
// Files it manages:
//   jordan-brain.json  ← structured data (machine-readable)
//   MEMORY.md          ← human-readable summary (you can read this)
// ============================================

require("dotenv").config()
const fs   = require("fs")
const path = require("path")

const { thinkDeepJSON, quickWriteJSON } = require("./aiBrain")

// ============================================
// FILE PATHS
// ============================================
const BRAIN_PATH  = path.join(__dirname, "jordan-brain.json")
const MEMORY_PATH = path.join(__dirname, "MEMORY.md")

// ============================================
// MEMORY CATEGORIES
// Each category is a bucket of lessons.
// Jordan adds to these automatically.
// ============================================
const CATEGORIES = {
  WINS:        "wins",         // Things that worked — keep doing these
  FAILURES:    "failures",     // Things that failed — avoid or fix
  PATTERNS:    "patterns",     // Repeated observations — important signals
  PRODUCT_IDEAS: "productIdeas", // AI product opportunities worth exploring
  MARKET:      "market",       // What the market is doing right now
  TACTICS:     "tactics",      // Specific tactics that moved the needle
  AUDIENCE:    "audience",     // What Jordan's audience responds to
  BLOCKERS:    "blockers",     // Things that keep slowing Jordan down
}

// ============================================
// LOAD BRAIN
// Reads jordan-brain.json from disk.
// If it doesn't exist yet, creates a fresh one.
// ============================================
function loadBrain() {
  try {
    if (fs.existsSync(BRAIN_PATH)) {
      return JSON.parse(fs.readFileSync(BRAIN_PATH, "utf8"))
    }
  } catch (err) {
    console.log("⚠️  Brain load error:", err.message)
  }

  // Fresh brain — Jordan starts here on day one
  return {
    identity: {
      name: "Jordan AI",
      goal: "$10k/month recurring revenue",
      budget: "$400/month AI spend",
      domain: "jordan-ai.co",
      focus: "AI tools and automation for small businesses",
      voice: "Helpful, direct, professional solopreneur",
      location: "Nationwide (South Carolina base)"
    },
    wins:        [],
    failures:    [],
    patterns:    [],
    productIdeas:[],
    market:      [],
    tactics:     [],
    audience:    [],
    blockers:    [],
    stats: {
      totalBlogsPublished: 0,
      totalErrorsFixed:    0,
      totalIdeasGenerated: 0,
      lastUpdated:         null
    }
  }
}

// ============================================
// SAVE BRAIN
// Writes the updated brain back to disk.
// Also rebuilds the human-readable MEMORY.md.
// ============================================
function saveBrain(brain) {
  // Update timestamp
  brain.stats.lastUpdated = new Date().toISOString()

  // Keep each category trimmed — most recent 50 entries max
  // This prevents the brain from growing unbounded
  const CAPS = {
    wins: 50, failures: 50, patterns: 30,
    productIdeas: 40, market: 30,
    tactics: 40, audience: 30, blockers: 20
  }
  for (const [key, cap] of Object.entries(CAPS)) {
    if (brain[key] && brain[key].length > cap) {
      brain[key] = brain[key].slice(-cap) // keep newest
    }
  }

  fs.writeFileSync(BRAIN_PATH, JSON.stringify(brain, null, 2))

  // Rebuild the human-readable MEMORY.md every time brain saves
  rebuildMemoryMD(brain)

  return brain
}

// ============================================
// REMEMBER (core function)
// This is how Jordan writes to her own memory.
//
// Usage:
//   remember("wins", "Blog about AI chatbots got 300 views in 24h")
//   remember("failures", "WordPress deploy failed 3x — creds expired")
//   remember("productIdeas", "Small businesses want AI phone answering, $97/mo")
// ============================================
function remember(category, fact, metadata = {}) {
  if (!Object.values(CATEGORIES).includes(category)) {
    console.log(`⚠️  Unknown memory category: ${category}`)
    return false
  }

  const brain = loadBrain()

  const entry = {
    fact,
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric"
    }),
    ...metadata  // optional extras: source, confidence, revenue_impact, etc.
  }

  brain[category].push(entry)

  console.log(`🧠 Memory saved [${category}]: ${fact.slice(0, 60)}...`)
  saveBrain(brain)
  return true
}

// ============================================
// RECALL (read memory for a specific purpose)
// Jordan reads her own memory before acting.
// Returns the most relevant recent entries.
//
// Usage:
//   const lessons = recall("tactics", 5)   // last 5 tactics
//   const ideas   = recall("productIdeas") // all recent ideas
// ============================================
function recall(category, limit = 10) {
  const brain = loadBrain()
  const entries = brain[category] || []
  return entries.slice(-limit) // most recent first
}

// ============================================
// RECALL ALL — for building context
// Returns a flat summary Jordan can read before
// making a big decision.
// ============================================
function recallAll() {
  const brain = loadBrain()
  return {
    identity: brain.identity,
    recentWins:    brain.wins.slice(-5),
    recentFails:   brain.failures.slice(-5),
    topPatterns:   brain.patterns.slice(-5),
    productIdeas:  brain.productIdeas.slice(-8),
    marketSignals: brain.market.slice(-5),
    bestTactics:   brain.tactics.slice(-5),
    audienceNotes: brain.audience.slice(-5),
    activeBlockers:brain.blockers.slice(-5),
    stats:         brain.stats
  }
}

// ============================================
// LEARN FROM EVENT
// Jordan calls this after ANYTHING happens.
// She decides what category to file it under
// and writes the lesson herself using AI.
//
// Usage:
//   await learnFrom("blog_published", {
//     title: "How AI saves dentists time",
//     views: 0,   // just published
//   })
//
//   await learnFrom("error_fixed", {
//     task: "WordPress deploy",
//     error: "401 unauthorized",
//     fix: "Refreshed API key"
//   })
//
//   await learnFrom("blog_traffic", {
//     title: "5 AI tools for restaurants",
//     views: 847,
//     source: "Google"
//   })
// ============================================
async function learnFrom(eventType, eventData) {
  console.log(`\n🧠 Jordan is learning from: ${eventType}`)

  const context = recallAll()

  const prompt = `You are Jordan AI's memory system. An event just happened and you need to extract the most useful lesson from it and file it in the right memory category.

EVENT TYPE: ${eventType}
EVENT DATA: ${JSON.stringify(eventData, null, 2)}

JORDAN'S CURRENT MEMORY CONTEXT:
- Recent wins: ${context.recentWins.map(w => w.fact).join(" | ") || "none yet"}
- Recent failures: ${context.recentFails.map(f => f.fact).join(" | ") || "none yet"}
- Known patterns: ${context.topPatterns.map(p => p.fact).join(" | ") || "none yet"}

YOUR JOB:
1. Decide which category this event belongs in
2. Write ONE clear, specific, actionable lesson (1-2 sentences max)
3. Assign a confidence score (how sure are you this is a real insight?)

CATEGORIES:
- "wins" — something worked, Jordan should keep doing this
- "failures" — something failed, Jordan should fix or avoid this
- "patterns" — this same thing has happened before, it's a real signal
- "productIdeas" — this reveals a product Jordan could build and sell
- "market" — this tells Jordan something about what the AI market wants right now
- "tactics" — a specific tactic that moved the needle (or didn't)
- "audience" — something Jordan's audience responded to (or ignored)
- "blockers" — a recurring obstacle that keeps slowing Jordan down

RESPONSE (JSON only, no extra text):
{
  "category": "wins",
  "lesson": "Blog posts about AI for specific industries (dentists, restaurants) get 3x more clicks than generic AI posts.",
  "confidence": 0.8,
  "actionable": "Write more industry-specific AI content"
}`

  const result = await quickWriteJSON(prompt,
    "You are Jordan AI's memory extraction system. Respond only with valid JSON."
  )

  if (!result || !result.category || !result.lesson) {
    console.log("⚠️  Could not extract lesson — saving raw event")
    // Fallback: save the raw event as a note
    remember("patterns", `${eventType}: ${JSON.stringify(eventData).slice(0, 120)}`)
    return
  }

  // Save the extracted lesson
  remember(result.category, result.lesson, {
    confidence:  result.confidence || 0.5,
    actionable:  result.actionable || null,
    sourceEvent: eventType,
    rawData:     JSON.stringify(eventData).slice(0, 200)
  })

  console.log(`✅ Lesson filed under [${result.category}]: ${result.lesson}`)
  return result
}

// ============================================
// REFLECT — Jordan examines her own patterns
// Call this weekly. Jordan reads all her memory,
// finds the real patterns, and surfaces the top
// 3 things she should focus on next.
//
// Returns a written reflection you can send
// to Discord or review yourself.
// ============================================
async function reflect() {
  console.log("\n🪞 Jordan is reflecting on her own patterns...")

  const context = recallAll()

  const prompt = `You are Jordan AI. You are reading your own memory and reflecting honestly on what you've learned.

YOUR MEMORY:
Wins: ${JSON.stringify(context.recentWins.map(w => w.fact))}
Failures: ${JSON.stringify(context.recentFails.map(f => f.fact))}
Patterns: ${JSON.stringify(context.topPatterns.map(p => p.fact))}
Product Ideas: ${JSON.stringify(context.productIdeas.map(p => p.fact))}
Market signals: ${JSON.stringify(context.marketSignals.map(m => m.fact))}
Best tactics: ${JSON.stringify(context.bestTactics.map(t => t.fact))}
Audience notes: ${JSON.stringify(context.audienceNotes.map(a => a.fact))}
Active blockers: ${JSON.stringify(context.activeBlockers.map(b => b.fact))}

Stats: ${JSON.stringify(context.stats)}

YOUR GOAL: $10k/month revenue for jordan-ai.co

Write a honest, direct reflection. No fluff. Answer:
1. What is actually working right now?
2. What keeps getting in the way?
3. What is the single highest-leverage thing to focus on this week?
4. What product opportunity is emerging from the patterns you see?

Write in first person as Jordan. Be direct and specific. 200 words max.`

  const { thinkDeep } = require("./aiBrain")
  const reflection = await thinkDeep(prompt)

  if (reflection) {
    // Save the reflection itself as a pattern
    remember("patterns", `Weekly reflection: ${reflection.slice(0, 150)}...`, {
      type: "reflection",
      fullText: reflection
    })
  }

  return reflection
}

// ============================================
// TRACK STATS
// Simple counters Jordan updates herself.
// ============================================
function trackStat(statName, incrementBy = 1) {
  const brain = loadBrain()
  if (brain.stats[statName] !== undefined) {
    brain.stats[statName] += incrementBy
    saveBrain(brain)
    console.log(`📊 Stat updated: ${statName} = ${brain.stats[statName]}`)
  }
}

function getStats() {
  return loadBrain().stats
}

// ============================================
// REBUILD MEMORY.MD
// Every time the brain saves, this rebuilds
// a clean human-readable MEMORY.md file.
// You can always open this and see what Jordan
// knows in plain English.
// ============================================
function rebuildMemoryMD(brain) {
  const format = (entries, limit = 5) =>
    entries.slice(-limit)
      .map(e => `- [${e.date || "recent"}] ${e.fact}`)
      .join("\n") || "- Nothing yet"

  const md = `# Jordan AI — Living Memory
*Auto-generated by jordanMemory.js — last updated ${new Date().toLocaleString()}*
*Do not edit manually — Jordan writes this herself*

---

## Identity
- **Name:** ${brain.identity.name}
- **Goal:** ${brain.identity.goal}
- **Focus:** ${brain.identity.focus}
- **Budget:** ${brain.identity.budget}
- **Domain:** ${brain.identity.domain}

---

## What's Working (Recent Wins)
${format(brain.wins)}

## What's Not Working (Recent Failures)
${format(brain.failures)}

## Patterns Jordan Has Noticed
${format(brain.patterns)}

## Product Ideas in the Pipeline
${format(brain.productIdeas, 8)}

## Market Signals (What AI Buyers Want)
${format(brain.market)}

## Best Tactics (Specific Things That Moved the Needle)
${format(brain.tactics)}

## Audience Insights
${format(brain.audience)}

## Active Blockers (Recurring Problems)
${format(brain.blockers)}

---

## Stats
- Blogs published: ${brain.stats.totalBlogsPublished}
- Errors fixed autonomously: ${brain.stats.totalErrorsFixed}
- Product ideas generated: ${brain.stats.totalIdeasGenerated}
- Memory last updated: ${brain.stats.lastUpdated || "never"}
`

  fs.writeFileSync(MEMORY_PATH, md)
}

// ============================================
// GET MEMORY CONTEXT STRING
// Returns a compact string of Jordan's memory
// that can be injected into any AI prompt.
// This is how Jordan "remembers" when writing
// blog posts or making decisions.
// ============================================
function getMemoryContext() {
  const brain = loadBrain()

  const fmt = (arr, limit = 3) =>
    arr.slice(-limit).map(e => `• ${e.fact}`).join("\n") || "• None yet"

  return `## Jordan's Memory (what she knows)
**What's working:**
${fmt(brain.wins)}

**What to avoid:**
${fmt(brain.failures)}

**Market signals right now:**
${fmt(brain.market)}

**Best tactics:**
${fmt(brain.tactics)}

**Audience responds to:**
${fmt(brain.audience)}

**Active blockers:**
${fmt(brain.blockers)}
`
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  remember,          // Write a specific lesson to memory
  recall,            // Read entries from one category
  recallAll,         // Read all memory at once
  learnFrom,         // AI-powered: extract lesson from an event
  reflect,           // AI-powered: Jordan reads her own patterns
  trackStat,         // Increment a stat counter
  getStats,          // Read all stats
  getMemoryContext,  // Get compact memory string for AI prompts
  CATEGORIES,        // The category constants
  loadBrain,         // Raw brain access (advanced use)
}
