'use strict';

const { exec } = require('child_process');
const path = require('path');
const logger = require('../../services/Logger');
const telegram = require('../../services/TelegramService');

const ROOT = path.resolve(__dirname, '..', '..', '..');

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: ROOT }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

async function autoPush() {
  try {
    const status = await run('git status --porcelain');
    if (!status) {
      logger.debug('Auto-push: nothing to commit');
      return;
    }

    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    await run('git add -A');
    await run(`git commit -m "chore: auto-push ${timestamp}"`);
    await run('git push origin master');
    logger.info('Auto-push: changes pushed to GitHub');
  } catch (err) {
    logger.error('Auto-push failed', { error: err.message });
    await telegram.send(
      `⚠️ <b>Auto-Push Failed</b>\n\n❗ ${err.message}\n\n🕐 ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`
    ).catch(() => {});
  }
}

module.exports = { run: autoPush };
