'use strict';

const db = require('../services/Database');
const logger = require('../services/Logger');
const telegram = require('../services/TelegramService');
const { runBlogWorkflow, runLandingPageWorkflow } = require('./ContentWorker');
const { runAudit, autoFixIssues, checkBrokenLinks } = require('./SEOWorker');
const { syncAll } = require('./AnalyticsWorker');
const { runAllMonitoringChecks } = require('./MonitoringWorker');

let running = false;
let intervalHandle;

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
        await runBlogWorkflow(payload.topic || 'Laundry Tips & Tricks');
        break;

      case 'generate_landing_page':
        await runLandingPageWorkflow({
          city: payload.city || 'Los Angeles',
          state: payload.state || 'CA',
          keyword: payload.keyword || 'laundry service',
          serviceType: payload.serviceType || 'laundry service',
        });
        break;

      case 'seo_audit':
        await runAudit();
        break;

      case 'seo_auto_fix':
        await autoFixIssues();
        break;

      case 'check_broken_links':
        await checkBrokenLinks();
        break;

      case 'sync_analytics':
        await syncAll();
        break;

      case 'monitoring_check':
        await runAllMonitoringChecks();
        break;

      default:
        logger.warn('Unknown job type', { type: job.type, jobId: job.id });
    }

    db.updateJob(job.id, { status: 'completed', completed_at: new Date().toISOString() });
    logger.info('Job completed', { jobId: job.id, type: job.type });
  } catch (err) {
    logger.error('Job failed', { jobId: job.id, type: job.type, error: err.message });
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
