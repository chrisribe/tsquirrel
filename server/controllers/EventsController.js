class EventsController {
  constructor(eventDAO) {
    this.eventDAO = eventDAO;
  }

  async getAllEvents(req, res, next) {
    try {
      const userId = req.session.user.id; // Assuming req.user contains the logged-in user's info
      const events = await this.eventDAO.getEventsByUserId(userId);
      res.respondWithTemplateOrJson({events}, 'events-page');
    } catch (error) {
      next(error);
    }
  }

  async addEvent(req, res, next) {
    try {
      const userId = req.user.id;
      const eventData = { ...req.body, userId };
      const newEvent = await this.eventDAO.createEvent(eventData);
      res.status(201).json(newEvent);
    } catch (error) {
      next(error);
    }
  }

  async updateEvent(req, res, next) {
    try {
      const eventId = req.params.id;
      const userId = req.user.id;
      const eventData = { ...req.body, userId };
      const updatedEvent = await this.eventDAO.updateEvent(eventId, eventData);
      res.json(updatedEvent);
    } catch (error) {
      next(error);
    }
  }

  async deleteEvent(req, res, next) {
    try {
      const eventId = req.params.id;
      const userId = req.user.id;
      await this.eventDAO.deleteEvent(eventId, userId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }
}

module.exports = EventsController;