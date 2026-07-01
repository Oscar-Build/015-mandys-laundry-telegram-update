'use strict';

/**
 * Run this once to get a new Google refresh token with all required scopes:
 *   - Search Console (GSC)
 *   - Google Analytics GA4
 *   - Google Indexing API
 *
 * Uses the modern localhost loopback flow (Google killed the old copy-paste flow).
 *
 * For security, the token is NEVER printed to the terminal. Instead it is:
 *   1. Written directly into your .env (GOOGLE_REFRESH_TOKEN updated in place)
 *   2. Saved to new-refresh-token.txt so you can copy it into the GitHub secret
 *      (both files are gitignored — delete the .txt after you copy it)
 *
 * Usage:
 *   node scripts/get-google-token.js
 */

require('dotenv').config();

const { google } = require('googleapis');
const http       = require('http');
const fs         = require('fs');
const path       = require('path');
const { exec }   = require('child_process');

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT          = 5858;
const REDIRECT_URI  = `http://localhost:${PORT}`;
const ENV_PATH      = path.resolve(__dirname, '..', '.env');
const TOKEN_OUT     = path.resolve(__dirname, '..', 'new-refresh-token.txt');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in your .env');
  process.exit(1);
}

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',   // Search Console
  'https://www.googleapis.com/auth/analytics.readonly',    // GA4 Analytics
  'https://www.googleapis.com/auth/indexing',              // Google Indexing API
];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',   // force a fresh refresh token
});

function updateEnv(token) {
  let env = fs.readFileSync(ENV_PATH, 'utf8');
  if (/^GOOGLE_REFRESH_TOKEN=.*$/m.test(env)) {
    env = env.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, `GOOGLE_REFRESH_TOKEN=${token}`);
  } else {
    env += `\nGOOGLE_REFRESH_TOKEN=${token}\n`;
  }
  fs.writeFileSync(ENV_PATH, env);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT_URI);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      res.end(`Authorization failed: ${error}. You can close this tab.`);
      console.error('\nAuthorization was denied:', error);
      server.close();
      process.exit(1);
    }
    if (!code) {
      res.end('Waiting for Google authorization...');
      return;
    }

    res.end('<h2>Success! You can close this tab and return to the terminal.</h2>');

    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      console.error('\nNo refresh token returned. Try again (revoke prior access first).');
      server.close();
      process.exit(1);
    }

    updateEnv(refreshToken);
    fs.writeFileSync(TOKEN_OUT, refreshToken + '\n');

    console.log('\n========================================');
    console.log('SUCCESS — new refresh token obtained.');
    console.log('========================================');
    console.log('  - .env updated automatically (GOOGLE_REFRESH_TOKEN)');
    console.log('  - Token also saved to: new-refresh-token.txt');
    console.log('');
    console.log('NEXT: open new-refresh-token.txt, copy the value,');
    console.log('and paste it into the GitHub secret GOOGLE_REFRESH_TOKEN');
    console.log('(repo -> Settings -> Secrets -> Actions). Then delete the .txt.');
    console.log('========================================\n');
    server.close();
    process.exit(0);
  } catch (err) {
    res.end('Error exchanging code. Check the terminal.');
    console.error('\nFailed to get token:', err.message);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('\n========================================');
  console.log('Opening your browser to authorize...');
  console.log('If it does not open, paste this URL manually:\n');
  console.log(authUrl);
  console.log('========================================\n');

  const platform = process.platform;
  const opener = platform === 'win32' ? `start "" "${authUrl}"`
               : platform === 'darwin' ? `open "${authUrl}"`
               : `xdg-open "${authUrl}"`;
  exec(opener, () => {});
});
