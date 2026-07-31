'use strict';

const NewsDAO = require('../dao/NewsDAO');
const { slugify } = require('../lib/slug');

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
    }
    return draft;
  }

  update(storyId, values) {
    return this.dao.updateDraft(storyId, values);
  }

  async attach(storyId, articleId) {
    if (Number.isFinite(articleId)) await this.dao.attachSource(storyId, articleId);
  }

  async detach(storyId, articleId) {
    if (Number.isFinite(articleId)) await this.dao.detachSource(storyId, articleId);
  }

  acceptSuggestion(storyId, articleId) {
    if (!Number.isFinite(articleId)) return false;
    return this.dao.acceptSuggestion(storyId, articleId);
  }

  rejectSuggestion(storyId, articleId) {
    if (!Number.isFinite(articleId)) return false;
    return this.dao.rejectSuggestion(storyId, articleId);
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
