'use strict';

const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../services/Logger');
const db = require('../services/Database');
const telegram = require('../services/TelegramService');
const retry = require('../services/RetryService');
const git = require('../services/GitService');
const contentGenerator = require('../services/ContentGenerator');
const publisher = require('../services/PublisherService');
const indexer = require('../services/IndexingService');

const WEBSITE = "Mandy's Laundry";
const PROJECT = 'mandys-laundry-seo';

/**
 * Full pipeline: generate → publish → index
 * Each step is wrapped in retry logic and sends Telegram notifications.
 */
async function runContentWorkflow(topic) {
  const pageId = uuidv4();
  const workflowStart = Date.now();

  const pageStub = {
    id: pageId,
    website: WEBSITE,
    project: PROJECT,
    title: topic,
    url: null,
    status: 'pending',
  };

  db.createPage({
    id: pageId,
    website: WEBSITE,
    project: PROJECT,
    title: topic,
    slug: '',
  });

  await telegram.notifyPageCreated(pageStub);
  logger.info('Starting content workflow', { pageId, topic });

  // --- Step 1: Generate Content ---
  let pageData;
  try {
    const genStart = Date.now();
    pageData = await retry.withRetry(
      () => contentGenerator.generatePage(topic, PROJECT),
      { page: pageStub, label: 'content generation' }
    );
    const genMs = Date.now() - genStart;

    db.updatePage(pageId, {
      title: pageData.title,
      slug: pageData.slug,
      status: 'content_generated',
      content_generated_at: new Date().toISOString(),
      duration_ms: genMs,
    });

    const generatedPage = db.getPage(pageId);
    await telegram.notifyContentGenerated({ ...generatedPage, duration_ms: genMs });
    db.updateAvgMetric('avg_publish_ms', genMs); // reuse field name for generation

    logger.info('Content generation complete', { pageId, title: pageData.title });
  } catch (err) {
    db.updatePage(pageId, { status: 'generation_failed', error: err.message });
    await telegram.notifyGenerationFailed(pageStub, err.message);
    await telegram.notifyWorkflowError({ website: WEBSITE, project: PROJECT }, err.message);
    logger.error('Content generation failed permanently', { pageId, error: err.message });
    return { success: false, stage: 'generation', error: err.message };
  }

  // Guard: check for duplicate before publishing
  try {
    const exists = await publisher.pageExists(pageData.slug);
    if (exists) {
      logger.warn('Page already exists, skipping publish', { slug: pageData.slug });
      db.updatePage(pageId, { status: 'skipped_duplicate', url: `${config.google.siteUrl}/${pageData.slug}` });
      return { success: true, stage: 'skipped_duplicate', slug: pageData.slug };
    }
  } catch (_) {}

  // --- Step 2: Publish ---
  let publishResult;
  try {
    const pubStart = Date.now();
    publishResult = await retry.withRetry(
      () => publisher.publishPage(pageData),
      { page: { ...pageStub, title: pageData.title }, label: 'publishing' }
    );
    const pubMs = Date.now() - pubStart;

    db.updatePage(pageId, {
      title: pageData.title,
      url: publishResult.url,
      status: 'published',
      published_at: new Date().toISOString(),
      duration_ms: pubMs,
    });
    db.updateAvgMetric('avg_publish_ms', pubMs);

    const publishedPage = db.getPage(pageId);
    await telegram.notifyPagePublished({ ...publishedPage, duration_ms: pubMs });
    logger.info('Page published', { pageId, url: publishResult.url });
  } catch (err) {
    db.updatePage(pageId, { status: 'publish_failed', error: err.message });
    const failPage = db.getPage(pageId);
    await telegram.notifyPublishFailed(failPage || pageStub, err.message);
    await telegram.notifyWorkflowError({ website: WEBSITE, project: PROJECT }, err.message);
    logger.error('Publishing failed permanently', { pageId, error: err.message });
    return { success: false, stage: 'publishing', error: err.message };
  }

  // --- Step 3: Index ---
  try {
    const idxStart = Date.now();
    const url = publishResult.url;
    await telegram.notifyIndexingSubmitted({ ...db.getPage(pageId), url });

    await retry.withRetry(
      () => indexer.submitForIndexing(url),
      { page: db.getPage(pageId), label: 'indexing' }
    );
    const idxMs = Date.now() - idxStart;

    db.updatePage(pageId, {
      status: 'indexed',
      indexed_at: new Date().toISOString(),
      duration_ms: idxMs,
    });
    db.updateAvgMetric('avg_index_ms', idxMs);

    const indexedPage = db.getPage(pageId);
    await telegram.notifyPageIndexed({ ...indexedPage, duration_ms: idxMs });
    logger.info('Page indexed', { pageId, url });
  } catch (err) {
    // Indexing failure is non-fatal (page is still published)
    db.updatePage(pageId, { status: 'index_failed', error: err.message });
    const failPage = db.getPage(pageId);
    await telegram.notifyIndexingFailed(failPage, err.message);
    logger.error('Indexing failed permanently', { pageId, error: err.message });
    // Continue to workflow complete notification
  }

  // --- Complete ---
  const totalMs = Date.now() - workflowStart;
  const finalPage = db.getPage(pageId);
  await telegram.notifyWorkflowCompleted({ ...finalPage, duration_ms: totalMs });
  await git.autoCommitWorkflowResult(finalPage, 'published');

  logger.info('Workflow complete', { pageId, totalMs, url: publishResult.url });
  return { success: true, pageId, url: publishResult.url };
}

/**
 * Runs a full batch: generates topic ideas then processes each one.
 */
async function runBatch() {
  logger.info('Starting content batch', { count: config.anthropic.pagesPerRun });

  let topics;
  try {
    topics = await contentGenerator.generateTopicIdeas(config.anthropic.pagesPerRun);
  } catch (err) {
    await telegram.notifyWorkflowError({ website: WEBSITE, project: PROJECT }, `Failed to generate topic ideas: ${err.message}`);
    logger.error('Topic generation failed', { error: err.message });
    return;
  }

  const results = [];
  for (const topic of topics) {
    try {
      const result = await runContentWorkflow(topic);
      results.push({ topic, ...result });
      // Small cooldown between pages to respect API rate limits
      await retry.sleep(3000);
    } catch (err) {
      logger.error('Unhandled workflow error', { topic, error: err.message });
      await telegram.notifyWorkflowError({ website: WEBSITE, project: PROJECT }, err.message);
      results.push({ topic, success: false, error: err.message });
    }
  }

  const passed = results.filter(r => r.success).length;
  logger.info('Batch complete', { total: topics.length, passed, failed: topics.length - passed });
  return results;
}

module.exports = { runContentWorkflow, runBatch };
