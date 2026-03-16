// ============================================
// JORDAN AI - SMART RESEARCH
// Focused on AI/Automation products people BUY
// Uses Opus for deep strategic thinking
// ============================================

require("dotenv").config()
const { thinkDeepJSON } = require("./aiBrain")
const { loadPersona } = require("./ceoBrain")

// ============================================
// THE REAL MARKET: AI/Automation Buyers
// These are people like YOU who want AI working for them
// ============================================
const AI_NICHES = [
  {
    category: "AI Bot Templates",
    buyers: "Entrepreneurs who want AI running their business",
    priceRange: "$97-497",
    painPoints: [
      "Want passive income but don't know how to build bots",
      "Tried ChatGPT but can't make it run autonomously",
      "See others making money with AI but don't know where to start",
      "Want to sell AI services but need templates",
      "Need bots that actually DO things, not just chat"
    ],
    productTypes: [
      "Discord bot that creates content 24/7",
      "Twitter/X bot that grows followers automatically",
      "Email outreach bot that books meetings",
      "Lead generation bot that finds prospects",
      "Content creation bot that writes and posts",
      "Customer support bot template",
      "Sales bot that qualifies and follows up"
    ]
  },
  {
    category: "AI Business Systems",
    buyers: "Solopreneurs wanting to automate everything",
    priceRange: "$197-997",
    painPoints: [
      "Doing everything manually, no time to scale",
      "Hiring is expensive and managing people is hard",
      "Want a business that runs without them",
      "Need systems that work while they sleep",
      "Tired of trading time for money"
    ],
    productTypes: [
      "Complete AI content agency system",
      "Automated client onboarding system",
      "AI-powered course delivery system",
      "Autonomous lead-to-sale pipeline",
      "AI customer success automation",
      "Hands-off newsletter system",
      "AI product launch automation"
    ]
  },
  {
    category: "AI Agent Frameworks",
    buyers: "Developers and tech-savvy entrepreneurs",
    priceRange: "$149-699",
    painPoints: [
      "Want to build AI agents but starting from scratch is hard",
      "Need proven architectures, not theoretical docs",
      "Want customizable frameworks, not locked-in SaaS",
      "Need agents that can use tools and APIs",
      "Looking for production-ready code, not tutorials"
    ],
    productTypes: [
      "Multi-agent orchestration framework",
      "AI agent with memory and learning",
      "Tool-using agent starter kit",
      "Autonomous research agent template",
      "AI coding assistant framework",
      "Voice AI agent builder",
      "Workflow automation agent"
    ]
  },
  {
    category: "Prompt Engineering Packs",
    buyers: "Anyone using AI who wants better results",
    priceRange: "$27-97",
    painPoints: [
      "AI gives generic, useless responses",
      "Don't know how to get AI to do what they want",
      "Wasting hours on trial and error prompts",
      "Need prompts that actually work for business",
      "Want copy-paste solutions, not courses"
    ],
    productTypes: [
      "CEO-level decision making prompts",
      "Sales and persuasion prompt pack",
      "Content creation mega prompt bundle",
      "Code generation prompt library",
      "Business strategy prompt system",
      "Marketing campaign prompt pack",
      "AI persona and voice prompts"
    ]
  },
  {
    category: "AI Automation Courses",
    buyers: "Beginners wanting to learn AI automation",
    priceRange: "$47-297",
    painPoints: [
      "Overwhelmed by all the AI tools and options",
      "Don't know which AI to use for what",
      "Want step-by-step, not just theory",
      "Need to see real results, not hype",
      "Looking for practical skills that make money"
    ],
    productTypes: [
      "Build Your First AI Bot (step-by-step)",
      "AI Automation Masterclass",
      "From Zero to AI Agency",
      "Passive Income with AI Bots",
      "AI Tools Bootcamp for Beginners",
      "Automate Your Business with AI",
      "Make Money While You Sleep with AI"
    ]
  },
  {
    category: "Done-For-You AI Services",
    buyers: "Busy professionals who want results, not DIY",
    priceRange: "$497-2997",
    painPoints: [
      "No time to learn, just want it done",
      "Tried to build themselves, got frustrated",
      "Need something working THIS WEEK",
      "Want expert setup, not trial and error",
      "Happy to pay for speed and certainty"
    ],
    productTypes: [
      "Custom AI bot built for your business",
      "AI content system setup",
      "Automation audit and implementation",
      "AI integration consulting",
      "White-label AI bot for agencies",
      "AI workflow design and build",
      "Personal AI assistant setup"
    ]
  }
]

