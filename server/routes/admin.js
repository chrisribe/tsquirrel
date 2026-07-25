'use strict';

const express = require('express');
const router = express.Router();
const NewsDAO = require('../dao/NewsDAO');
const requireAuth = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/adminMiddleware');

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

module.exports = router;
