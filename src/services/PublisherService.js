'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('./Logger');
const imageService = require('./FeaturedImageService');

function getAuthHeader() {
  if (!config.wordpress.username || !config.wordpress.appPassword) {
    throw new Error('WordPress credentials not configured (WORDPRESS_USERNAME / WORDPRESS_APP_PASSWORD)');
  }
  const token = Buffer.from(`${config.wordpress.username}:${config.wordpress.appPassword}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

/**
 * Publishes a page to WordPress via the REST API.
 * Optionally uploads a featured image from the imageUrl field.
 * Returns { postId, url, status }
 */
async function publishPage(pageData) {
  const { title, slug, content, metaDescription, keywords, imageUrl, imageTopic } = pageData;

  if (!config.wordpress.apiUrl) {
    throw new Error('WORDPRESS_API_URL not configured');
  }

  // Upload featured image (non-fatal — post publishes even if image fails)
  let featuredMediaId = null;
  if (imageUrl) {
    const uploaded = await imageService.uploadToWordPress(imageUrl, slug || title, title);
    if (uploaded) featuredMediaId = uploaded.mediaId;
  }

  const payload = {
    title,
    slug,
    content,
    status: 'publish',
    excerpt: metaDescription,
    meta: {
      _yoast_wpseo_metadesc: metaDescription,
      _yoast_wpseo_focuskw: keywords ? keywords[0] : '',
    },
    ...(featuredMediaId ? { featured_media: featuredMediaId } : {}),
  };

  logger.info('Publishing page to WordPress', { title, slug, hasFeaturedImage: !!featuredMediaId });

  const response = await axios.post(`${config.wordpress.apiUrl}/posts`, payload, {
    headers: {
      ...getAuthHeader(),
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  const post = response.data;
  const result = {
    postId: post.id,
    url: post.link,
    status: post.status,
    featuredMediaId,
  };

  logger.info('Page published successfully', result);
  return result;
}

/**
 * Checks if a page with the given slug already exists to prevent duplicates.
 */
async function pageExists(slug) {
  if (!config.wordpress.apiUrl) return false;
  try {
    const res = await axios.get(`${config.wordpress.apiUrl}/posts`, {
      params: { slug, status: 'publish' },
      headers: getAuthHeader(),
      timeout: 10000,
    });
    return res.data && res.data.length > 0;
  } catch (err) {
    logger.warn('Could not check for duplicate page', { slug, error: err.message });
    return false;
  }
}

module.exports = { publishPage, pageExists };
