'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const logger = require('./Logger');

let client;

function getClient() {
  if (client) return client;
  if (!config.anthropic.apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

/**
 * Generates a local SEO landing page for a city + service combination.
 * Returns full page data including schema, FAQs, and meta tags.
 */
async function generateLandingPage({ city, state, keyword, serviceType }) {
  const c = getClient();
  const location = `${city}, ${state}`;
  logger.info('Generating landing page', { city, state, keyword, serviceType });

  const prompt = `You are an expert local SEO content writer for Mandy's Laundry, a premium laundry and dry cleaning service.

Generate a complete, SEO-optimized landing page for: "${keyword} in ${location}"
Service Type: ${serviceType}
Business: Mandy's Laundry

Return ONLY a JSON object with these exact keys:
{
  "title": "SEO page title including city and service keyword (55-60 chars)",
  "slug": "url-slug-with-city-and-service-keyword",
  "metaTitle": "Meta title (55-60 chars, include primary keyword and city)",
  "metaDescription": "Compelling meta description (145-155 chars, include CTA and city)",
  "h1": "Page H1 headline with city and service (compelling, keyword-rich)",
  "content": "Full HTML page content (900-1200 words). Use <h2>, <h3>, <p>, <ul>, <strong> tags. Mention ${city} naturally 4-6 times. Cover: what we offer, why choose us, our process, service areas near ${city}, testimonials section placeholder.",
  "faqs": [
    {"question": "FAQ about ${serviceType} in ${city}?", "answer": "Detailed helpful answer."},
    {"question": "How much does ${serviceType} cost in ${city}?", "answer": "Pricing answer."},
    {"question": "How fast is ${serviceType} in ${city}?", "answer": "Turnaround answer."},
    {"question": "Do you offer pickup and delivery in ${city}?", "answer": "Pickup/delivery answer."},
    {"question": "What areas near ${city} do you serve?", "answer": "Service area answer."}
  ],
  "keywords": ["${keyword} ${city}", "${serviceType} ${city}", "${serviceType} near me", "${city} laundry service", "best ${serviceType} ${city} ${state}"],
  "internalLinks": [
    {"text": "our dry cleaning services", "href": "/dry-cleaning"},
    {"text": "wash and fold pickup", "href": "/wash-and-fold"},
    {"text": "commercial laundry services", "href": "/commercial-laundry"},
    {"text": "laundry pricing", "href": "/pricing"}
  ],
  "openGraph": {
    "title": "OG title for social sharing",
    "description": "OG description (1-2 sentences)",
    "type": "website"
  },
  "seoScore": 85
}`;

  const message = await c.messages.create({
    model: config.anthropic.model,
    max_tokens: 3500,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI response did not contain valid JSON for landing page');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.title || !parsed.content) throw new Error('AI response missing required landing page fields');

  const siteUrl = config.google.siteUrl;

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: "Mandy's Laundry",
    description: parsed.metaDescription,
    url: `${siteUrl}/${parsed.slug}`,
    telephone: config.google.siteUrl ? undefined : '+1-800-MANDYS',
    address: {
      '@type': 'PostalAddress',
      addressLocality: city,
      addressRegion: state,
      addressCountry: 'US',
    },
    areaServed: { '@type': 'City', name: city },
    serviceType: serviceType,
    priceRange: '$$',
  };

  const faqSchema = parsed.faqs && parsed.faqs.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: parsed.faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  } : null;

  logger.info('Landing page generated', {
    city,
    service: serviceType,
    title: parsed.title,
    seoScore: parsed.seoScore,
  });

  return { ...parsed, city, state, serviceType, localBusinessSchema, faqSchema };
}

/**
 * Builds the full WordPress-ready HTML content block for a landing page.
 */
function buildPageHTML(page) {
  const schemaScripts = [
    page.localBusinessSchema
      ? `<!-- LocalBusiness Schema -->\n<script type="application/ld+json">${JSON.stringify(page.localBusinessSchema, null, 2)}</script>`
      : '',
    page.faqSchema
      ? `<!-- FAQ Schema -->\n<script type="application/ld+json">${JSON.stringify(page.faqSchema, null, 2)}</script>`
      : '',
  ].filter(Boolean).join('\n\n');

  const faqHTML = page.faqs && page.faqs.length
    ? `\n\n<section class="faq-section">\n<h2>Frequently Asked Questions About ${page.serviceType} in ${page.city}</h2>\n${
        page.faqs.map(faq =>
          `<div class="faq-item">\n<h3>${faq.question}</h3>\n<p>${faq.answer}</p>\n</div>`
        ).join('\n')
      }\n</section>`
    : '';

  const ogTags = page.openGraph
    ? `<!-- Open Graph -->\n<!-- og:title: ${page.openGraph.title} -->\n<!-- og:description: ${page.openGraph.description} -->`
    : '';

  return `${schemaScripts}\n\n${page.content}${faqHTML}\n\n${ogTags}`.trim();
}

module.exports = { generateLandingPage, buildPageHTML };
