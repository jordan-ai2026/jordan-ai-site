// ============================================
// JORDAN AI - SOCIAL MEDIA MANAGER
// Auto-post to X/Twitter, Facebook, LinkedIn
//
// SETUP:
// 1. X/Twitter: developer.x.com → create app
//    Add to .env:
//    TWITTER_API_KEY=xxx
//    TWITTER_API_SECRET=xxx
//    TWITTER_ACCESS_TOKEN=xxx
//    TWITTER_ACCESS_SECRET=xxx
//
// 2. Facebook: developers.facebook.com
//    Add to .env:
//    FACEBOOK_PAGE_ID=xxx
//    FACEBOOK_ACCESS_TOKEN=xxx
//
// 3. LinkedIn: linkedin.com/developers
//    Add to .env:
//    LINKEDIN_ACCESS_TOKEN=xxx
//    LINKEDIN_PERSON_ID=xxx
// ============================================

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

// ============================================
// CONFIG & STATE
// ============================================
const LOG_FILE = path.join(__dirname, "social-log.json")

function getPlatformStatus() {
  return {
    twitter: !!(process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET && process.env.TWITTER_ACCESS_TOKEN && process.env.TWITTER_ACCESS_SECRET),
    facebook: !!(process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_ACCESS_TOKEN),
    linkedin: !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_ID)
  }
}

function getConnectedPlatforms() {
  const status = getPlatformStatus()
  return Object.entries(status).filter(([_, v]) => v).map(([k]) => k)
}

// ============================================
// POST LOG
// ============================================
function loadLog() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, "utf8"))
    }
  } catch (err) {}
  return []
}

function saveLog(log) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(log.slice(-500), null, 2))
}

function logPost(platform, content, result) {
  const log = loadLog()
  log.push({
    platform,
    content: content.substring(0, 100),
    success: result.success,
    url: result.url || null,
    error: result.error || null,
    postedAt: new Date().toISOString()
  })
  saveLog(log)
}

function getPostStats() {
  const log = loadLog()
  const now = new Date()
  const today = log.filter(e => new Date(e.postedAt).toDateString() === now.toDateString())
  const thisWeek = log.filter(e => {
    const d = new Date(e.postedAt)
    const diff = (now - d) / (1000 * 60 * 60 * 24)
    return diff <= 7
  })
  const thisMonth = log.filter(e => {
    const d = new Date(e.postedAt)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  
  return {
    total: log.length,
    today: today.length,
    thisWeek: thisWeek.length,
    thisMonth: thisMonth.length,
    recent: log.slice(-5).reverse(),
    byPlatform: {
      twitter: log.filter(e => e.platform === "twitter" && e.success).length,
      facebook: log.filter(e => e.platform === "facebook" && e.success).length,
      linkedin: log.filter(e => e.platform === "linkedin" && e.success).length
    }
  }
}

// ============================================
// X / TWITTER (OAuth 1.0a)
// ============================================

function twitterOAuthHeader(method, url, params = {}) {
  const oauthParams = {
    oauth_consumer_key: process.env.TWITTER_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.TWITTER_ACCESS_TOKEN,
    oauth_version: "1.0"
  }
  
  const allParams = { ...oauthParams, ...params }
  const paramString = Object.keys(allParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join("&")
  
  const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`
  const signingKey = `${encodeURIComponent(process.env.TWITTER_API_SECRET)}&${encodeURIComponent(process.env.TWITTER_ACCESS_SECRET)}`
  
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64")
  
  oauthParams.oauth_signature = signature
  
  const header = Object.keys(oauthParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(", ")
  
  return `OAuth ${header}`
}

async function postToTwitter(text) {
  if (!getPlatformStatus().twitter) {
    return { success: false, error: "Twitter not configured" }
  }
  
  // Truncate to 280 chars
  const tweet = text.length > 280 ? text.substring(0, 277) + "..." : text
  
  const url = "https://api.twitter.com/2/tweets"
  const body = JSON.stringify({ text: tweet })
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": twitterOAuthHeader("POST", url),
        "Content-Type": "application/json"
      },
      body
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      const error = data.detail || data.errors?.[0]?.message || `HTTP ${response.status}`
      logPost("twitter", tweet, { success: false, error })
      return { success: false, error }
    }
    
    const tweetUrl = `https://x.com/i/status/${data.data.id}`
    console.log(`✅ Posted to X/Twitter: ${tweetUrl}`)
    logPost("twitter", tweet, { success: true, url: tweetUrl })
    
    return { success: true, url: tweetUrl, id: data.data.id }
    
  } catch (err) {
    logPost("twitter", tweet, { success: false, error: err.message })
    return { success: false, error: err.message }
  }
}

// ============================================
// FACEBOOK PAGE
// ============================================
async function postToFacebook(message, options = {}) {
  if (!getPlatformStatus().facebook) {
    return { success: false, error: "Facebook not configured" }
  }
  
  const { link = null } = options
  
  try {
    const params = new URLSearchParams()
    params.append("message", message)
    params.append("access_token", process.env.FACEBOOK_ACCESS_TOKEN)
    if (link) params.append("link", link)
    
    const url = `https://graph.facebook.com/v19.0/${process.env.FACEBOOK_PAGE_ID}/feed`
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    })
    
    const data = await response.json()
    
    if (data.error) {
      logPost("facebook", message, { success: false, error: data.error.message })
      return { success: false, error: data.error.message }
    }
    
    const postUrl = `https://facebook.com/${data.id}`
    console.log(`✅ Posted to Facebook: ${postUrl}`)
    logPost("facebook", message, { success: true, url: postUrl })
    
    return { success: true, url: postUrl, id: data.id }
    
  } catch (err) {
    logPost("facebook", message, { success: false, error: err.message })
    return { success: false, error: err.message }
  }
}

