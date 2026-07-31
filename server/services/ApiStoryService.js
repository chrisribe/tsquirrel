'use strict';

const StoryService = require('./StoryService');
const { normalizeStoryInput } = require('../lib/storyInput');

// Story service for the JSON API. Shares the core StoryService (DAO access,
// slug, attach loop) with StoryAdminService but returns plain data — story,
// sources, suggestions — rather than admin page-view models.
class ApiStoryService {
  constructor(pool) {
    this.stories = new StoryService(pool);
  }

  async listStories({ status = null, needsReview = null, limit = 30 } = {}) {
    const stories = await this.stories.listForAdmin({ status, needsReview });
    return { count: Math.min(stories.length, limit), stories: stories.slice(0, limit) };
  }

  async createStory(input, authorId) {
    const values = normalizeStoryInput({ ...input, articleIds: input.article_ids });
    if (!values.title) {
      const error = new Error('title is required');
      error.status = 400;
      throw error;
    }
    const draft = await this.stories.create(values, { authorType: 'api-token', authorId });
    return this.stories.getById(draft.id);
  }

  async getStory(storyId) {
    const story = await this.stories.getById(storyId);
    if (!story) return null;
    const sources = await this.stories.getArticles(storyId);
    return { story, sources };
  }

  async patchStory(storyId, body = {}) {
    const current = await this.stories.getById(storyId);
    if (!current) return null;

    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
    const title = has('title') ? String(body.title || '').trim() : current.title;
    if (!title) {
      const error = new Error('title cannot be empty');
      error.status = 400;
      throw error;
    }

    const summary = has('summary') ? (String(body.summary || '').trim() || null) : current.summary;
    const squirrelTake = has('squirrel_take') ? (String(body.squirrel_take || '').trim() || null) : current.squirrel_take;
    const whyItMatters = has('why_it_matters') ? (String(body.why_it_matters || '').trim() || null) : current.why_it_matters;
    const category = has('category') ? (String(body.category || 'Other').trim() || 'Other') : current.category;
    const tags = has('tags') ? String(body.tags || '').split(',').map(t => t.trim()).filter(Boolean) : current.tags;
    const imageUrl = has('image_url') ? (String(body.image_url || '').trim() || null) : undefined;

    return this.stories.update(storyId, { title, summary, squirrelTake, whyItMatters, category, tags, imageUrl });
  }

  async addSource(storyId, articleId) {
    const story = await this.stories.getById(storyId);
    if (!story) return null;
    await this.stories.attach(storyId, articleId);
    return this.stories.getArticles(storyId);
  }

  async removeSource(storyId, articleId) {
    const story = await this.stories.getById(storyId);
    if (!story) return null;
    await this.stories.detach(storyId, articleId);
    return this.stories.getArticles(storyId);
  }

  async listSuggestions(storyId) {
    const story = await this.stories.getById(storyId);
    if (!story) return null;
    return this.stories.getSuggestions(storyId);
  }

  async acceptSuggestion(storyId, articleId) {
    const ok = await this.stories.acceptSuggestion(storyId, articleId);
    if (!ok) return null;
    return this.stories.getArticles(storyId);
  }

  async rejectSuggestion(storyId, articleId) {
    const ok = await this.stories.rejectSuggestion(storyId, articleId);
    if (!ok) return null;
    return this.stories.getSuggestions(storyId);
  }

  async setFeatured(storyId, featured) {
    return this.stories.setFeatured(storyId, featured);
  }

  async setStatus(storyId, status) {
    return this.stories.setStatus(storyId, status);
  }
}

module.exports = ApiStoryService;
