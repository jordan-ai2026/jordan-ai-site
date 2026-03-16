// ============================================
// JORDAN AI - FEEDBACK LEARNER
// Detects feedback in Discord and learns from it
// ============================================

require("dotenv").config()
const { quickWriteJSON } = require("./aiBrain")
const { addMemory } = require("./ceoBrain")

// ============================================
// FEEDBACK KEYWORDS
// Quick check before using AI
// ============================================
const FEEDBACK_TRIGGERS = [
  // Positive
  "i like", "love it", "great", "perfect", "yes", "good job", "nice", "awesome",
  "more like", "keep doing", "that works", "sold", "got a sale",
  
  // Negative  
  "don't like", "too generic", "boring", "stop", "no more", "bad", "terrible",
  "not working", "wrong", "change", "different", "less",
  
  // Direction
  "focus on", "try more", "should be", "needs to", "make it", "instead of",
  "what about", "consider", "prioritize", "avoid", "skip",
  
  // Product specific
  "product", "price", "niche", "market", "audience", "target",
  "bot", "template", "course", "prompt", "agent"
]

// ============================================
// CHECK IF MESSAGE MIGHT BE FEEDBACK
// ============================================
function mightBeFeedback(message) {
  const lower = message.toLowerCase()
  return FEEDBACK_TRIGGERS.some(trigger => lower.includes(trigger))
}

// ============================================
// ANALYZE FEEDBACK WITH AI
// ============================================
async function analyzeFeedback(message) {
  try {
    const result = await quickWriteJSON(
      `Analyze this message from my boss. Is it feedback about my product/business strategy?

Message: "${message}"

Return JSON:
{
  "isFeedback": true/false,
  "type": "positive" or "negative" or "direction" or "question" or "none",
  "category": "products" or "pricing" or "niche" or "marketing" or "general",
  "lesson": "What I should learn from this (1 sentence, start with action verb)",
  "confidence": 0.0 to 1.0
}

Only isFeedback=true if they're clearly giving feedback about the business.
Casual chat or questions about status are NOT feedback.`,
      "You detect business feedback. Be accurate, don't over-interpret."
    )
    
    return result
    
  } catch (err) {
    console.log("Feedback analysis error:", err.message)
    return { isFeedback: false }
  }
}

// ============================================
// PROCESS AND LEARN FROM FEEDBACK
// ============================================
async function learnFromFeedback(message) {
  // Quick check first
  if (!mightBeFeedback(message)) {
    return { learned: false }
  }
  
  // Analyze with AI
  const analysis = await analyzeFeedback(message)
  
  if (!analysis || !analysis.isFeedback || analysis.confidence < 0.7) {
    return { learned: false }
  }
  
  // Save to memory
  const category = getCategoryName(analysis.type)
  const saved = addMemory(analysis.lesson, category)
  
  if (saved) {
    console.log(`🧠 Learned: ${analysis.lesson}`)
    return {
      learned: true,
      lesson: analysis.lesson,
      type: analysis.type,
      category: analysis.category
    }
  }
  
  return { learned: false }
}

// ============================================
// MAP FEEDBACK TYPE TO MEMORY CATEGORY
// ============================================
function getCategoryName(type) {
  switch (type) {
    case "positive":
      return "What Works"
    case "negative":
      return "What Doesn't Work"
    case "direction":
      return "Key Decisions"
    default:
      return "Learned Patterns"
  }
}

// ============================================
// GET RESPONSE FOR LEARNING
// ============================================
function getLearningResponse(analysis) {
  const responses = {
    positive: [
      "Got it — I'll do more of that.",
      "Noted. Doubling down on what works.",
      "✅ Learned. More of this coming."
    ],
    negative: [
      "Understood. I'll avoid that going forward.",
      "Got it — adjusting my approach.",
      "✅ Won't make that mistake again."
    ],
    direction: [
      "On it. Updating my strategy.",
      "Good call. I'll focus on that.",
      "✅ New direction locked in."
    ]
  }
  
  const options = responses[analysis.type] || responses.direction
  return options[Math.floor(Math.random() * options.length)]
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  learnFromFeedback,
  mightBeFeedback,
  analyzeFeedback,
  getLearningResponse
}
