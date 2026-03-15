const OpenAI = require("openai")
const fs = require("fs")

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
})

function ensureFolder(path){
if(!fs.existsSync(path)){
fs.mkdirSync(path,{recursive:true})
}
}

async function buildProductFromTopic(topic){

ensureFolder("products")

const safe=topic.toLowerCase().replace(/[^a-z0-9]/g,"-").slice(0,50)

const folder=`products/${safe}`

ensureFolder(folder)

const product=await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:"Create a digital AI automation product that businesses would pay for."
},
{
role:"user",
content:topic
}
]
})

const description=product.choices[0].message.content

fs.writeFileSync(`${folder}/product.md`,description)

console.log("Product created:",topic)

return{
name:topic,
description:description
}

}

module.exports={
buildProductFromTopic
}
