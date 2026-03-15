require("dotenv").config()
const Stripe = require("stripe")

const stripe = new Stripe(process.env.STRIPE_KEY)

async function createStripeProduct(name,price){

const product = await stripe.products.create({
name:name
})

const priceObj = await stripe.prices.create({
unit_amount:price * 100,
currency:"usd",
product:product.id
})

const link = await stripe.paymentLinks.create({
line_items:[
{
price:priceObj.id,
quantity:1
}
]
})

return link.url

}

module.exports = { createStripeProduct }