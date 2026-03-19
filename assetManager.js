// ============================================
// JORDAN AI — CLIENT ASSET MANAGER
// Handles client-provided logos, photos, videos
//
// Folder structure per client:
//   website/clients/[slug]/
//   ├── index.html
//   ├── site.json          (generation config for re-render)
//   ├── assets.json        (placement map: location → relUrl)
//   ├── assets/
//   │   ├── images/
//   │   │   ├── hero/      ← background images
//   │   │   ├── about/     ← about section photos
//   │   │   ├── services/  ← service card photos
//   │   │   ├── gallery/   ← portfolio/gallery images
//   │   │   ├── team/      ← staff photos
//   │   │   └── misc/      ← anything else
//   │   ├── videos/
//   │   │   ├── hero/      ← background video loops
//   │   │   └── content/   ← other videos
//   │   └── logo/
//   │       ├── main.png   ← primary logo
//   │       ├── white.png  ← white/reversed logo
//   │       └── favicon.ico
//   ├── css/               ← custom styles (if needed)
//   └── js/                ← custom scripts (if needed)
//
// Asset type → subfolder map:
//   "hero"          → assets/images/hero/
//   "about"         → assets/images/about/
//   "service"       → assets/images/services/
//   "gallery"       → assets/images/gallery/
//   "team"          → assets/images/team/
//   "misc"          → assets/images/misc/
//   "video-hero"    → assets/videos/hero/
//   "video-content" → assets/videos/content/
//   "logo"          → assets/logo/
//
// Priority in websiteGenerator.js:
//   1. Client assets (assets.json placements)
//   2. Unsplash API images
//   3. Curated CDN fallbacks
// ============================================

const fs    = require("fs")
const path  = require("path")
const http  = require("http")
const https = require("https")

const CLIENTS_DIR = path.join(__dirname, "website", "clients")

// ── SUBFOLDER MAP ─────────────────────────────
// Maps upload type to the correct subdirectory under assets/

const ASSET_PATHS = {
  // Images
  hero:            path.join("assets", "images", "hero"),
  about:           path.join("assets", "images", "about"),
  service:         path.join("assets", "images", "services"),
  gallery:         path.join("assets", "images", "gallery"),
  team:            path.join("assets", "images", "team"),
  misc:            path.join("assets", "images", "misc"),
  // Videos
  "video-hero":    path.join("assets", "videos", "hero"),
  "video-content": path.join("assets", "videos", "content"),
  // Logo
  logo:            path.join("assets", "logo"),
  // Legacy aliases (backwards compat with old code)
  image:           path.join("assets", "images", "misc"),
  video:           path.join("assets", "videos", "content"),
}

// All directories to create when scaffolding a new client
const ALL_CLIENT_DIRS = [
  path.join("assets", "images", "hero"),
  path.join("assets", "images", "about"),
  path.join("assets", "images", "services"),
  path.join("assets", "images", "gallery"),
  path.join("assets", "images", "team"),
  path.join("assets", "images", "misc"),
  path.join("assets", "videos", "hero"),
  path.join("assets", "videos", "content"),
  path.join("assets", "logo"),
  "css",
  "js",
]

// ── SCAFFOLD CLIENT FOLDERS ───────────────────
/**
 * Create the full folder structure for a new client.
 * Safe to call on existing clients — already-existing dirs are skipped.
 */
function createClientFolders(slug) {
  const clientDir = path.join(CLIENTS_DIR, slug)
  for (const rel of ALL_CLIENT_DIRS) {
    fs.mkdirSync(path.join(clientDir, rel), { recursive: true })
  }
}

// ── PATH HELPERS ──────────────────────────────

function clientDir(slug) {
  return path.join(CLIENTS_DIR, slug)
}

function assetsJsonPath(slug) {
  return path.join(CLIENTS_DIR, slug, "assets.json")
}

function siteJsonPath(slug) {
  return path.join(CLIENTS_DIR, slug, "site.json")
}

// ── READ / WRITE ASSETS.JSON ──────────────────

function getClientAssets(slug) {
  const p = assetsJsonPath(slug)
  if (!fs.existsSync(p)) return {}
  try { return JSON.parse(fs.readFileSync(p, "utf8")) } catch { return {} }
}

function saveClientAssets(slug, data) {
  const p = assetsJsonPath(slug)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8")
}

