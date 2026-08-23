'use strict';

const express = require('express');
const router = express.Router();
const NewsDAO = require('../dao/NewsDAO');

const LEGACY_REDIRECTS = new Map([
  ['/about', '/'],
  ['/external', '/archive'],
  ['/privacy-policy', '/'],
  ['/terms-of-service', '/'],
  ['/login', '/'],
  ['/signup', '/'],
]);

// ── Legacy dead paths cleanup (SEO leakage guard) ─────────────────────
router.get(Array.from(LEGACY_REDIRECTS.keys()), (req, res) => {
  const target = LEGACY_REDIRECTS.get(req.path) || '/';
  return res.redirect(301, target);
});

// ── Legacy media paths that should not be indexed ──────────────────────
router.get('/_data/photos/*', (_req, res) => {
  return res.status(410).type('text/plain').send('Gone');
});

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
  const tag = req.query.tag || null;
  const [stories, categories] = await Promise.all([
    dao.getTopStories({ limit: 30, category, tag }),
    dao.getCategories(),
  ]);

  const featured = (!category && !tag && stories.length) ? stories[0] : null;
  const heroImageUrl = featured?.image_url
    ? String(featured.image_url).replace(/^http:\/\//i, 'https://')
    : null;

  res.render('layout-main', {
    template: 'index-page',
    pageTitle: "What's Trending — TSquirrel",
    pageDescription: 'AI-curated news digest. Top stories across sources, summarized.',
    pageUrl: 'https://tsquirrel.com',
    heroImageUrl,
    pageData: { stories, categories, activeCategory: category, activeTag: tag },
  });
});

// ── Legacy archive index ───────────────────────────────────────────────
router.get('/archive', async (req, res) => {
  const pool = req.app.get('pool');
  const dao = new NewsDAO(pool);

  const articles = await dao.getLegacyArticles();
  res.render('layout-main', {
    template: 'archive-page',
    pageTitle: 'Archive — TSquirrel',
    pageDescription: 'The TSquirrel Classic archive — original news picks from the early days.',
    pageUrl: 'https://tsquirrel.com/archive',
    pageData: { articles },
  });
});

// ── Story detail ───────────────────────────────────────────────────────
router.get('/story/:slug', async (req, res) => {
  const pool = req.app.get('pool');
  const dao = new NewsDAO(pool);

  const story = await dao.getPublishedStoryBySlug(req.params.slug);
  if (!story) {
    const { rows: redirectRows } = await pool.query(`
      SELECT s.slug AS current_slug
      FROM story_slug_redirects r
      JOIN stories s ON s.id = r.story_id
      WHERE r.old_slug = $1
        AND s.status = 'published'
        AND s.slug IS NOT NULL
      LIMIT 1
    `, [req.params.slug]);

    const target = redirectRows[0]?.current_slug;
    if (target) return res.redirect(301, `/story/${target}`);

    return res.status(404).render('layout-main', {
      template: 'errors/404',
      pageTitle: 'Story Not Found — TSquirrel',
      pageDescription: 'The story URL changed or no longer exists. Browse latest stories or archive.',
      noIndex: true,
      pageData: {},
    });
  }

  const articles = await dao.getStoryArticles(story.id);
  const related = await dao.getRelatedStories(story.id, { category: story.category, tags: story.tags || [] });
  res.render('layout-main', {
    template: 'story-page',
    pageTitle: `${story.title} — TSquirrel`,
    pageDescription: story.summary || story.title,
    pageUrl: `https://tsquirrel.com/story/${story.slug}`,
    pageData: { story, articles, related },
  });
});

// ── HTMX infinite scroll API ───────────────────────────────────────────
router.get('/api/stories', async (req, res) => {
  const pool = req.app.get('pool');
  const dao = new NewsDAO(pool);
  const offset = parseInt(req.query.offset) || 0;
  const category = req.query.category || null;
  const tag = req.query.tag || null;
  const stories = await dao.getTopStories({ limit: 10, offset, category, tag });
  res.render('partials/story-cards', { pageData: { stories } });
});

module.exports = router;
