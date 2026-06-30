'use strict';

/**
 * Generates data.json for the GitHub Pages static dashboard.
 * Queries WordPress REST API and Google Search Console directly.
 * Writes the file to the repo root so GitHub Pages can serve it.
 */

require('dotenv').config();

const fs    = require('fs');
const path  = require('path');
const axios = require('axios');

const WP_API  = process.env.WORDPRESS_API_URL;
const WP_USER = process.env.WORDPRESS_USERNAME;
const WP_PASS = process.env.WORDPRESS_APP_PASSWORD;
const WP_AUTH = WP_USER && WP_PASS
  ? 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64')
  : null;

const OUT = path.resolve(__dirname, '..', 'data.json');

function wpHeaders() {
  return WP_AUTH ? { Authorization: WP_AUTH } : {};
}

async function fetchWPPosts() {
  if (!WP_API) return [];
  try {
    const res = await axios.get(`${WP_API}/posts`, {
      params: { status: 'publish', per_page: 100, _fields: 'id,title,slug,link,date,modified', orderby: 'date', order: 'desc' },
      headers: wpHeaders(),
      timeout: 20000,
    });
    return (res.data || []).map(p => ({
      id:           String(p.id),
      title:        p.title?.rendered || p.title || '—',
      slug:         p.slug || '',
      status:       'indexed',
      url:          p.link || '',
      published_at: p.date || null,
      indexed_at:   p.modified || p.date || null,
      created_at:   p.date || null,
    }));
  } catch (err) {
    console.warn('WP posts fetch failed:', err.message);
    return [];
  }
}

async function fetchWPPages() {
  if (!WP_API) return [];
  try {
    const res = await axios.get(`${WP_API}/pages`, {
      params: { status: 'publish', per_page: 100, _fields: 'id,title,slug,link,date,modified', orderby: 'date', order: 'desc' },
      headers: wpHeaders(),
      timeout: 20000,
    });
    return (res.data || []).map(p => {
      const title = p.title?.rendered || p.title || '';
      const { city, state, serviceType } = parsePageMeta(title, p.slug || '');
      return {
        id:           String(p.id),
        city, state,
        service_type: serviceType,
        title,
        slug:         p.slug || '',
        status:       'indexed',
        url:          p.link || '',
        seo_score:    null,
        published_at: p.date || null,
        indexed_at:   p.modified || p.date || null,
        created_at:   p.date || null,
      };
    });
  } catch (err) {
    console.warn('WP pages fetch failed:', err.message);
    return [];
  }
}

function parsePageMeta(title, slug) {
  // Try "Service in City, ST" or "Service - City, ST"
  const m = title.match(/\bin\s+([^,]+),\s*([A-Z]{2})\b/i)
         || title.match(/[-–]\s*([^,]+),\s*([A-Z]{2})\b/i);
  if (m) {
    return { city: m[1].trim(), state: m[2].toUpperCase(), serviceType: title.split(/\bin\b|-/i)[0].trim() };
  }
  // Fall back to slug parsing: last-word might be state abbreviation
  const parts = slug.split('-');
  if (parts.length >= 2) {
    const maybeState = parts[parts.length - 1].toUpperCase();
    if (/^[A-Z]{2}$/.test(maybeState)) {
      const city = parts.slice(-3, -1).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      const serviceType = parts.slice(0, -3).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      return { city, state: maybeState, serviceType };
    }
  }
  return { city: title, state: '', serviceType: 'Laundry Service' };
}

async function fetchGSC() {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const siteUrl      = process.env.SITE_URL || process.env.WORDPRESS_SITE_URL;
  if (!clientId || !refreshToken || !siteUrl) return null;

  try {
    const { google } = require('googleapis');
    const auth = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
    auth.setCredentials({ refresh_token: refreshToken });
    const sc  = google.searchconsole({ version: 'v1', auth });
    const end   = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);

    const [summary, trend] = await Promise.all([
      sc.searchanalytics.query({
        siteUrl,
        requestBody: { startDate: start, endDate: end, dimensions: ['query'], rowLimit: 100 },
      }),
      sc.searchanalytics.query({
        siteUrl,
        requestBody: { startDate: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10), endDate: end, dimensions: ['date'], rowLimit: 14 },
      }),
    ]);

    const rows = summary.data.rows || [];
    const totals = rows.reduce((s, r) => ({ imp: s.imp + r.impressions, clk: s.clk + r.clicks, pos: s.pos + r.position }), { imp: 0, clk: 0, pos: 0 });
    const avgPos = rows.length > 0 ? (totals.pos / rows.length).toFixed(1) : null;
    const avgCtr = totals.imp > 0 ? ((totals.clk / totals.imp) * 100).toFixed(1) : '0.0';

    const gscTrend = (trend.data.rows || []).map(r => ({
      date:        r.keys[0],
      impressions: Math.round(r.impressions),
      clicks:      Math.round(r.clicks),
    })).sort((a, b) => b.date.localeCompare(a.date));

    return {
      summary: {
        impressions: Math.round(totals.imp),
        clicks:      Math.round(totals.clk),
        avg_ctr:     avgCtr,
        avg_position: avgPos,
        date_range:  '28 days',
        synced_at:   new Date().toISOString(),
      },
      trend: gscTrend,
    };
  } catch (err) {
    console.warn('GSC fetch failed:', err.message);
    return null;
  }
}

async function main() {
  console.log('Generating data.json for GitHub Pages dashboard...');

  const [posts, pages, gscResult] = await Promise.all([
    fetchWPPosts(),
    fetchWPPages(),
    fetchGSC(),
  ]);

  const gsc = gscResult?.summary || null;

  const data = {
    generated_at: new Date().toISOString(),
    dashboard: {
      overview: {
        total_pages:            posts.length,
        pages_published_today:  0,
        pages_indexed_today:    0,
        failed_jobs:            0,
        queue_length:           0,
        seo_issues_open:        0,
        landing_pages_total:    pages.length,
        landing_pages_published: pages.length,
      },
      gsc: gsc ? {
        impressions:  gsc.impressions,
        clicks:       gsc.clicks,
        avg_ctr:      gsc.avg_ctr,
        avg_position: gsc.avg_position,
        date_range:   '28 days',
        synced_at:    gsc.synced_at,
      } : {},
      analytics: {},
      audit: {},
      workers: { content: 'running', seo: 'running', analytics: 'running', monitoring: 'running', queue: 'running' },
      scheduler: null,
    },
    trend:        [],
    seo_issues:   [],
    reports:      [],
    gsc_trend:    gscResult?.trend || [],
    pages:        posts,
    landing_pages: pages,
  };

  fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
  console.log(`Written: ${OUT}`);
  console.log(`  Blog posts:    ${posts.length}`);
  console.log(`  Landing pages: ${pages.length}`);
  if (gsc) {
    console.log(`  GSC impressions: ${gsc.impressions}  clicks: ${gsc.clicks}  CTR: ${gsc.avg_ctr}%`);
  } else {
    console.log('  GSC: not connected');
  }
}

main().catch(err => {
  console.error('generate-dashboard-data failed:', err.message);
  process.exit(1);
});
