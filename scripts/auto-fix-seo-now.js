'use strict';

/**
 * Auto-fix open SEO issues on WordPress.
 * Fixable automatically:
 *   - missing_meta_description  → generate with Claude, write via Yoast/RankMath meta
 *   - missing_og_title          → copy post title, write to OG meta fields
 *   - missing_canonical         → set canonical URL via Yoast
 *   - title_too_long            → apply shortened Yoast SEO title
 * Skipped (need manual work):
 *   - missing_h1, multiple_h1   → edit page content
 *   - missing_schema            → install/configure schema plugin
 *   - missing_alt_text          → edit individual images
 *   - thin_content              → expand content manually or via AI
 *   - 404_error, server_error   → redirect or delete page
 */

require('dotenv').config();

const axios = require('axios');
const config = require('../src/config');
const db = require('../src/services/Database');

const WP_API   = config.wordpress.apiUrl;
const WP_USER  = config.wordpress.username;
const WP_PASS  = config.wordpress.appPassword;

if (!WP_API || !WP_USER || !WP_PASS) {
  console.error('❌  WordPress credentials not set in .env');
  console.error('    Needed: WORDPRESS_API_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD');
  process.exit(1);
}

const AUTH_HEADER = 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
const WP_HEADERS  = { Authorization: AUTH_HEADER, 'Content-Type': 'application/json' };

// Auto-fixable issue types
const AUTO_FIXABLE = new Set([
  'missing_meta_description',
  'missing_og_title',
  'missing_canonical',
  'title_too_long',
]);

// ── Claude: generate a meta description ──────────────────────────────────────
async function generateMetaDesc(title, slug) {
  const Anthropic = require('@anthropic-ai/sdk');
  const ai = new Anthropic({ apiKey: config.anthropic.apiKey });
  const topic = (title || slug || '').replace(/-/g, ' ').trim();
  const msg = await ai.messages.create({
    model: config.anthropic.model,
    max_tokens: 80,
    messages: [{
      role: 'user',
      content: `Write a compelling meta description (120-155 characters) for a page titled "${topic}" on Mandy's Laundry website. ` +
               `Mandy's Laundry is a professional laundry service in Los Angeles. Include a call to action. ` +
               `Return ONLY the description text, no quotes, no extra text.`,
    }],
  });
  return msg.content[0].text.trim().slice(0, 155);
}

// ── WordPress: find post/page by slug ────────────────────────────────────────
async function findWpPost(slug) {
  for (const type of ['posts', 'pages']) {
    try {
      const res = await axios.get(
        `${WP_API}/${type}?slug=${encodeURIComponent(slug)}&_fields=id,title,link&per_page=1`,
        { headers: WP_HEADERS, timeout: 10000 },
      );
      if (res.data?.[0]) return { ...res.data[0], postType: type };
    } catch (_) {}
  }
  return null;
}

