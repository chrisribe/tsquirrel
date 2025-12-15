const express = require('express');
const router = express.Router();
const GalleryDAO = require('../dao/GalleryDAO');
const GalleryController = require('../controllers/GalleryController');
const { extractDimensions } = require('../middleware/fileUploadMiddleware');
const requireAuth = require('../middleware/authMiddleware');

// Initialize controller (pool injected via app.set)
let controller;

router.use((req, res, next) => {
  if (!controller) {
    const pool = req.app.get('pool');
    controller = new GalleryController(new GalleryDAO(pool));
  }
  next();
});

// ============================================
// AUTHENTICATED ROUTES (manage galleries)
// ============================================

// List user's galleries
router.get('/', requireAuth, (req, res, next) => 
  controller.listGalleries(req, res, next)
);

// Create new gallery
router.post('/', requireAuth, (req, res, next) => 
  controller.createGallery(req, res, next)
);

// Delete gallery
router.delete('/:id', requireAuth, (req, res, next) => 
  controller.deleteGallery(req, res, next)
);

// ============================================
// PUBLIC ROUTES (view & upload)
// ============================================

// View gallery (public!)
router.get('/:uuid', (req, res, next) => 
  controller.viewGallery(req, res, next)
);

// Upload photos (public!)
router.post('/:uuid/photos', extractDimensions, (req, res, next) => 
  controller.uploadPhotos(req, res, next)
);

// Delete photo (owner only, auth checked in controller)
router.delete('/:uuid/photos/:photoId', requireAuth, (req, res, next) => 
  controller.deletePhoto(req, res, next)
);

module.exports = router;
