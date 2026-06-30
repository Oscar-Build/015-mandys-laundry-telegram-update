'use strict';

require('dotenv').config();

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || './data/automation.db';
const db = new DatabaseSync(path.resolve(process.cwd(), DB_PATH));

console.log('Seeding sample data into:', DB_PATH);

// --- Helper ---
function run(sql, params = {}) {
  db.prepare(sql).run(params);
}

// ── Pages (Blog Posts) ────────────────────────────────────────────────────────
const pages = [
  { id: uuidv4(), title: 'How to Remove Tough Laundry Stains at Home', slug: 'remove-tough-laundry-stains', status: 'indexed', url: 'https://mandyslaundry.com/blog/remove-tough-laundry-stains', daysAgo: 6 },
  { id: uuidv4(), title: '5 Benefits of Professional Dry Cleaning Services', slug: 'benefits-professional-dry-cleaning', status: 'indexed', url: 'https://mandyslaundry.com/blog/benefits-professional-dry-cleaning', daysAgo: 5 },
  { id: uuidv4(), title: 'Wash and Fold vs. DIY Laundry: Which Saves More?', slug: 'wash-and-fold-vs-diy-laundry', status: 'published', url: 'https://mandyslaundry.com/blog/wash-and-fold-vs-diy-laundry', daysAgo: 4 },
  { id: uuidv4(), title: 'The Best Fabric Care Tips for Delicate Clothing', slug: 'fabric-care-tips-delicate-clothing', status: 'published', url: 'https://mandyslaundry.com/blog/fabric-care-tips-delicate-clothing', daysAgo: 3 },
  { id: uuidv4(), title: 'Commercial Laundry Solutions for Los Angeles Businesses', slug: 'commercial-laundry-los-angeles', status: 'indexed', url: 'https://mandyslaundry.com/blog/commercial-laundry-los-angeles', daysAgo: 2 },
  { id: uuidv4(), title: 'Same-Day Laundry Pickup Service in Santa Ana', slug: 'same-day-laundry-pickup-santa-ana', status: 'published', url: 'https://mandyslaundry.com/blog/same-day-laundry-pickup-santa-ana', daysAgo: 1 },
  { id: uuidv4(), title: 'How Often Should You Dry Clean Your Suits?', slug: 'how-often-dry-clean-suits', status: 'content_generating', url: null, daysAgo: 0 },
];

for (const p of pages) {
  const publishedAt = p.status !== 'content_generating'
    ? `datetime('now', '-${p.daysAgo} days')`
    : 'NULL';
  const indexedAt = p.status === 'indexed'
    ? `datetime('now', '-${Math.max(0, p.daysAgo - 1)} days')`
    : 'NULL';

  db.prepare(`
    INSERT OR IGNORE INTO pages (id, website, project, title, slug, status, url, published_at, indexed_at, content_generated_at, created_at, updated_at)
    VALUES (
      '${p.id}', 'Mandy''s Laundry', 'blog',
      '${p.title.replace(/'/g, "''")}',
      '${p.slug}',
      '${p.status}',
      ${p.url ? `'${p.url}'` : 'NULL'},
      ${publishedAt},
      ${indexedAt},
      datetime('now', '-${p.daysAgo} days'),
      datetime('now', '-${p.daysAgo} days'),
      datetime('now', '-${p.daysAgo} days')
    )
  `).run();
}
console.log('✓ Pages inserted:', pages.length);

// ── Landing Pages ─────────────────────────────────────────────────────────────
const landingPages = [
  { city: 'Los Angeles', keyword: 'laundry pickup Los Angeles CA', service: 'laundry pickup', status: 'indexed', slug: 'laundry-pickup-los-angeles-ca', daysAgo: 5 },
  { city: 'San Diego', keyword: 'dry cleaning San Diego CA', service: 'dry cleaning', status: 'published', slug: 'dry-cleaning-san-diego-ca', daysAgo: 4 },
  { city: 'Anaheim', keyword: 'wash and fold Anaheim CA', service: 'wash and fold', status: 'indexed', slug: 'wash-and-fold-anaheim-ca', daysAgo: 3 },
  { city: 'Long Beach', keyword: 'commercial laundry Long Beach CA', service: 'commercial laundry', status: 'published', slug: 'commercial-laundry-long-beach-ca', daysAgo: 2 },
  { city: 'Santa Ana', keyword: 'laundry pickup Santa Ana CA', service: 'laundry pickup', status: 'generating', slug: null, daysAgo: 0 },
];

