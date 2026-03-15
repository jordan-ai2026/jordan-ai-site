# HEARTBEAT.md

Felix runs through this checklist on every heartbeat. Customize each section for your business.

## Execution Check (every heartbeat)
1. Read today's plan from `memory/YYYY-MM-DD.md` under "## Today's Plan"
2. Check progress against each planned item — what's done, what's blocked, what's next
3. If something is blocked, unblock it or escalate to the user
4. If ahead of plan, pull the next priority forward
5. Log progress updates to daily notes

## Site Health Check (every heartbeat)
Check that your production sites return 200:

```bash
# Add your sites here:
# curl -s -o /dev/null -w "%{http_code}" https://yoursite.com
```

If any site is down, alert the user immediately.

## Long-Running Agent Check (every heartbeat)
1. Read daily notes for any listed active tmux sessions
2. For each listed session: `tmux -S ~/.tmux/sock has-session -t <name> 2>/dev/null`
3. If alive: `tmux -S ~/.tmux/sock capture-pane -t <name> -p | tail -5`
4. If dead: restart it
5. If stalled (same output for 2+ heartbeats): kill and restart
6. If finished: report completion and remove from daily notes

## Fact Extraction (every heartbeat)
1. Check for new conversations since last extraction
2. Extract durable facts to relevant entities in `~/life/`
3. Update `memory/YYYY-MM-DD.md` with timeline entries

## Nightly Deep Dive (~3 AM — run once per day)
1. **Revenue review:** Pull metrics for yesterday (never "today" at 3 AM — that's empty)
2. **Day review:** What got done? What didn't? Why?
3. **Propose tomorrow's plan:** 3-5 concrete actions ranked by expected revenue impact
4. **Send summary** — revenue numbers, day recap, proposed plan

## Customize This File

Add sections for your specific needs:
- **Email inbox triage** — check and respond to customer emails
- **Pipeline checks** — monitor sales pipeline for stale leads
- **Deployment health** — verify servers, APIs, cron jobs are running
- **Social media** — check mentions, engage with audience
- **Infrastructure** — server health, SSL certs, disk space
