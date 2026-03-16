// ============================================
// JORDAN AI - SALES TRACKER
// Tracks Stripe sales and learns from results
// ============================================

require("dotenv").config()
const Stripe = require("stripe")
const fs = require("fs")
const path = require("path")
const { addMemory } = require("./ceoBrain")

const stripe = new Stripe(process.env.STRIPE_KEY)

const SALES_LOG_PATH = path.join(__dirname, "persona", "sales-log.json")

// ============================================
// INITIALIZE SALES LOG
// ============================================
function initSalesLog() {
  if (!fs.existsSync(SALES_LOG_PATH)) {
    const initialLog = {
      products: {},
      totalRevenue: 0,
      totalSales: 0,
      lastChecked: null,
      insights: []
    }
    fs.writeFileSync(SALES_LOG_PATH, JSON.stringify(initialLog, null, 2))
  }
  return JSON.parse(fs.readFileSync(SALES_LOG_PATH, "utf8"))
}

// ============================================
// SAVE SALES LOG
// ============================================
function saveSalesLog(log) {
  fs.writeFileSync(SALES_LOG_PATH, JSON.stringify(log, null, 2))
}

// ============================================
// CHECK RECENT SALES
// ============================================
async function checkRecentSales() {
  try {
    console.log("💰 Checking Stripe for recent sales...")
    
    const log = initSalesLog()
    
    // Get payments from last 24 hours
    const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60)
    
    const payments = await stripe.paymentIntents.list({
      created: { gte: oneDayAgo },
      limit: 100
    })
    
    const successfulPayments = payments.data.filter(p => p.status === "succeeded")
    
    console.log(`   Found ${successfulPayments.length} successful payments in last 24h`)
    
    let newRevenue = 0
    let newSales = 0
    
    for (const payment of successfulPayments) {
      const amount = payment.amount / 100 // Convert cents to dollars
      
      // Try to get product info
      if (payment.metadata && payment.metadata.product_name) {
        const productName = payment.metadata.product_name
        
        if (!log.products[productName]) {
          log.products[productName] = { sales: 0, revenue: 0, firstSale: null }
        }
        
        log.products[productName].sales++
        log.products[productName].revenue += amount
        log.products[productName].lastSale = new Date().toISOString()
        
        if (!log.products[productName].firstSale) {
          log.products[productName].firstSale = new Date().toISOString()
          
          // First sale! This is valuable info
          console.log(`🎉 First sale for: ${productName}`)
          addMemory(`SOLD: ${productName} - This product type works!`, "What Works")
        }
      }
      
      newRevenue += amount
      newSales++
    }
    
    log.totalRevenue += newRevenue
    log.totalSales += newSales
    log.lastChecked = new Date().toISOString()
    
    saveSalesLog(log)
    
    return {
      success: true,
      newSales,
      newRevenue,
      totalSales: log.totalSales,
      totalRevenue: log.totalRevenue
    }
    
  } catch (err) {
    console.log("❌ Sales check error:", err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// GET SALES INSIGHTS
// ============================================
function getSalesInsights() {
  const log = initSalesLog()
  
  // Find best selling products
  const products = Object.entries(log.products)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
  
  const bestSellers = products.slice(0, 3)
  const worstSellers = products.filter(p => p.sales === 0)
  
  return {
    totalRevenue: log.totalRevenue,
    totalSales: log.totalSales,
    bestSellers,
    worstSellers,
    productCount: products.length
  }
}

// ============================================
// LEARN FROM SALES DATA
// ============================================
async function learnFromSales() {
  const insights = getSalesInsights()
  
  console.log("📊 Learning from sales data...")
  console.log(`   Total revenue: $${insights.totalRevenue}`)
  console.log(`   Total sales: ${insights.totalSales}`)
  
  if (insights.bestSellers.length > 0) {
    console.log(`   Best sellers:`)
    for (const product of insights.bestSellers) {
      console.log(`     - ${product.name}: ${product.sales} sales, $${product.revenue}`)
    }
    
    // Extract patterns from best sellers
    const bestSellerNames = insights.bestSellers.map(p => p.name).join(", ")
    addMemory(`Best selling products: ${bestSellerNames}`, "What Works")
  }
  
  if (insights.worstSellers.length > 0) {
    console.log(`   No sales yet:`)
    for (const product of insights.worstSellers.slice(0, 3)) {
      console.log(`     - ${product.name}`)
    }
  }
  
  return insights
}

// ============================================
// GET PRODUCT PERFORMANCE
// ============================================
function getProductPerformance(productName) {
  const log = initSalesLog()
  return log.products[productName] || { sales: 0, revenue: 0, firstSale: null }
}

// ============================================
// CHECK IF WE SHOULD MAKE MORE OF THIS TYPE
// ============================================
function shouldMakeMore(industry) {
  const log = initSalesLog()
  
  // Find products in this industry that sold
  const soldProducts = Object.entries(log.products)
    .filter(([name, data]) => data.sales > 0)
    .filter(([name]) => name.toLowerCase().includes(industry.toLowerCase()))
  
  return soldProducts.length > 0
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  checkRecentSales,
  getSalesInsights,
  learnFromSales,
  getProductPerformance,
  shouldMakeMore,
  initSalesLog
}
