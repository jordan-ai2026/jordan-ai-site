const fs = require("fs")
const simpleGit = require("simple-git")
const { createCheckout } = require("./payments")

const git = simpleGit()

function ensureFolder(path){
if(!fs.existsSync(path)){
fs.mkdirSync(path,{recursive:true})
}
}

// CREATE PRODUCT PAGE
function createProductPage(name,description){

return new Promise(async (resolve,reject)=>{

try{

const safe=name.toLowerCase().replace(/[^a-z0-9]/g,"-").slice(0,50)

ensureFolder("website/products")

// CREATE STRIPE CHECKOUT
const checkout = await createCheckout(name,9900)

const html = `

<html>

<head>
<title>${name}</title>
<meta name="description" content="${description}">
</head>

<body style="font-family:Arial;max-width:800px;margin:auto;padding:40px">

<h1>${name}</h1>

<p>${description}</p>

<h2>$99 Automation</h2>

<a href="${checkout}">
<button style="padding:15px;font-size:18px">
Start Automation
</button>
</a>

</body>

</html>
`

fs.writeFileSync(`website/products/${safe}.html`,html)

console.log("Created product page:",safe)

await deploySite()

resolve()

}catch(err){

console.log("Website builder error:",err)
reject(err)

}

})

}

// CREATE BLOG PAGE
function createBlogPost(title,article){

return new Promise(async (resolve,reject)=>{

try{

const safe=title.toLowerCase().replace(/[^a-z0-9]/g,"-").slice(0,50)

ensureFolder("website/blog")

const html = `

<html>

<head>
<title>${title}</title>
</head>

<body style="font-family:Arial;max-width:900px;margin:auto;padding:40px">

<h1>${title}</h1>

${article}

<hr>

<h2>Automate This With Jordan AI</h2>

<a href="/products">
<button style="padding:15px;font-size:18px">
View Automation Tools
</button>
</a>

</body>

</html>
`

fs.writeFileSync(`website/blog/${safe}.html`,html)

console.log("Created blog page:",safe)

await deploySite()

resolve()

}catch(err){

console.log("Blog builder error:",err)
reject(err)

}

})

}

// DEPLOY WEBSITE
async function deploySite(){

try{

await git.add("./*")

await git.commit("Jordan AI autonomous website update")

await git.push()

console.log("Website deployed to GitHub / Vercel")

}catch(err){

console.log("Deploy error:",err)

}

}

module.exports={
createProductPage,
createBlogPost
}

