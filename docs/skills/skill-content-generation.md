# Skill: Content Generation — Blog Posts & Landing Pages
## Mandy's Laundry Automation Platform

---

## What This Skill Does
Automatically generates SEO-optimized blog posts (1,200–1,800 words) and local landing pages, publishes them to WordPress, submits them to Google Indexing API, and sends Telegram notifications with clickable links.

---

## Schedule
| Job | Time (PST) | Rate |
|---|---|---|
| Blog post generation | 6:00 AM daily | 3 posts/day |
| Landing page generation | 6:30 AM daily | 2 pages/day |

---

## Key Files
| File | Purpose |
|---|---|
| `src/services/BlogGenerator.js` | AI prompt + WordPress publish for blog posts |
| `src/services/LandingPageGenerator.js` | AI prompt + WordPress publish for landing pages |
| `src/workers/ContentWorker.js` | Orchestrates batch runs, calls generators |
| `src/scheduler/jobs/` | Cron wiring |

---

## How to Change Post Volume
Edit `.env`:
```
PAGES_PER_RUN=3          # blog posts per day
LANDING_PAGES_PER_RUN=2  # landing pages per day
```

---

## How to Change Word Count Target
In `src/services/BlogGenerator.js` and `src/services/LandingPageGenerator.js`, find the content field in the AI prompt and update the word range. Currently: `1200-1800 words`.

Also update `max_tokens` if increasing beyond 1800 words (currently `6000`).

---

## Content Quality Rules
- Minimum: 1,200 words
- Target: 1,200–1,800 words
- Primary keyword used 4–6 times naturally
- Must include: H2/H3 headings, bullet lists, internal links, CTA
- Schema injected automatically: Article schema (blogs), LocalBusiness + FAQPage (landing pages)

---

## Troubleshooting
| Symptom | Fix |
|---|---|
| Posts not generating | Check `ANTHROPIC_API_KEY` in `.env` |
| Posts not publishing to WP | Check `WORDPRESS_API_URL`, `WORDPRESS_USERNAME`, `WORDPRESS_APP_PASSWORD` |
| Indexing not submitting | Check `GOOGLE_REFRESH_TOKEN` has `indexing` scope |
| Telegram not notifying | Check `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` |

---

## Smoke Signal Checks
Run weekly:
1. Check WordPress post count vs DB post count — should match
2. Check that recent posts have `indexed` status in DB
3. Check Telegram for any `❌ Publish Failed` notifications

---
*Skill maintained by: Coworks | Platform: Mandy's Laundry SEO Automation*
