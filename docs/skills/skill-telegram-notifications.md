# Skill: Telegram Notifications
## Mandy's Laundry Automation Platform

---

## What This Skill Does
Sends automated Telegram notifications to the Oscar team group chat for every key event: content published, indexing submitted, errors, daily end-of-day report.

---

## Notification Types
| Event | Message |
|---|---|
| ✅ Page Published | Title + clickable "View Post →" link |
| 🗺️ Landing Page Published | Location + Service + clickable link |
| 📤 Indexing Submitted | Title + link |
| 📈 Page Indexed by Google | Title + link |
| ❌ Publish Failed | Title + error message |
| 🚨 Workflow Error | Job name + error + timestamp |
| 🌙 End-of-Day Report | Created / Published / Indexed counts + Dashboard link |
| 🚨 SEO Critical Issues | List of issues with clickable URLs + Dashboard link |

---

## Schedule
| Report | Time (PST) |
|---|---|
| End-of-Day Report | 10:00 PM daily |
| Morning Briefing | 8:00 AM daily |

---

## Key Files
| File | Purpose |
|---|---|
| `src/services/TelegramService.js` | All notification functions |
| `src/scheduler/jobs/endOfDayReport.js` | 10 PM nightly summary |
| `src/scheduler/jobs/dailySummary.js` | 8 AM morning briefing |
| `src/scheduler/Scheduler.js` | Wires jobs to cron + sends alert on any failure |

---

## Required .env Variables
```
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_group_chat_id   # must be the GROUP chat ID
```

---

## How to Find the Group Chat ID
1. Add the bot to the Telegram group
2. Send any message in the group
3. Run: `node -e "require('dotenv').config(); const TelegramBot = require('node-telegram-bot-api'); const b = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {polling:false}); b.getUpdates({limit:50}).then(u => u.forEach(x => console.log(x.message?.chat?.id, x.message?.chat?.title))).catch(console.error);"`
4. Copy the chat ID (negative number like `-100xxxxxxxxxx`)
5. Set `TELEGRAM_CHAT_ID` in `.env` and GitHub Secrets

---

## How to Send a Test Notification
```bash
node -e "
require('dotenv').config();
const t = require('./src/services/TelegramService');
t.send('🧪 Test notification from Mandy\\'s Laundry automation');
"
```

---

## Troubleshooting
| Symptom | Fix |
|---|---|
| "chat not found" error | Bot not in group, or wrong chat ID |
| No notifications at all | Check `TELEGRAM_BOT_TOKEN` is valid |
| Notifications going to wrong chat | Update `TELEGRAM_CHAT_ID` in `.env` |
| Duplicate notifications | Check dedup keys in TelegramService.js |

---
*Skill maintained by: Coworks | Platform: Mandy's Laundry SEO Automation*