// ── WordPress: apply meta via REST (Yoast + RankMath) ────────────────────────
async function wpUpdateMeta(postId, postType, meta) {
  await axios.post(
    `${WP_API}/${postType}/${postId}`,
    { meta },
    { headers: WP_HEADERS, timeout: 15000 },
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const allIssues = db.getOpenSEOIssues({ limit: 200 });

  if (!allIssues.length) {
    console.log('✅  No open SEO issues — your site is clean!');
    process.exit(0);
  }

  // Separate fixable from manual
  const fixable = allIssues.filter(i => AUTO_FIXABLE.has(i.type));
  const manual  = allIssues.filter(i => !AUTO_FIXABLE.has(i.type));

  console.log(`Found ${allIssues.length} open issues:`);
  console.log(`  Auto-fixable : ${fixable.length}`);
  console.log(`  Manual only  : ${manual.length}`);
  console.log('');

  if (!fixable.length) {
    printManualSummary(manual);
    process.exit(0);
  }

  // Group fixable issues by URL
  const byUrl = {};
  for (const issue of fixable) {
    if (!byUrl[issue.url]) byUrl[issue.url] = [];
    byUrl[issue.url].push(issue);
  }

  let totalFixed = 0;
  let totalFailed = 0;

  for (const [url, issues] of Object.entries(byUrl)) {
    // Extract slug from URL: last non-empty segment
    const parts = url.replace(/\/$/, '').split('/').filter(s => s && !s.includes('.'));
    const slug = parts[parts.length - 1];

    if (!slug) {
      console.log(`⚠  Skipping (can't extract slug): ${url}`);
      totalFailed += issues.length;
      continue;
    }

    // Find the WordPress post
    const post = await findWpPost(slug);
    if (!post) {
      console.log(`⚠  Post not found in WordPress (slug="${slug}"): ${url}`);
      totalFailed += issues.length;
      continue;
    }

    const postTitle = post.title?.rendered
      ? post.title.rendered.replace(/<[^>]+>/g, '').trim()
      : slug.replace(/-/g, ' ');

    // Build a single meta object for all fixes on this page
    const meta = {};
    const fixLog = [];
    const resolvedIds = [];

    for (const issue of issues) {
      switch (issue.type) {
        case 'missing_meta_description': {
          let desc;
          try {
            desc = await generateMetaDesc(postTitle, slug);
          } catch {
            desc = `Professional ${postTitle.toLowerCase()} service by Mandy's Laundry. Fast, affordable, and reliable — serving Los Angeles and surrounding areas.`.slice(0, 155);
          }
          // Yoast SEO
          meta['_yoast_wpseo_metadesc'] = desc;
          // RankMath (in case they use it)
          meta['rank_math_description'] = desc;
          fixLog.push(`  ✓ meta description: "${desc.slice(0, 70)}..."`);
          resolvedIds.push({ id: issue.id, note: `Generated meta description (${desc.length} chars)` });
          break;
        }

        case 'missing_og_title': {
          meta['_yoast_wpseo_opengraph-title'] = postTitle;
          meta['rank_math_facebook_title']      = postTitle;
          fixLog.push(`  ✓ og:title → "${postTitle.slice(0, 60)}"`);
          resolvedIds.push({ id: issue.id, note: `Set og:title from post title` });
          break;
        }

        case 'missing_canonical': {
          meta['_yoast_wpseo_canonical'] = url;
          fixLog.push(`  ✓ canonical → ${url}`);
          resolvedIds.push({ id: issue.id, note: `Set canonical URL via Yoast` });
          break;
        }

        case 'title_too_long': {
          // Keep first 57 chars of title + Yoast site name template
          const shortTitle = postTitle.length > 57 ? postTitle.slice(0, 54).trimEnd() + '...' : postTitle;
          meta['_yoast_wpseo_title'] = `${shortTitle} %%sep%% %%sitename%%`;
          fixLog.push(`  ✓ SEO title shortened to "${shortTitle}"`);
          resolvedIds.push({ id: issue.id, note: `Applied shorter Yoast title override` });
          break;
        }
      }
    }

    if (!Object.keys(meta).length) continue;

    // Push all fixes in ONE request
    try {
      await wpUpdateMeta(post.id, post.postType, meta);

      // Mark all as resolved in DB
      for (const { id, note } of resolvedIds) {
        db.resolveSEOIssue(id, note);
        totalFixed++;
      }

      const shortUrl = url.replace('https://mandyslaundry.com', '');
      console.log(`✅  ${shortUrl || '/'} (WP ${post.postType} #${post.id})`);
      fixLog.forEach(l => console.log(l));
      console.log('');
    } catch (err) {
      const shortUrl = url.replace('https://mandyslaundry.com', '');
      console.log(`❌  Failed to update ${shortUrl}: ${err.response?.data?.message || err.message}`);
      totalFailed += resolvedIds.length;
    }

    // Brief pause to avoid rate limits
    await new Promise(r => setTimeout(r, 400));
  }

  console.log('─────────────────────────────────');
  console.log(`Fixed   : ${totalFixed} issues`);
  console.log(`Failed  : ${totalFailed} issues`);
  console.log('');

  printManualSummary(manual);

  console.log('\n✅  Done — refresh your dashboard to see the updated issue count.');
  process.exit(0);
}

function printManualSummary(issues) {
  if (!issues.length) return;

  const MANUAL_GUIDE = {
    missing_h1:     'Add an H1 heading inside each page\'s content in WordPress',
    multiple_h1:    'Remove extra H1 tags — keep exactly one per page',
    missing_schema: 'Install Yoast SEO or RankMath and enable structured data',
    missing_alt_text: 'Edit images in WordPress Media Library and add alt text',
    thin_content:   'Expand page content to at least 300 words (use your AI blog generator)',
    '404_error':    'Page returns 404 — add a redirect or restore the page',
    server_error:   'Page returns 5xx — check WordPress error logs',
  };

  // Count by type
  const counts = {};
  for (const i of issues) counts[i.type] = (counts[i.type] || 0) + 1;

  console.log('─────────────────────────────────');
  console.log(`Issues that need manual fixes (${issues.length} total):\n`);
  for (const [type, count] of Object.entries(counts)) {
    const guide = MANUAL_GUIDE[type] || 'Requires manual review';
    console.log(`  ⚠  ${type.replace(/_/g, ' ')} (${count} pages)`);
    console.log(`     → ${guide}\n`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