// ── FILE DOWNLOAD ─────────────────────────────

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    const lib = url.startsWith("https") ? https : http
    const req = lib.get(url, { timeout: 30000 }, res => {
      // Follow one redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`))
      const out = fs.createWriteStream(destPath)
      res.pipe(out)
      out.on("finish", () => { out.close(); resolve(destPath) })
      out.on("error", reject)
    })
    req.on("error", reject)
    req.on("timeout", () => { req.destroy(); reject(new Error("Download timed out")) })
  })
}

// ── UPLOAD ASSET ──────────────────────────────
/**
 * Download a URL or copy a local file to the correct subfolder.
 *
 * @param {string} slug     - client slug e.g. "green-peak-landscaping"
 * @param {string} type     - one of: hero | about | service | gallery | team | misc |
 *                            video-hero | video-content | logo
 * @param {string} source   - URL to download or absolute local path
 * @param {string} [name]   - override filename (e.g. "main.png"). Auto-generated if omitted.
 *
 * @returns {{ success, slug, type, filename, localPath, relUrl, subfolder }}
 */
async function uploadClientAsset(slug, type, source, name = null) {
  if (!slug)   throw new Error("slug is required")
  if (!source) throw new Error("source URL or file path is required")

  const subfolder = ASSET_PATHS[type]
  if (!subfolder) {
    throw new Error(
      `Unknown type "${type}". Valid types: ${Object.keys(ASSET_PATHS).filter(k => !["image","video"].includes(k)).join(", ")}`
    )
  }

  const destDir = path.join(CLIENTS_DIR, slug, subfolder)
  fs.mkdirSync(destDir, { recursive: true })

  // Determine filename
  let filename = name
  if (!filename) {
    const rawExt = source.split("?")[0].split(".").pop().toLowerCase()
    const ext = ["jpg","jpeg","png","webp","gif","mp4","mov","webm","ico"].includes(rawExt) ? rawExt : "jpg"
    if (type === "logo") {
      filename = `main.${ext}`
    } else if (type.startsWith("video")) {
      filename = `${type.replace("video-","")}-${Date.now()}.${ext}`
    } else {
      filename = `${type}-${Date.now()}.${ext}`
    }
  }

  const destPath = path.join(destDir, filename)

  // Download or copy
  if (source.startsWith("http://") || source.startsWith("https://")) {
    await downloadFile(source, destPath)
  } else {
    if (!fs.existsSync(source)) throw new Error(`File not found: ${source}`)
    fs.copyFileSync(source, destPath)
  }

  // Build the relative URL used in HTML (uses forward slashes for web)
  const relUrl = `/clients/${slug}/${subfolder.replace(/\\/g, "/")}/${filename}`

  return { success: true, slug, type, subfolder, filename, localPath: destPath, relUrl }
}

// ── FIND ASSET BY FILENAME ────────────────────
/**
 * Search all asset subfolders for a file by name.
 * Returns the relative URL if found, null otherwise.
 */
function findAsset(slug, filename) {
  const assetsRoot = path.join(CLIENTS_DIR, slug, "assets")
  if (!fs.existsSync(assetsRoot)) return null

  // Walk every subfolder recursively
  function walk(dir) {
    if (!fs.existsSync(dir)) return null
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        const found = walk(fullPath)
        if (found) return found
      } else if (entry === filename) {
        // Convert absolute path to relative URL
        const rel = path.relative(path.join(CLIENTS_DIR, slug), fullPath)
        return `/clients/${slug}/${rel.replace(/\\/g, "/")}`
      }
    }
    return null
  }

  return walk(assetsRoot)
}

// ── PLACE ASSET ON SITE ───────────────────────
/**
 * Map an uploaded filename to a site location, save to assets.json,
 * then re-render + deploy the site using stored site.json options.
 *
 * @param {string} slug      - client slug
 * @param {string} filename  - e.g. "main.png" or "hero-1234567890.jpg"
 * @param {string} location  - "hero"|"about"|"logo"|"service1"..."service6"
 */
