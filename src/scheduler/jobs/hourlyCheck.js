'use strict';

const logger = require('../../services/Logger');
const monitoring = require('../../workers/MonitoringWorker');
const { runIndexBatch } = require('../../workers/ContentWorker');

/**
 * Runs every hour: website uptime + index up to 20 published pages.
 */
async function run() {
  logger.info('Running hourly check');
  const results = {};

  // 1. Website uptime
  try {
    results.uptime = await monitoring.checkUptime();
  } catch (err) {
    results.uptime = { ok: false, error: err.message };
    logger.warn('Hourly uptime check failed', { error: err.message });
  }

  // 2. Index batch — submit up to 20 published-but-not-indexed pages to Google
  try {
    results.indexing = await runIndexBatch();
  } catch (err) {
    results.indexing = { total: 0, passed: 0, error: err.message };
    logger.warn('Hourly index batch failed', { error: err.message });
  }

  logger.info('Hourly check complete', results);
  return results;
}

module.exports = { run };
