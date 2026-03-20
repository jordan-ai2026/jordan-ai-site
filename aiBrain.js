// ============================================
// JORDAN AI - BRAIN
// GPT-4o-mini for everything — fast, cheap, always on.
// Deep thinking and architecture = Cleo (OpenClaw).
// Jordan AI is the execution layer, not the thinker.
// ============================================

require("dotenv").config()
const Anthropic = require("@anthropic-ai/sdk")
const OpenAI = require("openai")

// Initialize both clients
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// ============================================
// RATE LIMIT HELPERS
// ============================================
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withRetry(fn, label = "API call", maxRetries = 4) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isRateLimit = err.status === 429 || err.message?.includes("rate limit") || err.message?.includes("overloaded")
      const isServerErr = err.status >= 500

      if ((isRateLimit || isServerErr) && attempt < maxRetries - 1) {
        const waitMs = Math.pow(2, attempt + 1) * 5000 // 10s, 20s, 40s
        console.log(`⏳ ${label} rate limited. Waiting ${waitMs / 1000}s (attempt ${attempt + 1}/${maxRetries})...`)
        await sleep(waitMs)
        continue
      }

      throw err
    }
  }
}

// ============================================
// thinkDeep — now routes to GPT-4o-mini
// Deep architecture decisions go to Cleo (OpenClaw)
// ============================================
async function thinkDeep(prompt, context = "") {
  return quickWrite(
    context ? `${context}\n\n${prompt}` : prompt,
    "You are Jordan AI — an autonomous AI content and marketing engine. Be direct, specific, and action-oriented."
  )
}

async function thinkDeepJSON(prompt, context = "") {
  return quickWriteJSON(
    context ? `${context}\n\n${prompt}` : prompt,
    "You are Jordan AI. Respond only with valid JSON."
  )
}

// ============================================
// GPT-4o-mini: Fast Volume Tasks
// Use for: Blog posts, descriptions, chat
// ============================================
async function quickWrite(prompt, systemPrompt = "You are a helpful assistant.") {
  try {
    return await withRetry(async () => {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ]
      })
      return response.choices[0].message.content
    }, "quickWrite")

  } catch (err) {
    console.log("❌ GPT error:", err.message)
    return null
  }
}

// ============================================
// GPT-4o-mini: Fast JSON Response
// Use for: Simple structured data
// ============================================
async function quickWriteJSON(prompt, systemPrompt = "You are a helpful assistant. Respond only with valid JSON.") {
  try {
    return await withRetry(async () => {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      })
      return JSON.parse(response.choices[0].message.content)
    }, "quickWriteJSON")

  } catch (err) {
    console.log("❌ GPT JSON error:", err.message)
    return null
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  thinkDeep,      // Opus - strategic thinking
  thinkDeepJSON,  // Opus - strategic JSON
  quickWrite,     // GPT - fast writing
  quickWriteJSON  // GPT - fast JSON
}
