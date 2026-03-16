// ============================================
// JORDAN AI - MAIN BOT
// CEO orchestrating autonomous business
// ============================================

require("dotenv").config()
const { Client, GatewayIntentBits } = require("discord.js")
const OpenAI = require("openai")

// Core modules
const { buildSystemPrompt, addMemory } = require("./ceoBrain")
const { startAutonomous, getStatus, runCycle } = require("./autonomousLoop")
const { learnFromFeedback, getLearningResponse } = require("./feedbackLearner")
const { deployWebsite } = require("./gitDeploy")

// Orchestrator & Agents
const { orchestrate, quickOrchestrate } = require("./orchestrator")
const { listAgents, smartDelegate, delegateTo } = require("./subAgents")
const { assignSkill, removeSkill, createSkill, listAllSkills, getAgentSkills } = require("./agentSkills")

// Features
const { runNightlyRoutine, scheduleNightlyRoutine } = require("./selfReview")
const { evaluateAndRespond, mightNeedPushBack } = require("./pushBack")
const { getTrustLevel, setTrustLevel, formatTrustStatus } = require("./trustLadder")
const { updateDashboard, formatDashboard } = require("./revenueDashboard")

// Reporter
const reporter = require("./reporter")

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
})

// ============================================
// HELPERS
// ============================================
async function sendLongMessage(channel, text) {
  const chunk = 1900
  for (let i = 0; i < text.length; i += chunk) {
    await channel.send(text.substring(i, i + chunk))
  }
}

// ============================================
// BOT STARTUP
// ============================================
client.once("ready", () => {
  console.log("\n" + "=".repeat(60))
  console.log("🤖 JORDAN AI - CEO MODE")
  console.log("=".repeat(60))
  console.log(`   Discord: ${client.user.tag}`)
  console.log(`   Trust Level: ${getTrustLevel().level}/4 - ${getTrustLevel().name}`)
  console.log(`   Agents: ${listAgents().map(a => a.name).join(", ")}`)
  console.log("=".repeat(60) + "\n")
  
  // Initialize reporter with Discord client
  reporter.setClient(client)
  
  // Start autonomous orchestration
  console.log("Starting autonomous mode...")
  startAutonomous()
  
  // Schedule nightly self-review at 3am
  scheduleNightlyRoutine(3)
  
  // Update dashboard on startup
  updateDashboard()
})

