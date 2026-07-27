'use strict';

const express = require('express');
const router = express.Router();
const NewsDAO = require('../dao/NewsDAO');
const { slugify } = require('../lib/slug');
const apiTokenAuth = require('../middleware/apiTokenAuthMiddleware');

router.use(apiTokenAuth);

router.get('/me', async (req, res) => {
  res.json({
    ok: true,
    token: req.apiToken,
  });
});

router.get('/stories', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const status = req.query.status || null;
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 30;

  const stories = await dao.getStoriesForAdmin({ status });
  res.json({
    ok: true,
    count: Math.min(stories.length, limit),
    stories: stories.slice(0, limit),
  });
});

router.post('/stories', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const title = (req.body.title || '').trim();

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  const summary = (req.body.summary || '').trim() || null;
  const squirrelTake = (req.body.squirrel_take || '').trim() || null;
  const category = (req.body.category || 'Other').trim() || 'Other';
  const tags = Array.isArray(req.body.tags)
    ? req.body.tags.map(t => String(t).trim()).filter(Boolean)
    : String(req.body.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const imageUrl = (req.body.image_url || '').trim() || null;
  const articleIds = Array.isArray(req.body.article_ids)
    ? req.body.article_ids.map(v => parseInt(v, 10)).filter(Number.isFinite)
    : [];

  const draft = await dao.createDraft({
    title,
    slug: slugify(title),
    summary,
    squirrelTake,
    category,
    tags,
    authorType: 'api-token',
    authorId: String(req.apiToken.id),
    imageUrl,
  });

  for (const articleId of articleIds) {
    await dao.attachSource(draft.id, articleId);
  }

  const story = await dao.getStoryById(draft.id);
  res.status(201).json({ ok: true, story });
});

router.post('/stories/:id/publish', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid story id' });

  const story = await dao.setStoryStatus(id, 'published');
  if (!story) return res.status(404).json({ error: 'story not found' });

  res.json({ ok: true, story });
});

router.post('/stories/:id/unpublish', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid story id' });

  const story = await dao.setStoryStatus(id, 'draft');
  if (!story) return res.status(404).json({ error: 'story not found' });

  res.json({ ok: true, story });
});

module.exports = router;
