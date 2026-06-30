'use strict';

/**
 * Selects and uploads a featured image to WordPress.
 * Uses curated Pexels CDN URLs — no API key required, free for commercial use.
 */

const axios = require('axios');
const config = require('../config');
const logger = require('./Logger');

// Curated Pexels photo IDs grouped by topic.
// Pexels CDN is publicly accessible; images are free for commercial use.
const SETS = {
  hotel: [
    '7251879', '6185581', '6186833', '5999960', '2795036',
  ],
  dryCleaning: [
    '3985338', '4040294', '6823826', '5591597',
  ],
  airbnb: [
    '1457842', '3288100', '4112547', '6186833',
  ],
  athletic: [
    '2204196', '4753885', '4327143', '2607585',
  ],
  stainRemoval: [
    '5591663', '4792693', '5591664', '4039777',
  ],
  default: [
    '5591663', '4039777', '3874928', '4792693', '5591664',
    '3785581', '4062423', '6823823', '3962285', '4440128',
  ],
};

function pexelsUrl(id, w = 1200, h = 628) {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}&h=${h}&dpr=1`;
}

function pickSet(topic) {
  const t = (topic || '').toLowerCase();
  if (/hotel|hospitality|linen|resort/.test(t))      return SETS.hotel;
  if (/dry.clean|ironing|press/.test(t))             return SETS.dryCleaning;
  if (/airbnb|vrbo|rental|vacation/.test(t))         return SETS.airbnb;
  if (/athletic|fitness|gym|sport|activewear/.test(t)) return SETS.athletic;
  if (/stain|remove|odor/.test(t))                   return SETS.stainRemoval;
  return SETS.default;
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0x7fffffff;
  return h;
}

/**
 * Returns a Pexels image URL picked deterministically from the topic.
 */
function getImageUrl(topic, slug) {
  const set  = pickSet(topic);
  const seed = hashSeed(slug || topic || 'laundry');
  const id   = set[seed % set.length];
  return pexelsUrl(id);
}

/**
 * Downloads an image and uploads it to the WordPress media library.
 * Returns { mediaId, sourceUrl } or null on failure.
 */
async function uploadToWordPress(imageUrl, filename, altText) {
  const wpApiUrl   = config.wordpress.apiUrl;
  const wpUser     = config.wordpress.username;
  const wpPassword = config.wordpress.appPassword;

  if (!wpApiUrl || !wpUser || !wpPassword) return null;

  const authHeader = 'Basic ' + Buffer.from(`${wpUser}:${wpPassword}`).toString('base64');

  try {
    // 1. Download image
    const imgRes = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 20000,
      maxRedirects: 5,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MandysBot/1.0)' },
    });

    const contentType = imgRes.headers['content-type'] || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const safeFilename = filename.replace(/[^a-z0-9-]/gi, '-').toLowerCase() + `.${ext}`;

    // 2. Upload to WordPress
    const mediaRes = await axios.post(`${wpApiUrl}/media`, imgRes.data, {
      headers: {
        Authorization: authHeader,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': imgRes.data.byteLength,
      },
      timeout: 30000,
      maxBodyLength: Infinity,
    });

    const mediaId = mediaRes.data?.id;
    if (!mediaId) return null;

    // 3. Set alt text
    await axios.post(`${wpApiUrl}/media/${mediaId}`,
      { alt_text: altText, caption: '' },
      { headers: { Authorization: authHeader, 'Content-Type': 'application/json' }, timeout: 10000 }
    ).catch(() => {}); // non-fatal

    logger.info('Featured image uploaded', { mediaId, filename: safeFilename });
    return { mediaId, sourceUrl: mediaRes.data?.source_url };
  } catch (err) {
    logger.warn('Featured image upload failed', { imageUrl, error: err.message });
    return null;
  }
}

/**
 * Returns an <img> HTML tag suitable for embedding at the top of post content.
 * Used as a fallback when WordPress media upload is not needed.
 */
function buildImageHTML(imageUrl, altText) {
  return `<figure class="wp-block-image size-full" style="margin:0 0 2rem;padding:0">
  <img src="${imageUrl}" alt="${altText}" style="width:100%;max-height:480px;object-fit:cover;border-radius:6px;display:block" loading="eager" decoding="async" />
</figure>\n\n`;
}

module.exports = { getImageUrl, uploadToWordPress, buildImageHTML };
