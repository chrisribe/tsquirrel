'use strict';

const express = require('express');
const router = express.Router();
const NewsDAO = require('../dao/NewsDAO');
const crypto = require('node:crypto');
const { rateLimit } = require('../middleware/rateLimiter');

const INDEXABLE_CATEGORIES = new Set([
  'Politics',
  'World',
  'Business',
  'Technology',
  'AI',
  'Health',
  'Science',
  'Sports',
  'Entertainment',
]);

function categoryToSlug(category = '') {
  return String(category)
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function findCategoryBySlug(categories = [], slug = '') {
  const target = String(slug || '').trim().toLowerCase();
  if (!target) return null;

  // First, resolve against our indexable canonical set (stable even if a category
  // is quiet in the last 48h and absent from getCategories()).
  for (const category of INDEXABLE_CATEGORIES) {
    if (categoryToSlug(category) === target) return { category };
  }

  // Then fall back to currently active categories from DB.
  return categories.find(c => categoryToSlug(c.category) === target) || null;
}

function researchReaderHash(req) {
  return crypto.createHash('sha256').update(req.sessionID).digest('hex');
}

function researchFeedback(req, res, {
  status = 200, error = null, available = false, story = { slug: req.params.slug },
} = {}) {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Research-Feedback', 'true');
  const pageData = {
    story,
    requested: !error && !available,
    available,
    error,
    requestToken: req.session.researchRequestToken || '',
  };
  if (!error) {
    return res.renderFragmentOrRedirect('partials/research-request', pageData,
      `/story/${encodeURIComponent(story.slug)}#${available ? 'dig-deeper' : 'research-interest'}`);
  }
  return res.renderPage('partials/research-request', pageData, {
    status,
    pageTitle: 'Research request — TSquirrel',
    noIndex: true,
  });
}

const researchRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: req => `research-request:${req.ip}`,
  handler: (req, res, retryAfter) => researchFeedback(req, res, {
    status: 429,
    error: `Too many research requests. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
  }),
});

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

const LEGACY_STOP = new Set([
  'the','and','for','with','from','that','this','into','over','under','about','after','before','using','amid','says','said','will','would','could','should'
]);

function legacySeedQuery(article) {
  const text = `${article?.title || ''} ${article?.description || ''}`.toLowerCase();
  const tokens = text
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !LEGACY_STOP.has(t));
  return [...new Set(tokens)].slice(0, 3).join(' ');
}

function legacyCategoryHint(article) {
  const text = `${article?.title || ''} ${article?.description || ''}`.toLowerCase();
  const hints = [
    ['AI', [' ai ', 'openai', 'anthropic', 'llm', 'chatgpt', 'machine learning']],
    ['Sports', ['football', 'soccer', 'fifa', 'nba', 'nfl', 'champions league', 'chelsea', 'barcelona']],
    ['Entertainment', ['music', 'album', 'celebrity', 'dj', 'movie', 'film', 'actor']],
    ['Politics', ['president', 'election', 'parliament', 'government']],
    ['Business', ['market', 'earnings', 'stock', 'ipo', 'acquisition']],
    ['Technology', ['software', 'apple', 'microsoft', 'google', 'cyber', 'chip']],
  ];
  for (const [category, words] of hints) {
    if (words.some((w) => text.includes(w))) return category;
  }
  return null;
}

function mergeStories(target, incoming, max = 3) {
  const seen = new Set(target.map((s) => s.id));
  for (const story of incoming || []) {
    if (!story || seen.has(story.id)) continue;
    target.push(story);
    seen.add(story.id);
    if (target.length >= max) break;
  }
  return target;
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
  const categoryPaths = Array.from(INDEXABLE_CATEGORIES)
    .map((category) => `/category/${categoryToSlug(category)}`);
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
    ...categoryPaths.map(path => ({
      loc: `${baseUrl}${path}`,
      lastmod: null,
      changefreq: 'daily',
      priority: '0.7',
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
  const dao = new NewsDAO(pool);
  const slug = req.params.slug;

  const { rows } = await pool.query(
    'SELECT * FROM legacy_articles WHERE slug = $1',
    [slug]
  );

  if (!rows[0]) return res.redirect(301, '/archive'); // legacy-like slug but missing entry

  const article = rows[0];
  const relatedStories = [];
  const seed = legacySeedQuery(article);
  if (seed) {
    const byQuery = await dao.getTopStories({ limit: 3, q: seed });
    mergeStories(relatedStories, byQuery, 3);
  }
  if (relatedStories.length < 3) {
    const hintedCategory = legacyCategoryHint(article);
    if (hintedCategory) {
      const byCategory = await dao.getTopStories({ limit: 3, category: hintedCategory });
      mergeStories(relatedStories, byCategory, 3);
    }
  }
  if (relatedStories.length < 3) {
    const latest = await dao.getTopStories({ limit: 3 });
    mergeStories(relatedStories, latest, 3);
  }

  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.render('layout-main', {
    template: 'legacy-article-page',
    pageTitle: `${article.title} — TSquirrel`,
    pageDescription: article.description,
    pageUrl: 'https://tsquirrel.com/archive',
    noIndex: true,
    pageData: { article, relatedStories },
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

  const rawCategory = req.query.category || null;
  const category = rawCategory === 'blowing_up' ? 'hot' : rawCategory;
  const tag = req.query.tag || null;
  const q = String(req.query.q || '').trim() || null;
  const brief = ['1', 'true', 'yes', 'on'].includes(String(req.query.brief || '').toLowerCase());
  const [stories, categories] = await Promise.all([
    dao.getTopStories({ limit: 30, category, tag, q, brief }),
    dao.getCategories(),
  ]);

  const isFilteredFeed = Boolean(category || tag || q || brief);
  const featured = (!isFilteredFeed && stories.length) ? stories[0] : null;
  const heroImageUrl = featured?.image_url
    ? String(featured.image_url).replace(/^http:\/\//i, 'https://')
    : null;

  res.render('layout-main', {
    template: 'index-page',
    pageTitle: "What's Trending — TSquirrel",
    pageDescription: 'AI-curated news digest. Top stories across sources, summarized.',
    pageUrl: 'https://tsquirrel.com',
    heroImageUrl,
    noIndex: isFilteredFeed,
    noFollow: false,
    pageData: { stories, categories, activeCategory: category, activeTag: tag, activeQuery: q, activeBrief: brief },
  });
});

// ── Category landing pages (indexable for selected categories) ──────────
router.get('/category/:slug', async (req, res) => {
  const pool = req.app.get('pool');
  const dao = new NewsDAO(pool);
  const categories = await dao.getCategories();
  const match = findCategoryBySlug(categories, req.params.slug);

  if (!match) {
    return res.status(404).render('layout-main', {
      template: 'errors/404',
      pageTitle: 'Category Not Found — TSquirrel',
      pageDescription: 'This category does not exist.',
      noIndex: true,
      pageData: {},
    });
  }

  const category = match.category;
  const stories = await dao.getTopStories({ limit: 30, category });
  const indexable = INDEXABLE_CATEGORIES.has(category);
  const categorySlug = categoryToSlug(category);

  res.render('layout-main', {
    template: 'index-page',
    pageTitle: `${category} News — TSquirrel`,
    pageDescription: `Latest ${category} stories curated by TSquirrel.`,
    pageUrl: `https://tsquirrel.com/category/${categorySlug}`,
    noIndex: !indexable,
    noFollow: false,
    pageData: {
      stories,
      categories,
      activeCategory: category,
      activeCategoryPath: `/category/${categorySlug}`,
      activeTag: null,
      activeQuery: null,
      activeBrief: false,
    },
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
router.post('/story/:slug/research-request', (req, res, next) => {
  const submitted = req.body.request_token;
  const expected = req.session.researchRequestToken;
  if (typeof submitted !== 'string' || !/^[a-f0-9]{64}$/.test(submitted) ||
      !expected || !crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(expected))) {
    return researchFeedback(req, res, {
      status: 403, error: 'Your request could not be verified. Reload the story and try again.',
    });
  }
  next();
}, researchRequestLimiter, async (req, res) => {
  try {
    const dao = new NewsDAO(req.app.get('pool'));
    const result = await dao.requestStoryResearch(req.params.slug, researchReaderHash(req));
    return researchFeedback(req, res, result);
  } catch (error) {
    if (error.status !== 404) console.error('Research request failed:', error);
    return researchFeedback(req, res, {
      status: error.status === 404 ? 404 : 500,
      error: error.status === 404 ? error.message : 'We could not save your request. Please try again later.',
    });
  }
});

router.get('/story/:slug', async (req, res, next) => {
  try {
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

    const [articles, related, brief] = await Promise.all([
      dao.getStoryArticles(story.id),
      dao.getRelatedStories(story.id, { category: story.category, tags: story.tags || [] }),
      dao.getStoryBrief(story.id, { publishedOnly: true }),
    ]);
    let researchRequest = null;
    if (!brief) {
      req.session.researchRequestToken ||= crypto.randomBytes(32).toString('hex');
      researchRequest = {
        story,
        requested: await dao.hasResearchRequest(story.id, researchReaderHash(req)),
        requestToken: req.session.researchRequestToken,
        available: false,
        error: null,
      };
    }
    res.set('Cache-Control', 'private, no-store');
    res.render('layout-main', {
      template: 'story-page',
      pageTitle: `${story.title} | TSquirrel`,
      pageDescription: story.summary || story.title,
      pageUrl: `https://tsquirrel.com/story/${story.slug}`,
      pageData: { story, articles, related, brief, researchRequest },
    });
  } catch (error) { next(error); }
});

// ── HTMX infinite scroll API ───────────────────────────────────────────
router.get('/api/stories', async (req, res) => {
  const pool = req.app.get('pool');
  const dao = new NewsDAO(pool);
  const offset = parseInt(req.query.offset, 10) || 0;
  const rawCategory = req.query.category || null;
  const category = rawCategory === 'blowing_up' ? 'hot' : rawCategory;
  const tag = req.query.tag || null;
  const q = String(req.query.q || '').trim() || null;

  const pageSize = 10;
  const brief = ['1', 'true', 'yes', 'on'].includes(String(req.query.brief || '').toLowerCase());
  const rows = await dao.getTopStories({ limit: pageSize + 1, offset, category, tag, q, brief });
  const hasMore = rows.length > pageSize;
  const stories = hasMore ? rows.slice(0, pageSize) : rows;
  const nextOffset = offset + stories.length;

  res.render('partials/story-cards-with-more', {
    stories,
    hasMore,
    nextOffset,
    activeCategory: category,
    activeTag: tag,
    activeQuery: q,
    activeBrief: brief,
  });
});

module.exports = router;
