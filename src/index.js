'use strict';

// Load env vars before anything else
require('dotenv').config();

const http = require('http');
const logger = require('./services/Logger');
const db = require('./services/Database');
const telegram = require('./services/TelegramService');
const scheduler = require('./scheduler/Scheduler');
const worker = require('./workers/WorkflowWorker');
const metrics = require('./services/MetricsService');
const health = require('./services/HealthMonitor');

async function start() {
  logger.info('=== Mandy\'s Laundry Automation Starting ===', {
    env: process.env.NODE_ENV,
    version: require('../package.json').version,
  });

  // Initialize database (creates tables if needed)
  db.getDb();
  logger.info('Database ready');

  // Run initial health check
  try {
    const results = await health.runAllChecks();
    const downServices = results.filter(r => r.ok === false);
    if (downServices.length > 0) {
      logger.warn('Some services are down on startup', { services: downServices.map(s => s.service) });
    }
  } catch (err) {
    logger.warn('Initial health check failed', { error: err.message });
  }

  // Start scheduler (cron jobs)
  scheduler.start();

  // Start queue worker (polls every 30s)
  worker.start(30000);

  // Send startup notification to Telegram
  await telegram.sendStartupNotification().catch(err => {
    logger.warn('Startup notification failed', { error: err.message });
  });

  // Log current dashboard stats
  const dashboard = metrics.getDashboard();
  logger.info('Dashboard stats at startup', dashboard);

  // Health check HTTP server for Railway/cloud hosting
  const port = process.env.PORT || 3000;
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  }).listen(port, () => {
    logger.info(`Health server listening on port ${port}`);
  });

  logger.info('=== System fully operational ===');
}

async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    scheduler.stop();
    worker.stop();
    await telegram.sendShutdownNotification(signal).catch(() => {});
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', { error: err.message });
    process.exit(1);
  }
}

// --- Graceful shutdown handlers ---
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// --- Unhandled error safety net ---
process.on('uncaughtException', async (err) => {
  logger.error('Uncaught exception — system will restart', { error: err.message, stack: err.stack });
  await telegram.notifyWorkflowError(
    { website: "Mandy's Laundry", project: 'system' },
    `FATAL: ${err.message}`
  ).catch(() => {});
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
  await telegram.notifyWorkflowError(
    { website: "Mandy's Laundry", project: 'system' },
    `Unhandled Rejection: ${String(reason)}`
  ).catch(() => {});
});

start().catch(async (err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  await telegram.notifyWorkflowError(
    { website: "Mandy's Laundry", project: 'system' },
    `Startup failed: ${err.message}`
  ).catch(() => {});
  process.exit(1);
});
