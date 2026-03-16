// ============================================
// JORDAN AI - ORCHESTRATOR
// Jordan as CEO, delegating to sub-agents
// ============================================

require("dotenv").config()
const { thinkDeep, thinkDeepJSON } = require("./aiBrain")
const { loadPersona } = require("./ceoBrain")
const { delegateTo, AGENTS } = require("./subAgents")
const { buildAgentPrompt, getAgentSkills } = require("./agentSkills")

// ============================================
// JORDAN CREATES EXECUTION PLAN
// Break down a goal into delegated tasks
// ============================================
async function createExecutionPlan(goal, context = "") {
  console.log("\n" + "=".repeat(60))
  console.log("🧠 JORDAN AI - CREATING EXECUTION PLAN")
  console.log("=".repeat(60))
  console.log(`Goal: ${goal}`)
  
  const persona = loadPersona()
  
  // Get available agents and their skills
  const agentInfo = Object.entries(AGENTS).map(([id, agent]) => {
    const skills = getAgentSkills(id)
    return `- ${agent.name} (${id}): ${agent.role}
  Skills: ${skills.map(s => s.name).join(", ") || "None assigned"}`
  }).join("\n")
  
  const planPrompt = `You are Jordan AI, the CEO. You don't do the work yourself — you orchestrate your team.

YOUR IDENTITY:
${persona.soul}

YOUR TEAM:
${agentInfo}

GOAL: ${goal}

${context ? `CONTEXT: ${context}` : ""}

Create an execution plan. Break this goal into specific tasks and assign each to the right team member.

Return JSON:
{
  "analysis": "Your CEO-level thinking about this goal (1-2 sentences)",
  "tasks": [
    {
      "step": 1,
      "agent": "researcher|writer|support|sales|builder",
      "task": "Specific task description",
      "skill": "Which skill they should use (optional)",
      "depends_on": null or step number
    }
  ],
  "success_criteria": "How we know this is complete"
}

Rules:
- You NEVER do tasks yourself — always delegate
- Be specific about what each agent should produce
- Order tasks logically (research before writing, etc.)
- Use the right specialist for each task`

  const plan = await thinkDeepJSON(planPrompt)
  
  if (!plan) {
    console.log("❌ Failed to create plan")
    return null
  }
  
  console.log(`\n📋 Plan created: ${plan.tasks?.length || 0} tasks`)
  console.log(`   Analysis: ${plan.analysis}`)
  
  return plan
}

// ============================================
// EXECUTE PLAN
// Run each task through the appropriate agent
// ============================================
async function executePlan(plan) {
  if (!plan || !plan.tasks) {
    console.log("❌ No valid plan to execute")
    return null
  }
  
  console.log("\n" + "=".repeat(60))
  console.log("⚡ EXECUTING PLAN")
  console.log("=".repeat(60))
  
  const results = []
  const taskOutputs = {} // Store outputs by step number
  
  for (const task of plan.tasks) {
    console.log(`\n📌 Step ${task.step}: ${task.agent} — ${task.task}`)
    
    // Check dependencies
    if (task.depends_on && !taskOutputs[task.depends_on]) {
      console.log(`   ⏳ Waiting for step ${task.depends_on}...`)
      // In a real system, you'd handle this better
    }
    
    // Build context from previous steps
    let context = ""
    if (task.depends_on && taskOutputs[task.depends_on]) {
      context = `Previous step output:\n${taskOutputs[task.depends_on]}`
    }
    
    // Get agent's enhanced prompt with skills
    const agent = AGENTS[task.agent]
    if (!agent) {
      console.log(`   ❌ Unknown agent: ${task.agent}`)
      continue
    }
    
    const enhancedPrompt = buildAgentPrompt(task.agent, agent.systemPrompt)
    
    // Execute the task
    const result = await delegateTo(task.agent, task.task, context)
    
    if (result && result.result) {
      taskOutputs[task.step] = result.result
      results.push({
        step: task.step,
        agent: task.agent,
        agentName: result.agent,
        task: task.task,
        output: result.result,
        success: true
      })
      console.log(`   ✅ Completed`)
    } else {
      results.push({
        step: task.step,
        agent: task.agent,
        task: task.task,
        success: false
      })
      console.log(`   ❌ Failed`)
    }
  }
  
  return {
    plan,
    results,
    taskOutputs
  }
}

