'use strict';

const db = require('./Database');
const logger = require('./Logger');

/**
 * Returns dashboard statistics for external consumption
 * (API endpoint, monitoring, etc.)
 */
function getDashboard() {
  try {
    const stats = db.getDashboardStats();
    const today = stats.metrics_today || {};
    const total = stats.total_pages || 0;
    const published = today.pages_published || 0;

    return {
      timestamp: new Date().toISOString(),
      overview: {
        total_pages: total,
        pages_published_today: stats.pages_published_today,
        pages_indexed_today: stats.pages_indexed_today,
        failed_jobs: stats.failed_jobs,
        queue_length: stats.queue_length,
      },
      today: {
        pages_created: today.pages_created || 0,
        pages_published: today.pages_published || 0,
        pages_indexed: today.pages_indexed || 0,
        pages_failed: today.pages_failed || 0,
        retries_performed: today.retries_performed || 0,
        errors_encountered: today.errors_encountered || 0,
        avg_publish_time_sec: today.avg_publish_ms ? (today.avg_publish_ms / 1000).toFixed(2) : null,
        avg_index_time_sec: today.avg_index_ms ? (today.avg_index_ms / 1000).toFixed(2) : null,
      },
      success_rates: {
        publishing: total > 0 ? Math.round((published / today.pages_created || 0) * 100) : null,
        indexing: published > 0 ? Math.round(((today.pages_indexed || 0) / published) * 100) : null,
      },
      worker_status: 'running',
    };
  } catch (err) {
    logger.error('Failed to build dashboard metrics', { error: err.message });
    return { error: err.message };
  }
}

function getWeeklyTrend() {
  return db.getMetricsRange(7);
}

module.exports = { getDashboard, getWeeklyTrend };
