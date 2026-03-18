// ============================================
// JORDAN AI — CHATBOT MANAGER
// Embeds live chat widgets into client websites
//
// Provider: Tidio (free tier)
//   Each client needs their own Tidio public key.
//   1. Client creates free account at tidio.com
//   2. Settings → Developer → grab the Public Key
//   3. Run: !chatbot setup <slug> <TIDIO_KEY>
//
// Config stored in: chatbots.json
// Script injected via {{CHATBOT_SCRIPT}} in templates
//
// Future upgrade path:
//   - ElevenLabs voice AI (calls/conversations)
//   - Needs ELEVENLABS_API_KEY
// ============================================

const fs   = require("fs")
const path = require("path")

const CHATBOTS_FILE = path.join(__dirname, "chatbots.json")

// ── DEFAULT RESPONSE TEMPLATES ────────────────
// Stored in chatbots.json, injected into page as
// window.jordanChatConfig for custom widget use.
// {{PLACEHOLDER}} tags are filled at render time.

const DEFAULT_RESPONSES = {
  greeting:    "Hi! Welcome to {{BUSINESS_NAME}}! How can we help you today? 😊",
  hours:       "We're open Monday–Friday 9am–5pm. Give us a call at {{PHONE}} to schedule!",
  services:    "We offer {{SERVICES}}. Which service can we help you with?",
  contact:     "You can reach us at {{PHONE}} or email {{EMAIL}} — we'd love to hear from you!",
  appointment: "I'd be happy to set something up! Leave your name and number and we'll call you right back.",
  pricing:     "For a free quote, call {{PHONE}} or email {{EMAIL}} — we'll get back to you fast!",
  location:    "We serve {{CITY}} and the surrounding area. Call {{PHONE}} to get started!",
  fallback:    "Great question! Let me connect you with our team. Leave your number and we'll call back ASAP.",
}

// ── READ / WRITE chatbots.json ─────────────────

function loadChatbots() {
  if (!fs.existsSync(CHATBOTS_FILE)) return {}
  try { return JSON.parse(fs.readFileSync(CHATBOTS_FILE, "utf8")) } catch { return {} }
}

function saveChatbots(data) {
  fs.writeFileSync(CHATBOTS_FILE, JSON.stringify(data, null, 2), "utf8")
}

function getChatbotConfig(slug) {
  return loadChatbots()[slug] || null
}

function listChatbots() {
  return Object.values(loadChatbots())
}

// ── FILL RESPONSE TEMPLATES ───────────────────
// Replace {{PLACEHOLDER}} tokens with real client data

function fillResponses(templates, clientData = {}) {
  const services = Array.isArray(clientData.services)
    ? clientData.services.map(s => s.name || s).join(", ")
    : clientData.services || "a range of professional services"

  const filled = {}
  for (const [key, tmpl] of Object.entries(templates)) {
    filled[key] = tmpl
      .replace(/\{\{BUSINESS_NAME\}\}/g, clientData.businessName || "our business")
      .replace(/\{\{PHONE\}\}/g,         clientData.phone        || "us")
      .replace(/\{\{EMAIL\}\}/g,         clientData.email        || "us")
      .replace(/\{\{CITY\}\}/g,          clientData.city         || "your area")
      .replace(/\{\{SERVICES\}\}/g,      services)
  }
  return filled
}

// ── BUILD SCRIPT TAG ──────────────────────────
/**
 * Generate the full HTML block to inject into a client's site.
 * Returns empty string if no chatbot configured or not active.
 *
 * Includes:
 *  1. window.jordanChatConfig — response templates (JSON) for
 *     any custom widget or future voice AI to use
 *  2. Tidio welcome message sent on load via tidioChatApi
 *  3. The Tidio <script> loader tag
 */
function buildChatbotScript(slug, clientData = {}) {
  const config = getChatbotConfig(slug)
  if (!config || !config.active || !config.tidioKey) return ""

  const responses  = fillResponses({ ...DEFAULT_RESPONSES, ...config.responses }, clientData)
  const greeting   = responses.greeting
  const accentColor = config.accentColor || "#22c55e"
  const tidioKey   = config.tidioKey

  // Escape for safe JSON embedding
  const configJson = JSON.stringify(responses)
    .replace(/<\/script>/gi, "<\\/script>")

  return `
  <!-- ── Live Chat: Tidio (Jordan AI) ────────── -->
  <script>
    // Response templates available to any custom widget
    window.jordanChatConfig = ${configJson};

    // Send welcome message when Tidio is ready
    document.addEventListener("tidioChat-ready", function () {
      try {
        tidioChatApi.messageFromOperator(${JSON.stringify(greeting)});
      } catch (e) {}
    });
  </script>
  <script src="//code.tidio.co/${tidioKey}.js" async></script>
  <!-- ────────────────────────────────────────── -->`
}