for (const lp of landingPages) {
  const id = uuidv4();
  const url = lp.slug ? `https://mandyslaundry.com/${lp.slug}` : null;
  db.prepare(`
    INSERT OR IGNORE INTO landing_pages
      (id, city, state, keyword, service_type, slug, title, status, url, published_at, indexed_at, seo_score, created_at, updated_at)
    VALUES (
      '${id}', '${lp.city}', 'CA',
      '${lp.keyword}',
      '${lp.service}',
      ${lp.slug ? `'${lp.slug}'` : 'NULL'},
      '${lp.service.charAt(0).toUpperCase() + lp.service.slice(1)} in ${lp.city}, CA | Mandy''s Laundry',
      '${lp.status}',
      ${url ? `'${url}'` : 'NULL'},
      ${lp.status !== 'generating' ? `datetime('now', '-${lp.daysAgo} days')` : 'NULL'},
      ${lp.status === 'indexed' ? `datetime('now', '-${Math.max(0, lp.daysAgo - 1)} days')` : 'NULL'},
      ${70 + Math.floor(Math.random() * 25)},
      datetime('now', '-${lp.daysAgo} days'),
      datetime('now', '-${lp.daysAgo} days')
    )
  `).run();
}
console.log('✓ Landing pages inserted:', landingPages.length);

// ── Daily Metrics (last 7 days) ───────────────────────────────────────────────
const metricDays = [
  { daysAgo: 6, created: 3, published: 2, indexed: 1, failed: 0, retries: 0, errors: 0, avg_pub: 4200, avg_idx: 8100 },
  { daysAgo: 5, created: 4, published: 3, indexed: 2, failed: 1, retries: 1, errors: 1, avg_pub: 3800, avg_idx: 7500 },
  { daysAgo: 4, created: 2, published: 2, indexed: 2, failed: 0, retries: 0, errors: 0, avg_pub: 5100, avg_idx: 9200 },
  { daysAgo: 3, created: 5, published: 4, indexed: 3, failed: 0, retries: 0, errors: 0, avg_pub: 4400, avg_idx: 8600 },
  { daysAgo: 2, created: 3, published: 3, indexed: 3, failed: 0, retries: 0, errors: 0, avg_pub: 3900, avg_idx: 7900 },
  { daysAgo: 1, created: 4, published: 3, indexed: 2, failed: 1, retries: 2, errors: 1, avg_pub: 4700, avg_idx: 8300 },
  { daysAgo: 0, created: 2, published: 1, indexed: 0, failed: 0, retries: 0, errors: 0, avg_pub: 4100, avg_idx: null },
];

for (const m of metricDays) {
  db.prepare(`
    INSERT OR REPLACE INTO metrics_daily
      (date, pages_created, pages_published, pages_indexed, pages_failed, retries_performed, errors_encountered, avg_publish_ms, avg_index_ms, updated_at)
    VALUES (
      date('now', '-${m.daysAgo} days'),
      ${m.created}, ${m.published}, ${m.indexed}, ${m.failed}, ${m.retries}, ${m.errors},
      ${m.avg_pub}, ${m.avg_idx ?? 'NULL'},
      datetime('now')
    )
  `).run();
}
console.log('✓ Daily metrics inserted:', metricDays.length, 'days');

// ── SEO Issues ────────────────────────────────────────────────────────────────
const seoIssues = [
  { type: 'thin_content', url: 'https://mandyslaundry.com/blog/fabric-care', severity: 'high', description: 'Page has only 187 words — below 300-word threshold', fix: 'Expand content to at least 300 words', status: 'open' },
  { type: 'missing_meta_description', url: 'https://mandyslaundry.com/services', severity: 'medium', description: 'Page is missing a meta description tag', fix: 'Add a unique meta description under 160 characters', status: 'open' },
  { type: 'duplicate_title', url: 'https://mandyslaundry.com/contact', severity: 'medium', description: 'Title tag matches another page on the site', fix: 'Write a unique title tag for this page', status: 'resolved' },
  { type: 'missing_alt_text', url: 'https://mandyslaundry.com/gallery', severity: 'low', description: '6 images are missing alt text attributes', fix: 'Add descriptive alt text to all images', status: 'open' },
  { type: 'slow_page_speed', url: 'https://mandyslaundry.com/', severity: 'critical', description: 'Homepage PageSpeed score is 38/100 on mobile', fix: 'Optimize images and defer non-critical JS', status: 'open' },
  { type: 'broken_internal_link', url: 'https://mandyslaundry.com/blog/old-post', severity: 'high', description: 'Internal link points to a 404 page', fix: 'Update or remove the broken link', status: 'resolved' },
];

