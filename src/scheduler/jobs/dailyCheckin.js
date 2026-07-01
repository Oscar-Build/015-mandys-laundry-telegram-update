'use strict';

const db = require('../../services/Database');
const logger = require('../../services/Logger');
const telegram = require('../../services/TelegramService');

const DASHBOARD_URL = 'https://mandyslaundry.com/seo-dashboard/';

function esc(t) { return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function link(url, label) { return `<a href="${url}">${esc(label)}</a>`; }

async function run() {
  logger.info('Running daily check-in summary');

  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const weekAgo  = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const metrics = db.getDb().prepare('SELECT * FROM metrics_daily WHERE date = ?').get(todayStr)
      || { pages_created: 0, pages_published: 0, pages_indexed: 0, pages_failed: 0, errors_encountered: 0 };

    const stats   = db.getDashboardStats();
    const gsc     = db.getLatestGSCSummary();

    // Smoke signals — any failures or open SEO issues
    const smokeSignals = [];
    if (metrics.pages_failed > 0)      smokeSignals.push(`❌ ${metrics.pages_failed} post(s) failed to publish`);
    if (metrics.errors_encountered > 0) smokeSignals.push(`⚠️ ${metrics.errors_encountered} error(s) logged today`);
    if (stats.seo_issues_open > 0)     smokeSignals.push(`⚠️ ${stats.seo_issues_open} open SEO issues`);
    if (!gsc?.impressions)             smokeSignals.push(`📡 Search Console data not connected`);

    const smokeSection = smokeSignals.length
      ? smokeSignals.join('\n  ')
      : '✅ No smoke signals — all clear';

    const lines = [
      `📋 <b>Daily Check-In — Mandy's Laundry</b>`,
      `📅 ${esc(new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric' }))}`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `1️⃣ <b>Completed Today</b>`,
      `  📝 Created:   ${metrics.pages_created}`,
      `  ✅ Published: ${metrics.pages_published}`,
      `  📈 Indexed:   ${metrics.pages_indexed}`,
      `  📊 Total site pages: ${stats.total_pages || 0}`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `2️⃣ <b>Currently Running</b>`,
      `  🤖 Content generation (3 posts + 2 landing pages/day)`,
      `  🎬 Video script generation (daily at 9 AM)`,
      `  📊 Dashboard data refresh (daily at 6:10 AM)`,
      `  🔄 Auto-push to GitHub (every 60 min)`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `3️⃣ <b>Smoke Signals</b>`,
      `  ${smokeSection}`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `4️⃣ <b>Planned Next</b>`,
      `  🌅 6:00 AM — Blog posts generation`,
      `  🗺️ 6:30 AM — Landing pages generation`,
      `  🎬 9:00 AM — Video script`,
      `  🌙 10:00 PM — End-of-day report`,
      ``,
      `📊 ${link(DASHBOARD_URL, 'View Live Dashboard →')}`,
      ``,
      `<i>Mandy's Laundry SEO Automation · Daily Check-In</i>`,
    ].join('\n');

    await telegram.send(lines);
    logger.info('Daily check-in sent');
  } catch (err) {
    logger.error('Daily check-in failed', { error: err.message });
    throw err;
  }
}

module.exports = { run };
