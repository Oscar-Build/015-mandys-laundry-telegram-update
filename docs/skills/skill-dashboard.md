# Skill: SEO Dashboard — GitHub Pages + WordPress
## Mandy's Laundry Automation Platform

---

## What This Skill Does
Maintains two dashboard surfaces showing real-time SEO KPIs:
1. **GitHub Pages dashboard** — `https://oscar-build.github.io/015-mandys-laundry-telegram-update/`
2. **WordPress dashboard page** — `https://mandyslaundry.com/seo-dashboard/`

Data is refreshed daily at 6:10 AM PST via GitHub Actions and stored in `data.json`.

---

## Dashboard KPIs
### Publishing
- Total published (all time)
- Published this week
- Published today

### Indexing
- Published but NOT indexed (⚠️ flags pages 3+ days old without Google index)

### Landing Pages
- Total / this week / today

### Search Console (28 days)
- Impressions, Clicks, CTR, Avg Position

### Analytics (28 days)
- Sessions, Organic sessions, Conversions, Bounce rate

---

## Key Files
| File | Purpose |
|---|---|
| `index.html` | GitHub Pages dashboard (static, reads data.json) |
| `scripts/generate-dashboard-data.js` | Generates data.json from WP API + GSC + GA4 |
| `.github/workflows/update-dashboard-data.yml` | Runs daily at 6:10 AM PST |
| `scripts/build-wp-dashboard.js` | Creates/updates the WordPress dashboard page |

---

## How to Rebuild the WordPress Dashboard Page
```bash
node scripts/build-wp-dashboard.js
```

---

## How to Update Dashboard Data Manually
Go to GitHub → Actions → "Update Dashboard Data" → Run workflow

---

## Required GitHub Secrets
| Secret | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_REFRESH_TOKEN` | Generated via `node scripts/get-google-token.js` |
| `GOOGLE_GA4_PROPERTY_ID` | From GA4 property settings |
| `SITE_URL` | `sc-domain:mandyslaundry.com` |
| `WORDPRESS_API_URL` | `https://mandyslaundry.com/wp-json/wp/v2` |
| `WORDPRESS_USERNAME` | WP admin username |
| `WORDPRESS_APP_PASSWORD` | WP application password |

---

## How to Refresh the Google Token (when GSC/GA4 stop showing data)
```bash
node scripts/get-google-token.js
```
Then copy `new-refresh-token.txt` → paste into GitHub Secret `GOOGLE_REFRESH_TOKEN` → delete the .txt file.

---

## Smoke Signal Checks
- If dashboard shows "Not connected yet" for GSC → token expired, re-run token script
- If blog post counts are 0 → WP API credentials may have changed
- If `data.json` is not updating → check GitHub Actions for failures

---
*Skill maintained by: Coworks | Platform: Mandy's Laundry SEO Automation*
