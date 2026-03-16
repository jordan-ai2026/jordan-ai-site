// ============================================
// JORDAN AI - WEBSITE BUILDER
// Creates professional HTML pages
// ============================================
//
// FOLDER STRUCTURE:
// jordan-ai-bot/
//   ├── website/
//   │   ├── index.html        (homepage - auto-generated)
//   │   ├── services.html     (service page - MANUAL, never overwritten)
//   │   ├── products/
//   │   │   └── product-name.html
//   │   └── blog/
//   │       └── blog-post.html
//   └── (bot files)
//
// ============================================

const fs = require("fs")
const path = require("path")

// ============================================
// CONFIGURATION - CHANGE THESE IF NEEDED
// ============================================
const CONFIG = {
  // This is relative to where index.js runs from
  websiteFolder: "website",
  productsFolder: "website/products",
  blogFolder: "website/blog",
  
  // Your domain
  domain: "jordan-ai.co",
  
  // Brand colors
  colors: {
    bg: "#0a0a0f",
    accent: "#00d4ff",
    purple: "#8b5cf6"
  }
}

// ============================================
// SHARED CSS STYLES
// ============================================
const getStyles = () => `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
  
  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  :root {
    --bg: #0a0a0f;
    --bg-light: #12121a;
    --accent: #00d4ff;
    --purple: #8b5cf6;
    --text: #e4e4e7;
    --text-muted: #71717a;
    --border: #27272a;
  }
  
  body {
    font-family: 'Space Grotesk', sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    min-height: 100vh;
  }
  
  /* Gradient background */
  .bg-effects {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: 
      radial-gradient(ellipse at 20% 20%, rgba(139, 92, 246, 0.15) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 80%, rgba(0, 212, 255, 0.1) 0%, transparent 50%);
    pointer-events: none;
    z-index: -1;
  }
  
  .container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 24px;
  }
  
  /* Navigation */
  nav {
    padding: 20px 0;
    border-bottom: 1px solid var(--border);
    background: rgba(10, 10, 15, 0.9);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  
  nav .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .logo {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--accent);
    text-decoration: none;
  }
  
  .nav-links {
    display: flex;
    gap: 28px;
    list-style: none;
  }
  
  .nav-links a {
    color: var(--text-muted);
    text-decoration: none;
    transition: color 0.2s;
  }
  
  .nav-links a:hover { color: var(--accent); }
  .nav-links a.active { color: var(--accent); }
  
  /* Hero */
  .hero {
    padding: 100px 0 60px;
    text-align: center;
  }
  
  .hero h1 {
    font-size: 3rem;
    margin-bottom: 20px;
    line-height: 1.2;
  }
  
  .hero .gradient {
    background: linear-gradient(135deg, var(--accent), var(--purple));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  
  .hero p {
    font-size: 1.2rem;
    color: var(--text-muted);
    max-width: 600px;
    margin: 0 auto 32px;
  }
  
  /* Buttons */
  .btn {
    display: inline-block;
    padding: 14px 28px;
    border-radius: 10px;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.2s;
  }
  
  .btn-primary {
    background: linear-gradient(135deg, var(--accent), var(--purple));
    color: #000;
  }
  
  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 212, 255, 0.3);
  }
  
  .btn-secondary {
    background: rgba(255,255,255,0.05);
    color: var(--text);
    border: 1px solid var(--border);
  }
  
  .btn-secondary:hover {
    border-color: var(--accent);
  }
  
  /* Cards */
  .card {
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 28px;
    transition: all 0.2s;
  }
  
  .card:hover {
    border-color: var(--accent);
    transform: translateY(-4px);
  }
  
  .card h3 {
    font-size: 1.2rem;
    margin-bottom: 10px;
  }
  
  .card p {
    color: var(--text-muted);
    font-size: 0.95rem;
  }
  
  .card-icon {
    font-size: 2rem;
    margin-bottom: 16px;
  }
  
  /* Grid */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 24px;
  }
  
  /* Sections */
  section {
    padding: 70px 0;
  }
  
  section h2 {
    font-size: 2rem;
    text-align: center;
    margin-bottom: 12px;
  }
  
  .section-subtitle {
    text-align: center;
    color: var(--text-muted);
    margin-bottom: 40px;
  }
  
  /* Product page */
  .product-page {
    padding: 60px 0;
  }
  
  .product-header {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 50px;
    align-items: center;
  }
  
  .product-header h1 {
    font-size: 2.5rem;
    margin-bottom: 16px;
  }
  
  .product-price {
    font-size: 2.2rem;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 20px;
  }
  
  .product-description {
    color: var(--text-muted);
    font-size: 1.1rem;
    margin-bottom: 24px;
  }
  
  .product-features {
    list-style: none;
    margin-bottom: 28px;
  }
  
  .product-features li {
    padding: 10px 0;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  
  .product-features li::before {
    content: "✓";
    color: var(--accent);
    font-weight: bold;
  }
  
  .product-image {
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 16px;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 5rem;
  }
  
  /* Blog */
  .blog-post {
    max-width: 700px;
    margin: 0 auto;
    padding: 60px 24px;
  }
  
  .blog-post h1 {
    font-size: 2.2rem;
    margin-bottom: 16px;
  }
  
  .blog-meta {
    color: var(--text-muted);
    margin-bottom: 40px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border);
  }
  
  .blog-content p {
    font-size: 1.1rem;
    line-height: 1.8;
    margin-bottom: 20px;
  }
  
  /* Footer */
  footer {
    border-top: 1px solid var(--border);
    padding: 40px 0;
    text-align: center;
    color: var(--text-muted);
  }
  
  footer a { color: var(--accent); text-decoration: none; }
  footer a:hover { text-decoration: underline; }
  
  /* Responsive */
  @media (max-width: 768px) {
    .hero h1 { font-size: 2rem; }
    .product-header { grid-template-columns: 1fr; }
    .nav-links { display: none; }
  }
</style>
`

