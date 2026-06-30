'use strict';

const logger = require('../../services/Logger');
const analyticsWorker = require('../../workers/AnalyticsWorker');
const reportService = require('../../services/ReportService');
const telegram = require('../../services/TelegramService');

/**
 * Runs daily: syncs GSC + GA4 data and sends the daily report.
 */
async function run() {
  logger.info('Running analytics sync job');

  try {
    // Sync Google data
    const syncResults = await analyticsWorker.syncAll();

    // Generate and send daily report
    const report = await reportService.generateDailyReport();
    await telegram.sendDailyReport(report);

    logger.info('Analytics sync complete', {
      gscOk: !!syncResults.gsc,
      gaOk: !!syncResults.ga,
    });

    return syncResults;
  } catch (err) {
    logger.error('Analytics sync job failed', { error: err.message });
    await telegram.notifyWorkflowError(
      { website: "Mandy's Laundry", project: 'analytics-sync' },
      `Analytics sync failed: ${err.message}`
    ).catch(() => {});
    throw err;
  }
}

module.exports = { run };
