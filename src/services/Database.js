'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const logger = require('./Logger');

let db;

function getDb() {
  if (db) return db;

  const dbPath = path.resolve(process.cwd(), config.db.path);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  initSchema(db);
  logger.info('Database initialized', { path: dbPath });
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      website TEXT NOT NULL DEFAULT 'Mandy''s Laundry',
      project TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      slug TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      content_generated_at TEXT,
      published_at TEXT,
      indexed_at TEXT,
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      page_id TEXT REFERENCES pages(id),
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      next_run_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS metrics_daily (
      date TEXT PRIMARY KEY,
      pages_created INTEGER NOT NULL DEFAULT 0,
      pages_published INTEGER NOT NULL DEFAULT 0,
      pages_indexed INTEGER NOT NULL DEFAULT 0,
      pages_failed INTEGER NOT NULL DEFAULT 0,
      retries_performed INTEGER NOT NULL DEFAULT 0,
      errors_encountered INTEGER NOT NULL DEFAULT 0,
      avg_publish_ms REAL,
      avg_index_ms REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS health_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      checked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      page_id TEXT,
      dedup_key TEXT UNIQUE,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS landing_pages (
      id TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      keyword TEXT NOT NULL,
      service_type TEXT NOT NULL,
      title TEXT,
      slug TEXT,
      meta_description TEXT,
      content TEXT,
      schema_json TEXT,
      faq_json TEXT,
      internal_links_json TEXT,
      seo_score INTEGER,
      wp_post_id INTEGER,
      url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      published_at TEXT,
      indexed_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seo_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      url TEXT,
      severity TEXT NOT NULL DEFAULT 'medium',
      description TEXT,
      fix_suggestion TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      fix_applied TEXT,
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS gsc_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      page TEXT,
      query TEXT,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      ctr REAL DEFAULT 0,
      position REAL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gsc_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      avg_ctr TEXT,
      avg_position TEXT,
      date_range TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analytics_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessions INTEGER DEFAULT 0,
      users INTEGER DEFAULT 0,
      new_users INTEGER DEFAULT 0,
      organic_sessions INTEGER DEFAULT 0,
      organic_users INTEGER DEFAULT 0,
      bounce_rate TEXT,
      avg_session_duration TEXT,
      conversions INTEGER DEFAULT 0,
      date_range TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      period TEXT NOT NULL,
      title TEXT,
      summary_json TEXT,
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      pages_audited INTEGER DEFAULT 0,
      issues_found INTEGER DEFAULT 0,
      issues_fixed INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running'
    );

    CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_next_run ON jobs(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_health_checks_service ON health_checks(service, checked_at);
    CREATE INDEX IF NOT EXISTS idx_seo_issues_status ON seo_issues(status);
    CREATE INDEX IF NOT EXISTS idx_gsc_metrics_date ON gsc_metrics(date);
    CREATE INDEX IF NOT EXISTS idx_landing_pages_status ON landing_pages(status);
  `);

  // Migrations for existing databases
  try { db.exec('ALTER TABLE pages ADD COLUMN generated_data TEXT'); } catch (_) {}
}

// --- Pages ---

function createPage(data) {
  getDb().prepare(`
    INSERT INTO pages (id, website, project, title, slug, status)
    VALUES (@id, @website, @project, @title, @slug, 'content_generating')
  `).run(data);
}

function updatePage(id, fields) {
  const keys = Object.keys(fields);
  const setClause = keys.map(k => `${k} = @${k}`).join(', ');
  getDb().prepare(`UPDATE pages SET ${setClause}, updated_at = datetime('now') WHERE id = @id`)
    .run({ ...fields, id });
}

function getPage(id) {
  return getDb().prepare('SELECT * FROM pages WHERE id = ?').get(id);
}

function getPendingPages(limit = 10) {
  return getDb().prepare(`
    SELECT * FROM pages WHERE status IN ('pending','publish_failed','index_failed')
    ORDER BY created_at ASC LIMIT ?
  `).all(limit);
}

function getRecentPublishedPages(limit = 20) {
  return getDb().prepare(`
    SELECT * FROM pages WHERE status IN ('published','indexed') AND url IS NOT NULL
    ORDER BY published_at DESC LIMIT ?
  `).all(limit);
}

// --- Landing Pages ---

function createLandingPage(data) {
  getDb().prepare(`
    INSERT INTO landing_pages (id, city, state, keyword, service_type, status)
    VALUES (@id, @city, @state, @keyword, @serviceType, 'generating')
  `).run(data);
}

function updateLandingPage(id, fields) {
  const keys = Object.keys(fields);
  const setClause = keys.map(k => `${k} = @${k}`).join(', ');
  getDb().prepare(`UPDATE landing_pages SET ${setClause}, updated_at = datetime('now') WHERE id = @id`)
    .run({ ...fields, id });
}

function getPublishedLandingPageSlugs() {
  const rows = getDb().prepare(
    "SELECT slug FROM landing_pages WHERE status IN ('published','indexed','skipped_duplicate') AND slug IS NOT NULL"
  ).all();
  return rows.map(r => r.slug);
}

function getLandingPageStats() {
  const d = getDb();
  return {
    total: d.prepare('SELECT COUNT(*) as n FROM landing_pages').get().n,
    published: d.prepare("SELECT COUNT(*) as n FROM landing_pages WHERE status IN ('published','indexed')").get().n,
    pending: d.prepare("SELECT COUNT(*) as n FROM landing_pages WHERE status = 'pending'").get().n,
  };
}

// --- Jobs ---

function enqueueJob(job) {
  getDb().prepare(`
    INSERT OR IGNORE INTO jobs (id, page_id, type, status, payload, next_run_at)
    VALUES (@id, @page_id, @type, 'pending', @payload, @next_run_at)
  `).run({
    ...job,
    payload: typeof job.payload === 'object' ? JSON.stringify(job.payload) : job.payload,
    next_run_at: job.next_run_at || new Date().toISOString(),
  });
}

function getDueJobs(limit = 5) {
  return getDb().prepare(`
    SELECT * FROM jobs
    WHERE status = 'pending' AND next_run_at <= datetime('now')
    ORDER BY next_run_at ASC LIMIT ?
  `).all(limit);
}

function updateJob(id, fields) {
  const keys = Object.keys(fields);
  const setClause = keys.map(k => `${k} = @${k}`).join(', ');
  getDb().prepare(`UPDATE jobs SET ${setClause} WHERE id = @id`).run({ ...fields, id });
}

// --- Metrics ---

function getTodayMetrics() {
  const today = new Date().toISOString().slice(0, 10);
  return getDb().prepare('SELECT * FROM metrics_daily WHERE date = ?').get(today)
    || { date: today, pages_created: 0, pages_published: 0, pages_indexed: 0, pages_failed: 0, retries_performed: 0, errors_encountered: 0, avg_publish_ms: null, avg_index_ms: null };
}

function incrementMetric(field, amount = 1) {
  const today = new Date().toISOString().slice(0, 10);
  getDb().prepare(`
    INSERT INTO metrics_daily (date, ${field})
    VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET
      ${field} = ${field} + excluded.${field},
      updated_at = datetime('now')
  `).run(today, amount);
}

function updateAvgMetric(field, newValueMs) {
  const today = new Date().toISOString().slice(0, 10);
  const row = getDb().prepare('SELECT * FROM metrics_daily WHERE date = ?').get(today);
  if (!row || !row[field]) {
    getDb().prepare(`INSERT INTO metrics_daily (date, ${field}) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET ${field} = excluded.${field}, updated_at = datetime('now')`).run(today, newValueMs);
  } else {
    const avg = (row[field] + newValueMs) / 2;
    getDb().prepare(`UPDATE metrics_daily SET ${field} = ?, updated_at = datetime('now') WHERE date = ?`).run(avg, today);
  }
}

function getMetricsRange(days = 7) {
  return getDb().prepare(`
    SELECT * FROM metrics_daily
    WHERE date >= date('now', ? || ' days')
    ORDER BY date DESC
  `).all(`-${days}`);
}

// --- SEO Issues ---

function createSEOIssue(data) {
  getDb().prepare(`
    INSERT INTO seo_issues (type, url, severity, description, fix_suggestion)
    VALUES (@type, @url, @severity, @description, @fix_suggestion)
  `).run({
    type: data.type,
    url: data.url || null,
    severity: data.severity || 'medium',
    description: data.description || null,
    fix_suggestion: data.fix_suggestion || null,
  });
}

function getOpenSEOIssues({ limit = 20 } = {}) {
  return getDb().prepare(
    "SELECT * FROM seo_issues WHERE status = 'open' ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, detected_at DESC LIMIT ?"
  ).all(limit);
}

function resolveSEOIssue(id, fixApplied) {
  getDb().prepare(`
    UPDATE seo_issues SET status = 'resolved', fix_applied = ?, resolved_at = datetime('now') WHERE id = ?
  `).run(fixApplied || 'Auto-fixed', id);
}

function countSEOIssues(status = 'open') {
  return getDb().prepare('SELECT COUNT(*) as n FROM seo_issues WHERE status = ?').get(status)?.n || 0;
}

function countSEOIssuesResolvedToday() {
  return getDb().prepare(
    "SELECT COUNT(*) as n FROM seo_issues WHERE status = 'resolved' AND DATE(resolved_at) = DATE('now')"
  ).get()?.n || 0;
}

function getSEOIssuesSummary() {
  const rows = getDb().prepare(
    "SELECT type, severity, COUNT(*) as count FROM seo_issues WHERE status = 'open' GROUP BY type, severity ORDER BY count DESC"
  ).all();
  return rows;
}

function getRecentSEOIssues(limit = 20) {
  return getDb().prepare(
    "SELECT * FROM seo_issues ORDER BY detected_at DESC LIMIT ?"
  ).all(limit);
}

// --- GSC Metrics ---

function saveGSCMetric(data) {
  getDb().prepare(`
    INSERT INTO gsc_metrics (date, page, query, impressions, clicks, ctr, position)
    VALUES (@date, @page, @query, @impressions, @clicks, @ctr, @position)
  `).run({
    date: data.date,
    page: data.page || null,
    query: data.query || null,
    impressions: data.impressions || 0,
    clicks: data.clicks || 0,
    ctr: data.ctr || 0,
    position: data.position || 0,
  });
}

function saveGSCSummary(summary) {
  getDb().prepare(`
    INSERT INTO gsc_summary (impressions, clicks, avg_ctr, avg_position, date_range)
    VALUES (@impressions, @clicks, @avgCtr, @avgPosition, @dateRange)
  `).run({
    impressions: summary.impressions || 0,
    clicks: summary.clicks || 0,
    avgCtr: String(summary.avgCtr || '0'),
    avgPosition: String(summary.avgPosition || '0'),
    dateRange: summary.dateRange || '28 days',
  });
}

function getLatestGSCSummary() {
  return getDb().prepare('SELECT * FROM gsc_summary ORDER BY synced_at DESC LIMIT 1').get() || null;
}

function getGSCTrend(days = 7) {
  return getDb().prepare(`
    SELECT date, SUM(impressions) as impressions, SUM(clicks) as clicks
    FROM gsc_metrics WHERE date >= date('now', ? || ' days')
    GROUP BY date ORDER BY date DESC
  `).all(`-${days}`);
}

// --- Analytics ---

function saveAnalyticsSummary(data) {
  getDb().prepare(`
    INSERT INTO analytics_summary (sessions, users, new_users, organic_sessions, organic_users, bounce_rate, avg_session_duration, conversions, date_range)
    VALUES (@sessions, @users, @newUsers, @organicSessions, @organicUsers, @bounceRate, @avgSessionDuration, @conversions, @dateRange)
  `).run({
    sessions: data.sessions || 0,
    users: data.users || 0,
    newUsers: data.newUsers || 0,
    organicSessions: data.organicSessions || 0,
    organicUsers: data.organicUsers || 0,
    bounceRate: String(data.bounceRate || '0'),
    avgSessionDuration: String(data.avgSessionDuration || '0'),
    conversions: data.conversions || 0,
    dateRange: data.dateRange || '28 days',
  });
}

function getLatestAnalyticsSummary() {
  return getDb().prepare('SELECT * FROM analytics_summary ORDER BY synced_at DESC LIMIT 1').get() || null;
}

function getAnalyticsTrend(days = 7) {
  return getDb().prepare(`
    SELECT DATE(synced_at) as date, sessions, organic_sessions
    FROM analytics_summary WHERE DATE(synced_at) >= date('now', ? || ' days')
    ORDER BY synced_at DESC
  `).all(`-${days}`);
}

// --- Reports ---

function saveReport(report) {
  getDb().prepare(`
    INSERT INTO reports (type, period, title, summary_json)
    VALUES (@type, @period, @title, @summary_json)
  `).run({
    type: report.type,
    period: report.period,
    title: report.title || '',
    summary_json: JSON.stringify(report.summary || {}),
  });
}

function getRecentReports(limit = 10) {
  return getDb().prepare('SELECT * FROM reports ORDER BY generated_at DESC LIMIT ?').all(limit)
    .map(r => ({ ...r, summary: (() => { try { return JSON.parse(r.summary_json); } catch { return {}; } })() }));
}

// --- Audit Runs ---

function startAuditRun() {
  const result = getDb().prepare(
    "INSERT INTO audit_runs (status) VALUES ('running')"
  ).run();
  return result.lastInsertRowid;
}

function completeAuditRun(id, { pagesAudited, issuesFound, issuesFixed = 0 }) {
  getDb().prepare(`
    UPDATE audit_runs SET
      completed_at = datetime('now'),
      pages_audited = @pagesAudited,
      issues_found = @issuesFound,
      issues_fixed = @issuesFixed,
      status = 'completed'
    WHERE id = @id
  `).run({ id, pagesAudited, issuesFound, issuesFixed });
}

function getLatestAuditRun() {
  return getDb().prepare('SELECT * FROM audit_runs ORDER BY started_at DESC LIMIT 1').get() || null;
}

// --- Notification dedup ---

function wasNotificationSent(dedupKey) {
  return !!getDb().prepare('SELECT 1 FROM notification_log WHERE dedup_key = ?').get(dedupKey);
}

function markNotificationSent(eventType, pageId, dedupKey) {
  getDb().prepare(`
    INSERT OR IGNORE INTO notification_log (event_type, page_id, dedup_key) VALUES (?, ?, ?)
  `).run(eventType, pageId, dedupKey);
}

// --- Health ---

function recordHealthCheck(service, status, message) {
  getDb().prepare(`
    INSERT INTO health_checks (service, status, message) VALUES (?, ?, ?)
  `).run(service, status, message || null);
  getDb().prepare(`
    DELETE FROM health_checks WHERE id NOT IN (
      SELECT id FROM health_checks WHERE service = ? ORDER BY checked_at DESC LIMIT 1000
    ) AND service = ?
  `).run(service, service);
}

function getLastHealthCheck(service) {
  return getDb().prepare(`
    SELECT * FROM health_checks WHERE service = ? ORDER BY checked_at DESC LIMIT 1
  `).get(service);
}

function getDashboardStats() {
  const d = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  return {
    total_pages: d.prepare('SELECT COUNT(*) as n FROM pages').get().n,
    pages_published_today: d.prepare("SELECT COUNT(*) as n FROM pages WHERE DATE(published_at) = ?").get(today).n,
    pages_indexed_today: d.prepare("SELECT COUNT(*) as n FROM pages WHERE DATE(indexed_at) = ?").get(today).n,
    pages_indexed_total: d.prepare("SELECT COUNT(*) as n FROM pages WHERE status = 'indexed'").get().n,
    pages_indexed_this_week: d.prepare("SELECT COUNT(*) as n FROM pages WHERE DATE(indexed_at) >= ?").get(weekAgo).n,
    landing_pages_published_this_week: d.prepare("SELECT COUNT(*) as n FROM landing_pages WHERE DATE(updated_at) >= ? AND status IN ('published','indexed')").get(weekAgo).n,
    failed_jobs: d.prepare("SELECT COUNT(*) as n FROM pages WHERE status IN ('publish_failed','index_failed','generation_failed')").get().n,
    queue_length: d.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'pending'").get().n,
    metrics_today: getTodayMetrics(),
    seo_issues_open: countSEOIssues('open'),
    landing_pages: getLandingPageStats(),
    latest_audit: getLatestAuditRun(),
    latest_gsc: getLatestGSCSummary(),
    latest_analytics: getLatestAnalyticsSummary(),
  };
}

function getContentGeneratedPages(limit) {
  return getDb().prepare(
    "SELECT * FROM pages WHERE status = 'content_generated' ORDER BY created_at ASC LIMIT ?"
  ).all(limit);
}

function getPublishedUnindexedPages(limit) {
  return getDb().prepare(
    "SELECT * FROM pages WHERE status = 'published' AND url IS NOT NULL ORDER BY published_at ASC LIMIT ?"
  ).all(limit);
}

module.exports = {
  getDb,
  // Pages
  createPage, updatePage, getPage, getPendingPages, getRecentPublishedPages,
  getContentGeneratedPages, getPublishedUnindexedPages,
  // Landing pages
  createLandingPage, updateLandingPage, getPublishedLandingPageSlugs, getLandingPageStats,
  // Jobs
  enqueueJob, getDueJobs, updateJob,
  // Metrics
  getTodayMetrics, incrementMetric, updateAvgMetric, getMetricsRange,
  // SEO Issues
  createSEOIssue, getOpenSEOIssues, resolveSEOIssue, countSEOIssues,
  countSEOIssuesResolvedToday, getSEOIssuesSummary, getRecentSEOIssues,
  // GSC
  saveGSCMetric, saveGSCSummary, getLatestGSCSummary, getGSCTrend,
  // Analytics
  saveAnalyticsSummary, getLatestAnalyticsSummary, getAnalyticsTrend,
  // Reports
  saveReport, getRecentReports,
  // Audit
  startAuditRun, completeAuditRun, getLatestAuditRun,
  // Notifications
  wasNotificationSent, markNotificationSent,
  // Health
  recordHealthCheck, getLastHealthCheck,
  // Dashboard
  getDashboardStats,
};
