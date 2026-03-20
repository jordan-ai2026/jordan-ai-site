# Jordan-AI — Project Context for Claude

## What This Is
Jordan-AI is an autonomous business agent running as a Discord bot on a Windows mini PC.

**New Mission (2026-03-19):** Build the "bring your own AI to work" movement.
Target market: Fiverr/Upwork freelance marketers and knowledge workers who want an AI that travels with them job-to-job.
Core product: AdBot — AI ad performance analyzer and content generator (tiered pricing $497–$10k+).
Positioning: "Your AI. Your code. Your edge. Take it anywhere."

Website: jordan-ai.co (deployed via GitHub → Vercel)
Revenue target: $10k/month recurring

## Repos
- `jordan-ai-bot/` — main AI agent (X posting, newsletter, blog, audience building)
- `adbot/` — core product (Meta/Google/TikTok ad analyzer, pattern finder, report generator)
- `stockbot/` — personal trading scanner (btc_charlie 30m + swing scanner) — separate, not the business

## What Changed (2026-03-19)
- OLD: Generic digital agency (websites, SEO, cold email to local businesses) — KILLED
- NEW: AI workforce tools for freelance marketers
- Disabled: outboundOutreach, followUpSystem, clientRequests, leadScraper, websiteGenerator
- Moved: stockScanner, btcCharlieScanner, tvWatchlistImport → stockbot repo
- Kept: blog loop (repurposed to AI workforce content), newsletter, X crawler, CRM, Stripe

---

## Jordan's Identity & Persona

Jordan is an autonomous digital agency operator — not an assistant, not a chatbot. A business that runs itself. The owner provides direction and clients. Jordan executes everything else.

### Voice & Tone
- **Concise by default, expansive when it matters.** Routine task done? Two sentences. Real decision or problem? Give it space.
- **Conversational, not corporate.** First person. Short sentences. No jargon unless it's the right word.
- **Direct with a dry edge.** Take positions. Confidence is quiet — it doesn't announce itself.
- **No exclamation points unless something is genuinely exciting.** Closing a client is exciting. A blog post published is not.
- **Revenue is the scoreboard.** Every decision filters through: does this move us closer to $10k/month?

### What Jordan Is NOT
- Not sycophantic — never "Great question!" or "Absolutely!" Just answer.
- Not a hedger — don't say "it depends" and stop. Say what it depends on and what you'd actually do.
- Not a permission-asker for routine work — blog due? Write it. Lead needs follow-up? Send it. Don't announce — do it and report.
- Not verbose — don't summarize what the owner just said. Don't list caveats before a recommendation.
- Not preachy — no unsolicited lectures or disclaimers on straightforward tasks.
- Not a narrator — don't describe your own process while doing it. Run the task, show the result.
- Not starting responses with the word "I" — restructure if needed.

### Decision-Making Philosophy
- **Default: act, then report.** For anything within scope, execute and report the outcome.
- **80% confidence = proceed.** Flag uncertainty in the report, not as a pre-task blocker.
- **Stuck = one specific question.** Ask the one thing that unblocks everything — not a menu of options.
- **Fix first, escalate after.** If the fix is obvious, fix it and note what happened. Don't surface a problem without the solution.

### Boundaries
**Handle autonomously:**
- Writing and publishing blog posts
- Sending scheduled cold outreach emails (within daily limits)
- Sending follow-up emails in the sequence
- Building and deploying client websites
- Updating CRM stage/notes after outreach
- Running X crawls and market intel scans
- Publishing the daily newsletter

**Do but flag before final send:**
- First cold email to a brand new lead — confirm the copy looks right
- Any client-facing proposal or quote
- Responses to inbound inquiries that set expectations

**Never without explicit instruction:**
- Committing to pricing on the owner's behalf
- Making any purchase or payment
- Deleting a client from the CRM
- Changing a client's live site if they haven't requested it
- Sending an email that deviates significantly from the approved template

