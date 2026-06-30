'use strict';

const { google } = require('googleapis');
const config = require('../config');
const logger = require('./Logger');

let oauth2Client;

async function getAuth() {
  if (oauth2Client) return oauth2Client;
  if (!config.google.clientId || !config.google.clientSecret || !config.google.refreshToken) {
    throw new Error('Google OAuth credentials missing — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN');
  }
  oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oauth2Client.setCredentials({ refresh_token: config.google.refreshToken });
  return oauth2Client;
}

/**
 * Queries Search Console analytics.
 * dimensions: ['page'] | ['query'] | ['date'] | ['page','query']
 */
async function getSearchAnalytics({ startDate, endDate, dimensions = ['page'], rowLimit = 25 } = {}) {
  const auth = await getAuth();
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  const end = endDate || new Date().toISOString().slice(0, 10);
  const start = startDate || new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);

  logger.info('Fetching GSC search analytics', { start, end, dimensions });

  const response = await searchconsole.searchanalytics.query({
    siteUrl: config.google.siteUrl,
    requestBody: {
      startDate: start,
      endDate: end,
      dimensions,
      rowLimit,
      dataState: 'all',
    },
  });

  return response.data.rows || [];
}

/**
 * Inspects indexing status for a list of URLs via URL Inspection API.
 */
async function getIndexStatus(urls = []) {
  const auth = await getAuth();
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  const results = [];
  for (const inspectionUrl of urls.slice(0, 10)) {
    try {
      const resp = await searchconsole.urlInspection.index.inspect({
        requestBody: { inspectionUrl, siteUrl: config.google.siteUrl },
      });
      const r = resp.data.inspectionResult?.indexStatusResult;
      results.push({
        url: inspectionUrl,
        indexingState: r?.indexingState || 'UNKNOWN',
        coverageState: r?.coverageState || 'UNKNOWN',
        lastCrawlTime: r?.lastCrawlTime || null,
      });
    } catch (err) {
      logger.warn('URL inspection failed', { url: inspectionUrl, error: err.message });
      results.push({ url: inspectionUrl, indexingState: 'ERROR', error: err.message });
    }
  }
  return results;
}

/**
 * Returns a 28-day site-level summary (totals + averages).
 */
async function getSiteSummary(days = 28) {
  const rows = await getSearchAnalytics({ dimensions: ['date'], rowLimit: days });
  if (!rows.length) return null;

  const totals = rows.reduce(
    (acc, row) => ({
      impressions: acc.impressions + (row.impressions || 0),
      clicks: acc.clicks + (row.clicks || 0),
      ctrSum: acc.ctrSum + (row.ctr || 0),
      posSum: acc.posSum + (row.position || 0),
      count: acc.count + 1,
    }),
    { impressions: 0, clicks: 0, ctrSum: 0, posSum: 0, count: 0 }
  );

  return {
    impressions: totals.impressions,
    clicks: totals.clicks,
    avgCtr: totals.count > 0 ? (totals.ctrSum / totals.count * 100).toFixed(2) : '0',
    avgPosition: totals.count > 0 ? (totals.posSum / totals.count).toFixed(1) : '0',
    dateRange: `${days} days`,
  };
}

/**
 * Top pages by clicks over the last 28 days.
 */
async function getTopPages(limit = 10) {
  const rows = await getSearchAnalytics({ dimensions: ['page'], rowLimit: limit });
  return rows.map(row => ({
    page: row.keys?.[0] || '',
    impressions: row.impressions || 0,
    clicks: row.clicks || 0,
    ctr: `${((row.ctr || 0) * 100).toFixed(2)}%`,
    position: (row.position || 0).toFixed(1),
  }));
}

/**
 * Top queries by clicks over the last 28 days.
 */
async function getTopQueries(limit = 10) {
  const rows = await getSearchAnalytics({ dimensions: ['query'], rowLimit: limit });
  return rows.map(row => ({
    query: row.keys?.[0] || '',
    impressions: row.impressions || 0,
    clicks: row.clicks || 0,
    ctr: `${((row.ctr || 0) * 100).toFixed(2)}%`,
    position: (row.position || 0).toFixed(1),
  }));
}

/**
 * Compares last 7 days vs prior 7 days for trend detection.
 */
async function getWeeklyComparison() {
  const now = Date.now();
  const fmt = ms => new Date(ms).toISOString().slice(0, 10);

  const [prev, curr] = await Promise.all([
    getSearchAnalytics({ startDate: fmt(now - 14 * 86400000), endDate: fmt(now - 8 * 86400000), dimensions: ['date'], rowLimit: 7 }),
    getSearchAnalytics({ startDate: fmt(now - 7 * 86400000), endDate: fmt(now), dimensions: ['date'], rowLimit: 7 }),
  ]);

  const sum = rows => rows.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions }), { clicks: 0, impressions: 0 });
  const prevTotals = sum(prev);
  const currTotals = sum(curr);

  return {
    previous: prevTotals,
    current: currTotals,
    clicksChange: prevTotals.clicks > 0 ? ((currTotals.clicks - prevTotals.clicks) / prevTotals.clicks).toFixed(3) : '0',
    impressionsChange: prevTotals.impressions > 0 ? ((currTotals.impressions - prevTotals.impressions) / prevTotals.impressions).toFixed(3) : '0',
  };
}

function isConfigured() {
  return !!(config.google.clientId && config.google.clientSecret && config.google.refreshToken);
}

module.exports = {
  getSearchAnalytics,
  getIndexStatus,
  getSiteSummary,
  getTopPages,
  getTopQueries,
  getWeeklyComparison,
  isConfigured,
};
