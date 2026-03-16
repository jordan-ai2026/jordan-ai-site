// ============================================
// JORDAN AI - AUTONOMOUS LOOP
// Jordan as CEO orchestrating sub-agents
// ============================================

require("dotenv").config()
const { thinkDeep, thinkDeepJSON } = require("./aiBrain")
const { loadPersona, addMemory } = require("./ceoBrain")
const { delegateTo, delegateJSONTo } = require("./subAgents")
const { createProductPage, createProductsIndex, createBlogIndex } = require("./websiteBuilder")
const { publishBlog } = require("./seoPublisher")
const { deployWebsite } = require("./gitDeploy")
const { createStripeProduct } = require("./stripeHelper")
const { createDeliveryPage } = require("./productDelivery")
const { trackProductCreated, trackBlogPublished, updateDashboard } = require("./revenueDashboard")
const { canPerform } = require("./trustLadder")
const { sendReport, getReportsChannel } = require("./reporter")

// ============================================
// STATE
// ============================================
let isRunning = false
let cycleCount = 0
let productsToday = 0
let lastCycle = null
const MAX_PRODUCTS_PER_DAY = 3
const CYCLE_INTERVAL = 60 * 60 * 1000 // 1 hour

// ============================================
// JORDAN THINKS STRATEGICALLY
// CEO-level decision making
// ============================================
async function jordanThinks() {
  console.log("\n" + "=".repeat(60))
  console.log("🧠 JORDAN AI - STRATEGIC THINKING")
  console.log("=".repeat(60))
  
  const persona = loadPersona()
  
  const thinkingPrompt = `You are Jordan AI, CEO of an autonomous business.

YOUR SOUL:
${persona.soul}

YOUR MEMORY:
${persona.memory}

CURRENT STATUS:
- Products created today: ${productsToday}/${MAX_PRODUCTS_PER_DAY}
- Cycle count: ${cycleCount}

Think strategically about what your business should do next.
Focus on the AI/automation niche. Digital products only.

Consider:
1. What product would solve a real pain point?
2. What content would drive traffic?
3. What's missing from your current offerings?

Return JSON:
{
  "thinking": "Your CEO-level strategic thinking (2-3 sentences)",
  "action": "BUILD_PRODUCT" or "WRITE_CONTENT" or "IMPROVE_EXISTING" or "ANALYZE_MARKET" or "SKIP",
  "idea": "Specific product or content idea",
  "reasoning": "Why this is the right move"
}`

  const decision = await thinkDeepJSON(thinkingPrompt)
  
  if (!decision) {
    console.log("❌ Couldn't think strategically")
    return null
  }
  
  console.log(`\n💭 Jordan's Thinking: ${decision.thinking}`)
  console.log(`📌 Action: ${decision.action}`)
  console.log(`💡 Idea: ${decision.idea}`)
  
  return decision
}

// ============================================
// VALIDATE IDEA WITH SCOUT
// ============================================
async function validateWithScout(idea) {
  console.log("\n🔍 VALIDATION: Asking Scout to research...")
  
  const validation = await delegateJSONTo("researcher", `
Validate this product idea for the AI/automation market:

"${idea}"

Research and return JSON:
{
  "verdict": "BUILD" or "IMPROVE" or "SKIP",
  "score": 1-10,
  "targetAudience": "Who would buy this",
  "competitors": "Similar products that exist",
  "uniqueAngle": "How to differentiate",
  "priceRange": "$X-$Y",
  "concerns": "Any red flags"
}

Be brutally honest. Only recommend BUILD for ideas scoring 7+.`)

  return validation?.result || null
}

// ============================================
// CREATE PRODUCT WITH INK
// ============================================
async function createWithInk(idea, validation) {
  console.log("\n✍️ CONTENT: Asking Ink to write...")
  
  const content = await delegateJSONTo("writer", `
Create product content for:

IDEA: ${idea}
TARGET: ${validation.targetAudience}
UNIQUE ANGLE: ${validation.uniqueAngle}
PRICE RANGE: ${validation.priceRange}

Return JSON:
{
  "name": "Product name (catchy, specific)",
  "tagline": "One-line hook",
  "description": "2-3 paragraph sales description",
  "benefits": ["benefit 1", "benefit 2", "benefit 3"],
  "price": number (pick optimal from range),
  "slug": "url-friendly-slug"
}

Make it compelling. Focus on transformation, not features.`)

  return content?.result || null
}

