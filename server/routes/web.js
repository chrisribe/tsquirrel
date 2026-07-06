'use strict';

const express = require('express');
const router = express.Router();
const NewsDAO = require('../dao/NewsDAO');

// GET / — homepage trending feed
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

// GET /story/:slug — story detail
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

// GET /api/stories — JSON API for HTMX infinite scroll
router.get('/api/stories', async (req, res) => {
  const pool = req.app.get('pool');
  const dao = new NewsDAO(pool);
  const offset = parseInt(req.query.offset) || 0;
  const category = req.query.category || null;
  const stories = await dao.getTopStories({ limit: 10, offset, category });
  // Return rendered partial via HTMX
  res.render('partials/story-cards', { pageData: { stories } });
});

module.exports = router;
