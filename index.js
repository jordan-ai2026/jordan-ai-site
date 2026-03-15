require("dotenv").config()
require("./seoPublisher")
require("./companyLoop")

const { Client, GatewayIntentBits } = require("discord.js")
const OpenAI = require("openai")
const fs = require("fs")

const { createProductPage } = require("./websiteBuilder")
const { runSEO } = require("./seoPublisher")

// CHANNEL IDS
const TALK_CHANNEL = "1481760050581082112"
const REPORT_CHANNEL = "1481759783177425059"
const AGENT_CHANNEL = "1481760155484815451"
const BUSINESS_CHANNEL = "1482428930341339419"
const PLAN_CHANNEL = "1482429289134817431"

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
})

const client = new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
]
})

let conversationHistory=[]

function ensureFolder(path){
if(!fs.existsSync(path)){
fs.mkdirSync(path,{recursive:true})
}
}

async function sendLongMessage(channel,text){

const chunk=1900

for(let i=0;i<text.length;i+=chunk){
await channel.send(text.substring(i,i+chunk))
}

}

// AI PRODUCT BUILDER
async function buildProduct(topic){

const res = await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:"Create a short SaaS product description."
},
{
role:"user",
content:topic
}
]
})

const desc=res.choices[0].message.content

await createProductPage(topic,desc)

return desc

}

// AGENT MARKET SCAN
async function scanMarket(){

const industries=[
"roofers",
"dentists",
"law firms",
"real estate",
"gyms",
"restaurants"
]

const industry=industries[Math.floor(Math.random()*industries.length)]

const res=await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:"Find a profitable AI automation opportunity."
},
{
role:"user",
content:industry
}
]
})

return res.choices[0].message.content

}

// AUTONOMOUS AGENTS
async function runAgents(){

const channel=await client.channels.fetch(AGENT_CHANNEL)

const opportunity=await scanMarket()

await sendLongMessage(channel,
`Jordan AI Market Scan

${opportunity}`
)

}

// HEARTBEAT LOOP
function startHeartbeat(){

setInterval(async()=>{

try{

await runAgents()

const channel=await client.channels.fetch(REPORT_CHANNEL)

const report=await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:"Write a short AI CEO report about business building progress."
}
]
})

await sendLongMessage(channel,
`Jordan AI Report

${report.choices[0].message.content}`
)

}catch(err){

console.log("Heartbeat error",err)

}

},1800000)

}

// READY EVENT
client.once("ready",()=>{

console.log(`Jordan-AI online as ${client.user.tag}`)

startHeartbeat()

})

// MESSAGE HANDLER
client.on("messageCreate",async message=>{

if(message.author.bot) return

// PRODUCT COMMAND
if(message.content.startsWith("!product")){

const topic=message.content.replace("!product","").trim()

if(!topic){
message.reply("Give me a product idea after !product")
return
}

message.reply("Jordan AI is building your product...")

try{

const desc = await buildProduct(topic)

message.reply(
`Product created

Name: ${topic}

Description:
${desc}

Website page and checkout created.`
)

}catch(err){

console.log(err)
message.reply("Error building product.")

}

return
}

// NORMAL AI CHAT
if(message.channel.id===TALK_CHANNEL){

conversationHistory.push({
role:"user",
content:message.content
})

const res=await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:conversationHistory
})

const reply=res.choices[0].message.content

conversationHistory.push({
role:"assistant",
content:reply
})

await sendLongMessage(message.channel,reply)

}

})

client.login(process.env.DISCORD_TOKEN)

