'use strict';

const simpleGit = require('simple-git');
const config = require('../config');
const logger = require('./Logger');

let git;

function getGit() {
  if (git) return git;
  git = simpleGit(process.cwd());
  return git;
}

async function ensureGitConfigured() {
  const g = getGit();
  try {
    await g.addConfig('user.name', config.git.userName, false, 'local');
    await g.addConfig('user.email', config.git.userEmail, false, 'local');
  } catch (err) {
    logger.warn('Could not set git config', { error: err.message });
  }
}

/**
 * Stage all changes, commit with message, and push to remote.
 * Returns false if there is nothing to commit.
 */
async function commitAndPush(message) {
  if (!config.git.autoPush) {
    logger.debug('Git auto-push disabled, skipping commit');
    return false;
  }

  try {
    const g = getGit();
    await ensureGitConfigured();

    const status = await g.status();
    if (status.files.length === 0) {
      logger.debug('No changes to commit');
      return false;
    }

    await g.add('.');
    const commitResult = await g.commit(message);
    logger.info('Git commit created', { hash: commitResult.commit, message });

    try {
      await g.push(config.git.remote, config.git.branch);
      logger.info('Git push successful', { remote: config.git.remote, branch: config.git.branch });
    } catch (pushErr) {
      logger.warn('Git push failed (will not block workflow)', { error: pushErr.message });
    }

    return true;
  } catch (err) {
    logger.error('Git commit failed', { error: err.message });
    return false;
  }
}

async function autoCommitWorkflowResult(page, action) {
  const date = new Date().toISOString().slice(0, 10);
  const msg = `chore(automation): ${action} "${page.title}" [${date}]\n\nWebsite: ${page.website}\nProject: ${page.project}\nURL: ${page.url || 'N/A'}\nStatus: ${page.status}`;
  return commitAndPush(msg);
}

async function autoCommitDailySummary(metrics) {
  const msg = `chore(report): daily summary ${metrics.date} — created:${metrics.pages_created} published:${metrics.pages_published} indexed:${metrics.pages_indexed} failed:${metrics.pages_failed}`;
  return commitAndPush(msg);
}

module.exports = { commitAndPush, autoCommitWorkflowResult, autoCommitDailySummary };
