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
 * Generates a daily short-form video script (60–90 sec) for Mandy's Laundry.
 * Hook-first format optimized for TikTok, Instagram Reels, YouTube Shorts.
 */
async function generateVideoScript(topic = null) {
  const c = getClient();

  const scriptTopic = topic || await pickDailyTopic(c);

  logger.info('Generating video script', { topic: scriptTopic });

  const prompt = `You are a viral short-form video scriptwriter for Mandy's Laundry, a premium laundry and dry cleaning service.

Write a compelling 60–90 second video script about: "${scriptTopic}"

Rules:
- HOOK in the first 3 seconds — must stop the scroll (pattern interrupt, surprising fact, bold claim, or question)
- Conversational tone — speak TO the viewer, not at them
- Include a clear problem → solution → CTA structure
- End with: "Book your first pickup at mandyslaundry.com — new customers get 20% off"
- No repeated content — every script must be unique
- Write for a human presenter, not a robot

Return ONLY a JSON object:
{
  "title": "Video title for description (under 100 chars, includes keyword)",
  "hook": "The opening 3-second line (must be attention-grabbing)",
  "script": "Full word-for-word script (60-90 sec when spoken at normal pace)",
  "hashtags": ["#laundry", "#laundrytips", "#cleanclothes", "#mandyslaundry", "#washandfold"],
  "visualNotes": "Brief notes on what to show on screen during each section",
  "callToAction": "Final CTA line",
  "estimatedSeconds": 75
}`;

  const message = await c.messages.create({
    model: config.anthropic.model,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI response did not contain valid JSON for video script');

  const parsed = JSON.parse(match[0]);
  if (!parsed.script || !parsed.hook) throw new Error('Video script missing required fields');

  logger.info('Video script generated', { title: parsed.title, seconds: parsed.estimatedSeconds });
  return { ...parsed, topic: scriptTopic, generated_at: new Date().toISOString() };
}

async function pickDailyTopic(c) {
  const message = await c.messages.create({
    model: config.anthropic.model,
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Give me ONE unique, engaging video script topic for a laundry service short-form video (TikTok/Reels/Shorts).
Focus on: laundry tips, fabric care hacks, before/after transformations, customer pain points, seasonal care, eco-friendly tips, or service showcases.
Return ONLY the topic as a plain string — no JSON, no explanation.`,
    }],
  });
  return message.content[0].text.trim().replace(/^["']|["']$/g, '');
}

module.exports = { generateVideoScript };