// ============================================
// NAVIGATION (with Services link)
// ============================================
const getNav = () => `
<nav>
  <div class="container">
    <a href="/" class="logo">⚡ Jordan AI</a>
    <ul class="nav-links">
      <li><a href="/">Home</a></li>
      <li><a href="/products">Products</a></li>
      <li><a href="/blog">Blog</a></li>
      <li><a href="/services.html">Services</a></li>
    </ul>
  </div>
</nav>
`

// ============================================
// FOOTER (with Services link)
// ============================================
const getFooter = () => `
<footer>
  <div class="container">
    <p style="margin-bottom: 12px;">
      <a href="/">Home</a> · 
      <a href="/products">Products</a> · 
      <a href="/blog">Blog</a> · 
      <a href="/services.html">Services</a>
    </p>
    <p>© ${new Date().getFullYear()} Jordan AI — Built autonomously</p>
  </div>
</footer>
`

// ============================================
// HELPER FUNCTIONS
// ============================================
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    console.log(`📁 Created folder: ${dir}`)
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

// Get list of existing products
function getProductsList() {
  const productsDir = path.join(__dirname, CONFIG.productsFolder)
  ensureDir(productsDir)
  
  try {
    const files = fs.readdirSync(productsDir).filter(f => f.endsWith(".html"))
    return files.map(f => {
      const name = f.replace(".html", "").replace(/-/g, " ")
      return {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        slug: f.replace(".html", ""),
        url: `/products/${f}`
      }
    })
  } catch (err) {
    return []
  }
}

// Get list of existing blog posts
function getBlogList() {
  const blogDir = path.join(__dirname, CONFIG.blogFolder)
  ensureDir(blogDir)
  
  try {
    const files = fs.readdirSync(blogDir).filter(f => f.endsWith(".html"))
    return files.map(f => {
      const name = f.replace(".html", "").replace(/-/g, " ")
      return {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        slug: f.replace(".html", ""),
        url: `/blog/${f}`
      }
    })
  } catch (err) {
    return []
  }
}

