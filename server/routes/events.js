const express = require('express');
const router = express.Router();

const authMiddleware = require('./../middleware/authMiddleware'); // Import the auth middleware
const EventsDAO = require('./../dao/EventsDAO');
const EventsController = require('../controllers/EventsController');

// Should be logged in to access the events
router.use(authMiddleware);

// Middleware enriching the request with an event controller
router.use((req, res, next) => {
  // Get the pool from the app
  const pool = req.app.get('pool');
  const eventDAO = new EventsDAO(pool);
  req.eventsController = new EventsController(eventDAO);
  next();
});

router.get('/', (req, res, next) => req.eventsController.getAllEvents(req, res, next));
router.post('/', (req, res, next) => req.eventsController.addEvent(req, res, next));
router.put('/:id', (req, res, next) => req.eventsController.updateEvent(req, res, next));
router.delete('/:id', (req, res, next) => req.eventsController.deleteEvent(req, res, next));

module.exports = router;