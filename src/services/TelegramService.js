'use strict';

const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const logger = require('./Logger');
const db = require('./Database');

let bot;

function getBot() {
  if (bot) return bot;
  if (!config.telegram.botToken) {
    logger.warn('TELEGRAM_BOT_TOKEN not set — notifications disabled');
    return null;
  }
  bot = new TelegramBot(config.telegram.botToken, { polling: false });
  return bot;
}

function esc(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function now() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
}

async function send(message, dedupKey = null) {
  const b = getBot();
  if (!b) return false;

  if (dedupKey && db.wasNotificationSent(dedupKey)) {
    logger.debug('Skipping duplicate notification', { dedupKey });
    return false;
  }

  try {
    await b.sendMessage(config.telegram.chatId, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    if (dedupKey) db.markNotificationSent('generic', null, dedupKey);
    return true;
  } catch (err) {
    logger.error('Failed to send Telegram message', { error: err.message });
    try {
      const plain = message.replace(/<[^>]+>/g, '');
      await b.sendMessage(config.telegram.chatId, plain, {});
    } catch (e2) {
      logger.error('Telegram fallback also failed', { error: e2.message });
    }
    return false;
  }
}

// ── Content notifications ───────────────────────────────────────────────────

async function notifyPageCreated(page) {
  const msg = [
    `📝 <b>Page Created</b>`,
    ``,
    `📋 <b>Website:</b> ${esc(page.website)}`,
    `📄 <b>Title:</b> ${esc(page.title)}`,
    `🕐 <b>Time:</b> ${esc(now())}`,
  ].join('\n');
  await send(msg, `created:${page.id}`);
}

async function notifyContentGenerated(page) {
  const msg = [
    `✍️ <b>Content Generated</b>`,
    ``,
    `📄 <b>Title:</b> ${esc(page.title)}`,
    page.duration_ms ? `⏱ <b>Time:</b> ${(page.duration_ms / 1000).toFixed(2)}s` : '',
    `🕐 ${esc(now())}`,
  ].filter(Boolean).join('\n');
  await send(msg, `content_generated:${page.id}`);
}

async function notifyPagePublished(page) {
  const msg = [
    `✅ <b>Page Published</b>`,
    ``,
    `📄 <b>Title:</b> ${esc(page.title)}`,
    page.url ? `🔗 <b>URL:</b> ${esc(page.url)}` : '',
    page.duration_ms ? `⏱ <b>Duration:</b> ${(page.duration_ms / 1000).toFixed(2)}s` : '',
    `🕐 ${esc(now())}`,
  ].filter(Boolean).join('\n');
  await send(msg, `published:${page.id}`);
  db.incrementMetric('pages_published');
}

async function notifyIndexingSubmitted(page) {
  const msg = [
    `📤 <b>Indexing Submitted</b>`,
    ``,
    `📄 <b>Title:</b> ${esc(page.title)}`,
    page.url ? `🔗 <b>URL:</b> ${esc(page.url)}` : '',
    `🕐 ${esc(now())}`,
  ].filter(Boolean).join('\n');
  await send(msg, `index_submitted:${page.id}`);
}

async function notifyPageIndexed(page) {
  const msg = [
    `📈 <b>Page Indexed</b>`,
    ``,
    `📄 <b>Title:</b> ${esc(page.title)}`,
    page.url ? `🔗 <b>URL:</b> ${esc(page.url)}` : '',
    page.duration_ms ? `⏱ <b>Duration:</b> ${(page.duration_ms / 1000).toFixed(2)}s` : '',
    `🕐 ${esc(now())}`,
  ].filter(Boolean).join('\n');
  await send(msg, `indexed:${page.id}`);
  db.incrementMetric('pages_indexed');
}

async function notifyPublishFailed(page, error) {
  const msg = [
    `❌ <b>Publish Failed</b>`,
    ``,
    `📄 <b>Title:</b> ${esc(page.title)}`,
    `❗ <b>Error:</b> ${esc(String(error).slice(0, 300))}`,
    `🕐 ${esc(now())}`,
  ].join('\n');
  await send(msg);
  db.incrementMetric('pages_failed');
  db.incrementMetric('errors_encountered');
}

async function notifyGenerationFailed(page, error) {
  const msg = [
    `❌ <b>Content Generation Failed</b>`,
    ``,
    `📄 <b>Title:</b> ${esc(page.title)}`,
    `❗ <b>Error:</b> ${esc(String(error).slice(0, 300))}`,
    `🕐 ${esc(now())}`,
  ].join('\n');
  await send(msg);
  db.incrementMetric('errors_encountered');
}

async function notifyIndexingFailed(page, error) {
  const msg = [
    `⚠️ <b>Indexing Failed</b>`,
    ``,
    `📄 <b>Title:</b> ${esc(page?.title || 'Unknown')}`,
    page?.url ? `🔗 <b>URL:</b> ${esc(page.url)}` : '',
    `❗ <b>Error:</b> ${esc(String(error).slice(0, 300))}`,
    `🕐 ${esc(now())}`,
  ].filter(Boolean).join('\n');
  await send(msg);
  db.incrementMetric('errors_encountered');
}

async function notifyWorkflowError(context, error) {
  const msg = [
    `⚠️ <b>Workflow Error</b>`,
    ``,
    `📋 <b>Website:</b> ${esc(context.website || "Mandy's Laundry")}`,
    `📁 <b>Project:</b> ${esc(context.project || 'system')}`,
    `❗ <b>Error:</b> ${esc(String(error).slice(0, 400))}`,
    `🕐 ${esc(now())}`,
  ].join('\n');
  await send(msg);
  db.incrementMetric('errors_encountered');
}

async function notifyRetryAttempt(page, attempt, maxAttempts, reason) {
  const msg = [
    `🔄 <b>Retry Attempt ${attempt}/${maxAttempts}</b>`,
    ``,
    `📄 <b>Title:</b> ${esc(page.title)}`,
    `📋 <b>Reason:</b> ${esc(reason)}`,
    `🕐 ${esc(now())}`,
  ].join('\n');
  await send(msg);
  db.incrementMetric('retries_performed');
}

async function notifyWorkflowCompleted(page) {
  const msg = [
    `✅ <b>Workflow Complete</b>`,
    ``,
    `📄 <b>Title:</b> ${esc(page.title)}`,
    page.url ? `🔗 <b>URL:</b> ${esc(page.url)}` : '',
    page.duration_ms ? `⏱ <b>Total:</b> ${(page.duration_ms / 1000).toFixed(2)}s` : '',
    `🕐 ${esc(now())}`,
  ].filter(Boolean).join('\n');
  await send(msg, `workflow_completed:${page.id}`);
}

// ── Landing page notifications ───────────────────────────────────────────────

async function notifyLandingPagePublished({ id, city, state, serviceType, title, url }) {
  const msg = [
    `🗺️ <b>Landing Page Published</b>`,
    ``,
    `📍 <b>Location:</b> ${esc(`${city}, ${state}`)}`,
    `🏷️ <b>Service:</b> ${esc(serviceType)}`,
    `📄 <b>Title:</b> ${esc(title)}`,
    url ? `🔗 <b>URL:</b> ${esc(url)}` : '',
    `🕐 ${esc(now())}`,
  ].filter(Boolean).join('\n');
  await send(msg, `landing_published:${id}`);
}

// ── SEO Worker notifications ─────────────────────────────────────────────────

async function notifySEOAuditComplete({ pagesAudited, issuesFound, critical, high }) {
  const msg = [
    `🔍 <b>SEO Audit Complete</b>`,
    ``,
    `📊 <b>Pages Audited:</b> ${pagesAudited}`,
    `⚠️ <b>Issues Found:</b> ${issuesFound}`,
    critical > 0 ? `🚨 <b>Critical:</b> ${critical}` : '',
    high > 0 ? `🔴 <b>High Priority:</b> ${high}` : '',
    `🕐 ${esc(now())}`,
  ].filter(Boolean).join('\n');
  await send(msg);
}

async function notifySEOCriticalIssues(issues) {
  const topIssues = issues.slice(0, 5);
  const lines = [
    `🚨 <b>Critical SEO Issues Detected</b>`,
    ``,
    ...topIssues.map((i, n) => `${n + 1}. ${esc(i.type)}: ${esc((i.url || '').slice(0, 60))}`),
    '',
    issues.length > 5 ? `<i>... and ${issues.length - 5} more</i>` : '',
    `🕐 ${esc(now())}`,
  ].filter(l => l !== '');
  await send(lines.join('\n'));
}

async function notifySEOIssuesFixed(fixed, total) {
  const msg = [
    `🔧 <b>SEO Issues Auto-Fixed</b>`,
    ``,
    `✅ <b>Fixed:</b> ${fixed} / ${total}`,
    `🕐 ${esc(now())}`,
  ].join('\n');
  await send(msg);
}

async function notifyBrokenLinks(links) {
  const top = links.slice(0, 5);
  const lines = [
    `💔 <b>Broken Links Detected</b>`,
    ``,
    `Total: ${links.length} broken links`,
    ``,
    ...top.map(l => `• HTTP ${l.status}: ${esc((l.url || '').slice(0, 70))}`),
    `🕐 ${esc(now())}`,
  ];
  await send(lines.join('\n'));
}

// ── Analytics notifications ──────────────────────────────────────────────────

async function notifyTrafficDrop({ dropPercent, previous, current }) {
  const msg = [
    `📉 <b>Traffic Drop Detected</b>`,
    ``,
    `📊 <b>Drop:</b> ${esc(dropPercent)}% vs prior week`,
    `⬇️ <b>Previous:</b> ${previous} sessions`,
    `📌 <b>Current:</b> ${current} sessions`,
    ``,
    `<i>Review Google Analytics and Search Console immediately.</i>`,
    `🕐 ${esc(now())}`,
  ].join('\n');
  await send(msg, `traffic_drop:${new Date().toISOString().slice(0, 10)}`);
}

async function notifyTrafficSpike({ spikePercent, previous, current }) {
  const msg = [
    `📈 <b>Traffic Spike Detected</b>`,
    ``,
    `🚀 <b>Increase:</b> +${esc(spikePercent)}% vs prior week`,
    `⬇️ <b>Previous:</b> ${previous} sessions`,
    `📌 <b>Current:</b> ${current} sessions`,
    `🕐 ${esc(now())}`,
  ].join('\n');
  await send(msg, `traffic_spike:${new Date().toISOString().slice(0, 10)}`);
}

// ── Batch / report notifications ─────────────────────────────────────────────

async function sendBatchSummary(type, total, passed) {
  const failed = total - passed;
  const rate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const icon = rate >= 80 ? '✅' : rate >= 50 ? '⚠️' : '❌';
  const msg = [
    `${icon} <b>${esc(type)} Batch Complete</b>`,
    ``,
    `📊 <b>Total:</b> ${total}`,
    `✅ <b>Succeeded:</b> ${passed}`,
    failed > 0 ? `❌ <b>Failed:</b> ${failed}` : '',
    `📈 <b>Success Rate:</b> ${rate}%`,
    `🕐 ${esc(now())}`,
  ].filter(Boolean).join('\n');
  await send(msg);
}

async function sendDailyReport(report) {
  const s = report.summary || {};
  const lines = [
    `📊 <b>Daily SEO Report — ${esc(s.date || '')}</b>`,
    ``,
    `📝 <b>Content</b>`,
    `  Pages Created: ${s.pagesCreated || 0}`,
    `  Published: ${s.pagesPublished || 0}  (${esc(s.publishSuccessRate || 'N/A')})`,
    `  Indexed: ${s.pagesIndexed || 0}  (${esc(s.indexSuccessRate || 'N/A')})`,
    `  Failed: ${s.pagesFailed || 0}`,
    s.landingPagesPublished ? `  Landing Pages: ${s.landingPagesPublished}` : '',
    ``,
    `🔍 <b>SEO</b>`,
    `  Open Issues: ${s.seoIssuesOpen || 0}`,
    `  Fixed Today: ${s.seoIssuesResolvedToday || 0}`,
    s.auditPagesScanned ? `  Last Audit: ${s.auditPagesScanned} pages` : '',
    s.gscImpressions != null ? [
      ``,
      `📡 <b>Search Console (28d)</b>`,
      `  Impressions: ${s.gscImpressions}`,
      `  Clicks: ${s.gscClicks}`,
      `  Avg CTR: ${esc(s.gscAvgCtr)}%`,
      `  Avg Position: ${esc(s.gscAvgPosition)}`,
    ].join('\n') : '',
    s.analyticsSessions != null ? [
      ``,
      `📈 <b>Analytics (28d)</b>`,
      `  Sessions: ${s.analyticsSessions}`,
      `  Users: ${s.analyticsUsers}`,
      `  Organic: ${s.analyticsOrganicSessions}`,
      `  Conversions: ${s.analyticsConversions}`,
    ].join('\n') : '',
    ``,
    `🕐 ${esc(now())}`,
  ].filter(l => l !== '');

  await send(lines.join('\n'));
}

async function sendWeeklyReport(report, extras = {}) {
  const s = report.summary || {};
  const audit = extras.auditResults || {};
  const fixes = extras.fixResults || {};

  const lines = [
    `📋 <b>Weekly SEO Report</b>`,
    ``,
    `📅 <b>Period:</b> Week ending ${esc(report.period)}`,
    ``,
    `📝 <b>Content This Week</b>`,
    `  Pages Published: ${s.pages_published || 0}`,
    `  Pages Indexed: ${s.pages_indexed || 0}`,
    `  Failed: ${s.pages_failed || 0}`,
    `  Publish Rate: ${esc(s.publishSuccessRate || 'N/A')}`,
    ``,
    `🔍 <b>SEO Audit</b>`,
    `  Pages Scanned: ${audit.pagesAudited || 0}`,
    `  Issues Found: ${audit.issuesFound || 0}`,
    `  Auto-Fixed: ${fixes.fixed || 0}`,
    `  Open Issues: ${s.openIssuesTotal || 0}`,
    ``,
    `🕐 ${esc(now())}`,
  ];

  await send(lines.join('\n'));
}

// ── Health notifications ─────────────────────────────────────────────────────

async function notifyHealthAlert(service, message) {
  const msg = [
    `🚨 <b>Health Alert: ${esc(service)} is DOWN</b>`,
    ``,
    `❗ <b>Message:</b> ${esc(message)}`,
    `🕐 ${esc(now())}`,
    ``,
    `<i>Investigate immediately.</i>`,
  ].join('\n');
  await send(msg, `health_alert:${service}:${new Date().toISOString().slice(0, 16)}`);
}

async function notifyHealthRecovered(service) {
  const msg = [
    `✅ <b>Recovered: ${esc(service)} is UP</b>`,
    ``,
    `🕐 ${esc(now())}`,
  ].join('\n');
  await send(msg);
}

async function sendDailySummary(metrics) {
  const rate = (n, d) => d > 0 ? `${Math.round((n / d) * 100)}%` : 'N/A';
  const total = metrics.pages_created || 0;
  const published = metrics.pages_published || 0;
  const indexed = metrics.pages_indexed || 0;
  const failed = metrics.pages_failed || 0;

  const msg = [
    `📊 <b>Daily Summary</b>`,
    ``,
    `📅 <b>Date:</b> ${esc(metrics.date || new Date().toISOString().slice(0, 10))}`,
    ``,
    `📝 Pages Created: ${total}`,
    `✅ Published: ${published}  (${esc(rate(published, total))})`,
    `📈 Indexed: ${indexed}  (${esc(rate(indexed, published))})`,
    `❌ Failed: ${failed}`,
    `⏳ Queue: ${metrics.queue_length || 0}`,
    `🔄 Retries: ${metrics.retries_performed || 0}`,
    ``,
    `🕐 ${esc(now())}`,
  ].join('\n');

  await send(msg);
}

async function sendStartupNotification() {
  if (!config.telegram.notifyOnStart) return;
  const msg = [
    `🚀 <b>Mandy's Laundry Automation Started</b>`,
    ``,
    `⚙️ <b>Environment:</b> ${esc(config.app.env)}`,
    `🕐 <b>Time:</b> ${esc(now())}`,
    ``,
    `<i>All systems operational.</i>`,
  ].join('\n');
  await send(msg);
}

async function sendShutdownNotification(reason = 'normal') {
  const msg = [
    `🛑 <b>Automation Stopped</b>`,
    ``,
    `📋 <b>Reason:</b> ${esc(reason)}`,
    `🕐 <b>Time:</b> ${esc(now())}`,
  ].join('\n');
  await send(msg);
}

module.exports = {
  send,
  // Content
  notifyPageCreated, notifyContentGenerated, notifyPagePublished,
  notifyIndexingSubmitted, notifyPageIndexed,
  notifyPublishFailed, notifyGenerationFailed, notifyIndexingFailed,
  notifyWorkflowError, notifyRetryAttempt, notifyWorkflowCompleted,
  // Landing pages
  notifyLandingPagePublished,
  // SEO Worker
  notifySEOAuditComplete, notifySEOCriticalIssues, notifySEOIssuesFixed, notifyBrokenLinks,
  // Analytics
  notifyTrafficDrop, notifyTrafficSpike,
  // Batch / Reports
  sendBatchSummary, sendDailyReport, sendWeeklyReport,
  // Health
  notifyHealthAlert, notifyHealthRecovered,
  // System
  sendDailySummary, sendStartupNotification, sendShutdownNotification,
};