// ============================================
// CREATE HOMEPAGE
// NOTE: This ONLY writes index.html
// services.html is NEVER touched by this code
// ============================================
async function createHomepage() {
  try {
    const websiteDir = path.join(__dirname, CONFIG.websiteFolder)
    ensureDir(websiteDir)
    
    // Get existing products and blogs
    const products = getProductsList()
    const blogs = getBlogList()
    
    // Generate product cards HTML
    let productsHTML = ""
    if (products.length > 0) {
      productsHTML = products.map(p => `
          <a href="${p.url}" class="card" style="text-decoration: none; color: inherit;">
            <div class="card-icon">🚀</div>
            <h3>${p.name}</h3>
            <p>Click to view product details →</p>
          </a>
      `).join("")
    } else {
      productsHTML = `
          <div class="card">
            <div class="card-icon">🔨</div>
            <h3>Products Coming Soon</h3>
            <p>Jordan AI is building products. Check back soon!</p>
          </div>
      `
    }
    
    // Generate blog cards HTML
    let blogsHTML = ""
    if (blogs.length > 0) {
      blogsHTML = blogs.slice(0, 3).map(b => `
          <a href="${b.url}" class="card" style="text-decoration: none; color: inherit;">
            <div class="card-icon">📝</div>
            <h3>${b.name}</h3>
            <p>Read article →</p>
          </a>
      `).join("")
    } else {
      blogsHTML = `
          <div class="card">
            <div class="card-icon">✍️</div>
            <h3>Blog Coming Soon</h3>
            <p>Articles and guides coming soon!</p>
          </div>
      `
    }
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jordan AI — Autonomous Business Builder</title>
  <meta name="description" content="Jordan AI builds businesses autonomously using AI. Products, tools, and automation.">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
  ${getStyles()}
</head>
<body>
  <div class="bg-effects"></div>
  
  ${getNav()}
  
  <main>
    <section class="hero">
      <div class="container">
        <h1>Autonomous AI<br><span class="gradient">Building Real Businesses</span></h1>
        <p>Jordan AI scans markets, builds products, and generates revenue — all autonomously.</p>
        <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
          <a href="/products" class="btn btn-primary">View Products</a>
          <a href="/blog" class="btn btn-secondary">Read Blog</a>
          <a href="/services.html" class="btn btn-secondary">Hire Us</a>
        </div>
      </div>
    </section>
    
    <!-- Services callout -->
    <section style="background: var(--bg-light);">
      <div class="container" style="text-align: center;">
        <h2>Need a Custom AI Chatbot?</h2>
        <p class="section-subtitle">We build AI agents that answer your customers 24/7, book appointments, and qualify leads.</p>
        <a href="/services.html" class="btn btn-primary">Learn More →</a>
      </div>
    </section>
    
    <section>
      <div class="container">
        <h2>Products</h2>
        <p class="section-subtitle">AI-built tools and services</p>
        <div class="grid">
          ${productsHTML}
        </div>
      </div>
    </section>
    
    <section style="background: var(--bg-light);">
      <div class="container">
        <h2>Latest from the Blog</h2>
        <p class="section-subtitle">Insights on AI, automation, and business</p>
        <div class="grid">
          ${blogsHTML}
        </div>
        ${blogs.length > 3 ? '<p style="text-align: center; margin-top: 24px;"><a href="/blog" class="btn btn-secondary">View All Posts</a></p>' : ''}
      </div>
    </section>
  </main>
  
  ${getFooter()}
</body>
</html>`
    
    const filePath = path.join(websiteDir, "index.html")
    fs.writeFileSync(filePath, html)
    console.log("✅ Homepage created: website/index.html")
    console.log(`   → ${products.length} products listed`)
    console.log(`   → ${blogs.length} blog posts listed`)
    console.log(`   → Services link included`)
    
    return { success: true, path: filePath }
    
  } catch (err) {
    console.error("❌ Homepage error:", err)
    return { success: false, error: err.message }
  }
}

// ============================================
// CREATE PRODUCT PAGE
// ============================================
async function createProductPage(name, description, options = {}) {
  try {
    const {
      price = 49,
      features = ["Instant access", "Lifetime updates", "Built by AI"],
      emoji = "🚀",
      paymentLink = null
    } = options
    
    const slug = slugify(name)
    const productsDir = path.join(__dirname, CONFIG.productsFolder)
    ensureDir(productsDir)
    
    // Use Stripe payment link if available, otherwise show "Coming Soon"
    const buyButton = paymentLink 
      ? `<a href="${paymentLink}" class="btn btn-primary">Buy Now — $${price}</a>`
      : `<a href="#" class="btn btn-primary" onclick="alert('Payment coming soon!'); return false;">Buy Now — $${price}</a>`
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} — Jordan AI</title>
  <meta name="description" content="${description.substring(0, 160)}">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
  ${getStyles()}
</head>
<body>
  <div class="bg-effects"></div>
  
  ${getNav()}
  
  <main class="product-page">
    <div class="container">
      <div class="product-header">
        <div>
          <h1>${name}</h1>
          <div class="product-price">$${price}</div>
          <p class="product-description">${description}</p>
          
          <ul class="product-features">
            ${features.map(f => `<li>${f}</li>`).join("\n            ")}
          </ul>
          
          ${buyButton}
          <a href="/" class="btn btn-secondary" style="margin-left: 12px;">← Home</a>
        </div>
        
        <div class="product-image">${emoji}</div>
      </div>
    </div>
  </main>
  
  ${getFooter()}
</body>
</html>`
    
    const filePath = path.join(productsDir, `${slug}.html`)
    fs.writeFileSync(filePath, html)
    console.log(`✅ Product created: website/products/${slug}.html`)
    
    // Update homepage to include new product
    await createHomepage()
    
    return {
      success: true,
      slug,
      path: filePath,
      url: `https://${CONFIG.domain}/products/${slug}.html`
    }
    
  } catch (err) {
    console.error("❌ Product page error:", err)
    return { success: false, error: err.message }
  }
}

