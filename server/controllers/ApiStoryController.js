'use strict';

function serviceFor(req) {
  return req.app.get('apiStoryService');
}

function parseId(value) {
  const id = parseInt(value, 10);
  return Number.isFinite(id) ? id : null;
}

function parseBoundedInt(value, fallback, { min = 1, max = 100 } = {}) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseIdList(value) {
  const raw = Array.isArray(value) ? value : [value];
  const out = [];
  for (const entry of raw) {
    const s = String(entry || '').trim();
    if (!s) continue;
    if (s.includes(',')) out.push(...s.split(','));
    else out.push(s);
  }
  return Array.from(new Set(out.map(v => parseInt(v, 10)).filter(Number.isFinite)));
}

const ApiStoryController = {
  async list(req, res, next) {
    try {
      const status = req.query.status || null;
      const needsReview = req.query.needs_review === undefined ? null : req.query.needs_review === 'true';
      const page = parseBoundedInt(req.query.page, 1, { min: 1, max: 1000000 });
      const perPage = parseBoundedInt(req.query.per_page || req.query.limit, 30, { min: 1, max: 100 });
      const sort = req.query.sort || null;
      const order = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

      const payload = await serviceFor(req).listStories({ status, needsReview, page, perPage, sort, order });
      return res.json({ ok: true, ...payload });
    } catch (error) { return next(error); }
  },

  async create(req, res, next) {
    try {
      const story = await serviceFor(req).createStory(req.body, req.apiToken.id);
      return res.status(201).json({ ok: true, story });
    } catch (error) {
      if (error.status !== 400) return next(error);
      return res.status(400).json({ error: error.message });
    }
  },

  async get(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });

      const result = await serviceFor(req).getStory(id);
      if (!result) return res.status(404).json({ error: 'story not found' });
      return res.json({ ok: true, story: result.story, sources: result.sources });
    } catch (error) { return next(error); }
  },

  async patch(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });

      const story = await serviceFor(req).patchStory(id, req.body || {});
      if (!story) return res.status(404).json({ error: 'story not found' });
      return res.json({ ok: true, story });
    } catch (error) {
      if (error.status !== 400) return next(error);
      return res.status(400).json({ error: error.message });
    }
  },

  async addSource(req, res, next) {
    try {
      const id = parseId(req.params.id);
      const articleId = parseId(req.body.article_id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });
      if (articleId === null) return res.status(400).json({ error: 'article_id is required' });

      const sources = await serviceFor(req).addSource(id, articleId);
      if (!sources) return res.status(404).json({ error: 'story not found' });
      return res.status(201).json({ ok: true, sources });
    } catch (error) { return next(error); }
  },

  async removeSource(req, res, next) {
    try {
      const id = parseId(req.params.id);
      const articleId = parseId(req.params.articleId);
      if (id === null || articleId === null) {
        return res.status(400).json({ error: 'invalid story id or article id' });
      }

      const sources = await serviceFor(req).removeSource(id, articleId);
      if (!sources) return res.status(404).json({ error: 'story not found' });
      return res.json({ ok: true, sources });
    } catch (error) { return next(error); }
  },

  async listSuggestions(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });

      const suggestions = await serviceFor(req).listSuggestions(id);
      if (!suggestions) return res.status(404).json({ error: 'story not found' });
      return res.json({ ok: true, count: suggestions.length, suggestions });
    } catch (error) { return next(error); }
  },

  async acceptSuggestion(req, res, next) {
    try {
      const id = parseId(req.params.id);
      const articleId = parseId(req.params.articleId);
      if (id === null || articleId === null) {
        return res.status(400).json({ error: 'invalid story id or article id' });
      }

      const sources = await serviceFor(req).acceptSuggestion(id, articleId);
      if (!sources) return res.status(404).json({ error: 'no pending suggestion for that article' });
      return res.json({ ok: true, sources });
    } catch (error) { return next(error); }
  },

  async rejectSuggestion(req, res, next) {
    try {
      const id = parseId(req.params.id);
      const articleId = parseId(req.params.articleId);
      if (id === null || articleId === null) {
        return res.status(400).json({ error: 'invalid story id or article id' });
      }

      const suggestions = await serviceFor(req).rejectSuggestion(id, articleId);
      if (!suggestions) return res.status(404).json({ error: 'no pending suggestion for that article' });
      return res.json({ ok: true, suggestions });
    } catch (error) { return next(error); }
  },

  async feature(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });

      const featured = req.body.featured === undefined ? true : !!req.body.featured;
      const story = await serviceFor(req).setFeatured(id, featured);
      if (!story) return res.status(404).json({ error: 'story not found' });
      return res.json({ ok: true, story });
    } catch (error) { return next(error); }
  },

  async publishPreflight(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });

      const preflight = await serviceFor(req).getPublishPreflight(id);
      if (!preflight) return res.status(404).json({ error: 'story not found' });
      return res.json({ ok: true, ...preflight });
    } catch (error) { return next(error); }
  },

  async publish(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });

      const story = await serviceFor(req).setStatus(id, 'published');
      if (!story) return res.status(404).json({ error: 'story not found' });
      return res.json({ ok: true, story });
    } catch (error) {
      if (error.status !== 400) return next(error);
      const payload = { error: error.message, code: error.code || 'publish_blocked' };
      if (Array.isArray(error.blockers)) payload.blocker_details = error.blockers;
      return res.status(400).json(payload);
    }
  },

  async unpublish(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });

      const story = await serviceFor(req).setStatus(id, 'draft');
      if (!story) return res.status(404).json({ error: 'story not found' });
      return res.json({ ok: true, story });
    } catch (error) { return next(error); }
  },

  async hide(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });

      const story = await serviceFor(req).setStatus(id, 'hidden');
      if (!story) return res.status(404).json({ error: 'story not found' });
      return res.json({ ok: true, story });
    } catch (error) { return next(error); }
  },

  async delete(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });

      const result = await serviceFor(req).deleteStory(id);
      if (!result) return res.status(404).json({ error: 'story not found' });
      return res.json({ ok: true, ...result });
    } catch (error) { return next(error); }
  },

  async bulkAction(req, res, next) {
    try {
      const ids = parseIdList(req.body.ids || req.body.story_ids || req.body.storyIds);
      const action = String(req.body.action || '').trim();
      const result = await serviceFor(req).bulkAction({ ids, action });
      return res.json({ ok: true, ...result });
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ error: error.message });
      return next(error);
    }
  },

  // ── Articles API (for client and automation) ────────────────────────────

  async listRecentArticles(req, res, next) {
    try {
      const limit = parseBoundedInt(req.query.limit, 100, { min: 1, max: 200 });
      const articles = await serviceFor(req).listRecentArticles({ limit });
      return res.json({ ok: true, count: articles.length, articles });
    } catch (error) { return next(error); }
  },

  async getArticle(req, res, next) {
    try {
      const articleId = parseId(req.params.articleId);
      if (articleId === null) return res.status(400).json({ error: 'invalid article id' });

      const article = await serviceFor(req).getArticle(articleId);
      if (!article) return res.status(404).json({ error: 'article not found' });
      return res.json({ ok: true, article });
    } catch (error) { return next(error); }
  },

  // ── Radar signals API ────────────────────────────────────────────────────

  async listRadarSignals(req, res, next) {
    try {
      const status = req.query.status || 'active';
      const limit = parseBoundedInt(req.query.limit, 50, { min: 1, max: 200 });
      const payload = await serviceFor(req).listRadarSignals({ status, limit });
      return res.json({ ok: true, ...payload });
    } catch (error) { return next(error); }
  },

  async getRadarSignal(req, res, next) {
    try {
      const signalId = parseId(req.params.signalId);
      if (signalId === null) return res.status(400).json({ error: 'invalid signal id' });

      const payload = await serviceFor(req).getRadarSignal(signalId);
      if (!payload) return res.status(404).json({ error: 'signal not found' });
      return res.json({ ok: true, ...payload });
    } catch (error) { return next(error); }
  },

  async scanRadarSignals(req, res, next) {
    try {
      const payload = await serviceFor(req).scanRadarSignals();
      return res.status(201).json({ ok: true, ...payload });
    } catch (error) { return next(error); }
  },

  async createStoryFromSignal(req, res, next) {
    try {
      const signalId = parseId(req.params.signalId);
      if (signalId === null) return res.status(400).json({ error: 'invalid signal id' });

      const story = await serviceFor(req).createStoryFromSignal(signalId);
      if (!story) return res.status(404).json({ error: 'signal not found' });
      return res.status(201).json({ ok: true, story });
    } catch (error) { return next(error); }
  },

  async dismissSignal(req, res, next) {
    try {
      const signalId = parseId(req.params.signalId);
      if (signalId === null) return res.status(400).json({ error: 'invalid signal id' });

      const signal = await serviceFor(req).dismissSignal(signalId);
      if (!signal) return res.status(404).json({ error: 'signal not found' });
      return res.json({ ok: true, signal });
    } catch (error) { return next(error); }
  },

  async previewConvergence(req, res, next) {
    try {
      const windowHours = parseBoundedInt(req.query.window_hours, 48, { min: 1, max: 168 });
      const minSources = parseBoundedInt(req.query.min_sources, 2, { min: 2, max: 10 });
      const limit = parseBoundedInt(req.query.limit, 30, { min: 1, max: 200 });

      const hits = await serviceFor(req).previewConvergence({ windowHours, minSources, limit });
      return res.json({ ok: true, count: hits.length, hits });
    } catch (error) { return next(error); }
  },
};

module.exports = ApiStoryController;
