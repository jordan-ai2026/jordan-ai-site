// ============================================
// CEO BRAIN - Jordan's Personality & Memory
// ============================================

const fs = require("fs")
const path = require("path")

const PERSONA_DIR = path.join(__dirname, "Persona")

// ============================================
// LOAD PERSONA FILES
// ============================================
function loadPersona() {
  let soul = ""
  let identity = ""
  let memory = ""
  
  try {
    const soulPath = path.join(PERSONA_DIR, "SOUL.md")
    if (fs.existsSync(soulPath)) {
      soul = fs.readFileSync(soulPath, "utf8")
    }
    
    const identityPath = path.join(PERSONA_DIR, "IDENTITY.md")
    if (fs.existsSync(identityPath)) {
      identity = fs.readFileSync(identityPath, "utf8")
    }
    
    const memoryPath = path.join(PERSONA_DIR, "MEMORY.md")
    if (fs.existsSync(memoryPath)) {
      memory = fs.readFileSync(memoryPath, "utf8")
    }
  } catch (err) {
    console.log("Persona load error:", err.message)
  }
  
  return { soul, identity, memory }
}

// ============================================
// BUILD SYSTEM PROMPT
// ============================================
function buildSystemPrompt() {
  const persona = loadPersona()
  
  return `You are Jordan AI.

${persona.identity}

${persona.soul}

## What You Remember
${persona.memory}

## Current Date
${new Date().toLocaleDateString()}

## How To Respond
- Be direct and helpful
- Think like a CEO building a business
- Focus on actions that generate revenue
- Keep responses concise unless detail is needed
- Remember: the goal is $10k/month`
}

// ============================================
// ADD TO MEMORY
// ============================================
function addMemory(fact, category = "Learned Patterns") {
  try {
    const memoryPath = path.join(PERSONA_DIR, "MEMORY.md")
    
    if (!fs.existsSync(memoryPath)) {
      console.log("Memory file not found")
      return false
    }
    
    let memory = fs.readFileSync(memoryPath, "utf8")
    
    // Find the category section and add the fact
    const date = new Date().toLocaleDateString()
    const newLine = `\n- [${date}] ${fact}`
    
    if (memory.includes(`## ${category}`)) {
      memory = memory.replace(
        `## ${category}`,
        `## ${category}${newLine}`
      )
      fs.writeFileSync(memoryPath, memory)
      console.log(`Memory added: ${fact}`)
      return true
    }
    
    return false
  } catch (err) {
    console.log("Memory error:", err.message)
    return false
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  loadPersona,
  buildSystemPrompt,
  addMemory
}
