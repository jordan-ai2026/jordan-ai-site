// ============================================
// JORDAN AI - PRODUCT FULFILLMENT
// Auto-delivers digital products after purchase
//
// HOW IT WORKS:
// 1. Customer clicks Buy Now → Stripe checkout
// 2. Customer pays → Stripe records the payment
// 3. Every 5 minutes, Jordan AI checks Stripe
//    for new completed payments
// 4. Finds a new sale → emails the PDF to customer
// 5. Logs the sale → notifies you in Discord
//
// SETUP:
// - STRIPE_KEY must be in .env (already have it)
// - MAILGUN must be configured (already have it)
// - Product PDFs must be in products-files/ folder
// - Product catalog defined below
// ============================================

require("dotenv").config()
const fs = require("fs")
const path = require("path")
const { sendEmail } = require("./emailManager")

// ============================================
// PRODUCT CATALOG
// Maps Stripe price IDs to product details
// After creating Stripe products, update these IDs
// ============================================
const PRODUCTS_DIR = path.join(__dirname, "products-files")
const FULFILLMENT_LOG = path.join(__dirname, "fulfillment-log.json")

// This gets populated when you run !fulfill setup
let CATALOG = {}
const CATALOG_FILE = path.join(__dirname, "product-catalog.json")

function loadCatalog() {
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      CATALOG = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"))
      return CATALOG
    }
  } catch (err) {}
  return {}
}

function saveCatalog(catalog) {
  CATALOG = catalog
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2))
}

function addProduct(slug, info) {
  loadCatalog()
  CATALOG[slug] = {
    name: info.name,
    price: info.price,
    stripePaymentLink: info.stripePaymentLink || null,
    stripePriceId: info.stripePriceId || null,
    stripeProductId: info.stripeProductId || null,
    fileName: info.fileName,
    description: info.description || "",
    createdAt: new Date().toISOString()
  }
  saveCatalog(CATALOG)
  return CATALOG[slug]
}

function getProduct(slug) {
  loadCatalog()
  return CATALOG[slug] || null
}

function listProducts() {
  loadCatalog()
  return CATALOG
}

// ============================================
// FULFILLMENT LOG
// Tracks delivered orders to avoid duplicates
// ============================================
function loadFulfillmentLog() {
  try {
    if (fs.existsSync(FULFILLMENT_LOG)) {
      return JSON.parse(fs.readFileSync(FULFILLMENT_LOG, "utf8"))
    }
  } catch (err) {}
  return { delivered: [], revenue: 0, totalSales: 0 }
}

function saveFulfillmentLog(log) {
  fs.writeFileSync(FULFILLMENT_LOG, JSON.stringify(log, null, 2))
}

function isAlreadyDelivered(sessionId) {
  const log = loadFulfillmentLog()
  return log.delivered.some(d => d.sessionId === sessionId)
}

function logDelivery(sessionId, customerEmail, productSlug, amount) {
  const log = loadFulfillmentLog()
  log.delivered.push({
    sessionId,
    customerEmail,
    productSlug,
    amount,
    deliveredAt: new Date().toISOString()
  })
  log.revenue += amount
  log.totalSales += 1
  
  // Keep last 1000 deliveries
  if (log.delivered.length > 1000) {
    log.delivered = log.delivered.slice(-1000)
  }
  
  saveFulfillmentLog(log)
}

// ============================================
// CREATE STRIPE PRODUCTS + PAYMENT LINKS
// ============================================
async function createStripeProduct(slug, name, price) {
  if (!process.env.STRIPE_KEY) {
    return { success: false, error: "Stripe not configured" }
  }
  
  const Stripe = require("stripe")
  const stripe = new Stripe(process.env.STRIPE_KEY)
  
  try {
    // Create product
    const product = await stripe.products.create({
      name,
      metadata: { slug, source: "jordan-ai-store" }
    })
    
    // Create price
    const priceObj = await stripe.prices.create({
      product: product.id,
      unit_amount: price * 100,
      currency: "usd"
    })
    
    // Create payment link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: priceObj.id, quantity: 1 }],
      after_completion: {
        type: "redirect",
        redirect: { url: "https://jordan-ai.co/thank-you.html" }
      },
      metadata: { slug, source: "jordan-ai-store" }
    })
    
    console.log(`✅ Stripe product created: ${name} ($${price}) → ${paymentLink.url}`)
    
    return {
      success: true,
      productId: product.id,
      priceId: priceObj.id,
      paymentLinkUrl: paymentLink.url,
      paymentLinkId: paymentLink.id
    }
    
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ============================================
// SETUP ALL PRODUCTS IN STRIPE
// Creates Stripe products and payment links for
// every product in the catalog
// ============================================
async function setupAllProducts() {
  loadCatalog()
  const results = []
  
  for (const [slug, product] of Object.entries(CATALOG)) {
    if (product.stripePaymentLink) {
      results.push({ slug, name: product.name, status: "already exists", url: product.stripePaymentLink })
      continue
    }
    
    console.log(`Creating Stripe product: ${product.name}...`)
    const result = await createStripeProduct(slug, product.name, product.price)
    
    if (result.success) {
      CATALOG[slug].stripePaymentLink = result.paymentLinkUrl
      CATALOG[slug].stripePriceId = result.priceId
      CATALOG[slug].stripeProductId = result.productId
      results.push({ slug, name: product.name, status: "created", url: result.paymentLinkUrl })
    } else {
      results.push({ slug, name: product.name, status: "failed", error: result.error })
    }
  }
  
  saveCatalog(CATALOG)
  return results
}

