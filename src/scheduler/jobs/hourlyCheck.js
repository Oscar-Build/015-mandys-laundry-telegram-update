'use strict';

const logger = require('../../services/Logger');
const db = require('../../services/Database');
const monitoring = require('../../workers/MonitoringWorker');
const indexing = require('../../services/IndexingService');

/**
 * Runs every hour: website uptime, indexing retries, and broken link scan.
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

  // 2. Retry failed indexing submissions
  try {
    const failedPages = db.getDb().prepare(`
      SELECT * FROM pages WHERE status = 'index_failed' AND url IS NOT NULL
      ORDER BY created_at DESC LIMIT 5
    `).all();

    let retried = 0;
    for (const page of failedPages) {
      if (indexing.isConfigured()) {
        try {
          await indexing.submitForIndexing(page.url);
          db.updatePage(page.id, { status: 'indexed', indexed_at: new Date().toISOString() });
          db.incrementMetric('pages_indexed');
          retried++;
          logger.info('Hourly retry: indexing succeeded', { url: page.url });
        } catch (_) {}
      }
    }
    results.indexingRetries = retried;
  } catch (err) {
    logger.warn('Hourly indexing retry failed', { error: err.message });
    results.indexingRetries = 0;
  }

  logger.info('Hourly check complete', results);
  return results;
}

module.exports = { run };
