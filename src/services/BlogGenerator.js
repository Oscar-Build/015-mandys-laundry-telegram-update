'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const logger = require('./Logger');
const { sanitizeInternalLinks } = require('./linkSanitizer');

const ALLOWED_HREFS = ['/', '/wash-and-fold', '/dry-cleaning', '/pickup-delivery', '/pricing', '/contact'];

let client;

function getClient() {
  if (client) return client;
  if (!config.anthropic.apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

/**
 * Generates a full SEO blog post with schema, internal links, and scoring.
 */
async function generateBlogPost(topic) {
  const c = getClient();
  logger.info('Generating blog post', { topic, model: config.anthropic.model });

  const priorityKeywords = config.seo.priorityKeywords;

  const prompt = `You are an expert SEO content strategist for Mandy's Laundry, a premium laundry and dry cleaning service.

Write a complete, SEO-optimized blog post about: "${topic}"
Niche: ${config.anthropic.niche}
Business: Mandy's Laundry

SEO priority: these high-value phrases currently rank too low to get clicks — naturally work at
least one of them into the meta description and the body content (only where it genuinely fits
the topic, never forced): ${priorityKeywords.join(', ')}

Internal linking is required, not optional: the "content" HTML must include 3-5 inline <a href="...">
links with descriptive anchor text, woven naturally into sentences (not a bare list at the end).
Each href must appear only ONCE in the whole article — no repeated links. Include exactly one link
to href="/" using anchor text containing one of the priority phrases above (e.g. <a href="/">laundromat
near me</a>) wherever it fits the topic naturally. Pick 2-4 more DIFFERENT hrefs from: /wash-and-fold,
/dry-cleaning, /pickup-delivery, /pricing, /contact.

Return ONLY a JSON object with these exact keys:
{
  "title": "SEO-optimized blog title (55-60 chars, include primary keyword)",
  "slug": "url-friendly-slug-with-primary-keyword",
  "metaTitle": "Meta title tag (55-60 chars, primary keyword near front)",
  "metaDescription": "Compelling meta description with CTA (145-155 chars)",
  "primaryKeyword": "main target keyword phrase",
  "secondaryKeywords": ["keyword2", "keyword3", "keyword4", "keyword5 (include a priority phrase above if relevant)"],
  "entities": ["Named entity 1", "Named entity 2", "Named entity 3"],
  "headings": [
    {"level": "h2", "text": "Introduction or What is heading"},
    {"level": "h2", "text": "Main benefit or how-to heading"},
    {"level": "h3", "text": "Sub-point heading"},
    {"level": "h2", "text": "Tips or steps heading"},
    {"level": "h2", "text": "Why choose Mandy's Laundry heading"},
    {"level": "h2", "text": "Conclusion heading"}
  ],
  "content": "Full HTML blog post (1200-1800 words) INCLUDING the required inline <a href> internal links described above. Use <h2>, <h3>, <p>, <ul>, <ol>, <strong>, <em> tags. Naturally include the primary keyword 4-6 times. Write in a friendly, helpful, in-depth tone for homeowners. Cover the topic thoroughly with actionable tips, examples, and details.",
  "internalLinks": [
    {"text": "laundromat near me", "href": "/"},
    {"text": "wash and fold service", "href": "/wash-and-fold"},
    {"text": "dry cleaning near you", "href": "/dry-cleaning"},
    {"text": "laundry pickup and delivery", "href": "/pickup-delivery"},
    {"text": "our pricing", "href": "/pricing"}
  ],
  "callToAction": "<p>Ready to experience the best laundry service in your area? <a href='/contact'>Book your first pickup today</a> and let Mandy's Laundry handle the rest. New customers get 20% off their first order!</p>",
  "articleSection": "Laundry Tips",
  "featuredImagePrompt": "Photorealistic image of [specific visual description related to the topic], bright lighting, clean modern laundry setting, professional photography style",
  "estimatedReadTime": 5,
  "seoScore": 82
}`;

  const message = await c.messages.create({
    model: config.anthropic.model,
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI response did not contain valid JSON for blog post');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.title || !parsed.content) throw new Error('AI response missing required blog fields');

  parsed.content = sanitizeInternalLinks(parsed.content, ALLOWED_HREFS);

  const siteUrl = config.google.siteUrl;
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: parsed.title,
    description: parsed.metaDescription,
    author: { '@type': 'Organization', name: "Mandy's Laundry" },
    publisher: {
      '@type': 'Organization',
      name: "Mandy's Laundry",
      url: siteUrl,
    },
    datePublished: new Date().toISOString(),
    dateModified: new Date().toISOString(),
    articleSection: parsed.articleSection || 'Laundry Tips',
    keywords: [parsed.primaryKeyword, ...(parsed.secondaryKeywords || [])].join(', '),
    url: `${siteUrl}/blog/${parsed.slug}`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${siteUrl}/blog/${parsed.slug}` },
  };

  logger.info('Blog post generated', {
    title: parsed.title,
    primaryKeyword: parsed.primaryKeyword,
    seoScore: parsed.seoScore,
    wordCount: parsed.content.split(' ').length,
  });

  return { ...parsed, articleSchema };
}

/**
 * Generates SEO topic ideas for the next blog batch.
 */
async function generateTopicIdeas(count = 5) {
  const c = getClient();
  const priorityKeywords = config.seo.priorityKeywords;
  const priorityCount = Math.max(1, Math.round(count * 0.2));

  const message = await c.messages.create({
    model: config.anthropic.model,
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Generate ${count} unique, high-value SEO blog post topic ideas for a laundry service website.
Target long-tail keywords with informational or local SEO intent.
Niche: ${config.anthropic.niche}
Return ONLY a JSON array of strings: ["topic 1", "topic 2", ...]
Include: how-to guides, comparison posts, local topics, problem-solving, fabric care tips.

Exactly ${priorityCount} of the topics must directly target one of these underperforming
high-value phrases as their core subject (e.g. "How to Choose a Laundromat Near Me: 7 Things
to Check" or "Laundry Service Near Me vs Doing It Yourself: Real Cost Breakdown"): ${priorityKeywords.join(', ')}`,
    }],
  });

  const raw = message.content[0].text.trim();
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Failed to parse topic ideas from AI response');
  return JSON.parse(match[0]);
}

