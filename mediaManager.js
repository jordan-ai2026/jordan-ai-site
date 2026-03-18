// ============================================
// JORDAN AI — MEDIA MANAGER
// Fetches industry-relevant photos/videos for
// client websites. Works in two modes:
//
//   WITH API KEY  — searches Unsplash/Pexels,
//                   picks best result, downloads
//                   to website/clients/[slug]/images/
//
//   WITHOUT KEY   — uses hand-curated Unsplash
//                   photo IDs selected per industry
//                   (no downloads, just CDN URLs)
//
// Usage:
//   const media = await fetchClientMedia(slug, industry)
//   → { hero, about, services: [...], video: null }
//
// API keys (add to .env):
//   UNSPLASH_ACCESS_KEY — unsplash.com/developers
//   PEXELS_API_KEY      — pexels.com/api
// ============================================

require("dotenv").config()
const fs    = require("fs")
const path  = require("path")
const https = require("https")
const http  = require("http")

const CLIENTS_DIR = path.join(__dirname, "website", "clients")
const UNSPLASH_BASE = "https://api.unsplash.com"
const PEXELS_BASE   = "https://api.pexels.com"

// ============================================
// INDUSTRY → SEARCH QUERIES
// Per category: hero, about, service photos
// ============================================
const INDUSTRY_QUERIES = {
  landscaping: {
    hero:     ["green lawn professional landscaping", "lush garden landscape beautiful"],
    about:    ["landscaping crew working outdoors", "lawn care team professional"],
    services: [
      "lawn mowing grass cutting",
      "garden planting flowers landscaping",
      "sprinkler irrigation system lawn",
      "fall cleanup leaves yard raking",
      "mulch garden bed landscaping",
      "hedge trimming shrubs professional",
    ],
    video:    ["landscaping lawn mowing", "garden landscape"],
  },
  cleaning: {
    hero:     ["bright clean modern home interior", "professional house cleaning"],
    about:    ["cleaning service team professional", "maid service cleaning"],
    services: [
      "kitchen cleaning sparkling",
      "bathroom cleaning scrubbing tile",
      "office cleaning professional workspace",
      "deep cleaning home baseboards",
    ],
    video:    ["house cleaning professional", "clean home"],
  },
  "bounce house": {
    hero:     ["colorful inflatable bounce house party", "kids birthday party outdoor"],
    about:    ["children playing birthday party backyard", "kids party celebration colorful"],
    services: [
      "bounce house inflatable kids",
      "water slide inflatable summer",
      "tables chairs party outdoor setup",
      "obstacle course inflatable kids",
      "party tent rental outdoor event",
      "birthday party decoration celebration",
    ],
    video:    ["kids birthday party", "bounce house children"],
  },
  party: {
    hero:     ["colorful birthday party celebration kids", "festive party outdoor event"],
    about:    ["happy family birthday party backyard", "kids party celebration fun"],
    services: [
      "bounce house inflatable birthday",
      "water slide kids summer",
      "party tables chairs rental setup",
      "inflatable obstacle course kids",
      "birthday party tent outdoor",
      "kids celebration party decorations",
    ],
    video:    ["kids birthday party celebration", "party outdoor"],
  },
  dental: {
    hero:     ["modern dental office bright clean", "dentist office professional"],
    about:    ["friendly dentist patient smile", "dental team professional office"],
    services: [
      "teeth cleaning dental hygiene",
      "dental xray examination",
      "teeth whitening smile bright",
      "dental crown procedure",
    ],
    video:    ["dental office modern", "dentist professional"],
  },
  legal: {
    hero:     ["law office professional modern interior", "lawyer attorney professional"],
    about:    ["lawyer attorney consultation client", "law firm professional team"],
    services: [
      "legal documents contract law",
      "courtroom justice law",
      "lawyer consultation office",
      "legal scales justice",
    ],
    video:    ["law office professional", "attorney lawyer"],
  },
  accounting: {
    hero:     ["modern accounting office professional", "financial advisor professional"],
    about:    ["accountant financial advisor client", "accounting team professional"],
    services: [
      "tax documents accounting spreadsheet",
      "financial planning charts graphs",
      "business accounting laptop numbers",
      "bookkeeping documents filing",
    ],
    video:    ["accounting financial professional", "business finance"],
  },
  restaurant: {
    hero:     ["beautiful restaurant interior dining", "cozy restaurant atmosphere evening"],
    about:    ["chef cooking kitchen professional", "restaurant team staff smiling"],
    services: [
      "delicious food plating restaurant",
      "fresh ingredients cooking food",
      "restaurant bar cocktails drinks",
      "dessert pastry bakery food",
    ],
    video:    ["restaurant dining beautiful", "chef cooking kitchen"],
  },
  contractor: {
    hero:     ["construction site professional workers", "home renovation contractor working"],
    about:    ["contractor construction team working", "professional builder renovation"],
    services: [
      "home renovation kitchen remodel",
      "construction framing building",
      "roofing contractor roof repair",
      "flooring installation hardwood",
    ],
    video:    ["construction contractor professional", "home renovation"],
  },
  roofing: {
    hero:     ["roofing contractor working professional", "roof repair new installation"],
    about:    ["roofing crew team working", "professional roofer contractor"],
    services: [
      "roof shingles installation new",
      "roof repair damage fix",
      "gutter installation cleaning",
      "roof inspection professional",
    ],
    video:    ["roofing professional contractor", "roof installation"],
  },
  plumbing: {
    hero:     ["professional plumber working pipes", "modern plumbing service professional"],
    about:    ["plumber service team professional", "plumbing crew working"],
    services: [
      "plumber fixing pipe leak",
      "drain cleaning service",
      "water heater installation",
      "bathroom plumbing renovation",
    ],
    video:    ["plumber professional service", "plumbing repair"],
  },
  painting: {
    hero:     ["professional house painter working", "freshly painted beautiful home"],
    about:    ["painting crew professional team", "painter working interior house"],
    services: [
      "interior house painting professional",
      "exterior painting house beautiful",
      "color consultation painting",
      "commercial painting office building",
    ],
    video:    ["house painter professional", "painting interior"],
  },
  default: {
    hero:     ["professional service business team", "modern business professional"],
    about:    ["professional team working together", "business service team smiling"],
    services: [
      "professional service quality",
      "business team working",
      "customer service professional",
      "quality work professional",
    ],
    video:    ["professional business service", "team working"],
  },
}

