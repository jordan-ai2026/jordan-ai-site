const OpenAI = require("openai")
const fs = require("fs")

const { createBlogPost } = require("./websiteBuilder")

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
})

function ensureFolder(path){
if(!fs.existsSync(path)){
fs.mkdirSync(path,{recursive:true})
}
}

async function runSEO(topic){

ensureFolder("articles")

const article=await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:"Write a long SEO blog article designed to rank on Google."
},
{
role:"user",
content:topic
}
]
})

const content=article.choices[0].message.content

const safe=topic.toLowerCase().replace(/[^a-z0-9]/g,"-")

fs.writeFileSync(`articles/${safe}.md`,content)

await createBlogPost(topic,content)

console.log("SEO article created:",topic)

}

module.exports={
runSEO
}
