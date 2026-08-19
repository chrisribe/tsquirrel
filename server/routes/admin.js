'use strict';

const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/adminMiddleware');
const storyAdminController = require('../controllers/StoryAdminController');
const sourceAdminController = require('../controllers/SourceAdminController');
const tokenController = require('../controllers/TokenController');
const signalController = require('../controllers/SignalController');

router.use(requireAuth, requireAdmin);

router.get('/', sourceAdminController.dashboard);

router.get('/tokens', tokenController.list);
router.post('/tokens', tokenController.create);
router.post('/tokens/:id/revoke', tokenController.revoke);

router.get('/sources/:slug', sourceAdminController.sourceArticles);
router.post('/sources/:slug/toggle', sourceAdminController.toggleSource);

// ── Story authoring / moderation ───────────────────────────────────────
router.get('/stories', storyAdminController.list);
router.get('/stories/new', storyAdminController.newForm);
router.post('/stories', storyAdminController.create);
router.post('/stories/bulk', storyAdminController.bulkAction);
router.get('/stories/:id/edit', storyAdminController.edit);
router.get('/stories/:id/attach-picker', storyAdminController.attachPicker);
router.post('/stories/:id', storyAdminController.update);
router.post('/stories/:id/attach', storyAdminController.attach);
router.post('/stories/:id/detach', storyAdminController.detach);
router.post('/stories/:id/suggestions/:articleId/accept', storyAdminController.acceptSuggestion);
router.post('/stories/:id/suggestions/:articleId/reject', storyAdminController.rejectSuggestion);
router.post('/stories/:id/publish', storyAdminController.publish);
router.post('/stories/:id/unpublish', storyAdminController.unpublish);
router.post('/stories/:id/hide', storyAdminController.hide);
router.post('/stories/:id/feature', storyAdminController.feature);
router.post('/stories/:id/delete', storyAdminController.delete);

// ── Radar signals ────────────────────────────────────────────────────────

router.get('/signals', signalController.list);
router.post('/signals/scan', signalController.scan);
router.post('/signals/:id/create-story', signalController.createStory);
router.post('/signals/:id/dismiss', signalController.dismiss);

module.exports = router;