// ============================================
// DEEP RESEARCH: Find Real Opportunity
// Uses Opus for strategic thinking
// ============================================
async function deepResearch() {
  // Pick a random niche
  const niche = AI_NICHES[Math.floor(Math.random() * AI_NICHES.length)]
  
  // Pick a random pain point and product type
  const painPoint = niche.painPoints[Math.floor(Math.random() * niche.painPoints.length)]
  const productType = niche.productTypes[Math.floor(Math.random() * niche.productTypes.length)]
  
  console.log(`🔬 Deep research: ${niche.category}`)
  console.log(`   Buyer: ${niche.buyers}`)
  console.log(`   Pain: ${painPoint}`)
  
  // Load memory for context (feedback, what works, what doesn't)
  let memoryContext = ""
  try {
    const persona = loadPersona()
    if (persona.memory) {
      memoryContext = `
IMPORTANT CONTEXT FROM PAST FEEDBACK:
${persona.memory}

Use this feedback to guide your product creation. Avoid things marked as not working.
Prioritize things marked as working well.
`
    }
  } catch (err) {
    // No memory available, continue without it
  }
  
  const prompt = `You are a product strategist creating digital products that people ACTUALLY BUY.
${memoryContext}
MARKET CONTEXT:
- Category: ${niche.category}
- Target Buyer: ${niche.buyers}
- Price Range: ${niche.priceRange}
- Pain Point: "${painPoint}"
- Similar Product Type: "${productType}"

YOUR TASK:
Create a SPECIFIC, IRRESISTIBLE product that solves this pain point.

The product must:
1. Have a name that immediately communicates value (not generic AI buzzwords)
2. Solve ONE specific problem extremely well
3. Feel like a no-brainer purchase at the price point
4. Be deliverable as a digital product (templates, code, guides, prompts)
5. Stand out from generic "AI tool" products

Think about what would make YOU pull out your credit card.

Return JSON:
{
  "name": "Specific, compelling product name",
  "tagline": "One sentence that makes them want it NOW",
  "problem": "The specific painful situation they're in",
  "solution": "What they get and how it fixes their problem",
  "deliverables": ["What's included item 1", "What's included item 2", "What's included item 3"],
  "uniqueAngle": "Why this is different from everything else",
  "price": 97,
  "guarantee": "What makes this risk-free",
  "urgency": "Why they should buy now, not later"
}`

  const product = await thinkDeepJSON(prompt)
  
  if (!product) {
    console.log("❌ Research failed")
    return null
  }
  
  product.category = niche.category
  product.buyer = niche.buyers
  product.priceRange = niche.priceRange
  
  console.log(`✅ Found: ${product.name}`)
  console.log(`   Angle: ${product.uniqueAngle}`)
  
  return {
    success: true,
    product,
    niche
  }
}

// ============================================
// VALIDATE: Is This Actually Good?
// ============================================
async function validateIdea(product) {
  console.log("🔍 Validating idea...")
  
  const prompt = `You evaluate product ideas. Be realistic but not overly harsh - most shipped products aren't perfect.

PRODUCT:
Name: ${product.name}
Tagline: ${product.tagline}
Problem: ${product.problem}
Solution: ${product.solution}
Price: $${product.price}
Unique Angle: ${product.uniqueAngle}

Score each 1-10 (5 = average, 7 = good, 9 = great):
1. DESIRE: Would someone want this?
2. CLARITY: Is it clear what they get?
3. DIFFERENTIATION: Is it different from free stuff?
4. PRICE FIT: Is the price reasonable?
5. BELIEVABILITY: Would they trust it works?

Return JSON:
{
  "desire": 7,
  "clarity": 7,
  "differentiation": 6,
  "priceFit": 7,
  "believability": 7,
  "overallScore": 7,
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1"],
  "verdict": "BUILD" or "SKIP" or "IMPROVE"
}`

  const validation = await thinkDeepJSON(prompt)
  
  if (!validation) {
    return { overallScore: 0, verdict: "SKIP" }
  }
  
  console.log(`   Score: ${validation.overallScore}/10 - ${validation.verdict}`)
  
  return validation
}

// ============================================
// RESEARCH + VALIDATE (Full Pipeline)
// ============================================
async function researchAndValidate() {
  // Try up to 3 times to find a winner
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`\n🎯 Research attempt ${attempt}/3`)
    
    const research = await deepResearch()
    if (!research || !research.success) continue
    
    const validation = await validateIdea(research.product)
    research.product.validation = validation
    
    // Accept if score is 6+ OR verdict is BUILD/IMPROVE
    // We learn from REAL SALES, not from AI saying "perfect"
    const validVerdict = validation.verdict === "BUILD" || validation.verdict === "IMPROVE"
    const validScore = validation.overallScore >= 6
    
    if (validVerdict || validScore) {
      console.log(`\n✅ GOOD ENOUGH - LET'S BUILD: ${research.product.name}`)
      console.log(`   (Score: ${validation.overallScore}/10, Verdict: ${validation.verdict})`)
      return research
    } else {
      console.log(`   Score ${validation.overallScore}/10, Verdict: ${validation.verdict} - trying again...`)
    }
  }
  
  // After 3 attempts, just use the last one anyway
  // Ship it and learn from real data
  console.log("⚠️ No perfect idea, but shipping anyway to learn from real sales")
  const research = await deepResearch()
  if (research && research.success) {
    research.product.validation = { overallScore: 5, verdict: "SHIPPED ANYWAY" }
    return research
  }
  
  return null
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  deepResearch,
  validateIdea,
  researchAndValidate,
  AI_NICHES
}
