'use strict';

/**
 * Standalone morning report — no persistent database needed.
 * Queries WordPress + Google Search Console directly and sends to Telegram.
 * Designed for GitHub Actions or any environment without local SQLite.
 */

require('dotenv').config();

const axios  = require('axios');
const config = require('../src/config');

const BOT_TOKEN = config.telegram.botToken;
const CHAT_ID   = config.telegram.chatId;
const WP_API    = config.wordpress.apiUrl;
const WP_AUTH   = config.wordpress.username && config.wordpress.appPassword
  ? 'Basic ' + Buffer.from(`${config.wordpress.username}:${config.wordpress.appPassword}`).toString('base64')
  : null;

function fmt(n) {
  if (n == null) return '—';
  const num = Number(n);
  return isNaN(num) ? String(n) : num >= 1000 ? (num / 1000).toFixed(1) + 'k' : String(num);
}

function esc(t) {
  return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function dayLabel() {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

async function getWPStats() {
  if (!WP_API || !WP_AUTH) return null;
  try {
    const headers = { Authorization: WP_AUTH };
    const [ totalRes, recentRes ] = await Promise.all([
      axios.get(`${WP_API}/posts?status=publish&per_page=1&_fields=id`, { headers, timeout: 10000 }),
      axios.get(`${WP_API}/posts?status=publish&per_page=5&after=${new Date(Date.now() - 86400000).toISOString()}&_fields=id,title,link`, { headers, timeout: 10000 }),
    ]);
    const total  = parseInt(totalRes.headers['x-wp-total'] || '0', 10);
    const recent = recentRes.data || [];
    return { total, recent };
  } catch (err) {
    return { error: err.message };
  }
}

async function getGSCStats() {
  if (!config.google.clientId || !config.google.refreshToken) return null;
  try {
    const { google } = require('googleapis');
    const auth = new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
    auth.setCredentials({ refresh_token: config.google.refreshToken });
    const sc  = google.searchconsole({ version: 'v1', auth });
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
    const res = await sc.searchanalytics.query({
      siteUrl: config.google.siteUrl,
      requestBody: { startDate: start, endDate: end, dimensions: ['query'], rowLimit: 1 },
    });
    const row   = res.data.rows?.[0];
    const total = res.data.rows?.reduce((s, r) => ({ imp: s.imp + r.impressions, clk: s.clk + r.clicks }), { imp: 0, clk: 0 });
    return total ? {
      impressions: total.imp,
      clicks: total.clk,
      ctr: total.imp > 0 ? ((total.clk / total.imp) * 100).toFixed(1) : '0',
    } : null;
  } catch {
    return null;
  }
}

async function sendTelegram(message) {
  if (!BOT_TOKEN || !CHAT_ID) { console.error('Telegram not configured'); process.exit(1); }
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }, { timeout: 15000 });
}

async function main() {
  console.log('Fetching stats...');
  const [ wp, gsc ] = await Promise.allSettled([ getWPStats(), getGSCStats() ]);

  const wpData  = wp.status  === 'fulfilled' ? wp.value  : null;
  const gscData = gsc.status === 'fulfilled' ? gsc.value : null;

  const newPosts   = wpData?.recent?.length || 0;
  const totalPosts = wpData?.total || 0;
  const hasErrors  = !!wpData?.error;

  const statusLine = hasErrors
    ? `⚠️ WordPress connection issue`
    : newPosts > 0
      ? `✅ ${newPosts} new post${newPosts > 1 ? 's' : ''} published in the last 24 hours`
      : `✅ All systems running`;

  const lines = [
    `☀️ <b>Good Morning — Mandy's Laundry SEO</b>`,
    `📅 <b>${dayLabel()}</b>`,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `📝 <b>Content Status</b>`,
    `  Total Blog Posts:  ${fmt(totalPosts)}`,
    newPosts > 0 ? `  Published (24h):   ${newPosts} new ✅` : `  Published (24h):   0 (scheduled at 6 AM)`,
    wpData?.recent?.length
      ? `\n  Latest:\n` + wpData.recent.slice(0, 3).map(p => `  • ${esc(p.title?.rendered || p.title || '—').slice(0, 60)}`).join('\n')
      : '',
    ``,
    gscData ? [
      `━━━━━━━━━━━━━━━━━━`,
      `📡 <b>Search Console (28d)</b>`,
      `  Impressions: ${fmt(gscData.impressions)}`,
      `  Clicks:      ${fmt(gscData.clicks)}`,
      `  Avg CTR:     ${gscData.ctr}%`,
      ``,
    ].join('\n') : '',
    `━━━━━━━━━━━━━━━━━━`,
    statusLine,
    ``,
    `🤖 <i>Automated by Mandy's SEO Platform</i>`,
  ].filter(l => l !== '').join('\n');

  await sendTelegram(lines);
  console.log('Morning report sent to Telegram.');
}

main().catch(err => {
  console.error('Morning report failed:', err.message);
  process.exit(1);
});
