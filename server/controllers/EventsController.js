const Event = require('../models/Event');
const { getPhotoUrls, uploadFilesToS3, uploadQRCodeToS3 } = require('../services/s3Service');
const QRCode = require('qrcode');

class EventsController {
  constructor(eventsDAO) {
    this.eventsDAO = eventsDAO;
  }

  async getAllEvents(req, res, next, templatePath = 'events-page') {
    try {
      const userId = req.session.user.id;
      
      // Use single method with different filters
      const [upcomingEvents, pastEvents, eventCounts] = await Promise.all([
        this.eventsDAO.getEvents({ userId, timeFilter: 'upcoming', includePhotos: true }),
        this.eventsDAO.getEvents({ userId, timeFilter: 'past', includePhotos: true }),
        this.eventsDAO.getEventCounts(userId)
      ]);
      
      const events = [...upcomingEvents, ...pastEvents];
      
      res.respondWithTemplateOrJson({
        events,
        upcomingEvents,
        pastEvents,
        eventCounts,
        pageAssets: {
          css: ['events.css'],
          js: ['events.js']
        }
      }, templatePath);
    } catch (error) {
      next(error);
    }
  }

  async addEvent(req, res, next) {
    try {
      const userId = req.session.user.id;
      const { title, description, date, location, category, capacity, tags } = req.body;
      
      // Validation - only title and date are required
      if (!title?.trim()) {
        res.setHeader('HX-Retarget', '#addEventForm');
        res.setHeader('HX-Reswap', 'innerHTML');
        return res.status(400).respondWithTemplateOrJson({
           error: 'Event title is required',
           formData: {title, description, date, location, category, capacity, tags}
          }, 
          'events/event-form-add'
        );
      }
      
      if (!date) {
        res.setHeader('HX-Retarget', '#addEventForm');
        res.setHeader('HX-Reswap', 'innerHTML');
        return res.status(400).respondWithTemplateOrJson({
            error: 'Event date is required',
            formData: {title, description, date, location, category, capacity, tags}
          }, 
          'events/event-form-add'
        );
      }
      
      let eventData = new Event({ title, description, date, location, category, capacity, tags, userId });
      const newEvent = await this.eventsDAO.addEvent(userId, eventData);
      //console.log('New event created:', newEvent);

      // After creating the event, return the updated events list
      const [upcomingEvents, pastEvents, eventCounts] = await Promise.all([
        this.eventsDAO.getEvents({ userId, timeFilter: 'upcoming', includePhotos: true }),
        this.eventsDAO.getEvents({ userId, timeFilter: 'past', includePhotos: true }),
        this.eventsDAO.getEventCounts(userId)
      ]);
      
      const events = [...upcomingEvents, ...pastEvents];
      
      res.status(201).respondWithTemplateOrJson({
          events,
          upcomingEvents,
          pastEvents,
          eventCounts
        }, 
        'events/events-list'
      );
    } catch (error) {
      // Log the actual error for debugging
      console.error('Event creation error:', error);
      
      // In development, show the actual error
      const errorMessage = process.env.NODE_ENV === 'development' 
        ? `Failed to create event: ${error.message}` 
        : 'Failed to create event. Please try again.';
      
      res.setHeader('HX-Retarget', '#addEventForm');
      res.setHeader('HX-Reswap', 'innerHTML');
      
      return res.status(500).respondWithTemplateOrJson({
        error: errorMessage,
        formData: req.body // Preserve form data
      }, 'events/event-form-add');
    }
  }

