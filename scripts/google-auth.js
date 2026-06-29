'use strict';

/**
 * Run ONCE to generate your Google OAuth refresh token.
 * Usage: node -r dotenv/config scripts/google-auth.js
 *
 * It starts a local server on port 3333, opens the auth URL,
 * captures the code automatically, and prints your refresh token.
 */

const { google } = require('googleapis');
const http = require('http');
const { exec } = require('child_process');
const { URL } = require('url');

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT          = 3333;
const REDIRECT_URI  = `http://localhost:${PORT}`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\nERROR: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env first.\n');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/indexing'],
  prompt: 'consent',
});

console.log('\n──────────────────────────────────────────────────');
console.log('  Google OAuth Setup — Mandy\'s Laundry Indexing');
console.log('──────────────────────────────────────────────────');
console.log('\nStarting local server on port', PORT, '...');
console.log('\nOpening browser automatically...');
console.log('\nIf the browser does not open, paste this URL manually:\n');
console.log('  ' + authUrl + '\n');

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, REDIRECT_URI);
  const code   = parsed.searchParams.get('code');
  const error  = parsed.searchParams.get('error');

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2 style="font-family:sans-serif;color:red">Access denied. You can close this tab.</h2>');
    server.close();
    console.error('\nERROR: Access was denied.\n');
    process.exit(1);
  }

  if (!code) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2 style="font-family:sans-serif">Waiting...</h2>');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html><body style="font-family:sans-serif;padding:40px;text-align:center">
      <h2 style="color:#7c3aed">✅ Authorization Successful!</h2>
      <p>You can close this tab and go back to the terminal.</p>
    </body></html>
  `);

  server.close();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n──────────────────────────────────────────────────');
    console.log('  SUCCESS — Add this line to your .env file:');
    console.log('──────────────────────────────────────────────────\n');
    console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\n──────────────────────────────────────────────────\n');
    process.exit(0);
  } catch (err) {
    console.error('\nERROR exchanging code for token:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  // Auto-open browser on Windows
  exec(`start "" "${authUrl}"`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nERROR: Port ${PORT} is already in use. Close whatever is using it and try again.\n`);
  } else {
    console.error('\nServer error:', err.message);
  }
  process.exit(1);
});
