require("dotenv").config()

const fs = require("fs")
const path = require("path")
const OpenAI = require("openai")
const { createProductPage } = require("./websiteBuilder")
const { publishBlog } = require("./seoPublisher")

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

function ensureFolder(folder) {

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true })
  }

}

function slugify(text) {

  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

}

async function generateDescription(idea) {

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Write a short SaaS product description that sells the tool."
      },
      {
        role: "user",
        content: idea
      }
    ]
  })

  return res.choices[0].message.content

}

async function buildProductFromTopic(topic) {

  ensureFolder("products")

  const slug = slugify(topic)

  const productPath = path.join("products", `${slug}.json`)

  const description = await generateDescription(topic)

  const productData = {
    name: topic,
    slug: slug,
    description: description,
    price: 19,
    created: new Date().toISOString()
  }

  fs.writeFileSync(
    productPath,
    JSON.stringify(productData, null, 2)
  )

  console.log("Product data saved:", productPath)

  // Create website page
  await createProductPage(topic, description)

  return productData

}

await publishBlog(
"How AI helps businesses automate tasks",
slug
)

module.exports = {
  buildProductFromTopic
}
