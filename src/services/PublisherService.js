'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('./Logger');

function getAuthHeader() {
  if (!config.wordpress.username || !config.wordpress.appPassword) {
    throw new Error('WordPress credentials not configured (WORDPRESS_USERNAME / WORDPRESS_APP_PASSWORD)');
  }
  const token = Buffer.from(`${config.wordpress.username}:${config.wordpress.appPassword}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

/**
 * Publishes a page to WordPress via the REST API.
 * Returns { postId, url, status }
 */
async function publishPage(pageData) {
  const { title, slug, content, metaDescription, keywords } = pageData;

  if (!config.wordpress.apiUrl) {
    throw new Error('WORDPRESS_API_URL not configured');
  }

  const payload = {
    title,
    slug,
    content,
    status: 'publish',
    excerpt: metaDescription,
    // Yoast SEO meta (if Yoast REST API plugin is enabled)
    meta: {
      _yoast_wpseo_metadesc: metaDescription,
      _yoast_wpseo_focuskw: keywords ? keywords[0] : '',
    },
  };

  logger.info('Publishing page to WordPress', { title, slug });

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
