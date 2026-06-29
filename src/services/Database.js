'use strict';

// Uses Node.js built-in SQLite (requires Node >= 22.5.0)
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

    CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_next_run ON jobs(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_health_checks_service ON health_checks(service, checked_at);
  `);
}

// --- Pages ---

function createPage(data) {
  const db = getDb();
  db.prepare(`
    INSERT INTO pages (id, website, project, title, slug, status)
    VALUES (@id, @website, @project, @title, @slug, 'content_generating')
  `).run(data);
}

function updatePage(id, fields) {
  const db = getDb();
  const keys = Object.keys(fields);
  const setClause = keys.map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE pages SET ${setClause}, updated_at = datetime('now') WHERE id = @id`)
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
  const db = getDb();
  const keys = Object.keys(fields);
  const setClause = keys.map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE jobs SET ${setClause} WHERE id = @id`).run({ ...fields, id });
}

// --- Metrics ---

function getTodayMetrics() {
  const today = new Date().toISOString().slice(0, 10);
  const db = getDb();
  return db.prepare('SELECT * FROM metrics_daily WHERE date = ?').get(today)
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
  const db = getDb();
  const row = db.prepare('SELECT * FROM metrics_daily WHERE date = ?').get(today);
  if (!row || !row[field]) {
    db.prepare(`INSERT INTO metrics_daily (date, ${field}) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET ${field} = excluded.${field}, updated_at = datetime('now')`).run(today, newValueMs);
  } else {
    const avg = (row[field] + newValueMs) / 2;
    db.prepare(`UPDATE metrics_daily SET ${field} = ?, updated_at = datetime('now') WHERE date = ?`).run(avg, today);
  }
}

function getMetricsRange(days = 7) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM metrics_daily
    WHERE date >= date('now', ? || ' days')
    ORDER BY date DESC
  `).all(`-${days}`);
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
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  return {
    total_pages: db.prepare('SELECT COUNT(*) as n FROM pages').get().n,
    pages_published_today: db.prepare("SELECT COUNT(*) as n FROM pages WHERE DATE(published_at) = ?").get(today).n,
    pages_indexed_today: db.prepare("SELECT COUNT(*) as n FROM pages WHERE DATE(indexed_at) = ?").get(today).n,
    failed_jobs: db.prepare("SELECT COUNT(*) as n FROM pages WHERE status IN ('publish_failed','index_failed','generation_failed')").get().n,
    queue_length: db.prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'pending'").get().n,
    metrics_today: getTodayMetrics(),
  };
}

module.exports = {
  getDb,
  createPage, updatePage, getPage, getPendingPages,
  enqueueJob, getDueJobs, updateJob,
  getTodayMetrics, incrementMetric, updateAvgMetric, getMetricsRange,
  wasNotificationSent, markNotificationSent,
  recordHealthCheck, getLastHealthCheck,
  getDashboardStats,
};
