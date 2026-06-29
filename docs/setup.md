# Setup Guide

## Prerequisites

- Node.js 18+ installed
- Git configured on the machine
- WordPress site with REST API enabled
- Anthropic API account
- Google Cloud project (for indexing)
- Telegram bot created via @BotFather

---

## Step 1 — Install Dependencies

```bash
cd "Telegram Notification Mandys"
npm install
```

---

## Step 2 — Configure Environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

### Telegram Bot
1. Open Telegram → search @BotFather
2. Send `/newbot`, choose a name and username
3. Copy the token to `TELEGRAM_BOT_TOKEN`
4. Add the bot to the **Oscar Team notification** group
5. `TELEGRAM_CHAT_ID` is pre-set to `-5572635670`

### WordPress
1. Log into WordPress Admin
2. Go to **Users → Profile → Application Passwords**
3. Enter "Automation" as the name → click **Add New**
4. Copy the generated password to `WORDPRESS_APP_PASSWORD`
5. Set `WORDPRESS_USERNAME` to your admin username
6. Set `WORDPRESS_API_URL` to `https://yourdomain.com/wp-json/wp/v2`

### Anthropic
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Copy to `ANTHROPIC_API_KEY`

---

## Step 3 — Google Indexing API

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create or select a project
3. Enable **Web Search Indexing API**
4. Create a **Service Account**
   - Go to IAM & Admin → Service Accounts
   - Click **Create Service Account**
   - Give it a name like "mandys-indexing"
5. Create a JSON key
   - Click the service account → Keys → Add Key → JSON
   - Download the file
6. Save as `config/google-service-account.json`
7. Go to **Google Search Console** → your property → Settings → Users and Permissions
8. Add the service account email as **Owner**

---

## Step 4 — Initialize Git

```bash
git init
git remote add origin YOUR_GITHUB_REPO_URL
git add .
git commit -m "chore: initial automation setup"
git push -u origin main
```

---

## Step 5 — Start the System

```bash
npm start
```

You should see:
```
=== Mandy's Laundry Automation Starting ===
Database ready
Health check complete: ALL OK
Scheduler started with 3 jobs
Starting workflow worker
=== System fully operational ===
```

And a Telegram message:
```
🚀 Mandy's Laundry Automation Started
Environment: production
Time: ...
All systems operational.
```

---

## Production Deployment (PM2)

```bash
npm install -g pm2

# Start
pm2 start src/index.js --name mandys-automation --env production

# Auto-restart on reboot
pm2 save
pm2 startup

# Monitor
pm2 status
pm2 logs mandys-automation
pm2 monit
```

---

## Manual Commands

```bash
# Trigger a daily summary now
npm run daily-summary

# Run a health check now
npm run health-check

# Generate content for a specific topic (Node REPL)
node -e "
  require('dotenv').config();
  const { runContentWorkflow } = require('./src/workflows/ContentWorkflow');
  runContentWorkflow('How to Remove Tough Stains').then(console.log);
"
```
