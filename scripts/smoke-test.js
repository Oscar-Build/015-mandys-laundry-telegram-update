'use strict';

require('dotenv').config();

const path = require('path');
const assert = require('assert');

console.log('Running smoke tests...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

// --- Config ---
test('Config loads without errors', () => {
  const config = require('../src/config');
  assert(config.app.name, 'app.name must exist');
  assert(config.telegram.chatId, 'telegram.chatId must exist');
  assert(config.retry.maxAttempts >= 1, 'retry.maxAttempts >= 1');
});

// --- Logger ---
test('Logger initializes', () => {
  const logger = require('../src/services/Logger');
  assert(typeof logger.info === 'function');
  assert(typeof logger.error === 'function');
});

// --- Database ---
test('Database initializes and creates schema', () => {
  const db = require('../src/services/Database');
  const conn = db.getDb();
  assert(conn, 'db connection must exist');
  const tables = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const names = tables.map(t => t.name);
  ['pages', 'jobs', 'metrics_daily', 'health_checks', 'notification_log'].forEach(t => {
    assert(names.includes(t), `Table "${t}" must exist`);
  });
});

// --- Database CRUD ---
test('Database page operations work', () => {
  const db = require('../src/services/Database');
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  db.createPage({ id, website: 'Test', project: 'smoke', title: 'Smoke Test Page', slug: 'smoke-test' });
  const page = db.getPage(id);
  assert(page && page.id === id, 'Page must be retrievable');
  db.updatePage(id, { status: 'published', url: 'https://example.com/smoke-test' });
  const updated = db.getPage(id);
  assert(updated.status === 'published', 'Status update must persist');
});

// --- Metrics ---
test('Metrics service returns dashboard', () => {
  const metrics = require('../src/services/MetricsService');
  const dash = metrics.getDashboard();
  assert(dash.overview, 'overview must exist');
  assert(dash.today, 'today must exist');
  assert(typeof dash.overview.total_pages === 'number', 'total_pages must be a number');
});

// --- RetryService ---
test('RetryService retries and succeeds', async () => {
  const retry = require('../src/services/RetryService');
  let attempts = 0;
  await retry.withRetry(() => {
    attempts++;
    if (attempts < 2) throw new Error('simulated failure');
    return 'ok';
  }, {}, { maxAttempts: 3, baseDelayMs: 10 });
  assert(attempts === 2, `Expected 2 attempts, got ${attempts}`);
});

// --- File structure ---
test('Required source files exist', () => {
  const files = [
    'src/index.js',
    'src/config/index.js',
    'src/services/Logger.js',
    'src/services/Database.js',
    'src/services/TelegramService.js',
    'src/services/RetryService.js',
    'src/services/MetricsService.js',
    'src/services/HealthMonitor.js',
    'src/services/GitService.js',
    'src/services/ContentGenerator.js',
    'src/services/PublisherService.js',
    'src/services/IndexingService.js',
    'src/workflows/ContentWorkflow.js',
    'src/workers/WorkflowWorker.js',
    'src/scheduler/Scheduler.js',
    'src/scheduler/jobs/dailySummary.js',
    'src/scheduler/jobs/healthCheck.js',
  ];
  const fs = require('fs');
  files.forEach(f => {
    assert(fs.existsSync(path.join(process.cwd(), f)), `Missing: ${f}`);
  });
});

// --- Run async tests ---
(async () => {
  // Run the async retry test
  try {
    const retry = require('../src/services/RetryService');
    let attempts = 0;
    await retry.withRetry(() => {
      attempts++;
      if (attempts < 2) throw new Error('simulated');
      return 'ok';
    }, {}, { maxAttempts: 3, baseDelayMs: 10 });
    console.log('  ✅ RetryService async test');
    passed++;
  } catch (err) {
    console.log(`  ❌ RetryService async test: ${err.message}`);
    failed++;
  }

  console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('\n✅ All smoke tests passed!');
    process.exit(0);
  }
})();
