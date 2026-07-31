'use strict';

const express = require('express');
const router = express.Router();
const apiTokenAuth = require('../middleware/apiTokenAuthMiddleware');
const apiStoryController = require('../controllers/ApiStoryController');

router.use(apiTokenAuth);

router.get('/me', async (req, res) => {
  res.json({
    ok: true,
    token: req.apiToken,
  });
});

router.get('/stories', apiStoryController.list);
router.post('/stories', apiStoryController.create);
router.get('/stories/:id', apiStoryController.get);
router.patch('/stories/:id', apiStoryController.patch);
router.post('/stories/:id/sources', apiStoryController.addSource);
router.delete('/stories/:id/sources/:articleId', apiStoryController.removeSource);

// ── Suggested sources (Radar-proposed follow-ups awaiting review) ──────────
router.get('/stories/:id/suggestions', apiStoryController.listSuggestions);
router.post('/stories/:id/suggestions/:articleId/accept', apiStoryController.acceptSuggestion);
router.post('/stories/:id/suggestions/:articleId/reject', apiStoryController.rejectSuggestion);

router.post('/stories/:id/feature', apiStoryController.feature);
router.post('/stories/:id/publish', apiStoryController.publish);
router.post('/stories/:id/unpublish', apiStoryController.unpublish);

module.exports = router;

