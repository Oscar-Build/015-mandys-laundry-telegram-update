'use strict';

const { google } = require('googleapis');
const config = require('../config');
const logger = require('./Logger');

let oauth2Client;

async function getAuth() {
  if (oauth2Client) return oauth2Client;

  if (!config.google.clientId || !config.google.clientSecret || !config.google.refreshToken) {
    throw new Error(
      'Google OAuth credentials missing. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env. Run: node scripts/google-auth.js to generate the refresh token.'
    );
  }

  oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  oauth2Client.setCredentials({ refresh_token: config.google.refreshToken });
  return oauth2Client;
}

/**
 * Submits a URL to the Google Indexing API.
 * Returns { notificationType, urlNotificationMetadata }
 */
async function submitForIndexing(url) {
  logger.info('Submitting URL to Google Indexing API', { url });

  const authClient = await getAuth();
  const indexing = google.indexing({ version: 'v3', auth: authClient });

  const response = await indexing.urlNotifications.publish({
    requestBody: {
      url,
      type: 'URL_UPDATED',
    },
  });

  logger.info('Indexing request submitted', {
    url,
    notificationType: response.data.urlNotificationMetadata?.latestUpdate?.type,
  });

  return response.data;
}

function isConfigured() {
  return !!(config.google.clientId && config.google.clientSecret && config.google.refreshToken);
}

module.exports = { submitForIndexing, isConfigured };
