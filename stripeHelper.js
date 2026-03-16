// ============================================
// JORDAN AI - STRIPE HELPER
// Creates products and payment links
// ============================================

require("dotenv").config()
const Stripe = require("stripe")

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_KEY)

// ============================================
// CREATE PRODUCT WITH PAYMENT LINK
// ============================================
async function createStripeProduct(name, description, priceInDollars, slug = null) {
  try {
    console.log(`💳 Creating Stripe product: ${name}`)
    
    // 1. Create the product in Stripe
    const product = await stripe.products.create({
      name: name,
      description: description,
    })
    
    console.log(`   Product created: ${product.id}`)
    
    // 2. Create a price for the product (Stripe uses cents)
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: priceInDollars * 100, // Convert to cents
      currency: "usd",
    })
    
    console.log(`   Price created: ${price.id}`)
    
    // 3. Create a payment link - redirect to delivery page if slug provided
    const redirectUrl = slug 
      ? `https://jordan-ai.co/download/${slug}.html`
      : "https://jordan-ai.co/thank-you.html"
    
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      after_completion: {
        type: "redirect",
        redirect: {
          url: redirectUrl,
        },
      },
    })
    
    console.log(`   Payment link: ${paymentLink.url}`)
    console.log(`   Delivers to: ${redirectUrl}`)
    
    return {
      success: true,
      productId: product.id,
      priceId: price.id,
      paymentLink: paymentLink.url,
      price: priceInDollars
    }
    
  } catch (err) {
    console.log("❌ Stripe error:", err.message)
    return {
      success: false,
      error: err.message
    }
  }
}

// ============================================
// CHECK IF STRIPE IS CONFIGURED
// ============================================
function isStripeConfigured() {
  return !!process.env.STRIPE_KEY
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  createStripeProduct,
  isStripeConfigured
}
