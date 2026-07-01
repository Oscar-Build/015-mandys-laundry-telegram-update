'use strict';

const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../services/Logger');
const db = require('../services/Database');
const telegram = require('../services/TelegramService');
const retry = require('../services/RetryService');
const publisher = require('../services/PublisherService');
const indexer = require('../services/IndexingService');
const landingPageGen = require('../services/LandingPageGenerator');
const blogGen = require('../services/BlogGenerator');
const imageService = require('../services/FeaturedImageService');

const WEBSITE = "Mandy's Laundry";
const PROJECT = 'mandys-laundry-content';

// ---------- Landing Pages ----------

/**
 * Full pipeline for one local landing page: generate → publish → index.
 */
async function runLandingPageWorkflow({ city, state, keyword, serviceType }) {
  const pageId = uuidv4();
  const location = `${city}, ${state}`;
  logger.info('Starting landing page workflow', { city, state, keyword });

  db.createLandingPage({ id: pageId, city, state, keyword, serviceType });

  // Generate
  let pageData;
  try {
    pageData = await retry.withRetry(
      () => landingPageGen.generateLandingPage({ city, state, keyword, serviceType }),
      { page: { id: pageId, website: WEBSITE, project: PROJECT, title: `${keyword} ${location}` }, label: 'landing page generation' }
    );

    db.updateLandingPage(pageId, {
      title: pageData.title,
      slug: pageData.slug,
      meta_description: pageData.metaDescription,
      schema_json: JSON.stringify(pageData.localBusinessSchema),
      faq_json: JSON.stringify(pageData.faqs),
      internal_links_json: JSON.stringify(pageData.internalLinks),
      seo_score: pageData.seoScore || null,
      status: 'generated',
    });
  } catch (err) {
    db.updateLandingPage(pageId, { status: 'generation_failed', error: err.message });
    await telegram.notifyWorkflowError({ website: WEBSITE, project: PROJECT }, `Landing page gen failed [${location}]: ${err.message}`);
    return { success: false, stage: 'generation', error: err.message };
  }

  // Duplicate check
  try {
    const exists = await publisher.pageExists(pageData.slug);
    if (exists) {
      db.updateLandingPage(pageId, { status: 'skipped_duplicate', url: `${config.google.siteUrl}/${pageData.slug}` });
      logger.info('Landing page already exists, skipping', { slug: pageData.slug });
      return { success: true, stage: 'skipped_duplicate', slug: pageData.slug };
    }
  } catch (_) {}

  // Publish
  let publishResult;
  try {
    const imageUrl = imageService.getImageUrl(`${keyword} ${city}`, pageData.slug);
    const imageHTML = imageService.buildImageHTML(imageUrl, pageData.title);
    const fullHTML = imageHTML + landingPageGen.buildPageHTML(pageData);
    publishResult = await retry.withRetry(
      () => publisher.publishPage({
        title: pageData.title,
        slug: pageData.slug,
        content: fullHTML,
        metaDescription: pageData.metaDescription,
        keywords: pageData.keywords,
        imageUrl,
      }),
      { page: { id: pageId, website: WEBSITE, project: PROJECT, title: pageData.title }, label: 'landing page publish' }
    );

    db.updateLandingPage(pageId, {
      wp_post_id: publishResult.postId,
      url: publishResult.url,
      status: 'published',
      published_at: new Date().toISOString(),
    });
    db.incrementMetric('pages_published');

    await telegram.notifyLandingPagePublished({
      id: pageId, city, state, serviceType,
      title: pageData.title, url: publishResult.url,
    });
    logger.info('Landing page published', { city, url: publishResult.url });
  } catch (err) {
    db.updateLandingPage(pageId, { status: 'publish_failed', error: err.message });
    await telegram.notifyWorkflowError({ website: WEBSITE, project: PROJECT }, `Landing page publish failed [${location}]: ${err.message}`);
    return { success: false, stage: 'publishing', error: err.message };
  }

  // Index
  try {
    await indexer.submitForIndexing(publishResult.url);
    db.updateLandingPage(pageId, { status: 'indexed', indexed_at: new Date().toISOString() });
    db.incrementMetric('pages_indexed');
    logger.info('Landing page indexed', { url: publishResult.url });
  } catch (err) {
    logger.warn('Landing page indexing failed (non-fatal)', { url: publishResult.url, error: err.message });
  }

  return { success: true, pageId, url: publishResult.url, city, serviceType };
}

