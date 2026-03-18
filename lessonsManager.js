// ============================================
// JORDAN AI — LESSONS MANAGER
// Self-correction system. Jordan learns from
// mistakes and applies fixes automatically.
//
// lessons.json stores:
//   - What happened
//   - What went wrong
//   - Correct approach
//   - Keywords for matching
//   - Date learned
//
// Injected into every agent system prompt so
// Jordan never repeats the same mistake twice.
// ============================================

const fs   = require("fs")
const path = require("path")

const LESSONS_FILE = path.join(__dirname, "lessons.json")

// ── READ / WRITE ──────────────────────────────

function loadLessons() {
  if (!fs.existsSync(LESSONS_FILE)) return []
  try {
    const data = JSON.parse(fs.readFileSync(LESSONS_FILE, "utf8"))
    return Array.isArray(data) ? data : (data.lessons || [])
  } catch { return [] }
}

function saveLessons(lessons) {
  fs.writeFileSync(LESSONS_FILE, JSON.stringify(lessons, null, 2), "utf8")
}

// ── ADD LESSON ────────────────────────────────

function addLesson({ whatHappened, whatWentWrong, correctApproach, category = "general", source = "jordan" }) {
  const lessons = loadLessons()

  // Avoid exact duplicates (same correctApproach)
  const duplicate = lessons.find(l =>
    l.correctApproach.toLowerCase().trim() === correctApproach.toLowerCase().trim()
  )
  if (duplicate) {
    return { added: false, reason: "Duplicate lesson already exists", existing: duplicate }
  }

  // Auto-extract keywords from the lesson text
  const allText = `${whatHappened} ${whatWentWrong} ${correctApproach}`.toLowerCase()
  const keywordCandidates = [
    "image","photo","logo","asset","upload","discord","attachment",
    "website","template","html","deploy","client","slug",
    "unsplash","stock","media","video","file","download",
    "chatbot","tidio","tool","error","fail","mistake",
    "email","smtp","wordpress","social","twitter","crm",
    "color","style","design","build","create","generate",
  ]
  const keywords = keywordCandidates.filter(k => allText.includes(k))

  const lesson = {
    id:              lessons.length + 1,
    category,
    whatHappened:    whatHappened    || "",
    whatWentWrong:   whatWentWrong   || "",
    correctApproach,
    keywords,
    source,           // "jordan" (auto-learned) or "human" (taught by user)
    learnedAt:       new Date().toISOString(),
  }

  lessons.push(lesson)
  saveLessons(lessons)
  return { added: true, lesson }
}

// ── FIND MATCHING LESSONS ─────────────────────
/**
 * Find lessons relevant to a task description.
 * Returns array of matching lessons sorted by relevance (match count).
 */
function findMatchingLessons(taskText) {
  if (!taskText) return loadLessons()
  const lower = taskText.toLowerCase()
  const lessons = loadLessons()

  return lessons
    .map(l => {
      const matches = (l.keywords || []).filter(k => lower.includes(k)).length
      return { ...l, matches }
    })
    .filter(l => l.matches > 0)
    .sort((a, b) => b.matches - a.matches)
}

// ── FORMAT FOR SYSTEM PROMPT ──────────────────
/**
 * Returns a concise block to inject into agent system prompts.
 * Called before every task so Jordan never forgets.
 */
function formatLessonsForPrompt(taskText = "") {
  const lessons = loadLessons()
  if (lessons.length === 0) return ""

  // For a specific task: show matching lessons first, then all others
  // For no task: show all lessons
  let ordered = lessons
  if (taskText) {
    const lower = taskText.toLowerCase()
    ordered = [...lessons].sort((a, b) => {
      const aMatches = (a.keywords || []).filter(k => lower.includes(k)).length
      const bMatches = (b.keywords || []).filter(k => lower.includes(k)).length
      return bMatches - aMatches
    })
  }

  const lines = ["## LESSONS LEARNED — Apply these before every task:"]
  ordered.forEach((l, i) => {
    lines.push(`${i + 1}. [${l.category}] ${l.correctApproach}`)
  })
  lines.push("")

  return lines.join("\n")
}

// ── FORMAT FOR DISCORD ────────────────────────

function formatLessonsForDiscord() {
  const lessons = loadLessons()
  if (lessons.length === 0) {
    return "No lessons saved yet. Use `!learn \"...\"` to teach Jordan something."
  }

  const lines = [`**📚 Jordan's Lessons (${lessons.length})**`, ``]

  // Group by category
  const byCategory = {}
  for (const l of lessons) {
    if (!byCategory[l.category]) byCategory[l.category] = []
    byCategory[l.category].push(l)
  }

  for (const [cat, catLessons] of Object.entries(byCategory)) {
    lines.push(`**${cat.toUpperCase()}**`)
    catLessons.forEach(l => {
      const source = l.source === "human" ? " 👤" : " 🤖"
      lines.push(`  ${l.id}. ${l.correctApproach}${source}`)
    })
    lines.push("")
  }

  lines.push(`_🤖 = Jordan learned | 👤 = You taught_`)
  return lines.join("\n")
}

// ── SEED INITIAL LESSONS ──────────────────────
/**
 * Called once on startup to ensure core lessons exist.
 * These are the lessons the user specified to seed.
 */
function seedCoreLessons() {
  const CORE_LESSONS = [
    {
      whatHappened:    "User uploaded images to Discord but Jordan used Unsplash stock photos",
      whatWentWrong:   "Jordan did not download Discord attachment URLs before building the site",
      correctApproach: "When user uploads images via Discord, call upload_client_assets with the attachment URL FIRST, then build or re-render the website",
      category:        "assets",
      source:          "human",
    },
    {
      whatHappened:    "Client had uploaded their own logo and photos but site showed generic stock images",
      whatWentWrong:   "Jordan called fetchClientMedia instead of checking assets.json placements first",
      correctApproach: "Always check website/clients/[slug]/assets.json for client-uploaded images before using Unsplash or curated fallbacks — client assets have highest priority",
      category:        "assets",
      source:          "human",
    },
    {
      whatHappened:    "Ran create_client_website without checking if client had existing assets",
      whatWentWrong:   "Overwrote placements because existing client assets were not loaded before render",
      correctApproach: "Before building or re-rendering any client site, check website/clients/[slug]/assets/ for uploaded files and website/clients/[slug]/assets.json for placements — these override all defaults",
      category:        "assets",
      source:          "human",
    },
    {
      whatHappened:    "User said 'Jordan can't see the image' when attaching a photo",
      whatWentWrong:   "Jordan replied 'I cannot view images' instead of using upload_client_assets with the attachment URL",
      correctApproach: "When a message contains [Discord attachments], NEVER say you cannot see the image — use upload_client_assets with the URL to download it. You do not need to see it visually, just download it via tool.",
      category:        "discord",
      source:          "human",
    },
  ]

  const existing = loadLessons()
  let added = 0
  for (const lesson of CORE_LESSONS) {
    const isDuplicate = existing.some(e =>
      e.correctApproach.toLowerCase().trim() === lesson.correctApproach.toLowerCase().trim()
    )
    if (!isDuplicate) {
      addLesson(lesson)
      added++
    }
  }
  if (added > 0) console.log(`📚 Seeded ${added} core lessons into lessons.json`)
}

// ── EXPORTS ───────────────────────────────────

module.exports = {
  addLesson,
  loadLessons,
  findMatchingLessons,
  formatLessonsForPrompt,
  formatLessonsForDiscord,
  seedCoreLessons,
}