// ============================================
// CURATED FALLBACK PHOTO IDs
// Hand-picked Unsplash photos per industry.
// Used when no API key is set — no API calls,
// no downloads, just reliable CDN URLs.
// ============================================
const CURATED = {
  landscaping: {
    hero:     "1558618666-fcd25c85cd64",
    about:    "1416879595882-3373a0480b5b",
    services: [
      "1416879595882-3373a0480b5b",   // lawn/garden
      "1558618666-fcd25c85cd64",       // green lawn (confirmed working)
      "1416879595882-3373a0480b5b",   // garden (reuse)
      "1504307651254-35680f356dfd",   // outdoor work
    ],
  },
  cleaning: {
    hero:     "1581578731548-c64695cc6952",
    about:    "1527515637462-cff94eecc1ac",
    services: [
      "1556909114-f6e7ad7d3136",       // kitchen
      "1584622650111-993a426fbf0a",    // bathroom
      "1497366216548-37526070297c",    // office
      "1581578731548-c64695cc6952",    // deep clean
    ],
  },
  "bounce house": {
    hero:     "1530103862676-de8c9debad1d",
    about:    "1504196606672-aef5c9cefc92",
    services: [
      "1530103862676-de8c9debad1d",   // bounce house kids
      "1535572290543-960a8046f5af",   // water slide
      "1558618666-fcd25c85cd64",       // tables/chairs outdoors (reuse lawn — greenery)
      "1532635241-17e820acc59f",       // party setup
      "1504196606672-aef5c9cefc92",   // kids playing
      "1416879595882-3373a0480b5b",   // outdoor event
    ],
  },
  party: {
    hero:     "1530103862676-de8c9debad1d",
    about:    "1504196606672-aef5c9cefc92",
    services: [
      "1530103862676-de8c9debad1d",
      "1535572290543-960a8046f5af",
      "1558618666-fcd25c85cd64",
      "1532635241-17e820acc59f",
      "1504196606672-aef5c9cefc92",
      "1416879595882-3373a0480b5b",
    ],
  },
  dental: {
    hero:     "1606811971618-4486d14f3f99",
    about:    "1629909613654-426c66b0e65a",
    services: [
      "1559839734-2b71ea197ec2",
      "1606811971618-4486d14f3f99",
      "1571772996211-2912cfe1f3b3",
      "1607613009820-a29f7bb81c04",
    ],
  },
  legal: {
    hero:     "1589829545856-d10d557cf95f",
    about:    "1521791055366-0d553872cd97",
    services: [
      "1589829545856-d10d557cf95f",
      "1555374018-13a8994ab246",
      "1521791055366-0d553872cd97",
      "1450101499163-c8848c66ca85",
    ],
  },
  accounting: {
    hero:     "1554224155-8d04cb21cd6c",
    about:    "1542744173-8e7e53415bb0",
    services: [
      "1554224155-8d04cb21cd6c",
      "1460925895917-afdab827c52f",
      "1611974789855-9c2a0a7236a3",
      "1434626881859-194d67b2b86f",
    ],
  },
  restaurant: {
    hero:     "1517248135467-4c7edcad34c4",
    about:    "1414235077428-338989a2e8c0",
    services: [
      "1414235077428-338989a2e8c0",
      "1490645935967-10de6ba17061",
      "1551024709-8f23befc548e",
      "1569050467447-ce54b3bbc37d",
    ],
  },
  contractor: {
    hero:     "1504307651254-35680f356dfd",
    about:    "1541888946425-d81bb19240f5",
    services: [
      "1504307651254-35680f356dfd",
      "1581578731548-c64695cc6952",
      "1518481852452-9415b262eba4",
      "1564182842519-8a3ef2a89c28",
    ],
  },
  roofing: {
    hero:     "1518481852452-9415b262eba4",
    about:    "1504307651254-35680f356dfd",
    services: [
      "1518481852452-9415b262eba4",
      "1564182842519-8a3ef2a89c28",
      "1504307651254-35680f356dfd",
      "1541888946425-d81bb19240f5",
    ],
  },
  plumbing: {
    hero:     "1585771724684-38269d6639fd",
    about:    "1504307651254-35680f356dfd",
    services: [
      "1585771724684-38269d6639fd",
      "1558618666-fcd25c85cd64",
      "1504307651254-35680f356dfd",
      "1541888946425-d81bb19240f5",
    ],
  },
  painting: {
    hero:     "1562259929-b44a9316d71e",
    about:    "1504307651254-35680f356dfd",
    services: [
      "1562259929-b44a9316d71e",
      "1558618666-fcd25c85cd64",
      "1504307651254-35680f356dfd",
      "1541888946425-d81bb19240f5",
    ],
  },
  default: {
    hero:     "1504307651254-35680f356dfd",
    about:    "1541888946425-d81bb19240f5",
    services: [
      "1504307651254-35680f356dfd",
      "1541888946425-d81bb19240f5",
      "1558618666-fcd25c85cd64",
      "1581578731548-c64695cc6952",
    ],
  },
}

