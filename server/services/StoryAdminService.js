'use strict';

const StoryService = require('./StoryService');
const { normalizeStoryInput } = require('../lib/storyInput');

class StoryAdminService {
  constructor(pool) {
    this.stories = new StoryService(pool);
  }

  async listStories({ status = null, page = 1, perPage = 50 } = {}) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safePerPage = Number.isFinite(perPage) && perPage > 0 ? perPage : 50;
    const offset = (safePage - 1) * safePerPage;
    return this.stories.listForAdmin({ status, limit: safePerPage, offset, page: safePage, perPage: safePerPage });
  }

  async getNewStoryModel(seedIds = []) {
    const [recentArticles, seededArticles] = await Promise.all([
      this.stories.getRecentArticles({ limit: 100 }),
      this.stories.getArticlesByIds(seedIds),
    ]);
    const recentIds = new Set(recentArticles.map(article => article.id));
    const seed = seededArticles[0];

    return {
      story: null,
      attached: seededArticles,
      recentArticles: [
        ...seededArticles.filter(article => !recentIds.has(article.id)),
        ...recentArticles,
      ],
      prefill: seed ? {
        title: seed.title || '',
        summary: seed.description || '',
        image_url: seed.image_url || null,
      } : null,
      error: null,
    };
  }

  async createDraft(input, authorId) {
    const values = normalizeStoryInput(input);
    if (!values.title) {
      const error = new Error('Title is required.');
      error.status = 400;
      throw error;
    }
    return this.stories.create(values, { authorType: 'human', authorId });
  }

  async getEditorModel(storyId, { returnTo = '/admin/stories' } = {}) {
    const story = await this.stories.getById(storyId);
    if (!story) return null;
    const [attached, suggestions] = await Promise.all([
      this.stories.getArticles(story.id),
      this.stories.getSuggestions(story.id),
    ]);
    return { story, attached, suggestions, recentArticles: [], returnTo, error: null };
  }

  async getAttachPickerModel(storyId) {
    const [attached, recentArticles] = await Promise.all([
      this.stories.getArticles(storyId),
      this.stories.getRecentArticles({ limit: 100 }),
    ]);
    return {
      storyId,
      recentArticles,
      attachedIds: attached.map(article => article.id),
    };
  }

  async updateStory(storyId, input) {
    const values = normalizeStoryInput(input);
    if (!values.title) {
      const error = new Error('Title is required.');
      error.status = 400;
      throw error;
    }
    return this.stories.update(storyId, values);
  }

  async attachSource(storyId, articleId) {
    await this.stories.attach(storyId, articleId);
    return this.getEditorModel(storyId);
  }

  async acceptSuggestion(storyId, articleId) {
    await this.stories.acceptSuggestion(storyId, articleId);
    return this.getEditorModel(storyId);
  }

  async rejectSuggestion(storyId, articleId) {
    await this.stories.rejectSuggestion(storyId, articleId);
    return this.getEditorModel(storyId);
  }

  async detachSource(storyId, articleId) {
    await this.stories.detach(storyId, articleId);
    return this.getEditorModel(storyId);
  }

  async setStatus(storyId, status) {
    await this.stories.setStatus(storyId, status);
    return this.getEditorModel(storyId);
  }

  async setFeatured(storyId, featured) {
    await this.stories.setFeatured(storyId, featured);
    return this.getEditorModel(storyId);
  }

  async deleteStory(storyId) {
    return this.stories.delete(storyId);
  }

  async bulkAction(storyIds = [], action = '') {
    const ids = Array.from(new Set((storyIds || []).map(id => parseInt(id, 10)).filter(Number.isFinite)));
    if (ids.length === 0) return { count: 0, action: null };

    const normalized = String(action || '').trim();
    const allowed = new Set(['publish', 'unpublish', 'hide', 'feature', 'unfeature', 'delete']);
    if (!allowed.has(normalized)) {
      const error = new Error('Invalid bulk action.');
      error.status = 400;
      throw error;
    }

    for (const id of ids) {
      if (normalized === 'publish') await this.stories.setStatus(id, 'published');
      else if (normalized === 'unpublish') await this.stories.setStatus(id, 'draft');
      else if (normalized === 'hide') await this.stories.setStatus(id, 'hidden');
      else if (normalized === 'feature') await this.stories.setFeatured(id, true);
      else if (normalized === 'unfeature') await this.stories.setFeatured(id, false);
      else if (normalized === 'delete') await this.stories.delete(id);
    }

    return { count: ids.length, action: normalized };
  }
}

module.exports = StoryAdminService;
