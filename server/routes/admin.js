'use strict';

const express = require('express');
const router = express.Router();
const NewsDAO = require('../dao/NewsDAO');
const requireAuth = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/adminMiddleware');
const { slugify } = require('../lib/slug');

router.use(requireAuth, requireAdmin);

router.get('/', async (req, res) => {
  const pool = req.app.get('pool');
  const dao = new NewsDAO(pool);

  const sources = await dao.getSourceStats();
  res.render('layout-main', {
    template: 'admin/dashboard',
    pageTitle: 'Admin — TSquirrel',
    noIndex: true,
    pageData: { sources },
  });
});

router.get('/sources/:slug', async (req, res) => {
  const pool = req.app.get('pool');
  const dao = new NewsDAO(pool);

  const source = await dao.getSourceBySlug(req.params.slug);
  if (!source) {
    return res.status(404).render('errors/404', { pageTitle: 'Not Found — TSquirrel', noIndex: true });
  }

  const articles = await dao.getArticlesBySource(source.id, { limit: 50 });
  res.render('layout-main', {
    template: 'admin/source-articles',
    pageTitle: `${source.name} — Admin — TSquirrel`,
    noIndex: true,
    pageData: { source, articles },
  });
});

// ── Story authoring / moderation ───────────────────────────────────────

// List all stories (drafts first) + moderation actions
router.get('/stories', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const status = req.query.status || null;
  const stories = await dao.getStoriesForAdmin({ status });
  res.render('layout-main', {
    template: 'admin/stories',
    pageTitle: 'Stories — Admin — TSquirrel',
    noIndex: true,
    pageData: { stories, activeStatus: status },
  });
});

// Compose form — optionally seeded with selected article ids (?articleIds=1,2,3)
router.get('/stories/new', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const seedIds = (req.query.articleIds || '')
    .split(',').map(s => parseInt(s, 10)).filter(Boolean);
  const [recentArticles, seededArticles] = await Promise.all([
    dao.getRecentArticles({ limit: 100 }),
    dao.getArticlesByIds(seedIds),
  ]);
  res.render('layout-main', {
    template: 'admin/story-edit',
    pageTitle: 'New Story — Admin — TSquirrel',
    noIndex: true,
    pageData: { story: null, attached: seededArticles, recentArticles, error: null },
  });
});

// Create draft
router.post('/stories', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const { title, summary, squirrel_take, category, tags } = req.body;
  if (!title || !title.trim()) {
    const recentArticles = await dao.getRecentArticles({ limit: 100 });
    return res.status(400).render('layout-main', {
      template: 'admin/story-edit',
      pageTitle: 'New Story — Admin — TSquirrel',
      noIndex: true,
      pageData: { story: null, attached: [], recentArticles, error: 'Title is required.' },
    });
  }
  const tagArr = (tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const articleIds = [].concat(req.body.articleIds || [])
    .map(s => parseInt(s, 10)).filter(Boolean);

  const draft = await dao.createDraft({
    title: title.trim(),
    slug: slugify(title),
    summary: (summary || '').trim() || null,
    squirrelTake: (squirrel_take || '').trim() || null,
    category: category || 'Other',
    tags: tagArr,
    authorType: 'human',
    authorId: String(req.session.user.id),
  });
  for (const articleId of articleIds) {
    await dao.attachSource(draft.id, articleId);
  }
  res.redirect(`/admin/stories/${draft.id}/edit`);
});

// Edit form
router.get('/stories/:id/edit', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const story = await dao.getStoryById(req.params.id);
  if (!story) {
    return res.status(404).render('layout-main', {
      template: 'errors/404', pageTitle: '404 — TSquirrel', noIndex: true, pageData: {},
    });
  }
  const [attached, recentArticles] = await Promise.all([
    dao.getStoryArticles(story.id),
    dao.getRecentArticles({ limit: 100 }),
  ]);
  res.render('layout-main', {
    template: 'admin/story-edit',
    pageTitle: `Edit: ${story.title} — Admin — TSquirrel`,
    noIndex: true,
    pageData: { story, attached, recentArticles, error: null },
  });
});

