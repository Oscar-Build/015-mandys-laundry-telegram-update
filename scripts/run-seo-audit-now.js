'use strict';

require('dotenv').config();

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Clear fake seeded SEO issues
const DB_PATH = process.env.DB_PATH || './data/automation.db';
const db = new DatabaseSync(path.resolve(process.cwd(), DB_PATH));

console.log('Clearing fake seeded SEO issues...');
const deleted = db.prepare('DELETE FROM seo_issues').run();
console.log(`Removed ${deleted.changes} seeded issues`);
db.close();

// Run real SEO audit
const { runAudit } = require('../src/workers/SEOWorker');

console.log('\nRunning real SEO audit on mandyslaundry.com...\n');

runAudit()
  .then(result => {
    console.log('\n=== SEO Audit Results ===');
    console.log(`Pages audited: ${result.pagesAudited}`);
    console.log(`Issues found:  ${result.issuesFound}`);
    if (result.issues) {
      const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
      result.issues.forEach(i => { bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1; });
      console.log(`  Critical: ${bySeverity.critical}`);
      console.log(`  High:     ${bySeverity.high}`);
      console.log(`  Medium:   ${bySeverity.medium}`);
      console.log(`  Low:      ${bySeverity.low}`);
    }
    console.log('\nDone — refresh your dashboard to see real issues.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Audit failed:', err.message);
    process.exit(1);
  });
