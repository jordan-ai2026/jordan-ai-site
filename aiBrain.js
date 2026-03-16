// ============================================
// JORDAN AI - DUAL MODEL BRAIN
// Opus for strategy, GPT-4o-mini for volume
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
// OPUS: Strategic Thinking
// Use for: Research, validation, product design
// ============================================
async function thinkDeep(prompt, context = "") {
  try {
    console.log("🧠 Opus thinking...")
    
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: context ? `${context}\n\n${prompt}` : prompt
        }
      ]
    })
    
    return response.content[0].text
    
  } catch (err) {
    console.log("❌ Opus error:", err.message)
    return null
  }
}

// ============================================
// OPUS: Strategic JSON Response
// Use for: Product research, validation
// ============================================
async function thinkDeepJSON(prompt, context = "") {
  try {
    console.log("🧠 Opus thinking (JSON)...")
    
    const fullPrompt = `${context ? context + "\n\n" : ""}${prompt}

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation, just the JSON object.`
    
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: fullPrompt
        }
      ]
    })
    
    const text = response.content[0].text.trim()
    
    // Try to extract JSON if wrapped in anything
    let jsonText = text
    if (text.includes("```")) {
      jsonText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    }
    
    return JSON.parse(jsonText)
    
  } catch (err) {
    console.log("❌ Opus JSON error:", err.message)
    return null
  }
}

// ============================================
// GPT-4o-mini: Fast Volume Tasks
// Use for: Blog posts, descriptions, chat
// ============================================
async function quickWrite(prompt, systemPrompt = "You are a helpful assistant.") {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ]
    })
    
    return response.choices[0].message.content
    
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
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    })
    
    return JSON.parse(response.choices[0].message.content)
    
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