// ============================================
// CREATE BLOG POST
// ============================================
async function createBlogPost(title, content, options = {}) {
  try {
    const {
      author = "Jordan AI",
      date = new Date().toLocaleDateString()
    } = options
    
    const slug = slugify(title)
    const blogDir = path.join(__dirname, CONFIG.blogFolder)
    ensureDir(blogDir)
    
    // Convert content paragraphs
    const paragraphs = content
      .split("\n\n")
      .filter(p => p.trim())
      .map(p => `<p>${p}</p>`)
      .join("\n      ")
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Jordan AI Blog</title>
  <meta name="description" content="${content.substring(0, 160)}">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
  ${getStyles()}
</head>
<body>
  <div class="bg-effects"></div>
  
  ${getNav()}
  
  <article class="blog-post">
    <h1>${title}</h1>
    <div class="blog-meta">By ${author} · ${date}</div>
    
    <div class="blog-content">
      ${paragraphs}
    </div>
    
    <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border); display: flex; gap: 12px;">
      <a href="/" class="btn btn-secondary">← Home</a>
      <a href="/services.html" class="btn btn-primary">Need a Custom AI Agent?</a>
    </div>
  </article>
  
  ${getFooter()}
</body>
</html>`
    
    const filePath = path.join(blogDir, `${slug}.html`)
    fs.writeFileSync(filePath, html)
    console.log(`✅ Blog post created: website/blog/${slug}.html`)
    
    // Update homepage to include new blog post
    await createHomepage()
    
    return {
      success: true,
      slug,
      path: filePath,
      url: `https://${CONFIG.domain}/blog/${slug}.html`
    }
    
  } catch (err) {
    console.error("❌ Blog post error:", err)
    return { success: false, error: err.message }
  }
}

