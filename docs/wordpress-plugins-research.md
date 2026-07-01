# WordPress Plugin Research — SEO / AEO / GEO / Speed / Conversion
## Mandy's Laundry Automation Platform

---

## 1. SEO (Search Engine Optimization)

### ✅ RECOMMENDED FREE: Rank Math SEO
- **Install:** WordPress Admin → Plugins → Add New → "Rank Math SEO"
- **Why:** Best all-around free SEO plugin. Schema markup, sitemap, breadcrumbs, meta tags, redirects, 404 monitor, local SEO module.
- **AEO/GEO bonus:** Built-in FAQ/HowTo/Article schema — directly feeds AI Overviews and featured snippets.
- **Works with our automation:** Does NOT conflict with our injected Article/LocalBusiness/FAQ schema.
- **Plugin slug:** `seo-by-rank-math`

### PAID Upgrade: Rank Math Pro ($59/yr)
- Adds: Content AI suggestions, keyword rank tracker, Google Search Console integration in WP admin, schema templates, WooCommerce SEO.
- **Verdict:** Free version covers 90% of needs. Upgrade only if you want rank tracking inside WP.

### Alternative Free: Yoast SEO
- Traditional choice, slightly less schema coverage than Rank Math.
- **Plugin slug:** `wordpress-seo`

---

## 2. AEO (Answer Engine Optimization)

AEO targets voice search, Siri, Alexa, Google Assistant, and featured snippets. Key signals: FAQ schema, HowTo schema, direct-answer content.

### ✅ RECOMMENDED FREE: Rank Math (covers AEO via schema)
Already listed above. Rank Math's FAQ blocks and schema builder are the primary AEO tool.

### FREE: Schema & Structured Data for WP & AMP
- Adds 35+ schema types via a visual builder.
- Best for adding custom schema types Rank Math doesn't cover.
- **Plugin slug:** `schema-and-structured-data-for-wp`

### FREE: WP Speakr (Voice Search Optimization)
- Adds voice search markup and question-targeting optimization.
- **Plugin slug:** `wp-speakr`

### PAID: Schema Pro ($79/yr — Brainstorm Force)
- Drag-and-drop schema builder, 20+ schema types, auto-maps fields.
- Best for: LocalBusiness, Product, Review, Service schemas.
- **Worth it for Mandy's:** YES — the LocalBusiness + Service schemas directly help local AEO.

---

## 3. GEO (Generative Engine Optimization)

GEO targets ChatGPT, Perplexity, Google AI Overviews (SGE), Claude, and Gemini. Key signals: E-E-A-T, entity clarity, citation-worthy content, structured data, topical authority.

### ✅ No single plugin covers GEO — it's a content + schema strategy:

| Signal | How We Handle It |
|---|---|
| E-E-A-T (Experience, Expertise, Authoritativeness, Trust) | Author bios, About page, NAP consistency |
| Entity clarity | LocalBusiness schema (already injected) |
| Citation-worthy content | 1200–1800 word posts with sources |
| FAQ sections | FAQ schema (already injected on landing pages) |
| Topical authority | Publishing 3 posts/day across laundry topics |
| Structured data | Article + LocalBusiness + FAQ (already injected) |

### FREE: WordLift (Limited Free)
- Adds semantic markup and knowledge graph entities.
- Helps AI search engines understand your content as authoritative.
- **Plugin slug:** `wordlift`
- **Free tier:** 1 site, limited entities.

### PAID: WordLift Pro ($79/mo)
- Full knowledge graph, entity linking, AI-generated schema, Wikidata integration.
- **Verdict for Mandy's:** Expensive for this stage. Skip for now — our injected schema covers the basics.

---

## 4. Mobile Speed Optimization

Google ranks mobile speed heavily (Core Web Vitals). Target: LCP < 2.5s, CLS < 0.1, INP < 200ms.

### ✅ RECOMMENDED FREE: WP Rocket (PAID only, but best) → Use LiteSpeed Cache (Free)
- **LiteSpeed Cache** — Best FREE caching plugin. Page cache, object cache, image optimization, CSS/JS minification, lazy load.
  - **Plugin slug:** `litespeed-cache`
  - **Works best on:** Cloudways LiteSpeed servers (which Mandy's uses ✅)

### FREE: Smush (Image Optimization)
- Auto-compresses uploaded images, converts to WebP, lazy loads.
- **Plugin slug:** `wp-smushit`
- **Free limit:** 50 images/batch. Unlimited with Pro ($9/mo).

### FREE: Autoptimize
- Minifies and combines CSS/JS/HTML. Pairs well with LiteSpeed Cache.
- **Plugin slug:** `autoptimize`

### PAID: WP Rocket ($59/yr — WP Media)
- Best all-in-one speed plugin. Cache, minify, lazy load, preload, CDN integration, database optimization.
- **Verdict:** If budget allows, WP Rocket + Smush Pro = fastest possible WP setup.

---

## 5. High-Converting Website Performance

### ✅ RECOMMENDED FREE: Elementor (Free) + WPForms Lite
- **Elementor Free:** Drag-and-drop page builder. Build high-converting landing pages without code.
  - **Plugin slug:** `elementor`
- **WPForms Lite:** Contact/quote forms with spam protection.
  - **Plugin slug:** `wpforms-lite`

### FREE: HubSpot CRM (WordPress Plugin)
- Free CRM, form builder, live chat, email marketing, pop-ups, analytics.
- Tracks form submissions + calls in one dashboard.
- **Plugin slug:** `leadin`

### FREE: Really Simple SSL
- Forces HTTPS sitewide. Required for trust signals and Google rankings.
- **Plugin slug:** `really-simple-ssl`

### PAID: Thrive Leads ($99/yr — Thrive Themes)
- Advanced opt-in forms, A/B testing, conversion tracking by page.
- Best for: Growing email list, tracking which landing pages convert best.

### PAID: MonsterInsights Pro ($199/yr)
- Google Analytics 4 directly in WP dashboard. Tracks: form submissions, phone clicks, scroll depth, eCommerce.
- **Verdict for Mandy's:** Useful once GA4 is fully connected. Free version available.
  - **Plugin slug (free):** `google-analytics-for-wordpress`

---

## Installation Priority for Mandy's Laundry

| Priority | Plugin | Cost | Why |
|---|---|---|---|
| 1 | **Rank Math SEO** | Free | SEO + AEO schema, sitemap, meta tags |
| 2 | **LiteSpeed Cache** | Free | Speed (works with Cloudways) |
| 3 | **Smush** | Free | Image compression + WebP |
| 4 | **WPForms Lite** | Free | Contact/quote form submissions |
| 5 | **Really Simple SSL** | Free | Force HTTPS |
| 6 | **HubSpot CRM** | Free | Track forms + calls + live chat |
| 7 | Schema Pro | $79/yr | Advanced LocalBusiness + Service schema |
| 8 | WP Rocket | $59/yr | Best speed plugin if budget allows |

---

## Notes on Our Existing Automation

The platform already injects the following directly into post content — no plugin needed for these:
- `Article` schema (blog posts)
- `LocalBusiness` schema (landing pages)
- `FAQPage` schema (landing pages)
- `meta title` + `meta description` (via WordPress REST API)

Installing Rank Math will handle sitemaps, breadcrumbs, and page-level SEO — complementing the content-level schema we already inject.

---
*Last updated: 2026-07-01 | Mandy's Laundry SEO Automation Platform*
