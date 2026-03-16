// ============================================
// JORDAN AI - REVENUE DASHBOARD
// Track earnings, performance, and KPIs
// ============================================

require("dotenv").config()
const fs = require("fs")
const path = require("path")
const Stripe = require("stripe")

const stripe = process.env.STRIPE_KEY ? new Stripe(process.env.STRIPE_KEY) : null

const DASHBOARD_PATH = path.join(__dirname, "persona", "dashboard.json")

// ============================================
// INITIALIZE DASHBOARD
// ============================================
function initDashboard() {
  const defaultDashboard = {
    // Revenue tracking
    totalRevenue: 0,
    todayRevenue: 0,
    weekRevenue: 0,
    monthRevenue: 0,
    
    // Product tracking
    productsCreated: 0,
    productsSold: 0,
    topProducts: [],
    
    // Content tracking
    blogsPublished: 0,
    tweetsPosted: 0,
    
    // Performance
    conversionRate: 0,
    avgOrderValue: 0,
    
    // Goals
    monthlyGoal: 10000,
    goalProgress: 0,
    
    // History
    dailyRevenue: [],
    lastUpdated: null
  }
  
  if (!fs.existsSync(DASHBOARD_PATH)) {
    saveDashboard(defaultDashboard)
    return defaultDashboard
  }
  
  try {
    return JSON.parse(fs.readFileSync(DASHBOARD_PATH, "utf8"))
  } catch (err) {
    return defaultDashboard
  }
}

