'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../services/Logger');
const db = require('../services/Database');
const telegram = require('../services/TelegramService');
const audit = require('../services/SEOAuditService');
const blogGen = require('../services/BlogGenerator');

const WEBSITE = "Mandy's Laundry";

/**
 * Runs a full SEO audit across the site, stores results, and alerts on critical issues.
 */
async function runAudit() {
  logger.info('SEO Worker: Starting full audit');

  try {
    const result = await audit.runFullAudit();

    const criticalIssues = result.issues.filter(i => i.severity === 'critical');
    const highIssues = result.issues.filter(i => i.severity === 'high');

    if (criticalIssues.length > 0) {
      await telegram.notifySEOCriticalIssues(criticalIssues);
    }

    await telegram.notifySEOAuditComplete({
      pagesAudited: result.pagesAudited,
      issuesFound: result.issuesFound,
      critical: criticalIssues.length,
      high: highIssues.length,
    });

    logger.info('SEO Worker: Audit complete', { pagesAudited: result.pagesAudited, issuesFound: result.issuesFound });
    return result;
  } catch (err) {
    logger.error('SEO Worker: Audit failed', { error: err.message });
    await telegram.notifyWorkflowError({ website: WEBSITE, project: 'seo-worker' }, `SEO audit failed: ${err.message}`);
    throw err;
  }
}

/**
 * Tries to auto-fix SEO issues that can be resolved programmatically.
 */
async function autoFixIssues() {
  const openIssues = db.getOpenSEOIssues({ limit: 100 });
  logger.info('SEO Worker: Attempting auto-fixes', { count: openIssues.length });

  const AUTO_FIXABLE = new Set(['missing_meta_description', 'missing_og_title', 'missing_canonical', 'title_too_long']);
  const fixable = openIssues.filter(i => AUTO_FIXABLE.has(i.type));

  let fixed = 0;
  const fixResults = [];

  // Group by URL so we make one WP request per page
  const byUrl = {};
  for (const issue of fixable) {
    if (!byUrl[issue.url]) byUrl[issue.url] = [];
    byUrl[issue.url].push(issue);
  }

  const wpApiUrl   = config.wordpress.apiUrl;
  const wpUser     = config.wordpress.username;
  const wpPassword = config.wordpress.appPassword;
  const wpReady    = wpApiUrl && wpUser && wpPassword;
  const authHeader = wpReady
    ? 'Basic ' + Buffer.from(`${wpUser}:${wpPassword}`).toString('base64')
    : null;

  for (const [url, issues] of Object.entries(byUrl)) {
    const slug = url.replace(/\/$/, '').split('/').filter(s => s && !s.includes('.')).pop();
    if (!slug || !wpReady) {
      issues.forEach(i => fixResults.push({ url, type: i.type, fixed: false, note: 'WordPress not configured or invalid URL' }));
      continue;
    }

    try {
      // Find post by slug
      let post = null;
      let postType = 'posts';
      for (const type of ['posts', 'pages']) {
        const res = await axios.get(`${wpApiUrl}/${type}?slug=${encodeURIComponent(slug)}&_fields=id,title,link&per_page=1`,
          { headers: { Authorization: authHeader }, timeout: 10000 });
        if (res.data?.[0]) { post = res.data[0]; postType = type; break; }
      }
      if (!post) {
        issues.forEach(i => fixResults.push({ url, type: i.type, fixed: false, note: 'Post not found in WordPress' }));
        continue;
      }

      const postTitle = (post.title?.rendered || slug).replace(/<[^>]+>/g, '').trim();
      const meta = {};
      const resolvedIds = [];

      for (const issue of issues) {
        switch (issue.type) {
          case 'missing_meta_description': {
            const { success, fixNote, meta: m } = await fixMissingMetaDescription(issue, postTitle);
            if (success && m) Object.assign(meta, m);
            resolvedIds.push({ id: issue.id, success, note: fixNote });
            break;
          }
          case 'missing_og_title':
            meta['_yoast_wpseo_opengraph-title'] = postTitle;
            meta['rank_math_facebook_title']      = postTitle;
            resolvedIds.push({ id: issue.id, success: true, note: `Set og:title from post title` });
            break;
          case 'missing_canonical':
            meta['_yoast_wpseo_canonical'] = url;
            resolvedIds.push({ id: issue.id, success: true, note: `Set canonical URL via Yoast` });
            break;
          case 'title_too_long': {
            const short = postTitle.length > 57 ? postTitle.slice(0, 54).trimEnd() + '...' : postTitle;
            meta['_yoast_wpseo_title'] = `${short} %%sep%% %%sitename%%`;
            resolvedIds.push({ id: issue.id, success: true, note: `Shortened Yoast SEO title` });
            break;
          }
        }
      }

      if (Object.keys(meta).length > 0) {
        await axios.post(`${wpApiUrl}/${postType}/${post.id}`,
          { meta },
          { headers: { Authorization: authHeader, 'Content-Type': 'application/json' }, timeout: 15000 });
      }

      for (const { id, success, note } of resolvedIds) {
        if (success) { db.resolveSEOIssue(id, note); fixed++; }
        fixResults.push({ url, type: issues.find(i => i.id === id)?.type, fixed: success, note });
      }
    } catch (err) {
      logger.warn('Auto-fix batch failed', { url, error: err.message });
      issues.forEach(i => fixResults.push({ url, type: i.type, fixed: false, error: err.message }));
    }

    await new Promise(r => setTimeout(r, 400));
  }

  // Log unfixable issues for visibility
  for (const issue of openIssues.filter(i => !AUTO_FIXABLE.has(i.type))) {
    fixResults.push({ url: issue.url, type: issue.type, fixed: false, note: 'Manual fix required' });
  }

  if (fixed > 0) {
    await telegram.notifySEOIssuesFixed(fixed, openIssues.length);
  }

  logger.info('SEO Worker: Auto-fix complete', { fixed, total: openIssues.length });
  return { fixed, total: openIssues.length, results: fixResults };
}

