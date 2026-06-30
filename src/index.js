'use strict';

require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const logger = require('./services/Logger');
const db = require('./services/Database');
const telegram = require('./services/TelegramService');
const scheduler = require('./scheduler/Scheduler');
const worker = require('./workers/WorkflowWorker');
const metrics = require('./services/MetricsService');
const health = require('./services/HealthMonitor');

const DASHBOARD_PATH = path.join(__dirname, '..', 'dashboard.html');

function serveJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify(data));
}

function serveDashboard(res) {
  try {
    const html = fs.readFileSync(DASHBOARD_PATH, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Dashboard not found');
  }
}

function createRouter() {
  return async (req, res) => {
    const url = (req.url || '/').split('?')[0];

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' });
      res.end();
      return;
    }

    switch (url) {
      case '/':
      case '/dashboard':
        return serveDashboard(res);

      case '/health':
        return serveJSON(res, { status: 'ok', uptime: process.uptime(), version: require('../package.json').version });

      case '/api/dashboard':
        return serveJSON(res, metrics.getDashboard());

      case '/api/trend':
        return serveJSON(res, metrics.getWeeklyTrend());

      case '/api/seo-issues':
        return serveJSON(res, metrics.getSEOIssues(30));

      case '/api/reports':
        return serveJSON(res, metrics.getRecentReports(10));

      case '/api/pages':
        return serveJSON(res, metrics.getRecentPages(50));

      case '/api/landing-pages/list':
        return serveJSON(res, metrics.getRecentLandingPages(50));

      case '/api/landing-pages':
        return serveJSON(res, metrics.getLandingPageStats());

      case '/api/gsc-trend':
        return serveJSON(res, metrics.getGSCTrend(14));

      case '/api/health':
        try {
          const results = await health.runAllChecks();
          return serveJSON(res, results);
        } catch (err) {
          return serveJSON(res, { error: err.message }, 500);
        }

      default:
        return serveJSON(res, { status: 'ok', uptime: process.uptime() });
    }
  };
}

async function start() {
  logger.info("=== Mandy's Laundry SEO Automation Starting ===", {
    env: process.env.NODE_ENV,
    version: require('../package.json').version,
  });

  // Initialize database
  db.getDb();
  logger.info('Database ready');

  // Initial health check
  try {
    const results = await health.runAllChecks();
    const down = results.filter(r => r.ok === false);
    if (down.length > 0) {
      logger.warn('Some services down on startup', { services: down.map(s => s.service) });
    }
  } catch (err) {
    logger.warn('Initial health check failed', { error: err.message });
  }

  // Start scheduler (all cron jobs)
  scheduler.start();

  // Start queue worker (polls every 30s)
  worker.start(30000);

  // Send startup notification
  await telegram.sendStartupNotification().catch(err => {
    logger.warn('Startup notification failed', { error: err.message });
  });

  // Log startup dashboard snapshot
  const dash = metrics.getDashboard();
  logger.info('System dashboard at startup', {
    totalPages: dash.overview?.total_pages,
    openSEOIssues: dash.overview?.seo_issues_open,
    queueLength: dash.overview?.queue_length,
  });

  // HTTP server: serves dashboard + JSON API
  const port = process.env.PORT || 3000;
  const router = createRouter();
  http.createServer(router).listen(port, () => {
    logger.info(`Server listening on port ${port}`, {
      dashboard: `http://localhost:${port}/dashboard`,
      api: `http://localhost:${port}/api/dashboard`,
    });
  });

  logger.info("=== System fully operational ===");
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

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', async (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
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
