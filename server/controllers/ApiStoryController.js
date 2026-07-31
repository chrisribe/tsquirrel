'use strict';

function serviceFor(req) {
  return req.app.get('apiStoryService');
}

function parseId(value) {
  const id = parseInt(value, 10);
  return Number.isFinite(id) ? id : null;
}

const ApiStoryController = {
  async list(req, res, next) {
    try {
      const status = req.query.status || null;
      const limitRaw = parseInt(req.query.limit, 10);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 30;
      const needsReview = req.query.needs_review === undefined ? null : req.query.needs_review === 'true';

      const { count, stories } = await serviceFor(req).listStories({ status, needsReview, limit });
      return res.json({ ok: true, count, stories });
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

  async publish(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });

      const story = await serviceFor(req).setStatus(id, 'published');
      if (!story) return res.status(404).json({ error: 'story not found' });
      return res.json({ ok: true, story });
    } catch (error) { return next(error); }
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
};

module.exports = ApiStoryController;