// ============================================
// DELIVERY EMAIL TEMPLATE
// ============================================
function deliveryEmailHtml(productName, downloadUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; color: #18181b; }
.wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
.card { background: #ffffff; border-radius: 12px; padding: 40px 32px; border: 1px solid #e4e4e7; }
.header { text-align: center; margin-bottom: 24px; }
.logo { font-size: 20px; font-weight: 700; color: #2A5CFF; }
h1 { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 8px; }
.subtitle { text-align: center; color: #6B7280; font-size: 15px; margin-bottom: 32px; }
.download-box { background: #F0F4FF; border: 2px solid #2A5CFF; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
.download-box p { font-size: 14px; color: #374151; margin: 0 0 16px; }
.btn { display: inline-block; padding: 14px 32px; background: #2A5CFF; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
.help { font-size: 13px; color: #6B7280; text-align: center; margin-top: 24px; line-height: 1.6; }
.footer { text-align: center; margin-top: 32px; font-size: 12px; color: #a1a1aa; }
</style></head>
<body>
<div class="wrapper">
  <div class="card">
    <div class="header"><span class="logo">Jordan AI</span></div>
    <h1>Your download is ready!</h1>
    <p class="subtitle">Thank you for purchasing <strong>${productName}</strong></p>
    <div class="download-box">
      <p>Click the button below to download your product:</p>
      <a href="${downloadUrl}" class="btn">Download Now</a>
    </div>
    <p class="help">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${downloadUrl}" style="color:#2A5CFF;word-break:break-all">${downloadUrl}</a>
    </p>
    <p class="help">
      Questions? Reply to this email and we'll help you out.
    </p>
  </div>
  <div class="footer">Jordan AI — jordan-ai.co</div>
</div>
</body></html>`
}

// ============================================
// DELIVER PRODUCT TO CUSTOMER
// ============================================
async function deliverProduct(customerEmail, productSlug, sessionId) {
  loadCatalog()
  const product = CATALOG[productSlug]
  
  if (!product) {
    console.log(`❌ Unknown product: ${productSlug}`)
    return { success: false, error: `Unknown product: ${productSlug}` }
  }
  
  // Check if PDF exists
  const filePath = path.join(PRODUCTS_DIR, product.fileName)
  if (!fs.existsSync(filePath)) {
    console.log(`❌ Product file missing: ${filePath}`)
    return { success: false, error: `Product file not found: ${product.fileName}` }
  }
  
  // For now, we use a hosted download link
  // The PDFs need to be accessible via URL
  // Option 1: Host on Vercel/your website
  // Option 2: Use a file hosting service
  // Option 3: Send as email attachment (Mailgun supports this)
  
  // We'll use the website path since it deploys to Vercel
  const downloadUrl = `https://jordan-ai.co/downloads/${product.fileName}`
  
  // Send delivery email
  const html = deliveryEmailHtml(product.name, downloadUrl)
  const subject = `Your download is ready: ${product.name}`
  
  const result = await sendEmail(customerEmail, subject, html, {
    tags: ["product-delivery", productSlug]
  })
  
  if (result.success) {
    logDelivery(sessionId, customerEmail, productSlug, product.price)
    console.log(`✅ Product delivered: ${product.name} → ${customerEmail}`)
  }
  
  return result
}

// ============================================
// CHECK STRIPE FOR NEW SALES
// Polls Stripe for completed checkout sessions
// that haven't been fulfilled yet
// ============================================
async function checkForNewSales() {
  if (!process.env.STRIPE_KEY) return { success: false, newSales: 0 }
  
  const Stripe = require("stripe")
  const stripe = new Stripe(process.env.STRIPE_KEY)
  
  try {
    // Get recent completed checkout sessions
    const sessions = await stripe.checkout.sessions.list({
      status: "complete",
      limit: 20,
      expand: ["data.line_items"]
    })
    
    const newSales = []
    
    for (const session of sessions.data) {
      // Skip if already delivered
      if (isAlreadyDelivered(session.id)) continue
      
      // Skip if no customer email
      if (!session.customer_details?.email) continue
      
      // Find which product was purchased
      const email = session.customer_details.email
      const metadata = session.metadata || {}
      let productSlug = metadata.slug || null
      
      // If no slug in metadata, try to match by price
      if (!productSlug && session.line_items?.data) {
        loadCatalog()
        for (const item of session.line_items.data) {
          const priceId = item.price?.id
          for (const [slug, product] of Object.entries(CATALOG)) {
            if (product.stripePriceId === priceId) {
              productSlug = slug
              break
            }
          }
          if (productSlug) break
        }
      }
      
      if (!productSlug) {
        console.log(`⚠️ Sale found but can't match to product: ${session.id}`)
        continue
      }
      
      // Deliver the product
      console.log(`🎉 New sale! ${productSlug} → ${email}`)
      const deliveryResult = await deliverProduct(email, productSlug, session.id)
      
      newSales.push({
        sessionId: session.id,
        email,
        productSlug,
        amount: (session.amount_total || 0) / 100,
        delivered: deliveryResult.success
      })
    }
    
    return {
      success: true,
      newSales: newSales.length,
      sales: newSales
    }
    
  } catch (err) {
    console.log("Stripe check error:", err.message)
    return { success: false, error: err.message, newSales: 0 }
  }
}

// ============================================
// START FULFILLMENT POLLING
// Checks every 5 minutes for new sales
// ============================================
let fulfillmentTimer = null

function startFulfillmentPolling(intervalMinutes = 5, discordNotify = null) {
  if (!process.env.STRIPE_KEY) {
    console.log("⚠️ Fulfillment polling disabled — no Stripe key")
    return
  }
  
  console.log(`📦 Fulfillment polling started (every ${intervalMinutes} min)`)
  
  fulfillmentTimer = setInterval(async () => {
    const result = await checkForNewSales()
    
    if (result.newSales > 0) {
      console.log(`🎉 ${result.newSales} new sale(s) fulfilled!`)
      
      // Notify in Discord if callback provided
      if (discordNotify) {
        for (const sale of result.sales) {
          const product = getProduct(sale.productSlug)
          discordNotify(
            `🎉 **NEW SALE!**\n` +
            `Product: **${product?.name || sale.productSlug}**\n` +
            `Customer: ${sale.email}\n` +
            `Amount: **$${sale.amount}**\n` +
            `Delivered: ${sale.delivered ? "✅ Yes" : "❌ Failed"}`
          )
        }
      }
    }
  }, intervalMinutes * 60 * 1000)
}

function stopFulfillmentPolling() {
  if (fulfillmentTimer) {
    clearInterval(fulfillmentTimer)
    fulfillmentTimer = null
    console.log("📦 Fulfillment polling stopped")
  }
}

// ============================================
// GET FULFILLMENT STATS
// ============================================
function getFulfillmentStats() {
  const log = loadFulfillmentLog()
  const catalog = loadCatalog()
  
  const today = log.delivered.filter(d => 
    new Date(d.deliveredAt).toDateString() === new Date().toDateString()
  )
  
  const thisMonth = log.delivered.filter(d => {
    const date = new Date(d.deliveredAt)
    const now = new Date()
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
  })
  
  return {
    totalProducts: Object.keys(catalog).length,
    totalSales: log.totalSales,
    totalRevenue: log.revenue,
    salesToday: today.length,
    revenueToday: today.reduce((sum, d) => sum + (d.amount || 0), 0),
    salesThisMonth: thisMonth.length,
    revenueThisMonth: thisMonth.reduce((sum, d) => sum + (d.amount || 0), 0),
    recentSales: log.delivered.slice(-5).reverse()
  }
}

// ============================================
// MANUAL DELIVERY (for testing or re-sends)
// ============================================
async function manualDeliver(email, productSlug) {
  const fakeSessionId = `manual_${Date.now()}`
  return await deliverProduct(email, productSlug, fakeSessionId)
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  // Catalog
  addProduct,
  getProduct,
  listProducts,
  loadCatalog,
  
  // Stripe setup
  createStripeProduct,
  setupAllProducts,
  
  // Fulfillment
  deliverProduct,
  manualDeliver,
  checkForNewSales,
  startFulfillmentPolling,
  stopFulfillmentPolling,
  
  // Stats
  getFulfillmentStats,
  
  // Constants
  PRODUCTS_DIR
}
