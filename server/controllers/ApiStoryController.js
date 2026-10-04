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

function parseIsoDate(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const ApiStoryController = {
  // ── Agent API (paid-API MVP) ────────────────────────────────────────────

  async listSignalFeed(req, res, next) {
    try {
      const status = req.query.status || 'active';
      const limit = parseBoundedInt(req.query.limit, 50, { min: 1, max: 200 });

      const sinceRaw = req.query.since;
      const untilRaw = req.query.until;
      const since = sinceRaw === undefined ? null : parseIsoDate(sinceRaw);
      const until = untilRaw === undefined ? null : parseIsoDate(untilRaw);

      if (sinceRaw !== undefined && !since) {
        return res.status(400).json({ error: 'since must be ISO datetime' });
      }
      if (untilRaw !== undefined && !until) {
        return res.status(400).json({ error: 'until must be ISO datetime' });
      }

      const payload = await serviceFor(req).listSignalFeed({ status, limit, since, until });
      return res.json({ ok: true, ...payload });
    } catch (error) { return next(error); }
  },

  async listChanges(req, res, next) {
    try {
      const since = parseIsoDate(req.query.since);
      if (!since) {
        return res.status(400).json({ error: 'since (ISO datetime) is required' });
      }
      const limit = parseBoundedInt(req.query.limit, 100, { min: 1, max: 500 });
      const payload = await serviceFor(req).listChanges({ since, limit });
      return res.json({ ok: true, ...payload });
    } catch (error) { return next(error); }
  },

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

  async researchContext(req, res, next) {
    try {
      const ref = req.params.storyRef;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ref) || ref.length > 255 ||
          (/^\d+$/.test(ref) && (!Number.isSafeInteger(Number(ref)) || Number(ref) < 1 || Number(ref) > 2147483647))) {
        return res.status(400).json({ error: 'invalid story id or slug' });
      }
      const context = await serviceFor(req).getResearchContext(ref);
      if (!context) return res.status(404).json({ error: 'story not found' });
      res.set('Cache-Control', 'no-store');
      return res.json({ ok: true, ...context });
    } catch (error) { return next(error); }
  },

  async getBrief(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });
      const brief = await serviceFor(req).getBrief(id);
      if (brief === undefined) return res.status(404).json({ error: 'story not found' });
      return res.json({ ok: true, brief });
    } catch (error) { return next(error); }
  },

  async putBrief(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });
      const forbidden = ['status', 'reviewed_by', 'reviewed_at', 'reviewedBy', 'reviewedAt'].find(key =>
        Object.prototype.hasOwnProperty.call(req.body || {}, key)
      );
      if (forbidden) {
        return res.status(400).json({ error: `${forbidden} cannot be set through the API`, code: 'brief_review_fields_forbidden' });
      }
      const brief = await serviceFor(req).replaceBrief(id, req.body || {});
      return res.json({ ok: true, brief });
    } catch (error) {
      if (![400, 404, 409].includes(error.status)) return next(error);
      const payload = { error: error.message };
      if (error.code) payload.code = error.code;
      if (error.currentRevision !== undefined) payload.current_revision = error.currentRevision;
      return res.status(error.status).json(payload);
    }
  },

  async registerResearchSource(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });
      const article = await serviceFor(req).registerResearchSource(id, req.body || {});
      return res.status(201).json({ ok: true, article });
    } catch (error) {
      if (![400, 404, 409].includes(error.status)) return next(error);
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
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

  async editorialAudit(req, res, next) {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(400).json({ error: 'invalid story id' });

      const audit = await serviceFor(req).getEditorialAudit(id);
      if (!audit) return res.status(404).json({ error: 'story not found' });
      return res.json({ ok: true, ...audit });
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
