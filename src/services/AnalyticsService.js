'use strict';

const { google } = require('googleapis');
const config = require('../config');
const logger = require('./Logger');

let oauth2Client;

async function getAuth() {
  if (oauth2Client) return oauth2Client;
  if (!config.google.clientId || !config.google.clientSecret || !config.google.refreshToken) {
    throw new Error('Google OAuth credentials missing for Analytics');
  }
  oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oauth2Client.setCredentials({ refresh_token: config.google.refreshToken });
  return oauth2Client;
}

async function runReport({ metrics, dimensions = [], dateRanges, limit = 25 }) {
  if (!config.google.ga4PropertyId) {
    throw new Error('GOOGLE_GA4_PROPERTY_ID not configured');
  }

  const auth = await getAuth();
  const analyticsdata = google.analyticsdata({ version: 'v1beta', auth });

  const defaultRanges = dateRanges || [{ startDate: '28daysAgo', endDate: 'today' }];

  const response = await analyticsdata.properties.runReport({
    property: `properties/${config.google.ga4PropertyId}`,
    requestBody: {
      dateRanges: defaultRanges,
      metrics: metrics.map(m => ({ name: m })),
      dimensions: dimensions.map(d => ({ name: d })),
      limit,
    },
  });

  return response.data;
}

function metricVal(row, idx) {
  return parseFloat(row?.metricValues?.[idx]?.value || '0');
}

/**
 * Returns summary traffic metrics for the last N days.
 */
async function getTrafficSummary(days = 28) {
  logger.info('Fetching GA4 traffic summary', { days });

  const data = await runReport({
    metrics: ['sessions', 'activeUsers', 'newUsers', 'bounceRate', 'averageSessionDuration', 'conversions'],
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
  });

  const row = data.rows?.[0];
  if (!row) return null;

  return {
    sessions: Math.round(metricVal(row, 0)),
    users: Math.round(metricVal(row, 1)),
    newUsers: Math.round(metricVal(row, 2)),
    bounceRate: (metricVal(row, 3) * 100).toFixed(1),
    avgSessionDuration: metricVal(row, 4).toFixed(0),
    conversions: Math.round(metricVal(row, 5)),
    dateRange: `${days} days`,
  };
}

/**
 * Returns organic search traffic specifically (GA4 channel grouping).
 */
async function getOrganicTraffic(days = 28) {
  const data = await runReport({
    metrics: ['sessions', 'activeUsers'],
    dimensions: ['sessionDefaultChannelGroup'],
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    limit: 20,
  });

  const row = data.rows?.find(r => r.dimensionValues?.[0]?.value === 'Organic Search');
  return {
    organicSessions: Math.round(metricVal(row, 0)),
    organicUsers: Math.round(metricVal(row, 1)),
  };
}

/**
 * Top pages by sessions over last 28 days.
 */
async function getTopPages(limit = 10) {
  const data = await runReport({
    metrics: ['sessions', 'activeUsers', 'bounceRate'],
    dimensions: ['pagePath'],
    dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
    limit,
  });

  return (data.rows || []).map(row => ({
    page: row.dimensionValues?.[0]?.value || '',
    sessions: Math.round(metricVal(row, 0)),
    users: Math.round(metricVal(row, 1)),
    bounceRate: (metricVal(row, 2) * 100).toFixed(1) + '%',
  }));
}

/**
 * Traffic by city for last 28 days.
 */
async function getTopCities(limit = 10) {
  const data = await runReport({
    metrics: ['sessions'],
    dimensions: ['city'],
    dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
    limit,
  });

  return (data.rows || []).map(row => ({
    city: row.dimensionValues?.[0]?.value || '',
    sessions: Math.round(metricVal(row, 0)),
  }));
}

/**
 * Traffic by device category.
 */
async function getTopDevices() {
  const data = await runReport({
    metrics: ['sessions'],
    dimensions: ['deviceCategory'],
    dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
  });

  return (data.rows || []).map(row => ({
    device: row.dimensionValues?.[0]?.value || '',
    sessions: Math.round(metricVal(row, 0)),
  }));
}

/**
 * Compares recent 7 days vs prior 7 days to detect traffic trends.
 */
async function getTrafficComparison() {
  const data = await runReport({
    metrics: ['sessions'],
    dateRanges: [
      { startDate: '14daysAgo', endDate: '8daysAgo' },
      { startDate: '7daysAgo', endDate: 'today' },
    ],
  });

  const prevSessions = Math.round(metricVal(data.rows?.[0], 0));
  const currSessions = Math.round(metricVal(data.rows?.[0], 1));
  const change = prevSessions > 0 ? (currSessions - prevSessions) / prevSessions : 0;

  return {
    previous: prevSessions,
    current: currSessions,
    change: parseFloat(change.toFixed(3)),
    trend: change > config.analytics.trafficSpikeThreshold ? 'spike'
         : change < -config.analytics.trafficDropThreshold ? 'drop'
         : 'stable',
  };
}

function isConfigured() {
  return !!(
    config.google.clientId &&
    config.google.clientSecret &&
    config.google.refreshToken &&
    config.google.ga4PropertyId
  );
}

module.exports = {
  getTrafficSummary,
  getOrganicTraffic,
  getTopPages,
  getTopCities,
  getTopDevices,
  getTrafficComparison,
  isConfigured,
};