// ============================================
// LINKEDIN
// ============================================
async function postToLinkedIn(text, options = {}) {
  if (!getPlatformStatus().linkedin) {
    return { success: false, error: "LinkedIn not configured" }
  }
  
  const { link = null } = options
  
  try {
    const personUrn = `urn:li:person:${process.env.LINKEDIN_PERSON_ID}`
    
    const body = {
      author: personUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: link ? "ARTICLE" : "NONE"
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
      }
    }
    
    if (link) {
      body.specificContent["com.linkedin.ugc.ShareContent"].media = [{
        status: "READY",
        originalUrl: link
      }]
    }
    
    const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0"
      },
      body: JSON.stringify(body)
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      const error = data.message || `HTTP ${response.status}`
      logPost("linkedin", text, { success: false, error })
      return { success: false, error }
    }
    
    console.log(`✅ Posted to LinkedIn`)
    logPost("linkedin", text, { success: true, url: "https://linkedin.com" })
    
    return { success: true, id: data.id }
    
  } catch (err) {
    logPost("linkedin", text, { success: false, error: err.message })
    return { success: false, error: err.message }
  }
}

// ============================================
// POST TO ALL CONNECTED PLATFORMS
// ============================================
async function postToAll(text, options = {}) {
  const platforms = getConnectedPlatforms()
  const results = {}
  
  if (platforms.length === 0) {
    return { success: false, error: "No platforms configured", results: {} }
  }
  
  for (const platform of platforms) {
    switch (platform) {
      case "twitter":
        results.twitter = await postToTwitter(text)
        break
      case "facebook":
        results.facebook = await postToFacebook(text, options)
        break
      case "linkedin":
        results.linkedin = await postToLinkedIn(text, options)
        break
    }
  }
  
  const succeeded = Object.values(results).filter(r => r.success).length
  const failed = Object.values(results).filter(r => !r.success).length
  
  return {
    success: succeeded > 0,
    posted: succeeded,
    failed,
    platforms: platforms.length,
    results
  }
}

// ============================================
// AI CONTENT GENERATION
// ============================================
async function generatePost(topic, openai, options = {}) {
  const {
    platform = "all", // "twitter", "facebook", "linkedin", "all"
    tone = "professional but approachable",
    includeHashtags = true,
    includeLink = null,
    clientBusiness = null
  } = options
  
  let maxLength = 280
  let platformNote = "Keep under 280 characters for Twitter."
  
  if (platform === "facebook" || platform === "linkedin") {
    maxLength = 1000
    platformNote = "Can be up to 500 words. More detailed and engaging."
  } else if (platform === "all") {
    maxLength = 280
    platformNote = "Keep under 280 characters so it works on all platforms including Twitter."
  }
  
  const prompt = `Write a social media post about: ${topic}
${clientBusiness ? `For the business: ${clientBusiness}` : "For a digital agency that builds AI chatbots for small businesses."}
Tone: ${tone}
${platformNote}
${includeHashtags ? "Include 2-3 relevant hashtags." : "No hashtags."}
${includeLink ? `Include this link naturally: ${includeLink}` : ""}

Write ONLY the post text. No quotes, no labels, no explanation.`

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You write engaging social media posts. Concise, punchy, no fluff. You sound like a real person, not a brand." },
        { role: "user", content: prompt }
      ]
    })
    
    return {
      success: true,
      text: response.choices[0].message.content.trim()
    }
    
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ============================================
// WRITE AND POST (AI generates + posts)
// ============================================
async function writeAndPost(topic, openai, options = {}) {
  const { platform = "all" } = options
  
  // Generate content
  const generated = await generatePost(topic, openai, options)
  if (!generated.success) return generated
  
  const text = generated.text
  
  // Post to specified platform(s)
  let result
  if (platform === "all") {
    result = await postToAll(text, options)
  } else if (platform === "twitter") {
    result = await postToTwitter(text)
  } else if (platform === "facebook") {
    result = await postToFacebook(text, options)
  } else if (platform === "linkedin") {
    result = await postToLinkedIn(text, options)
  } else {
    return { success: false, error: `Unknown platform: ${platform}` }
  }
  
  return {
    ...result,
    content: text
  }
}

// ============================================
// BATCH POST (multiple topics)
// ============================================
async function batchPost(topics, openai, options = {}) {
  const results = []
  
  for (const topic of topics) {
    console.log(`📱 Posting about: ${topic}`)
    const result = await writeAndPost(topic, openai, options)
    results.push({ topic, ...result })
    
    // Delay between posts to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  
  const succeeded = results.filter(r => r.success).length
  
  return {
    success: succeeded > 0,
    total: topics.length,
    posted: succeeded,
    failed: topics.length - succeeded,
    results
  }
}

// ============================================
// CONTENT IDEAS GENERATOR
// ============================================
async function generateContentIdeas(business, openai, count = 5) {
  try {
    const prompt = `Generate ${count} social media post ideas for a business that provides AI chatbot and website management services to small businesses.
${business ? `Current client spotlight: ${business}` : ""}

For each idea, give:
- A short topic (5-8 words)
- Which platform it's best for (Twitter, Facebook, LinkedIn, or All)

Format as a numbered list. Topics only, no full posts.`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You generate social media content ideas. Practical, specific, not generic." },
        { role: "user", content: prompt }
      ]
    })
    
    return {
      success: true,
      ideas: response.choices[0].message.content
    }
    
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  // Platform status
  getPlatformStatus,
  getConnectedPlatforms,
  
  // Direct posting
  postToTwitter,
  postToFacebook,
  postToLinkedIn,
  postToAll,
  
  // AI-powered
  generatePost,
  writeAndPost,
  batchPost,
  generateContentIdeas,
  
  // Stats
  getPostStats
}
