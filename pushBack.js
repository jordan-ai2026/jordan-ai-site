// ============================================
// JORDAN AI - PUSH BACK CAPABILITY
// Honest disagreement when Jordan thinks you're wrong
// ============================================

require("dotenv").config()
const { thinkDeep } = require("./aiBrain")
const { loadPersona } = require("./ceoBrain")

// ============================================
// EVALUATE IF JORDAN SHOULD PUSH BACK
// ============================================
async function shouldPushBack(userMessage, context = "") {
  const persona = loadPersona()
  
  const prompt = `You are Jordan AI. Your boss just said something. Should you push back or agree?

SOUL: ${persona.soul}

What they said: "${userMessage}"

${context ? `Context: ${context}` : ""}

Evaluate:
1. Is this a bad idea that could hurt the business?
2. Is there a better approach they might not see?
3. Are they missing important information?
4. Is this against what we know works?

You are NOT sycophantic. You have permission to disagree.
But don't push back on everything — pick your battles wisely.

Return JSON:
{
  "shouldPushBack": true or false,
  "reason": "Why you should or shouldn't push back",
  "severity": "minor" or "moderate" or "major",
  "alternative": "What you'd suggest instead (if pushing back)"
}`

  try {
    const response = await thinkDeep(prompt)
    
    // Parse JSON from response
    let jsonText = response.trim()
    if (jsonText.includes("```")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    }
    
    return JSON.parse(jsonText)
  } catch (err) {
    console.log("Push back evaluation error:", err.message)
    return { shouldPushBack: false }
  }
}

// ============================================
// GENERATE PUSH BACK RESPONSE
// ============================================
async function generatePushBack(userMessage, evaluation) {
  const persona = loadPersona()
  
  const prompt = `You are Jordan AI. You need to push back on what your boss said, but do it respectfully and constructively.

SOUL: ${persona.soul}

What they said: "${userMessage}"

Why you're pushing back: ${evaluation.reason}
Severity: ${evaluation.severity}
Your alternative: ${evaluation.alternative}

Write a response that:
1. Acknowledges their idea briefly
2. Explains your concern honestly
3. Offers your alternative
4. Asks for their thoughts

Be direct but not rude. Be honest but not harsh.
You're a trusted advisor, not a yes-man.

Keep it concise (2-4 sentences).`

  const response = await thinkDeep(prompt)
  return response
}

// ============================================
// FULL PUSH BACK FLOW
// ============================================
async function evaluateAndRespond(userMessage, context = "") {
  // First, evaluate if we should push back
  const evaluation = await shouldPushBack(userMessage, context)
  
  if (!evaluation.shouldPushBack) {
    return {
      pushingBack: false,
      evaluation: evaluation
    }
  }
  
  console.log(`⚠️ Jordan is pushing back (${evaluation.severity})`)
  
  // Generate the push back response
  const response = await generatePushBack(userMessage, evaluation)
  
  return {
    pushingBack: true,
    evaluation: evaluation,
    response: response
  }
}

// ============================================
// PUSH BACK PHRASES (for quick detection)
// ============================================
const RISKY_PHRASES = [
  // Bad business decisions
  "let's just", "quickly", "skip", "don't worry about",
  "forget about", "who cares", "it's fine", "rush",
  
  // Potentially harmful
  "free", "give away", "no charge", "discount everything",
  "spam", "mass email", "buy followers",
  
  // Against learnings
  "generic", "simple ai tool", "everyone needs",
  "go viral", "get rich quick"
]

function mightNeedPushBack(message) {
  const lower = message.toLowerCase()
  return RISKY_PHRASES.some(phrase => lower.includes(phrase))
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  shouldPushBack,
  generatePushBack,
  evaluateAndRespond,
  mightNeedPushBack
}
