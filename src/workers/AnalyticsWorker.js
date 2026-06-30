'use strict';

const logger = require('../services/Logger');
const db = require('../services/Database');
const telegram = require('../services/TelegramService');
const gsc = require('../services/SearchConsoleService');
const analytics = require('../services/AnalyticsService');

/**
 * Syncs Google Search Console data into the local database.
 */
async function syncGSCData() {
  if (!gsc.isConfigured()) {
    logger.info('Analytics Worker: GSC not configured, skipping');
    return null;
  }

  try {
    logger.info('Analytics Worker: Syncing GSC data');

    const [summary, topPages] = await Promise.all([
      gsc.getSiteSummary(28),
      gsc.getTopPages(10),
    ]);

    if (summary) {
      db.saveGSCSummary(summary);
    }

    const today = new Date().toISOString().slice(0, 10);
    for (const page of topPages) {
      db.saveGSCMetric({
        date: today,
        page: page.page,
        impressions: page.impressions,
        clicks: page.clicks,
        ctr: parseFloat(page.ctr) / 100,
        position: parseFloat(page.position),
      });
    }

    logger.info('Analytics Worker: GSC sync complete', {
      impressions: summary?.impressions,
      clicks: summary?.clicks,
      avgPosition: summary?.avgPosition,
    });

    return { summary, topPages };
  } catch (err) {
    logger.error('Analytics Worker: GSC sync failed', { error: err.message });
    await telegram.notifyWorkflowError(
      { website: "Mandy's Laundry", project: 'analytics-worker' },
      `GSC sync failed: ${err.message}`
    );
    return null;
  }
}

/**
 * Syncs Google Analytics 4 data into the local database.
 */
async function syncAnalyticsData() {
  if (!analytics.isConfigured()) {
    logger.info('Analytics Worker: GA4 not configured, skipping');
    return null;
  }

  try {
    logger.info('Analytics Worker: Syncing GA4 data');

    const [summary, organic, comparison] = await Promise.all([
      analytics.getTrafficSummary(28),
      analytics.getOrganicTraffic(28),
      analytics.getTrafficComparison(),
    ]);

    if (summary) {
      db.saveAnalyticsSummary({ ...summary, ...(organic || {}), dateRange: '28 days' });
    }

    if (comparison?.trend === 'drop') {
      await telegram.notifyTrafficDrop({
        dropPercent: Math.abs(comparison.change * 100).toFixed(1),
        previous: comparison.previous,
        current: comparison.current,
      });
    } else if (comparison?.trend === 'spike') {
      await telegram.notifyTrafficSpike({
        spikePercent: (comparison.change * 100).toFixed(1),
        previous: comparison.previous,
        current: comparison.current,
      });
    }

    logger.info('Analytics Worker: GA4 sync complete', {
      sessions: summary?.sessions,
      organic: organic?.organicSessions,
      trend: comparison?.trend,
    });

    return { summary, organic, comparison };
  } catch (err) {
    logger.error('Analytics Worker: GA4 sync failed', { error: err.message });
    await telegram.notifyWorkflowError(
      { website: "Mandy's Laundry", project: 'analytics-worker' },
      `GA4 sync failed: ${err.message}`
    );
    return null;
  }
}

/**
 * Runs both GSC and GA4 sync in parallel.
 */
async function syncAll() {
  const [gscResult, gaResult] = await Promise.allSettled([
    syncGSCData(),
    syncAnalyticsData(),
  ]);

  return {
    gsc: gscResult.status === 'fulfilled' ? gscResult.value : null,
    ga: gaResult.status === 'fulfilled' ? gaResult.value : null,
    gscError: gscResult.status === 'rejected' ? gscResult.reason?.message : null,
    gaError: gaResult.status === 'rejected' ? gaResult.reason?.message : null,
  };
}

module.exports = { syncGSCData, syncAnalyticsData, syncAll };
