// ============================================
// JORDAN AI - STRIPE BILLING MANAGER
// Recurring subscriptions, invoices, revenue
//
// SETUP:
// Already have STRIPE_KEY in .env
// This upgrades from one-time payments to
// recurring monthly subscriptions
//
// How it works:
// 1. Create a customer in Stripe for each client
// 2. Create a subscription with monthly pricing
// 3. Stripe auto-charges every month
// 4. Jordan AI tracks revenue and alerts on issues
// ============================================

require("dotenv").config()
const fs = require("fs")
const path = require("path")

// ============================================
// STRIPE INIT
// ============================================
let stripe = null

function initStripe() {
  if (!process.env.STRIPE_KEY) return false
  try {
    const Stripe = require("stripe")
    stripe = new Stripe(process.env.STRIPE_KEY)
    return true
  } catch (err) {
    console.log("Stripe init error:", err.message)
    return false
  }
}

function isConfigured() {
  if (!stripe) initStripe()
  return !!stripe
}

// ============================================
// BILLING RECORDS (local tracking)
// ============================================
const BILLING_FILE = path.join(__dirname, "billing.json")

function loadBilling() {
  try {
    if (fs.existsSync(BILLING_FILE)) {
      return JSON.parse(fs.readFileSync(BILLING_FILE, "utf8"))
    }
  } catch (err) {}
  return { customers: {}, subscriptions: {}, invoices: [] }
}

function saveBilling(data) {
  fs.writeFileSync(BILLING_FILE, JSON.stringify(data, null, 2))
}