async function fixMissingMetaDescription(issue, postTitle) {
  const slug = (issue.url || '').replace(/\/$/, '').split('/').filter(s => s && !s.includes('.')).pop() || '';
  const topic = (postTitle || slug.replace(/-/g, ' ')).trim();

  let metaDescription;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const ai = new Anthropic({ apiKey: config.anthropic.apiKey });
    const msg = await ai.messages.create({
      model: config.anthropic.model,
      max_tokens: 80,
      messages: [{
        role: 'user',
        content: `Write a compelling meta description (120-155 characters) for "${topic}" on Mandy's Laundry website (LA laundry service). Include a call to action. Return ONLY the description, no quotes.`,
      }],
    });
    metaDescription = msg.content[0].text.trim().slice(0, 155);
  } catch {
    metaDescription = `Professional ${topic} service by Mandy's Laundry. Fast, affordable, and reliable — serving Los Angeles and surrounding areas.`.slice(0, 155);
  }

  return {
    success: true,
    fixNote: `Generated meta description (${metaDescription.length} chars)`,
    meta: {
      '_yoast_wpseo_metadesc': metaDescription,
      'rank_math_description': metaDescription,
    },
  };
}

async function fixThinContent(issue) {
  logger.info('Thin content fix queued for AI content expansion', { url: issue.url });
  return { success: false, fixNote: 'Thin content — queued for manual AI content expansion' };
}

/**
 * Checks recently published pages for broken links.
 */
async function checkBrokenLinks() {
  const recentPages = db.getRecentPublishedPages(20);
  const urls = recentPages.map(p => p.url).filter(Boolean);

  if (!urls.length) return [];

  logger.info('SEO Worker: Checking broken links', { count: urls.length });
  const broken = await audit.checkBrokenLinks(urls);

  for (const link of broken) {
    db.createSEOIssue({
      type: link.status === 404 ? '404_error' : 'broken_link',
      url: link.url,
      severity: 'critical',
      description: `URL returns HTTP ${link.status || 'connection error'}`,
    });
  }

  if (broken.length > 0) {
    await telegram.notifyBrokenLinks(broken);
  }

  return broken;
}

/**
 * Runs a quick page speed check on key pages.
 */
async function checkPageSpeeds() {
  const siteUrl = config.google.siteUrl;
  const keyPages = [siteUrl, `${siteUrl}/services`, `${siteUrl}/contact`];

  const results = [];
  for (const url of keyPages) {
    const r = await audit.checkPageSpeed(url);
    results.push(r);
    if (r.score !== null && r.score < 50) {
      db.createSEOIssue({
        type: 'slow_page',
        url,
        severity: 'high',
        description: `Performance score ${r.score}/100 — LCP: ${r.lcp}, CLS: ${r.cls}`,
      });
    }
    await new Promise(res => setTimeout(res, 2000));
  }

  return results;
}

/**
 * Generates AI recommendations for the top open SEO issues.
 */
async function generateRecommendations() {
  const issues = db.getOpenSEOIssues({ limit: 10 });
  if (!issues.length) return [];

  const pageGroups = {};
  for (const issue of issues) {
    if (!pageGroups[issue.url]) pageGroups[issue.url] = [];
    pageGroups[issue.url].push(issue);
  }

  const recommendations = [];
  for (const [url, pageIssues] of Object.entries(pageGroups).slice(0, 5)) {
    try {
      const recs = await blogGen.generateSEORecommendations({ url, issues: pageIssues });
      recommendations.push({ url, recommendations: recs });
    } catch (err) {
      logger.warn('Failed to generate recommendations', { url, error: err.message });
    }
  }

  return recommendations;
}

module.exports = { runAudit, autoFixIssues, checkBrokenLinks, checkPageSpeeds, generateRecommendations };
