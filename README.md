# Mandy's Laundry — SEO Automation System

Production-grade automation that generates SEO content, publishes pages, submits them for Google indexing, and notifies the Oscar Team via Telegram at every step.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in all values in .env (see Configuration section below)

# 3. Start the system
npm start
```

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                    src/index.js                        │
│           Main Entry Point + Graceful Shutdown         │
└────────────────┬───────────────────────────────────────┘
                 │
     ┌───────────┴──────────┐
     │                      │
┌────▼──────┐       ┌───────▼───────┐
│ Scheduler │       │ WorkflowWorker │
│ (cron)    │       │ (queue poller) │
└────┬──────┘       └───────┬───────┘
     │                      │
     └──────────┬───────────┘
                │
     ┌──────────▼───────────┐
     │   ContentWorkflow    │
     │  generate→publish→   │
     │       index          │
     └──┬──────┬──────┬─────┘
        │      │      │
┌───────▼┐ ┌───▼───┐ ┌▼──────────┐
│Content │ │Publish│ │ Indexing  │
│Generator│ │Service│ │ Service   │
│(Claude)│ │  (WP) │ │ (Google)  │
└────────┘ └───────┘ └───────────┘
        │      │      │
        └──────┼──────┘
               │
   ┌───────────▼──────────────┐
   │      Support Layer       │
   ├──────────┬───────────────┤
   │ Telegram │    Logger     │
   │ Service  │  (Winston)    │
   ├──────────┼───────────────┤
   │ Database │    Retry      │
   │ (SQLite) │   Service     │
   ├──────────┼───────────────┤
   │ Health   │     Git       │
   │ Monitor  │   Service     │
   └──────────┴───────────────┘
```

---

## Notification Events

Every event sends a formatted Telegram message to the Oscar Team group:

| Event | Emoji | Trigger |
|-------|-------|---------|
| Page Created | 🚀 | Content job starts |
| Content Generated | ✅ | AI writes the page |
| Page Published | ✅ | WordPress publish succeeds |
| Indexing Submitted | 📈 | Google API call sent |
| Page Indexed | 📈 | Google confirms receipt |
| Publish Failed | ❌ | After all retries exhausted |
| Generation Failed | ❌ | AI generation error |
| Indexing Failed | ❌ | Google API error |
| Workflow Error | ⚠️ | Unexpected system error |
| Retry Attempt | ⚠️ | Before each retry |
| Workflow Completed | ✅ | Full pipeline done |
| Health Alert | 🚨 | Service down >5 min |
| Health Recovered | ✅ | Service back up |
| Daily Summary | 📊 | Every day at 8:00 AM PT |
| System Started | 🚀 | On boot |
| System Stopped | 🛑 | On shutdown |

---

## Configuration

Copy `.env.example` to `.env` and fill in these values:

### Required

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Get from @BotFather on Telegram |
| `TELEGRAM_CHAT_ID` | Already set to `-5572635670` |
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `WORDPRESS_API_URL` | e.g. `https://mandyslaundry.com/wp-json/wp/v2` |
| `WORDPRESS_USERNAME` | WordPress admin username |
| `WORDPRESS_APP_PASSWORD` | WordPress Application Password |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PAGES_PER_RUN` | `5` | Pages generated per scheduled batch |
| `CONTENT_MODEL` | `claude-haiku-4-5-20251001` | Claude model for content |
| `DAILY_SUMMARY_CRON` | `0 8 * * *` | When to send daily report |
| `HEALTH_CHECK_CRON` | `*/5 * * * *` | Health check frequency |
| `CONTENT_GEN_CRON` | `0 6 * * *` | When to generate content |
| `MAX_RETRY_ATTEMPTS` | `3` | Retries before giving up |
| `GIT_AUTO_PUSH` | `true` | Auto-commit + push after each workflow |

---

## Google Indexing API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a Service Account with **Web Search Indexing API** access
3. Download the JSON key file
4. Save it as `config/google-service-account.json`
5. Add the service account email as an **Owner** in Google Search Console

---

## Telegram Bot Setup

1. Message @BotFather on Telegram
2. Send `/newbot` and follow instructions
3. Copy the token to `TELEGRAM_BOT_TOKEN` in `.env`
4. Add the bot to your **Oscar Team notification** group
5. The Chat ID is already configured: `-5572635670`

---

## Daily Summary Example

```
📊 Mandy's Laundry Daily Report

📅 Date: 2026-06-27

📝 Pages Created: 5
✅ Pages Published: 5
📈 Pages Indexed: 4
❌ Failed: 0
⏳ Pending: 1
🔄 Retries: 1

📊 Publishing Success Rate: 100%
📊 Indexing Success Rate: 80%

⏱ Avg Publish Time: 3.42s
⏱ Avg Index Time: 1.18s

🕐 Reported: 6/27/2026, 8:00:00 AM
```

---

## Health Monitoring

The system checks every 5 minutes:

- ✅ Database (SQLite)
- ✅ Telegram Bot (API ping)
- ✅ WordPress API (HTTP check)
- ✅ Anthropic API (auth check)
- ✅ Queue Worker (pending job count)

If any service fails to respond for 5 minutes, the team gets an immediate Telegram alert. When it recovers, another notification confirms it.

---

## Retry Logic

All three pipeline stages (generate, publish, index) use exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1st retry | 5 seconds |
| 2nd retry | 10 seconds |
| 3rd retry | 20 seconds |

A Telegram notification is sent before each retry.

---

## Logging

Logs are written to `logs/` with daily rotation and 30-day retention:

- `automation-YYYY-MM-DD.log` — all events (JSON)
- `errors-YYYY-MM-DD.log` — errors only

Each log entry includes: timestamp, level, service, action, website, URL, status, duration, error, retry count.

---

## Git Auto-Push

After each successful workflow, the system automatically:

```bash
git add .
git commit -m "chore(automation): published 'Page Title' [2026-06-27]"
git push origin main
```

After the daily summary:

```bash
git commit -m "chore(report): daily summary 2026-06-27 — created:5 published:5 indexed:4 failed:0"
```

---

## Dashboard Metrics

Call `metrics.getDashboard()` programmatically or expose it via an HTTP endpoint:

```json
{
  "timestamp": "2026-06-27T14:30:00.000Z",
  "overview": {
    "total_pages": 142,
    "pages_published_today": 5,
    "pages_indexed_today": 4,
    "failed_jobs": 0,
    "queue_length": 0
  },
  "today": {
    "pages_created": 5,
    "pages_published": 5,
    "pages_indexed": 4,
    "pages_failed": 0,
    "retries_performed": 1,
    "errors_encountered": 0,
    "avg_publish_time_sec": "3.42",
    "avg_index_time_sec": "1.18"
  },
  "success_rates": {
    "publishing": 100,
    "indexing": 80
  }
}
```

---

## Troubleshooting

**Telegram messages not arriving**
- Check `TELEGRAM_BOT_TOKEN` is correct
- Ensure the bot is a member of the group
- Verify `TELEGRAM_CHAT_ID` matches the group

**Content generation fails**
- Verify `ANTHROPIC_API_KEY` is valid
- Check API quota at console.anthropic.com

**Publishing fails with 401**
- WordPress Application Password must be generated from WP Admin → Users → Profile
- Not the same as your login password

**Google Indexing fails**
- Confirm `config/google-service-account.json` exists
- Verify the service account has been added to Search Console as Owner
- Check the service account has the Indexing API enabled

**Run a manual health check:**
```bash
npm run health-check
```

**Run a manual daily summary:**
```bash
npm run daily-summary
```
