// ============================================
// JORDAN AI - WORDPRESS MANAGER
// Manages multiple client WordPress sites
// via the WordPress REST API
//
// SETUP PER CLIENT:
// 1. Log into client's WordPress admin
// 2. Go to Users → Profile → Application Passwords
// 3. Create new application password named "Jordan AI"
// 4. Copy the password (shown once)
// 5. Add client to clients.json
//
// WordPress REST API is built into all WordPress
// sites since version 4.7 (2016). No plugins needed.
// ============================================

const fs = require("fs")
const path = require("path")

// ============================================
// CLIENT CONFIG
// ============================================
const CLIENTS_FILE = path.join(__dirname, "wp-clients.json")

function loadClients() {
  try {
    if (fs.existsSync(CLIENTS_FILE)) {
      return JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf8"))
    }
  } catch (err) {
    console.log("Error loading clients:", err.message)
  }
  return {}
}

function saveClients(clients) {
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2))
}

function addClient(slug, config) {
  const clients = loadClients()
  clients[slug] = {
    name: config.name,
    url: config.url.replace(/\/$/, ""), // Remove trailing slash
    username: config.username,
    appPassword: config.appPassword,
    mode: config.mode || "draft", // "draft" or "publish"
    addedAt: new Date().toISOString(),
    postsPublished: 0,
    pagesCreated: 0,
    lastActivity: null
  }
  saveClients(clients)
  console.log(`✅ WordPress client added: ${config.name} (${slug})`)
  return clients[slug]
}

function removeClient(slug) {
  const clients = loadClients()
  if (clients[slug]) {
    delete clients[slug]
    saveClients(clients)
    return true
  }
  return false
}

function getClient(slug) {
  const clients = loadClients()
  return clients[slug] || null
}

function listClients() {
  return loadClients()
}

function updateClientStats(slug, field) {
  const clients = loadClients()
  if (clients[slug]) {
    clients[slug][field] = (clients[slug][field] || 0) + 1
    clients[slug].lastActivity = new Date().toISOString()
    saveClients(clients)
  }
}

// ============================================
// WORDPRESS API HELPERS
// ============================================

// Build auth header (WordPress Application Passwords use Basic Auth)
function getAuthHeader(client) {
  const credentials = Buffer.from(`${client.username}:${client.appPassword}`).toString("base64")
  return `Basic ${credentials}`
}