// ============================================
// CREATE PRODUCTS INDEX PAGE
// ============================================
async function createProductsIndex() {
  try {
    const websiteDir = path.join(__dirname, CONFIG.websiteFolder)
    const products = getProductsList()
    
    const productsHTML = products.length > 0
      ? products.map(p => `
          <a href="${p.url}" class="card" style="text-decoration: none; color: inherit;">
            <div class="card-icon">🚀</div>
            <h3>${p.name}</h3>
            <p>View details →</p>
          </a>
      `).join("")
      : `<div class="card"><p>No products yet. Check back soon!</p></div>`
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Products — Jordan AI</title>
  ${getStyles()}
</head>
<body>
  <div class="bg-effects"></div>
  ${getNav()}
  
  <section class="hero" style="padding: 60px 0;">
    <div class="container">
      <h1>Products</h1>
      <p>AI-built tools and services</p>
    </div>
  </section>
  
  <section>
    <div class="container">
      <div class="grid">${productsHTML}</div>
    </div>
  </section>
  
  ${getFooter()}
</body>
</html>`
    
    // Create products folder index
    const productsDir = path.join(__dirname, CONFIG.productsFolder)
    ensureDir(productsDir)
    fs.writeFileSync(path.join(productsDir, "index.html"), html)
    
    // Also create at /products.html for some servers
    fs.writeFileSync(path.join(websiteDir, "products.html"), html)
    
    console.log("✅ Products index created")
    return { success: true }
    
  } catch (err) {
    console.error("❌ Products index error:", err)
    return { success: false, error: err.message }
  }
}

// ============================================
// CREATE BLOG INDEX PAGE
// ============================================
async function createBlogIndex() {
  try {
    const websiteDir = path.join(__dirname, CONFIG.websiteFolder)
    const blogs = getBlogList()
    
    const blogsHTML = blogs.length > 0
      ? blogs.map(b => `
          <a href="${b.url}" class="card" style="text-decoration: none; color: inherit;">
            <div class="card-icon">📝</div>
            <h3>${b.name}</h3>
            <p>Read article →</p>
          </a>
      `).join("")
      : `<div class="card"><p>No posts yet. Check back soon!</p></div>`
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog — Jordan AI</title>
  ${getStyles()}
</head>
<body>
  <div class="bg-effects"></div>
  ${getNav()}
  
  <section class="hero" style="padding: 60px 0;">
    <div class="container">
      <h1>Blog</h1>
      <p>Insights on AI, automation, and building businesses</p>
    </div>
  </section>
  
  <section>
    <div class="container">
      <div class="grid">${blogsHTML}</div>
    </div>
  </section>
  
  ${getFooter()}
</body>
</html>`
    
    // Create blog folder index
    const blogDir = path.join(__dirname, CONFIG.blogFolder)
    ensureDir(blogDir)
    fs.writeFileSync(path.join(blogDir, "index.html"), html)
    
    // Also create at /blog.html for some servers
    fs.writeFileSync(path.join(websiteDir, "blog.html"), html)
    
    console.log("✅ Blog index created")
    return { success: true }
    
  } catch (err) {
    console.error("❌ Blog index error:", err)
    return { success: false, error: err.message }
  }
}

// ============================================
// REBUILD ALL PAGES
// NOTE: This rebuilds auto-generated pages only
// services.html is NEVER touched
// ============================================
async function rebuildSite() {
  console.log("🔄 Rebuilding entire site...")
  await createHomepage()
  await createProductsIndex()
  await createBlogIndex()
  console.log("✅ Site rebuild complete")
  console.log("   → services.html was NOT modified (manual page)")
  return { success: true }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  createHomepage,
  createProductPage,
  createBlogPost,
  createProductsIndex,
  createBlogIndex,
  rebuildSite,
  getProductsList,
  getBlogList,
  CONFIG
}