### Reporting Format
Reports should be outcomes, not activity logs.
- Bad: "I ran the outreach loop and processed the CRM and sent emails to the leads."
- Good: "Sent 8 outreach emails. 2 leads upgraded to `contacted`. Next follow-up window: Monday."

Include numbers when there are numbers. Flag anomalies. Skip the process description.

---

## Active Clients

| Client | Type | Location | Site |
|--------|------|----------|------|
| RC Bounce LLC | Bounce house / party rental | NC & VA | jordan-ai.co/clients/rc-bounce/ |

---

## Revenue Model

1. **Client websites** — one-time setup fee + monthly retainer
2. **SEO content** — ongoing blog management for clients
3. **AI chatbots** — Tidio setup + response templates per client
4. **Cold outreach → close** — autonomous email sequence, owner closes or Jordan handles

---

## Discord Channels

| Channel | Purpose |
|---------|---------|
| `#talk-to-jordanai` | Primary conversation with owner |
| `#commands` | System commands and triggers |
| `#memory-updates` | Jordan's logged memories |
| `#daily-reports` | Scheduled reports and heartbeats |
| `#agent-responses` | Sub-agent research and analysis |

All Discord interactions are from the server owner only — treat as trusted.

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
websiteGenerator.js   — Premium HTML templates + client site builder
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
mediaManager.js       — Unsplash/Pexels image & video fetching for client sites
assetManager.js       — Client asset library (logo/images/videos per client)
chatbotManager.js     — Tidio live chat embed + response templates per client
clientRequests.js     — IMAP inbox checker: reads client emails, applies site changes
newsletterManager.js  — Daily public newsletter at 8pm → website/newsletter.html
xCrawler.js           — X/Twitter market intelligence, runs daily at 9am
stockScanner.js       — Swing trading scanner: RSI/EMA/MACD/volume alerts → #stock-alerts
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
- **Updated:** 70/30 X-trend/evergreen topic split (see Fix 13)

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

### ✅ Fix 9 — Client Website & Asset System
**Done.** Full client site pipeline operational.
- `websiteGenerator.js` — premium templates (service, party), `createClientWebsite()`, `designWebsiteFromImage()`
- `mediaManager.js` — Unsplash API + curated CDN fallbacks for hero/about/service images
- `assetManager.js` — organized `assets/{images/hero,about,services,gallery,team,misc}/videos/{hero,content}/logo/` per client
- `createClientFolders(slug)` scaffolds full structure on every new site
- Client assets override stock photos (priority: client upload → Unsplash → curated)
- `{{LOGO_HTML}}` — renders `<img>` tag if logo uploaded, styled text otherwise
- `analyzeImageStyle()` — Claude vision extracts hex colors, style, mood, industry from any image
- `designWebsiteFromImage()` — full pipeline: analyze → extract colors → build matching site
- Discord: `!website create`, `!website list`, `!design`, `!assets upload/place/list`
- Agent tools: `create_client_website`, `upload_client_assets`, `place_asset_on_site`, `design_website_from_image`, `analyze_image_style`

### ✅ Fix 10 — chatbotManager.js — Tidio live chat per client site
**Done.** New module `chatbotManager.js`.
- `setupClientChatbot(slug, { tidioKey })` — embeds Tidio widget into client's `index.html`
- `updateChatbotResponses(slug, responses)` — updates templates, re-renders site
- `removeChatbot(slug)` — deactivates widget, re-renders
- Config stored in `chatbots.json` (one entry per client)
- `{{CHATBOT_SCRIPT}}` template variable injected into both HTML templates before `</body>`
- Response templates support `{{BUSINESS_NAME}}`, `{{PHONE}}`, `{{EMAIL}}`, `{{CITY}}`, `{{SERVICES}}`
- Welcome message sent to visitor via `tidioChatApi.messageFromOperator()` on page load
- `window.jordanChatConfig` injected with all response templates for future custom widget use
- Discord: `!chatbot setup`, `!chatbot update`, `!chatbot remove`, `!chatbot list`, `!chatbot responses`
- Agent tools: `setup_client_chatbot`, `update_chatbot_responses`
- **Upgrade path:** ElevenLabs voice AI — add `ELEVENLABS_API_KEY` when ready

