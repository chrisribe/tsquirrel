'use strict';

const NewsDAO = require('../dao/NewsDAO');
const { slugify } = require('../lib/slug');
const { isLowQualityImage, fetchOgImage } = require('./IngestionService');

// Core story domain service. Owns all NewsDAO access for stories and returns
// raw domain data (stories, articles, suggestions, booleans). Presentation
// shaping — admin page-view models vs JSON payloads — lives in the wrapping
// StoryAdminService / ApiStoryService. Input validation lives at those
// boundaries too; this service assumes it is handed already-normalized values.
class StoryService {
  constructor(pool) {
    this.dao = new NewsDAO(pool);
  }

  // ── Reads ────────────────────────────────────────────────────────────────
  listForAdmin({ status = null, needsReview = null } = {}) {
    return this.dao.getStoriesForAdmin({ status, needsReview });
  }

  getById(storyId) {
    return this.dao.getStoryById(storyId);
  }

  getArticles(storyId) {
    return this.dao.getStoryArticles(storyId);
  }

  getSuggestions(storyId) {
    return this.dao.getSuggestedSources(storyId);
  }

  getRecentArticles(options = {}) {
    return this.dao.getRecentArticles(options);
  }

  getArticlesByIds(ids = []) {
    return this.dao.getArticlesByIds(ids);
  }

  // ── Mutations ──────────────────────────────────────────────────────────────
  async create(values, { authorType, authorId }) {
    const draft = await this.dao.createDraft({
      ...values,
      slug: slugify(values.title),
      authorType,
      authorId: String(authorId),
    });
    for (const articleId of values.articleIds || []) {
      await this.dao.attachSource(draft.id, articleId);
      await this._upgradeImageIfNeeded(articleId);
    }
    return draft;
  }

  update(storyId, values) {
    return this.dao.updateDraft(storyId, values);
  }

  async attach(storyId, articleId) {
    if (!Number.isFinite(articleId)) return;
    await this.dao.attachSource(storyId, articleId);
    await this._upgradeImageIfNeeded(articleId);
  }

  async detach(storyId, articleId) {
    if (Number.isFinite(articleId)) await this.dao.detachSource(storyId, articleId);
  }

  async acceptSuggestion(storyId, articleId) {
    if (!Number.isFinite(articleId)) return false;
    const result = await this.dao.acceptSuggestion(storyId, articleId);
    await this._upgradeImageIfNeeded(articleId);
    return result;
  }

  rejectSuggestion(storyId, articleId) {
    if (!Number.isFinite(articleId)) return false;
    return this.dao.rejectSuggestion(storyId, articleId);
  }

  // Lazily fetch a real og:image for an article only at the moment it's
  // actually attached to a story — this is the only point where an article
  // graduates from "raw ingested noise" to "something a reader will see", so
  // it's the only point worth paying for an extra HTTP request per article.
  async _upgradeImageIfNeeded(articleId) {
    try {
      const [article] = await this.dao.getArticlesByIds([articleId]);
      if (!article) return;
      if (!isLowQualityImage(article.image_url)) return;
      const ogImage = await fetchOgImage(article.url);
      if (ogImage) await this.dao.updateArticleImage(articleId, ogImage);
    } catch (err) {
      console.warn(`[StoryService] og:image upgrade failed for article #${articleId}:`, err.message);
    }
  }

  setStatus(storyId, status) {
    return this.dao.setStoryStatus(storyId, status);
  }

  setFeatured(storyId, featured) {
    return this.dao.setFeatured(storyId, featured);
  }

  delete(storyId) {
    return this.dao.deleteStory(storyId);
  }
}

module.exports = StoryService;
