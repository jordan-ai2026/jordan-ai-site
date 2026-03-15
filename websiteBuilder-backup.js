const fs = require("fs")
const path = require("path")

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

async function createProductPage(name, description) {

  try {

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")

    const productDir = path.join(__dirname, "website", "products")

    ensureDir(productDir)

    const filePath = path.join(productDir, `${slug}.html`)

    const html = `
<html>
<head>
<title>${name}</title>
<meta name="description" content="${description}">
</head>

<body>

<h1>${name}</h1>

<p>${description}</p>

<a href="/">Back to Home</a>

</body>
</html>
`

    fs.writeFileSync(filePath, html)

    console.log("Product page created:", filePath)

  } catch (err) {

    console.log("Website builder error:", err)

  }

}

module.exports = {
  createProductPage
}