function saveDashboard(dashboard) {
  const dir = path.dirname(DASHBOARD_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  dashboard.lastUpdated = new Date().toISOString()
  fs.writeFileSync(DASHBOARD_PATH, JSON.stringify(dashboard, null, 2))
}

// ============================================
// FETCH STRIPE DATA
// ============================================
async function fetchStripeData() {
  if (!stripe) {
    console.log("⚠️ Stripe not configured")
    return null
  }
  
  try {
    const now = Math.floor(Date.now() / 1000)
    const oneDayAgo = now - (24 * 60 * 60)
    const oneWeekAgo = now - (7 * 24 * 60 * 60)
    const oneMonthAgo = now - (30 * 24 * 60 * 60)
    
    // Get all successful payments this month
    const payments = await stripe.paymentIntents.list({
      created: { gte: oneMonthAgo },
      limit: 100
    })
    
    const successful = payments.data.filter(p => p.status === "succeeded")
    
    // Calculate revenue
    let todayRevenue = 0
    let weekRevenue = 0
    let monthRevenue = 0
    const productSales = {}
    
    for (const payment of successful) {
      const amount = payment.amount / 100
      monthRevenue += amount
      
      if (payment.created >= oneWeekAgo) {
        weekRevenue += amount
      }
      
      if (payment.created >= oneDayAgo) {
        todayRevenue += amount
      }
      
      // Track by product if available
      if (payment.description) {
        productSales[payment.description] = (productSales[payment.description] || 0) + 1
      }
    }
    
    // Get top products
    const topProducts = Object.entries(productSales)
      .map(([name, sales]) => ({ name, sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5)
    
    return {
      todayRevenue,
      weekRevenue,
      monthRevenue,
      totalSales: successful.length,
      avgOrderValue: successful.length > 0 ? monthRevenue / successful.length : 0,
      topProducts
    }
    
  } catch (err) {
    console.log("Stripe fetch error:", err.message)
    return null
  }
}

// ============================================
// UPDATE DASHBOARD
// ============================================
async function updateDashboard() {
  console.log("📊 Updating dashboard...")
  
  const dashboard = initDashboard()
  const stripeData = await fetchStripeData()
  
  if (stripeData) {
    dashboard.todayRevenue = stripeData.todayRevenue
    dashboard.weekRevenue = stripeData.weekRevenue
    dashboard.monthRevenue = stripeData.monthRevenue
    dashboard.productsSold = stripeData.totalSales
    dashboard.avgOrderValue = Math.round(stripeData.avgOrderValue * 100) / 100
    dashboard.topProducts = stripeData.topProducts
    
    // Update total revenue
    dashboard.totalRevenue = dashboard.monthRevenue // Simplified
    
    // Calculate goal progress
    dashboard.goalProgress = Math.round((dashboard.monthRevenue / dashboard.monthlyGoal) * 100)
  }
  
  // Track daily revenue
  const today = new Date().toISOString().split("T")[0]
  const existingDay = dashboard.dailyRevenue.find(d => d.date === today)
  
  if (existingDay) {
    existingDay.revenue = dashboard.todayRevenue
  } else {
    dashboard.dailyRevenue.push({
      date: today,
      revenue: dashboard.todayRevenue
    })
    
    // Keep only last 30 days
    if (dashboard.dailyRevenue.length > 30) {
      dashboard.dailyRevenue = dashboard.dailyRevenue.slice(-30)
    }
  }
  
  saveDashboard(dashboard)
  console.log("   ✅ Dashboard updated")
  
  return dashboard
}

// ============================================
// TRACK PRODUCT CREATED
// ============================================
function trackProductCreated() {
  const dashboard = initDashboard()
  dashboard.productsCreated++
  saveDashboard(dashboard)
}

// ============================================
// TRACK BLOG PUBLISHED
// ============================================
function trackBlogPublished() {
  const dashboard = initDashboard()
  dashboard.blogsPublished++
  saveDashboard(dashboard)
}

// ============================================
// TRACK TWEET POSTED
// ============================================
function trackTweetPosted() {
  const dashboard = initDashboard()
  dashboard.tweetsPosted++
  saveDashboard(dashboard)
}

// ============================================
// SET MONTHLY GOAL
// ============================================
function setMonthlyGoal(amount) {
  const dashboard = initDashboard()
  dashboard.monthlyGoal = amount
  dashboard.goalProgress = Math.round((dashboard.monthRevenue / amount) * 100)
  saveDashboard(dashboard)
}

// ============================================
// GET DASHBOARD SUMMARY
// ============================================
function getDashboardSummary() {
  const dashboard = initDashboard()
  
  return {
    revenue: {
      today: dashboard.todayRevenue,
      week: dashboard.weekRevenue,
      month: dashboard.monthRevenue,
      total: dashboard.totalRevenue
    },
    products: {
      created: dashboard.productsCreated,
      sold: dashboard.productsSold
    },
    content: {
      blogs: dashboard.blogsPublished,
      tweets: dashboard.tweetsPosted
    },
    goal: {
      target: dashboard.monthlyGoal,
      current: dashboard.monthRevenue,
      progress: dashboard.goalProgress
    },
    topProducts: dashboard.topProducts,
    lastUpdated: dashboard.lastUpdated
  }
}

// ============================================
// FORMAT DASHBOARD FOR DISCORD
// ============================================
function formatDashboard() {
  const dashboard = initDashboard()
  
  const progressBar = (percent) => {
    const filled = Math.round(percent / 10)
    const empty = 10 - filled
    return "█".repeat(filled) + "░".repeat(empty)
  }
  
  return `**📊 JORDAN AI DASHBOARD**
━━━━━━━━━━━━━━━━━━━━━

**💰 Revenue**
Today: $${dashboard.todayRevenue.toFixed(2)}
This Week: $${dashboard.weekRevenue.toFixed(2)}
This Month: $${dashboard.monthRevenue.toFixed(2)}

**🎯 Monthly Goal: $${dashboard.monthlyGoal.toLocaleString()}**
${progressBar(dashboard.goalProgress)} ${dashboard.goalProgress}%

**📦 Products**
Created: ${dashboard.productsCreated}
Sold: ${dashboard.productsSold}
Avg Order: $${dashboard.avgOrderValue.toFixed(2)}

**📝 Content**
Blogs: ${dashboard.blogsPublished}
Tweets: ${dashboard.tweetsPosted}

${dashboard.topProducts.length > 0 ? `**🏆 Top Products**
${dashboard.topProducts.slice(0, 3).map((p, i) => `${i + 1}. ${p.name} (${p.sales} sales)`).join("\n")}` : ""}

_Last updated: ${dashboard.lastUpdated ? new Date(dashboard.lastUpdated).toLocaleString() : "Never"}_`
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  initDashboard,
  updateDashboard,
  fetchStripeData,
  trackProductCreated,
  trackBlogPublished,
  trackTweetPosted,
  setMonthlyGoal,
  getDashboardSummary,
  formatDashboard
}
