'use strict';

const cron = require('node-cron');
const config = require('../config');
const logger = require('../services/Logger');

const dailySummaryJob = require('./jobs/dailySummary');
const healthCheckJob = require('./jobs/healthCheck');
const { runBatch } = require('../workflows/ContentWorkflow');

const registeredTasks = [];

function schedule(name, cronExpr, fn) {
  if (!cron.validate(cronExpr)) {
    logger.error(`Invalid cron expression for "${name}": ${cronExpr}`);
    return;
  }

  const task = cron.schedule(cronExpr, async () => {
    logger.info(`Cron job starting: ${name}`);
    try {
      await fn();
      logger.info(`Cron job completed: ${name}`);
    } catch (err) {
      logger.error(`Cron job failed: ${name}`, { error: err.message });
    }
  }, { scheduled: false, timezone: 'America/Los_Angeles' });

  registeredTasks.push({ name, task, cronExpr });
  logger.info(`Scheduled: ${name} [${cronExpr}]`);
  return task;
}

function start() {
  logger.info('Starting scheduler...');

  schedule('Daily Summary', config.cron.dailySummary, () => dailySummaryJob.run());
  schedule('Health Check', config.cron.healthCheck, () => healthCheckJob.run());
  schedule('Content Generation', config.cron.contentGen, () => runBatch());

  registeredTasks.forEach(({ task }) => task.start());

  logger.info(`Scheduler started with ${registeredTasks.length} jobs`, {
    jobs: registeredTasks.map(t => `${t.name} [${t.cronExpr}]`),
  });
}

function stop() {
  registeredTasks.forEach(({ name, task }) => {
    task.stop();
    logger.debug(`Stopped cron job: ${name}`);
  });
  registeredTasks.length = 0;
  logger.info('Scheduler stopped');
}

module.exports = { start, stop };
