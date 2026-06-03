const express = require('express');
const router = express.Router();
const GalleryDAO = require('../dao/GalleryDAO');
const UserDAO = require('../dao/UserDAO');
const GalleryController = require('../controllers/GalleryController');
const { extractDimensions } = require('../middleware/fileUploadMiddleware');
const requireAuth = require('../middleware/authMiddleware');

// Initialize controller (pool injected via app.set)
let controller;

router.use((req, res, next) => {
  if (!controller) {
    const pool = req.app.get('pool');
    controller = new GalleryController(new GalleryDAO(pool), new UserDAO(pool));
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

// Update gallery title (owner only)
router.patch('/:uuid/title', requireAuth, (req, res, next) => 
  controller.updateGalleryTitle(req, res, next)
);

// ============================================
// PUBLIC ROUTES (view & upload)
// ============================================

// View gallery (public!)
router.get('/:uuid', (req, res, next) => 
  controller.viewGallery(req, res, next)
);

// Check which hashes already exist (for pre-upload duplicate detection)
router.post('/:uuid/check-hashes', express.json(), (req, res, next) => 
  controller.checkHashes(req, res, next)
);

// Upload photos (public!)
router.post('/:uuid/photos', extractDimensions, (req, res, next) => 
  controller.uploadPhotos(req, res, next)
);

// Delete photo (owner OR uploader - auth checked in controller)
router.delete('/:uuid/photos/:photoId', (req, res, next) => 
  controller.deletePhoto(req, res, next)
);

// Download photo with proper Content-Disposition header
router.get('/download/:photoId', (req, res, next) => 
  controller.downloadPhoto(req, res, next)
);

// Download all photos as ZIP
router.get('/:uuid/download-all', (req, res, next) => 
  controller.downloadAllPhotos(req, res, next)
);

// HEAD request to check download access (for pre-flight check)
router.head('/:uuid/download-all', (req, res, next) => 
  controller.downloadAllPhotos(req, res, next)
);

module.exports = router;
