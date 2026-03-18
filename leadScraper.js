// ============================================
// JORDAN AI - LEAD SCRAPER
// Finds local businesses via Google Places API
// Saves them to CRM as "prospect" stage leads
// ============================================
//
// Requires: GOOGLE_PLACES_API_KEY in .env
// Get one at: https://console.cloud.google.com/
// Enable: "Places API" in the API library
// ============================================

require("dotenv").config()
const axios = require("axios")
const crm = require("./crm")

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY

// ============================================
// SEARCH GOOGLE PLACES
// ============================================
async function searchPlaces(query, location = "Columbia, SC") {
  if (!PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY not set in .env")
  }

  const url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
  const params = {
    query: `${query} in ${location}`,
    key: PLACES_API_KEY,
    type: "establishment"
  }

  const response = await axios.get(url, { params })

  if (response.data.status !== "OK" && response.data.status !== "ZERO_RESULTS") {
    throw new Error(`Places API error: ${response.data.status} — ${response.data.error_message || ""}`)
  }

  return response.data.results || []
}

// ============================================
// GET PLACE DETAILS (phone, website)
// ============================================
async function getPlaceDetails(placeId) {
  if (!PLACES_API_KEY) return {}

  try {
    const url = "https://maps.googleapis.com/maps/api/place/details/json"
    const params = {
      place_id: placeId,
      fields: "name,formatted_phone_number,website,formatted_address,rating,user_ratings_total",
      key: PLACES_API_KEY
    }

    const response = await axios.get(url, { params })
    return response.data.result || {}
  } catch (err) {
    return {}
  }
}

// ============================================
// SLUGIFY BUSINESS NAME
// ============================================
function makeSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 40)
}

// ============================================
// SCRAPE LEADS
// Main function — call this from agent tools or Discord
// ============================================
async function scrapeLeads(industry, city = "Columbia, SC", maxLeads = 10) {
  console.log(`\n🔍 Scraping leads: ${industry} in ${city}`)

  const results = []
  const skipped = []
  const errors = []

  let places = []
  try {
    places = await searchPlaces(industry, city)
  } catch (err) {
    return { success: false, error: err.message, results: [], skipped: [], errors: [] }
  }

  console.log(`   Found ${places.length} places. Processing up to ${maxLeads}...`)

  const toProcess = places.slice(0, maxLeads)

  for (const place of toProcess) {
    try {
      const slug = makeSlug(place.name)

      // Skip if already in CRM
      const existing = crm.getClient(slug)
      if (existing) {
        skipped.push({ name: place.name, reason: "already in CRM" })
        continue
      }

      // Get extra details (phone, website)
      const details = await getPlaceDetails(place.place_id)

      // Small delay to avoid hammering Places API
      await new Promise(r => setTimeout(r, 300))

      // Add to CRM as prospect
      crm.addClient(slug, {
        businessName: place.name,
        contactName: "",
        email: "",
        phone: details.formatted_phone_number || "",
        website: details.website || "",
        address: place.formatted_address || "",
        industry: industry,
        monthlyValue: 0,
        stage: "prospect",
        notes: `Found via Google Places. Rating: ${place.rating || "N/A"} (${place.user_ratings_total || 0} reviews). Source: lead-scraper.`
      })

      results.push({
        slug,
        name: place.name,
        phone: details.formatted_phone_number || "none",
        website: details.website || "none",
        rating: place.rating || null,
        address: place.formatted_address || ""
      })

      console.log(`   ✅ Added: ${place.name}`)
    } catch (err) {
      errors.push({ name: place.name, error: err.message })
      console.log(`   ❌ Error with ${place.name}: ${err.message}`)
    }
  }

  console.log(`\n📊 Lead scrape done: ${results.length} added, ${skipped.length} skipped, ${errors.length} errors`)

  return {
    success: true,
    industry,
    city,
    results,
    skipped,
    errors,
    summary: `Found ${results.length} new leads in "${industry}" near ${city}`
  }
}

// ============================================
// FORMAT RESULTS FOR DISCORD
// ============================================
function formatLeadResults(scrapeResult) {
  if (!scrapeResult.success) {
    return `❌ Lead scrape failed: ${scrapeResult.error}`
  }

  const lines = [
    `**🔍 Lead Scrape: ${scrapeResult.industry} in ${scrapeResult.city}**`,
    ``,
    `**Added ${scrapeResult.results.length} new prospects to CRM:**`,
  ]

  for (const lead of scrapeResult.results) {
    lines.push(`• **${lead.name}**`)
    if (lead.phone !== "none") lines.push(`  📞 ${lead.phone}`)
    if (lead.website !== "none") lines.push(`  🌐 ${lead.website}`)
    if (lead.rating) lines.push(`  ⭐ ${lead.rating}/5`)
  }

  if (scrapeResult.skipped.length > 0) {
    lines.push(``)
    lines.push(`*${scrapeResult.skipped.length} already in CRM (skipped)*`)
  }

  if (scrapeResult.errors.length > 0) {
    lines.push(`*${scrapeResult.errors.length} errors*`)
  }

  lines.push(``)
  lines.push(`Use \`!outreach run\` to email these prospects.`)

  return lines.join("\n")
}

// ============================================
// CHECK IF CONFIGURED
// ============================================
function isConfigured() {
  return !!PLACES_API_KEY
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  scrapeLeads,
  formatLeadResults,
  isConfigured
}
