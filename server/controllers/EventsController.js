const Event = require('../models/Event');
const { getPhotoUrls } = require('../services/s3Service');

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

  async getEventGalleryByUuid(req, res, next) {
    try {
      const eventUuid = req.params.uuid;

      const event = await this.eventsDAO.getEventByUuid(eventUuid); 
      
      if (!event) {
        return res.status(404).respondWithTemplateOrJson({ error: 'Event not found' }, 'errors/general-error');
      }
      
      const photos = await this.eventsDAO.getPhotosByEventUuid(eventUuid); 
      
      res.respondWithTemplateOrJson({ event, photos }, 'events/gallery-page');
    } catch (error) {
      next(error);
    }
  }

  async uploadPhotos(req, res, next) {
    try {
      const eventUuid = req.params.uuid;
      const { photoMetadata } = req;
      
      if (!photoMetadata) {
        return res.status(400).json({ error: 'No photo metadata found' });
      }

      // Save photo metadata to database
      const photoData = {
        event_uuid: eventUuid,
        photo_id: photoMetadata.photoId,
        original_name: photoMetadata.originalName,
        s3_key: photoMetadata.s3Key,
        uploaded_at: new Date()
      };

      await this.eventsDAO.addPhoto(photoData);

      // Generate URLs for immediate response (Lambda will process in background)
      const photoUrls = getPhotoUrls(eventUuid, photoMetadata.photoId, photoMetadata.extension);

      res.status(201).json({
        success: true,
        photo: {
          id: photoMetadata.photoId,
          originalName: photoMetadata.originalName,
          urls: photoUrls
        }
      });
    } catch (error) {
      console.error('Photo upload error:', error);
      res.status(500).json({ error: 'Failed to upload photo' });
    }
  }

  async deletePhoto(req, res, next) {
    try {
      const { uuid: eventUuid, photoId } = req.params;
      
      // Delete from database
      await this.eventsDAO.deletePhoto(eventUuid, photoId);
      
      // TODO: Delete from S3 (all sizes)
      // This would require additional S3 delete operations
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Photo delete error:', error);
      res.status(500).json({ error: 'Failed to delete photo' });
    }
  }
}

module.exports = EventsController;