// ============================================
// JORDAN REVIEWS RESULTS
// CEO reviews what the team produced
// ============================================
async function reviewResults(execution) {
  if (!execution || !execution.results) {
    return null
  }
  
  console.log("\n" + "=".repeat(60))
  console.log("🔍 JORDAN REVIEWING RESULTS")
  console.log("=".repeat(60))
  
  const persona = loadPersona()
  
  const resultsText = execution.results
    .map(r => `Step ${r.step} (${r.agentName || r.agent}): ${r.success ? "✅" : "❌"}\nTask: ${r.task}\n${r.output ? `Output: ${r.output.substring(0, 500)}...` : "No output"}`)
    .join("\n\n---\n\n")
  
  const reviewPrompt = `You are Jordan AI, the CEO reviewing your team's work.

ORIGINAL GOAL: ${execution.plan.analysis}
SUCCESS CRITERIA: ${execution.plan.success_criteria}

TEAM OUTPUT:
${resultsText}

Review this work:
1. Did the team meet the success criteria?
2. What's good about the output?
3. What needs improvement?
4. What's the final verdict?

Be honest and direct. This is for quality control.`

  const review = await thinkDeep(reviewPrompt)
  
  console.log("\n📝 CEO Review:")
  console.log("-".repeat(40))
  console.log(review)
  
  return review
}

// ============================================
// FULL ORCHESTRATION CYCLE
// ============================================
async function orchestrate(goal, context = "") {
  console.log("\n" + "🎯".repeat(20))
  console.log("JORDAN AI - ORCHESTRATION MODE")
  console.log("🎯".repeat(20))
  
  const startTime = Date.now()
  
  // 1. Create plan
  const plan = await createExecutionPlan(goal, context)
  if (!plan) {
    return { success: false, error: "Failed to create plan" }
  }
  
  // 2. Execute plan
  const execution = await executePlan(plan)
  if (!execution) {
    return { success: false, error: "Failed to execute plan" }
  }
  
  // 3. Review results
  const review = await reviewResults(execution)
  
  const duration = Math.round((Date.now() - startTime) / 1000)
  
  console.log("\n" + "=".repeat(60))
  console.log(`✅ ORCHESTRATION COMPLETE (${duration}s)`)
  console.log("=".repeat(60))
  
  // Build Discord report
  const report = formatOrchestrationReport(plan, execution, review, duration)
  
  return {
    success: true,
    plan,
    execution,
    review,
    duration,
    report
  }
}

// ============================================
// FORMAT REPORT FOR DISCORD
// ============================================
function formatOrchestrationReport(plan, execution, review, duration) {
  let report = `**🎯 ORCHESTRATION REPORT**\n${"━".repeat(30)}\n\n`
  
  // CEO Analysis
  report += `**💭 Jordan's Analysis:**\n${plan.analysis}\n\n`
  
  // Execution Plan
  report += `**📋 Execution Plan** (${plan.tasks?.length || 0} tasks)\n`
  for (const task of plan.tasks || []) {
    report += `${task.step}. **${task.agent}** → ${task.task}\n`
  }
  report += `\n`
  
  // Results from each agent
  report += `**⚡ Team Results:**\n`
  for (const result of execution.results || []) {
    const status = result.success ? "✅" : "❌"
    const agentName = result.agentName || result.agent
    report += `\n${status} **${agentName}** — ${result.task}\n`
    if (result.output) {
      // Truncate long outputs
      const output = result.output.length > 500 
        ? result.output.substring(0, 500) + "..." 
        : result.output
      report += `\`\`\`${output}\`\`\`\n`
    }
  }
  
  // CEO Review
  if (review) {
    report += `\n**🔍 Jordan's Review:**\n${review}\n`
  }
  
  // Footer
  report += `\n${"━".repeat(30)}\n`
  report += `✅ Completed in ${duration}s`
  
  return report
}

// ============================================
// QUICK DELEGATE (for simple tasks)
// Jordan decides who should handle it
// ============================================
async function quickOrchestrate(task) {
  console.log(`\n🤔 Jordan deciding who handles: "${task.substring(0, 50)}..."`)
  
  const persona = loadPersona()
  
  const decisionPrompt = `You are Jordan AI. Quick decision needed.

Task: ${task}

Your team:
- researcher (Scout): Market research, validation, competitor analysis
- writer (Ink): Sales copy, blogs, tweets, emails
- support (Iris): Customer inquiries, refunds
- sales (Rex): Leads, outreach, partnerships
- builder (Ralph): Code, debugging, automation

Who should handle this? Return JSON:
{
  "agent": "researcher|writer|support|sales|builder",
  "task": "Reframe the task for this specific agent",
  "reason": "Why this agent (1 sentence)"
}`

  const decision = await thinkDeepJSON(decisionPrompt)
  
  if (!decision) {
    console.log("❌ Couldn't decide, escalating to Jordan")
    return await thinkDeep(task)
  }
  
  console.log(`   → Delegating to ${decision.agent}: ${decision.reason}`)
  
  const result = await delegateTo(decision.agent, decision.task)
  return result?.result || null
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  createExecutionPlan,
  executePlan,
  reviewResults,
  orchestrate,
  quickOrchestrate
}
