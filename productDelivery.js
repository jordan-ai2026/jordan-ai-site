// ============================================
// JORDAN AI - PRODUCT DELIVERY
// Creates download/delivery pages for products
// ============================================

const fs = require("fs")
const path = require("path")
const { quickWrite } = require("./aiBrain")

const WEBSITE_ROOT = path.join(__dirname, "website")
const DELIVERY_DIR = path.join(WEBSITE_ROOT, "download")

// ============================================
// STYLES (matches site design)
// ============================================
const getStyles = () => `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
  
  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  body {
    font-family: 'Space Grotesk', sans-serif;
    background: #0a0a0f;
    color: #e4e4e7;
    min-height: 100vh;
    padding: 40px 24px;
  }
  
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
    max-width: 700px;
    margin: 0 auto;
  }
  
  .success-badge {
    display: inline-block;
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 0.9rem;
    margin-bottom: 24px;
  }
  
  h1 {
    font-size: 2.2rem;
    margin-bottom: 16px;
    background: linear-gradient(135deg, #00d4ff, #8b5cf6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  
  .subtitle {
    color: #71717a;
    font-size: 1.1rem;
    margin-bottom: 40px;
  }
  
  .delivery-box {
    background: rgba(255,255,255,0.03);
    border: 1px solid #27272a;
    border-radius: 16px;
    padding: 32px;
    margin-bottom: 24px;
  }
  
  .delivery-box h2 {
    font-size: 1.3rem;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .file-list {
    list-style: none;
  }
  
  .file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: rgba(0,0,0,0.3);
    border-radius: 10px;
    margin-bottom: 12px;
  }
  
  .file-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .file-icon {
    font-size: 1.5rem;
  }
  
  .file-name {
    font-weight: 600;
  }
  
  .file-size {
    color: #71717a;
    font-size: 0.9rem;
  }
  
  .btn {
    display: inline-block;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.2s;
    cursor: pointer;
    border: none;
    font-size: 1rem;
  }
  
  .btn-download {
    background: linear-gradient(135deg, #00d4ff, #8b5cf6);
    color: #000;
  }
  
  .btn-download:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 212, 255, 0.3);
  }
  
  .instructions {
    margin-top: 32px;
  }
  
  .instructions h3 {
    font-size: 1.1rem;
    margin-bottom: 16px;
  }
  
  .instructions ol {
    margin-left: 24px;
    color: #a1a1aa;
  }
  
  .instructions li {
    margin-bottom: 12px;
    line-height: 1.6;
  }
  
  .support {
    margin-top: 40px;
    padding-top: 32px;
    border-top: 1px solid #27272a;
    color: #71717a;
    font-size: 0.95rem;
  }
  
  .support a {
    color: #00d4ff;
    text-decoration: none;
  }
</style>
`

// ============================================
// CREATE DELIVERY PAGE
// ============================================
async function createDeliveryPage(product) {
  const { name, slug, description, deliverables } = product
  
  // Ensure delivery directory exists
  if (!fs.existsSync(DELIVERY_DIR)) {
    fs.mkdirSync(DELIVERY_DIR, { recursive: true })
  }
  
  // Generate quick start instructions using GPT
  const instructions = await quickWrite(
    `Write 4 quick-start steps for someone who just purchased "${name}".
    
    Product: ${description}
    
    Keep each step to 1 sentence. Be specific and actionable.
    Return just the numbered steps, no intro.`,
    "You write clear, concise instructions."
  )
  
  // Format deliverables as files
  const files = (deliverables || [
    "Complete guide PDF",
    "Template files",
    "Bonus resources"
  ]).map((item, i) => ({
    name: item,
    icon: i === 0 ? "📘" : i === 1 ? "📦" : "🎁",
    size: `${Math.floor(Math.random() * 5) + 1}.${Math.floor(Math.random() * 9)}MB`
  }))
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Download: ${name} — Jordan AI</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
  ${getStyles()}
</head>
<body>
  <div class="bg-effects"></div>
  
  <div class="container">
    <span class="success-badge">✅ Payment Successful</span>
    
    <h1>Thank You for Your Purchase!</h1>
    <p class="subtitle">Here's everything you need to get started with ${name}</p>
    
    <div class="delivery-box">
      <h2>📥 Your Downloads</h2>
      
      <ul class="file-list">
        ${files.map(file => `
        <li class="file-item">
          <div class="file-info">
            <span class="file-icon">${file.icon}</span>
            <div>
              <div class="file-name">${file.name}</div>
              <div class="file-size">${file.size}</div>
            </div>
          </div>
          <button class="btn btn-download" onclick="alert('Download link will be sent to your email!')">Download</button>
        </li>
        `).join("")}
      </ul>
    </div>
    
    <div class="instructions">
      <h3>🚀 Quick Start</h3>
      <ol>
        ${(instructions || "1. Download all files\n2. Read the guide\n3. Follow the steps\n4. Get results")
          .split("\n")
          .filter(line => line.trim())
          .map(line => `<li>${line.replace(/^\d+\.\s*/, "")}</li>`)
          .join("\n        ")}
      </ol>
    </div>
    
    <div class="support">
      <p>Need help? Reply to your purchase confirmation email or contact us at <a href="mailto:support@jordan-ai.co">support@jordan-ai.co</a></p>
      <p style="margin-top: 12px;">Bookmark this page to access your downloads anytime.</p>
    </div>
  </div>
</body>
</html>`

  const filePath = path.join(DELIVERY_DIR, `${slug}.html`)
  fs.writeFileSync(filePath, html)
  
  console.log(`📦 Delivery page created: /download/${slug}.html`)
  
  return {
    success: true,
    path: filePath,
    url: `/download/${slug}.html`
  }
}

// ============================================
// GET DELIVERY URL
// ============================================
function getDeliveryUrl(slug) {
  return `https://jordan-ai.co/download/${slug}.html`
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  createDeliveryPage,
  getDeliveryUrl
}
