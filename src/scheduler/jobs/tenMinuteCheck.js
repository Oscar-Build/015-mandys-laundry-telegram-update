'use strict';

const logger = require('../../services/Logger');
const db = require('../../services/Database');
const telegram = require('../../services/TelegramService');

/**
 * Runs every 10 minutes: checks queue health and worker state.
 */
async function run() {
  logger.debug('Running 10-minute check');

  try {
    const d = db.getDb();
    const pending = d.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'pending'").get().n;
    const processing = d.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'processing'").get().n;
    const failed = d.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'failed'").get().n;

    // Alert if too many stuck "processing" jobs (possible crashed worker)
    if (processing > 5) {
      await telegram.notifyWorkflowError(
        { website: "Mandy's Laundry", project: 'scheduler' },
        `Warning: ${processing} jobs stuck in "processing" state — possible worker crash`
      ).catch(() => {});
    }

    // Alert if too many failed jobs accumulated
    if (failed > 15) {
      await telegram.notifyWorkflowError(
        { website: "Mandy's Laundry", project: 'queue' },
        `High failure rate: ${failed} failed jobs in queue — investigate errors`
      ).catch(() => {});
    }

    logger.debug('10-min check complete', { pending, processing, failed });
    return { pending, processing, failed };
  } catch (err) {
    logger.error('10-min check failed', { error: err.message });
    return { error: err.message };
  }
}

module.exports = { run };