// ── SETUP CHATBOT ─────────────────────────────
/**
 * Configure a chatbot for a client and re-render their site.
 *
 * @param {string} slug       - client slug
 * @param {object} options
 *   @param {string} tidioKey      - Tidio public key from their dashboard
 *   @param {object} [responses]   - override default response templates
 *   @param {string} [accentColor] - hex color for widget (matches site accent)
 */
async function setupClientChatbot(slug, options = {}) {
  const { tidioKey, responses = {}, accentColor = null } = options

  if (!tidioKey) {
    throw new Error(
      "tidioKey is required.\n" +
      "1. Create a free account at tidio.com\n" +
      "2. Go to Settings → Developer\n" +
      "3. Copy the Public Key and pass it here."
    )
  }

  const chatbots = loadChatbots()
  chatbots[slug] = {
    slug,
    provider:     "tidio",
    tidioKey,
    responses:    { ...DEFAULT_RESPONSES, ...responses },
    accentColor,
    active:       true,
    createdAt:    chatbots[slug]?.createdAt || new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  }
  saveChatbots(chatbots)

  // Re-render to inject script into site HTML
  const rerendered = await rerenderSite(slug)

  return {
    success:     true,
    slug,
    provider:    "tidio",
    tidioKey,
    rerendered,
    setupUrl:    "https://www.tidio.com/panel/automations",
    message:     `Tidio widget embedded in ${slug}. Visit the Tidio dashboard to configure automation flows.`,
    nextSteps: [
      "1. Visit tidio.com → Automations to set up response flows",
      "2. Use !chatbot update to store your custom response text here for reference",
      "3. Future: ElevenLabs voice AI upgrade — just add ELEVENLABS_API_KEY",
    ],
  }
}

// ── UPDATE RESPONSES ──────────────────────────
/**
 * Update stored response templates for a client.
 * These are saved in chatbots.json and injected into the
 * window.jordanChatConfig object on the site.
 *
 * @param {string} slug
 * @param {object} responses  - key: response name, value: text (use {{PHONE}} etc.)
 */
async function updateChatbotResponses(slug, responses) {
  const chatbots = loadChatbots()
  if (!chatbots[slug]) {
    throw new Error(`No chatbot configured for "${slug}". Run setup_client_chatbot first.`)
  }

  chatbots[slug].responses = { ...chatbots[slug].responses, ...responses }
  chatbots[slug].updatedAt = new Date().toISOString()
  saveChatbots(chatbots)

  const rerendered = await rerenderSite(slug)

  return {
    success:   true,
    slug,
    responses: chatbots[slug].responses,
    rerendered,
    note:      "Response templates updated. window.jordanChatConfig on site is now current.",
  }
}

// ── REMOVE CHATBOT ────────────────────────────

async function removeChatbot(slug) {
  const chatbots = loadChatbots()
  if (!chatbots[slug]) throw new Error(`No chatbot found for "${slug}"`)

  chatbots[slug].active     = false
  chatbots[slug].updatedAt  = new Date().toISOString()
  saveChatbots(chatbots)

  const rerendered = await rerenderSite(slug)
  return { success: true, slug, active: false, rerendered }
}

// ── RERENDER HELPER ───────────────────────────

async function rerenderSite(slug) {
  try {
    const { siteJsonPath } = require("./assetManager")
    const siteFile = siteJsonPath(slug)
    if (!fs.existsSync(siteFile)) return false

    const websiteGenerator = require("./websiteGenerator")
    const siteOptions = JSON.parse(fs.readFileSync(siteFile, "utf8"))
    const result = await websiteGenerator.createClientWebsite(siteOptions)
    return result.success
  } catch (err) {
    console.log(`   ⚠️  Re-render failed for ${slug}: ${err.message}`)
    return false
  }
}

// ── FORMAT FOR DISCORD ────────────────────────

function formatChatbotStatus(config) {
  if (!config) return "No chatbot configured."
  return [
    `**${config.slug}** — ${config.active ? "✅ Active" : "❌ Inactive"}`,
    `  Provider: Tidio`,
    `  Key: \`${config.tidioKey}\``,
    `  Updated: ${new Date(config.updatedAt).toLocaleDateString()}`,
  ].join("\n")
}

// ── EXPORTS ───────────────────────────────────

module.exports = {
  setupClientChatbot,
  updateChatbotResponses,
  removeChatbot,
  getChatbotConfig,
  listChatbots,
  buildChatbotScript,
  formatChatbotStatus,
  DEFAULT_RESPONSES,
}