// Generic API call to any WordPress site
async function wpApiCall(client, endpoint, method = "GET", body = null) {
  const url = `${client.url}/wp-json/wp/v2${endpoint}`
  
  const options = {
    method,
    headers: {
      "Authorization": getAuthHeader(client),
      "Content-Type": "application/json",
      "User-Agent": "JordanAI/1.0"
    }
  }
  
  if (body && (method === "POST" || method === "PUT")) {
    options.body = JSON.stringify(body)
  }
  
  try {
    const response = await fetch(url, options)
    const data = await response.json()
    
    if (!response.ok) {
      console.log(`WordPress API error (${response.status}):`, data.message || data)
      return { success: false, error: data.message || `HTTP ${response.status}`, status: response.status }
    }
    
    return { success: true, data }
  } catch (err) {
    console.log(`WordPress API connection error:`, err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// TEST CONNECTION
// ============================================
async function testConnection(slug) {
  const client = getClient(slug)
  if (!client) return { success: false, error: `Client "${slug}" not found` }
  
  // Test by fetching the authenticated user
  const result = await wpApiCall(client, "/users/me")
  
  if (result.success) {
    return {
      success: true,
      siteName: client.name,
      siteUrl: client.url,
      loggedInAs: result.data.name,
      role: result.data.roles ? result.data.roles[0] : "unknown"
    }
  }
  
  return result
}

// ============================================
// CREATE BLOG POST
// ============================================
async function createPost(slug, title, content, options = {}) {
  const client = getClient(slug)
  if (!client) return { success: false, error: `Client "${slug}" not found` }
  
  const {
    status = client.mode || "draft", // "draft" or "publish"
    categories = [],
    tags = [],
    excerpt = "",
    featuredImage = null
  } = options
  
  // Upload featured image first if provided
  let featuredMediaId = null
  if (featuredImage) {
    const mediaResult = await uploadImage(slug, featuredImage.url, featuredImage.alt || title)
    if (mediaResult.success) {
      featuredMediaId = mediaResult.data.id
    }
  }
  
  const postData = {
    title,
    content,
    status,
    excerpt: excerpt || content.substring(0, 150).replace(/<[^>]*>/g, "") + "..."
  }
  
  if (featuredMediaId) {
    postData.featured_media = featuredMediaId
  }
  
  // Handle categories (create if they don't exist)
  if (categories.length > 0) {
    postData.categories = await ensureCategories(slug, categories)
  }
  
  // Handle tags (create if they don't exist)
  if (tags.length > 0) {
    postData.tags = await ensureTags(slug, tags)
  }
  
  const result = await wpApiCall(client, "/posts", "POST", postData)
  
  if (result.success) {
    updateClientStats(slug, "postsPublished")
    console.log(`✅ [${client.name}] Post created: "${title}" (${status})`)
    return {
      success: true,
      id: result.data.id,
      url: result.data.link,
      status: result.data.status,
      title: result.data.title.rendered
    }
  }
  
  return result
}

// ============================================
// CREATE / UPDATE PAGE
// ============================================
async function createPage(slug, title, content, options = {}) {
  const client = getClient(slug)
  if (!client) return { success: false, error: `Client "${slug}" not found` }
  
  const {
    status = "publish", // Pages usually go live immediately
    parent = 0,
    slug: pageSlug = null
  } = options
  
  const pageData = {
    title,
    content,
    status,
    parent
  }
  
  if (pageSlug) {
    pageData.slug = pageSlug
  }
  
  const result = await wpApiCall(client, "/pages", "POST", pageData)
  
  if (result.success) {
    updateClientStats(slug, "pagesCreated")
    console.log(`✅ [${client.name}] Page created: "${title}"`)
    return {
      success: true,
      id: result.data.id,
      url: result.data.link,
      title: result.data.title.rendered
    }
  }
  
  return result
}

async function updatePage(slug, pageId, content, options = {}) {
  const client = getClient(slug)
  if (!client) return { success: false, error: `Client "${slug}" not found` }
  
  const updateData = {}
  if (content) updateData.content = content
  if (options.title) updateData.title = options.title
  if (options.status) updateData.status = options.status
  
  const result = await wpApiCall(client, `/pages/${pageId}`, "POST", updateData)
  
  if (result.success) {
    console.log(`✅ [${client.name}] Page updated: ID ${pageId}`)
    return {
      success: true,
      id: result.data.id,
      url: result.data.link
    }
  }
  
  return result
}

// ============================================
// LIST POSTS & PAGES
// ============================================
async function listPosts(slug, options = {}) {
  const client = getClient(slug)
  if (!client) return { success: false, error: `Client "${slug}" not found` }
  
  const { perPage = 10, status = "any", page = 1 } = options
  const endpoint = `/posts?per_page=${perPage}&status=${status}&page=${page}`
  
  return await wpApiCall(client, endpoint)
}

async function listPages(slug) {
  const client = getClient(slug)
  if (!client) return { success: false, error: `Client "${slug}" not found` }
  
  return await wpApiCall(client, "/pages?per_page=50")
}

// ============================================
// UPDATE POST
// ============================================
async function updatePost(slug, postId, updates = {}) {
  const client = getClient(slug)
  if (!client) return { success: false, error: `Client "${slug}" not found` }
  
  const result = await wpApiCall(client, `/posts/${postId}`, "POST", updates)
  
  if (result.success) {
    console.log(`✅ [${client.name}] Post updated: ID ${postId}`)
  }
  
  return result
}

// Publish a draft post
async function publishDraft(slug, postId) {
  return await updatePost(slug, postId, { status: "publish" })
}

// ============================================
// DELETE POST / PAGE
// ============================================
async function deletePost(slug, postId) {
  const client = getClient(slug)
  if (!client) return { success: false, error: `Client "${slug}" not found` }
  
  return await wpApiCall(client, `/posts/${postId}`, "DELETE")
}

// ============================================
// UPLOAD MEDIA (images)
// ============================================
async function uploadImage(slug, imageUrl, altText = "") {
  const client = getClient(slug)
  if (!client) return { success: false, error: `Client "${slug}" not found` }
  
  try {
    // Download the image first
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      return { success: false, error: `Could not download image from ${imageUrl}` }
    }
    
    const imageBuffer = await imageResponse.arrayBuffer()
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg"
    
    // Determine filename from URL
    const urlParts = imageUrl.split("/")
    let filename = urlParts[urlParts.length - 1].split("?")[0]
    if (!filename.includes(".")) {
      filename = `image-${Date.now()}.jpg`
    }
    
    // Upload to WordPress
    const url = `${client.url}/wp-json/wp/v2/media`
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": getAuthHeader(client),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": contentType
      },
      body: Buffer.from(imageBuffer)
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      return { success: false, error: data.message || `Upload failed: HTTP ${response.status}` }
    }
    
    // Set alt text if provided
    if (altText && data.id) {
      await fetch(`${url}/${data.id}`, {
        method: "POST",
        headers: {
          "Authorization": getAuthHeader(client),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ alt_text: altText })
      })
    }
    
    console.log(`✅ [${client.name}] Image uploaded: ${filename}`)
    return { success: true, data: { id: data.id, url: data.source_url } }
    
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ============================================
// CATEGORIES & TAGS
// ============================================
async function ensureCategories(slug, categoryNames) {
  const client = getClient(slug)
  if (!client) return []
  
  const ids = []
  
  // Get existing categories
  const existing = await wpApiCall(client, "/categories?per_page=100")
  const existingMap = {}
  if (existing.success) {
    existing.data.forEach(cat => {
      existingMap[cat.name.toLowerCase()] = cat.id
    })
  }
  
  for (const name of categoryNames) {
    if (existingMap[name.toLowerCase()]) {
      ids.push(existingMap[name.toLowerCase()])
    } else {
      // Create new category
      const result = await wpApiCall(client, "/categories", "POST", { name })
      if (result.success) {
        ids.push(result.data.id)
      }
    }
  }
  
  return ids
}

async function ensureTags(slug, tagNames) {
  const client = getClient(slug)
  if (!client) return []
  
  const ids = []
  
  // Get existing tags
  const existing = await wpApiCall(client, "/tags?per_page=100")
  const existingMap = {}
  if (existing.success) {
    existing.data.forEach(tag => {
      existingMap[tag.name.toLowerCase()] = tag.id
    })
  }
  
  for (const name of tagNames) {
    if (existingMap[name.toLowerCase()]) {
      ids.push(existingMap[name.toLowerCase()])
    } else {
      // Create new tag
      const result = await wpApiCall(client, "/tags", "POST", { name })
      if (result.success) {
        ids.push(result.data.id)
      }
    }
  }
  
  return ids
}

// ============================================
// SITE STATUS
// ============================================
async function getSiteStatus(slug) {
  const client = getClient(slug)
  if (!client) return { success: false, error: `Client "${slug}" not found` }
  
  const results = {}
  
  // Get post count
  const posts = await wpApiCall(client, "/posts?per_page=1&status=publish")
  if (posts.success) {
    results.publishedPosts = "check dashboard for count"
  }
  
  // Get draft count
  const drafts = await wpApiCall(client, "/posts?per_page=100&status=draft")
  if (drafts.success) {
    results.draftPosts = drafts.data.length
    results.drafts = drafts.data.map(d => ({
      id: d.id,
      title: d.title.rendered,
      date: d.date
    }))
  }
  
  // Get pages
  const pages = await wpApiCall(client, "/pages?per_page=100")
  if (pages.success) {
    results.pages = pages.data.map(p => ({
      id: p.id,
      title: p.title.rendered,
      url: p.link,
      status: p.status
    }))
  }
  
  // Get recent posts
  const recent = await wpApiCall(client, "/posts?per_page=5&status=publish&orderby=date&order=desc")
  if (recent.success) {
    results.recentPosts = recent.data.map(p => ({
      id: p.id,
      title: p.title.rendered,
      url: p.link,
      date: p.date
    }))
  }
  
  return {
    success: true,
    client: client.name,
    url: client.url,
    mode: client.mode,
    stats: {
      postsPublished: client.postsPublished,
      pagesCreated: client.pagesCreated,
      lastActivity: client.lastActivity
    },
    ...results
  }
}

// ============================================
// SET CLIENT MODE (draft vs publish)
// ============================================
function setClientMode(slug, mode) {
  const clients = loadClients()
  if (!clients[slug]) return false
  
  if (mode !== "draft" && mode !== "publish") return false
  
  clients[slug].mode = mode
  saveClients(clients)
  return true
}

// ============================================
// AI-POWERED CONTENT GENERATION + PUBLISH
// Uses OpenAI (GPT-4o-mini) to write content
// then publishes directly to WordPress
// ============================================
async function writeAndPublish(slug, topic, openai, options = {}) {
  const client = getClient(slug)
  if (!client) return { success: false, error: `Client "${slug}" not found` }
  
  const {
    type = "post", // "post" or "page"
    keywords = [],
    tone = "professional and helpful",
    wordCount = 800,
    categories = [],
    tags = []
  } = options
  
  try {
    // Generate content with GPT-4o-mini (cheap worker model)
    const prompt = `Write a ${wordCount}-word blog post for a local business website.

Business: ${client.name}
Website: ${client.url}
Topic: ${topic}
${keywords.length > 0 ? `SEO Keywords to include naturally: ${keywords.join(", ")}` : ""}
Tone: ${tone}

Requirements:
- Write in HTML format (use <h2>, <h3>, <p>, <ul>, <li> tags)
- Do NOT include <html>, <head>, <body>, or <h1> tags (WordPress handles those)
- Include a compelling introduction
- Break content into 3-4 sections with subheadings
- Include a call to action at the end mentioning the business
- Make it helpful and informative, not salesy
- Include local references when relevant
- Write for humans, not search engines (but naturally include keywords)`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert SEO content writer for local businesses. You write engaging, helpful content that ranks well in local search." },
        { role: "user", content: prompt }
      ]
    })
    
    const content = response.choices[0].message.content
    
    // Generate an excerpt
    const excerptPrompt = `Write a 1-2 sentence meta description (under 160 characters) for this blog post about "${topic}" for ${client.name}. Just the description, nothing else.`
    
    const excerptResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: excerptPrompt }
      ]
    })
    
    const excerpt = excerptResponse.choices[0].message.content.replace(/"/g, "")
    
    // Generate a good title if topic is rough
    const titlePrompt = `Create a compelling, SEO-friendly blog post title about "${topic}" for a local business called ${client.name}. Just the title, nothing else. No quotes.`
    
    const titleResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: titlePrompt }
      ]
    })
    
    const title = titleResponse.choices[0].message.content.trim()
    
    // Publish to WordPress
    if (type === "page") {
      return await createPage(slug, title, content, { status: client.mode })
    } else {
      return await createPost(slug, title, content, {
        status: client.mode,
        excerpt,
        categories,
        tags
      })
    }
    
  } catch (err) {
    console.log("Write and publish error:", err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// BATCH: Write multiple posts for a client
// ============================================
async function batchWriteAndPublish(slug, topics, openai, options = {}) {
  const results = []
  
  for (const topic of topics) {
    console.log(`📝 Writing: ${topic}`)
    const result = await writeAndPublish(slug, topic, openai, options)
    results.push({ topic, ...result })
    
    // Small delay between posts to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  
  const published = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  
  console.log(`\n📊 Batch complete: ${published} published, ${failed} failed`)
  
  return {
    success: true,
    total: topics.length,
    published,
    failed,
    results
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  // Client management
  addClient,
  removeClient,
  getClient,
  listClients,
  setClientMode,
  
  // Connection
  testConnection,
  getSiteStatus,
  
  // Content
  createPost,
  createPage,
  updatePage,
  updatePost,
  publishDraft,
  deletePost,
  listPosts,
  listPages,
  
  // Media
  uploadImage,
  
  // Categories & Tags
  ensureCategories,
  ensureTags,
  
  // AI-powered
  writeAndPublish,
  batchWriteAndPublish
}