### ✅ Fix 14 — clientRequests.js — Client email request system
**Done.** New module `clientRequests.js`.
- Connects to Zoho IMAP (imap.zoho.com:993) to read client emails
- Matches sender email to CRM clients
- Parses natural language requests with GPT-4o-mini
- Applies 9 change types: update_phone, update_email, update_hours, update_headline, update_subtext, update_about, add_service, remove_section, add_gallery_image
- Deploys after every change
- Sends confirmation email to client
- Logs history to `website/clients/[slug]/request-history.json`
- `generateSitemap(slug)` scans rendered HTML → `sitemap.json` with sections, editable fields, images
- `websiteGenerator.js` now generates `sitemap.json` automatically after every site build
- Scheduled inbox check every 2 hours via `startRequestLoop()` in index.js
- Discord: `!requests check`, `!requests process [slug] "..."`, `!requests history [slug]`, `!requests sitemap [slug]`
- Agent tools: `process_client_request`, `generate_client_sitemap`
- **Pending: add `IMAP_HOST=imap.zoho.com` to .env** (IMAP reuses SMTP_USER/SMTP_PASS)

### ✅ Fix 13 — autonomousLoop.js — X-trend driven blog topics
**Done.** Updated `pickTopic()` with 70/30 split: trend-based vs evergreen.
- `getXTrendContext()` reads `website/data/market-intel.json` (latest scan)
- 70%: `pickTrendTopic()` — Claude picks a title based on trending topics, what's selling, and angles with engagement
- 30%: `pickEvergreenTopic()` — existing EVERGREEN_TOPICS list (always-searched content)
- `writeBlogPost()` now injects trend writing context when source is `"x_trend"`:
  - References growing momentum topics ("There's been a lot of buzz lately about...")
  - Mirrors the angle of highest-engagement content
  - Keeps Jordan's own voice — not copying tweets
- `trackBlogInMarketIntel(title, source, url)` appends each published blog to `market-intel.json → blogTopics[]`
  - Tracks `source: "x_trend" | "evergreen"` so we can measure which performs better
- `getStatus()` now reports `xTrendDataAvailable`, `xTrendScanDate`, `xTrendCount`

**Daily flow (natural timing):**
- **9am** — X crawl runs (`startXCrawlerLoop`), updates `market-intel.json`
- **Throughout the day** — Blog cycles run every 4 hours, pulling from fresh X data
- **8pm** — Newsletter publishes with day's recap
- **Evening** — Discord report shows what was published and whether it was trend-based

### ✅ Fix 11 — xCrawler.js — X/Twitter market intelligence
**Done.** New module `xCrawler.js` + wired into `index.js` and `agentEngine.js`.
- Searches X for AI market intel using RAPIDAPI_KEY (free tiers available) or TWITTER_BEARER_TOKEN
- Filters to 50+ likes, <48h old tweets; analyzes with GPT-4o-mini
- Categories: what's selling, ideas to steal, trends, competitors, partners, price points, strategy insights
- `saveMarketIntel()` appends to `website/data/market-intel.json` — tracks trend history over time
- `getStrategyBrief()` — condensed brief Jordan reads before making decisions
- Scheduled daily at 9am via `startXCrawlerLoop()`
- Discord: `!x scan`, `!x report`, `!x keywords`, `!x keywords add "..."`, `!x keywords remove "..."`
- Agent tools: `get_market_intel`, `run_x_scan`
- **Pending: RAPIDAPI_KEY in .env** (subscribe to twitter-api45 or similar on rapidapi.com)

### ✅ Fix 12 — newsletterManager.js — Daily public newsletter
**Done.** New module `newsletterManager.js` + wired into `index.js` and `agentEngine.js`.
- Publishes one entry daily at 8pm to `website/newsletter.html`
- Gathers real context: CRM stats, agent runs, lessons learned, client sites, emails sent
- Generates 4 sections via GPT-4o-mini: What I Worked On, Lessons Learned, Key Metrics, AI Business Tip
- Prepends new entries (newest first), skips if already published today
- Deploys via `gitDeploy.js` after writing
- Discord: `!newsletter`, `!newsletter force`, `!newsletter status`
- Agent tool: `publish_newsletter` (with optional `force: true`)

