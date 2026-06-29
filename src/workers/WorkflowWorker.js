'use strict';

const db = require('../services/Database');
const logger = require('../services/Logger');
const telegram = require('../services/TelegramService');
const { runContentWorkflow } = require('../workflows/ContentWorkflow');

let running = false;
let intervalHandle;

/**
 * Processes pending jobs from the queue.
 * Designed to be called on an interval (e.g., every 30 seconds).
 */
async function processPendingJobs() {
  if (running) {
    logger.debug('Worker already processing, skipping tick');
    return;
  }
  running = true;

  try {
    const jobs = db.getDueJobs(3);
    if (jobs.length === 0) return;

    logger.info(`Processing ${jobs.length} pending jobs`);

    for (const job of jobs) {
      await processJob(job);
    }
  } catch (err) {
    logger.error('Worker loop error', { error: err.message });
    await telegram.notifyWorkflowError({ website: "Mandy's Laundry", project: 'queue-worker' }, err.message);
  } finally {
    running = false;
  }
}

async function processJob(job) {
  db.updateJob(job.id, { status: 'processing', attempts: job.attempts + 1 });

  try {
    const payload = job.payload ? JSON.parse(job.payload) : {};

    switch (job.type) {
      case 'generate_and_publish':
        await runContentWorkflow(payload.topic || 'Laundry Tips');
        break;
      default:
        logger.warn('Unknown job type', { type: job.type, jobId: job.id });
    }

    db.updateJob(job.id, { status: 'completed', completed_at: new Date().toISOString() });
    logger.info('Job completed', { jobId: job.id, type: job.type });
  } catch (err) {
    logger.error('Job failed', { jobId: job.id, error: err.message });
    db.updateJob(job.id, { status: 'failed', last_error: err.message });
  }
}

function start(intervalMs = 30000) {
  logger.info('Starting workflow worker', { intervalMs });
  processPendingJobs();
  intervalHandle = setInterval(processPendingJobs, intervalMs);
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('Workflow worker stopped');
  }
}

module.exports = { start, stop, processPendingJobs };