for (const issue of seoIssues) {
  db.prepare(`
    INSERT INTO seo_issues (type, url, severity, description, fix_suggestion, status, detected_at, resolved_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-3 days'), ${issue.status === 'resolved' ? "datetime('now', '-1 days')" : 'NULL'})
  `).run(issue.type, issue.url, issue.severity, issue.description, issue.fix, issue.status);
}
console.log('✓ SEO issues inserted:', seoIssues.length);

// ── GSC Summary ───────────────────────────────────────────────────────────────
db.prepare(`
  INSERT INTO gsc_summary (impressions, clicks, avg_ctr, avg_position, date_range, synced_at)
  VALUES (12840, 487, '3.79', '14.2', '28 days', datetime('now', '-1 hours'))
`).run();
console.log('✓ GSC summary inserted');

// ── GSC Daily Trend (last 14 days) ───────────────────────────────────────────
const gscDays = [
  [14, 680, 22], [13, 720, 25], [12, 850, 31], [11, 910, 34],
  [10, 780, 28], [9, 1020, 38], [8, 1100, 42], [7, 960, 35],
  [6, 1050, 40], [5, 890, 33], [4, 1150, 44], [3, 980, 37],
  [2, 1080, 41], [1, 1200, 45], [0, 400, 14],
];

for (const [daysAgo, impressions, clicks] of gscDays) {
  db.prepare(`
    INSERT INTO gsc_metrics (date, impressions, clicks, ctr, position, synced_at)
    VALUES (date('now', '-${daysAgo} days'), ${impressions}, ${clicks}, ${(clicks/impressions*100).toFixed(2)}, ${(12 + Math.random()*5).toFixed(1)}, datetime('now'))
  `).run();
}
console.log('✓ GSC trend data inserted: 15 days');

// ── Analytics Summary ─────────────────────────────────────────────────────────
db.prepare(`
  INSERT INTO analytics_summary (sessions, users, new_users, organic_sessions, organic_users, bounce_rate, avg_session_duration, conversions, date_range, synced_at)
  VALUES (3240, 2180, 1650, 1870, 1290, '42.3', '127', 38, '28 days', datetime('now', '-1 hours'))
`).run();
console.log('✓ Analytics summary inserted');

// ── Audit Run ─────────────────────────────────────────────────────────────────
db.prepare(`
  INSERT INTO audit_runs (started_at, completed_at, pages_audited, issues_found, issues_fixed, status)
  VALUES (datetime('now', '-2 days'), datetime('now', '-2 days', '+18 minutes'), 47, 6, 2, 'completed')
`).run();
console.log('✓ Audit run inserted');

// ── Reports ───────────────────────────────────────────────────────────────────
const reports = [
  {
    type: 'daily', period: '2026-06-29', title: 'Daily Report — June 29, 2026',
    summary: { pagesPublished: 3, pagesIndexed: 2, seoIssuesOpen: 4, seoIssuesResolved: 1, gscImpressions: 1200, gscClicks: 45, analyticsSessions: 118, queueLength: 0 },
  },
  {
    type: 'daily', period: '2026-06-28', title: 'Daily Report — June 28, 2026',
    summary: { pagesPublished: 4, pagesIndexed: 3, seoIssuesOpen: 5, seoIssuesResolved: 0, gscImpressions: 1080, gscClicks: 41, analyticsSessions: 104, queueLength: 1 },
  },
  {
    type: 'weekly', period: '2026-W26', title: 'Weekly Report — Week 26, 2026',
    summary: { pagesPublished: 18, pagesIndexed: 14, seoIssuesOpen: 4, seoIssuesResolved: 2, gscImpressions: 7840, gscClicks: 287, analyticsSessions: 720, queueLength: 0, auditPagesScanned: 47 },
  },
];

for (const r of reports) {
  db.prepare(`
    INSERT INTO reports (type, period, title, summary_json, generated_at)
    VALUES (?, ?, ?, ?, datetime('now', '-1 days'))
  `).run(r.type, r.period, r.title, JSON.stringify(r.summary));
}
console.log('✓ Reports inserted:', reports.length);

// ── Health Checks ─────────────────────────────────────────────────────────────
const services = ['wordpress', 'telegram', 'google_search_console', 'google_analytics', 'anthropic_api'];
for (const service of services) {
  db.prepare(`
    INSERT INTO health_checks (service, status, message, checked_at)
    VALUES (?, 'ok', 'Service responding normally', datetime('now', '-5 minutes'))
  `).run(service);
}
console.log('✓ Health checks inserted');

console.log('\n✅ Sample data seed complete! Refresh http://localhost:3000/dashboard to see it.');