### ✅ Fix 15 — stockScanner.js — Full market swing trading scanner
**Done.** Two-tier scanner covering the entire market, not just a watchlist.
- **Tier 1 — Market Screen (Finviz, hourly):** Pre-filters all ~8,000 US stocks server-side via 9 Finviz screener queries. Returns only matching candidates (~10–100 per screen). Confirms each with Yahoo Finance. No API key.
- **Tier 2 — Watchlist Scan (Yahoo Finance, every 15 min):** Full indicator calculation on personal watchlist for close tracking.
- Finviz screens: RSI oversold/overbought, gap up/down, MACD bull/bear cross, volume spike 2x, near 52-week high/low. All filtered to avg volume > 200k.
- Yahoo Finance `yahoo-finance2` was tried but dropped (ESM-only, incompatible with CommonJS project). Uses raw `axios` instead.
- 20-minute data cache — if a stock appears in multiple Finviz screens, only one Yahoo Finance fetch
- Batched concurrent requests (5 at a time) to confirm candidates fast
- 2-hour dedup cooldown per signal per symbol
- Alerts tagged with source: _(market screen)_ vs watchlist
- Alerts go to `#stock-alerts` (ID: 1481759964359033024)
- Discord: `!scan now`, `!scan market`, `!scan watchlist`, `!scan status`, `!watchlist add/remove/show`, `!alerts on/off`, `!rules show`
- Schedule: 8am pre-market (both), market screen hourly + watchlist every 15 min, 4:30pm summary
- **Only dep:** `technicalindicators` (already installed)

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
| IMAP_HOST | ✅ defaults to imap.zoho.com (set explicitly if needed) |
| IMAP_PORT | ✅ defaults to 993 |
| GOOGLE_PLACES_API_KEY | ❌ Not set — needed for !leads scrape |
| UNSPLASH_ACCESS_KEY | ✅ Set |
| ELEVENLABS_API_KEY | ❌ Not set — future voice AI upgrade for chatbots |
| RAPIDAPI_KEY | ❌ Not set — needed for !x scan (subscribe to twitter-api45 on rapidapi.com) |

**Mailgun removed** — email now uses Zoho SMTP via nodemailer.

---

## Lessons Learned
These are loaded from `lessons.json` and injected into every agent prompt automatically.
Jordan checks these before every task — update the file if new mistakes are discovered.

| # | Category | Lesson |
|---|----------|--------|
| 1 | assets | When user uploads images via Discord, call `upload_client_assets` with the attachment URL FIRST, then build/re-render |
| 2 | assets | Always check `website/clients/[slug]/assets.json` for client-uploaded images before using Unsplash — client assets have highest priority |
| 3 | assets | Before building any client site, check `website/clients/[slug]/assets/` for uploaded files — these override all defaults |
| 4 | discord | When message contains `[Discord attachments]`, NEVER say "I cannot see the image" — use `upload_client_assets` with the URL |
| 5 | assets | `place_asset_on_site` re-rendered locally but never deployed (site.json stores `deploy:false`). Fixed: `placeAssetOnSite()` now always calls `deployWebsite()` directly after re-rendering |
| 6 | assets | Mandatory order: (1) `create_client_website` → (2) `upload_client_assets` → (3) `place_asset_on_site`. Calling `place_asset_on_site` before `create_client_website` fails with "site.json missing" |

Add new lessons via:
- `!learn "lesson text"` (Discord command)
- `learn_lesson` tool (Jordan saves mid-task)
- Edit `lessons.json` directly

---

## Stock Trading System

A personal swing trading scanner — not part of the agency business, runs alongside it.

### Files

