// ============================================
// TEST EMAIL — run with:
//   node testEmail.js your@email.com
// ============================================

require("dotenv").config()
const emailManager = require("./emailManager")

const to = process.argv[2]

if (!to) {
  console.log("Usage: node testEmail.js your@email.com")
  process.exit(1)
}

const cfg = emailManager.getConfig()
console.log("\n📧 Email config:")
console.log(`   SMTP:      ${cfg.host}:${cfg.port} (${cfg.secure ? "SSL" : "TLS"})`)
console.log(`   Auth user: ${cfg.user}`)
console.log(`   From:      ${cfg.fromName} <${cfg.fromEmail}>`)
console.log(`   Reply-To:  ${cfg.replyTo}`)
console.log(`   Sending to: ${to}\n`)

if (!emailManager.isConfigured()) {
  console.log("❌ Not configured — add SMTP_USER and SMTP_PASS to .env")
  process.exit(1)
}

async function run() {
  const html = emailManager.baseTemplate(`
    <h1>Test Email</h1>
    <p>If you're reading this, Jordan AI's email is working correctly via Zoho SMTP.</p>
    <p>Sent from: <strong>${cfg.fromEmail}</strong><br>
    SMTP server: <strong>${cfg.host}:${cfg.port}</strong></p>
    <p>— Jordan<br><span style="color:#71717a;font-size:13px">jordan-ai.co</span></p>
  `, "Jordan AI email test")

  console.log("Sending test email...")
  const result = await emailManager.sendEmail(to, "Jordan AI — email test", html)

  if (result.success) {
    console.log("✅ Success! Check your inbox.")
    console.log(`   Message ID: ${result.id}`)
  } else {
    console.log("❌ Failed:", result.error)
    console.log("\nCommon fixes:")
    console.log("  • Zoho requires an App Password if 2FA is on")
    console.log("    → Zoho Mail → Settings → Security → App Passwords → Generate")
    console.log("  • FROM_EMAIL must match SMTP_USER or be a verified alias")
    console.log("  • Try SMTP_PORT=587 if 465 times out")
  }
}

run()
