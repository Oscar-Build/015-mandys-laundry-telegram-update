# WordPress Plugin Research — SEO / AEO / GEO / Speed / Conversion
## Mandy's Laundry Automation Platform

---

## 1. SEO (Search Engine Optimization)

**Rule:** Never run two full SEO plugins together (Rank Math + Yoast + AIOSEO, etc.) — it causes duplicate titles, conflicting schema, and sitemap/canonical issues. Pick one.

### ✅ RECOMMENDED FREE: Rank Math SEO
- **Install:** WordPress Admin → Plugins → Add New → "Rank Math SEO" (`seo-by-rank-math`)
- **Why:** Free tier includes unlimited keyword optimization per post, redirect manager, 404 monitor, Google Search Console data inside WP, Google Analytics 4 integration, 18 schema types, and local SEO (business hours, maps, multi-location). Yoast gates redirects, multiple focus keywords, and GSC integration behind its paid tier — Rank Math gives them free.
- **AEO/GEO bonus:** Built-in FAQ/HowTo/Article schema feeds AI Overviews and featured snippets directly.
- **Works with our automation:** Does NOT conflict with our injected Article/LocalBusiness/FAQ schema.

### Pricing comparison (why Rank Math over Yoast for a multi-site operator)
| Plugin | Free tier | Paid | Multi-site cost |
|---|---|---|---|
| **Rank Math** | Unlimited keywords, redirects, 404 monitor, GSC, GA4, 18 schema types | Pro $59/yr (unlimited personal sites), Business ~$252/yr for 100 sites | ~$59–252/yr total |
| **Yoast SEO** | 1 focus keyword, basic schema, XML sitemap | Premium $118.80/yr **per site** | 50 sites = ~$4,950/yr |
| **SEOPress** | Lightweight (~49KB frontend output), solid schema | Pro ~$49/yr, unlimited sites | ~$49/yr total |

**Verdict:** Rank Math free tier covers 90%+ of needs. If Mandy's ever expands to multiple sites, Rank Math or SEOPress scale far cheaper than Yoast.

---

## 2. AEO (Answer Engine Optimization) & GEO (Generative Engine Optimization)

**Key insight:** A traditional SEO plugin (Rank Math, Yoast, etc.) does **not** cover AEO/GEO well — it optimizes for classic ranking signals, not AI citation. AEO/GEO is a separate layer: getting cited by ChatGPT, Perplexity, Google AI Overviews, and Claude/Gemini answers.

