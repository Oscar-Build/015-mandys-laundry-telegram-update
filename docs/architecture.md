# Architecture Overview

## System Design

The Mandy's Laundry automation is a single-process Node.js application with three concurrent subsystems:

1. **Scheduler** — cron-based job dispatcher
2. **WorkflowWorker** — queue-based job processor (polls every 30s)
3. **ContentWorkflow** — the actual generate→publish→index pipeline

All three share the same SQLite database and service layer.

---

## Data Flow

```
[Cron Trigger: 6:00 AM daily]
        │
        ▼
[ContentWorkflow.runBatch()]
        │
        ▼
[ContentGenerator.generateTopicIdeas(5)]   ← Anthropic Claude API
        │
        ▼ (for each topic)
[ContentGenerator.generatePage(topic)]      ← Claude generates HTML post
        │
        ▼
[TelegramService.notifyContentGenerated]    ← ✅ Telegram alert
        │
        ▼
[PublisherService.pageExists(slug)]         ← Duplicate check (WordPress API)
        │
        ▼
[PublisherService.publishPage(content)]     ← WordPress REST API
        │
        ▼
[TelegramService.notifyPagePublished]       ← ✅ Telegram alert
        │
        ▼
[IndexingService.submitForIndexing(url)]    ← Google Indexing API
        │
        ▼
[TelegramService.notifyPageIndexed]         ← 📈 Telegram alert
        │
        ▼
[GitService.autoCommitWorkflowResult]       ← git add . && git commit && git push
```

---

## Retry Flow

```
[Operation Attempt 1] ──FAIL──► [Wait 5s] ──► [Telegram: ⚠️ Retry 1/3]
        │                                               │
        └──────────────────────────────────────────────┘
[Operation Attempt 2] ──FAIL──► [Wait 10s] ──► [Telegram: ⚠️ Retry 2/3]
        │                                               │
        └──────────────────────────────────────────────┘
[Operation Attempt 3] ──FAIL──► [Telegram: ❌ Failed] ──► Return error
        │
[Operation Attempt 3] ──OK──► Continue pipeline
```

---

## Database Schema

### pages

Tracks each content page through its lifecycle.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| website | TEXT | "Mandy's Laundry" |
| project | TEXT | Project/folder name |
| title | TEXT | Page title |
| url | TEXT | Published URL |
| slug | TEXT | URL slug |
| status | TEXT | pending → content_generated → published → indexed |
| content_generated_at | TEXT | ISO timestamp |
| published_at | TEXT | ISO timestamp |
| indexed_at | TEXT | ISO timestamp |
| error | TEXT | Last error message |
| retry_count | INTEGER | Number of retries |
| duration_ms | INTEGER | Processing time |

### jobs

Queue for async/deferred jobs.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| page_id | TEXT FK | Link to pages |
| type | TEXT | `generate_and_publish` |
| status | TEXT | pending → processing → completed/failed |
| payload | TEXT | JSON payload |
| attempts | INTEGER | Attempt count |
| next_run_at | TEXT | When to process |

### metrics_daily

Daily aggregated statistics.

| Column | Type | Description |
|--------|------|-------------|
| date | TEXT PK | YYYY-MM-DD |
| pages_created | INTEGER | Count |
| pages_published | INTEGER | Count |
| pages_indexed | INTEGER | Count |
| pages_failed | INTEGER | Count |
| retries_performed | INTEGER | Count |
| errors_encountered | INTEGER | Count |
| avg_publish_ms | REAL | Average publish time |
| avg_index_ms | REAL | Average index time |

### health_checks

Rolling history of health check results.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| service | TEXT | Service name |
| status | TEXT | up / down |
| message | TEXT | Details |
| checked_at | TEXT | Timestamp |

### notification_log

Deduplication log for Telegram messages.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| event_type | TEXT | Event name |
| page_id | TEXT | Related page |
| dedup_key | TEXT UNIQUE | Prevents duplicate sends |
| sent_at | TEXT | Timestamp |

---

## Service Responsibilities

| Service | File | Responsibility |
|---------|------|----------------|
| Config | `src/config/index.js` | Loads and validates all env vars |
| Logger | `src/services/Logger.js` | Winston logger with file rotation |
| Database | `src/services/Database.js` | SQLite access layer |
| TelegramService | `src/services/TelegramService.js` | All Telegram notifications |
| RetryService | `src/services/RetryService.js` | Exponential backoff wrapper |
| MetricsService | `src/services/MetricsService.js` | Dashboard statistics |
| HealthMonitor | `src/services/HealthMonitor.js` | Service health checks |
| GitService | `src/services/GitService.js` | Auto commit and push |
| ContentGenerator | `src/services/ContentGenerator.js` | Claude AI content generation |
| PublisherService | `src/services/PublisherService.js` | WordPress REST API publisher |
| IndexingService | `src/services/IndexingService.js` | Google Indexing API |
| ContentWorkflow | `src/workflows/ContentWorkflow.js` | Pipeline orchestrator |
| WorkflowWorker | `src/workers/WorkflowWorker.js` | Queue-based job processor |
| Scheduler | `src/scheduler/Scheduler.js` | Cron job manager |

---

## Error Handling Strategy

1. **Service errors** (API timeouts, network errors) → Retry with exponential backoff
2. **Fatal errors** (invalid config, missing credentials) → Log + Telegram alert + exit with code 1
3. **Non-fatal errors** (indexing fails but page is published) → Log + Telegram alert + continue
4. **Uncaught exceptions** → Log + Telegram alert + process.exit(1) (let PM2/supervisor restart)
5. **Duplicate prevention** → Check slug existence before publishing; dedup Telegram notifications via DB key

---

## Deployment

### Development
```bash
npm run dev    # nodemon hot-reload
```

### Production (PM2 recommended)
```bash
npm install -g pm2
pm2 start src/index.js --name mandys-laundry-automation
pm2 save
pm2 startup
```

### Logs (PM2)
```bash
pm2 logs mandys-laundry-automation
pm2 monit
```
