'use strict';

require('dotenv').config();

function required(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key, defaultVal = '') {
  return process.env[key] || defaultVal;
}

const config = {
  app: {
    name: optional('APP_NAME', "Mandy's Laundry Automation"),
    env: optional('NODE_ENV', 'development'),
    port: parseInt(optional('PORT', '3000'), 10),
    logLevel: optional('LOG_LEVEL', 'info'),
  },

  telegram: {
    botToken: optional('TELEGRAM_BOT_TOKEN'),
    chatId: optional('TELEGRAM_CHAT_ID', '-5572635670'),
    notifyOnStart: optional('TELEGRAM_NOTIFY_ON_START', 'true') === 'true',
  },

  wordpress: {
    apiUrl: optional('WORDPRESS_API_URL'),
    username: optional('WORDPRESS_USERNAME'),
    appPassword: optional('WORDPRESS_APP_PASSWORD'),
  },

  anthropic: {
    apiKey: optional('ANTHROPIC_API_KEY'),
    model: optional('CONTENT_MODEL', 'claude-haiku-4-5-20251001'),
    pagesPerRun: parseInt(optional('PAGES_PER_RUN', '5'), 10),
    niche: optional('CONTENT_NICHE', 'laundry services, dry cleaning, fabric care'),
  },

  google: {
    clientId: optional('GOOGLE_CLIENT_ID'),
    clientSecret: optional('GOOGLE_CLIENT_SECRET'),
    refreshToken: optional('GOOGLE_REFRESH_TOKEN'),
    siteUrl: optional('SITE_URL', 'https://mandyslaundry.com'),
  },

  db: {
    path: optional('DB_PATH', './data/automation.db'),
  },

  git: {
    autoPush: optional('GIT_AUTO_PUSH', 'true') === 'true',
    remote: optional('GIT_REMOTE', 'origin'),
    branch: optional('GIT_BRANCH', 'main'),
    userName: optional('GIT_USER_NAME', 'Oscar Automation'),
    userEmail: optional('GIT_USER_EMAIL', 'automation@mandyslaundry.com'),
  },

  cron: {
    dailySummary: optional('DAILY_SUMMARY_CRON', '0 8 * * *'),
    healthCheck: optional('HEALTH_CHECK_CRON', '*/5 * * * *'),
    contentGen: optional('CONTENT_GEN_CRON', '0 6 * * *'),
  },

  retry: {
    maxAttempts: parseInt(optional('MAX_RETRY_ATTEMPTS', '3'), 10),
    baseDelayMs: parseInt(optional('RETRY_BASE_DELAY_MS', '5000'), 10),
  },

  health: {
    alertThresholdSeconds: parseInt(optional('HEALTH_ALERT_THRESHOLD_SECONDS', '300'), 10),
  },
};

module.exports = config;
