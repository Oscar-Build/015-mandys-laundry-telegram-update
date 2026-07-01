'use strict';

require('dotenv').config();

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
    siteUrl: optional('WORDPRESS_SITE_URL', optional('SITE_URL', 'https://mandyslaundry.com')),
  },

  anthropic: {
    apiKey: optional('ANTHROPIC_API_KEY'),
    model: optional('CONTENT_MODEL', 'claude-haiku-4-5-20251001'),
    pagesPerRun: parseInt(optional('PAGES_PER_RUN', '5'), 10),
    landingPagesPerRun: parseInt(optional('LANDING_PAGES_PER_RUN', '3'), 10),
    niche: optional('CONTENT_NICHE', 'laundry services, dry cleaning, fabric care'),
  },

  google: {
    clientId: optional('GOOGLE_CLIENT_ID'),
    clientSecret: optional('GOOGLE_CLIENT_SECRET'),
    refreshToken: optional('GOOGLE_REFRESH_TOKEN'),
    siteUrl: optional('SITE_URL', 'https://mandyslaundry.com'),
    ga4PropertyId: optional('GOOGLE_GA4_PROPERTY_ID'),
    pagespeedApiKey: optional('GOOGLE_PAGESPEED_API_KEY'),
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
    endOfDayReport: optional('END_OF_DAY_REPORT_CRON', '0 22 * * *'),
    healthCheck: optional('HEALTH_CHECK_CRON', '*/5 * * * *'),
    contentGen: optional('CONTENT_GEN_CRON', '0 6 * * *'),
    landingPageGen: optional('LANDING_PAGE_GEN_CRON', '30 6 * * *'),
    tenMinuteCheck: optional('TEN_MINUTE_CHECK_CRON', '*/10 * * * *'),
    hourlyCheck: optional('HOURLY_CHECK_CRON', '0 * * * *'),
    analyticsSync: optional('ANALYTICS_SYNC_CRON', '0 7 * * *'),
    weeklyAudit: optional('WEEKLY_AUDIT_CRON', '0 3 * * 1'),
  },

  retry: {
    maxAttempts: parseInt(optional('MAX_RETRY_ATTEMPTS', '3'), 10),
    baseDelayMs: parseInt(optional('RETRY_BASE_DELAY_MS', '5000'), 10),
  },

  health: {
    alertThresholdSeconds: parseInt(optional('HEALTH_ALERT_THRESHOLD_SECONDS', '300'), 10),
  },

  seo: {
    auditMaxPages: parseInt(optional('SEO_AUDIT_MAX_PAGES', '50'), 10),
    thinContentThreshold: parseInt(optional('SEO_THIN_CONTENT_WORDS', '800'), 10),
    targetCities: optional('SEO_TARGET_CITIES', 'Los Angeles,San Diego,Anaheim,Long Beach,Santa Ana')
      .split(',').map(c => c.trim()).filter(Boolean),
    targetServices: optional('SEO_TARGET_SERVICES', 'laundry pickup,dry cleaning,wash and fold,commercial laundry')
      .split(',').map(s => s.trim()).filter(Boolean),
    targetState: optional('SEO_TARGET_STATE', 'CA'),
  },

  analytics: {
    trafficDropThreshold: parseFloat(optional('TRAFFIC_DROP_THRESHOLD', '0.2')),
    trafficSpikeThreshold: parseFloat(optional('TRAFFIC_SPIKE_THRESHOLD', '0.5')),
  },
};

module.exports = config;
