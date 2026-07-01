'use strict';

const db = require('./Database');
const logger = require('./Logger');
const scheduler = require('../scheduler/Scheduler');
const axios = require('axios');
const config = require('../config');

const WP_COUNTS_CACHE_MS = 5 * 60 * 1000; // mandyslaundry.com's REST API regularly takes 10s+ to respond; avoid hammering it every 30s dashboard poll
let wpCountsCache = { data: null, fetchedAt: 0 };

async function fetchWPCounts() {
  const { apiUrl, username, appPassword } = config.wordpress || {};
  if (!apiUrl || !username || !appPassword) return null;

  if (wpCountsCache.data && Date.now() - wpCountsCache.fetchedAt < WP_COUNTS_CACHE_MS) {
    return wpCountsCache.data;
  }

  const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}` };
  try {
    const [postsRes, pagesRes] = await Promise.all([
      axios.get(`${apiUrl}/posts`, { params: { per_page: 1, status: 'publish' }, headers, timeout: 20000 }),
      axios.get(`${apiUrl}/pages`, { params: { per_page: 1, status: 'publish' }, headers, timeout: 20000 }),
    ]);
    const posts = parseInt(postsRes.headers['x-wp-total'] || '0', 10);
    const pages = parseInt(pagesRes.headers['x-wp-total'] || '0', 10);
    const data = { posts, pages, total: posts + pages };
    wpCountsCache = { data, fetchedAt: Date.now() };
    return data;
  } catch (err) {
    logger.warn('Could not fetch WP counts live', { error: err.message });
    return wpCountsCache.data; // serve stale cache rather than nothing
  }
}

/**
 * Returns the full dashboard payload for the /api/dashboard endpoint.
 */
async function getDashboard() {
  try {
    const [stats, wpCounts] = await Promise.all([
      Promise.resolve(db.getDashboardStats()),
      fetchWPCounts(),
    ]);
    const today = stats.metrics_today || {};
    const gsc = stats.latest_gsc || {};
    const analytics = stats.latest_analytics || {};
    const audit = stats.latest_audit || {};
    const lp = stats.landing_pages || {};

    return {
      timestamp: new Date().toISOString(),
      overview: {
        total_pages: wpCounts ? wpCounts.posts : (stats.total_pages || 0),
        total_wp_pages: wpCounts ? wpCounts.pages : 0,
        total_wp_posts: wpCounts ? wpCounts.posts : (stats.total_pages || 0),
        total_site_pages: wpCounts ? wpCounts.total + (lp.total || 0) : ((stats.total_pages || 0) + (lp.total || 0)),
        wp_counts_live: !!wpCounts,
        pages_published_today: stats.pages_published_today || 0,
        pages_indexed_today: stats.pages_indexed_today || 0,
        pages_indexed_total: stats.pages_indexed_total || 0,
        pages_indexed_this_week: stats.pages_indexed_this_week || 0,
        failed_jobs: stats.failed_jobs || 0,
        queue_length: stats.queue_length || 0,
        seo_issues_open: stats.seo_issues_open || 0,
        landing_pages_total: lp.total || 0,
        landing_pages_published: lp.published || 0,
        landing_pages_published_this_week: stats.landing_pages_published_this_week || 0,
      },
      today: {
        pages_created: today.pages_created || 0,
        pages_published: today.pages_published || 0,
        pages_indexed: today.pages_indexed || 0,
        pages_failed: today.pages_failed || 0,
        retries_performed: today.retries_performed || 0,
        errors_encountered: today.errors_encountered || 0,
        avg_publish_time_sec: today.avg_publish_ms ? (today.avg_publish_ms / 1000).toFixed(2) : null,
        avg_index_time_sec: today.avg_index_ms ? (today.avg_index_ms / 1000).toFixed(2) : null,
      },
      gsc: {
        impressions: gsc.impressions || null,
        clicks: gsc.clicks || null,
        avg_ctr: gsc.avg_ctr || null,
        avg_position: gsc.avg_position || null,
        date_range: gsc.date_range || '28 days',
        synced_at: gsc.synced_at || null,
      },
      analytics: {
        sessions: analytics.sessions || null,
        users: analytics.users || null,
        organic_sessions: analytics.organic_sessions || null,
        conversions: analytics.conversions || null,
        bounce_rate: analytics.bounce_rate || null,
        avg_session_duration: analytics.avg_session_duration || null,
        synced_at: analytics.synced_at || null,
      },
      audit: {
        pages_audited: audit.pages_audited || 0,
        issues_found: audit.issues_found || 0,
        issues_fixed: audit.issues_fixed || 0,
        completed_at: audit.completed_at || null,
        status: audit.status || null,
      },
      workers: {
        content: 'running',
        seo: 'running',
        analytics: 'running',
        monitoring: 'running',
        queue: 'running',
      },
      scheduler: scheduler.getStatus(),
    };
  } catch (err) {
    logger.error('Failed to build dashboard metrics', { error: err.message });
    return { error: err.message, timestamp: new Date().toISOString() };
  }
}

/**
 * Returns weekly trend data for charts.
 */
function getWeeklyTrend() {
  return db.getMetricsRange(7);
}

/**
 * Returns recent SEO issues for the dashboard panel.
 */
function getSEOIssues(limit = 20) {
  return db.getRecentSEOIssues(limit);
}

/**
 * Returns recent reports.
 */
function getRecentReports(limit = 10) {
  return db.getRecentReports(limit);
}

/**
 * Returns landing page statistics.
 */
function getLandingPageStats() {
  return db.getLandingPageStats();
}

/**
 * Returns GSC trend data for charts.
 */
function getGSCTrend(days = 7) {
  return db.getGSCTrend(days);
}

function getRecentPages(limit = 50) {
  return db.getDb().prepare(
    'SELECT id, title, slug, status, url, published_at, indexed_at, created_at FROM pages ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

function getRecentLandingPages(limit = 50) {
  return db.getDb().prepare(
    'SELECT id, city, state, keyword, service_type, slug, title, status, url, seo_score, published_at, indexed_at, created_at FROM landing_pages ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

module.exports = {
  getDashboard,
  getWeeklyTrend,
  getSEOIssues,
  getRecentReports,
  getLandingPageStats,
  getGSCTrend,
  getRecentPages,
  getRecentLandingPages,
};
