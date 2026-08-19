'use strict';

const StoryService = require('./StoryService');
const SignalService = require('./SignalService');
const NewsDAO = require('../dao/NewsDAO');
const { normalizeStoryInput } = require('../lib/storyInput');

// Story service for the JSON API. Shares the core StoryService (DAO access,
// slug, attach loop) with StoryAdminService but returns plain data — story,
// sources, suggestions — rather than admin page-view models.
class ApiStoryService {
  constructor(pool) {
    this.stories = new StoryService(pool);
    this.signals = new SignalService(pool);
    this.dao = new NewsDAO(pool);
  }

  async listStories({ status = null, needsReview = null, page = 1, perPage = 30, sort = null, order = 'desc' } = {}) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safePerPage = Number.isFinite(perPage) && perPage > 0 ? perPage : 30;
    const offset = (safePage - 1) * safePerPage;
    const payload = await this.stories.listForAdmin({
      status,
      needsReview,
      limit: safePerPage,
      offset,
      page: safePage,
      perPage: safePerPage,
      sort,
      order,
    });
    return {
      count: payload.pagination?.total || payload.stories.length,
      stories: payload.stories,
      pagination: payload.pagination,
    };
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

  async deleteStory(storyId) {
    const story = await this.stories.getById(storyId);
    if (!story) return null;
    await this.stories.delete(storyId);
    return { id: storyId, deleted: true };
  }

  async bulkAction({ ids = [], action = '' } = {}) {
    const storyIds = Array.from(new Set((ids || []).map(id => parseInt(id, 10)).filter(Number.isFinite)));
    if (storyIds.length === 0) {
      const error = new Error('ids is required');
      error.status = 400;
      throw error;
    }

    const normalized = String(action || '').trim();
    const allowed = new Set(['publish', 'unpublish', 'hide', 'feature', 'unfeature', 'delete']);
    if (!allowed.has(normalized)) {
      const error = new Error('invalid bulk action');
      error.status = 400;
      throw error;
    }

    for (const id of storyIds) {
      if (normalized === 'publish') await this.stories.setStatus(id, 'published');
      else if (normalized === 'unpublish') await this.stories.setStatus(id, 'draft');
      else if (normalized === 'hide') await this.stories.setStatus(id, 'hidden');
      else if (normalized === 'feature') await this.stories.setFeatured(id, true);
      else if (normalized === 'unfeature') await this.stories.setFeatured(id, false);
      else if (normalized === 'delete') await this.stories.delete(id);
    }

    return { action: normalized, count: storyIds.length, ids: storyIds };
  }

  // ── Missing API surface: articles ───────────────────────────────────────

  async listRecentArticles({ limit = 100 } = {}) {
    return this.stories.getRecentArticles({ limit });
  }

  async getArticle(articleId) {
    const rows = await this.stories.getArticlesByIds([articleId]);
    return rows[0] || null;
  }

  // ── Missing API surface: radar signals ──────────────────────────────────

  _parseEvidence(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }

  async listRadarSignals({ status = 'active', limit = 50 } = {}) {
    const signals = await this.dao.getSignals({ status, limit });
    const normalized = signals.map(signal => ({
      ...signal,
      evidence: this._parseEvidence(signal.evidence),
    }));

    const allArticleIds = new Set();
    normalized.forEach(signal => {
      (signal.evidence.article_ids || []).forEach(id => allArticleIds.add(id));
    });

    const evidenceArticles = await this.dao.getArticlesByIds([...allArticleIds]);
    const articleMap = {};
    evidenceArticles.forEach(article => {
      articleMap[article.id] = article;
    });

    return {
      count: normalized.length,
      signals: normalized,
      evidence_articles: articleMap,
    };
  }

  async getRadarSignal(signalId) {
    const signal = await this.dao.getSignalById(signalId);
    if (!signal) return null;

    const evidence = this._parseEvidence(signal.evidence);
    const articleIds = evidence.article_ids || [];
    const evidenceArticles = await this.dao.getArticlesByIds(articleIds);

    return {
      signal: {
        ...signal,
        evidence,
      },
      evidence_articles: evidenceArticles,
    };
  }

  async scanRadarSignals() {
    const created = await this.signals.scan();
    return { created };
  }

  async createStoryFromSignal(signalId) {
    const draft = await this.signals.createStoryFromSignal(signalId);
    if (!draft) return null;
    return this.stories.getById(draft.id);
  }

  async dismissSignal(signalId) {
    return this.signals.dismiss(signalId);
  }

  async previewConvergence({ windowHours = 48, minSources = 2, limit = 30 } = {}) {
    return this.dao.detectConvergence({ windowHours, minSources, limit });
  }
}

module.exports = ApiStoryService;
