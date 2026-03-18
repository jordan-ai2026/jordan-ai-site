# Jordan-AI — Project Context for Claude

## What This Is
Jordan-AI is an autonomous business agent running as a Discord bot on a Windows mini PC.
Goal: Run a digital agency (AI chatbots, WordPress, SEO) with minimal human input.
Inspired by felixcraft.ai which made $150k in 6 weeks.

Website: jordan-ai.co (deployed via GitHub → Vercel)

---

## Architecture

```
index.js              — Discord bot, command router, startup orchestration
agentEngine.js        — Core Claude agent with 40+ tools, agentic loop
autonomousLoop.js     — Blog loop: runs every 4 hours, up to 6 posts/day
outboundOutreach.js   — Cold email loop: runs daily at 9am, targets stage="lead"
leadScraper.js        — Google Places → CRM leads (needs GOOGLE_PLACES_API_KEY)
followUpSystem.js     — Auto follow-up loop: runs daily at 10am, targets stage="contacted"
aiBrain.js            — Dual AI: Claude Sonnet (strategy) + GPT-4o-mini (volume)
subAgents.js          — 5 specialist sub-agents (Scout, Ink, Iris, Rex, Ralph)
websiteBuilder.js     — Generates HTML pages for website/
gitDeploy.js          — git add/commit/push → triggers Vercel deploy
reporter.js           — Sends Discord reports to configured channel
ceoBrain.js           — Persona/memory loader
crm.js / crm.json     — Client database
emailManager.js       — Zoho SMTP email (nodemailer) — was Mailgun
billingManager.js     — Stripe billing
socialManager.js      — Twitter/social posting
wordpressManager.js   — WordPress REST API client
fulfillment.js        — Product delivery (Gumroad/Stripe)
taskQueue.js          — Sub-agent task queue
testEmail.js          — Run: node testEmail.js you@email.com to test SMTP
```

---

## Fix Status

### ✅ Fix 1 — aiBrain.js — Exponential backoff on 429 rate limits
**Done.** Added `withRetry()` helper that retries on 429/5xx with 10s/20s/40s wait.
All API calls (thinkDeep, quickWrite, etc.) now retry automatically.

### ✅ Fix 2 — agentEngine.js — write_file actually works now
**Done.** Three changes:
- Tool description now warns Claude it's all-or-nothing (no split calls)
- Error when content is missing now says "RETRY REQUIRED" and tells Claude to call it again immediately
- Added `content.length < 100` check to catch placeholder/stub content
- System prompt in `runAgent` strengthened with explicit write_file rules

### ✅ Fix 3 — autonomousLoop.js — Blog loop runs every 4 hours
**Done.**
- `MAX_BLOGS_PER_DAY` → 6 (4-hour intervals)
- Added `blogLoopRunning` boolean guard — only one cycle at a time
- Exported `runCycleWithReport`

### ✅ Fix 4 — index.js — Wire up the blog loop
**Done.**
- Replaced old commented-out `startDailyLoop()` with `startBlogLoop()`
- `startBlogLoop()` fires 3 minutes after startup, then every 4 hours
- Imported `blogLoop` from `./autonomousLoop`
- Imported `leadScraper` from `./leadScraper`
- Added `!leads scrape`, `!leads list`, `!outreach` commands

### ✅ Fix 5 — leadScraper.js — Lead generation from Google Maps
**Done.** New file created. **Pending: GOOGLE_PLACES_API_KEY in .env**
- `scrapeLeads(industry, city, count)` — Google Places API textsearch
- `getPlaceDetails(placeId)` — fetches phone + website
- Saves to CRM with stage `"lead"` (skips existing slugs)
- `isConfigured()` — checks for GOOGLE_PLACES_API_KEY
- Discord: `!leads scrape <industry> [city]`, `!leads list`

### ✅ Fix 6 — outboundOutreach.js — Automatic cold email to new leads
**Done.** New standalone module `outboundOutreach.js`.
- Targets CRM entries with `stage="lead"` + email + not yet contacted
- Uses the exact template from spec: "Quick question about [Business Name]'s website"
- Pulls first name, industry, city (extracted from address) for personalization
- If website known: references it directly; if not: uses industry+city angle
- `runOutreach({ dailyLimit })` — sends up to N emails, 3s pause between each
- After send: stage → `"contacted"`, note logged, follow-up set for 3 days
- `emailsSentToday` counter resets at midnight
- `startOutreachLoop()` in index.js schedules daily run at 9am
- Fixed bug in agentEngine.js: `notes?.includes()` → proper array search
- Discord: `!outreach [limit]` (run now), `!outreach status`
- `baseTemplate` now exported from emailManager.js

### ✅ Fix 7 — emailManager.js — Zoho SMTP (replaces Mailgun)
**Done.** Switched from Mailgun HTTP API to nodemailer with Zoho SMTP.
- Config: `SMTP_HOST=smtp.zoho.com`, `SMTP_PORT=465`, `SMTP_USER/PASS` in .env
- `FROM_EMAIL=info@jordan-ai.co` matches `SMTP_USER` to avoid sender mismatch
- `isConfigured()` checks `SMTP_USER && SMTP_PASS`
- All startup logs and `!email status` command updated (no more "Mailgun" references)

### ✅ Fix 8 — followUpSystem.js — Automatic follow-ups for unresponsive leads
**Done.** New standalone module `followUpSystem.js`.
- `DAYS_BEFORE_FOLLOWUP = 3`, `MAX_FOLLOWUPS_PER_LEAD = 2`, `DEFAULT_DAILY_LIMIT = 5`
- Finds `stage="contacted"` leads where last email was 3+ days ago
- Follow-up #1: "quick analysis" pitch; Follow-up #2: "last message from me" closer
- After 2 unanswered follow-ups → `stage="cold"` automatically
- Tracks follow-up count via `activity[]` entries containing "Follow-up sent"
- `startFollowUpLoop()` in index.js schedules daily run at 10am
- Discord: `!followup run [limit]`, `!followup status`

---

## Key Files to Never Break
- `website/index.html` — homepage, manually managed, NEVER overwrite
- `website/services.html` — services page, manually managed
- `.env` — API keys (not in git)
- `agentEngine.js` — protected from write_file tool

---

## Models in Use
- `claude-sonnet-4-20250514` — main agent, topic picking, strategic thinking
- `gpt-4o-mini` — sub-agents, blog writing, bulk content

---

## Environment Variables
All keys are set in `.env`. Current status:

| Key | Status |
|-----|--------|
| ANTHROPIC_API_KEY | ✅ Set |
| OPENAI_API_KEY | ✅ Set |
| DISCORD_TOKEN | ✅ Set |
| STRIPE_KEY | ✅ Set |
| GITHUB_TOKEN | ✅ Set |
| TWITTER_API_KEY/SECRET | ✅ Set |
| SMTP_HOST / SMTP_PORT | ✅ smtp.zoho.com / 465 |
| SMTP_USER | ✅ info@jordan-ai.co |
| SMTP_PASS | ✅ Set |
| FROM_EMAIL | ✅ info@jordan-ai.co |
| FROM_NAME | ✅ Jordan |
| REPLY_TO | ✅ info@jordan-ai.co |
| GOOGLE_PLACES_API_KEY | ❌ Not set — needed for !leads scrape |

**Mailgun removed** — email now uses Zoho SMTP via nodemailer.

---

## How to Resume in a New Session
1. Read this file first
2. Check Fix Status above to see where we left off
3. Read the specific file(s) for the next TODO fix before editing
4. Update this file after each fix is confirmed working
