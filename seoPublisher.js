require("dotenv").config()

const fs = require("fs")
const path = require("path")
const OpenAI = require("openai")

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

function slugify(text){
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-|-$/g,"")
}

async function publishBlog(topic, productSlug){

  const slug = slugify(topic)

  const res = await openai.chat.completions.create({
    model:"gpt-4o-mini",
    messages:[
      {
        role:"system",
        content:"Write a helpful SEO blog article recommending an AI automation tool."
      },
      {
        role:"user",
        content:topic
      }
    ]
  })

  const article = res.choices[0].message.content

  const html = `
<html>
<head>
<title>${topic}</title>
</head>

<body>

<h1>${topic}</h1>

<p>${article}</p>

<h2>Recommended Tool</h2>

<a href="/products/${productSlug}.html">
Try this AI tool
</a>

</body>
</html>
`

  // FORCE WEBSITE ROOT
  const WEBSITE_ROOT = path.join(__dirname, "website")

  const BLOG_DIR = path.join(WEBSITE_ROOT, "blog")

  // ensure blog folder exists
  if(!fs.existsSync(BLOG_DIR)){
    fs.mkdirSync(BLOG_DIR, { recursive:true })
  }

  const blogPath = path.join(BLOG_DIR, slug + ".html")

  fs.writeFileSync(blogPath, html)

  console.log("BLOG CREATED:", blogPath)

}

module.exports = { publishBlog }
module.exports = { publishBlog }