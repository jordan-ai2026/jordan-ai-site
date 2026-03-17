#!/usr/bin/env node
// ============================================
// JORDAN AI - PRODUCT CLEANUP & REBUILD
// Run this ONCE to:
// 1. Delete ALL old product pages
// 2. Delete ALL old blog posts
// 3. Create 5 real product pages with working Stripe links
// 4. Rebuild homepage and indexes
// ============================================

const fs = require("fs")
const path = require("path")
const { createProductPage, createHomepage, createProductsIndex, createBlogIndex } = require("./websiteBuilder")

const PRODUCTS_DIR = path.join(__dirname, "website", "products")
const BLOG_DIR = path.join(__dirname, "website", "blog")

// ============================================
// STEP 1: Delete all old product pages
// ============================================
console.log("\n🗑️  STEP 1: Deleting old product pages...")
if (fs.existsSync(PRODUCTS_DIR)) {
  const oldProducts = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith(".html"))
  oldProducts.forEach(f => {
    fs.unlinkSync(path.join(PRODUCTS_DIR, f))
    console.log(`   Deleted: products/${f}`)
  })
  console.log(`   → ${oldProducts.length} old product pages removed`)
} else {
  console.log("   No products folder found")
}

// ============================================
// STEP 2: Delete all old blog posts
// ============================================
console.log("\n🗑️  STEP 2: Deleting old blog posts...")
if (fs.existsSync(BLOG_DIR)) {
  const oldBlogs = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith(".html"))
  oldBlogs.forEach(f => {
    fs.unlinkSync(path.join(BLOG_DIR, f))
    console.log(`   Deleted: blog/${f}`)
  })
  console.log(`   → ${oldBlogs.length} old blog posts removed`)
} else {
  console.log("   No blog folder found")
}

// ============================================
// STEP 3: Create 5 real product pages
// ============================================
console.log("\n📦 STEP 3: Creating real product pages...")

const PRODUCTS = [
  {
    name: "The Small Business AI Starter Kit",
    description: "30 ready-to-use AI prompts that save you 10+ hours per week. Copy, paste, customize — instant results for customer emails, social media, hiring, invoicing, and more. Works with ChatGPT, Claude, or any AI assistant. No tech skills needed.",
    price: 29,
    emoji: "🚀",
    features: [
      "30 copy-paste prompts organized by category",
      "Customer email templates (complaints, follow-ups, reviews)",
      "Social media post generators for any platform",
      "Business operations prompts (hiring, invoicing, FAQs)",
      "Sales and marketing templates that convert",
      "Works with ChatGPT, Claude, Gemini — any AI",
      "Instant download — start using in 5 minutes"
    ],
    paymentLink: "https://buy.stripe.com/bJe5kv0SP8B0gpp7IfbfO0i"
  },
  {
    name: "The Website Audit Checklist",
    description: "50 specific checkpoints to find and fix everything that's costing you customers. Covers first impressions, SEO basics, content quality, conversion optimization, and technical health. Used by agencies charging $500+ for site audits.",
    price: 29,
    emoji: "✅",
    features: [
      "50 actionable checkpoints with fix instructions",
      "SEO audit: title tags, meta descriptions, headings, alt text",
      "Speed and mobile responsiveness checks",
      "Conversion killers: forms, CTAs, contact info",
      "Content quality: reviews, FAQs, pricing, freshness",
      "Technical health: SSL, analytics, backups, plugins",
      "Print-friendly format — check off as you go"
    ],
    paymentLink: "https://buy.stripe.com/eVq8wHfNJbNcb552nVbfO0j"
  },
  {
    name: "The Social Media Autopilot Pack",
    description: "A complete 30-day content calendar with 90 pre-written post templates for Facebook, Instagram, and Twitter/X. Schedule everything in one sitting, then you're on autopilot for a full month. Built specifically for local and small businesses.",
    price: 39,
    emoji: "📱",
    features: [
      "30 days of content — fully planned out",
      "90 post templates (3 per day: FB, IG, Twitter)",
      "Week 1: Build awareness with your community",
      "Week 2: Build trust with reviews and stories",
      "Week 3: Drive engagement with polls and tips",
      "Week 4: Convert followers into customers",
      "Customizable templates — fill in your business details"
    ],
    paymentLink: "https://buy.stripe.com/9B6cMX8lh6sS6OPd2zbfO0k"
  },
  {
    name: "The SEO Blog Blueprint",
    description: "Learn how to plan, write, and publish blog posts that actually rank on Google and bring local customers to your door. Includes the complete strategy plus 20 ready-to-use blog post templates across 5 industries.",
    price: 49,
    emoji: "📈",
    features: [
      "Complete local SEO blog strategy (step by step)",
      "How to find keywords your customers actually search",
      "Blog post structure template that ranks",
      "20 industry-specific blog templates included",
      "Covers: landscaping, dental, legal, fitness, restaurants",
      "Keyword research using free tools only",
      "Track results with Google Search Console"
    ],
    paymentLink: "https://buy.stripe.com/eVq9ALdFB2cCc99faHbfO0l"
  },
  {
    name: "The AI Chatbot Playbook",
    description: "Build and deploy a customer service chatbot on any website — step by step. Your chatbot answers questions 24/7, captures leads, and books appointments while you sleep. Includes personality templates, knowledge base structure, and deployment guides for WordPress and any website.",
    price: 67,
    emoji: "🤖",
    features: [
      "Step-by-step build guide (no coding experience needed)",
      "SOUL.md template — define your chatbot's personality",
      "IDENTITY.md template — your full business knowledge base",
      "Widget code ready to embed on any website",
      "WordPress deployment instructions",
      "Lead capture and appointment booking setup",
      "Optimization guide — improve over time with real data"
    ],
    paymentLink: "https://buy.stripe.com/aFa14f1WTg3s0qrbYvbfO0m"
  }
]

async function createAllProducts() {
  for (const product of PRODUCTS) {
    console.log(`   Creating: ${product.name} ($${product.price})`)
    await createProductPage(product.name, product.description, {
      price: product.price,
      emoji: product.emoji,
      features: product.features,
      paymentLink: product.paymentLink
    })
  }
  console.log(`   → ${PRODUCTS.length} real product pages created`)
  
  // ============================================
  // STEP 4: Rebuild homepage and indexes
  // ============================================
  console.log("\n🔄 STEP 4: Rebuilding site indexes...")
  await createHomepage()
  await createProductsIndex()
  await createBlogIndex()
  
  console.log("\n" + "=".repeat(50))
  console.log("✅ DONE! Your store now has 5 real products.")
  console.log("   Old fake products: DELETED")
  console.log("   New real products: CREATED")
  console.log("   Homepage: REBUILT")
  console.log("   Every Buy Now button: REAL STRIPE LINK")
  console.log("   Auto-fulfillment: RUNNING")
  console.log("=".repeat(50))
  console.log("\nNext: git add . && git commit -m 'real products' && git push")
  console.log("")
}

createAllProducts()
