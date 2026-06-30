'use strict';

const db = require('../../services/Database');
const logger = require('../../services/Logger');
const telegram = require('../../services/TelegramService');
const git = require('../../services/GitService');

function fmt(n) {
  if (n == null) return '—';
  const num = Number(n);
  if (isNaN(num)) return String(n);
  return num >= 1000 ? (num / 1000).toFixed(1) + 'k' : String(num);
}

function pct(n, d) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : 'N/A';
}

function dayLabel(dateStr) {
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch { return dateStr; }
}

async function run() {
  logger.info('Running 6 AM daily morning briefing');

  try {
    // Yesterday's content metrics
    const yd = new Date();
    yd.setDate(yd.getDate() - 1);
    const yesterday = yd.toISOString().slice(0, 10);

    const ydMetrics = db.getDb().prepare('SELECT * FROM metrics_daily WHERE date = ?').get(yesterday)
      || { date: yesterday, pages_created: 0, pages_published: 0, pages_indexed: 0, pages_failed: 0, retries_performed: 0, errors_encountered: 0 };

    // Overall site stats
    const stats   = db.getDashboardStats();
    const gsc     = db.getLatestGSCSummary();
    const an      = db.getLatestAnalyticsSummary();
    const landing = db.getLandingPageStats();

    // Build status emoji
    const hasErrors  = ydMetrics.errors_encountered > 0;
    const seoIssues  = stats.seo_issues_open || 0;
    const allGood    = !hasErrors && seoIssues === 0;
    const statusLine = allGood
      ? '✅ All systems healthy'
      : [hasErrors ? `⚠️ ${ydMetrics.errors_encountered} error(s) yesterday` : '', seoIssues > 0 ? `⚠️ ${seoIssues} open SEO issues` : ''].filter(Boolean).join(' · ');

    const lines = [
      `☀️ <b>Good Morning — Mandy's Laundry SEO</b>`,
      `📅 <b>${dayLabel(yesterday)}</b>`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `📝 <b>Yesterday's Content</b>`,
      `  Published:  ${ydMetrics.pages_published || 0} blog posts  (${pct(ydMetrics.pages_published, ydMetrics.pages_created)})`,
      `  Indexed:    ${ydMetrics.pages_indexed || 0} by Google  (${pct(ydMetrics.pages_indexed, ydMetrics.pages_published)})`,
      ydMetrics.pages_failed > 0 ? `  ❌ Failed: ${ydMetrics.pages_failed}` : `  ✅ No failures`,
      `  Total Posts: ${stats.total_pages || 0}   Landing Pages: ${landing.published || 0} live`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `🔍 <b>SEO Health</b>`,
      `  Open Issues: ${seoIssues === 0 ? '0 ✅' : seoIssues + ' ⚠️'}`,
      stats.latest_audit ? `  Last Audit:  ${stats.latest_audit.pages_audited} pages scanned` : '',
      ``,
      gsc && gsc.impressions ? [
        `━━━━━━━━━━━━━━━━━━`,
        `📡 <b>Search Console (28d)</b>`,
        `  Impressions: ${fmt(gsc.impressions)}`,
        `  Clicks:      ${fmt(gsc.clicks)}`,
        `  Avg CTR:     ${gsc.avg_ctr || '—'}%`,
        `  Avg Position: #${gsc.avg_position || '—'}`,
        ``,
      ].join('\n') : '',
      an && an.sessions ? [
        `━━━━━━━━━━━━━━━━━━`,
        `📈 <b>Analytics (28d)</b>`,
        `  Sessions:  ${fmt(an.sessions)}`,
        `  Organic:   ${fmt(an.organic_sessions)}`,
        an.conversions ? `  Leads:     ${an.conversions}` : '',
        ``,
      ].filter(Boolean).join('\n') : '',
      `━━━━━━━━━━━━━━━━━━`,
      statusLine,
      ``,
      `🤖 <i>Automated report — Mandy's SEO Platform</i>`,
    ].filter(l => l !== '').join('\n');

    await telegram.send(lines);
    await git.autoCommitDailySummary(ydMetrics).catch(() => {});

    logger.info('Morning briefing sent', { date: yesterday, published: ydMetrics.pages_published });
    return ydMetrics;
  } catch (err) {
    logger.error('Daily summary job failed', { error: err.message });
    await telegram.send(`<b>⚠️ Morning Briefing Failed</b>\n\n❗ Error: ${err.message}`).catch(() => {});
    throw err;
  }
}

module.exports = { run };