// ============================================
// HELPERS
// ============================================

// Build a full Unsplash CDN URL from a photo ID
// Accepts "1234abc" or "photo-1234abc" — always adds the required prefix
function unsplashUrl(photoId, width = 1920, height = null) {
  const id = photoId.startsWith("photo-") ? photoId : `photo-${photoId}`
  const h  = height ? `&h=${height}` : ""
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}${h}&q=80`
}

// Normalise industry string to a key in CURATED/INDUSTRY_QUERIES
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

// Minimal HTTP GET that follows one level of redirect
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http
    lib.get(url, { headers: { "User-Agent": "JordanAI/1.0" } }, res => {
      // Follow redirect
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
// UNSPLASH API
// ============================================
function isUnsplashConfigured() {
  return !!(process.env.UNSPLASH_ACCESS_KEY && process.env.UNSPLASH_ACCESS_KEY.trim())
}

// Search Unsplash and return an array of photo objects
async function searchUnsplash(query, count = 3, orientation = "landscape") {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) throw new Error("UNSPLASH_ACCESS_KEY not set")

  const params = new URLSearchParams({
    query,
    per_page: Math.min(count, 10).toString(),
    orientation,
    content_filter: "high",
  })

  const url = `${UNSPLASH_BASE}/search/photos?${params}`
  const res = await httpGet(url + `&client_id=${key}`)

  if (res.status !== 200) throw new Error(`Unsplash API ${res.status}: ${res.body.substring(0, 200)}`)

  const data = JSON.parse(res.body)
  return (data.results || []).map(p => ({
    id:          p.id,
    description: p.description || p.alt_description || "",
    urls: {
      raw:     p.urls.raw,
      full:    p.urls.full,
      regular: p.urls.regular,   // ~1080w
      small:   p.urls.small,     // ~400w
    },
    downloadUrl: p.links.download_location,
    credit: {
      name:     p.user.name,
      username: p.user.username,
      link:     p.user.links.html,
    },
  }))
}

// Trigger the required Unsplash download endpoint (API guidelines)
async function triggerUnsplashDownload(downloadLocation) {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key || !downloadLocation) return
  try {
    await httpGet(`${downloadLocation}&client_id=${key}`)
  } catch { /* non-fatal */ }
}

// ============================================
// PEXELS API (VIDEOS)
// ============================================
function isPexelsConfigured() {
  return !!(process.env.PEXELS_API_KEY && process.env.PEXELS_API_KEY.trim())
}

async function searchPexelsVideo(query, count = 1) {
  const key = process.env.PEXELS_API_KEY
  if (!key) throw new Error("PEXELS_API_KEY not set")

  const params = new URLSearchParams({ query, per_page: count.toString(), orientation: "landscape" })
  const url = `${PEXELS_BASE}/videos/search?${params}`
  const res = await httpGet(url)

  // Pexels uses header auth, not query param - redo properly
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const options = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      headers:  { "Authorization": key, "User-Agent": "JordanAI/1.0" },
    }
    https.get(options, res => {
      let data = ""
      res.on("data", c => { data += c })
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`Pexels ${res.statusCode}`))
        const d = JSON.parse(data)
        const videos = (d.videos || []).map(v => {
          // Pick best quality video file ≤ 1080p
          const files = (v.video_files || [])
            .filter(f => f.quality === "hd" || f.quality === "sd")
            .sort((a, b) => (b.width || 0) - (a.width || 0))
          const best = files[0]
          return {
            id:          v.id,
            duration:    v.duration,
            url:         best?.link || null,
            width:       best?.width || v.width,
            height:      best?.height || v.height,
            previewUrl:  v.image,
            credit: {
              name: v.user.name,
              url:  v.user.url,
            },
          }
        }).filter(v => v.url)
        resolve(videos)
      })
    }).on("error", reject)
  })
}

// ============================================
// FETCH CLIENT MEDIA (main export)
// ============================================
async function fetchClientMedia(slug, industry, options = {}) {
  const {
    downloadImages = true,   // download to disk (true) or just return URLs (false)
    heroWidth      = 1920,
    aboutWidth     = 1000,
    serviceWidth   = 800,
    fetchVideo     = false,
    numServices    = 4,
  } = options

  const industryKey = normaliseIndustry(industry)
  const curated     = CURATED[industryKey] || CURATED.default
  const queries     = INDUSTRY_QUERIES[industryKey] || INDUSTRY_QUERIES.default

  const imagesDir = path.join(CLIENTS_DIR, slug, "images")
  fs.mkdirSync(imagesDir, { recursive: true })

  const useApi     = isUnsplashConfigured()
  const useVideo   = fetchVideo && isPexelsConfigured()

  const result = {
    hero:     null,
    about:    null,
    services: [],
    video:    null,
    credits:  [],
    source:   useApi ? "unsplash-api" : "unsplash-curated",
  }

  // ── HERO IMAGE ──────────────────────────────
  try {
    if (useApi) {
      const photos = await searchUnsplash(queries.hero[0], 3, "landscape")
      if (photos.length) {
        const photo = photos[0]
        await triggerUnsplashDownload(photo.downloadUrl)

        if (downloadImages) {
          const heroPath = path.join(imagesDir, "hero.jpg")
          const heroUrl  = `${photo.urls.raw}&auto=format&fit=crop&w=${heroWidth}&q=85`
          await downloadFile(heroUrl, heroPath)
          result.hero = `./images/hero.jpg`
        } else {
          result.hero = `${photo.urls.raw}&auto=format&fit=crop&w=${heroWidth}&q=85`
        }
        result.credits.push({ type: "hero", ...photo.credit })
      }
    }
  } catch (err) {
    console.log(`   ⚠️  Hero image API failed (${err.message}), using curated`)
  }

  // Fallback to curated URL (download it too if downloadImages is on)
  if (!result.hero) {
    const curatedUrl = unsplashUrl(curated.hero, heroWidth)
    if (downloadImages) {
      try {
        await downloadFile(curatedUrl, path.join(imagesDir, "hero.jpg"))
        result.hero = `./images/hero.jpg`
      } catch { result.hero = curatedUrl }
    } else {
      result.hero = curatedUrl
    }
  }

  // ── ABOUT IMAGE ─────────────────────────────
  try {
    if (useApi) {
      const photos = await searchUnsplash(queries.about[0], 3, "landscape")
      if (photos.length) {
        const photo = photos[0]
        await triggerUnsplashDownload(photo.downloadUrl)
        if (downloadImages) {
          const aboutUrl = `${photo.urls.raw}&auto=format&fit=crop&w=${aboutWidth}&q=85`
          await downloadFile(aboutUrl, path.join(imagesDir, "about.jpg"))
          result.about = `./images/about.jpg`
        } else {
          result.about = `${photo.urls.raw}&auto=format&fit=crop&w=${aboutWidth}&q=85`
        }
        result.credits.push({ type: "about", ...photo.credit })
      }
    }
  } catch (err) {
    console.log(`   ⚠️  About image API failed (${err.message}), using curated`)
  }

  if (!result.about) {
    const curatedUrl = unsplashUrl(curated.about, aboutWidth)
    if (downloadImages) {
      try {
        await downloadFile(curatedUrl, path.join(imagesDir, "about.jpg"))
        result.about = `./images/about.jpg`
      } catch { result.about = curatedUrl }
    } else {
      result.about = curatedUrl
    }
  }

  // ── SERVICE IMAGES ───────────────────────────
  const svcCount = Math.min(numServices, 6)
  for (let i = 0; i < svcCount; i++) {
    let svcImg = null
    try {
      if (useApi && queries.services[i]) {
        const photos = await searchUnsplash(queries.services[i], 2, "landscape")
        if (photos.length) {
          const photo = photos[0]
          await triggerUnsplashDownload(photo.downloadUrl)
          if (downloadImages) {
            const svcUrl = `${photo.urls.raw}&auto=format&fit=crop&w=${serviceWidth}&q=80`
            await downloadFile(svcUrl, path.join(imagesDir, `service-${i + 1}.jpg`))
            svcImg = `./images/service-${i + 1}.jpg`
          } else {
            svcImg = `${photo.urls.raw}&auto=format&fit=crop&w=${serviceWidth}&q=80`
          }
          result.credits.push({ type: `service-${i + 1}`, ...photo.credit })
        }
      }
    } catch (err) {
      console.log(`   ⚠️  Service ${i + 1} image API failed, using curated`)
    }

    // Fallback — also download if downloadImages is on
    if (!svcImg) {
      const fallbackId  = curated.services[i] || curated.services[0]
      const curatedUrl  = unsplashUrl(fallbackId, serviceWidth)
      if (downloadImages) {
        try {
          await downloadFile(curatedUrl, path.join(imagesDir, `service-${i + 1}.jpg`))
          svcImg = `./images/service-${i + 1}.jpg`
        } catch { svcImg = curatedUrl }
      } else {
        svcImg = curatedUrl
      }
    }
    result.services.push(svcImg)
    // Small delay between API calls to respect rate limits
    if (useApi && i < svcCount - 1) await new Promise(r => setTimeout(r, 200))
  }

  // ── VIDEO (PEXELS) ───────────────────────────
  if (useVideo) {
    try {
      const videos = await searchPexelsVideo(queries.video[0], 3)
      if (videos.length) {
        const video = videos[0]
        if (downloadImages) {
          const vidPath = path.join(imagesDir, "hero.mp4")
          await downloadFile(video.url, vidPath)
          result.video = { type: "local", src: `./images/hero.mp4`, credit: video.credit }
        } else {
          result.video = { type: "url", src: video.url, credit: video.credit }
        }
      }
    } catch (err) {
      console.log(`   ⚠️  Video fetch failed: ${err.message}`)
    }
  }

  console.log(`📸 Media ready for ${slug} (${result.source}): hero ✓ about ✓ ${result.services.length} service imgs${result.video ? " + video" : ""}`)
  return result
}

// ============================================
// GET CURATED URLS ONLY (no API, no download)
// Fast path for previews and demos
// ============================================
function getCuratedMedia(industry, numServices = 6) {
  const key     = normaliseIndustry(industry)
  const curated = CURATED[key] || CURATED.default
  return {
    hero:     unsplashUrl(curated.hero, 1920),
    about:    unsplashUrl(curated.about, 1000),
    services: Array.from({ length: Math.min(numServices, curated.services.length) },
                (_, i) => unsplashUrl(curated.services[i] || curated.services[0], 800)),
    video:    null,
    source:   "curated",
  }
}

// ============================================
// FORMAT CREDITS (for footer/attribution)
// Unsplash license requires attribution for API use
// ============================================
function formatCredits(credits) {
  if (!credits || credits.length === 0) return ""
  return credits
    .map(c => `Photo by <a href="${c.link}?utm_source=jordan_ai&utm_medium=referral" target="_blank">${c.name}</a> on <a href="https://unsplash.com?utm_source=jordan_ai&utm_medium=referral" target="_blank">Unsplash</a>`)
    .join(" · ")
}

// ============================================
// STATUS
// ============================================
function getMediaStatus() {
  return {
    unsplash: isUnsplashConfigured(),
    pexels:   isPexelsConfigured(),
    unsplashKey: process.env.UNSPLASH_ACCESS_KEY ? "Set" : "Not set",
    pexelsKey:   process.env.PEXELS_API_KEY       ? "Set" : "Not set",
  }
}

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
  unsplashUrl,
}
