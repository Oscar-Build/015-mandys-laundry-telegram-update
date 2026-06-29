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

function fmt(ts, website, project, title, url, status, duration, error) {
  const lines = [
    `${status}`,
    ``,
    `📋 *Website:* ${esc(website)}`,
    `📁 *Project:* ${esc(project)}`,
    `📄 *Title:* ${esc(title)}`,
  ];
  if (url) lines.push(`🔗 *URL:* ${url}`);
  if (duration !== undefined && duration !== null) lines.push(`⏱ *Duration:* ${(duration / 1000).toFixed(2)}s`);
  if (error) lines.push(`❗ *Error:* ${esc(String(error).slice(0, 300))}`);
  lines.push(`🕐 *Time:* ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`);
  return lines.join('\n');
}

function esc(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
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
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    });
    if (dedupKey) db.markNotificationSent('generic', null, dedupKey);
    return true;
  } catch (err) {
    logger.error('Failed to send Telegram message', { error: err.message });
    // Fallback: send as plain text
    try {
      await b.sendMessage(config.telegram.chatId, message.replace(/[_*[\]()~`>#+=|{}.!-]/g, ''), {});
    } catch (e2) {
      logger.error('Telegram fallback also failed', { error: e2.message });
    }
    return false;
  }
}

// --- Public notification methods ---

async function notifyPageCreated(page) {
  const dedupKey = `created:${page.id}`;
  const msg = fmt(
    '🚀 *Content Page Created*',
    page.website, page.project, page.title, null, null, null, null
  );
  await send(msg, dedupKey);
  db.incrementMetric('pages_created');
}

async function notifyContentGenerated(page) {
  const msg = fmt(
    '✅ *Content Generation Completed*',
    page.website, page.project, page.title, null, null, page.duration_ms, null
  );
  await send(msg, `content_generated:${page.id}`);
}

async function notifyPagePublished(page) {
  const msg = fmt(
    '✅ *Page Published Successfully*',
    page.website, page.project, page.title, page.url, null, page.duration_ms, null
  );
  await send(msg, `published:${page.id}`);
  db.incrementMetric('pages_published');
}

async function notifyIndexingSubmitted(page) {
  const msg = fmt(
    '📈 *Indexing Request Submitted*',
    page.website, page.project, page.title, page.url, null, null, null
  );
  await send(msg, `index_submitted:${page.id}`);
}

async function notifyPageIndexed(page) {
  const msg = fmt(
    '📈 *Page Successfully Indexed*',
    page.website, page.project, page.title, page.url, null, page.duration_ms, null
  );
  await send(msg, `indexed:${page.id}`);
  db.incrementMetric('pages_indexed');
}

async function notifyPublishFailed(page, error) {
  const msg = fmt(
    '❌ *Page Failed to Publish*',
    page.website, page.project, page.title, page.url, null, null, error
  );
  await send(msg);
  db.incrementMetric('pages_failed');
  db.incrementMetric('errors_encountered');
}

async function notifyGenerationFailed(page, error) {
  const msg = fmt(
    '❌ *Content Generation Failed*',
    page.website, page.project, page.title, null, null, null, error
  );
  await send(msg);
  db.incrementMetric('errors_encountered');
}

async function notifyIndexingFailed(page, error) {
  const msg = fmt(
    '❌ *Indexing Failed*',
    page.website, page.project, page.title, page.url, null, null, error
  );
  await send(msg);
  db.incrementMetric('errors_encountered');
}

async function notifyWorkflowError(context, error) {
  const msg = [
    `⚠️ *Workflow Error*`,
    ``,
    `📋 *Website:* ${esc(context.website || "Mandy's Laundry")}`,
    `📁 *Project:* ${esc(context.project || 'unknown')}`,
    `❗ *Error:* ${esc(String(error).slice(0, 400))}`,
    `🕐 *Time:* ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`,
  ].join('\n');
  await send(msg);
  db.incrementMetric('errors_encountered');
}

async function notifyRetryAttempt(page, attempt, maxAttempts, reason) {
  const msg = [
    `⚠️ *Retry Attempt ${attempt}/${maxAttempts}*`,
    ``,
    `📋 *Website:* ${esc(page.website)}`,
    `📄 *Title:* ${esc(page.title)}`,
    `🔄 *Reason:* ${esc(reason)}`,
    `🕐 *Time:* ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`,
  ].join('\n');
  await send(msg);
  db.incrementMetric('retries_performed');
}

async function notifyWorkflowCompleted(page) {
  const msg = fmt(
    '✅ *Workflow Completed Successfully*',
    page.website, page.project, page.title, page.url, null, page.duration_ms, null
  );
  await send(msg, `workflow_completed:${page.id}`);
}

async function notifyHealthAlert(service, message) {
  const msg = [
    `🚨 *Health Alert: ${esc(service)} is DOWN*`,
    ``,
    `❗ *Message:* ${esc(message)}`,
    `🕐 *Time:* ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`,
    ``,
    `_Please investigate immediately\\._`,
  ].join('\n');
  await send(msg, `health_alert:${service}:${new Date().toISOString().slice(0, 16)}`);
}

async function notifyHealthRecovered(service) {
  const msg = [
    `✅ *Health Recovered: ${esc(service)} is UP*`,
    ``,
    `🕐 *Time:* ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`,
  ].join('\n');
  await send(msg);
}

async function sendDailySummary(metrics) {
  const rate = (n, d) => d > 0 ? `${Math.round((n / d) * 100)}%` : 'N/A';
  const total = metrics.pages_created || 0;
  const published = metrics.pages_published || 0;
  const indexed = metrics.pages_indexed || 0;
  const failed = metrics.pages_failed || 0;
  const pending = metrics.queue_length || 0;

  const msg = [
    `📊 *Mandy's Laundry Daily Report*`,
    ``,
    `📅 *Date:* ${metrics.date || new Date().toISOString().slice(0, 10)}`,
    ``,
    `📝 *Pages Created:* ${total}`,
    `✅ *Pages Published:* ${published}`,
    `📈 *Pages Indexed:* ${indexed}`,
    `❌ *Failed:* ${failed}`,
    `⏳ *Pending:* ${pending}`,
    `🔄 *Retries:* ${metrics.retries_performed || 0}`,
    ``,
    `📊 *Publishing Success Rate:* ${rate(published, total)}`,
    `📊 *Indexing Success Rate:* ${rate(indexed, published)}`,
    ``,
    metrics.avg_publish_ms ? `⏱ *Avg Publish Time:* ${(metrics.avg_publish_ms / 1000).toFixed(2)}s` : '',
    metrics.avg_index_ms ? `⏱ *Avg Index Time:* ${(metrics.avg_index_ms / 1000).toFixed(2)}s` : '',
    ``,
    `🕐 *Reported:* ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`,
  ].filter(l => l !== '').join('\n');

  await send(msg);
}

async function sendStartupNotification() {
  if (!config.telegram.notifyOnStart) return;
  const msg = [
    `🚀 *Mandy's Laundry Automation Started*`,
    ``,
    `⚙️ *Environment:* ${esc(config.app.env)}`,
    `🕐 *Time:* ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`,
    ``,
    `_All systems operational\\._`,
  ].join('\n');
  await send(msg);
}

async function sendShutdownNotification(reason = 'normal') {
  const msg = [
    `🛑 *Mandy's Laundry Automation Stopped*`,
    ``,
    `📋 *Reason:* ${esc(reason)}`,
    `🕐 *Time:* ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`,
  ].join('\n');
  await send(msg);
}

module.exports = {
  send,
  notifyPageCreated,
  notifyContentGenerated,
  notifyPagePublished,
  notifyIndexingSubmitted,
  notifyPageIndexed,
  notifyPublishFailed,
  notifyGenerationFailed,
  notifyIndexingFailed,
  notifyWorkflowError,
  notifyRetryAttempt,
  notifyWorkflowCompleted,
  notifyHealthAlert,
  notifyHealthRecovered,
  sendDailySummary,
  sendStartupNotification,
  sendShutdownNotification,
};
