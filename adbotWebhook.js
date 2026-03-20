'use strict'

// ============================================
// ADBOT WEBHOOK SERVER — Jordan AI Bot
//
// Runs alongside the Discord bot on port 3099.
// Catches Stripe payment events for AdBot tiers
// and auto-sends onboarding email to the buyer.
//
// Stripe Dashboard → Webhooks → Add endpoint:
//   URL: https://YOUR_DOMAIN:3099/webhook
//   Events: checkout.session.completed
//
// For local testing use ngrok:
//   ngrok http 3099
// ============================================

require('dotenv').config()
const express     = require('express')
const Stripe      = require('stripe')
const nodemailer  = require('nodemailer')
const fs          = require('fs')
const path        = require('path')

const stripe = new Stripe(process.env.STRIPE_KEY)
const app    = express()

const ORDERS_FILE = path.join(__dirname, 'adbot-orders.json')

// ── AdBot Stripe Price IDs ─────────────────
const ADBOT_TIERS = {
  [process.env.STRIPE_ANALYST_PRICE_ID]:    'Analyst ($497)',
  [process.env.STRIPE_STRATEGIST_PRICE_ID]: 'Strategist ($1,500)',
  [process.env.STRIPE_OPERATOR_PRICE_ID]:   'Operator ($3,500)',
  [process.env.STRIPE_AGENCY_PRICE_ID]:     'Agency ($10,000)',
}

// ── Orders log ────────────────────────────
function saveOrder(order) {
  const orders = fs.existsSync(ORDERS_FILE)
    ? JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'))
    : []
  orders.push({ ...order, createdAt: new Date().toISOString() })
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2))
}

// ── Email transporter ─────────────────────
function getMailer() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.zoho.com',
    port:   parseInt(process.env.SMTP_PORT || '465'),
    secure: true,
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
}

// ── Onboarding email ──────────────────────
async function sendOnboarding(to, name, tier) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return

  const mailer = getMailer()
  await mailer.sendMail({
    from:    `"Jordan AI" <${process.env.SMTP_USER}>`,
    to,
    subject: `Welcome to AdBot — here's how to get started`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#0a0a0f;color:#e4e4e7;margin:0;padding:32px 24px;">
<div style="max-width:640px;margin:0 auto;">

  <h1 style="font-size:24px;font-weight:700;margin-bottom:8px;">⚡ Welcome to AdBot, ${name}!</h1>
  <p style="color:#71717a;margin-bottom:32px;">You're on the <strong style="color:#00d4ff;">${tier}</strong> plan. Let's get your first report running.</p>

  <div style="background:#12121a;border:1px solid #27272a;border-radius:12px;padding:24px;margin-bottom:20px;">
    <h2 style="font-size:17px;margin:0 0 14px;color:#00d4ff;">Step 1 — Get your Meta Access Token</h2>
    <p style="color:#ccc;line-height:1.8;margin:0;">
      1. Go to <a href="https://developers.facebook.com/tools/explorer" style="color:#00d4ff;">developers.facebook.com/tools/explorer</a><br>
      2. Select your app from the top-right dropdown<br>
      3. Click <strong>Generate Access Token</strong><br>
      4. Check permissions: <code style="background:#27272a;padding:2px 6px;border-radius:3px;">ads_read</code> and <code style="background:#27272a;padding:2px 6px;border-radius:3px;">ads_management</code><br>
      5. Copy the token<br><br>
      <span style="color:#71717a;font-size:13px;">⚠️ For a 60-day token: click the blue "i" next to your token → "Open in Access Token Tool" → "Extend Access Token"</span>
    </p>
  </div>

  <div style="background:#12121a;border:1px solid #27272a;border-radius:12px;padding:24px;margin-bottom:20px;">
    <h2 style="font-size:17px;margin:0 0 14px;color:#00d4ff;">Step 2 — Find your Ad Account ID</h2>
    <p style="color:#ccc;line-height:1.8;margin:0;">
      1. Go to <a href="https://business.facebook.com" style="color:#00d4ff;">business.facebook.com</a><br>
      2. Click <strong>Ad Accounts</strong> in the left menu<br>
      3. Your ID looks like <code style="background:#27272a;padding:2px 6px;border-radius:3px;">act_1234567890</code>
    </p>
  </div>

  <div style="background:#12121a;border:1px solid #27272a;border-radius:12px;padding:24px;margin-bottom:32px;">
    <h2 style="font-size:17px;margin:0 0 14px;color:#00d4ff;">Step 3 — Send us your credentials</h2>
    <p style="color:#ccc;line-height:1.8;margin:0;">
      Reply to this email with:<br>
      • Your Meta Access Token<br>
      • Your Ad Account ID (act_XXXXXXXXX)<br><br>
      We'll run your first analysis within <strong>24 hours</strong> and email you the full report.
    </p>
  </div>

  <p style="color:#71717a;font-size:13px;text-align:center;">Questions? Just reply to this email.<br>
  <a href="https://jordan-ai.co/adbot.html" style="color:#00d4ff;">jordan-ai.co/adbot</a></p>
</div>
</body>
</html>`,
    text: `Welcome to AdBot!\n\nReply with:\n1. Your Meta Access Token (from developers.facebook.com/tools/explorer)\n2. Your Ad Account ID (format: act_XXXXXXXXX)\n\nWe'll send your report within 24 hours.`,
  })

  console.log(`[AdbotWebhook] ✅ Onboarding email sent to ${to}`)
}

// ── Stripe webhook ────────────────────────
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig    = req.headers['stripe-signature']
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  let event
  try {
    event = secret && sig
      ? stripe.webhooks.constructEvent(req.body, sig, secret)
      : JSON.parse(req.body.toString())
  } catch (err) {
    console.error('[AdbotWebhook] Signature error:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const email   = session.customer_details?.email
    const name    = session.customer_details?.name?.split(' ')[0] || 'there'

    // Identify which AdBot tier was purchased
    let tier = 'Analyst ($497)' // default
    try {
      const expanded = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items'],
      })
      const priceId = expanded.line_items?.data?.[0]?.price?.id
      if (priceId && ADBOT_TIERS[priceId]) tier = ADBOT_TIERS[priceId]
    } catch (e) { /* use default */ }

    console.log(`[AdbotWebhook] 💳 New AdBot sale — ${email} — ${tier}`)

    saveOrder({ email, name, tier, amount: session.amount_total / 100, stripeId: session.id })

    if (email) await sendOnboarding(email, name, tier)

    // Notify in Discord if client is available
    if (global.discordClient) {
      try {
        const reportsChannel = process.env.DISCORD_REPORTS_CHANNEL
        if (reportsChannel) {
          const ch = await global.discordClient.channels.fetch(reportsChannel)
          if (ch) await ch.send(`💰 **New AdBot Sale!**\nTier: ${tier}\nBuyer: ${email}\nOnboarding email sent automatically.`)
        }
      } catch (e) { /* silent */ }
    }
  }

  res.json({ received: true })
})

// ── Health check ──────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'adbot-webhook' }))

// ── Start ─────────────────────────────────
const PORT = process.env.WEBHOOK_PORT || 3099

function startAdbotWebhook(discordClient) {
  global.discordClient = discordClient
  app.listen(PORT, () => {
    console.log(`[AdbotWebhook] Webhook server running on port ${PORT}`)
    console.log(`[AdbotWebhook] Stripe → https://YOUR_DOMAIN:${PORT}/webhook`)
  })
}

module.exports = { startAdbotWebhook }
