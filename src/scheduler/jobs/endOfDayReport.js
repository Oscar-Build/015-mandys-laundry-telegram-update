'use strict';

const db = require('../../services/Database');
const logger = require('../../services/Logger');
const telegram = require('../../services/TelegramService');

const DASHBOARD_URL = 'https://oscar-build.github.io/015-telegram-notification-mandys/';

function esc(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function link(url, label) {
  return `<a href="${url}">${esc(label)}</a>`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dayLabel() {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

async function run() {
  logger.info('Running 10 PM end-of-day report');

  try {
    const todayStr = today();

    // Today's metrics from DB
    const todayMetrics = db.getDb().prepare(
      'SELECT * FROM metrics_daily WHERE date = ?'
    ).get(todayStr) || {
      date: todayStr,
      pages_created: 0,
      pages_published: 0,
      pages_indexed: 0,
    };

    // All-time totals
    const stats = db.getDashboardStats();

    const created   = todayMetrics.pages_created   || 0;
    const published = todayMetrics.pages_published || 0;
    const indexed   = todayMetrics.pages_indexed   || 0;
    const totalPages = stats.total_pages || 0;

    const lines = [
      `🌙 <b>End-of-Day Report</b>`,
      `📅 ${esc(dayLabel())}`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `📝 <b>Today's Content</b>`,
      ``,
      `  Created:    ${created}`,
      `  Published:  ${published}`,
      `  Indexed:    ${indexed}`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `📊 <b>All-Time Totals</b>`,
      ``,
      `  Total Pages: ${totalPages}`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `📊 ${link(DASHBOARD_URL, 'View Live Dashboard →')}`,
      ``,
      `<i>Mandy's Laundry SEO Automation</i>`,
    ].join('\n');

    await telegram.send(lines);
    logger.info('End-of-day report sent', { created, published, indexed });
  } catch (err) {
    logger.error('End-of-day report failed', { error: err.message });
    await telegram.send(`⚠️ <b>End-of-Day Report Failed</b>\n\n❗ ${err.message}`).catch(() => {});
    throw err;
  }
}

module.exports = { run };
