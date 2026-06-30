'use strict';

const db = require('./Database');
const logger = require('./Logger');

function pct(n, d) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : 'N/A';
}

/**
 * Generates a daily report from all DB sources and saves it.
 */
async function generateDailyReport() {
  const today = new Date().toISOString().slice(0, 10);
  logger.info('Generating daily report', { date: today });

  const metrics = db.getTodayMetrics();
  const stats = db.getDashboardStats();
  const gsc = db.getLatestGSCSummary();
  const analytics = db.getLatestAnalyticsSummary();
  const latestAudit = db.getLatestAuditRun();
  const landingPages = db.getLandingPageStats();

  const summary = {
    date: today,
    // Content
    pagesCreated: metrics.pages_created || 0,
    pagesPublished: metrics.pages_published || 0,
    pagesIndexed: metrics.pages_indexed || 0,
    pagesFailed: metrics.pages_failed || 0,
    publishSuccessRate: pct(metrics.pages_published, metrics.pages_created),
    indexSuccessRate: pct(metrics.pages_indexed, metrics.pages_published),
    queueLength: stats.queue_length || 0,
    retriesPerformed: metrics.retries_performed || 0,
    errorsEncountered: metrics.errors_encountered || 0,
    // Landing pages
    landingPagesTotal: landingPages.total || 0,
    landingPagesPublished: landingPages.published || 0,
    // SEO
    seoIssuesOpen: db.countSEOIssues('open'),
    seoIssuesResolvedToday: db.countSEOIssuesResolvedToday(),
    auditPagesScanned: latestAudit?.pages_audited || 0,
    auditIssuesFound: latestAudit?.issues_found || 0,
    auditLastRun: latestAudit?.completed_at || null,
    // Google Search Console
    gscImpressions: gsc?.impressions || null,
    gscClicks: gsc?.clicks || null,
    gscAvgCtr: gsc?.avg_ctr || null,
    gscAvgPosition: gsc?.avg_position || null,
    // Analytics
    analyticsSessions: analytics?.sessions || null,
    analyticsUsers: analytics?.users || null,
    analyticsOrganicSessions: analytics?.organic_sessions || null,
    analyticsConversions: analytics?.conversions || null,
    analyticsBounceRate: analytics?.bounce_rate || null,
  };

  const report = {
    type: 'daily',
    period: today,
    title: `Daily SEO Report — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`,
    summary,
  };

  db.saveReport(report);
  logger.info('Daily report saved', { date: today, pagesPublished: summary.pagesPublished });
  return report;
}

/**
 * Generates a weekly report aggregating 7 days of data.
 */
async function generateWeeklyReport() {
  const today = new Date().toISOString().slice(0, 10);
  logger.info('Generating weekly report', { date: today });

  const metricsRange = db.getMetricsRange(7);
  const issuesSummary = db.getSEOIssuesSummary();
  const gscTrend = db.getGSCTrend(7);
  const analyticsTrend = db.getAnalyticsTrend(7);
  const latestAudit = db.getLatestAuditRun();

  const totals = metricsRange.reduce(
    (acc, d) => ({
      pages_created: acc.pages_created + (d.pages_created || 0),
      pages_published: acc.pages_published + (d.pages_published || 0),
      pages_indexed: acc.pages_indexed + (d.pages_indexed || 0),
      pages_failed: acc.pages_failed + (d.pages_failed || 0),
      errors: acc.errors + (d.errors_encountered || 0),
    }),
    { pages_created: 0, pages_published: 0, pages_indexed: 0, pages_failed: 0, errors: 0 }
  );

  const summary = {
    period: '7 days',
    endDate: today,
    ...totals,
    publishSuccessRate: pct(totals.pages_published, totals.pages_created),
    indexSuccessRate: pct(totals.pages_indexed, totals.pages_published),
    seoIssuesByType: issuesSummary.slice(0, 10),
    openIssuesTotal: db.countSEOIssues('open'),
    resolvedIssuesTotal: db.countSEOIssues('resolved'),
    audit: latestAudit ? {
      pagesAudited: latestAudit.pages_audited,
      issuesFound: latestAudit.issues_found,
      issuesFixed: latestAudit.issues_fixed,
      completedAt: latestAudit.completed_at,
    } : null,
    gscTrend,
    analyticsTrend,
    topSEOIssues: issuesSummary.slice(0, 5),
  };

  const report = {
    type: 'weekly',
    period: today,
    title: `Weekly SEO Report — Week ending ${today}`,
    summary,
  };

  db.saveReport(report);
  logger.info('Weekly report saved', { period: report.period });
  return report;
}

/**
 * Gets recent reports from the database.
 */
function getRecentReports(limit = 10) {
  return db.getRecentReports(limit);
}

module.exports = { generateDailyReport, generateWeeklyReport, getRecentReports };
