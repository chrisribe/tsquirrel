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

  async addEvent(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { title, description, date, location } = req.body;
      
      // Validation with specific error messages
      if (!title) {
        res.setHeader('HX-Retarget', '#addEventForm');
        res.setHeader('HX-Reswap', 'innerHTML');
        return res.status(400).respondWithTemplateOrJson({
           error: 'Event title is required',
           formData: {title, description, date, location}
          }, 
          'events/event-form-add'
        );
      }
      
      if (!date) {
        return res.status(400).respondWithTemplateOrJson({
            error: 'Event date is required',
            formData: {title, description, date, location}
          }, 
          'events/event-form-add'
        );
      }
      
      let eventData = new Event({ title, description, date, location, userId });
      const eventId = await this.eventsDAO.addEvent(userId, eventData);
      eventData.id = eventId; // Set the ID on the eventData object
      //console.log('New event created:', eventData);

      // Return only the new event
      res.status(201).respondWithTemplateOrJson({
          event : eventData
        }, 
        'events/event-item'
      );
    } catch (error) {
      // Database or other errors
      return res.status(500).respondWithTemplateOrJson(
        { error: 'Failed to create event. Please try again.' }, 
        'events/event-form-error'
      );
    }
  }

  async updateEvent(req, res, next) {
    try {
      const userId = req.session.user.id;
      const eventId = req.params.id;

      const eventData = { ...req.body, userId };
      const updatedEvent = await this.eventsDAO.updateEvent(eventId, eventData);
      res.json(updatedEvent);
    } catch (error) {
      next(error);
    }
  }

  async deleteEvent(req, res, next) {
    try {
      const userId = req.session.user.id;
      const eventId = req.params.id;
      await this.eventsDAO.deleteEvent(userId, eventId);
      res.status(200).send('')
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