'use strict';

const express = require('express');
const router = express.Router();
const NewsDAO = require('../dao/NewsDAO');

// ── Legacy article route — must come BEFORE catch-all ──────────────────
// Serves original tsquirrel.com slug URLs at their exact paths
// e.g. /drapeau-francais-le-retour-dun-symbole-apres-les-attentats-55
router.get('/:slug([a-z0-9][a-z0-9-]+-\\d+)', async (req, res, next) => {
  const pool = req.app.get('pool');
  const slug = req.params.slug;

  const { rows } = await pool.query(
    'SELECT * FROM legacy_articles WHERE slug = $1',
    [slug]
  );

  if (!rows[0]) return next(); // not a legacy slug — fall through to 404

  const article = rows[0];
  res.render('layout-main', {
    template: 'legacy-article-page',
    pageTitle: `${article.title} — TSquirrel`,
    pageDescription: article.description,
    pageUrl: `https://tsquirrel.com/${article.slug}`,
    pageData: { article },
  });
});

// ── Redirect old pure-numeric IDs → homepage ──────────────────────────
// Covers any Wayback/old-indexed URLs like /315, /1038 etc.
router.get('/:id(\\d+)', (req, res) => {
  res.redirect(301, '/');
});

// ── Homepage trending feed ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const pool = req.app.get('pool');
  const dao = new NewsDAO(pool);

  const category = req.query.category || null;
  const [stories, categories] = await Promise.all([
    dao.getTopStories({ limit: 30, category }),
    dao.getCategories(),
  ]);

  res.render('layout-main', {
    template: 'index-page',
    pageTitle: "What's Trending — TSquirrel",
    pageDescription: 'AI-curated news digest. Top stories across sources, summarized.',
    pageUrl: 'https://tsquirrel.com',
    pageData: { stories, categories, activeCategory: category },
  });
});

// ── Story detail ───────────────────────────────────────────────────────
router.get('/story/:slug', async (req, res) => {
  const pool = req.app.get('pool');
  const dao = new NewsDAO(pool);

  const story = await dao.getStoryBySlug(req.params.slug);
  if (!story) return res.status(404).render('layout-main', {
    template: 'errors/404',
    pageTitle: 'Story Not Found — TSquirrel',
    pageData: {},
  });

  const articles = await dao.getStoryArticles(story.id);
  res.render('layout-main', {
    template: 'story-page',
    pageTitle: `${story.title} — TSquirrel`,
    pageDescription: story.summary || story.title,
    pageUrl: `https://tsquirrel.com/story/${story.slug}`,
    pageData: { story, articles },
  });
});

// ── HTMX infinite scroll API ───────────────────────────────────────────
router.get('/api/stories', async (req, res) => {
  const pool = req.app.get('pool');
  const dao = new NewsDAO(pool);
  const offset = parseInt(req.query.offset) || 0;
  const category = req.query.category || null;
  const stories = await dao.getTopStories({ limit: 10, offset, category });
  res.render('partials/story-cards', { pageData: { stories } });
});

module.exports = router;
