require("dotenv").config()
const fs = require("fs")
const path = require("path")
const OpenAI = require("openai")
const { createStripeProduct, isStripeConfigured } = require("./stripeHelper")

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

async function buildProductFromTopic(topic) {
  try {
    const slug = slugify(topic)
    const price = 99 // Default price
    
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Write a short landing page description for this AI product. 2-3 sentences."
        },
        {
          role: "user",
          content: topic
        }
      ]
    })
    
    const description = res.choices[0].message.content
    
    console.log("Product built:", topic)
    
    // Create Stripe product if configured
    let paymentLink = null
    if (isStripeConfigured()) {
      const stripeResult = await createStripeProduct(topic, description, price)
      if (stripeResult.success) {
        paymentLink = stripeResult.paymentLink
      }
    } else {
      console.log("⚠️ Stripe not configured - no payment link created")
    }
    
    return {
      name: topic,
      slug: slug,
      description: description,
      price: price,
      paymentLink: paymentLink
    }
    
  } catch (err) {
    console.log("Product builder error:", err)
    return null
  }
}

module.exports = { buildProductFromTopic }