/**
 * Batch: generates landing pages for all unpublished city × service combinations.
 */
async function runLandingPageBatch() {
  const cities = config.seo.targetCities;
  const services = config.seo.targetServices;
  const state = config.seo.targetState;
  const perRun = config.anthropic.landingPagesPerRun;

  const existingSlugs = new Set(db.getPublishedLandingPageSlugs());

  const pending = [];
  for (const city of cities) {
    for (const service of services) {
      const slug = `${service.replace(/\s+/g, '-')}-${city.toLowerCase().replace(/\s+/g, '-')}`;
      if (!existingSlugs.has(slug)) {
        pending.push({ city, state, keyword: service, serviceType: service });
      }
    }
  }

  const batch = pending.slice(0, perRun);
  logger.info('Landing page batch', { pending: pending.length, thisBatch: batch.length });

  if (batch.length === 0) {
    logger.info('All landing pages already published');
    return [];
  }

  const results = [];
  for (const item of batch) {
    try {
      const r = await runLandingPageWorkflow(item);
      results.push({ ...item, ...r });
      await retry.sleep(4000);
    } catch (err) {
      logger.error('Landing page batch error', { city: item.city, error: err.message });
      results.push({ ...item, success: false, error: err.message });
    }
  }

  const passed = results.filter(r => r.success).length;
  await telegram.sendBatchSummary('Landing Pages', batch.length, passed);
  return results;
}

// ---------- Blog Posts ----------

/**
 * STAGE 1 — Generate only: creates content via Claude and saves to DB.
 * Does NOT publish to WordPress. Runs at 6 AM.
 */
async function runBlogWorkflow(topic) {
  const pageId = uuidv4();
  logger.info('Starting blog generation', { topic });

  db.createPage({ id: pageId, website: WEBSITE, project: PROJECT, title: topic, slug: '' });
  db.incrementMetric('pages_created');

  let postData;
  try {
    const genStart = Date.now();
    postData = await retry.withRetry(
      () => blogGen.generateBlogPost(topic),
      { page: { id: pageId, website: WEBSITE, project: PROJECT, title: topic }, label: 'blog generation' }
    );
    const genMs = Date.now() - genStart;

    const imageUrl = imageService.getImageUrl(topic, postData.slug);
    const imageHTML = imageService.buildImageHTML(imageUrl, postData.title);
    const fullHTML = imageHTML + blogGen.buildBlogHTML(postData);

    db.updatePage(pageId, {
      title: postData.title,
      slug: postData.slug,
      status: 'content_generated',
      content_generated_at: new Date().toISOString(),
      duration_ms: genMs,
      generated_data: JSON.stringify({
        title: postData.title,
        slug: postData.slug,
        fullHTML,
        metaDescription: postData.metaDescription,
        primaryKeyword: postData.primaryKeyword,
        secondaryKeywords: postData.secondaryKeywords || [],
        imageUrl,
      }),
    });
  } catch (err) {
    db.updatePage(pageId, { status: 'generation_failed', error: err.message });
    return { success: false, stage: 'generation', error: err.message };
  }

  return { success: true, pageId, stage: 'generated' };
}

/**
 * STAGE 2 — Publish one content_generated page to WordPress.
 */
async function runPublishBlogPost(page) {
  if (!page.generated_data) return { success: false, error: 'No generated data' };
  let data;
  try { data = JSON.parse(page.generated_data); } catch (_) {
    return { success: false, error: 'Invalid generated data' };
  }

  // Duplicate check
  try {
    const exists = await publisher.pageExists(data.slug);
    if (exists) {
      db.updatePage(page.id, { status: 'skipped_duplicate' });
      return { success: true, stage: 'skipped_duplicate' };
    }
  } catch (_) {}

  // Publish
  let publishResult;
  try {
    const pubStart = Date.now();
    publishResult = await retry.withRetry(
      () => publisher.publishPage({
        title: data.title,
        slug: data.slug,
        content: data.fullHTML,
        metaDescription: data.metaDescription,
        keywords: [data.primaryKeyword, ...(data.secondaryKeywords || [])],
        imageUrl: data.imageUrl,
      }),
      { page: { id: page.id, website: WEBSITE, project: PROJECT, title: data.title }, label: 'blog publish' }
    );
    const pubMs = Date.now() - pubStart;

    db.updatePage(page.id, {
      url: publishResult.url,
      status: 'published',
      published_at: new Date().toISOString(),
      duration_ms: pubMs,
    });
    db.updateAvgMetric('avg_publish_ms', pubMs);
    db.incrementMetric('pages_published');
    await telegram.notifyPagePublished({ ...db.getPage(page.id), duration_ms: pubMs });
  } catch (err) {
    db.updatePage(page.id, { status: 'publish_failed', error: err.message });
    return { success: false, error: err.message };
  }

  return { success: true, pageId: page.id, url: publishResult.url };
}

