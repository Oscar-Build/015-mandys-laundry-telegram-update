'use strict';

require('dotenv').config();

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Remove all fake/seeded blog posts
const DB_PATH = process.env.DB_PATH || './data/automation.db';
const db = new DatabaseSync(path.resolve(process.cwd(), DB_PATH));

console.log('Removing fake seeded blog posts...');
const deleted = db.prepare(
  `DELETE FROM pages WHERE
    url LIKE '%/blog/%'
    OR url LIKE 'https://example.com/%'
    OR status = 'content_generating'`
).run();
console.log(`Removed ${deleted.changes} fake blog posts`);
db.close();

// Run real blog generation
const { runBlogBatch } = require('../src/workers/ContentWorker');

console.log('\nStarting real blog post generation...');
console.log('This will generate content with Claude and publish to WordPress.\n');

runBlogBatch()
  .then(results => {
    console.log('\n=== Results ===');
    results.forEach(r => {
      const status = r.success ? '✓' : '✗';
      const detail = r.url || r.error || r.stage || '';
      console.log(`${status} ${r.topic}: ${detail}`);
    });
    const passed = results.filter(r => r.success).length;
    console.log(`\nDone: ${passed}/${results.length} blog posts published`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
