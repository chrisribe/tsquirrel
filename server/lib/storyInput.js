'use strict';

// Shared story field normalization used by both the admin service (form input)
// and the JSON API service (request body). Keeps trimming, defaults, and tag /
// article-id parsing in one place so the two services stay in sync.
function normalizeStoryInput(input = {}) {
  const manualImageUrl = String(input.image_url_manual || '').trim();
  const selectedImageUrl = String(input.image_url || '').trim();
  const existingImageUrl = String(input.image_url_existing || '').trim();
  const hasSelectedImageField = Object.prototype.hasOwnProperty.call(input, 'image_url');

  let imageUrl = null;
  if (manualImageUrl) {
    imageUrl = manualImageUrl;
  } else if (hasSelectedImageField) {
    imageUrl = selectedImageUrl || null; // explicit "No image" radio keeps this null
  } else {
    imageUrl = existingImageUrl || null; // preserve current image when no image controls changed
  }

  return {
    title: String(input.title || '').trim(),
    summary: String(input.summary || '').trim() || null,
    squirrelTake: String(input.squirrel_take || '').trim() || null,
    whyItMatters: String(input.why_it_matters || '').trim() || null,
    category: String(input.category || 'Other').trim() || 'Other',
    tags: String(input.tags || '').split(',').map(tag => tag.trim()).filter(Boolean),
    imageUrl,
    articleIds: [].concat(input.articleIds || [])
      .map(value => parseInt(value, 10))
      .filter(Number.isFinite),
  };
}

module.exports = { normalizeStoryInput };
