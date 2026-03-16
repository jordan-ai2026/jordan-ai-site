// ============================================
// JORDAN AI - TWITTER AUTO-POSTER
// Posts about new products automatically
// ============================================

require("dotenv").config()
const { TwitterApi } = require("twitter-api-v2")
const { quickWrite } = require("./aiBrain")

// ============================================
// INITIALIZE TWITTER CLIENT
// ============================================
function getTwitterClient() {
  if (!process.env.TWITTER_API_KEY || 
      !process.env.TWITTER_API_SECRET || 
      !process.env.TWITTER_ACCESS_TOKEN || 
      !process.env.TWITTER_ACCESS_SECRET) {
    return null
  }
  
  return new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  })
}

// ============================================
// CHECK IF TWITTER IS CONFIGURED
// ============================================
function isTwitterConfigured() {
  return !!(
    process.env.TWITTER_API_KEY && 
    process.env.TWITTER_API_SECRET && 
    process.env.TWITTER_ACCESS_TOKEN && 
    process.env.TWITTER_ACCESS_SECRET
  )
}

// ============================================
// POST TWEET
// ============================================
async function postTweet(text) {
  try {
    const client = getTwitterClient()
    if (!client) {
      console.log("⚠️ Twitter not configured")
      return { success: false, error: "Not configured" }
    }
    
    // Twitter limit is 280 characters
    const tweet = text.length > 280 ? text.substring(0, 277) + "..." : text
    
    const response = await client.v2.tweet(tweet)
    
    console.log(`🐦 Tweet posted: ${response.data.id}`)
    
    return {
      success: true,
      tweetId: response.data.id,
      text: tweet
    }
    
  } catch (err) {
    console.log("❌ Twitter error:", err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// POST ABOUT NEW PRODUCT
// Uses GPT to write engaging tweet
// ============================================
async function postProductLaunch(product) {
  try {
    console.log("🐦 Writing tweet for:", product.name)
    
    // Generate tweet using GPT (fast)
    const tweetText = await quickWrite(
      `Write a tweet announcing this new AI product launch:

Product: ${product.name}
Problem it solves: ${product.problem || "AI automation"}
Unique angle: ${product.uniqueAngle || "Built for results"}
Price: $${product.price}
Link: https://jordan-ai.co/products/${product.slug}.html

Requirements:
- Max 250 characters (leave room for link)
- Sound excited but not spammy
- Include 1-2 relevant emojis
- Don't use hashtags
- Create curiosity/urgency

Just return the tweet text, nothing else.`,
      "You write viral tweets. Short, punchy, curiosity-driven."
    )
    
    if (!tweetText) {
      console.log("❌ Failed to generate tweet")
      return { success: false, error: "Generation failed" }
    }
    
    // Add link if not included
    let finalTweet = tweetText.trim()
    const link = `https://jordan-ai.co/products/${product.slug}.html`
    
    if (!finalTweet.includes("jordan-ai.co")) {
      finalTweet = `${finalTweet}\n\n${link}`
    }
    
    return await postTweet(finalTweet)
    
  } catch (err) {
    console.log("❌ Product tweet error:", err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// POST THREAD (for longer content)
// ============================================
async function postThread(tweets) {
  try {
    const client = getTwitterClient()
    if (!client) {
      console.log("⚠️ Twitter not configured")
      return { success: false, error: "Not configured" }
    }
    
    let lastTweetId = null
    const postedTweets = []
    
    for (const tweet of tweets) {
      const options = lastTweetId 
        ? { reply: { in_reply_to_tweet_id: lastTweetId } }
        : {}
      
      const response = await client.v2.tweet(tweet, options)
      lastTweetId = response.data.id
      postedTweets.push(response.data)
    }
    
    console.log(`🐦 Thread posted: ${postedTweets.length} tweets`)
    
    return {
      success: true,
      tweets: postedTweets
    }
    
  } catch (err) {
    console.log("❌ Thread error:", err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// POST TIP/VALUE TWEET (for engagement)
// ============================================
async function postValueTweet(topic) {
  try {
    const tweetText = await quickWrite(
      `Write a valuable tip tweet about: ${topic}

Requirements:
- Give actionable advice about AI automation or building with AI
- Max 270 characters
- Sound like an expert sharing real insight
- Include 1 emoji
- No hashtags
- Make people want to follow for more

Just return the tweet text.`,
      "You're an AI automation expert sharing real insights."
    )
    
    if (!tweetText) return { success: false, error: "Generation failed" }
    
    return await postTweet(tweetText.trim())
    
  } catch (err) {
    console.log("❌ Value tweet error:", err.message)
    return { success: false, error: err.message }
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  postTweet,
  postProductLaunch,
  postThread,
  postValueTweet,
  isTwitterConfigured
}
