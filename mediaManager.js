// ============================================
// JORDAN AI — MEDIA MANAGER
// Checks for client-uploaded images ONLY.
// NEVER uses Unsplash, Pexels, or any stock photos.
//
// If a client image exists → return its path.
// If no client image exists → return null.
// Empty slots must be filled by the client uploading real photos.
//
// Usage:
//   const media = await fetchClientMedia(slug, industry, options)
//   → { hero, about, services: [...], video: null }
//      Each value is a local path string or null.
// ============================================

require("dotenv").config()
const fs   = require("fs")
const path = require("path")
const https = require("https")
const http  = require("http")

const CLIENTS_DIR = path.join(__dirname, "website", "clients")

// ============================================
// HELPERS
// ============================================

// Minimal HTTP GET that follows one level of redirect
// Kept for downloading client-provided image URLs
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http
    lib.get(url, { headers: { "User-Agent": "JordanAI/1.0" } }, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return httpGet(res.headers.location).then(resolve).catch(reject)
      }
      let data = ""
      res.on("data", chunk => { data += chunk })
      res.on("end",  () => resolve({ status: res.statusCode, body: data, headers: res.headers }))
    }).on("error", reject)
  })
}

// Download a binary file (image) to disk, following redirects
// Used when client provides a direct image URL to save locally
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http
    const req = lib.get(url, { headers: { "User-Agent": "JordanAI/1.0" } }, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const dir = path.dirname(destPath)
      fs.mkdirSync(dir, { recursive: true })
      const file = fs.createWriteStream(destPath)
      res.pipe(file)
      file.on("finish", () => { file.close(); resolve(destPath) })
      file.on("error",  err => { fs.unlink(destPath, () => {}); reject(err) })
    })
    req.on("error", reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Download timeout")) })
  })
}

// ============================================
// FETCH CLIENT MEDIA (main export)
// ONLY returns paths to client-uploaded images.
// Returns null for any slot with no client image.
// ============================================
async function fetchClientMedia(slug, industry, options = {}) {
  const { numServices = 4 } = options

  // Check the legacy images/ folder for already-downloaded files
  const imagesDir = path.join(CLIENTS_DIR, slug, "images")

  function localImagePath(filename) {
    const fullPath = path.join(imagesDir, filename)
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).size > 100) {
      return `./images/${filename}`
    }
    return null
  }

  const result = {
    hero:     localImagePath("hero.jpg"),
    about:    localImagePath("about.jpg"),
    services: [],
    video:    null,
    credits:  [],
    source:   "client-only",
  }

  const svcCount = Math.min(numServices, 6)
  for (let i = 0; i < svcCount; i++) {
    result.services.push(localImagePath(`service-${i + 1}.jpg`))
  }

  const heroStatus    = result.hero  ? "✓" : "⚠️  NO IMAGE"
  const aboutStatus   = result.about ? "✓" : "⚠️  NO IMAGE"
  const svcFound      = result.services.filter(Boolean).length
  console.log(`📸 Client media check for ${slug}: hero ${heroStatus} | about ${aboutStatus} | ${svcFound}/${svcCount} service imgs`)
  if (!result.hero || !result.about) {
    console.log(`   ⚠️  Missing images will show as placeholders. Upload client photos to fix.`)
  }

  return result
}

// ============================================
// GET EMPTY MEDIA (replaces old getCuratedMedia)
// Returns null for all slots — no stock photos.
// ============================================
function getCuratedMedia(industry, numServices = 6) {
  console.log(`⚠️  getCuratedMedia called — returning empty media (no stock photos allowed)`)
  return {
    hero:     null,
    about:    null,
    services: Array(Math.min(numServices, 6)).fill(null),
    video:    null,
    source:   "none",
  }
}

// ============================================
// STATUS
// ============================================
function getMediaStatus() {
  return {
    unsplash: false,
    pexels:   false,
    note:     "Stock photos disabled. Only client-uploaded images are used.",
  }
}

function isUnsplashConfigured() { return false }
function isPexelsConfigured()   { return false }

function normaliseIndustry(industry = "") {
  const ind = industry.toLowerCase()
  if (ind.includes("landscap") || ind.includes("lawn"))     return "landscaping"
  if (ind.includes("clean") || ind.includes("maid"))         return "cleaning"
  if (ind.includes("bounce") || ind.includes("inflatable") ||
      ind.includes("jumper") || ind.includes("moonwalk"))    return "bounce house"
  if (ind.includes("party") || ind.includes("rental") ||
      ind.includes("carnival"))                              return "party"
  if (ind.includes("dent"))                                  return "dental"
  if (ind.includes("legal") || ind.includes("law") ||
      ind.includes("attorn"))                                return "legal"
  if (ind.includes("account") || ind.includes("cpa") ||
      ind.includes("tax"))                                   return "accounting"
  if (ind.includes("restaurant") || ind.includes("cafe") ||
      ind.includes("food") || ind.includes("bar") ||
      ind.includes("pizza") || ind.includes("sushi"))        return "restaurant"
  if (ind.includes("roof"))                                  return "roofing"
  if (ind.includes("plumb"))                                 return "plumbing"
  if (ind.includes("paint"))                                 return "painting"
  if (ind.includes("contractor") || ind.includes("construct") ||
      ind.includes("remodel") || ind.includes("handyman"))   return "contractor"
  return "default"
}

function formatCredits() { return "" }

// ============================================
// EXPORTS
// ============================================
module.exports = {
  fetchClientMedia,
  getCuratedMedia,
  formatCredits,
  getMediaStatus,
  isUnsplashConfigured,
  isPexelsConfigured,
  normaliseIndustry,
  downloadFile,
  httpGet,
}