// ============================================
// MESSAGE HANDLER
// ============================================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return
  const content = message.content.trim()
  
  console.log(`[${message.author.username}]: ${content}`)

  // ========================================
  // ORCHESTRATION COMMANDS
  // ========================================
  
  // !orchestrate - Full orchestration for a goal
  if (content.startsWith("!orchestrate")) {
    const goal = content.replace("!orchestrate", "").trim()
    if (!goal) {
      message.reply("Usage: `!orchestrate <goal>`\nI'll create a plan and delegate to my team.")
      return
    }
    await message.reply("🎯 Starting orchestration... Jordan is planning and delegating.")
    const result = await orchestrate(goal)
    if (result.success && result.report) {
      await sendLongMessage(message.channel, result.report)
    } else {
      await message.reply(`❌ Orchestration failed: ${result.error}`)
    }
    return
  }

  // !cycle - Run one autonomous cycle
  if (content === "!cycle") {
    await message.reply("🔄 Running autonomous cycle... Jordan is thinking.")
    const result = await runCycle()
    if (result && result.report) {
      await sendLongMessage(message.channel, result.report.join("\n"))
    } else {
      await message.reply("✅ Cycle complete (no report generated)")
    }
    return
  }

  // ========================================
  // AGENT COMMANDS
  // ========================================
  
  // !agents - List all agents with skills
  if (content === "!agents") {
    const agents = listAgents()
    const agentList = agents.map(a => {
      const skillList = a.skills.length > 0 ? a.skills.join(", ") : "_No skills assigned_"
      return `**${a.name}** (${a.id}) — ${a.role}\n   Skills: ${skillList}`
    }).join("\n\n")
    await message.reply(`**🤖 Jordan's Team**\n\n${agentList}`)
    return
  }

  // !delegate - Smart delegation
  if (content.startsWith("!delegate")) {
    const task = content.replace("!delegate", "").trim()
    if (!task) {
      message.reply("Usage: `!delegate <task>`")
      return
    }
    await message.reply("🔀 Delegating...")
    const result = await smartDelegate(task)
    if (result?.result) {
      await sendLongMessage(message.channel, `**${result.agent}** (${result.role}):\n\n${result.result}`)
    } else {
      await message.reply("❌ Delegation failed")
    }
    return
  }

  // !ask <agent> <task> - Direct delegation
  if (content.startsWith("!ask")) {
    const parts = content.replace("!ask", "").trim().split(" ")
    const agentId = parts[0]
    const task = parts.slice(1).join(" ")
    
    if (!agentId || !task) {
      message.reply("Usage: `!ask <agent> <task>`\nAgents: researcher, writer, support, sales, builder")
      return
    }
    
    await message.reply(`🤖 Asking ${agentId}...`)
    const result = await delegateTo(agentId, task)
    if (result?.result) {
      await sendLongMessage(message.channel, `**${result.agent}**:\n\n${result.result}`)
    } else {
      await message.reply(`❌ Unknown agent: ${agentId}`)
    }
    return
  }

  // ========================================
  // SKILLS COMMANDS
  // ========================================
  
  // !skills - List all available skills
  if (content === "!skills") {
    const skills = listAllSkills()
    const skillList = skills.map(s => `• **${s.id}** — ${s.name}`).join("\n")
    await message.reply(`**📚 Available Skills**\n\n${skillList}`)
    return
  }

  // !skill assign <agent> <skill>
  if (content.startsWith("!skill assign")) {
    const parts = content.replace("!skill assign", "").trim().split(" ")
    const agentId = parts[0]
    const skillId = parts[1]
    
    if (!agentId || !skillId) {
      message.reply("Usage: `!skill assign <agent> <skill-id>`")
      return
    }
    
    const success = assignSkill(agentId, skillId)
    if (success) {
      await message.reply(`✅ Assigned **${skillId}** to **${agentId}**`)
    } else {
      await message.reply(`❌ Couldn't assign skill. Check IDs.`)
    }
    return
  }

  // !skill remove <agent> <skill>
  if (content.startsWith("!skill remove")) {
    const parts = content.replace("!skill remove", "").trim().split(" ")
    const agentId = parts[0]
    const skillId = parts[1]
    
    if (!agentId || !skillId) {
      message.reply("Usage: `!skill remove <agent> <skill-id>`")
      return
    }
    
    const success = removeSkill(agentId, skillId)
    await message.reply(success ? `✅ Removed **${skillId}** from **${agentId}**` : `❌ Skill not found`)
    return
  }

  // !skill create <id> <name> | <description> | <prompt>
  if (content.startsWith("!skill create")) {
    const rest = content.replace("!skill create", "").trim()
    const parts = rest.split("|").map(p => p.trim())
    
    if (parts.length < 3) {
      message.reply("Usage: `!skill create <id> <name> | <description> | <prompt>`")
      return
    }
    
    const [idName, description, prompt] = parts
    const [skillId, ...nameParts] = idName.split(" ")
    const name = nameParts.join(" ")
    
    createSkill(skillId, name, description, prompt)
    await message.reply(`✅ Created skill **${skillId}** — ${name}`)
    return
  }

  // ========================================
  // STATUS & MANAGEMENT
  // ========================================
  
  // !status
  if (content === "!status") {
    const status = getStatus()
    const trust = getTrustLevel()
    const reportsChannel = reporter.getReportsChannel()
    const statusMsg = `**🤖 Jordan AI Status**

**Mode:** CEO Orchestrator
**Autonomous:** ${status.isRunning ? "✅ Running" : "❌ Stopped"}
**Products Today:** ${status.productsToday}/${status.maxProductsPerDay}
**Cycles Run:** ${status.cycleCount}
**Last Cycle:** ${status.lastCycle ? status.lastCycle.toLocaleTimeString() : "Never"}

**Trust Level:** ${trust.level}/4 — ${trust.name}
**Reports Channel:** ${reportsChannel ? `<#${reportsChannel}>` : "Not set"}`
    await message.reply(statusMsg)
    return
  }

  // !reports - Set reports channel
  if (content === "!reports here") {
    reporter.setReportsChannel(message.channel.id)
    await message.reply(`✅ Reports will be sent to this channel: <#${message.channel.id}>`)
    return
  }
  
  if (content === "!reports off") {
    reporter.clearReportsChannel()
    await message.reply("✅ Reports channel disabled")
    return
  }
  
  if (content === "!reports") {
    const reportsChannel = reporter.getReportsChannel()
    if (reportsChannel) {
      await message.reply(`📢 Reports channel: <#${reportsChannel}>\n\nUse \`!reports here\` to change or \`!reports off\` to disable.`)
    } else {
      await message.reply("📢 No reports channel set.\n\nUse \`!reports here\` in the channel where you want autonomous reports.")
    }
    return
  }

  // !dashboard
  if (content === "!dashboard" || content === "!revenue" || content === "!stats") {
    await message.reply("📊 Fetching dashboard...")
    await updateDashboard()
    await message.reply(formatDashboard())
    return
  }

  // !review
  if (content === "!review") {
    await message.reply("🪞 Starting self-review...")
    await runNightlyRoutine()
    await message.reply("✅ Self-review complete!")
    return
  }

  // !trust
  if (content.startsWith("!trust")) {
    const arg = content.replace("!trust", "").trim()
    if (!arg) {
      await message.reply(formatTrustStatus())
      return
    }
    const newLevel = parseInt(arg)
    if (newLevel >= 1 && newLevel <= 4) {
      setTrustLevel(newLevel)
      await message.reply(`🔐 Trust level set to **${newLevel}/4 — ${getTrustLevel().name}**`)
    } else {
      await message.reply("Usage: `!trust 1-4`")
    }
    return
  }

  // !remember
  if (content.startsWith("!remember")) {
    const fact = content.replace("!remember", "").trim()
    if (!fact) {
      message.reply("Usage: `!remember <fact>`")
      return
    }
    addMemory(fact)
    await message.reply(`✅ I'll remember: "${fact}"`)
    return
  }

  // !deploy
  if (content === "!deploy") {
    await message.reply("🚀 Deploying website...")
    //await deployWebsite("Manual deploy")
    await message.reply("✅ Deployed!")
    return
  }

  // !help
  if (content === "!help") {
    const helpMsg = `**🤖 Jordan AI - CEO Mode**

**Orchestration**
\`!orchestrate <goal>\` — Full orchestration with plan
\`!cycle\` — Run one autonomous cycle
\`!delegate <task>\` — Smart delegation
\`!ask <agent> <task>\` — Direct ask

**Agents**
\`!agents\` — List team with skills
Agents: researcher, writer, support, sales, builder

**Skills**
\`!skills\` — List all skills
\`!skill assign <agent> <skill>\` — Give skill
\`!skill remove <agent> <skill>\` — Remove skill
\`!skill create <id> <name> | <desc> | <prompt>\`

**Management**
\`!status\` — Bot status
\`!dashboard\` — Revenue stats
\`!review\` — Self-review now
\`!trust [1-4]\` — View/set trust
\`!remember <fact>\` — Save to memory
\`!deploy\` — Deploy website
\`!reports here\` — Send reports to this channel
\`!reports off\` — Disable reports`
    await message.reply(helpMsg)
    return
  }

  // ========================================
  // NATURAL CONVERSATION
  // ========================================
  
  try {
    // Check for feedback
    const learning = await learnFromFeedback(content)
    if (learning.learned) {
      await message.reply(`🧠 ${getLearningResponse(learning)}\n\n_Saved: "${learning.lesson}"_`)
      return
    }
    
    // Check for push back
    if (mightNeedPushBack(content)) {
      const pushBack = await evaluateAndRespond(content)
      if (pushBack.pushingBack && pushBack.response) {
        await message.reply(`⚠️ ${pushBack.response}`)
        return
      }
    }
    
    // Normal conversation
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: content }
      ]
    })
    
    await sendLongMessage(message.channel, response.choices[0].message.content)
    
  } catch (err) {
    console.log("Chat error:", err.message)
  }
})

// ============================================
// START
// ============================================
client.login(process.env.DISCORD_TOKEN)
