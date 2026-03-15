require("dotenv").config()

const fs = require("fs")
const path = require("path")
const OpenAI = require("openai")
const { deploySite } = require("./githubDeploy")
const { publishBlog } = require("./seoPublisher")

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

function slugify(text){
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-|-$/g,"")
}

function ensureFolder(folder){
  if(!fs.existsSync(folder)){
    fs.mkdirSync(folder,{recursive:true})
  }
}

async function buildProductFromTopic(topic){

  const slug = slugify(topic)

  const res = await openai.chat.completions.create({
    model:"gpt-4o-mini",
    messages:[
      {
        role:"system",
        content:"Write a short landing page description for this AI product."
      },
      {
        role:"user",
        content:topic
      }
    ]
  })

  const description = res.choices[0].message.content

deploySite()

  // WEBSITE ROOT
  const WEBSITE_ROOT = path.join(__dirname,"website")

  const PRODUCTS_DIR = path.join(WEBSITE_ROOT,"products")
  const BLOG_DIR = path.join(WEBSITE_ROOT,"blog")

  ensureFolder(PRODUCTS_DIR)
  ensureFolder(BLOG_DIR)

  const productPath = path.join(PRODUCTS_DIR, slug + ".html")

  const html = `
<html>

<head>
<title>${topic}</title>
</head>

<body>

<h1>${topic}</h1>

<p>${description}</p>

<h2>AI Automation Tool</h2>

<p>Price: $99</p>

</body>

</html>
`

  fs.writeFileSync(productPath, html)

  console.log("Product page created:", productPath)

  // CREATE SEO BLOG ARTICLE
  await publishBlog(
    "How " + topic + " helps businesses",
    slug
  )

}

module.exports = { buildProductFromTopic }
