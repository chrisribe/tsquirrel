'use strict';

const express = require('express');
const router = express.Router();
const NewsDAO = require('../dao/NewsDAO');

const LEGACY_REDIRECTS = new Map([
  ['/external', '/archive'],
  ['/login', '/auth/login'],
  ['/signup', '/auth/login'],
  ['/privacy', '/privacy-policy'],
  ['/terms', '/terms-of-service'],
]);

function xmlEscape(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Legacy dead paths cleanup (SEO leakage guard) ─────────────────────
router.get(Array.from(LEGACY_REDIRECTS.keys()), (req, res) => {
  const target = LEGACY_REDIRECTS.get(req.path) || '/';
  return res.redirect(301, target);
});

// ── Legacy section paths cleanup ───────────────────────────────────────
router.get('/section/:slug', (_req, res) => {
  return res.redirect(301, '/archive');
});

// ── Legacy media paths that should not be indexed ──────────────────────
router.get('/_data/photos/*', (_req, res) => {
  return res.status(410).type('text/plain').send('Gone');
});

// ── Static info/legal pages ────────────────────────────────────────────
router.get('/about', (_req, res) => {
  res.render('layout-main', {
    template: 'about-page',
    pageTitle: 'About — TSquirrel',
    pageDescription: 'What TSquirrel is, how stories are curated, and what to expect.',
    pageUrl: 'https://tsquirrel.com/about',
    pageData: {},
  });
});

router.get('/privacy-policy', (_req, res) => {
  res.render('layout-main', {
    template: 'privacy-page',
    pageTitle: 'Privacy Policy — TSquirrel',
    pageDescription: 'How TSquirrel handles analytics, logs, and user data.',
    pageUrl: 'https://tsquirrel.com/privacy-policy',
    pageData: {},
  });
});

router.get('/terms-of-service', (_req, res) => {
  res.render('layout-main', {
    template: 'terms-page',
    pageTitle: 'Terms of Service — TSquirrel',
    pageDescription: 'Terms governing use of TSquirrel.',
    pageUrl: 'https://tsquirrel.com/terms-of-service',
    pageData: {},
  });
});

router.get('/contact', (_req, res) => {
  res.render('layout-main', {
    template: 'contact-page',
    pageTitle: 'Contact — TSquirrel',
    pageDescription: 'How to reach TSquirrel for feedback or requests.',
    pageUrl: 'https://tsquirrel.com/contact',
    pageData: {},
  });
});

// ── XML sitemap (auto-updates from published stories) ──────────────────
router.get('/sitemap.xml', async (req, res) => {
  const pool = req.app.get('pool');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host');
  const requestBase = host ? `${proto}://${host}` : null;
  const configuredBase = String(process.env.PUBLIC_URL || '').trim();
  const baseUrl = String(requestBase || configuredBase || 'https://tsquirrel.com').replace(/\/$/, '');

  const staticPaths = ['/', '/archive', '/about', '/privacy-policy', '/terms-of-service', '/contact'];
  const { rows } = await pool.query(`
    SELECT slug, COALESCE(updated_at, published_at, created_at) AS lastmod
    FROM stories
    WHERE status = 'published' AND slug IS NOT NULL
    ORDER BY published_at DESC NULLS LAST, updated_at DESC
  `);

  const urls = [
    ...staticPaths.map(path => ({
      loc: `${baseUrl}${path}`,
      lastmod: null,
      changefreq: path === '/' ? 'hourly' : 'daily',
      priority: path === '/' ? '1.0' : '0.7',
    })),
    ...rows.map(r => ({
      loc: `${baseUrl}/story/${encodeURIComponent(r.slug)}`,
      lastmod: r.lastmod ? new Date(r.lastmod).toISOString() : null,
      changefreq: 'daily',
      priority: '0.8',
    })),
  ];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(u => {
      const bits = [
        `    <loc>${xmlEscape(u.loc)}</loc>`,
        u.lastmod ? `    <lastmod>${xmlEscape(u.lastmod)}</lastmod>` : null,
        u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : null,
        u.priority ? `    <priority>${u.priority}</priority>` : null,
      ].filter(Boolean);
      return ['  <url>', ...bits, '  </url>'].join('\n');
    }),
    '</urlset>',
  ].join('\n');

  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');
  return res.status(200).send(body);
});

// ── Legacy article route — must come BEFORE catch-all ──────────────────
// Serves original tsquirrel.com slug URLs at their exact paths
// e.g. /drapeau-francais-le-retour-dun-symbole-apres-les-attentats-55
router.get('/:slug([a-z0-9][a-z0-9-]+-\\d+)', async (req, res) => {
  const pool = req.app.get('pool');
  const slug = req.params.slug;

  const { rows } = await pool.query(
    'SELECT * FROM legacy_articles WHERE slug = $1',
    [slug]
  );

  if (!rows[0]) return res.redirect(301, '/archive'); // legacy-like slug but missing entry

  const article = rows[0];
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.render('layout-main', {
    template: 'legacy-article-page',
    pageTitle: `${article.title} — TSquirrel`,
    pageDescription: article.description,
    pageUrl: 'https://tsquirrel.com/archive',
    noIndex: true,
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
    pageTitle: `${story.title} | TSquirrel`,
    pageDescription: story.summary || story.title,
    pageUrl: `https://tsquirrel.com/story/${story.slug}`,
    pageData: { story, articles, related },
  });
});

// ── HTMX infinite scroll API ───────────────────────────────────────────
router.get('/api/stories', async (req, res) => {
  const pool = req.app.get('pool');
  const dao = new NewsDAO(pool);
  const offset = parseInt(req.query.offset, 10) || 0;
  const category = req.query.category || null;
  const tag = req.query.tag || null;

  const pageSize = 10;
  const rows = await dao.getTopStories({ limit: pageSize + 1, offset, category, tag });
  const hasMore = rows.length > pageSize;
  const stories = hasMore ? rows.slice(0, pageSize) : rows;
  const nextOffset = offset + stories.length;

  res.render('partials/story-cards-with-more', {
    stories,
    hasMore,
    nextOffset,
    activeCategory: category,
    activeTag: tag,
  });
});

module.exports = router;