/**
 * Generates AI recommendations for improving an existing page's SEO.
 */
async function generateSEORecommendations(pageData) {
  const c = getClient();
  const prompt = `You are an SEO expert. Analyze this page and provide 3-5 specific, actionable recommendations to improve its SEO.

Page title: ${pageData.title || 'Unknown'}
URL: ${pageData.url || 'Unknown'}
Word count: ~${pageData.wordCount || 'Unknown'}
Known issues: ${pageData.issues ? pageData.issues.map(i => i.type).join(', ') : 'None identified'}

Return ONLY a JSON array of recommendation objects:
[{"priority": "high|medium|low", "issue": "issue name", "recommendation": "specific action to take", "impact": "expected improvement"}]`;

  const message = await c.messages.create({
    model: config.anthropic.model,
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim();
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

/**
 * Builds the WordPress-ready HTML for a blog post including schema.
 */
function buildBlogHTML(post) {
  const schemaScript = `<!-- Article Schema -->\n<script type="application/ld+json">${JSON.stringify(post.articleSchema, null, 2)}</script>`;
  const cta = post.callToAction ? `\n\n<div class="cta-block">${post.callToAction}</div>` : '';
  const imageNote = post.featuredImagePrompt
    ? `\n\n<!-- Featured Image Prompt: ${post.featuredImagePrompt} -->`
    : '';

  return `${schemaScript}\n\n${post.content}${cta}${imageNote}`.trim();
}

module.exports = { generateBlogPost, generateTopicIdeas, generateSEORecommendations, buildBlogHTML };
