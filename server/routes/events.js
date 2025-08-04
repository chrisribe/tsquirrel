const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const EventsDAO = require('../dao/EventsDAO');
const EventsController = require('../controllers/EventsController');
const { extractDimensions } = require('../middleware/fileUploadMiddleware');


// Middleware enriching the request with an event controller
router.use((req, res, next) => {
  // Get the pool from the app
  const pool = req.app.get('pool');
  const eventsDAO = new EventsDAO(pool);
  req.eventsController = new EventsController(eventsDAO);
  next();
});

// Public routes
router.get('/:uuid/gallery', (req, res, next) => req.eventsController.getEventGalleryByUuid(req, res, next));

// Photo upload routes (public - no authentication required)
// Note: extractDimensions middleware processes files and adds photoMetadata to req before controller
router.post('/:uuid/photos', extractDimensions, (req, res, next) => {
  // extractDimensions middleware has processed the file(s) and added:
  // - req.photoMetadata: Array of { photoId, originalName, s3Key, extension, width, height, buffer }
  req.eventsController.uploadPhotos(req, res, next);
});

// Should be logged in to access the events
router.use(authMiddleware);

router.get('/', (req, res, next) => req.eventsController.getAllEvents(req, res, next));
router.post('/', (req, res, next) => req.eventsController.addEvent(req, res, next));
router.get('/:id/edit', (req, res, next) => req.eventsController.getEventForEdit(req, res, next));
router.put('/:id', (req, res, next) => req.eventsController.updateEvent(req, res, next));
router.delete('/:id', (req, res, next) => req.eventsController.deleteEvent(req, res, next));

// In routes/events.js
router.get('/search', (req, res, next) => {
  req.eventsController.searchEvents(req, res, next, 'events/events-list');
});

// Photo management routes (authenticated - only event owners)
router.delete('/:uuid/photos/:photoId', (req, res, next) => req.eventsController.deletePhoto(req, res, next));

// Cover photo setting requires authentication (only event owner can set cover)
router.patch('/:uuid/photos/:photoId/cover', (req, res, next) => req.eventsController.setCoverPhoto(req, res, next));


module.exports = router;