/**
 * STAGE 2 batch — Picks up to PUBLISH_PER_RUN content_generated posts and publishes them.
 * Runs at 7 AM.
 */
async function runPublishBatch() {
  const limit = config.anthropic.publishPerRun;
  const pages = db.getContentGeneratedPages(limit);
  logger.info('Running publish batch', { queued: pages.length, limit });

  if (pages.length === 0) {
    logger.info('No content in queue to publish');
    await telegram.send('📭 Publish batch: no content in queue yet (generation may still be running)');
    return { total: 0, passed: 0 };
  }

  let passed = 0;
  for (const page of pages) {
    try {
      const r = await runPublishBlogPost(page);
      if (r.success) passed++;
    } catch (err) {
      logger.error('Publish batch error', { pageId: page.id, error: err.message });
    }
    await retry.sleep(3000);
  }

  await telegram.sendBatchSummary('Published', pages.length, passed);
  return { total: pages.length, passed };
}

/**
 * STAGE 3 — Index batch: picks published-but-not-indexed pages and submits to Google.
 * Runs every hour.
 */
async function runIndexBatch() {
  const limit = config.anthropic.indexPerRun;
  const pages = db.getPublishedUnindexedPages(limit);
  logger.info('Running index batch', { count: pages.length });

  if (pages.length === 0 || !indexer.isConfigured()) return { total: 0, passed: 0 };

  let passed = 0;
  for (const page of pages) {
    try {
      await telegram.notifyIndexingSubmitted(db.getPage(page.id) || page);
      await indexer.submitForIndexing(page.url);
      db.updatePage(page.id, { status: 'indexed', indexed_at: new Date().toISOString() });
      db.incrementMetric('pages_indexed');
      await telegram.notifyPageIndexed(db.getPage(page.id) || page);
      passed++;
    } catch (err) {
      db.updatePage(page.id, { status: 'index_failed', error: err.message });
    }
    await retry.sleep(2000);
  }

  logger.info('Index batch complete', { total: pages.length, passed });
  return { total: pages.length, passed };
}

/**
 * STAGE 1 batch — Generates PAGES_PER_RUN (30) topic ideas and saves content to DB.
 * Runs at 6 AM. Does NOT publish — that is handled by runPublishBatch at 7 AM.
 */
async function runBlogBatch() {
  const count = config.anthropic.pagesPerRun;
  logger.info('Running blog generate batch', { count });

  let topics;
  try {
    topics = await blogGen.generateTopicIdeas(count);
  } catch (err) {
    await telegram.notifyWorkflowError({ website: WEBSITE, project: PROJECT }, `Topic generation failed: ${err.message}`);
    return [];
  }

  const results = [];
  for (const topic of topics) {
    try {
      const r = await runBlogWorkflow(topic);
      results.push({ topic, ...r });
      await retry.sleep(2000);
    } catch (err) {
      logger.error('Blog generation error', { topic, error: err.message });
      results.push({ topic, success: false, error: err.message });
    }
  }

  const passed = results.filter(r => r.success).length;
  await telegram.send(
    `✍️ <b>Content Generation Complete</b>\n\n` +
    `📝 Generated: ${passed}/${topics.length} blog posts\n` +
    `🕐 Publishing starts at 7:00 AM PST (10 posts)\n` +
    `📈 Indexing runs hourly (up to 20 pages)`
  );
  return results;
}

module.exports = {
  runLandingPageBatch, runLandingPageWorkflow,
  runBlogBatch, runBlogWorkflow,
  runPublishBatch, runPublishBlogPost,
  runIndexBatch,
};