// ============================================
// CREATE CUSTOMER
// ============================================
async function createCustomer(slug, name, email, options = {}) {
  if (!isConfigured()) return { success: false, error: "Stripe not configured" }
  
  const billing = loadBilling()
  
  // Check if customer already exists
  if (billing.customers[slug]) {
    return { success: true, customerId: billing.customers[slug].customerId, existing: true }
  }
  
  try {
    const customer = await stripe.customers.create({
      name,
      email,
      metadata: {
        slug,
        source: "jordan-ai",
        ...options.metadata
      }
    })
    
    billing.customers[slug] = {
      customerId: customer.id,
      name,
      email,
      createdAt: new Date().toISOString()
    }
    saveBilling(billing)
    
    console.log(`✅ Stripe customer created: ${name} (${customer.id})`)
    return { success: true, customerId: customer.id, existing: false }
    
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ============================================
// CREATE SUBSCRIPTION
// ============================================
async function createSubscription(slug, items, options = {}) {
  if (!isConfigured()) return { success: false, error: "Stripe not configured" }
  
  const billing = loadBilling()
  const customer = billing.customers[slug]
  
  if (!customer) {
    return { success: false, error: `No Stripe customer for "${slug}". Run !billing customer first.` }
  }
  
  try {
    // Create prices for each line item
    const lineItems = []
    
    for (const item of items) {
      // Create a product
      const product = await stripe.products.create({
        name: item.name,
        metadata: { slug, source: "jordan-ai" }
      })
      
      // Create a recurring price
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: item.amount * 100, // cents
        currency: "usd",
        recurring: { interval: "month" }
      })
      
      lineItems.push({ price: price.id })
    }
    
    // Create the subscription
    const subscriptionData = {
      customer: customer.customerId,
      items: lineItems,
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription"
      },
      metadata: { slug, source: "jordan-ai" }
    }
    
    // If we want to send an invoice link instead of charging immediately
    if (options.sendInvoice !== false) {
      subscriptionData.collection_method = "send_invoice"
      subscriptionData.days_until_due = options.daysUntilDue || 30
    }
    
    const subscription = await stripe.subscriptions.create(subscriptionData)
    
    // Save locally
    billing.subscriptions[slug] = {
      subscriptionId: subscription.id,
      customerId: customer.customerId,
      status: subscription.status,
      items: items.map(i => ({ name: i.name, amount: i.amount })),
      monthlyTotal: items.reduce((sum, i) => sum + i.amount, 0),
      createdAt: new Date().toISOString()
    }
    saveBilling(billing)
    
    const total = items.reduce((sum, i) => sum + i.amount, 0)
    console.log(`✅ Subscription created for ${slug}: $${total}/mo`)
    
    return {
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      monthlyTotal: total,
      items: items
    }
    
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ============================================
// CREATE PAYMENT LINK (one-time or recurring)
// ============================================
async function createPaymentLink(name, amount, options = {}) {
  if (!isConfigured()) return { success: false, error: "Stripe not configured" }
  
  const { recurring = true, slug = null } = options
  
  try {
    const product = await stripe.products.create({
      name,
      metadata: { slug: slug || "general", source: "jordan-ai" }
    })
    
    const priceData = {
      product: product.id,
      unit_amount: amount * 100,
      currency: "usd"
    }
    
    if (recurring) {
      priceData.recurring = { interval: "month" }
    }
    
    const price = await stripe.prices.create(priceData)
    
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      after_completion: {
        type: "redirect",
        redirect: { url: `https://jordan-ai.co/thank-you.html` }
      },
      metadata: { slug: slug || "general", source: "jordan-ai" }
    })
    
    console.log(`✅ Payment link created: ${paymentLink.url}`)
    
    return {
      success: true,
      url: paymentLink.url,
      amount,
      recurring,
      name
    }
    
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ============================================
// CREATE INVOICE
// ============================================
async function createInvoice(slug, items, options = {}) {
  if (!isConfigured()) return { success: false, error: "Stripe not configured" }
  
  const billing = loadBilling()
  const customer = billing.customers[slug]
  
  if (!customer) {
    return { success: false, error: `No Stripe customer for "${slug}". Run !billing customer first.` }
  }
  
  try {
    // Create invoice
    const invoice = await stripe.invoices.create({
      customer: customer.customerId,
      collection_method: "send_invoice",
      days_until_due: options.daysUntilDue || 30,
      metadata: { slug, source: "jordan-ai" }
    })
    
    // Add line items
    for (const item of items) {
      await stripe.invoiceItems.create({
        customer: customer.customerId,
        invoice: invoice.id,
        amount: item.amount * 100,
        currency: "usd",
        description: item.name || item.description
      })
    }
    
    // Finalize and send
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id)
    
    if (options.send !== false) {
      await stripe.invoices.sendInvoice(invoice.id)
    }
    
    const total = items.reduce((sum, i) => sum + i.amount, 0)
    
    // Log locally
    billing.invoices.push({
      invoiceId: invoice.id,
      slug,
      total,
      items,
      status: "sent",
      createdAt: new Date().toISOString(),
      hostedUrl: finalizedInvoice.hosted_invoice_url
    })
    saveBilling(billing)
    
    console.log(`✅ Invoice sent to ${slug}: $${total}`)
    
    return {
      success: true,
      invoiceId: invoice.id,
      total,
      hostedUrl: finalizedInvoice.hosted_invoice_url,
      status: "sent"
    }
    
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ============================================
// CANCEL SUBSCRIPTION
// ============================================
async function cancelSubscription(slug, options = {}) {
  if (!isConfigured()) return { success: false, error: "Stripe not configured" }
  
  const billing = loadBilling()
  const sub = billing.subscriptions[slug]
  
  if (!sub) {
    return { success: false, error: `No subscription for "${slug}"` }
  }
  
  try {
    const { atPeriodEnd = true } = options
    
    let result
    if (atPeriodEnd) {
      result = await stripe.subscriptions.update(sub.subscriptionId, {
        cancel_at_period_end: true
      })
    } else {
      result = await stripe.subscriptions.cancel(sub.subscriptionId)
    }
    
    billing.subscriptions[slug].status = atPeriodEnd ? "canceling" : "canceled"
    saveBilling(billing)
    
    return {
      success: true,
      status: atPeriodEnd ? "Will cancel at period end" : "Canceled immediately"
    }
    
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ============================================
// GET REVENUE STATS
// ============================================
async function getRevenueStats() {
  const billing = loadBilling()
  
  // Calculate MRR from active subscriptions
  const activeSubs = Object.values(billing.subscriptions).filter(s => 
    s.status === "active" || s.status === "trialing"
  )
  const mrr = activeSubs.reduce((sum, s) => sum + (s.monthlyTotal || 0), 0)
  
  // Get real Stripe balance if possible
  let stripeBalance = null
  if (isConfigured()) {
    try {
      const balance = await stripe.balance.retrieve()
      stripeBalance = balance.available.reduce((sum, b) => sum + b.amount, 0) / 100
    } catch (err) {}
  }
  
  // Recent invoices
  const recentInvoices = billing.invoices.slice(-5).reverse()
  
  return {
    mrr,
    arr: mrr * 12,
    activeSubscriptions: activeSubs.length,
    totalCustomers: Object.keys(billing.customers).length,
    stripeBalance,
    recentInvoices,
    subscriptions: Object.entries(billing.subscriptions).map(([slug, sub]) => ({
      slug,
      ...sub
    }))
  }
}

// ============================================
// LIST CUSTOMER INFO
// ============================================
function getCustomerInfo(slug) {
  const billing = loadBilling()
  return {
    customer: billing.customers[slug] || null,
    subscription: billing.subscriptions[slug] || null,
    invoices: billing.invoices.filter(i => i.slug === slug)
  }
}

// ============================================
// FORMAT REVENUE DASHBOARD
// ============================================
async function formatRevenueDashboard() {
  const stats = await getRevenueStats()
  
  let msg = `**💰 Revenue Dashboard**\n\n`
  msg += `**MRR:** $${stats.mrr}\n`
  msg += `**ARR:** $${stats.arr}\n`
  msg += `**Active Subscriptions:** ${stats.activeSubscriptions}\n`
  msg += `**Total Customers:** ${stats.totalCustomers}\n`
  
  if (stats.stripeBalance !== null) {
    msg += `**Stripe Balance:** $${stats.stripeBalance}\n`
  }
  
  if (stats.subscriptions.length > 0) {
    msg += `\n**Subscriptions:**\n`
    stats.subscriptions.forEach(s => {
      const statusEmoji = s.status === "active" ? "🟢" : s.status === "canceling" ? "⚠️" : "🔴"
      msg += `${statusEmoji} **${s.slug}** — $${s.monthlyTotal}/mo (${s.status})\n`
      s.items.forEach(i => {
        msg += `   • ${i.name}: $${i.amount}\n`
      })
    })
  }
  
  if (stats.recentInvoices.length > 0) {
    msg += `\n**Recent Invoices:**\n`
    stats.recentInvoices.forEach(inv => {
      msg += `• ${inv.slug} — $${inv.total} (${inv.status}) — ${new Date(inv.createdAt).toLocaleDateString()}\n`
    })
  }
  
  return msg
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  isConfigured,
  
  // Customers
  createCustomer,
  getCustomerInfo,
  
  // Subscriptions
  createSubscription,
  cancelSubscription,
  
  // Payments
  createPaymentLink,
  createInvoice,
  
  // Revenue
  getRevenueStats,
  formatRevenueDashboard
}
