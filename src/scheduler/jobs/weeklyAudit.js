'use strict';

const logger = require('../../services/Logger');
const monitoring = require('../../workers/MonitoringWorker');
const seoWorker = require('../../workers/SEOWorker');
const reportService = require('../../services/ReportService');
const telegram = require('../../services/TelegramService');

/**
 * Runs every Monday: full site audit, auto-fix, and weekly report.
 */
async function run() {
  logger.info('Running weekly audit job');

  // Step 1: Full monitoring health check
  let monitoringResults;
  try {
    monitoringResults = await monitoring.runAllMonitoringChecks();
  } catch (err) {
    logger.error('Weekly audit: monitoring checks failed', { error: err.message });
    monitoringResults = { error: err.message };
  }

  // Step 2: Full SEO audit across all site pages
  let auditResults;
  try {
    auditResults = await seoWorker.runAudit();
  } catch (err) {
    logger.error('Weekly audit: SEO audit failed', { error: err.message });
    auditResults = { pagesAudited: 0, issuesFound: 0, issues: [], error: err.message };
  }

  // Step 3: Auto-fix anything we can
  let fixResults;
  try {
    fixResults = await seoWorker.autoFixIssues();
  } catch (err) {
    logger.warn('Weekly audit: auto-fix failed', { error: err.message });
    fixResults = { fixed: 0, total: 0 };
  }

  // Step 4: Generate weekly report
  let weeklyReport;
  try {
    weeklyReport = await reportService.generateWeeklyReport();
    await telegram.sendWeeklyReport(weeklyReport, { monitoringResults, auditResults, fixResults });
  } catch (err) {
    logger.error('Weekly audit: report failed', { error: err.message });
  }

  logger.info('Weekly audit complete', {
    pagesAudited: auditResults?.pagesAudited || 0,
    issuesFound: auditResults?.issuesFound || 0,
    issuesFixed: fixResults?.fixed || 0,
  });

  return { monitoringResults, auditResults, fixResults, weeklyReport };
}

module.exports = { run };
