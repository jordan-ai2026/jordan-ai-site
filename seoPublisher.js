// ============================================
// JORDAN AI - SEO PUBLISHER
// Creates professional blog posts
// ============================================

require("dotenv").config()
const fs = require("fs")
const path = require("path")
const OpenAI = require("openai")

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

// ============================================
// PROFESSIONAL BLOG STYLES
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
    line-height: 1.7;
    min-height: 100vh;
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
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 24px;
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
  
  /* Article */
  article {
    max-width: 720px;
    margin: 0 auto;
    padding: 60px 24px 80px;
  }
  
  .article-header {
    margin-bottom: 40px;
    padding-bottom: 32px;
    border-bottom: 1px solid var(--border);
  }
  
  .article-tag {
    display: inline-block;
    background: rgba(0, 212, 255, 0.1);
    color: var(--accent);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.85rem;
    margin-bottom: 16px;
  }
  
  article h1 {
    font-size: 2.4rem;
    line-height: 1.2;
    margin-bottom: 16px;
  }
  
  .article-meta {
    color: var(--text-muted);
    font-size: 0.95rem;
    display: flex;
    gap: 16px;
    align-items: center;
  }
  
  .article-meta span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  /* Content */
  .article-content {
    font-size: 1.1rem;
  }
  
  .article-content p {
    margin-bottom: 24px;
    color: var(--text);
  }
  
  .article-content h2 {
    font-size: 1.5rem;
    margin: 40px 0 16px;
    color: var(--text);
  }
  
  .article-content ul, .article-content ol {
    margin: 0 0 24px 24px;
  }
  
  .article-content li {
    margin-bottom: 8px;
  }
  
  .article-content strong {
    color: var(--accent);
  }
  
  /* CTA Box */
  .cta-box {
    background: linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(139, 92, 246, 0.1));
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 32px;
    margin: 40px 0;
    text-align: center;
  }
  
  .cta-box h3 {
    font-size: 1.3rem;
    margin-bottom: 12px;
  }
  
  .cta-box p {
    color: var(--text-muted);
    margin-bottom: 20px;
  }
  
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
  
  /* Footer */
  footer {
    border-top: 1px solid var(--border);
    padding: 40px 24px;
    text-align: center;
    color: var(--text-muted);
  }
  
  footer a { color: var(--accent); text-decoration: none; }
  
  /* Back link */
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text-muted);
    text-decoration: none;
    margin-top: 40px;
    padding-top: 32px;
    border-top: 1px solid var(--border);
  }
  
  .back-link:hover { color: var(--accent); }
  
  @media (max-width: 768px) {
    article h1 { font-size: 1.8rem; }
    .nav-links { display: none; }
  }
</style>
`

// ============================================
// PUBLISH BLOG POST
// ============================================
async function publishBlog(topic, productSlug) {
  const slug = slugify(topic)
  const date = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })
  
  // Generate article content
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You write professional, helpful blog articles about AI and business automation. 
        
Write in a conversational but knowledgeable tone. Use short paragraphs. 
Include practical advice people can use.
Do NOT use markdown formatting - just plain text with paragraph breaks.
Write about 300-400 words.`
      },
      {
        role: "user",
        content: `Write a blog article about: ${topic}

Make it helpful and actionable. Focus on how this helps businesses save time or make money.`
      }
    ]
  })
  
  const articleContent = res.choices[0].message.content
  
  // Split into paragraphs and format
  const paragraphs = articleContent
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p>${p.trim()}</p>`)
    .join('\n        ')
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${topic} — Jordan AI Blog</title>
  <meta name="description" content="${articleContent.substring(0, 155).replace(/"/g, '')}...">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
  ${getStyles()}
</head>
<body>
  <div class="bg-effects"></div>
  
  <nav>
    <div class="container">
      <a href="/" class="logo">⚡ Jordan AI</a>
      <ul class="nav-links">
        <li><a href="/">Home</a></li>
        <li><a href="/products">Products</a></li>
        <li><a href="/blog">Blog</a></li>
      </ul>
    </div>
  </nav>
  
  <article>
    <header class="article-header">
      <span class="article-tag">AI & Automation</span>
      <h1>${topic}</h1>
      <div class="article-meta">
        <span>📅 ${date}</span>
        <span>✍️ Jordan AI</span>
        <span>⏱️ 3 min read</span>
      </div>
    </header>
    
    <div class="article-content">
      ${paragraphs}
    </div>
    
    ${productSlug ? `
    <div class="cta-box">
      <h3>🚀 Ready to automate?</h3>
      <p>Check out our AI tool that can help with this.</p>
      <a href="/products/${productSlug}.html" class="btn btn-primary">View Product →</a>
    </div>
    ` : ''}
    
    <a href="/" class="back-link">← Back to Home</a>
  </article>
  
  <footer>
    <p>© ${new Date().getFullYear()} Jordan AI — Built autonomously</p>
  </footer>
</body>
</html>`

  // Save to correct folder
  const WEBSITE_ROOT = path.join(__dirname, "website")
  const BLOG_DIR = path.join(WEBSITE_ROOT, "blog")
  
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true })
  }
  
  const blogPath = path.join(BLOG_DIR, slug + ".html")
  fs.writeFileSync(blogPath, html)
  console.log("✅ Blog created:", blogPath)
  
  return {
    success: true,
    path: blogPath,
    slug: slug,
    url: `/blog/${slug}.html`
  }
}

module.exports = { publishBlog }