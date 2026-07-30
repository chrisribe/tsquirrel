'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const NewsDAO = require('../dao/NewsDAO');
const ApiTokenDAO = require('../dao/ApiTokenDAO');
const requireAuth = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/adminMiddleware');
const storyAdminController = require('../controllers/StoryAdminController');
const { slugify } = require('../lib/slug');

router.use(requireAuth, requireAdmin);


async function renderTokensPage(req, res, { message = null, error = null, createdToken = null } = {}) {
  const dao = new ApiTokenDAO(req.app.get('pool'));
  const tokens = await dao.listApiTokens();
  res.render('layout-main', {
    template: 'admin/tokens',
    pageTitle: 'API Tokens — Admin — TSquirrel',
    noIndex: true,
    pageData: {
      tokens,
      message,
      error,
      createdToken,
    },
  });
}

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

router.get('/tokens', async (req, res) => {
  const message = req.query.revoked === '1' ? 'Token revoked.' : null;
  await renderTokensPage(req, res, { message });
});

router.post('/tokens', async (req, res) => {
  const dao = new ApiTokenDAO(req.app.get('pool'));
  const rawLabel = (req.body.label || '').trim();
  const label = rawLabel.slice(0, 100);

  if (!label) {
    return renderTokensPage(req, res, { error: 'Label is required.' });
  }

  const token = `tsq_${crypto.randomBytes(24).toString('base64url')}`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await dao.createApiToken({ label, tokenHash });

  return renderTokensPage(req, res, {
    message: 'Token created. Copy it now — it will not be shown again.',
    createdToken: token,
  });
});

router.post('/tokens/:id/revoke', async (req, res) => {
  const dao = new ApiTokenDAO(req.app.get('pool'));
  const id = parseInt(req.params.id, 10);
  if (id) await dao.revokeApiToken(id);
  res.redirect('/admin/tokens?revoked=1');
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

// Enable / disable a source (controls whether ingestion fetches from it)
router.post('/sources/:slug/toggle', async (req, res) => {
  const dao = new NewsDAO(req.app.get('pool'));
  const source = await dao.getSourceBySlug(req.params.slug);
  if (source) await dao.setSourceActive(source.id, !source.active);
  res.redirect('/admin');
});

// ── Story authoring / moderation ───────────────────────────────────────
router.get('/stories', storyAdminController.list);
router.get('/stories/new', storyAdminController.newForm);
router.post('/stories', storyAdminController.create);
router.get('/stories/:id/edit', storyAdminController.edit);
router.get('/stories/:id/attach-picker', storyAdminController.attachPicker);
router.post('/stories/:id', storyAdminController.update);
router.post('/stories/:id/attach', storyAdminController.attach);
router.post('/stories/:id/detach', storyAdminController.detach);
router.post('/stories/:id/publish', storyAdminController.publish);
router.post('/stories/:id/unpublish', storyAdminController.unpublish);
router.post('/stories/:id/hide', storyAdminController.hide);
router.post('/stories/:id/feature', storyAdminController.feature);
router.post('/stories/:id/delete', storyAdminController.delete);

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
  const articles = await dao.getArticlesByIds(articleIds);
  const lead = articles.find(a => a.image_url)?.image_url || null;

  const draft = await dao.createDraft({
    title: signal.topic.replace(/\b\w/g, c => c.toUpperCase()),
    slug: slugify(signal.topic),
    summary: null,
    squirrelTake: null,
    category: 'Other',
    tags: [],
    authorType: 'radar',
    authorId: `signal-${signal.id}`,
    imageUrl: lead,
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