// Update draft
router.post('/stories/:id', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const { title, summary, squirrel_take, category, tags } = req.body;
  const tagArr = (tags || '').split(',').map(t => t.trim()).filter(Boolean);
  await dao.updateDraft(req.params.id, {
    title: (title || '').trim(),
    summary: (summary || '').trim() || null,
    squirrelTake: (squirrel_take || '').trim() || null,
    category: category || 'Other',
    tags: tagArr,
  });
  res.redirect(`/admin/stories/${req.params.id}/edit`);
});

// Attach / detach a source article
router.post('/stories/:id/attach', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const articleId = parseInt(req.body.articleId, 10);
  if (articleId) await dao.attachSource(req.params.id, articleId);
  res.redirect(`/admin/stories/${req.params.id}/edit`);
});

router.post('/stories/:id/detach', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const articleId = parseInt(req.body.articleId, 10);
  if (articleId) await dao.detachSource(req.params.id, articleId);
  res.redirect(`/admin/stories/${req.params.id}/edit`);
});

// Lifecycle actions
router.post('/stories/:id/publish', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  await dao.setStoryStatus(req.params.id, 'published');
  res.redirect(req.body.returnTo || '/admin/stories');
});

router.post('/stories/:id/unpublish', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  await dao.setStoryStatus(req.params.id, 'draft');
  res.redirect(req.body.returnTo || '/admin/stories');
});

router.post('/stories/:id/hide', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  await dao.setStoryStatus(req.params.id, 'hidden');
  res.redirect(req.body.returnTo || '/admin/stories');
});

router.post('/stories/:id/feature', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  await dao.setFeatured(req.params.id, req.body.featured === 'true');
  res.redirect(req.body.returnTo || '/admin/stories');
});

router.post('/stories/:id/delete', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  await dao.deleteStory(req.params.id);
  res.redirect('/admin/stories');
});

// ── Radar signals ────────────────────────────────────────────────────────

router.get('/signals', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const filter = req.query.status || 'active';
  const signals = await dao.getSignals({ status: filter });

  // Build a lookup of article_id -> article for evidence rendering
  const allArticleIds = new Set();
  for (const sig of signals) {
    const evidence = typeof sig.evidence === 'string' ? JSON.parse(sig.evidence) : (sig.evidence || {});
    (evidence.article_ids || []).forEach(id => allArticleIds.add(id));
  }
  const articles = await dao.getArticlesByIds([...allArticleIds]);
  const articleMap = {};
  for (const a of articles) articleMap[a.id] = a;

  res.render('layout-main', {
    template: 'admin/signals',
    pageTitle: 'Radar Signals — Admin — TSquirrel',
    noIndex: true,
    pageData: { signals, filter, articleMap },
  });
});

// Trigger an immediate radar scan (same detector the cron runs after ingest)
router.post('/signals/scan', async (req, res) => {
  const { radarScan } = require('../services/RadarService');
  await radarScan(req.app.get('pool'));
  res.redirect('/admin/signals');
});

// Create a draft story pre-filled + pre-attached from a signal's evidence
router.post('/signals/:id/create-story', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const signal = await dao.getSignalById(req.params.id);
  if (!signal) return res.redirect('/admin/signals');

  const evidence = typeof signal.evidence === 'string' ? JSON.parse(signal.evidence) : (signal.evidence || {});
  const articleIds = evidence.article_ids || [];

  const draft = await dao.createDraft({
    title: signal.topic.replace(/\b\w/g, c => c.toUpperCase()),
    slug: slugify(signal.topic),
    summary: null,
    squirrelTake: null,
    category: 'Other',
    tags: [],
    authorType: 'radar',
    authorId: `signal-${signal.id}`,
  });
  for (const articleId of articleIds) {
    await dao.attachSource(draft.id, articleId);
  }
  await dao.linkSignalToStory(signal.id, draft.id);

  res.redirect(`/admin/stories/${draft.id}/edit`);
});

router.post('/signals/:id/dismiss', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  await dao.setSignalStatus(req.params.id, 'dismissed');
  res.redirect('/admin/signals');
});

module.exports = router;