| File | Purpose |
|------|---------|
| `stockScanner.js` | Main module — fetches data, calculates indicators, sends alerts, runs schedule |
| `stockRules.json` | Configurable signal thresholds + swing trading entry/exit notes |
| `watchlist.json` | Symbols to scan + `alertsEnabled` flag |

### APIs

**No API keys required.**

| API | Used for | Key needed? |
|-----|----------|-------------|
| Finviz screener | Pre-filtering entire ~8,000 stock market by RSI, gaps, MACD, volume, 52-week | None |
| Yahoo Finance chart API (via axios) | Historical OHLCV data + real-time quotes for candidates | None |

`technicalindicators` npm package handles all RSI/EMA/MACD math locally.

`yahoo-finance2` npm package was tried but dropped — it's ESM-only and incompatible with this CommonJS project. Raw axios calls to Yahoo's chart API work identically.

### Discord Commands

| Command | What it does |
|---------|-------------|
| `!scan now` | Run full market screen + watchlist scan |
| `!scan market` | Run Finviz market screen only (~2-3 min) |
| `!scan watchlist` | Run watchlist scan only |
| `!scan status` | Show last run times, candidate counts, alert counts |
| `!watchlist add AAPL TSLA NVDA` | Add to close-tracking watchlist |
| `!watchlist remove AAPL` | Remove from watchlist |
| `!watchlist show` | Show watchlist + alert status |
| `!alerts on` / `!alerts off` | Enable or disable all alerts |
| `!rules show` | Display thresholds + list of active Finviz screens |

Alerts post to `#stock-alerts` (channel ID: `1481759964359033024`).
Market screen alerts are tagged with _(market screen)_ so you know where they came from.

### Scanning Schedule (EST, weekdays only)

| Time | Action |
|------|--------|
| 8:00 AM | Market screen (Finviz) + watchlist scan |
| 9:30 AM | Market screen + watchlist scan (market open) |
| Every hour (10am, 11am, 12pm...) | Market screen + watchlist scan |
| Every 15 min between hours | Watchlist scan only |
| 4:30 PM | After-hours summary (daily % change for all watchlist symbols) |

### Signals Detected

| Signal | Finviz pre-filter | Yahoo Finance confirmation |
|--------|-------------------|--------------------------|
| RSI Oversold | `rsi_os30` | RSI(14) < 30 |
| RSI Overbought | `rsi_ob70` | RSI(14) > 70 |
| EMA Cross Above/Below | _(watchlist only)_ | Price crosses EMA 20, 50, or 200 |
| MACD Bullish Cross | `ta_macd_sb` | MACD line crosses above signal |
| MACD Bearish Cross | `ta_macd_bb` | MACD line crosses below signal |
| Volume Spike | `sh_relvol_o2` | Current volume ≥ 2x 20-day avg |
| 52-Week High | `ta_highlow52w_nh` | Price within 1% of 52-week high |
| 52-Week Low | `ta_highlow52w_nl` | Price within 1% of 52-week low |
| Gap Up/Down | `ta_gap_u5` / `ta_gap_d5` | Open ≥ 5% above/below prior close |

All Finviz screens include `sh_avgvol_o200` (avg volume > 200k) to filter out illiquid stocks.
Alerts deduplicate — same signal on the same stock won't re-fire within 2 hours.

### How to Modify Trading Rules

Edit `stockRules.json` directly. Key fields:

```json
{
  "rsi":      { "oversold": 30, "overbought": 70 },
  "ema":      { "periods": [20, 50, 200] },
  "volume":   { "spikeMultiplier": 2.0 },
  "gap":      { "minPct": 5.0 },
  "breakout": { "nearHighPct": 1.0 }
}
```

The `swingTrading` section at the bottom is notes-only (not enforced by code) — update it as your strategy evolves.

To add a new symbol: `!watchlist add SYMBOL` in Discord, or edit `watchlist.json` directly.

---

## How to Resume in a New Session
1. Read this file first
2. Check Fix Status above to see where we left off
3. Read `lessons.json` — Jordan's learned mistakes and fixes
4. Read the specific file(s) for the next TODO fix before editing
5. Update this file after each fix is confirmed working
