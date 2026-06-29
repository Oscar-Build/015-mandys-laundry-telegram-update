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
 * Generates a complete SEO page for Mandy's Laundry.
 * Returns { title, slug, metaDescription, content, keywords }
 */
async function generatePage(topic, projectName) {
  const c = getClient();
  logger.info('Generating content', { topic, project: projectName, model: config.anthropic.model });

  const systemPrompt = `You are an expert SEO content writer for ${config.app.name}.
You write helpful, engaging, and SEO-optimized content about ${config.anthropic.niche}.
Always output valid JSON. Write in a friendly, professional tone for homeowners and families.`;

  const userPrompt = `Write a complete SEO blog post for Mandy's Laundry about: "${topic}"

Return ONLY a JSON object with these exact keys:
{
  "title": "SEO-optimized page title (60 chars max)",
  "slug": "url-friendly-slug-with-dashes",
  "metaDescription": "Meta description for search engines (155 chars max)",
  "content": "Full HTML blog post content (600-900 words). Use <h2>, <p>, <ul>, <strong> tags.",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`;

  const message = await c.messages.create({
    model: config.anthropic.model,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = message.content[0].text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI response did not contain valid JSON');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.title || !parsed.content) throw new Error('AI response missing required fields');

  logger.info('Content generated', { title: parsed.title, words: parsed.content.split(' ').length });
  return parsed;
}

/**
 * Returns a list of SEO topic ideas for the next batch.
 */
async function generateTopicIdeas(count = 5) {
  const c = getClient();
  const message = await c.messages.create({
    model: config.anthropic.model,
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Generate ${count} unique SEO blog post topic ideas for a laundry service website (${config.anthropic.niche}).
Return only a JSON array of strings: ["topic 1", "topic 2", ...]
Focus on practical tips, how-to guides, and local service topics.`,
    }],
  });

  const raw = message.content[0].text.trim();
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Failed to parse topic ideas');
  return JSON.parse(match[0]);
}

module.exports = { generatePage, generateTopicIdeas };
