const express = require('express');
const router = express.Router();

const authMiddleware = require('./../middleware/authMiddleware'); // Import the auth middleware
const EventsDAO = require('./../dao/EventsDAO');
const EventsController = require('../controllers/EventsController');
const { uploadToS3 } = require('../services/s3Service');


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

// Should be logged in to access the events
router.use(authMiddleware);

router.get('/', (req, res, next) => req.eventsController.getAllEvents(req, res, next));
router.post('/', (req, res, next) => req.eventsController.addEvent(req, res, next));
router.put('/:id', (req, res, next) => req.eventsController.updateEvent(req, res, next));
router.delete('/:id', (req, res, next) => req.eventsController.deleteEvent(req, res, next));

// In routes/events.js
router.get('/search', (req, res, next) => {
  // normalize the search term
  req.query.searchTerm = req.query.q || '';
  req.eventsController.searchEvents(req, res, next, 'events/events-list');
});

// Photo upload routes (authenticated) 
// Note: uploadToS3 middleware adds photoMetadata to req before controller
router.post('/:uuid/photos', uploadToS3.single('photoFile'), (req, res, next) => {
  // uploadToS3 middleware has processed the file and added:
  // - req.photoMetadata: { photoId, originalName, s3Key, extension }
  // - req.body: { width, height } from client-side extraction
  req.eventsController.uploadPhotos(req, res, next);
});
router.delete('/:uuid/photos/:photoId', (req, res, next) => req.eventsController.deletePhoto(req, res, next));


module.exports = router;