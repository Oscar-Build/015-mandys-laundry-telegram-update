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
 * Full pipeline for one blog post: generate → publish → index.
 */
async function runBlogWorkflow(topic) {
  const pageId = uuidv4();
  logger.info('Starting blog workflow', { topic });

  db.createPage({ id: pageId, website: WEBSITE, project: PROJECT, title: topic, slug: '' });
  await telegram.notifyPageCreated({ id: pageId, website: WEBSITE, project: PROJECT, title: topic });
  db.incrementMetric('pages_created');

  // Generate
  let postData;
  try {
    const genStart = Date.now();
    postData = await retry.withRetry(
      () => blogGen.generateBlogPost(topic),
      { page: { id: pageId, website: WEBSITE, project: PROJECT, title: topic }, label: 'blog generation' }
    );
    const genMs = Date.now() - genStart;

    db.updatePage(pageId, {
      title: postData.title,
      slug: postData.slug,
      status: 'content_generated',
      content_generated_at: new Date().toISOString(),
      duration_ms: genMs,
    });
    await telegram.notifyContentGenerated({ ...db.getPage(pageId), duration_ms: genMs });
  } catch (err) {
    db.updatePage(pageId, { status: 'generation_failed', error: err.message });
    await telegram.notifyGenerationFailed({ id: pageId, website: WEBSITE, project: PROJECT, title: topic }, err.message);
    return { success: false, stage: 'generation', error: err.message };
  }

  // Duplicate check
  try {
    const exists = await publisher.pageExists(postData.slug);
    if (exists) {
      db.updatePage(pageId, { status: 'skipped_duplicate' });
      return { success: true, stage: 'skipped_duplicate' };
    }
  } catch (_) {}

  // Publish
  let publishResult;
  try {
    const pubStart = Date.now();
    const imageUrl = imageService.getImageUrl(topic, postData.slug);
    const imageHTML = imageService.buildImageHTML(imageUrl, postData.title);
    const fullHTML = imageHTML + blogGen.buildBlogHTML(postData);
    publishResult = await retry.withRetry(
      () => publisher.publishPage({
        title: postData.title,
        slug: postData.slug,
        content: fullHTML,
        metaDescription: postData.metaDescription,
        keywords: [postData.primaryKeyword, ...(postData.secondaryKeywords || [])],
        imageUrl,
      }),
      { page: { id: pageId, website: WEBSITE, project: PROJECT, title: postData.title }, label: 'blog publish' }
    );
    const pubMs = Date.now() - pubStart;

    db.updatePage(pageId, {
      title: postData.title,
      url: publishResult.url,
      status: 'published',
      published_at: new Date().toISOString(),
      duration_ms: pubMs,
    });
    db.updateAvgMetric('avg_publish_ms', pubMs);
    db.incrementMetric('pages_published');
    await telegram.notifyPagePublished({ ...db.getPage(pageId), duration_ms: pubMs });
  } catch (err) {
    db.updatePage(pageId, { status: 'publish_failed', error: err.message });
    await telegram.notifyPublishFailed(db.getPage(pageId) || { id: pageId, website: WEBSITE, project: PROJECT, title: topic }, err.message);
    return { success: false, stage: 'publishing', error: err.message };
  }

  // Index
  try {
    const idxStart = Date.now();
    await telegram.notifyIndexingSubmitted({ ...db.getPage(pageId), url: publishResult.url });
    await retry.withRetry(
      () => indexer.submitForIndexing(publishResult.url),
      { page: db.getPage(pageId), label: 'blog indexing' }
    );
    const idxMs = Date.now() - idxStart;
    db.updatePage(pageId, { status: 'indexed', indexed_at: new Date().toISOString(), duration_ms: idxMs });
    db.updateAvgMetric('avg_index_ms', idxMs);
    db.incrementMetric('pages_indexed');
    await telegram.notifyPageIndexed({ ...db.getPage(pageId), duration_ms: idxMs });
  } catch (err) {
    db.updatePage(pageId, { status: 'index_failed', error: err.message });
    await telegram.notifyIndexingFailed(db.getPage(pageId), err.message);
  }

  const finalPage = db.getPage(pageId);
  await telegram.notifyWorkflowCompleted({ ...finalPage, url: publishResult.url });

  return { success: true, pageId, url: publishResult.url };
}

/**
 * Batch: generates topic ideas and runs a blog workflow for each.
 */
async function runBlogBatch() {
  const count = config.anthropic.pagesPerRun;
  logger.info('Running blog batch', { count });

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
      await retry.sleep(3000);
    } catch (err) {
      logger.error('Blog workflow error', { topic, error: err.message });
      results.push({ topic, success: false, error: err.message });
    }
  }

  const passed = results.filter(r => r.success).length;
  await telegram.sendBatchSummary('Blog Posts', topics.length, passed);
  return results;
}

module.exports = { runLandingPageBatch, runLandingPageWorkflow, runBlogBatch, runBlogWorkflow };
