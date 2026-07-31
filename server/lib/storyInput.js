'use strict';

// Shared story field normalization used by both the admin service (form input)
// and the JSON API service (request body). Keeps trimming, defaults, and tag /
// article-id parsing in one place so the two services stay in sync.
function normalizeStoryInput(input = {}) {
  return {
    title: String(input.title || '').trim(),
    summary: String(input.summary || '').trim() || null,
    squirrelTake: String(input.squirrel_take || '').trim() || null,
    whyItMatters: String(input.why_it_matters || '').trim() || null,
    category: String(input.category || 'Other').trim() || 'Other',
    tags: String(input.tags || '').split(',').map(tag => tag.trim()).filter(Boolean),
    imageUrl: String(input.image_url_manual || '').trim()
      || String(input.image_url || '').trim()
      || null,
    articleIds: [].concat(input.articleIds || [])
      .map(value => parseInt(value, 10))
      .filter(Number.isFinite),
  };
}

module.exports = { normalizeStoryInput };