### ✅ RECOMMENDED FREE: AEO God Mode
- **What it is:** Free WordPress plugin built specifically for Answer Engine Optimization — runs *alongside* Yoast, Rank Math, SEOPress, or AIOSEO without conflict, and imports their existing settings on install. It never overwrites titles, meta, canonicals, or sitemaps.
- **What it does:** Auto-generates an `llms.txt` file (a machine-readable summary of your site's key content for AI agents to read), plus a schema engine covering FAQ, HowTo, Article, Product, Organization, and E-E-A-T author-authority schema. Handles AI crawler management and citation tracking from one dashboard.
- **Install:** WordPress Admin → Plugins → Add New → search "AEO God Mode" (`aeo-god-mode`)
- **Note:** Our automation already injects FAQPage schema on landing pages — AEO God Mode adds the llms.txt + citation layer on top of that, which nothing else in our stack covers.
- Source: [wordpress.org/plugins/aeo-god-mode](https://wordpress.org/plugins/aeo-god-mode/)

### FREE: Schema & Structured Data for WP & AMP (`schema-and-structured-data-for-wp`)
- Adds 35+ schema types via a visual builder — useful for anything Rank Math/AEO God Mode don't cover.

### GEO is a content + schema strategy, not a plugin:
| Signal | How We Handle It |
|---|---|
| E-E-A-T (Experience, Expertise, Authority, Trust) | Author bios, About page, NAP consistency, AEO God Mode author schema |
| Entity clarity | LocalBusiness schema (already injected) |
| Citation-worthy content | 1,200–1,800 word posts with sources |
| FAQ sections | FAQ schema (already injected on landing pages) |
| Topical authority | Publishing 3 posts/day across laundry topics |
| Structured data | Article + LocalBusiness + FAQ (already injected) + llms.txt (AEO God Mode) |

### PAID (optional): Schema Pro ($79/yr — Brainstorm Force)
- Drag-and-drop schema builder for LocalBusiness/Product/Review/Service — worth it for Mandy's if deeper local schema is needed later.

---

## 3. Mobile Speed Optimization

Google ranks mobile speed heavily via Core Web Vitals. Target: LCP < 2.5s, CLS < 0.1, INP < 200ms.

### ✅ RECOMMENDED FREE: LiteSpeed Cache
- **Why free wins here:** LiteSpeed Cache is 100% free with no pro tier and no hidden costs, and works directly with the LiteSpeed server layer (not just the WP application layer), giving lower server resource use and a faster Time To First Byte than file-based cache plugins.
- **Catch:** Its caching engine only works on LiteSpeed servers. **Mandy's is hosted on Cloudways with a LiteSpeed stack, so this applies.**
- Includes built-in image compression + WebP conversion (no separate plugin needed).
- **Plugin slug:** `litespeed-cache`

### Alternative PAID: WP Rocket ($59/yr, single site)
- Fastest setup (5–15 min, good defaults out of the box), works on any host (not LiteSpeed-dependent), includes database optimization and an optional CDN add-on ($7.99/mo).
- **Verdict:** Only worth it if we move off a LiteSpeed host. On Cloudways, LiteSpeed Cache matches or beats it for free.

### FREE: Smush (Image Optimization) — `wp-smushit`
- Auto-compresses images, converts to WebP, lazy loads. Free limit: 50 images/batch (unlimited with Pro, $9/mo). Redundant if LiteSpeed Cache's built-in image tool is used instead.

### FREE: Autoptimize — `autoptimize`
- Minifies/combines CSS/JS/HTML. Pairs with LiteSpeed Cache for extra minification control.

Sources: [OnlineMediaMasters – LiteSpeed vs WP Rocket](https://onlinemediamasters.com/litespeed-cache-vs-wp-rocket/), [WP Rocket – LiteSpeed vs WP Rocket](https://wp-rocket.me/litespeed-cache-vs-wp-rocket/)

---

## 4. High-Converting Website Performance

### ✅ RECOMMENDED FREE: Elementor + WPForms Lite
- **Elementor Free** (`elementor`) — drag-and-drop page builder for high-converting landing pages without code.
- **WPForms Lite** (`wpforms-lite`) — contact/quote forms with spam protection. Paid WPForms starts at $49.50/yr with payment integration and pre-built templates.

### FREE: Really Simple SSL (`really-simple-ssl`)
- Forces HTTPS sitewide — required trust signal for conversions and Google rankings.

### FREE: HubSpot CRM (`leadin`)
- Free CRM, form builder, live chat, pop-ups, email marketing — tracks form submissions and calls in one dashboard.

### PAID options, ranked by what Mandy's actually needs:
| Plugin | Cost | Best for |
|---|---|---|
| **Thrive Leads** | $99/yr | Advanced opt-in forms, A/B testing, per-page conversion tracking |
| **OptinMonster** | Paid (used by 700k+ sites) | Exit-intent popups, A/B testing — the category leader for lead capture |
| **SeedProd** | Paid | Dedicated high-converting landing page builder with A/B testing built in |
| **Hotjar** | Free tier available | Heatmaps + session recordings to see exactly where visitors drop off before converting |
| **MonsterInsights Pro** | $199/yr | GA4 in-dashboard: form submissions, phone clicks, scroll depth (free version: `google-analytics-for-wordpress`) |

**Verdict for Mandy's:** Start free (Elementor + WPForms Lite + HubSpot CRM + Really Simple SSL). Add **Hotjar** free tier first if you want to see *why* pages aren't converting before paying for Thrive Leads/OptinMonster — cheaper way to find the real bottleneck.

Sources: [CyberChimps – Conversion Optimization Plugins 2026](https://cyberchimps.com/blog/increase-conversions-on-your-wordpress-website/), [weDevs – Best Conversion Plugins 2026](https://wedevs.com/blog/159135/best-wordpress-plugins-to-boost-conversion/)

---

## Installation Priority for Mandy's Laundry

| Priority | Plugin | Cost | Why |
|---|---|---|---|
| 1 | **Rank Math SEO** | Free | SEO + schema, sitemap, meta tags, GSC/GA4 in-dashboard |
| 2 | **AEO God Mode** | Free | llms.txt + AI citation layer — nothing else in the stack covers this |
| 3 | **LiteSpeed Cache** | Free | Speed — matches Mandy's Cloudways LiteSpeed hosting |
| 4 | **WPForms Lite** | Free | Contact/quote form submissions |
| 5 | **Really Simple SSL** | Free | Force HTTPS |
| 6 | **HubSpot CRM** | Free | Track forms + calls + live chat |
| 7 | **Hotjar (free tier)** | Free | Find conversion bottlenecks before paying for anything |
| 8 | Schema Pro | $79/yr | Advanced LocalBusiness + Service schema, if needed later |
| 9 | Thrive Leads or OptinMonster | $99+/yr | Only after Hotjar shows where leads are actually dropping off |

---

## Notes on Our Existing Automation

The platform already injects the following directly into post content — no plugin needed for these:
- `Article` schema (blog posts)
- `LocalBusiness` schema (landing pages)
- `FAQPage` schema (landing pages)
- `meta title` + `meta description` (via WordPress REST API)

Installing Rank Math handles sitemaps, breadcrumbs, and page-level SEO. Installing AEO God Mode adds the llms.txt/citation layer. Neither conflicts with our injected schema.

---
*Last updated: 2026-07-01 | Mandy's Laundry SEO Automation Platform*
