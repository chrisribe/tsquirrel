const Event = require('../models/Event');

class EventsController {
  constructor(eventsDAO) {
    this.eventsDAO = eventsDAO;
  }

  async getAllEvents(req, res, next, templatePath = 'events-page') {
    try {
      const userId = req.session.user.id; // Assuming req.user contains the logged-in user's info
      const events = await this.eventsDAO.getEventsByUserId(userId);
      res.respondWithTemplateOrJson({events}, templatePath);
    } catch (error) {
      next(error);
    }
  }

  async addEvent(req, res, next, templatePath = 'events/events-list') {
    try {
      const userId = req.session.user.id;
    
      // Extract only the fields you expect/need
      const { 
        title, description, date, location, 
        category, capacity, status, organizer 
      } = req.body;
      
      // Validate required fields
      if (!title || !date) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Create Event with validated data
      const eventData = new Event({ 
        title, description, date, location, 
        category, capacity, status, organizer,
        userId 
      });

      
      const newEvent = await this.eventsDAO.addEvent(userId, eventData);
      const events = await this.eventsDAO.getEventsByUserId(userId);
      res.status(201).respondWithTemplateOrJson({events}, templatePath);
    } catch (error) {
      next(error);
    }
  }

  async updateEvent(req, res, next) {
    try {
      const eventId = req.params.id;
      const userId = req.user.id;
      const eventData = { ...req.body, userId };
      const updatedEvent = await this.eventsDAO.updateEvent(eventId, eventData);
      res.json(updatedEvent);
    } catch (error) {
      next(error);
    }
  }

  async deleteEvent(req, res, next) {
    try {
      const eventId = req.params.id;
      const userId = req.user.id;
      await this.eventsDAO.deleteEvent(eventId, userId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }

// In controllers/EventsController.js
async searchEvents(req, res, next, templatePath = 'events/events-list') {
  try {
    const searchTerm = req.query.searchTerm || '';
    const events = await this.eventsDAO.searchEvents(searchTerm);

    console.log('Search term:', searchTerm);
    console.log('Events found:', events.length, 'events');
    
    res.respondWithTemplateOrJson({ events }, templatePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
    next(err);
  }
}
}

module.exports = EventsController;