'use strict';

require('dotenv').config();

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Clear fake seeded landing pages first
const DB_PATH = process.env.DB_PATH || './data/automation.db';
const db = new DatabaseSync(path.resolve(process.cwd(), DB_PATH));

console.log('Removing fake seeded landing pages...');
const deleted = db.prepare(
  "DELETE FROM landing_pages WHERE url LIKE 'https://mandyslaundry.com/%' AND wp_post_id IS NULL"
).run();
console.log(`Removed ${deleted.changes} fake landing pages`);
db.close();

// Now run the real generation pipeline
const { runLandingPageBatch } = require('../src/workers/ContentWorker');

console.log('\nStarting real landing page generation...');
console.log('This will generate content with Claude and publish to WordPress.\n');

runLandingPageBatch()
  .then(results => {
    console.log('\n=== Results ===');
    results.forEach(r => {
      const status = r.success ? '✓' : '✗';
      const detail = r.url || r.error || r.stage || '';
      console.log(`${status} ${r.city} — ${r.keyword}: ${detail}`);
    });
    const passed = results.filter(r => r.success).length;
    console.log(`\nDone: ${passed}/${results.length} landing pages published`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
