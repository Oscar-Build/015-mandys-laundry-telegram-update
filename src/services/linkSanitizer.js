'use strict';

/**
 * Strips AI-generated <a href> tags that point outside an allowed URL list (hallucinated
 * links) or repeat an href already used earlier in the same content (unnatural link spam).
 * Non-conforming links are unwrapped to plain text rather than removed entirely, so no
 * content or anchor text is lost.
 */
function sanitizeInternalLinks(html, allowedHrefs) {
  const seen = new Set();
  return html.replace(/<a\s+href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (match, href, text) => {
    if (!allowedHrefs.includes(href) || seen.has(href)) {
      return text;
    }
    seen.add(href);
    return match;
  });
}

module.exports = { sanitizeInternalLinks };
