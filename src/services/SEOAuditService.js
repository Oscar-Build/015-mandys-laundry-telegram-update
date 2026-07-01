'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('./Logger');
const db = require('./Database');

const BOT_UA = 'MandysLaundryBot/1.0 (+https://mandyslaundry.com/bot)';

async function fetchPage(url) {
  const resp = await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': BOT_UA },
    validateStatus: () => true,
  });
  return { status: resp.status, html: resp.data, headers: resp.headers };
}

/**
 * Audits a single page's HTML for SEO issues.
 * Returns { title, metaDesc, wordCount, issues[] }
 */
function auditHTML(url, html) {
  const issues = [];
  const text = typeof html === 'string' ? html : '';

  // Title
  const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
  if (!title) {
    issues.push({ type: 'missing_title', severity: 'critical', url, description: 'Page is missing a <title> tag' });
  } else if (title.length > 60) {
    issues.push({ type: 'title_too_long', severity: 'low', url, description: `Title is ${title.length} chars (60 max): "${title.slice(0, 40)}..."` });
  } else if (title.length < 20) {
    issues.push({ type: 'title_too_short', severity: 'medium', url, description: `Title is only ${title.length} chars (20 min)` });
  }

  // Meta description
  const metaDescMatch = text.match(/<meta[^>]+name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)
    || text.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
  const metaDesc = metaDescMatch?.[1]?.trim() || '';
  if (!metaDesc) {
    issues.push({ type: 'missing_meta_description', severity: 'high', url, description: 'Page is missing a meta description' });
  } else if (metaDesc.length > 160) {
    issues.push({ type: 'meta_description_too_long', severity: 'low', url, description: `Meta description is ${metaDesc.length} chars (160 max)` });
  } else if (metaDesc.length < 50) {
    issues.push({ type: 'meta_description_too_short', severity: 'medium', url, description: `Meta description is only ${metaDesc.length} chars (50 min)` });
  }

  // H1
  const h1Matches = [...text.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (!h1Matches.length) {
    issues.push({ type: 'missing_h1', severity: 'high', url, description: 'Page is missing an H1 tag' });
  } else if (h1Matches.length > 1) {
    issues.push({ type: 'multiple_h1', severity: 'medium', url, description: `Page has ${h1Matches.length} H1 tags (should have exactly 1)` });
  }

  // Canonical
  if (!/<link[^>]+rel=["']canonical["'][^>]*>/i.test(text)) {
    issues.push({ type: 'missing_canonical', severity: 'medium', url, description: 'Page is missing a canonical link tag' });
  }

  // Schema
  if (!/<script[^>]+type=["']application\/ld\+json["'][^>]*>/i.test(text)) {
    issues.push({ type: 'missing_schema', severity: 'medium', url, description: 'Page has no structured data (schema.org/JSON-LD)' });
  }

  // Images missing alt text
  const imgs = [...text.matchAll(/<img[^>]*>/gi)];
  const missingAlt = imgs.filter(m => !/alt=["'][^"']/i.test(m[0]) && !/alt=["']["']/i.test(m[0]) === false
    ? false
    : !/\balt\s*=/i.test(m[0])
  ).length;
  if (missingAlt > 0) {
    issues.push({ type: 'missing_alt_text', severity: 'medium', url, description: `${missingAlt} image(s) missing alt attribute` });
  }

  // Thin content
  const textContent = text.replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = textContent.split(' ').filter(w => w.length > 2).length;
  if (wordCount < config.seo.thinContentThreshold) {
    issues.push({ type: 'thin_content', severity: 'high', url, description: `Page has ~${wordCount} words (minimum: ${config.seo.thinContentThreshold})` });
  }

  // Open Graph
  if (!/<meta[^>]+property=["']og:title["']/i.test(text)) {
    issues.push({ type: 'missing_og_title', severity: 'low', url, description: 'Page is missing og:title Open Graph tag' });
  }

  return { title, metaDesc, wordCount, issues };
}

/**
 * Checks page speed via PageSpeed Insights API (no auth required for mobile).
 */
async function checkPageSpeed(url) {
  try {
    const key = config.google.pagespeedApiKey;
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile${key ? `&key=${key}` : ''}`;
    const resp = await axios.get(apiUrl, { timeout: 45000 });
    const d = resp.data?.lighthouseResult;

    const score = Math.round((d?.categories?.performance?.score || 0) * 100);
    const lcp = d?.audits?.['largest-contentful-paint']?.displayValue || 'N/A';
    const cls = d?.audits?.['cumulative-layout-shift']?.displayValue || 'N/A';
    const fcp = d?.audits?.['first-contentful-paint']?.displayValue || 'N/A';
    const tbt = d?.audits?.['total-blocking-time']?.displayValue || 'N/A';

    if (score < 50) {
      return { url, score, lcp, cls, fcp, tbt, issue: `Performance score ${score}/100 (poor)` };
    }
    return { url, score, lcp, cls, fcp, tbt };
  } catch (err) {
    logger.warn('PageSpeed check failed', { url, error: err.message });
    return { url, score: null, error: err.message };
  }
}

/**
 * Extracts all URLs from the site's sitemap.
 */
async function getSitemapUrls() {
  const siteUrl = config.google.siteUrl;
  const candidates = [`${siteUrl}/sitemap.xml`, `${siteUrl}/sitemap_index.xml`, `${siteUrl}/wp-sitemap.xml`];

  for (const sitemapUrl of candidates) {
    try {
      const resp = await axios.get(sitemapUrl, { timeout: 12000 });
      if (resp.status !== 200) continue;
      const xml = resp.data || '';
      const subSitemaps = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([\s\S]*?)<\/loc>/g)].map(m => m[1].trim());

      let allUrls = [...xml.matchAll(/<url>[\s\S]*?<loc>([\s\S]*?)<\/loc>/g)].map(m => m[1].trim());

      // Follow sub-sitemaps one level deep
      for (const sub of subSitemaps.slice(0, 5)) {
        try {
          const subResp = await axios.get(sub, { timeout: 10000 });
          const subUrls = [...(subResp.data || '').matchAll(/<url>[\s\S]*?<loc>([\s\S]*?)<\/loc>/g)].map(m => m[1].trim());
          allUrls = allUrls.concat(subUrls);
        } catch (_) {}
      }

      const uniqueUrls = [...new Set(allUrls)].filter(u => !u.endsWith('.xml'));
      if (uniqueUrls.length > 0) {
        logger.info('Sitemap parsed', { sitemapUrl, urlCount: uniqueUrls.length });
        return uniqueUrls;
      }
    } catch (_) {}
  }

  logger.warn('No sitemap found — auditing homepage only');
  return [siteUrl];
}

/**
 * HEAD-checks a list of URLs and returns those returning 4xx/5xx.
 */
async function checkBrokenLinks(urls) {
  const broken = [];
  for (const url of urls.slice(0, 100)) {
    try {
      const resp = await axios.head(url, { timeout: 8000, validateStatus: () => true });
      if (resp.status >= 400) broken.push({ url, status: resp.status });
    } catch (err) {
      broken.push({ url, status: 0, error: err.message });
    }
  }
  return broken;
}

/**
 * Runs a full SEO audit across all sitemap URLs.
 */
async function runFullAudit() {
  logger.info('Starting full SEO audit');
  const auditId = db.startAuditRun();

  const urls = await getSitemapUrls();
  const auditUrls = urls.slice(0, config.seo.auditMaxPages);

  let pagesAudited = 0;
  let issuesFound = 0;
  const allIssues = [];

  for (const url of auditUrls) {
    try {
      const { status, html } = await fetchPage(url);

      if (status === 404 || status === 410) {
        const issue = { type: '404_error', severity: 'critical', url, description: `Page returns HTTP ${status}` };
        db.createSEOIssue(issue);
        allIssues.push(issue);
        issuesFound++;
        continue;
      }

      if (status >= 500) {
        const issue = { type: 'server_error', severity: 'critical', url, description: `Page returns HTTP ${status}` };
        db.createSEOIssue(issue);
        allIssues.push(issue);
        issuesFound++;
        continue;
      }

      if (typeof html === 'string') {
        const { issues } = auditHTML(url, html);
        for (const issue of issues) {
          db.createSEOIssue(issue);
          allIssues.push(issue);
        }
        issuesFound += issues.length;
      }

      pagesAudited++;
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      logger.warn('Audit error for URL', { url, error: err.message });
    }
  }

  db.completeAuditRun(auditId, { pagesAudited, issuesFound });
  logger.info('SEO audit complete', { pagesAudited, issuesFound });

  return { pagesAudited, issuesFound, issues: allIssues };
}

/**
 * Quick audit of the homepage and a few key pages.
 */
async function runQuickAudit() {
  const siteUrl = config.google.siteUrl;
  const urls = [siteUrl, `${siteUrl}/about`, `${siteUrl}/services`, `${siteUrl}/contact`];
  const results = [];

  for (const url of urls) {
    try {
      const { status, html } = await fetchPage(url);
      if (typeof html === 'string') {
        const audit = auditHTML(url, html);
        results.push({ url, status, ...audit });
      }
    } catch (err) {
      results.push({ url, error: err.message });
    }
  }

  return results;
}

module.exports = { runFullAudit, runQuickAudit, checkPageSpeed, checkBrokenLinks, getSitemapUrls, auditHTML, fetchPage };