async function placeAssetOnSite(slug, filename, location) {
  if (!fs.existsSync(clientDir(slug))) {
    throw new Error(`Client site not found: ${slug}`)
  }

  const siteJsonFile = siteJsonPath(slug)
  if (!fs.existsSync(siteJsonFile)) {
    throw new Error(`site.json missing for "${slug}" — run create_client_website first to generate it`)
  }

  // ── PROTECTION CHECK ────────────────────────────────────────────────────
  try {
    const siteData = JSON.parse(fs.readFileSync(siteJsonFile, 'utf8'))
    if (siteData.protected) {
      console.log(`[AssetManager] ⛔ ${slug} is protected — asset placed in folder but site NOT rebuilt.`)
      // Still save the asset to disk — just skip the template rebuild
      // Return early after saving
      const assetPath = findAsset(slug, filename)
      if (!assetPath) throw new Error(`Asset not found: ${filename}`)
      console.log(`[AssetManager] Asset saved: ${filename} (site rebuild skipped — protected)`)
      return { success: true, protected: true, message: `Asset saved. Site is protected — Cleo manages ${slug} manually.` }
    }
  } catch (e) {
    if (e.message?.includes('protected')) throw e
    // If can't parse site.json, proceed normally
  }

  const validLocations = [
    "hero","about","logo",
    "service1","service2","service3","service4","service5","service6",
    "gallery","team",
  ]
  if (!validLocations.includes(location)) {
    throw new Error(`location must be one of: ${validLocations.join(", ")}`)
  }

  // Find the file anywhere under assets/
  const relUrl = findAsset(slug, filename)
  if (!relUrl) {
    throw new Error(`"${filename}" not found under ${slug}/assets/ — upload it first with upload_client_assets`)
  }

  // Save placement
  const assets = getClientAssets(slug)
  assets[location] = relUrl
  assets.updatedAt = new Date().toISOString()
  saveClientAssets(slug, assets)

  // Re-render (lazy require avoids circular dep with websiteGenerator)
  const websiteGenerator = require("./websiteGenerator")
  const siteOptions = JSON.parse(fs.readFileSync(siteJsonFile, "utf8"))
  // Always re-render with deploy:false (we deploy ourselves below)
  const result = await websiteGenerator.createClientWebsite({ ...siteOptions, deploy: false })

  // Always deploy after placing an asset — site.json stores deploy:false as a backup
  // config and should never gate whether a live update gets pushed
  let deployed = false
  try {
    const { deployWebsite } = require("./gitDeploy")
    await deployWebsite(`Asset update: ${filename} → ${location} on ${slug}`)
    deployed = true
  } catch (err) {
    console.log(`   ⚠️  Deploy failed after asset placement: ${err.message}`)
  }

  return {
    success:    true,
    slug,
    location,
    relUrl,
    filename,
    rerendered: result.success,
    deployed,
    url:        result.url,
  }
}

// ── LIST ASSETS ───────────────────────────────
/**
 * List all uploaded assets for a client, grouped by subfolder.
 * Returns placements from assets.json alongside the raw files.
 */
function listClientAssets(slug) {
  const assetsRoot = path.join(CLIENTS_DIR, slug, "assets")
  const placements = getClientAssets(slug)

  // Walk the tree and group files by their immediate parent subfolder path
  const tree = {}

  function walk(dir, relBase) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith(".")) continue
      const fullPath = path.join(dir, entry)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        walk(fullPath, relBase ? `${relBase}/${entry}` : entry)
      } else {
        const key = relBase || "(root)"
        if (!tree[key]) tree[key] = []
        tree[key].push(entry)
      }
    }
  }

  walk(assetsRoot, "")

  return { slug, tree, placements }
}

// ── IMAGE → BASE64 ────────────────────────────
/**
 * Download an image URL and return { base64, mediaType }.
 * Used to send images to Claude vision API.
 */
function imageUrlToBase64(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http
    lib.get(url, { timeout: 20000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return imageUrlToBase64(res.headers.location).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} fetching image`))

      // Detect media type from content-type or URL
      const ct = res.headers["content-type"] || ""
      let mediaType = "image/jpeg"
      if (ct.includes("png"))  mediaType = "image/png"
      if (ct.includes("gif"))  mediaType = "image/gif"
      if (ct.includes("webp")) mediaType = "image/webp"
      // Also check URL extension as fallback
      const urlLower = url.split("?")[0].toLowerCase()
      if (urlLower.endsWith(".png"))  mediaType = "image/png"
      if (urlLower.endsWith(".gif"))  mediaType = "image/gif"
      if (urlLower.endsWith(".webp")) mediaType = "image/webp"

      const chunks = []
      res.on("data", c => chunks.push(c))
      res.on("end",  () => resolve({ base64: Buffer.concat(chunks).toString("base64"), mediaType }))
      res.on("error", reject)
    }).on("error", reject)
      .on("timeout", () => reject(new Error("Image download timed out")))
  })
}

// ── EXPORTS ───────────────────────────────────

module.exports = {
  createClientFolders,
  uploadClientAsset,
  placeAssetOnSite,
  listClientAssets,
  getClientAssets,
  findAsset,
  siteJsonPath,
  imageUrlToBase64,
  ASSET_PATHS,
}
