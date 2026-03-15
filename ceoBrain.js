require("dotenv").config()
const axios = require("axios")
const fs = require("fs")

const OPENAI_KEY = process.env.OPENAI_KEY

async function generateBusinessIdea(){

const prompt = `
You are the CEO of an autonomous AI startup.

Your goal is to build profitable AI tools for businesses.

Generate ONE business opportunity with:

Industry
Problem
AI Solution
Revenue model
Target customer
`

const res = await axios.post("https://api.openai.com/v1/chat/completions",{

model:"gpt-4o-mini",

messages:[
{role:"system",content:"You are an AI founder building profitable startups."},
{role:"user",content:prompt}
]

},{
headers:{
Authorization:`Bearer ${OPENAI_KEY}`
}
})

return res.data.choices[0].message.content
}

function saveProject(idea){

const folder = `memory/projects/project-${Date.now()}`

fs.mkdirSync(folder,{recursive:true})

fs.writeFileSync(`${folder}/summary.md`,idea)

console.log("New project created:",folder)

}

async function createNewProject(){

const idea = await generateBusinessIdea()

saveProject(idea)

}

module.exports = { createNewProject }