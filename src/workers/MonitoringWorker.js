'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../services/Logger');
const db = require('../services/Database');
const telegram = require('../services/TelegramService');

const SITE_URL = config.google.siteUrl;

async function safeGet(url, opts = {}) {
  try {
    return await axios.get(url, { timeout: 12000, validateStatus: () => true, ...opts });
  } catch (err) {
    return { status: 0, data: '', error: err.message };
  }
}

/**
 * Checks website uptime and response time.
 */
async function checkUptime() {
  const start = Date.now();
  const resp = await safeGet(SITE_URL);
  const ms = Date.now() - start;

  const ok = resp.status >= 200 && resp.status < 400;
  db.recordHealthCheck('Website Uptime', ok ? 'up' : 'down', `HTTP ${resp.status} in ${ms}ms`);

  if (!ok) {
    await telegram.notifyHealthAlert('Website Uptime', `Site returned HTTP ${resp.status || 'connection error'}`);
  }

  return { ok, status: resp.status, responseMs: ms };
}

/**
 * Verifies robots.txt is accessible and not blocking all crawlers.
 */
async function checkRobotsTxt() {
  const resp = await safeGet(`${SITE_URL}/robots.txt`);

  if (!resp.status || resp.status !== 200) {
    db.recordHealthCheck('Robots.txt', 'down', `HTTP ${resp.status}`);
    return { ok: false, error: `HTTP ${resp.status}` };
  }

  const body = resp.data || '';
  const blocksAll = /User-agent:\s*\*/im.test(body) && /Disallow:\s*\/$/im.test(body);

  if (blocksAll) {
    db.createSEOIssue({
      type: 'robots_blocking_all',
      url: `${SITE_URL}/robots.txt`,
      severity: 'critical',
      description: 'robots.txt is blocking ALL crawlers with "Disallow: /"',
    });
    await telegram.notifyWorkflowError(
      { website: "Mandy's Laundry", project: 'monitoring' },
      'CRITICAL: robots.txt is blocking all search engine crawlers!'
    );
    return { ok: false, issue: 'blocks_all_crawlers' };
  }

  db.recordHealthCheck('Robots.txt', 'up', 'Accessible, not blocking all crawlers');
  return { ok: true, status: resp.status };
}

/**
 * Verifies that a sitemap.xml is present and has URLs.
 */
async function checkSitemap() {
  const candidates = [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/sitemap_index.xml`, `${SITE_URL}/wp-sitemap.xml`];

  for (const url of candidates) {
    const resp = await safeGet(url);
    if (resp.status === 200 && typeof resp.data === 'string') {
      const urlCount = (resp.data.match(/<(url|sitemap)>/g) || []).length;
      db.recordHealthCheck('Sitemap', 'up', `${url} — ${urlCount} entries`);
      return { ok: true, url, urlCount };
    }
  }

  db.recordHealthCheck('Sitemap', 'down', 'No accessible sitemap found');
  db.createSEOIssue({
    type: 'sitemap_missing',
    url: `${SITE_URL}/sitemap.xml`,
    severity: 'high',
    description: 'No accessible sitemap.xml found',
  });
  return { ok: false, error: 'No sitemap found' };
}

/**
 * Verifies HTTPS is active (SSL check via connection).
 */
async function checkSSL() {
  if (!SITE_URL.startsWith('https://')) {
    db.createSEOIssue({
      type: 'no_https',
      url: SITE_URL,
      severity: 'critical',
      description: 'Website URL does not use HTTPS',
    });
    db.recordHealthCheck('SSL', 'down', 'Site is not on HTTPS');
    return { ok: false, issue: 'not_https' };
  }

  const resp = await safeGet(SITE_URL);
  if (resp.error && (resp.error.includes('certificate') || resp.error.includes('SSL') || resp.error.includes('CERT'))) {
    db.recordHealthCheck('SSL', 'down', `SSL error: ${resp.error}`);
    await telegram.notifyHealthAlert('SSL Certificate', resp.error);
    return { ok: false, error: resp.error };
  }

  db.recordHealthCheck('SSL', 'up', 'HTTPS connection successful');
  return { ok: true };
}

/**
 * Checks if Google Analytics tracking is present on the homepage.
 */
async function checkAnalyticsTracking() {
  const resp = await safeGet(SITE_URL);
  if (!resp.status || !resp.data) return { ok: false, error: 'Could not fetch homepage' };

  const html = typeof resp.data === 'string' ? resp.data : '';
  const hasGA4 = /G-[A-Z0-9]{6,}/i.test(html) || /\bgtag\s*\(/.test(html);
  const hasGTM = /GTM-[A-Z0-9]{4,}/i.test(html);
  const hasUA = /UA-\d{4,}-\d/.test(html);

  const ok = hasGA4 || hasGTM || hasUA;
  const detail = hasGA4 ? 'GA4 found' : hasGTM ? 'GTM found' : hasUA ? 'UA found (legacy)' : 'No tracking code detected';

  db.recordHealthCheck('Analytics Tracking', ok ? 'up' : 'down', detail);

  if (!ok) {
    db.createSEOIssue({
      type: 'missing_tracking_code',
      url: SITE_URL,
      severity: 'high',
      description: 'No Google Analytics or GTM tracking code found on homepage',
    });
  }

  return { ok, hasGA4, hasGTM, hasUA };
}

/**
 * Checks that Search Console verification meta tag is present.
 */
async function checkSearchConsoleVerification() {
  const resp = await safeGet(SITE_URL);
  if (!resp.data) return { ok: null, error: 'Could not fetch homepage' };

  const html = typeof resp.data === 'string' ? resp.data : '';
  const hasGSCMeta = /google-site-verification/i.test(html);
  db.recordHealthCheck('Search Console Verification', hasGSCMeta ? 'up' : 'down',
    hasGSCMeta ? 'Verification meta tag found' : 'No verification meta tag found'
  );
  return { ok: hasGSCMeta };
}

/**
 * Runs all monitoring checks and returns a combined result.
 */
async function runAllMonitoringChecks() {
  logger.info('Monitoring Worker: Running all checks');

  const [uptime, robots, sitemap, ssl, tracking, gscVerify] = await Promise.allSettled([
    checkUptime(),
    checkRobotsTxt(),
    checkSitemap(),
    checkSSL(),
    checkAnalyticsTracking(),
    checkSearchConsoleVerification(),
  ]);

  const resolve = (r) => r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message };

  const results = {
    uptime: resolve(uptime),
    robots: resolve(robots),
    sitemap: resolve(sitemap),
    ssl: resolve(ssl),
    tracking: resolve(tracking),
    gscVerify: resolve(gscVerify),
  };

  const allOk = Object.values(results).every(r => r.ok !== false);
  const failCount = Object.values(results).filter(r => r.ok === false).length;

  if (!allOk) {
    logger.warn('Monitoring Worker: Issues detected', { failCount });
  } else {
    logger.info('Monitoring Worker: All checks passed');
  }

  return results;
}

module.exports = {
  runAllMonitoringChecks,
  checkUptime,
  checkRobotsTxt,
  checkSitemap,
  checkSSL,
  checkAnalyticsTracking,
  checkSearchConsoleVerification,
};
