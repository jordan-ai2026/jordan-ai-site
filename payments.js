const Stripe = require("stripe")

const stripe = new Stripe(process.env.STRIPE_KEY)

async function createCheckout(name,price){

try{

const session = await stripe.checkout.sessions.create({

payment_method_types:["card"],

line_items:[
{
price_data:{
currency:"usd",
product_data:{
name:name
},
unit_amount:price
},
quantity:1
}
],

mode:"payment",

success_url:"https://jordan-ai.co/success",
cancel_url:"https://jordan-ai.co/cancel"

})

return session.url

}catch(err){

console.log("Stripe error",err)

}

}

module.exports={
createCheckout
}
