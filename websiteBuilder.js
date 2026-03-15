const fs = require("fs")
const path = require("path")

async function createProductPage(name, description) {

const slug = name
.toLowerCase()
.replace(/[^a-z0-9]+/g,"-")
.replace(/^-|-$/g,"")

const dir = path.join(__dirname,"products")

if(!fs.existsSync(dir)){
fs.mkdirSync(dir)
}

const file = path.join(dir,`${slug}.html`)

const html = `
<html>
<head>
<title>${name}</title>
</head>

<body>

<h1>${name}</h1>

<p>${description}</p>

<button>Buy Now</button>

</body>
</html>
`

fs.writeFileSync(file,html)

console.log("Product page created:",file)

}

module.exports = { createProductPage }

