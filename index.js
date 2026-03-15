require("dotenv").config()

const { Client, GatewayIntentBits } = require("discord.js")
const OpenAI = require("openai")

const { buildProductFromTopic } = require("./productBuilder")
const { createProductPage } = require("./websiteBuilder")
const { publishSEOArticle } = require("./seoPublisher")

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
})

async function sendLongMessage(channel, text) {

  const chunk = 1900

  for (let i = 0; i < text.length; i += chunk) {
    await channel.send(text.substring(i, i + chunk))
  }

}

async function createFullProductPipeline(topic) {

  try {

    console.log("Starting product build:", topic)

    const product = await buildProductFromTopic(topic)

    if (!product) {
      console.log("Product builder returned nothing")
      return
    }

    console.log("Creating product page")

    await createProductPage(product.name, product.description)

    console.log("Creating SEO article")

    await publishSEOArticle(product.name)

    console.log("Pipeline finished")

  } catch (err) {

    console.log("Pipeline error:", err)

  }

}

client.once("ready", () => {

  console.log(`Jordan AI online as ${client.user.tag}`)

})

client.on("messageCreate", async (message) => {

  console.log("Discord message:", message.content)

  if (message.author.bot) return

  const content = message.content.trim()

  if (content.startsWith("!product")) {

    const topic = content.replace("!product", "").trim()

    if (!topic) {
      message.reply("Please provide a product idea")
      return
    }

    await message.reply("Jordan AI building product...")

    await createFullProductPipeline(topic)

    await message.reply("Product, website page, and blog article created")

    return
  }

  try {

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are Jordan AI, an autonomous business builder." },
        { role: "user", content: content }
      ]
    })

    const reply = response.choices[0].message.content

    await sendLongMessage(message.channel, reply)

  } catch (err) {

    console.log("AI error:", err)

  }

})

client.login(process.env.DISCORD_TOKEN)
