const Event = require('../models/Event');
const { getPhotoUrls } = require('../services/s3Service');

class EventsController {
  constructor(eventsDAO) {
    this.eventsDAO = eventsDAO;
  }

  async getAllEvents(req, res, next, templatePath = 'events-page') {
    try {
      const userId = req.session.user.id; // Assuming req.user contains the logged-in user's info
      
      // Get events categorized by status with first photos
      const upcomingEvents = await this.eventsDAO.getUpcomingEventsWithFirstPhotos(userId);
      const pastEvents = await this.eventsDAO.getPastEventsWithFirstPhotos(userId);
      const eventCounts = await this.eventsDAO.getEventCountsByUserId(userId);
      
      // For backward compatibility, also provide all events
      const events = [...upcomingEvents, ...pastEvents];
      
      res.respondWithTemplateOrJson({
        events,
        upcomingEvents,
        pastEvents,
        eventCounts
      }, templatePath);
    } catch (error) {
      next(error);
    }
  }

  async addEvent(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { title, description, date, location, category, tags } = req.body;
      
      // Validation with specific error messages
      if (!title) {
        res.setHeader('HX-Retarget', '#addEventForm');
        res.setHeader('HX-Reswap', 'innerHTML');
        return res.status(400).respondWithTemplateOrJson({
           error: 'Event title is required',
           formData: {title, description, date, location, category, tags}
          }, 
          'events/event-form-add'
        );
      }
      
      if (!date) {
        return res.status(400).respondWithTemplateOrJson({
            error: 'Event date is required',
            formData: {title, description, date, location, category, tags}
          }, 
          'events/event-form-add'
        );
      }
      
      let eventData = new Event({ title, description, date, location, category, tags, userId });
      const newEvent = await this.eventsDAO.addEvent(userId, eventData);
      //console.log('New event created:', newEvent);

      // Return only the new event with proper eventType
      const eventType = new Date(newEvent.date) > new Date() ? 'upcoming' : 'past';
      res.status(201).respondWithTemplateOrJson({
          event : newEvent,
          eventType : eventType
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
      
      // Return updated event with first photo for HTMX response
      const eventWithPhoto = await this.eventsDAO.getEventWithFirstPhoto(eventId);
      const eventType = new Date(eventWithPhoto.date) > new Date() ? 'upcoming' : 'past';
      
      res.respondWithTemplateOrJson({
        event: eventWithPhoto,
        eventType: eventType
      }, 'events/event-item');
    } catch (error) {
      next(error);
    }
  }

  async getEventForEdit(req, res, next) {
    try {
      const userId = req.session.user.id;
      const eventId = req.params.id;
      
      const event = await this.eventsDAO.getEventWithFirstPhoto(eventId);
      
      if (!event || event.user_id !== userId) {
        return res.status(404).respondWithTemplateOrJson(
          { error: 'Event not found' }, 
          'errors/general-error'
        );
      }
      
      // Get photos for cover selection
      const photos = await this.eventsDAO.getPhotosByEventId(eventId);
      
      res.respondWithTemplateOrJson({
        event,
        photos,
        formData: event
      }, 'events/event-edit-modal');
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
      const userId = req.session.user.id;
      
      if (!searchTerm.trim()) {
        // If no search term, return all events in sectioned format with photos
        const upcomingEvents = await this.eventsDAO.getUpcomingEventsWithFirstPhotos(userId);
        const pastEvents = await this.eventsDAO.getPastEventsWithFirstPhotos(userId);
        const eventCounts = await this.eventsDAO.getEventCountsByUserId(userId);
        const events = [...upcomingEvents, ...pastEvents];
        
        return res.respondWithTemplateOrJson({ 
          events, 
          upcomingEvents, 
          pastEvents, 
          eventCounts 
        }, templatePath);
      }
      
      // Search all events then categorize and add photos
      const allSearchResults = await this.eventsDAO.searchEvents(searchTerm);
      
      // Filter by user and categorize by date
      const userEvents = allSearchResults.filter(event => event.user_id === userId);
      const now = new Date();
      
      // Get first photos for search results
      const eventsWithPhotos = await Promise.all(
        userEvents.map(async (event) => {
          const eventWithPhoto = await this.eventsDAO.getEventWithFirstPhoto(event.id);
          return eventWithPhoto || event;
        })
      );
      
      const upcomingEvents = eventsWithPhotos.filter(event => new Date(event.date) > now)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const pastEvents = eventsWithPhotos.filter(event => new Date(event.date) <= now)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      
      const eventCounts = {
        total: eventsWithPhotos.length,
        upcoming: upcomingEvents.length,
        past: pastEvents.length
      };

      console.log('Search term:', searchTerm);
      console.log('Events found:', eventsWithPhotos.length, 'events');
      
      res.respondWithTemplateOrJson({ 
        events: eventsWithPhotos, 
        upcomingEvents, 
        pastEvents, 
        eventCounts 
      }, templatePath);
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
      
      // Generate S3 URLs for each photo using extension from s3_key
      const photosWithUrls = photos.map(photo => {
        // Extract extension from s3_key (e.g., "uploads/uuid/photo.jpg" -> ".jpg")
        const extension = photo.s3_key ? photo.s3_key.substring(photo.s3_key.lastIndexOf('.')) : '.jpg';
        const photoUrls = getPhotoUrls(eventUuid, photo.photo_id, extension);
        return {
          ...photo,
          thumb_url: photoUrls.thumb,       // 200px - Fast gallery loading
          photo_url: photoUrls.display,     // 800px - Lightbox preview
          original_url: photoUrls.original  // Full res - Lightbox zoom/download
        };
      });
      
      res.respondWithTemplateOrJson({ 
        event, 
        photos: photosWithUrls,
        pageAssets: {
          css: ['gallery.css'],
          js: [
            'jquery-3.3.1.min.js',
            'jquery.flex-images.js',
            'gallery.js'
          ]
        }
      }, 'events/gallery-page');
    } catch (error) {
      next(error);
    }
  }

  async uploadPhotos(req, res, next) {
    try {
      const eventUuid = req.params.uuid;
      const { photoMetadata } = req;
      const { width, height } = req.body; // Get dimensions from form
      
      if (!photoMetadata) {
        return res.status(400).json({ error: 'No photo metadata found' });
      }

      // Parse dimensions with better error handling
      const parsedWidth = width ? parseInt(width, 10) : 400;
      const parsedHeight = height ? parseInt(height, 10) : 300;

      // Save photo metadata to database with dimensions
      const photoData = {
        event_uuid: eventUuid,
        photo_id: photoMetadata.photoId,
        original_name: photoMetadata.originalName,
        s3_key: photoMetadata.s3Key,
        width: parsedWidth,
        height: parsedHeight,
        uploaded_at: new Date()
      };

      await this.eventsDAO.addPhoto(photoData);

      // Get all photo URLs including the immediately available uploaded version
      const photoUrls = getPhotoUrls(eventUuid, photoMetadata.photoId, photoMetadata.extension, photoMetadata.s3Key);

      // For HTMX requests, return the photo template to be inserted into the gallery
      const photoForTemplate = {
        photo_id: photoMetadata.photoId,
        original_name: photoMetadata.originalName,
        thumb_url: photoUrls.thumb,       // 200px - Fast gallery loading
        photo_url: photoUrls.display,     // 800px - Lightbox preview  
        original_url: photoUrls.original, // Full res - Lightbox zoom/download
        width: photoData.width,
        height: photoData.height
      };

      res.status(201).respondWithTemplateOrJson({
        photo: photoForTemplate
      }, 'events/photo-item');
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