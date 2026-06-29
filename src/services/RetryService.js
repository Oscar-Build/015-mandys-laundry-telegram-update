'use strict';

const config = require('../config');
const logger = require('./Logger');
const telegram = require('./TelegramService');

/**
 * Executes fn with exponential-backoff retry.
 * Sends a Telegram notification on each retry attempt.
 */
async function withRetry(fn, context = {}, options = {}) {
  const maxAttempts = options.maxAttempts || config.retry.maxAttempts;
  const baseDelayMs = options.baseDelayMs || config.retry.baseDelayMs;
  const { page, label } = context;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      logger.warn(`Attempt ${attempt}/${maxAttempts} failed`, {
        label,
        error: err.message,
        pageId: page?.id,
      });

      if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        if (page) {
          await telegram.notifyRetryAttempt(
            page,
            attempt,
            maxAttempts,
            err.message || label || 'unknown error'
          ).catch(() => {});
        }
        logger.info(`Waiting ${delayMs}ms before retry...`, { attempt, delayMs });
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { withRetry, sleep };