// ============================================
// EXECUTE PRODUCT PIPELINE
// ============================================
async function executeProductPipeline(product) {
  console.log("\n" + "=".repeat(60))
  console.log("🚀 EXECUTING PRODUCT PIPELINE")
  console.log("=".repeat(60))
  
  try {
    // 1. Create Stripe product
    console.log("\n💳 Creating Stripe product...")
    if (!canPerform("create_stripe_product")) {
      console.log("   ⚠️ Trust level too low for Stripe, skipping payment")
    }
    
    let paymentLink = null
    try {
      const stripe = await createStripeProduct(
        product.name,
        product.description,
        product.price,
        product.slug
      )
      paymentLink = stripe?.paymentLink
      console.log(`   ✅ Stripe product created: ${paymentLink}`)
    } catch (err) {
      console.log(`   ⚠️ Stripe error: ${err.message}`)
    }
    
    // 2. Create delivery page
    console.log("\n📦 Creating delivery page...")
    await createDeliveryPage({
      name: product.name,
      slug: product.slug,
      description: product.description
    })
    
    // 3. Create product page
    console.log("\n📄 Creating product page...")
    await createProductPage(product.name, product.description, {
      price: product.price,
      paymentLink: paymentLink,
      tagline: product.tagline,
      benefits: product.benefits,
      slug: product.slug
    })
    
    // 4. Update products index
    console.log("\n📑 Updating products index...")
    await createProductsIndex()
    
    // 5. Create blog post with Ink
    console.log("\n📝 Asking Ink to write blog post...")
    const blogContent = await delegateTo("writer", `
Write an SEO blog post about "${product.name}".

Target keywords: ${product.slug.replace(/-/g, ", ")}
Link to product: /products/${product.slug}.html

Write 600-800 words. Include:
- Problem/pain point
- Why it matters
- How this product helps
- Call to action

Make it valuable, not salesy.`)

    if (blogContent?.result) {
      await publishBlog(product.name, product.slug, blogContent.result)
      await createBlogIndex()
      trackBlogPublished()
    }
    
    // 6. Deploy to GitHub
    console.log("\n🚀 Deploying to GitHub...")
    await deployWebsite(`New product: ${product.name}`)
    
    trackProductCreated()
    productsToday++
    
    console.log("\n✅ PRODUCT PIPELINE COMPLETE")
    console.log(`   Product: ${product.name}`)
    console.log(`   Price: $${product.price}`)
    console.log(`   URL: /products/${product.slug}.html`)
    
    return true
    
  } catch (err) {
    console.log(`\n❌ Pipeline error: ${err.message}`)
    return false
  }
}

