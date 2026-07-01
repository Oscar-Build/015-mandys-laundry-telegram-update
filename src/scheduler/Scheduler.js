'use strict';

const cron = require('node-cron');
const config = require('../config');
const logger = require('../services/Logger');

const dailySummaryJob = require('./jobs/dailySummary');
const healthCheckJob = require('./jobs/healthCheck');
const tenMinuteCheckJob = require('./jobs/tenMinuteCheck');
const hourlyCheckJob = require('./jobs/hourlyCheck');
const analyticsSyncJob = require('./jobs/analyticsSync');
const weeklyAuditJob = require('./jobs/weeklyAudit');
const endOfDayReportJob = require('./jobs/endOfDayReport');
const autoPushJob = require('./jobs/autoPush');
const dailyCheckinJob = require('./jobs/dailyCheckin');
const { runBlogBatch } = require('../workers/ContentWorker');
const { runLandingPageBatch } = require('../workers/ContentWorker');

const telegram = require('../services/TelegramService');

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
      // Immediately alert Telegram on any cron job failure
      await telegram.send(
        `🚨 <b>Workflow Error: ${name}</b>\n\n❗ ${err.message}\n\n🕐 ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`
      ).catch(() => {});
    }
  }, { scheduled: false, timezone: 'America/Los_Angeles' });

  registeredTasks.push({ name, task, cronExpr });
  logger.info(`Scheduled: ${name} [${cronExpr}]`);
  return task;
}

function start() {
  logger.info('Starting scheduler...');

  // ── Every 5 minutes: health checks ──────────────────────────────────────────
  schedule('Health Check', config.cron.healthCheck, () => healthCheckJob.run());

  // ── Every 10 minutes: queue + worker health ──────────────────────────────────
  schedule('10-Min Check', config.cron.tenMinuteCheck, () => tenMinuteCheckJob.run());

  // ── Every hour: uptime + indexing retries ────────────────────────────────────
  schedule('Hourly Check', config.cron.hourlyCheck, () => hourlyCheckJob.run());

  // ── Daily 6:00 AM: generate blog posts ──────────────────────────────────────
  schedule('Blog Content Generation', config.cron.contentGen, () => runBlogBatch());

  // ── Daily 6:30 AM: generate local landing pages ─────────────────────────────
  schedule('Landing Page Generation', config.cron.landingPageGen, () => runLandingPageBatch());

  // ── Daily 7:00 AM: sync GSC + GA4 + send daily report ───────────────────────
  schedule('Analytics Sync', config.cron.analyticsSync, () => analyticsSyncJob.run());

  // ── Daily 8:00 AM: send daily summary to Telegram ───────────────────────────
  schedule('Daily Summary', config.cron.dailySummary, () => dailySummaryJob.run());

  // ── Every 60 minutes: auto-push changes to GitHub ───────────────────────────
  schedule('Auto Push', '0 * * * *', () => autoPushJob.run());

  // ── Daily 9:30 PM: team check-in (completed / running / smoke signals / next) ─
  schedule('Daily Check-In', '30 21 * * *', () => dailyCheckinJob.run());

  // ── Daily 10:00 PM: end-of-day summary to Telegram group ────────────────────
  schedule('End-of-Day Report', config.cron.endOfDayReport, () => endOfDayReportJob.run());

  // ── Every Monday 3:00 AM: full site audit + weekly report ───────────────────
  schedule('Weekly Audit', config.cron.weeklyAudit, () => weeklyAuditJob.run());

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

function getStatus() {
  return registeredTasks.map(t => ({ name: t.name, cronExpr: t.cronExpr }));
}

module.exports = { start, stop, getStatus };
