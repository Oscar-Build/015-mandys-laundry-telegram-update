'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('./Logger');
const db = require('./Database');
const telegram = require('./TelegramService');

const SERVICE_NAMES = {
  DATABASE: 'Database',
  TELEGRAM_BOT: 'Telegram Bot',
  WORDPRESS_API: 'WordPress API',
  GOOGLE_INDEXING_API: 'Google Indexing API',
  ANTHROPIC_API: 'Anthropic API',
  SCHEDULER: 'Scheduler',
  QUEUE: 'Queue Worker',
};

// Tracks in-memory state to avoid duplicate alerts
const alertState = {};

async function checkDatabase() {
  try {
    const d = db.getDb();
    d.prepare('SELECT 1').get();
    return { ok: true, message: 'Database responding' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function checkTelegramBot() {
  if (!config.telegram.botToken) return { ok: false, message: 'Bot token not configured' };
  try {
    const res = await axios.get(
      `https://api.telegram.org/bot${config.telegram.botToken}/getMe`,
      { timeout: 8000 }
    );
    return res.data.ok
      ? { ok: true, message: `Bot: @${res.data.result.username}` }
      : { ok: false, message: 'Telegram API returned ok=false' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function checkWordPressAPI() {
  if (!config.wordpress.apiUrl) return { ok: null, message: 'WordPress URL not configured' };
  try {
    await axios.get(config.wordpress.apiUrl, { timeout: 20000 });
    return { ok: true, message: 'WordPress API responding' };
  } catch (err) {
    if (err.response && err.response.status === 401) {
      return { ok: true, message: 'WordPress API responding (auth required)' };
    }
    return { ok: false, message: err.message };
  }
}

async function checkAnthropicAPI() {
  if (!config.anthropic.apiKey) return { ok: null, message: 'Anthropic key not configured' };
  try {
    const res = await axios.get('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': config.anthropic.apiKey,
        'anthropic-version': '2023-06-01',
      },
      timeout: 10000,
    });
    return res.status === 200
      ? { ok: true, message: 'Anthropic API responding' }
      : { ok: false, message: `Status ${res.status}` };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function checkQueue() {
  try {
    const pending = db.getDb()
      .prepare("SELECT COUNT(*) as n FROM jobs WHERE status = 'pending'")
      .get().n;
    return { ok: true, message: `Queue has ${pending} pending jobs` };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

const CHECKS = [
  { name: SERVICE_NAMES.DATABASE, fn: checkDatabase },
  { name: SERVICE_NAMES.TELEGRAM_BOT, fn: checkTelegramBot },
  { name: SERVICE_NAMES.WORDPRESS_API, fn: checkWordPressAPI },
  { name: SERVICE_NAMES.ANTHROPIC_API, fn: checkAnthropicAPI },
  { name: SERVICE_NAMES.QUEUE, fn: checkQueue },
];

async function runAllChecks() {
  const results = [];

  for (const check of CHECKS) {
    try {
      const result = await check.fn();
      db.recordHealthCheck(check.name, result.ok === false ? 'down' : 'up', result.message);

      const wasAlerted = alertState[check.name];
      if (result.ok === false && !wasAlerted) {
        logger.error(`Health check FAILED: ${check.name}`, { message: result.message });
        await telegram.notifyHealthAlert(check.name, result.message).catch(() => {});
        alertState[check.name] = true;
      } else if (result.ok !== false && wasAlerted) {
        logger.info(`Health check RECOVERED: ${check.name}`);
        await telegram.notifyHealthRecovered(check.name).catch(() => {});
        alertState[check.name] = false;
      }

      results.push({ service: check.name, ...result });
    } catch (err) {
      logger.error(`Health check threw: ${check.name}`, { error: err.message });
      results.push({ service: check.name, ok: false, message: err.message });
    }
  }

  const allOk = results.every(r => r.ok !== false);
  logger.info(`Health check complete: ${allOk ? 'ALL OK' : 'ISSUES DETECTED'}`, {
    results: results.map(r => `${r.service}:${r.ok === false ? 'DOWN' : 'UP'}`).join(', '),
  });

  return results;
}

module.exports = { runAllChecks, SERVICE_NAMES };