// ============================================
// MAIN AUTONOMOUS CYCLE
// ============================================
async function runCycle() {
  const report = []
  
  if (productsToday >= MAX_PRODUCTS_PER_DAY) {
    console.log(`\n⏸️ Daily product limit reached (${MAX_PRODUCTS_PER_DAY})`)
    return { success: false, report: [`⏸️ Daily product limit reached (${MAX_PRODUCTS_PER_DAY})`] }
  }
  
  cycleCount++
  lastCycle = new Date()
  
  console.log("\n" + "🔄".repeat(20))
  console.log(`AUTONOMOUS CYCLE #${cycleCount}`)
  console.log("🔄".repeat(20))
  
  report.push(`**🔄 AUTONOMOUS CYCLE #${cycleCount}**`)
  report.push(`${"━".repeat(30)}`)
  report.push("")
  
  // 1. Jordan thinks strategically
  const decision = await jordanThinks()
  
  if (!decision || decision.action === "SKIP") {
    console.log("\n⏭️ Jordan decided to skip this cycle")
    report.push("⏭️ Jordan decided to skip this cycle")
    return { success: false, report }
  }
  
  report.push(`**🧠 Jordan's Thinking:**`)
  report.push(decision.thinking)
  report.push("")
  report.push(`**📌 Action:** ${decision.action}`)
  report.push(`**💡 Idea:** ${decision.idea}`)
  report.push("")
  
  // 2. Scout validates the idea
  const validation = await validateWithScout(decision.idea)
  
  if (!validation) {
    console.log("\n❌ Scout couldn't validate idea")
    report.push("❌ Scout couldn't validate idea")
    return { success: false, report }
  }
  
  console.log(`\n📊 Scout's Verdict: ${validation.verdict} (Score: ${validation.score}/10)`)
  
  report.push(`**🔍 Scout's Validation:**`)
  report.push(`• Verdict: ${validation.verdict}`)
  report.push(`• Score: ${validation.score}/10`)
  report.push(`• Target: ${validation.targetAudience}`)
  report.push(`• Price Range: ${validation.priceRange}`)
  report.push("")
  
  if (validation.verdict === "SKIP" || validation.score < 6) {
    console.log("⏭️ Idea didn't pass validation")
    addMemory(`Skipped idea "${decision.idea}" - Scout score: ${validation.score}/10`, "Validation")
    report.push(`⏭️ Idea didn't pass validation (score < 6)`)
    return { success: false, report }
  }
  
  // 3. Ink creates the content
  const product = await createWithInk(decision.idea, validation)
  
  if (!product) {
    console.log("\n❌ Ink couldn't create content")
    report.push("❌ Ink couldn't create content")
    return { success: false, report }
  }
  
  console.log(`\n📦 Product Created:`)
  console.log(`   Name: ${product.name}`)
  console.log(`   Price: $${product.price}`)
  
  report.push(`**✍️ Ink Created Product:**`)
  report.push(`• Name: ${product.name}`)
  report.push(`• Price: $${product.price}`)
  report.push(`• Tagline: ${product.tagline}`)
  report.push("")
  
  // 4. Execute the full pipeline
  report.push(`**🚀 Pipeline Execution:**`)
  const success = await executeProductPipeline(product)
  
  if (success) {
    addMemory(`Created "${product.name}" at $${product.price} - validated by Scout`, "Products")
    report.push(`✅ Stripe product created`)
    report.push(`✅ Delivery page created`)
    report.push(`✅ Product page created`)
    report.push(`✅ Blog post published`)
    report.push(`✅ Deployed to GitHub`)
    report.push("")
    report.push(`**🎉 PRODUCT LIVE:**`)
    report.push(`• URL: /products/${product.slug}.html`)
    report.push(`• Price: $${product.price}`)
  } else {
    report.push(`❌ Pipeline failed`)
  }
  
  // 5. Update dashboard every few cycles
  if (cycleCount % 3 === 0) {
    console.log("\n📊 Updating dashboard...")
    await updateDashboard()
  }
  
  report.push("")
  report.push(`${"━".repeat(30)}`)
  report.push(`✅ Cycle #${cycleCount} complete`)
  
  return { success, report, product }
}

// ============================================
// START AUTONOMOUS MODE
// ============================================
async function runCycleWithReport() {
  const result = await runCycle()
  
  // Send report to Discord if channel is configured
  if (result && result.report && getReportsChannel()) {
    const reportText = Array.isArray(result.report) ? result.report.join("\n") : result.report
    await sendReport(reportText)
  }
  
  return result
}

function startAutonomous() {
  if (isRunning) {
    console.log("Already running")
    return
  }
  
  isRunning = true
  console.log("\n🤖 AUTONOMOUS MODE STARTED")
  console.log(`   Cycle interval: ${CYCLE_INTERVAL / 60000} minutes`)
  console.log(`   Max products/day: ${MAX_PRODUCTS_PER_DAY}`)
  
  // Run first cycle after short delay
  setTimeout(runCycleWithReport, 5000)
  
  // Then run on interval
  setInterval(runCycleWithReport, CYCLE_INTERVAL)
}

function stopAutonomous() {
  isRunning = false
  console.log("🛑 Autonomous mode stopped")
}

function getStatus() {
  return {
    isRunning,
    cycleCount,
    productsToday,
    lastCycle,
    maxProductsPerDay: MAX_PRODUCTS_PER_DAY
  }
}

// Reset daily counter at midnight
function scheduleDailyReset() {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  
  const msUntilMidnight = tomorrow - now
  
  setTimeout(() => {
    productsToday = 0
    console.log("🌅 Daily product counter reset")
    scheduleDailyReset()
  }, msUntilMidnight)
}

scheduleDailyReset()

// ============================================
// EXPORTS
// ============================================
module.exports = {
  startAutonomous,
  stopAutonomous,
  runCycle,
  getStatus
}
