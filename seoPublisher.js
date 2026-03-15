require("dotenv").config()

const fs = require("fs")
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

async function generateArticle(topic){

const res = await openai.chat.completions.create({

model:"gpt-4o-mini",

messages:[
{
role:"system",
content:"Write an SEO optimized blog article that promotes an AI product."
},
{
role:"user",
content:topic
}
]

})

return res.choices[0].message.content

}

async function publishBlog(topic,productSlug){

const slug = slugify(topic)

const article = await generateArticle(topic)

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

const path = `website/blog/${slug}.html`

fs.writeFileSync(path,html)

console.log("Blog page created:",path)

}

module.exports = { publishBlog }
