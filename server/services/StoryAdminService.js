'use strict';

const NewsDAO = require('../dao/NewsDAO');
const { slugify } = require('../lib/slug');

class StoryAdminService {
  constructor(pool) {
    this.dao = new NewsDAO(pool);
  }

  async listStories(status = null) {
    return this.dao.getStoriesForAdmin({ status });
  }

  async getNewStoryModel(seedIds = []) {
    const [recentArticles, seededArticles] = await Promise.all([
      this.dao.getRecentArticles({ limit: 100 }),
      this.dao.getArticlesByIds(seedIds),
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
    const values = this.normalizeStoryInput(input);
    if (!values.title) {
      const error = new Error('Title is required.');
      error.status = 400;
      throw error;
    }

    const draft = await this.dao.createDraft({
      ...values,
      slug: slugify(values.title),
      authorType: 'human',
      authorId: String(authorId),
    });

    for (const articleId of values.articleIds) {
      await this.dao.attachSource(draft.id, articleId);
    }
    return draft;
  }

  async getEditorModel(storyId) {
    const story = await this.dao.getStoryById(storyId);
    if (!story) return null;
    const attached = await this.dao.getStoryArticles(story.id);
    return { story, attached, recentArticles: [], error: null };
  }

  async getAttachPickerModel(storyId) {
    const [attached, recentArticles] = await Promise.all([
      this.dao.getStoryArticles(storyId),
      this.dao.getRecentArticles({ limit: 100 }),
    ]);
    return {
      storyId,
      recentArticles,
      attachedIds: attached.map(article => article.id),
    };
  }

  async updateStory(storyId, input) {
    const values = this.normalizeStoryInput(input);
    if (!values.title) {
      const error = new Error('Title is required.');
      error.status = 400;
      throw error;
    }
    return this.dao.updateDraft(storyId, values);
  }

  async attachSource(storyId, articleId) {
    if (Number.isFinite(articleId)) await this.dao.attachSource(storyId, articleId);
    return this.getEditorModel(storyId);
  }

  async detachSource(storyId, articleId) {
    if (Number.isFinite(articleId)) await this.dao.detachSource(storyId, articleId);
    return this.getEditorModel(storyId);
  }

  async setStatus(storyId, status) {
    await this.dao.setStoryStatus(storyId, status);
    return this.getEditorModel(storyId);
  }

  async setFeatured(storyId, featured) {
    await this.dao.setFeatured(storyId, featured);
    return this.getEditorModel(storyId);
  }

  async deleteStory(storyId) {
    return this.dao.deleteStory(storyId);
  }

  normalizeStoryInput(input) {
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
}

module.exports = StoryAdminService;