  async updateEvent(req, res, next) {
    try {
      const userId = req.session.user.id;
      const eventId = req.params.id;

      // First, verify the event exists and belongs to the user
      const existingEvent = await this.eventsDAO.getEvent(eventId, false); // false = byId
      
      if (!existingEvent || existingEvent.user_id !== userId) {
        return res.status(404).respondWithTemplateOrJson(
          { error: 'Event not found' }, 
          'errors/general-error'
        );
      }

      // Don't include userId in eventData since we don't update the user_id field
      const eventData = { ...req.body };
      
      // Handle empty capacity field - convert empty string to null for integer fields
      if (eventData.capacity === '') {
        eventData.capacity = null;
      } else if (eventData.capacity && typeof eventData.capacity === 'string') {
        // Convert string to integer if it's a valid number
        const parsedCapacity = parseInt(eventData.capacity, 10);
        eventData.capacity = isNaN(parsedCapacity) ? null : parsedCapacity;
      }
      
      // Single DAO call that updates and returns event with photo
      const eventWithPhoto = await this.eventsDAO.updateEventWithPhoto(eventId, eventData);
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
      
      // Get photos for cover selection using UUID (same as gallery)
      const photos = await this.eventsDAO.getPhotos(event.uuid, true); // true = byUuid
      
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
      const searchTerm = req.query.q || '';
      const userId = req.session.user.id;
      
      // Simple parallel queries for categorized results
      const [upcomingEvents, pastEvents] = await Promise.all([
        this.eventsDAO.getEvents({ 
          userId, 
          searchTerm, 
          timeFilter: 'upcoming', 
          includePhotos: true,
          orderBy: 'date',
          orderDir: 'ASC'
        }),
        this.eventsDAO.getEvents({ 
          userId, 
          searchTerm, 
          timeFilter: 'past', 
          includePhotos: true,
          orderBy: 'date',
          orderDir: 'DESC'
        })
      ]);

      const eventCounts = {
        total: upcomingEvents.length + pastEvents.length,
        upcoming: upcomingEvents.length,
        past: pastEvents.length
      };
      
      res.respondWithTemplateOrJson({
        events: [...upcomingEvents, ...pastEvents],
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
      const currentUserId = req.session?.user?.id; // Get current user ID if logged in

      const event = await this.eventsDAO.getEvent(eventUuid, true); // true = byUuid
      
      if (!event) {
        return res.status(404).respondWithTemplateOrJson({ error: 'Event not found' }, 'errors/general-error');
      }

      // Generate QR code if it doesn't exist
      if (!event.qr_code_url) {
        try {
          const galleryUrl = `${req.protocol}://${req.get('host')}/events/${eventUuid}/gallery`;
          
          // Generate QR code as PNG buffer
          const qrCodeBuffer = await QRCode.toBuffer(galleryUrl, {
            width: 400,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            },
            type: 'png'
          });
          
          // Upload QR code to S3 and get URL
          const qrCodeUrl = await uploadQRCodeToS3(eventUuid, qrCodeBuffer);
          
          // Store the S3 URL in the database
          await this.eventsDAO.updateEventQRCode(eventUuid, qrCodeUrl);
          event.qr_code_url = qrCodeUrl;
        } catch (qrError) {
          console.error('QR code generation error:', qrError);
          // Continue without QR code if generation fails
        }
      }
      
      const photos = await this.eventsDAO.getPhotos(eventUuid, true); // true = byUuid
      
      // Check if current user is the event owner
      const isOwner = currentUserId && currentUserId === event.user_id;
      
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
        isOwner, // Pass owner status to template
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
      
      if (!photoMetadata || !Array.isArray(photoMetadata) || photoMetadata.length === 0) {
        return res.status(400).json({ error: 'No photo metadata found' });
      }

      // Upload all files to S3 first
      await uploadFilesToS3(photoMetadata);

      const uploadedPhotos = [];

      // Process each uploaded photo
      for (const photo of photoMetadata) {
        // Use dimensions that were extracted during processing
        const parsedWidth = photo.width || 400;
        const parsedHeight = photo.height || 300;

        console.log(`Processing photo ${photo.originalName}: ${parsedWidth}x${parsedHeight}`);

        // Save photo metadata to database with dimensions - UUID-based approach
        const photoData = {
          event_uuid: eventUuid,
          photo_id: photo.photoId,
          original_name: photo.originalName,
          s3_key: photo.s3Key,
          width: parsedWidth,
          height: parsedHeight,
          uploaded_at: new Date()
        };

        await this.eventsDAO.addPhoto(photoData);

        // Get all photo URLs including the immediately available uploaded version
        const photoUrls = getPhotoUrls(eventUuid, photo.photoId, photo.extension, photo.s3Key);

        // For HTMX requests, return the photo template to be inserted into the gallery
        const photoForTemplate = {
          photo_id: photo.photoId,
          original_name: photo.originalName,
          thumb_url: photoUrls.thumb,       // 200px - Fast gallery loading
          photo_url: photoUrls.display,     // 800px - Lightbox preview  
          original_url: photoUrls.original, // Full res - Lightbox zoom/download
          width: photoData.width,
          height: photoData.height
        };

        uploadedPhotos.push(photoForTemplate);
      }

      console.log(`Successfully processed ${uploadedPhotos.length} photos`);

      // For multiple uploads, return all photos as HTML to be inserted
      res.status(201).respondWithTemplateOrJson({
        photos: uploadedPhotos
      }, 'events/photo-items-multiple');
    } catch (error) {
      console.error('Photo upload error:', error);
      res.status(500).json({ error: 'Failed to upload photo(s)' });
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

  async setCoverPhoto(req, res, next) {
    try {
      const { uuid: eventUuid, photoId } = req.params;
      const userId = req.session.user.id;
      
      // Get the event to verify ownership
      const event = await this.eventsDAO.getEvent(eventUuid, true);
      
      if (!event || event.user_id !== userId) {
        return res.status(403).json({ error: 'Only the event owner can set cover photos' });
      }
      
      // Get the photo details to get the display URL
      const photos = await this.eventsDAO.getPhotos(eventUuid, true);
      const targetPhoto = photos.find(p => p.photo_id === photoId);
      
      if (!targetPhoto) {
        return res.status(404).json({ error: 'Photo not found' });
      }
      
      // Generate the display URL for the photo
      const extension = targetPhoto.s3_key ? targetPhoto.s3_key.substring(targetPhoto.s3_key.lastIndexOf('.')) : '.jpg';
      const photoUrls = getPhotoUrls(eventUuid, photoId, extension);
      
      // Update the event's cover photo
      await this.eventsDAO.updateEvent(event.id, { 
        event_picture: photoUrls.display 
      });
      
      res.status(200).json({ 
        success: true, 
        message: 'Cover photo updated successfully',
        coverPhotoUrl: photoUrls.display
      });
    } catch (error) {
      console.error('Set cover photo error:', error);
      res.status(500).json({ error: 'Failed to set cover photo' });
    }
  }
}

module.exports = EventsController;