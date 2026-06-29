'use strict';

const db = require('../../services/Database');
const logger = require('../../services/Logger');
const telegram = require('../../services/TelegramService');
const git = require('../../services/GitService');

async function run() {
  logger.info('Running daily summary job');

  try {
    const metrics = db.getTodayMetrics();
    const stats = db.getDashboardStats();

    const combined = {
      ...metrics,
      queue_length: stats.queue_length,
    };

    await telegram.sendDailySummary(combined);
    await git.autoCommitDailySummary(metrics);

    logger.info('Daily summary sent', { date: metrics.date });
    return combined;
  } catch (err) {
    logger.error('Daily summary job failed', { error: err.message });
    await telegram.send(`⚠️ *Daily Summary Failed*\n\n❗ Error: ${err.message}`).catch(() => {});
    throw err;
  }
}

module.exports = { run };
